import type { GameStore } from '../state/GameStore';
import { ArenaScene } from './ArenaScene';
import type { ArenaUiBridge, CommandGateway } from './CommandGateway';

export interface GameRuntime {
  scene: ArenaScene;
  destroy(): void;
}

export function createGame(
  store: GameStore,
  commands: CommandGateway,
  ui: ArenaUiBridge,
): GameRuntime {
  const container = document.getElementById('game-canvas');
  if (!container) throw new Error('Missing #game-canvas mount point.');

  const scene = new ArenaScene(container, store, commands, ui);
  return {
    scene,
    destroy: () => scene.destroy(),
  };
}
