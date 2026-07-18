import {
  distance,
  HEROES,
  RESPAWN_MS,
  SPAWN_POSITIONS,
  type GameEvent,
  type HeroId,
} from '@signal-zero/shared';
import { findPath } from '../infrastructure/pathfinding.js';
import type { RuntimePlayer, SimulationCommandResult } from '../orchestrator/simulation-context.js';

const MAX_CHASE_DISTANCE = 625;

function copyPoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

/**
 * Attack targeting, chase AI, damage application, defeat, and respawn.
 */
export class CombatSystem {
  attackTarget(
    player: RuntimePlayer,
    targetId: string,
    players: Map<string, RuntimePlayer>,
  ): SimulationCommandResult {
    const target = players.get(targetId);
    if (!target || target.state.team === player.state.team)
      return { accepted: false, reason: 'Target is not a hostile player' };
    if (!target.state.alive || !target.state.connected)
      return { accepted: false, reason: 'Target is not attackable' };
    if (distance(player.state, target.state) > MAX_CHASE_DISTANCE)
      return { accepted: false, reason: 'Target is too far away' };
    player.path = [];
    player.state.destination = null;
    player.state.attackTargetId = targetId;
    player.state.commandMode = 'attacking';
    player.attackMoveDestination = null;
    player.attackLeashOrigin = copyPoint(player.state);
    player.nextChasePathAt = 0;
    player.steerDirection = { x: 0, y: 0 };
    player.diveEndsAt = 0;
    return { accepted: true };
  }

  updateRespawn(
    player: RuntimePlayer,
    now: number,
    pushEvent: (event: GameEvent) => void,
    releaseProp: (player: RuntimePlayer) => void,
    dismountBoat: (player: RuntimePlayer) => void,
  ): void {
    if (player.state.alive || player.state.respawnAt === null || now < player.state.respawnAt)
      return;
    const spawn = SPAWN_POSITIONS[player.state.team];
    releaseProp(player);
    dismountBoat(player);
    Object.assign(player.state, {
      ...copyPoint(spawn),
      health: player.state.maxHealth,
      energy: player.state.maxEnergy,
      alive: true,
      respawnAt: null,
      attackTargetId: null,
      destination: null,
      elevation: 0,
      grounded: true,
      stumbleUntil: 0,
      grabbedObjectId: null,
      boatId: null,
      commandMode: 'idle',
    });
    player.path = [];
    player.steerDirection = { x: 0, y: 0 };
    player.verticalVelocity = 0;
    player.diveEndsAt = 0;
    pushEvent({ type: 'RESPAWNED', at: now, playerId: player.state.id });
  }

  updatePlayerAction(
    player: RuntimePlayer,
    players: Iterable<RuntimePlayer>,
    playersMap: Map<string, RuntimePlayer>,
    floodTraversalCost: (col: number, row: number) => number,
    pushEvent: (event: GameEvent) => void,
    releaseProp: (player: RuntimePlayer) => void,
    dismountBoat: (player: RuntimePlayer) => void,
    dropCore: (player: RuntimePlayer) => void,
    stopPlayer: (player: RuntimePlayer, mode: 'idle' | 'holding') => void,
  ): void {
    if (player.state.commandMode === 'holding') {
      this.#updateHoldingAttack(player, players, pushEvent, releaseProp, dismountBoat, dropCore);
      return;
    }
    if (player.state.commandMode === 'attacking' || player.state.attackTargetId) {
      const target = player.state.attackTargetId
        ? playersMap.get(player.state.attackTargetId)
        : undefined;
      if (!target || !this.#isValidCombatTarget(player, target)) {
        this.#finishCurrentAttack(player, floodTraversalCost, stopPlayer);
      } else {
        this.#updateAttackTarget(player, target, floodTraversalCost, pushEvent, releaseProp, dismountBoat, dropCore, stopPlayer);
        return;
      }
    }
    if (player.state.commandMode === 'attack-moving') {
      const heroId = player.state.heroId as HeroId;
      const acquired = this.#nearestEnemy(player, HEROES[heroId].acquisitionRange, players);
      if (acquired) {
        player.state.attackTargetId = acquired.state.id;
        player.attackLeashOrigin = copyPoint(player.state);
        this.#updateAttackTarget(player, acquired, floodTraversalCost, pushEvent, releaseProp, dismountBoat, dropCore, stopPlayer);
        return;
      }
    }
  }

