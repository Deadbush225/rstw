import { ROOM_NAME, SIMULATION_TICK_RATE } from '@signal-zero/shared';
import { defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { SignalZeroRoom } from './rooms/SignalZeroRoom.js';

interface RouteResponse {
  status(code: number): RouteResponse;
  json(body: unknown): void;
  send(body: string): void;
}

function serverPort(rawPort: string | undefined): number {
  const port = Number(rawPort ?? 2567);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `SERVER_PORT/PORT must be an integer from 1 to 65535; received ${rawPort ?? ''}`,
    );
  }
  return port;
}

// Both source and built entrypoints are three levels below the repository root.
const rootEnvironmentPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnvironmentPath)) loadEnvFile(rootEnvironmentPath);

const port = serverPort(process.env.SERVER_PORT ?? process.env.PORT);
const host = process.env.SERVER_HOST?.trim() || process.env.HOST?.trim() || '0.0.0.0';

export const gameServer = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(SignalZeroRoom).filterBy(['mode']),
  },
  transport: new WebSocketTransport({
    pingInterval: 6_000,
    pingMaxRetries: 4,
    maxPayload: 16 * 1_024,
  }),
  express: (app) => {
    app.disable('x-powered-by');
    app.get('/health', (_request: unknown, response: RouteResponse) => {
      response.status(200).json({
        ok: true,
        service: '@signal-zero/server',
        rooms: [ROOM_NAME],
        tickRate: SIMULATION_TICK_RATE,
      });
    });
    app.get('/', (_request: unknown, response: RouteResponse) => {
      response.status(200).send('Bayanihan Protocol: Signal Zero authoritative server');
    });
  },
});

try {
  await gameServer.listen(port, host);
  console.log(`[signal-zero] Authoritative server listening on http://${host}:${port}`);
  console.log(`[signal-zero] Health check: http://localhost:${port}/health`);
} catch (error) {
  console.error('[signal-zero] Server failed to start', error);
  process.exitCode = 1;
}
