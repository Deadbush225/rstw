# Beginner Guide: From Third-Person Input to Authoritative Game State

## Start with one mental model

Signal Zero is not one program pretending to be multiplayer. During development, it is at least three cooperating pieces:

```text
Browser / Three.js client
    sends intentions: “move in this direction”, “interact nearby”, “cast Q toward this point”
                         │
                         ▼ WebSocket through Colyseus
Node.js authoritative server
    validates the intention and advances the real match at 20 ticks/second
                         │
                         ▼ public snapshot 10 times/second
Browser / Three.js client
    smoothly draws what the server says happened

packages/shared is the common dictionary used by both sides.
```

The browser makes the game visible and lets a player ask for actions. The server decides the real result. The shared package prevents the two programs from using different spellings, shapes, and important constants.

The command suite and complete two-browser match/rematch flow were verified on macOS on 2026-07-16. The concepts below describe the implemented slice; the root `README.md` records exact evidence and the still-pending Windows/LAN pass.

## What `npm run dev` does

From the repository root, `npm run dev` starts two long-running processes together:

1. **Vite** serves the browser client, normally at `http://localhost:5174`.
2. **Node.js/Colyseus** serves the `signal_zero` multiplayer room, normally configured at `http://localhost:2567`; the Colyseus SDK upgrades that HTTP(S) endpoint to a WebSocket.

Vite rebuilds browser code when client/shared files change. The server development process should restart or reload when server/shared files change. Keep the terminal visible: a browser can show an old canvas even after the server has crashed.

The first time you work on the repository, use the Node version in `.nvmrc`, copy `.env.example` to `.env`, and run `npm install` from the root. Vite reads that root file through `envDir`, while the server entrypoint automatically loads the optional file with Node’s built-in `loadEnvFile`. The server prefers `SERVER_HOST`/`SERVER_PORT` with `HOST`/`PORT` fallbacks. Do not run separate installs inside each workspace.

## How the Three.js client works

The Three.js runtime owns one scene graph, a perspective camera, a WebGL renderer, and a request-animation-frame loop. The lobby and HUD remain ordinary accessible HTML/CSS above the canvas. Server snapshots update presentation objects; they do not transfer authority to the renderer.

### Construction

Construction creates lighting, terrain, flood tiles, objective markers, procedural buildings, the follow camera, and responder models. The current low-poly slice needs no downloaded character model because its geometry is authored in code. Later, load only approved assets with recorded licenses.

Loading an asset does not make it authoritative. A collision shape still comes from server/shared game data.

### Input and setup

The runtime setup:

- creates the camera, map objects, flood tiles, objective markers, and entity-view containers;
- register mouse/keyboard input handlers;
- connect snapshot/event callbacks to presentation code;
- configure resize behavior;

Avoid putting the match simulation here. Holding `W` should produce bounded movement intentions; it must not directly declare a new authoritative hero position.

### Render loop

The render loop runs once per displayed frame. It is useful for:

- interpolating between recent server snapshots;
- moving display objects toward their render positions;
- updating procedural character animation, targeting previews, and the follow camera;
- applying purely visual effects.

It is **not** the authoritative 20 Hz tick. Browser frame rate can vary, the tab can be throttled, and a player controls their own browser. Do not subtract real health, finish a cooldown, capture the Relay, or propagate water in `update`.

### Runtime cleanup

When the runtime stops or hot reloads, remove DOM/event listeners, socket callbacks, timers, animation frames, geometries, materials, and input subscriptions. Otherwise a rematch can send every command twice and WebGL resources can leak.

## How Colyseus rooms work

A Colyseus **Room** is the server-side container for one match. It runs in Node.js, not in either player’s browser. Both clients join a room named `signal_zero`; the room owns their shared authoritative world.

Typical lifecycle methods are:

### `onCreate`

Runs once when the room instance is created. It should initialize match state, register validated message handlers, and start/configure the fixed-step simulation. This is similar to setting up a board before players sit down.

### `onJoin`

Runs for each accepted client. It sanitizes the display name, associates the socket session with a server player, assigns a team, and sends a `welcome` message. The socket session—not a `playerId` typed by the browser—is the proof of who is sending later commands.

### Message handlers

Handlers receive `ready`, `command`, and `rematch` payloads. Network values are untrusted at runtime even if the client was compiled from this repository. A modified browser can send anything, so the handler parses and validates before it changes an intention or match state.

### `onDrop`, `onReconnect`, and `onLeave`

