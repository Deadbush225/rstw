import './styles.css';

import type { CommandResultMessage } from '@signal-zero/shared';

import { SERVER_URL } from './config';
import { AudioDirector } from './audio/AudioDirector';
import { createGame, type GameRuntime } from './game/createGame';
import { GameClient } from './network/GameClient';
import { GameStore } from './state/GameStore';
import { DashboardController, type DashboardPreferences } from './ui/DashboardController';
import { HudController } from './ui/HudController';

const store = new GameStore();
let runtime: GameRuntime | null = null;
let dashboard: DashboardController | null = null;
let startupFailure: Error | null = null;
const audio = new AudioDirector(document.getElementById('audio-toggle') as HTMLButtonElement);

const hud = new HudController({
  join: async (name) => {
    store.reset();
    runtime?.scene.resetForSession();
    await client.connect(name);
  },
  setReady: (ready) => client.setReady(ready),
  rematch: () => client.voteRematch(),
  targetAbility: (slot) => runtime?.scene.beginAbilityTargeting(slot),
  resume: () => runtime?.scene.resumeFromMenu(),
});

function handleCommandResult(result: CommandResultMessage): void {
  if (!result.accepted) {
    hud.showToast(result.reason ?? `Command ${result.sequence} was rejected.`, 'error');
  }
}

function applyPresentationPreferences(preferences: DashboardPreferences): void {
  audio.setEnabled(preferences.masterSound);
  audio.setMasterVolume(preferences.masterVolume);
  runtime?.scene.setCameraSensitivity(preferences.cameraSensitivity);
}

const client = new GameClient(SERVER_URL, {
  onStatus: (state, detail) => {
    hud.setConnection(state, detail);
    if (state === 'disconnected' && dashboard) {
      store.reset();
      runtime?.scene.resetForSession();
      dashboard.showDashboard();
    }
  },
  onWelcome: (message) => {
    hud.clearError();
    hud.acceptWelcome(message);
  },
  onSnapshot: (snapshot) => {
    if (!store.ingest(snapshot)) return;
    hud.renderSnapshot(snapshot);
  },
  onEvent: (event) => {
    audio.play(event);
    hud.showEvent(event);
    runtime?.scene.playEvent(event);
  },
  onCommandResult: handleCommandResult,
  onNotice: (message) => hud.showToast(message, 'info'),
  onError: (message) => hud.showError(message),
});

hud.setConnection('offline');

dashboard = new DashboardController({
  onDeploy: async ({ name, mode, heroId }) => {
    if (!runtime) {
      throw startupFailure ?? new Error('The 3D arena is not available on this device.');
    }
    store.reset();
    runtime.scene.resetForSession();
    hud.prepareDeployment(name, mode);
    await client.connect(name, mode, heroId);
  },
  onReturnToDashboard: async () => {
    runtime?.scene.resumeFromMenu();
    await client.disconnect();
    store.reset();
    runtime?.scene.resetForSession();
  },
  onPreferencesChanged: applyPresentationPreferences,
});

try {
  runtime = createGame(store, client, hud);
  applyPresentationPreferences({ ...dashboard.currentPreferences });
} catch (error) {
  startupFailure =
    error instanceof Error ? error : new Error('The 3D renderer could not be initialized.');
  dashboard.reportBootFailure(startupFailure.message);
}

let animationFrame = 0;
const updateRealtimeHud = (): void => {
  hud.renderRealtime(store.estimatedServerTime());
  animationFrame = window.requestAnimationFrame(updateRealtimeHud);
};
animationFrame = window.requestAnimationFrame(updateRealtimeHud);

const cleanUp = (): void => {
  window.cancelAnimationFrame(animationFrame);
  void client.disconnect();
  runtime?.destroy();
  audio.destroy();
  dashboard?.destroy();
  runtime = null;
};

window.addEventListener('pagehide', cleanUp, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(cleanUp);
}