  #updateHoldingAttack(
    player: RuntimePlayer,
    players: Iterable<RuntimePlayer>,
    pushEvent: (event: GameEvent) => void,
    releaseProp: (player: RuntimePlayer) => void,
    dismountBoat: (player: RuntimePlayer) => void,
    dropCore: (player: RuntimePlayer) => void,
  ): void {
    const heroId = player.state.heroId as HeroId;
    const hero = HEROES[heroId];
    const target = this.#nearestEnemy(player, hero.attackRange, players);
    player.state.attackTargetId = target?.state.id ?? null;
    if (target) this.#performBasicAttack(player, target, pushEvent, releaseProp, dismountBoat, dropCore);
  }

  #updateAttackTarget(
    player: RuntimePlayer,
    target: RuntimePlayer,
    floodTraversalCost: (col: number, row: number) => number,
    pushEvent: (event: GameEvent) => void,
    releaseProp: (player: RuntimePlayer) => void,
    dismountBoat: (player: RuntimePlayer) => void,
    dropCore: (player: RuntimePlayer) => void,
    stopPlayer: (player: RuntimePlayer, mode: 'idle' | 'holding') => void,
  ): void {
    const heroId = player.state.heroId as HeroId;
    const hero = HEROES[heroId];
    const targetDistance = distance(player.state, target.state);
    const leashOrigin = player.attackLeashOrigin ?? player.state;
    const exceededLeash =
      distance(player.state, leashOrigin) > MAX_CHASE_DISTANCE ||
      distance(target.state, leashOrigin) > MAX_CHASE_DISTANCE;
    if (exceededLeash) {
      this.#finishCurrentAttack(player, floodTraversalCost, stopPlayer);
      return;
    }
    if (targetDistance <= hero.attackRange) {
      player.path = [];
      this.#performBasicAttack(player, target, pushEvent, releaseProp, dismountBoat, dropCore);
      return;
    }
  }

  #performBasicAttack(
    source: RuntimePlayer,
    target: RuntimePlayer,
    pushEvent: (event: GameEvent) => void,
    releaseProp: (player: RuntimePlayer) => void,
    dismountBoat: (player: RuntimePlayer) => void,
    dropCore: (player: RuntimePlayer) => void,
  ): void {
    if (source.nextAttackAt > 0) return;
    const heroId = source.state.heroId as HeroId;
    const hero = HEROES[heroId];
    source.nextAttackAt = hero.attackIntervalMs;
    this.#dealDamage(source, target, hero.attackDamage, 'basic', pushEvent, releaseProp, dismountBoat, dropCore);
  }

  #dealDamage(
    source: RuntimePlayer,
    target: RuntimePlayer,
    damage: number,
    kind: 'basic' | 'rescue-line',
    pushEvent: (event: GameEvent) => void,
    releaseProp: (player: RuntimePlayer) => void,
    dismountBoat: (player: RuntimePlayer) => void,
    dropCore: (player: RuntimePlayer) => void,
  ): void {
    target.state.health = Math.max(0, target.state.health - damage);
    pushEvent({
      type: 'HIT',
      at: 0,
      sourceId: source.state.id,
      targetId: target.state.id,
      damage,
      attackKind: kind,
    });
    if (target.state.health > 0) return;

    target.state.alive = false;
    target.state.respawnAt = target.state.respawnAt ? target.state.respawnAt + RESPAWN_MS : RESPAWN_MS;
    target.state.elevation = 0;
    target.state.grounded = true;
    target.verticalVelocity = 0;
    releaseProp(target);
    dismountBoat(target);
    dropCore(target);
    pushEvent({
      type: 'DEFEATED',
      at: 0,
      playerId: target.state.id,
      byPlayerId: source.state.id,
    });
  }

  #isValidCombatTarget(source: RuntimePlayer, target: RuntimePlayer): boolean {
    return source.state.team !== target.state.team && target.state.alive && target.state.connected;
  }

  #nearestEnemy(
    player: RuntimePlayer,
    range: number,
    players: Iterable<RuntimePlayer>,
  ): RuntimePlayer | undefined {
    let nearest: RuntimePlayer | undefined;
    let nearestDistance = range;
    for (const candidate of players) {
      if (!this.#isValidCombatTarget(player, candidate)) continue;
      const candidateDistance = distance(player.state, candidate.state);
      if (candidateDistance <= nearestDistance) {
        nearest = candidate;
        nearestDistance = candidateDistance;
      }
    }
    return nearest;
  }

  #finishCurrentAttack(
    player: RuntimePlayer,
    floodTraversalCost: (col: number, row: number) => number,
    stopPlayer: (player: RuntimePlayer, mode: 'idle' | 'holding') => void,
  ): void {
    player.state.attackTargetId = null;
    player.attackLeashOrigin = null;
    if (player.attackMoveDestination) {
      const route = findPath(player.state, player.attackMoveDestination, floodTraversalCost);
      if (route.found) {
        player.path = route.points;
        player.state.destination = copyPoint(player.attackMoveDestination);
        player.state.commandMode = 'attack-moving';
        return;
      }
    }
    stopPlayer(player, 'idle');
  }
}