`onDrop` handles an unexpected transport loss: it marks the player disconnected, stops unsafe unattended orders, drops a carried core, and reserves the same seat for 20 seconds. The client retries within that window, including when the drop happens immediately after join. `onReconnect` restores connection state and sends fresh authoritative data. `onLeave` is the terminal cleanup path after a consented leave or expired recovery window. A full page refresh does not persist a reconnection token and may still create a new session.

### `onDispose`

Runs when the room ends permanently. Clear intervals, timers, external handles, and room-owned resources here. The garbage collector cannot fix a timer that is still registered globally.

The room can delegate work to small movement, combat, ability, objective, flood, and snapshot modules. “The room is authoritative” does not mean every system must be written in one giant class.

## What “server-authoritative” means

Imagine a tabletop game:

- Each player may say, “I want my piece to move there.”
- A neutral referee checks whether the route and rules allow it.
- The referee moves the official piece and announces the new state.
- Players can animate their own copy of the board, but cannot rewrite the referee’s board.

The server is that referee. A client is allowed to know an ability’s range so it can draw a useful preview, but only the server answers:

- Is the hero alive and owned by this connection?
- Is the target finite, in bounds, walkable, hostile, and in range?
- Has the command already been seen?
- Is the cooldown ready and is there enough energy?
- Did the attack interval finish?
- Who occupies the Relay?
- Where has water spread?
- Was the core deposited, and who won?

This boundary protects fairness and also prevents honest clients from disagreeing because their frame rates or message timings differ.

## How input becomes a command

Follow held `W` movement through the system:

### 1. Browser input

The Three.js runtime receives a physical-key event while focus is outside text inputs. It converts camera-relative movement into a normalized direction on the authoritative simulation plane.

### 2. Client intention

At a bounded interval, the client constructs a typed `STEER` intention with a new sequence number and direction. Releasing the key sends a zero direction. Neither request means the browser has moved the authoritative player.

Conceptually:

```ts
{
  type: "STEER",
  sequence: 42,
  direction: { x: 0.71, y: -0.71 }
}
```

The actual shared type is the source of truth; do not copy this example into a second protocol definition.

### 3. WebSocket message

The client sends the value inside the `command` message family to the Colyseus room. WebSockets keep one two-way connection open, unlike making a new HTTP request for each movement update.

### 4. Server validation

The room identifies the sender from the connection, parses the payload, checks the sequence, confirms that the match is playing and the owned hero is alive, rejects non-finite/out-of-bounds/blocked destinations, and finds an obstacle-aware path on the authoritative grid.

If any gate fails, the server returns a `command-result` rejection and makes no partial change.

### 5. Server simulation

If accepted, the server stores the movement order/path. Every 50 ms simulation step advances the hero only as far as its server-owned speed and current flood modifier allow. The client does not send intermediate positions.

### 6. Snapshot

Every two simulation ticks, the server sends a compact public `snapshot` with current important state. It includes authoritative positions and the tick/order information the client needs to ignore older snapshots.

### 7. Smooth rendering

Snapshots arrive about 100 ms apart, but monitors usually render much more often. The client draws between recent positions so a remote hero glides rather than jumping ten times per second. This is **interpolation**.

If the server disagrees with the immediate destination marker or visual estimate, the next result/snapshot wins. Cosmetic responsiveness is allowed; competing state is not.

## The five message families

Knowing the message direction makes debugging easier.

### Client → server

- `ready`: “I am ready for the match to start.”
- `command`: “I intend to move/attack/cast/interact/stop/hold.”
- `rematch`: “I am ready to reset after this finished match.”

### Server → client

- `welcome`: “This is your session player/team/bootstrap information.”
- `snapshot`: “This is the current public authoritative state.”
- `event`: “An accepted transient event happened; play appropriate feedback.”
- `command-result`: “Sequence N was accepted or rejected for this safe reason.”
- `notice`: “Connection/lobby/match information for the player.”

Do not use a `notice` string to drive game rules. Structured snapshots and result/event types are stable; human-readable wording can change.

## Pathfinding without the mystery

The arena is 24 × 14 tiles, and each tile represents 64 world pixels. Buildings are blocked cells. Streets are walkable cells. Flooded streets stay walkable at shallow levels but cost more.

A\* searches possible cells from the hero toward the goal. For each candidate, it tracks:

- `g`: cost already spent to reach this cell;
- `h`: estimated remaining cost to the goal;
- `f = g + h`: the score used to choose what to inspect next.

Floodwater increases `g`, so A\* can prefer a longer dry street over a short slow one. The heuristic must not exaggerate remaining cost, and equal scores need deterministic tie-breaking. Tests should cover obstacles, no route, start equals goal, map bounds, deterministic results, and a route changing when water cost changes.

