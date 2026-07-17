import type { Client } from '@colyseus/core';
import { afterEach, describe, expect, it } from 'vitest';
import { SignalZeroRoom } from './SignalZeroRoom.js';

const client = {} as Client;
const createdRooms: SignalZeroRoom[] = [];

function createRoom(mode: 'flood-drill' | 'versus'): SignalZeroRoom {
  const room = new SignalZeroRoom();
  createdRooms.push(room);
  room.onCreate({ name: 'Creator', mode, heroId: 'maya' });
  return room;
}

afterEach(() => {
  for (const room of createdRooms.splice(0)) {
    room.setSimulationInterval();
    room.clock.clear();
    room.clock.stop();
  }
});

describe('mode-filtered signal_zero room boundaries', () => {
  it('configures a one-player Flood Drill room and rejects a versus join by room id', () => {
    const room = createRoom('flood-drill');
    expect(room.maxClients).toBe(1);
    expect(room.onAuth(client, { name: 'Maya', mode: 'flood-drill', heroId: 'maya' })).toEqual({
      name: 'Maya',
      mode: 'flood-drill',
      heroId: 'maya',
    });
    expect(() => room.onAuth(client, { name: 'Maya', mode: 'versus', heroId: 'maya' })).toThrow(
      'This room only accepts flood-drill matches',
    );
  });

  it('configures a two-player versus room and rejects a Flood Drill join by room id', () => {
    const room = createRoom('versus');
    expect(room.maxClients).toBe(2);
    expect(room.onAuth(client, { name: 'Tomas', mode: 'versus', heroId: 'tomas' })).toEqual({
      name: 'Tomas',
      mode: 'versus',
      heroId: 'tomas',
    });
    expect(() =>
      room.onAuth(client, { name: 'Tomas', mode: 'flood-drill', heroId: 'tomas' }),
    ).toThrow('This room only accepts versus matches');
  });

  it('rejects malformed creation options before starting the simulation', () => {
    const room = new SignalZeroRoom();
    createdRooms.push(room);
    expect(() => room.onCreate({ name: 'Maya', mode: 'invented', heroId: 'maya' })).toThrow(
      'mode:',
    );
  });
});
