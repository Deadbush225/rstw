import type { PublicPlayerState, PublicSnapshot } from '@signal-zero/shared';

import { CLIENT_CONFIG } from '../config';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function interpolatePlayer(
  earlier: PublicPlayerState | undefined,
  latest: PublicPlayerState,
  amount: number,
): PublicPlayerState {
  if (!earlier || earlier.alive !== latest.alive) return latest;
  return {
    ...latest,
    x: earlier.x + (latest.x - earlier.x) * amount,
    y: earlier.y + (latest.y - earlier.y) * amount,
  };
}

/**
 * Stores authoritative snapshots and exposes a delayed visual view between the newest two.
 * It deliberately does not predict movement or mutate gameplay state.
 */
export class GameStore {
  private earlierSnapshot: PublicSnapshot | null = null;
  private newestSnapshot: PublicSnapshot | null = null;
  private clockOffsetMs = 0;
  private hasClockSample = false;

  ingest(snapshot: PublicSnapshot, receivedAt = Date.now()): boolean {
    if (this.newestSnapshot && snapshot.tick <= this.newestSnapshot.tick) return false;

    this.earlierSnapshot = this.newestSnapshot;
    this.newestSnapshot = snapshot;
    const sample = snapshot.serverTime - receivedAt;
    this.clockOffsetMs = this.hasClockSample ? this.clockOffsetMs * 0.9 + sample * 0.1 : sample;
    this.hasClockSample = true;
    return true;
  }

  reset(): void {
    this.earlierSnapshot = null;
    this.newestSnapshot = null;
    this.clockOffsetMs = 0;
    this.hasClockSample = false;
  }

  get latest(): PublicSnapshot | null {
    return this.newestSnapshot;
  }

  estimatedServerTime(clientNow = Date.now()): number {
    return clientNow + this.clockOffsetMs;
  }

  interpolatedPlayers(clientNow = Date.now()): PublicPlayerState[] {
    const latest = this.newestSnapshot;
    const earlier = this.earlierSnapshot;
    if (!latest || !earlier) return latest?.players ?? [];

    const interval = latest.serverTime - earlier.serverTime;
    if (interval <= 0) return latest.players;

    const targetTime = this.estimatedServerTime(clientNow) - CLIENT_CONFIG.interpolationDelayMs;
    const amount = clamp((targetTime - earlier.serverTime) / interval, 0, 1);
    const earlierById = new Map(earlier.players.map((player) => [player.id, player]));
    return latest.players.map((player) =>
      interpolatePlayer(earlierById.get(player.id), player, amount),
    );
  }
}
