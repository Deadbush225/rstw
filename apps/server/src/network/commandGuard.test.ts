import { MAX_COMMANDS_PER_SECOND, type MoveCommand } from '@signal-zero/shared';
import { describe, expect, it } from 'vitest';
import { CommandSecurityGuard, type CommandGuardContext } from './commandGuard.js';

const context = (overrides: Partial<CommandGuardContext> = {}): CommandGuardContext => ({
  clientId: 'player-a',
  serverNow: 10_000,
  matchPhase: 'active',
  playerExists: true,
  playerConnected: true,
  ...overrides,
});

const move = (sequence = 1, overrides: Partial<MoveCommand> = {}): MoveCommand => ({
  type: 'MOVE',
  playerId: 'player-a',
  sequence,
  clientTimestamp: 10_000,
  destination: { x: 100, y: 100 },
  ...overrides,
});

describe('command security guard', () => {
  it('accepts a fresh, owned, structurally valid command', () => {
    const result = new CommandSecurityGuard().validate(move(), context());
    expect(result).toMatchObject({ accepted: true, command: { sequence: 1 } });
  });

  it('rejects player-id spoofing before the simulation sees it', () => {
    const result = new CommandSecurityGuard().validate(
      move(1, { playerId: 'player-b' }),
      context(),
    );
    expect(result).toMatchObject({ accepted: false, reason: 'Cannot command another player' });
  });

  it('rejects replayed and out-of-order sequence numbers', () => {
    const guard = new CommandSecurityGuard();
    expect(guard.validate(move(8), context()).accepted).toBe(true);
    expect(guard.validate(move(8), context())).toMatchObject({
      accepted: false,
      reason: 'Repeated or stale command sequence',
    });
    expect(guard.validate(move(7), context())).toMatchObject({
      accepted: false,
      reason: 'Repeated or stale command sequence',
    });
  });

  it('rejects malformed payloads, inactive players, and unreasonable clock skew', () => {
    const malformed = new CommandSecurityGuard().validate(
      { ...move(), destination: { x: Number.NaN, y: 0 } },
      context(),
    );
    expect(malformed.accepted).toBe(false);

    const inactive = new CommandSecurityGuard().validate(
      move(),
      context({ matchPhase: 'countdown' }),
    );
    expect(inactive).toMatchObject({ accepted: false, reason: 'Match is not active' });

    const skewed = new CommandSecurityGuard().validate(
      move(1, { clientTimestamp: 80_001 }),
      context(),
    );
    expect(skewed).toMatchObject({
      accepted: false,
      reason: 'Client clock is too far from server time',
    });
  });

  it('rate-limits bursts per authenticated client, including invalid attempts', () => {
    const guard = new CommandSecurityGuard();
    for (let sequence = 1; sequence <= MAX_COMMANDS_PER_SECOND; sequence += 1) {
      expect(guard.validate(move(sequence), context()).accepted).toBe(true);
    }
    expect(guard.validate(move(MAX_COMMANDS_PER_SECOND + 1), context())).toMatchObject({
      accepted: false,
      reason: 'Command rate limit exceeded',
    });

    expect(
      guard.validate(
        move(MAX_COMMANDS_PER_SECOND + 1, { clientTimestamp: 11_001 }),
        context({ serverNow: 11_001 }),
      ).accepted,
    ).toBe(true);

    const malformedBurstGuard = new CommandSecurityGuard();
    for (let attempt = 0; attempt < MAX_COMMANDS_PER_SECOND; attempt += 1) {
      expect(malformedBurstGuard.validate({ malformed: true }, context()).accepted).toBe(false);
    }
    expect(malformedBurstGuard.validate(move(), context())).toMatchObject({
      accepted: false,
      reason: 'Command rate limit exceeded',
    });
  });
});