The authoritative implementation is in `apps/server/src/simulation/infrastructure/pathfinding.ts`; flood progression is in `apps/server/src/simulation/infrastructure/flood.ts`. `packages/shared` supplies map/contracts/constants/validation, not a client-side copy of either simulation.

Route cost and walking speed are related but different:

- **Path cost** answers, “Which route should I choose?”
- **Speed modifier** answers, “How quickly do I move through this tile?”

Both are decided on the server.

## Flooding without fluid physics

The flood grid stores small discrete levels per tile. At a configured server interval:

1. read the current grid;
2. apply source pressure from the canal;
3. inspect neighbouring cells in a fixed order;
4. account for elevation/flood resistance and maximum level;
5. write results to a separate next grid;
6. replace the current grid all at once.

Using a separate grid matters. If the server updated cells in place from left to right, water could travel farther to the right just because of loop order. Double buffering makes the same starting state and ticks produce the same result.

Three.js colors/animates shallow and deep water instances after a snapshot, but never runs a competing propagation rule.

## How Rescue Line travels through the architecture

Rescue Line is a useful example because it touches almost every layer.

1. Client receives physical key `Q` and enters targeting state.
2. Client draws a 3D 360-unit targeting line/marker; no energy is spent yet.
3. `Escape` cancels locally, or clicking the ground sends a `CAST_ABILITY` point intention.
4. Server checks match/alive/owner, payload, range, 25 energy, six-second cooldown, and clear walkable trace.
5. Server requires the full line to remain walkable, detects hostile heroes crossed, applies the configured prototype damage (currently 30), moves Maya to the selected point, spends energy, starts cooldown, and grants two seconds of flood-slow immunity. A blocked trace is rejected without partial cost or movement.
6. `command-result`, `event`, and `snapshot` data make the client clear targeting and show the accepted movement/hit/cooldown—or explain a rejection.

Never implement a future ability only in Three.js. A legal ability has shared data/contract, server validation/execution, client input/presentation, and tests.

## Where to add a hero

Use this order so one side never invents a separate definition.

### 1. Shared definition

In `packages/shared`, add a stable hero ID and data such as health, energy, movement speed, attack values, and ability slots. Keep JSON-like balance data separate from engine behavior. Update public types only if the new hero exposes new public state.

### 2. Server behavior

In `apps/server`, make spawn/selection create authoritative state from that shared definition. Add only the focused systems the hero needs. The server must still validate team, owner, target, range, resource, cooldown, and match state.

### 3. Client presentation

In `apps/client`, map the hero ID to original visuals, labels, targeting adapters, and HUD presentation. Never branch on a sprite name to determine server damage.

### 4. Tests and documentation

Test defaults, validation, defeat/respawn, each ability, team interactions, and serialization. Update the GDD, decision log when rules are consequential, controls/onboarding, and AI/asset disclosure.

If adding a hero requires copying the same numeric definition into client and server, stop: the data is in the wrong place.

## Where to add an ability

Use the same four-layer path:

1. **Shared:** ability ID/slot, cast mode, range/target kind, cost, cooldown, and public definition.
2. **Server validator:** payload shape plus owner, alive/phase, target type/team, range/trace, cooldown, and resource checks.
3. **Server executor/system:** atomic authoritative effects and events. Rejecting must not partially spend or damage.
4. **Client:** targeting state, range/shape preview, send/cancel behavior, HUD cooldown, and accepted/rejected effects.
5. **Tests:** malformed target, just-inside/outside range, obstruction, insufficient resource, repeated sequence, cooldown replay, death during cast, and intended effect.

Normal cast is the polished current mode. Quick cast and quick cast on release should reuse the same command/validator; they change when the browser sends the intention, not who decides success.

## A safe first change

For a first contribution, change a cosmetic label or add a pure unit-test case before changing simulation timing. A good gameplay exercise is to add one A\* test for a flooded shortcut:

1. read the existing pathfinding tests and shared map helpers;
2. build a tiny test grid with a short expensive water route and a longer cheap dry route;
3. assert the chosen path/cost;
4. run `npm run test`, `npm run lint`, and `npm run typecheck`;
5. do not change Three.js presentation code to force the result.

This demonstrates shared logic and evidence without risking the trust boundary.

## Test with two browser windows

