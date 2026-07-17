import {
  MAX_CLIENT_CLOCK_SKEW_MS,
  MAX_COMMANDS_PER_SECOND,
  friendlyValidationError,
  playerCommandSchema,
  type MatchPhase,
  type PlayerCommand,
} from '@signal-zero/shared';

export interface CommandGuardContext {
  clientId: string;
  serverNow: number;
  matchPhase: MatchPhase;
  playerExists: boolean;
  playerConnected: boolean;
}

export type GuardResult =
  | { accepted: true; command: PlayerCommand }
  | { accepted: false; sequence: number; reason: string };

interface ClientSecurityState {
  lastSequence: number;
  attempts: number[];
}

function payloadSequence(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null || !('sequence' in payload)) return 0;
  const sequence = (payload as { sequence?: unknown }).sequence;
  return Number.isSafeInteger(sequence) && typeof sequence === 'number' && sequence >= 0
    ? sequence
    : 0;
}

/** Stateful protection at the socket boundary. Simulation-specific legality is checked afterwards. */
export class CommandSecurityGuard {
  readonly #clients = new Map<string, ClientSecurityState>();

  validate(payload: unknown, context: CommandGuardContext): GuardResult {
    const security = this.#clients.get(context.clientId) ?? { lastSequence: -1, attempts: [] };
    this.#clients.set(context.clientId, security);

    const windowStart = context.serverNow - 1_000;
    security.attempts = security.attempts.filter((attemptAt) => attemptAt > windowStart);
    if (security.attempts.length >= MAX_COMMANDS_PER_SECOND) {
      return {
        accepted: false,
        sequence: payloadSequence(payload),
        reason: 'Command rate limit exceeded',
      };
    }
    security.attempts.push(context.serverNow);

    const parsed = playerCommandSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        accepted: false,
        sequence: payloadSequence(payload),
        reason: friendlyValidationError(parsed.error),
      };
    }
    const command = parsed.data as PlayerCommand;

    if (command.playerId !== context.clientId) {
      return {
        accepted: false,
        sequence: command.sequence,
        reason: 'Cannot command another player',
      };
    }
    if (!context.playerExists) {
      return { accepted: false, sequence: command.sequence, reason: 'Player is not in this room' };
    }
    if (!context.playerConnected) {
      return { accepted: false, sequence: command.sequence, reason: 'Player is disconnected' };
    }
    if (context.matchPhase !== 'active') {
      return { accepted: false, sequence: command.sequence, reason: 'Match is not active' };
    }
    if (Math.abs(command.clientTimestamp - context.serverNow) > MAX_CLIENT_CLOCK_SKEW_MS) {
      return {
        accepted: false,
        sequence: command.sequence,
        reason: 'Client clock is too far from server time',
      };
    }
    if (command.sequence <= security.lastSequence) {
      return {
        accepted: false,
        sequence: command.sequence,
        reason: 'Repeated or stale command sequence',
      };
    }

    // Consume a structurally safe sequence even if gameplay validation later rejects the command.
    security.lastSequence = command.sequence;
    return { accepted: true, command };
  }

  forgetClient(clientId: string): void {
    this.#clients.delete(clientId);
  }
}
