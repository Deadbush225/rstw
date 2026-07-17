import {
  ClientMessage,
  MAX_COMMANDS_PER_SECOND,
  RECONNECTION_WINDOW_SECONDS,
  REQUIRED_PLAYERS,
  SIMULATION_STEP_MS,
  SIMULATION_TICK_RATE,
  SNAPSHOT_INTERVAL_TICKS,
  SNAPSHOT_RATE,
  ServerMessage,
  friendlyValidationError,
  joinOptionsSchema,
  readyMessageSchema,
  rematchMessageSchema,
  type CommandResultMessage,
  type GameEvent,
  type JoinOptions,
  type MatchMode,
  type PublicSnapshot,
  type WelcomeMessage,
} from '@signal-zero/shared';
import { Room, type Client } from '@colyseus/core';
import { CommandSecurityGuard } from '../network/commandGuard.js';
import { GameSimulation } from '../simulation/GameSimulation.js';

const MAX_CATCH_UP_STEPS = 5;

interface NoticeMessage {
  level: 'info' | 'error';
  message: string;
}

export class SignalZeroRoom extends Room {
  #simulation!: GameSimulation;
  #commandGuard = new CommandSecurityGuard();
  #accumulatorMs = 0;
  #configuredMode: MatchMode | null = null;

  protected get configuredMode(): MatchMode {
    if (this.#configuredMode === null) throw new Error('Room mode has not been configured');
    return this.#configuredMode;
  }

  override onCreate(options: unknown): void {
    const parsed = joinOptionsSchema.safeParse(options);
    if (!parsed.success) throw new Error(friendlyValidationError(parsed.error));
    this.#configuredMode = parsed.data.mode;

    this.maxClients = parsed.data.mode === 'flood-drill' ? 1 : REQUIRED_PLAYERS;
    this.maxMessagesPerSecond = MAX_COMMANDS_PER_SECOND * 2;
    this.#simulation = new GameSimulation(Date.now(), parsed.data.mode);

    // Colyseus creates a fallback clock interval when patching is disabled before a
    // simulation interval exists. Configure simulation first so only the 20 Hz clock runs.
    this.setSimulationInterval((deltaMs) => {
      this.#advanceFixedSimulation(deltaMs);
    }, SIMULATION_STEP_MS);
    this.patchRate = null;

    this.onMessage(ClientMessage.COMMAND, (client, payload: unknown) => {
      this.#handleCommand(client, payload);
    });
    this.onMessage(ClientMessage.READY, (client, payload: unknown) => {
      const parsed = readyMessageSchema.safeParse(payload);
      if (!parsed.success) {
        this.#sendNotice(client, friendlyValidationError(parsed.error));
        return;
      }
      const result = this.#simulation.setReady(client.sessionId, parsed.data.ready);
      if (!result.accepted) this.#sendNotice(client, result.reason ?? 'Ready change rejected');
      this.#flushEvents();
      this.#broadcastSnapshot();
    });
    this.onMessage(ClientMessage.REMATCH, (client, payload: unknown) => {
      const parsed = rematchMessageSchema.safeParse(payload);
      if (!parsed.success) {
        this.#sendNotice(client, friendlyValidationError(parsed.error));
        return;
      }
      const result = this.#simulation.voteRematch(client.sessionId);
      if (!result.accepted) this.#sendNotice(client, result.reason ?? 'Rematch vote rejected');
      this.#flushEvents();
      this.#broadcastSnapshot();
    });
  }

  override onAuth(_client: Client, options: unknown): JoinOptions {
    const parsed = joinOptionsSchema.safeParse(options);
    if (!parsed.success) throw new Error(friendlyValidationError(parsed.error));
    if (parsed.data.mode !== this.configuredMode) {
      throw new Error(`This room only accepts ${this.configuredMode} matches`);
    }
    return parsed.data;
  }

  override onJoin(client: Client, _options: unknown, auth: unknown): void {
    const parsedAuth = joinOptionsSchema.safeParse(auth);
    if (!parsedAuth.success) throw new Error('Validated player name was not available');
    if (parsedAuth.data.mode !== this.configuredMode) {
      throw new Error(`This room only accepts ${this.configuredMode} matches`);
    }
    const joined = this.#simulation.addPlayer(
      client.sessionId,
      parsedAuth.data.name,
      parsedAuth.data.heroId,
    );
    const team = joined.team;
    if (!joined.accepted || !team) throw new Error(joined.reason ?? 'Unable to join room');

    // joinOrCreate() resolves after onJoin returns; defer custom messages one room tick so the
    // browser has registered its handlers instead of dropping the first welcome/snapshot.
    this.clock.setTimeout(() => {
      if (!this.#simulation.isPlayerConnected(client.sessionId)) return;
      this.#sendWelcome(client, team);
      client.send(ServerMessage.SNAPSHOT, this.#simulation.getSnapshot());
      this.#broadcastSnapshot();
    }, 0);
  }

  override async onDrop(client: Client): Promise<void> {
    this.#simulation.setConnected(client.sessionId, false);
    this.#flushEvents();
    this.#broadcastSnapshot();
    try {
      await this.allowReconnection(client, RECONNECTION_WINDOW_SECONDS);
    } catch {
      // Colyseus calls onLeave after the reconnection window expires.
    }
  }

  override onReconnect(client: Client): void {
    this.#simulation.setConnected(client.sessionId, true);
    const team = this.#simulation.getPlayerTeam(client.sessionId);
    if (team) this.#sendWelcome(client, team);
    client.send(ServerMessage.SNAPSHOT, this.#simulation.getSnapshot());
    this.#flushEvents();
    this.#broadcastSnapshot();
  }

  override onLeave(client: Client): void {
    this.#simulation.setConnected(client.sessionId, false);
    this.#simulation.removePlayer(client.sessionId);
    this.#commandGuard.forgetClient(client.sessionId);
    this.#flushEvents();
    this.#broadcastSnapshot();
  }

  #advanceFixedSimulation(deltaMs: number): void {
    const maximumAccumulation = SIMULATION_STEP_MS * MAX_CATCH_UP_STEPS;
    this.#accumulatorMs += Math.min(Math.max(0, deltaMs), maximumAccumulation);
    let steps = 0;
    while (this.#accumulatorMs >= SIMULATION_STEP_MS && steps < MAX_CATCH_UP_STEPS) {
      this.#simulation.step(SIMULATION_STEP_MS);
      this.#accumulatorMs -= SIMULATION_STEP_MS;
      steps += 1;
      this.#flushEvents();
      const snapshot = this.#simulation.getSnapshot();
      if (snapshot.tick % SNAPSHOT_INTERVAL_TICKS === 0) this.#broadcastSnapshot(snapshot);
    }
    if (steps === MAX_CATCH_UP_STEPS)
      this.#accumulatorMs = Math.min(this.#accumulatorMs, SIMULATION_STEP_MS);
  }

  #handleCommand(client: Client, payload: unknown): void {
    const guarded = this.#commandGuard.validate(payload, {
      clientId: client.sessionId,
      serverNow: Date.now(),
      matchPhase: this.#simulation.phase,
      playerExists: this.#simulation.hasPlayer(client.sessionId),
      playerConnected: this.#simulation.isPlayerConnected(client.sessionId),
    });
    if (!guarded.accepted) {
      this.#sendCommandResult(client, {
        sequence: guarded.sequence,
        accepted: false,
        reason: guarded.reason,
      });
      return;
    }

    const result = this.#simulation.applyCommand(guarded.command);
    const response: CommandResultMessage = result.reason
      ? { sequence: guarded.command.sequence, accepted: result.accepted, reason: result.reason }
      : { sequence: guarded.command.sequence, accepted: result.accepted };
    this.#sendCommandResult(client, response);
    this.#flushEvents();
  }

  #flushEvents(): void {
    for (const event of this.#simulation.drainEvents()) {
      this.broadcast(ServerMessage.EVENT, event satisfies GameEvent);
      if (event.type === 'MATCH_STARTED') void this.lock();
    }
  }

  #broadcastSnapshot(snapshot: PublicSnapshot = this.#simulation.getSnapshot()): void {
    this.broadcast(ServerMessage.SNAPSHOT, snapshot);
  }

  #sendWelcome(client: Client, team: WelcomeMessage['team']): void {
    const welcome: WelcomeMessage = {
      playerId: client.sessionId,
      team,
      tickRate: SIMULATION_TICK_RATE,
      snapshotRate: SNAPSHOT_RATE,
    };
    client.send(ServerMessage.WELCOME, welcome);
  }

  #sendCommandResult(client: Client, result: CommandResultMessage): void {
    client.send(ServerMessage.COMMAND_RESULT, result);
  }

  #sendNotice(client: Client, message: string): void {
    const notice: NoticeMessage = { level: 'error', message };
    client.send(ServerMessage.NOTICE, notice);
  }
}
