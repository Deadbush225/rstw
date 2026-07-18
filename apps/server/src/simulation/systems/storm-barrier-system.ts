import {
  PLAYER_COLLISION_RADIUS,
  STORM_BARRIER_CLEARANCE,
  STORM_BARRIER_DEFINITIONS,
  STORM_BARRIER_HIT_COOLDOWN_MS,
  STORM_BARRIER_KNOCKBACK,
  STORM_BARRIER_STUMBLE_MS,
  type PublicStormBarrierState,
} from '@signal-zero/shared';
import { moveCircleAxisSeparated, stormBarrierCollisionNormal } from '../infrastructure/partyPhysics.js';
import type { SimulationContext, RuntimePlayer } from '../orchestrator/simulation-context.js';

/**
 * Storm barrier rotation and player collision knockback.
 *
 * Barriers are computed from shared definitions each frame so the snapshot
 * always reflects current angles. Collision resolves knockback plus a short
 * stumble, cancelling any active dive.
 */
export class StormBarrierSystem {
  /** Compute current barrier state from elapsed match time. */
  computeBarriers(elapsedMs: number): PublicStormBarrierState[] {
    const elapsedSeconds = elapsedMs / 1_000;
    return STORM_BARRIER_DEFINITIONS.map((definition) => {
      const rawAngle =
        definition.initialAngle + definition.angularSpeedRadiansPerSecond * elapsedSeconds;
      const angle = ((rawAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return {
        id: definition.id,
        x: definition.x,
        y: definition.y,
        angle,
        length: definition.length,
        width: definition.width,
      };
    });
  }

  /** Resolve player collisions against all active barriers. */
  resolveCollisions(context: SimulationContext): void {
    const barriers = this.computeBarriers(context.now);
    for (const player of context.players()) {
      if (
        !player.state.alive ||
        !player.state.connected ||
        player.state.elevation > STORM_BARRIER_CLEARANCE
      ) {
        continue;
      }
      for (const barrier of barriers) {
        const cooldownEnds = (player as RuntimePlayer).hazardHitCooldowns?.get(barrier.id) ?? 0;
        if (cooldownEnds > context.now) continue;
        const normal = stormBarrierCollisionNormal(player.state, barrier, PLAYER_COLLISION_RADIUS);
        if (!normal) continue;

        const knockback = {
          x: normal.x * STORM_BARRIER_KNOCKBACK,
          y: normal.y * STORM_BARRIER_KNOCKBACK,
        };
        const next = moveCircleAxisSeparated(player.state, knockback, PLAYER_COLLISION_RADIUS);
        player.state.x = next.x;
        player.state.y = next.y;
        player.state.stumbleUntil = Math.max(
          player.state.stumbleUntil,
          context.now + STORM_BARRIER_STUMBLE_MS,
        );
        (player as RuntimePlayer).diveEndsAt = context.now;
        (player as RuntimePlayer).hazardHitCooldowns?.set(
          barrier.id,
          context.now + STORM_BARRIER_HIT_COOLDOWN_MS,
        );
        context.pushEvent({
          type: 'HAZARD_HIT',
          at: context.now,
          playerId: player.state.id,
          hazardId: barrier.id,
          knockback,
        });
        // One barrier hit per player per tick
        break;
      }
    }
  }
}
