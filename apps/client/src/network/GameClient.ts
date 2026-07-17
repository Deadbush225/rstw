import { Client, type Room } from '@colyseus/sdk';
import {
  ClientMessage,
  DEFAULT_HERO_ID,
  RECONNECTION_INITIAL_DELAY_MS,
  RECONNECTION_MAX_DELAY_MS,
  RECONNECTION_MAX_RETRIES,
  ROOM_NAME,
  SIMULATION_TICK_RATE,
  SNAPSHOT_RATE,
  ServerMessage,
  commandResultMessageSchema,
  gameEventSchema,
  publicSnapshotSchema,
  welcomeMessageSchema,
  type AbilitySlot,
  type CommandResultMessage,
  type GameEvent,
  type HeroId,
  type MatchMode,
  type PlayerCommand,
  type PlayerId,
  type PublicSnapshot,
  type TeamId,
  type Vector2,
  type WelcomeMessage,
} from '@signal-zero/shared';

import type { CommandGateway } from '../game/CommandGateway';

export type ConnectionState = 'offline' | 'connecting' | 'connected' | 'disconnected';

export interface GameClientHandlers {
  onStatus(state: ConnectionState, detail?: string): void;
  onWelcome(message: WelcomeMessage): void;
  onSnapshot(snapshot: PublicSnapshot): void;
  onEvent(event: GameEvent): void;
  onCommandResult(result: CommandResultMessage): void;
  onNotice(message: string): void;
  onError(message: string): void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'The room could not be reached.';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export class GameClient implements CommandGateway {
  private readonly client: Client;
  private room: Room<unknown> | null = null;
  private sequence = 0;
  private intentionalLeave = false;
  private currentPlayerId: PlayerId | null = null;
  private currentTeam: TeamId | null = null;
  private deliveredWelcome = false;
  private transportConnected = false;
  private clockOffsetMs = 0;
  private hasClockSample = false;

  constructor(
    endpoint: string,
    private readonly handlers: GameClientHandlers,
  ) {
    this.client = new Client(endpoint);
  }

  get playerId(): PlayerId | null {
    return this.currentPlayerId;
  }

  get team(): TeamId | null {
    return this.currentTeam;
  }

  get connected(): boolean {
    return this.room !== null && this.transportConnected;
  }

  async connect(
    name: string,
    mode: MatchMode = 'flood-drill',
    heroId: HeroId = DEFAULT_HERO_ID,
  ): Promise<void> {
    if (this.room) await this.disconnect();
    this.intentionalLeave = false;
    this.handlers.onStatus('connecting', 'Contacting the response room…');

    try {
      const room = await this.client.joinOrCreate(ROOM_NAME, { name, mode, heroId });
      room.reconnection.minUptime = 0;
      room.reconnection.maxRetries = RECONNECTION_MAX_RETRIES;
      room.reconnection.delay = RECONNECTION_INITIAL_DELAY_MS;
      room.reconnection.minDelay = RECONNECTION_INITIAL_DELAY_MS;
      room.reconnection.maxDelay = RECONNECTION_MAX_DELAY_MS;
      this.room = room;
      // Colyseus can deliver onJoin messages before joinOrCreate resolves. The SDK session id
      // is already authoritative, so commands do not depend on catching the first welcome.
      this.currentPlayerId = room.sessionId;
      this.sequence = 0;
      this.hasClockSample = false;
      this.deliveredWelcome = false;
      this.transportConnected = true;
      this.handlers.onStatus('connected', `Room ${room.roomId}`);
      this.bindRoom(room);
    } catch (error) {
      this.room = null;
      this.transportConnected = false;
      this.handlers.onStatus('offline');
      this.handlers.onError(errorMessage(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.intentionalLeave = true;
    const room = this.room;
    this.transportConnected = false;
    if (!room) {
      this.currentPlayerId = null;
      this.currentTeam = null;
      this.deliveredWelcome = false;
      return;
    }
    this.room = null;
    this.currentPlayerId = null;
    this.currentTeam = null;
    this.deliveredWelcome = false;
    await room.leave(true);
    this.handlers.onStatus('offline');
  }

  setReady(ready: boolean): void {
    this.room?.send(ClientMessage.READY, { ready });
  }

  voteRematch(): void {
    this.room?.send(ClientMessage.REMATCH, { vote: true });
  }

  move(destination: Vector2): number | null {
    return this.send({ type: 'MOVE', destination });
  }

  attackTarget(targetId: PlayerId): number | null {
    return this.send({ type: 'ATTACK_TARGET', targetId });
  }

  attackMove(destination: Vector2): number | null {
    return this.send({ type: 'ATTACK_MOVE', destination });
  }

  castAbility(slot: AbilitySlot, targetPoint: Vector2): number | null {
    return this.send({ type: 'CAST_ABILITY', slot, targetPoint });
  }

  interact(targetId?: string): number | null {
    return targetId ? this.send({ type: 'INTERACT', targetId }) : this.send({ type: 'INTERACT' });
  }

  stop(): number | null {
    return this.send({ type: 'STOP' });
  }

  holdPosition(): number | null {
    return this.send({ type: 'HOLD_POSITION' });
  }

  steer(direction: Vector2): number | null {
    return this.send({ type: 'STEER', direction });
  }

  jump(): number | null {
    return this.send({ type: 'JUMP' });
  }

  dive(direction: Vector2): number | null {
    return this.send({ type: 'DIVE', direction });
  }

  grab(targetId?: string): number | null {
    return targetId ? this.send({ type: 'GRAB', targetId }) : this.send({ type: 'GRAB' });
  }

  private send(
    command:
      | { type: 'MOVE'; destination: Vector2 }
      | { type: 'ATTACK_TARGET'; targetId: PlayerId }
      | { type: 'ATTACK_MOVE'; destination: Vector2 }
      | { type: 'CAST_ABILITY'; slot: AbilitySlot; targetPoint: Vector2 }
      | { type: 'INTERACT'; targetId?: string }
      | { type: 'STOP' }
      | { type: 'HOLD_POSITION' }
      | { type: 'STEER'; direction: Vector2 }
      | { type: 'JUMP' }
      | { type: 'DIVE'; direction: Vector2 }
      | { type: 'GRAB'; targetId?: string },
  ): number | null {
    const room = this.room;
    const playerId = this.currentPlayerId;
    if (!room || !playerId) {
      this.handlers.onError('Join a room before issuing responder commands.');
      return null;
    }

    this.sequence += 1;
    const envelope = {
      ...command,
      playerId,
      sequence: this.sequence,
      clientTimestamp: this.estimatedServerTime(),
    } as PlayerCommand;
    room.send(ClientMessage.COMMAND, envelope);
    return this.sequence;
  }

  private bindRoom(room: Room<unknown>): void {
    room.onMessage(ServerMessage.WELCOME, (payload: unknown) => {
      const parsed = welcomeMessageSchema.safeParse(payload);
      if (!parsed.success) {
        this.handlers.onError('The server sent an invalid welcome message.');
        return;
      }
      const welcome = parsed.data as WelcomeMessage;
      this.currentPlayerId = welcome.playerId;
      this.currentTeam = welcome.team;
      if (this.deliveredWelcome) return;
      this.deliveredWelcome = true;
      this.handlers.onWelcome(welcome);
    });

    room.onMessage(ServerMessage.SNAPSHOT, (payload: unknown) => {
      const parsed = publicSnapshotSchema.safeParse(payload);
      if (!parsed.success) {
        this.handlers.onError('The server sent an invalid authoritative snapshot.');
        return;
      }
      const snapshot = parsed.data as PublicSnapshot;
      this.synchronizeClock(snapshot.serverTime);
      if (!this.currentTeam && this.currentPlayerId) {
        const ownPlayer = snapshot.players.find((player) => player.id === this.currentPlayerId);
        if (ownPlayer) {
          this.currentTeam = ownPlayer.team;
          if (!this.deliveredWelcome) {
            this.deliveredWelcome = true;
            this.handlers.onWelcome({
              playerId: this.currentPlayerId,
              team: ownPlayer.team,
              tickRate: SIMULATION_TICK_RATE,
              snapshotRate: SNAPSHOT_RATE,
            });
          }
        }
      }
      this.handlers.onSnapshot(snapshot);
    });
    room.onMessage(ServerMessage.EVENT, (payload: unknown) => {
      const parsed = gameEventSchema.safeParse(payload);
      if (parsed.success) this.handlers.onEvent(parsed.data as GameEvent);
    });
    room.onMessage(ServerMessage.COMMAND_RESULT, (payload: unknown) => {
      const parsed = commandResultMessageSchema.safeParse(payload);
      if (parsed.success) this.handlers.onCommandResult(parsed.data as CommandResultMessage);
    });
    room.onMessage(ServerMessage.NOTICE, (payload: unknown) => {
      if (typeof payload === 'string') this.handlers.onNotice(payload);
      else if (isObject(payload) && typeof payload.message === 'string') {
        this.handlers.onNotice(payload.message);
      }
    });

    room.onError((code, message) => {
      this.handlers.onError(`Room error ${code}: ${message}`);
    });
    room.onDrop(() => {
      if (this.room !== room || this.intentionalLeave) return;
      this.transportConnected = false;
      this.handlers.onStatus('connecting', 'Restoring responder signal…');
    });
    room.onReconnect(() => {
      if (this.room !== room || this.intentionalLeave) return;
      this.transportConnected = true;
      this.handlers.onStatus('connected', 'Responder signal restored');
      this.handlers.onNotice('Connection restored. Authoritative state is synchronized.');
    });
    room.onLeave((code) => {
      if (this.room !== room) return;
      this.room = null;
      this.transportConnected = false;
      if (this.intentionalLeave) return;
      this.currentPlayerId = null;
      this.currentTeam = null;
      this.deliveredWelcome = false;
      this.handlers.onStatus('disconnected', `Connection closed (${code})`);
      this.handlers.onError('Automatic reconnection expired. Rejoin the room to continue.');
    });
  }

  private synchronizeClock(serverTime: number): void {
    const sample = serverTime - Date.now();
    this.clockOffsetMs = this.hasClockSample ? this.clockOffsetMs * 0.9 + sample * 0.1 : sample;
    this.hasClockSample = true;
  }

  private estimatedServerTime(): number {
    return Date.now() + (this.hasClockSample ? this.clockOffsetMs : 0);
  }
}