1. From the root, run `npm run dev`.
2. Open `http://localhost:5174` in Chrome or Edge.
3. Open a second normal or incognito window at the same address. Separate windows are easier to watch than two tabs because background tabs may be throttled.
4. Enter different player names and ready both clients.
5. Confirm each window’s team, selected hero, and connection indicator.
6. In one window, move and confirm the other hero does not obey that input.
7. Test camera-relative WASD routes, obstacle/flood-slow routes, stop, `X` attack-move, Q cast/cancel/cooldown, defeat/respawn, Relay capture/contest, earning-team core pickup/drop, delivery, victory, and rematch.
8. Watch both browser consoles plus the server terminal. Test at least one invalid action, such as casting beyond range or during cooldown, and confirm a safe rejection.
9. Repeat the complete loop without restarting the dev server to catch stale rematch state.

If both views look correct but the server terminal reports errors, the test did not pass.

## Test between macOS and Windows

Choose one computer as the host. Only the host needs to run the processes.

### On the host

1. Connect both computers to the same trusted network. Avoid guest Wi-Fi/device isolation.
2. From the repository root, run `npm install` once.
3. Find the host IPv4 address:

```sh
# macOS Wi-Fi (often en0)
ipconfig getifaddr en0
```

```powershell
# Windows: inspect the active adapter's IPv4 Address
ipconfig
```

4. Leave the copied example’s `VITE_SERVER_URL` commented so the page hostname is used automatically. If you previously set an override, replace `localhost` with the host IP or remove/comment out the override, then restart `npm run dev`.
5. Allow Node to receive traffic on the Private network. The relevant TCP ports are 5174 for the page and 2567 for the socket.
6. Open `http://localhost:5174` on the host.

### On the teammate computer

Open `http://HOST_IP:5174`, for example `http://192.168.1.42:5174`. Without an explicit override, the client derives `http://HOST_IP:2567` from the page hostname and the SDK opens the WebSocket automatically.

If the page works but the connection does not:

- inspect the browser console’s socket URL;
- check that the server is listening on `0.0.0.0:2567`;
- remove a stale `VITE_SERVER_URL` or set it to `http://HOST_IP:2567`, then restart Vite;
- check private-network firewall permission and VPN/device isolation;
- do not expose the development ports to the public internet.

Then repeat the two-window test with one player on each physical computer. Record OS, browser, Node/npm versions, and results.

## How to debug the right layer

### “My click does nothing”

Ask in order:

1. Did the Three.js canvas have keyboard focus, and was UI/targeting state blocking input?
2. Did the client log/send a command with a new sequence?
3. Did the room receive and parse it for the correct session?
4. Was it rejected? What safe `command-result` code returned?
5. If accepted, did the simulation install/advance the order?
6. Did a newer snapshot arrive?
7. Did the renderer map the authoritative entity ID to the correct display object?

Do not start by forcing the sprite to move. That can hide the actual broken layer.

### “The two windows disagree”

- Compare the latest server tick/snapshot ID in each client.
- Check for a stale/out-of-order snapshot being applied.
- Confirm the Three.js render loop is not modifying authoritative state.
- Confirm the flood/objective rule runs only on the server.
- Confirm rematch cleared client buffers and server world state.
- Check whether one browser tab was background-throttled; authority should remain correct even if presentation catches up.

### “A test passes but the game is wrong”

A pure test proves one module under controlled input. It does not prove socket wiring, coordinate conversion, scene cleanup, CSS layout, or multi-client behavior. Add an integration test or manual reproduction at the layer where the mismatch occurs; keep the useful pure test.

## Common terms

| Term               | Plain-language meaning                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| Authoritative      | The one source allowed to decide the official result                        |
| Client             | The browser program that gathers input and draws the game                   |
| Server             | The Node.js program that owns and advances the match                        |
| Room               | One Colyseus match container and its connected clients                      |
| WebSocket          | A persistent two-way browser/server connection                              |
| Command/intention  | A player’s requested action, before server approval                         |
| Entity ID          | A stable identifier for a hero/object; not a sprite reference               |
| Tick               | One fixed server simulation step (50 ms at 20 Hz)                           |
| Snapshot           | A periodic public description of authoritative state                        |
| Interpolation      | Drawing between known snapshots for smooth motion                           |
| Prediction         | Showing a provisional local response before authority confirms it           |
| Reconciliation     | Correcting presentation to match newer server truth                         |
| Deterministic      | Same initial state and inputs produce the same result                       |
| A\*                | A search algorithm that finds a low-cost path on the grid                   |
| Runtime validation | Checking actual network values; TypeScript alone cannot do this             |
| Public state       | State safe and necessary for clients to see                                 |
| Private state      | Server internals such as full paths/validator data that clients do not need |

## Before you say “done”

From the root, run:

```sh
npm run test
npm run lint
npm run typecheck
npm run build
```

For gameplay/networking, also run the two-client flow. Update documentation with what actually happened, not what the code appears intended to do. If a check was not run, write “pending” and explain why.
