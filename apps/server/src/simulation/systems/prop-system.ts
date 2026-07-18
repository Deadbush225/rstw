import {
  distance,
  GRAB_RADIUS,
  GRABBED_PROP_FOLLOW_DISTANCE,
  RESCUE_CRATE_POSITION,
  RESCUE_CRATE_RADIUS,
  type PublicPropState,
} from '@signal-zero/shared';
import { moveCircleAxisSeparated } from '../infrastructure/partyPhysics.js';
import type { RuntimePlayer, SimulationCommandResult } from '../orchestrator/simulation-context.js';

function copyPoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

/**
 * Rescue crate grab/release and follow-position tracking.
 *
 * The crate follows the carrier at a fixed offset in the facing direction.
 * If the carrier drifts too far away the crate is auto-released.
 */
export class PropSystem {
  readonly #crate: PublicPropState = {
    id: 'rescue-crate',
    kind: 'rescue-crate',
    ...copyPoint(RESCUE_CRATE_POSITION),
    grabbedBy: null,
  };
  #crateLastHandledBy: string | null = null;

  get crate(): PublicPropState {
    return this.#crate;
  }

  get crateLastHandledBy(): string | null {
    return this.#crateLastHandledBy;
  }

  reset(): void {
    Object.assign(this.#crate, {
      ...copyPoint(RESCUE_CRATE_POSITION),
      grabbedBy: null,
    });
    this.#crateLastHandledBy = null;
  }

  toggleGrab(
    player: RuntimePlayer,
    now: number,
    targetId: string | undefined,
    pushEvent: (event: { type: string; at: number; playerId: string; propId: string }) => void,
  ): SimulationCommandResult {
    if (player.state.grabbedObjectId) {
      this.#releaseProp(player, true, now, pushEvent);
      return { accepted: true };
    }
    if (targetId && targetId !== this.#crate.id) return { accepted: false, reason: 'Unknown grabbable object' };
    if (!player.state.grounded) return { accepted: false, reason: 'Player must be grounded to grab the rescue crate' };
    if (now < player.state.stumbleUntil)
      return { accepted: false, reason: 'Player is recovering from a stumble' };
    if (this.#crate.grabbedBy) return { accepted: false, reason: 'Rescue crate is already grabbed' };
    if (distance(player.state, this.#crate) > GRAB_RADIUS) {
      return { accepted: false, reason: 'Rescue crate is out of grab range' };
    }

    player.state.grabbedObjectId = this.#crate.id;
    this.#crate.grabbedBy = player.state.id;
    this.#crateLastHandledBy = player.state.id;
    pushEvent({
      type: 'PROP_GRABBED',
      at: now,
      playerId: player.state.id,
      propId: this.#crate.id,
    });
    return { accepted: true };
  }

  #releaseProp(
    player: RuntimePlayer,
    emitEvent: boolean,
    now: number,
    pushEvent: (event: { type: string; at: number; playerId: string; propId: string }) => void,
  ): void {
    if (player.state.grabbedObjectId !== this.#crate.id) return;
    player.state.grabbedObjectId = null;
    if (this.#crate.grabbedBy === player.state.id) this.#crate.grabbedBy = null;
    if (emitEvent) {
      pushEvent({
        type: 'PROP_RELEASED',
        at: now,
        playerId: player.state.id,
        propId: this.#crate.id,
      });
    }
  }

  /** Update crate position to follow the carrier. */
  syncGrabbed(
    players: Iterable<RuntimePlayer>,
    pushEvent: (event: { type: string; at: number; playerId: string; propId: string }) => void,
  ): void {
    for (const player of players) {
      if (player.state.grabbedObjectId !== this.#crate.id) continue;
      const target = {
        x: player.state.x + player.state.facing.x * GRABBED_PROP_FOLLOW_DISTANCE,
        y: player.state.y + player.state.facing.y * GRABBED_PROP_FOLLOW_DISTANCE,
      };
      const next = moveCircleAxisSeparated(
        this.#crate,
        { x: target.x - this.#crate.x, y: target.y - this.#crate.y },
        RESCUE_CRATE_RADIUS,
      );
      this.#crate.x = next.x;
      this.#crate.y = next.y;
      this.#crateLastHandledBy = player.state.id;
      if (distance(player.state, this.#crate) > GRAB_RADIUS * 2) {
        this.#releaseProp(player, true, 0, pushEvent);
      }
    }
  }

  /** Force-release when the carrier dies or respawns. */
  releaseForPlayer(
    player: RuntimePlayer,
    now: number,
    pushEvent: (event: { type: string; at: number; playerId: string; propId: string }) => void,
  ): void {
    this.#releaseProp(player, true, now, pushEvent);
  }

  publicRelease(
    player: RuntimePlayer,
    now: number,
    pushEvent: (event: { type: string; at: number; playerId: string; propId: string }) => void,
  ): void {
    this.#releaseProp(player, true, now, pushEvent);
  }
}
