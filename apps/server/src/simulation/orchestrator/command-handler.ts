import type { PlayerCommand } from '@signal-zero/shared';
import type { RuntimePlayer, SimulationCommandResult } from './simulation-context.js';
import type { AbilitySystem } from './ability-system.js';
import type { CombatSystem } from './combat-system.js';
import type { MovementSystem } from './movement-system.js';
import type { ObjectiveSystem } from './objective-system.js';
import type { PropSystem } from './prop-system.js';

/**
 * Route and pre-validate incoming PlayerCommand payloads.
 *
 * Each command family delegates to the owning subsystem. The handler itself
 * does not mutate simulation state beyond what the subsystems perform.
 */
export class CommandHandler {
  constructor(
    readonly ability: AbilitySystem,
    readonly combat: CombatSystem,
    readonly movement: MovementSystem,
    readonly objective: ObjectiveSystem,
    readonly prop: PropSystem,
  ) {}

  handle(
    command: PlayerCommand,
    player: RuntimePlayer | undefined,
    now: number,
    players: Map<string, RuntimePlayer>,
    playersIterable: Iterable<RuntimePlayer>,
    floodTraversalCost: (col: number, row: number) => number,
    pushEvent: (event: { type: string; at: number; [key: string]: unknown }) => void,
    stopPlayer: (p: RuntimePlayer, mode: 'idle' | 'holding') => void,
    waterGridPlaceSandbag: (x: number, y: number) => boolean,
    addDrillScore: (points: number) => void,
  ): SimulationCommandResult {
    if (!player) return { accepted: false, reason: 'Player is not in this room' };

    switch (command.type) {
      case 'MOVE':
        return this.movement.moveCommand(player, command.destination, 'moving', floodTraversalCost);
      case 'ATTACK_MOVE':
        return this.movement.moveCommand(player, command.destination, 'attack-moving', floodTraversalCost);
      case 'ATTACK_TARGET':
        return this.combat.attackTarget(player, command.targetId, players);
      case 'CAST_ABILITY':
        return this.ability.cast(
          player,
          now,
          command.slot,
          command.targetPoint,
          playersIterable,
          pushEvent,
          // dealDamage is handled by combat system
          () => {},
          stopPlayer,
        );
      case 'INTERACT':
        return this.objective.interact(
          player,
          command.targetId,
          now,
          pushEvent,
          addDrillScore,
          waterGridPlaceSandbag,
        );
      case 'STOP':
        stopPlayer(player, 'idle');
        return { accepted: true };
      case 'HOLD_POSITION':
        stopPlayer(player, 'holding');
        return { accepted: true };
      case 'STEER':
        return this.movement.steer(player, command.direction, now);
      case 'JUMP':
        return this.movement.jump(player, now, pushEvent);
      case 'DIVE':
        return this.movement.dive(player, command.direction, now, pushEvent);
      case 'GRAB':
        return this.prop.toggleGrab(player, now, command.targetId, pushEvent);
    }
  }
}
