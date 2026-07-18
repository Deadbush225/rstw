import type { AbilitySlot, PlayerId, TeamId, Vector2 } from '@signal-zero/shared';

/** The scene emits intentions through this interface and never imports the network SDK. */
export interface CommandGateway {
  readonly playerId: PlayerId | null;
  readonly team: TeamId | null;
  readonly connected: boolean;
  move(destination: Vector2): number | null;
  attackTarget(targetId: PlayerId): number | null;
  attackMove(destination: Vector2): number | null;
  castAbility(slot: AbilitySlot, targetPoint: Vector2): number | null;
  interact(targetId?: string): number | null;
  stop(): number | null;
  holdPosition(): number | null;
  steer(direction: Vector2): number | null;
  jump(): number | null;
  dive(direction: Vector2): number | null;
  grab(targetId?: string): number | null;
}

export interface ArenaUiBridge {
  setTargeting(active: boolean, title?: string, copy?: string): void;
  setScoreboardVisible(visible: boolean): void;
  togglePause(): void;
  showToast(message: string, tone?: 'info' | 'warning' | 'error' | 'success'): void;
}
