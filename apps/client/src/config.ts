export const CLIENT_CONFIG = {
  interpolationDelayMs: 120,
  cameraPanSpeed: 560,
  cameraEdgeSize: 26,
  cameraDragMultiplier: 1,
  destinationMarkerLifetimeMs: 1_800,
  eventFeedLifetimeMs: 7_000,
} as const;

declare global {
  interface Window {
    signalZeroDesktop?: {
      readonly serverUrl: string;
    };
  }
}

function defaultServerUrl(): string {
  const desktopUrl = window.signalZeroDesktop?.serverUrl;
  if (desktopUrl) return desktopUrl;

  // A packaged Electron app loads the renderer from disk, so it has no host name
  // to derive. Its main process starts the authoritative server on loopback.
  if (window.location.protocol === 'file:') return 'http://127.0.0.1:2567';

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${window.location.hostname}:2567`;
}

export const SERVER_URL = import.meta.env.VITE_SERVER_URL?.trim() || defaultServerUrl();
