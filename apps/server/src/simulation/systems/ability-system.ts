import {
  ABILITIES,
  distance,
  pointToSegmentDistance,
  type AbilitySlot,
  type GameEvent,
  type Vector2,
} from '@signal-zero/shared';
import { hasClearWalkableLine } from '../infrastructure/pathfinding.js';
import type { RuntimePlayer, SimulationCommandResult } from '../orchestrator/simulation-context.js';

const RESCUE_LINE_DAMAGE = 30;
const RESCUE_LINE_WIDTH = 42;
const RESCUE_LINE_FLOOD_IMMUNITY_MS = 2_000;
const BAYANIHAN_PULSE_FLOOD_IMMUNITY_MS = 4_000;

function copyPoint(point: Vector2): Vector2 {
  return { x: point.x, y: point.y };
}

/**
 * QWER ability casting, cooldown tracking, and energy costs.
 *
 * Currently implements Q (Rescue Line) and W (Bayanihan Pulse).
 * E and R return a safe rejection until their kits are designed.
 */
export class AbilitySystem {
  cast(
    player: RuntimePlayer,
    now: number,
    slot: AbilitySlot,
    targetPoint: Vector2 | undefined,
    players: Iterable<RuntimePlayer>,
    pushEvent: (event: GameEvent) => void,
    dealDamage: (source: RuntimePlayer, target: RuntimePlayer, damage: number, kind: 'basic' | 'rescue-line') => void,
    stopPlayer: (player: RuntimePlayer, mode: 'idle' | 'holding') => void,
  ): SimulationCommandResult {
    if (slot === 'W') return this.#castBayanihanPulse(player, now, pushEvent);
    if (slot !== 'Q') return { accepted: false, reason: `${slot} is not implemented in this milestone` };
    return this.#castRescueLine(player, now, targetPoint, players, pushEvent, dealDamage, stopPlayer);
  }

  #castRescueLine(
    player: RuntimePlayer,
    now: number,
    targetPoint: Vector2 | undefined,
    players: Iterable<RuntimePlayer>,
    pushEvent: (event: GameEvent) => void,
    dealDamage: (source: RuntimePlayer, target: RuntimePlayer, damage: number, kind: 'basic' | 'rescue-line') => void,
    stopPlayer: (player: RuntimePlayer, mode: 'idle' | 'holding') => void,
  ): SimulationCommandResult {
    if (!targetPoint) return { accepted: false, reason: 'Rescue Line requires a target point' };
    if (now < player.state.qCooldownEndsAt) return { accepted: false, reason: 'Rescue Line is on cooldown' };
    if (player.state.energy < ABILITIES.Q.energyCost) return { accepted: false, reason: 'Not enough energy' };
    if (distance(player.state, targetPoint) > ABILITIES.Q.range)
      return { accepted: false, reason: 'Target point is out of range' };
    if (!hasClearWalkableLine(player.state, targetPoint)) {
      return { accepted: false, reason: 'Rescue Line route is blocked' };
    }

    const from = copyPoint(player.state);
    player.state.energy -= ABILITIES.Q.energyCost;
    player.state.qCooldownEndsAt = now + ABILITIES.Q.cooldownMs;
    player.state.floodImmuneUntil = now + RESCUE_LINE_FLOOD_IMMUNITY_MS;
    player.state.x = targetPoint.x;
    player.state.y = targetPoint.y;
    stopPlayer(player, 'idle');
    pushEvent({
      type: 'ABILITY_CAST',
      at: now,
      playerId: player.state.id,
      slot: 'Q',
      from,
      to: copyPoint(targetPoint),
    });

    for (const target of players) {
      if (
        target.state.team !== player.state.team &&
        target.state.alive &&
        target.state.connected &&
        pointToSegmentDistance(target.state, from, targetPoint) <= RESCUE_LINE_WIDTH
      ) {
        dealDamage(player, target, RESCUE_LINE_DAMAGE, 'rescue-line');
      }
    }
    return { accepted: true };
  }

  #castBayanihanPulse(
    player: RuntimePlayer,
    now: number,
    pushEvent: (event: GameEvent) => void,
  ): SimulationCommandResult {
    if (now < player.state.wCooldownEndsAt) return { accepted: false, reason: 'Bayanihan Pulse is on cooldown' };
    if (player.state.energy < ABILITIES.W.energyCost) return { accepted: false, reason: 'Not enough energy' };
    player.state.energy -= ABILITIES.W.energyCost;
    player.state.wCooldownEndsAt = now + ABILITIES.W.cooldownMs;
    player.state.floodImmuneUntil = Math.max(
      player.state.floodImmuneUntil,
      now + BAYANIHAN_PULSE_FLOOD_IMMUNITY_MS,
    );
    pushEvent({
      type: 'ABILITY_CAST',
      at: now,
      playerId: player.state.id,
      slot: 'W',
      from: copyPoint(player.state),
      to: copyPoint(player.state),
    });
    return { accepted: true };
  }
}
