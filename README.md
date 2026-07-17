# BAYANIHAN PROTOCOL: SIGNAL ZERO

> “Wobbly emergency responders jump, dive, haul relief equipment, and race through a flooding Philippine smart city to bring the Resilience Core home.”

**Signal Zero** is an original competitive 3D party-rescue game for desktop browsers and native desktop builds, being developed for the DOST-NCR Gear Up NCR Esports Game Dev Challenge 2026. It pairs familiar third-person controls with wobbly movement, jumps, rescue dives, physical crate handling, storm-barrier obstacles, and original Philippine smart-city objectives. The flood and all match-changing physical outcomes remain server-authoritative.

This repository contains a competition-demo vertical slice. After a short loading presentation, it opens on a response dashboard for mode setup, responder selection, instructions, local records, and settings. Players explicitly choose the scored 90-second **Solo Flood Drill** (PvE with a local top-three leaderboard) or the two-responder **Multiplayer Versus** mode (PvP), then deploy as Maya, Tomas, Kidlat, or Amihan. Both modes use the same authoritative simulation, two shared prototype abilities, capture-and-deliver objectives, flood-delay pump decision, and deterministic flooding.

## Verification status

**Verified on macOS on 2026-07-16.** Production builds, strict type checking, and 41 automated tests pass. The Electron desktop bundle builds as a signed macOS arm64 `.app`; its embedded authoritative server has passed a loopback health check. A real Windows build/run, code-signing notarization, a Mac-to-Windows LAN match, and a fresh full objective run using only WASD remain pending.

## Technology

- Three.js renders the low-poly 3D district, characters, flood, and third-person camera.
- TypeScript runs in strict mode across the monorepo.
- Vite serves and builds the browser client.
- Node.js and Colyseus 0.17 host the authoritative room over WebSockets.
- Electron packages the renderer and starts that same Node/Colyseus server privately for the native desktop build.
- npm workspaces keep the client, server, and shared contracts together.
- Vitest, ESLint, and Prettier provide automated checks.

The authoritative simulation runs at **20 Hz** and publishes public snapshots at **10 Hz**. The prototype arena is **24 × 14 tiles**, with each tile representing **64 pixels** (1536 × 896 world units).

Both modes use the fixed Colyseus room name `signal_zero`. The validated mode choice filters matchmaking within that room name: Solo players cannot consume Versus seats, and a one-player Versus queue never silently becomes a Solo match. There are no separate Solo and Multiplayer room names.

## Repository layout

```text
.
├── apps/
│   ├── client/       # Three.js rendering, third-person input, HUD, and interpolation
│   ├── desktop/      # Electron main/preload process and packaged renderer staging
│   └── server/       # Colyseus room and authoritative simulation
├── packages/
│   └── shared/       # Commands, snapshots, constants, and pure shared logic
├── docs/              # Design, architecture, roadmap, and learning material
├── AGENTS.md          # Rules for contributors and coding agents
└── package.json       # Workspace commands
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing a network contract, [docs/DASHBOARD_AND_MODES.md](docs/DASHBOARD_AND_MODES.md) for the front-end journey and competition modes, and [docs/BEGINNER_GUIDE.md](docs/BEGINNER_GUIDE.md) for a gentler tour.

## Prerequisites

- A 64-bit macOS or Windows development computer
- Git
- The Node.js version recorded in `.nvmrc`
- npm, which ships with Node.js
- Current desktop Chrome or Edge

Use the same Node version on both development computers. Confirm it from the repository root:

```sh
node --version
npm --version
```

No paid service or database is required for local or LAN play.

## macOS setup

1. Install Git and a Node version manager such as `nvm` if they are not already available.
2. Clone the repository and enter it.
3. From the repository root, run:

```sh
nvm install
nvm use
cp .env.example .env
npm install
npm run dev
```

If you do not use `nvm`, install the exact version shown in `.nvmrc` by another method. The environment file is for local, non-secret overrides; the default local setup does not require a WebSocket override.

## Windows setup

Use **PowerShell**, not a Unix-only shell, so the documented workflow also works for a teammate with a normal Windows setup.

1. Install Git and the Node version in `.nvmrc`. `nvm-windows` is optional but useful.
2. Clone the repository and enter it.
3. From the repository root, run:

```powershell
$nodeVersion = (Get-Content .nvmrc).Trim()
nvm install $nodeVersion
nvm use $nodeVersion
Copy-Item .env.example .env
npm install
npm run dev
```

If Node was installed directly, omit the three `nvm` lines after confirming `node --version`. When Windows asks whether Node may communicate through the firewall, allow it on **Private networks** only for LAN development.

## Install and run

All routine commands run from the repository root:

```sh
npm install
npm run dev
```

The default development endpoints are:

- Client: `http://localhost:5174`
- Colyseus server endpoint: `http://localhost:2567` (the SDK upgrades this HTTP(S) endpoint to a WebSocket connection)

The server listens on `0.0.0.0:2567` for local and LAN testing. The client config accepts an HTTP(S) Colyseus endpoint: unless `VITE_SERVER_URL` is set, it derives `http(s)://<the-page-host>:2567`, and the Colyseus SDK performs the WebSocket upgrade. Vite loads the root `.env` through its configured `envDir`; the server entrypoint automatically loads that same optional root file with Node’s built-in `loadEnvFile`. The server reads `SERVER_HOST`/`SERVER_PORT`, with standard `HOST`/`PORT` fallbacks.

The example leaves `VITE_SERVER_URL` commented so page-host derivation works for both one-computer and LAN development. Uncomment it only when you need an explicit server endpoint, then restart `npm run dev`. Never commit secrets to `.env`; variables prefixed with `VITE_` are bundled into client code and therefore are public.

## Development commands

| Command                    | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `npm run dev`              | Start the Vite client and Colyseus server together           |
| `npm run test`             | Run automated unit and integration tests                     |
| `npm run lint`             | Check source and documentation-adjacent configuration rules  |
| `npm run typecheck`        | Type-check every workspace in strict mode                    |
| `npm run build`            | Produce production builds for all applications               |
| `npm run format`           | Format supported source, config, and documentation files     |
| `npm run desktop:dev`      | Run the browser dev stack and native Electron shell together |
| `npm run desktop:package`  | Build a local native app folder for the current platform     |
| `npm run desktop:make:mac` | Create macOS ZIP distributables (run on macOS)               |
| `npm run desktop:make:win` | Create a Windows ZIP distributable (run/test on Windows)     |

Run the first five before merging a gameplay change. Keep `package-lock.json` committed; it is how macOS and Windows install the same dependency graph.

## Native desktop app

For a development build with hot reload, run:

```sh
npm run desktop:dev
```

For a self-contained app folder on the current platform, run:

```sh
npm run desktop:package
```

On this Apple-silicon Mac, the result is [Bayanihan Protocol Signal Zero.app](dist/mac-arm64/Bayanihan%20Protocol%20Signal%20Zero.app). It launches the bundled renderer and starts the authoritative server on `127.0.0.1:2567`, so Solo Flood Drill does not require a separate terminal or browser tab.

`npm run desktop:make:mac` and `npm run desktop:make:win` are configured to create release archives. Build and test the Windows archive on Windows before sharing it. A public release also needs a final icon, trusted macOS signing/notarization, and Windows code signing; do not claim those are complete merely because a development build opens locally.

## How to play the vertical slice

1. Open the client. The brief Signal Boot loading presentation finishes at the response dashboard; startup failures remain visible instead of being hidden behind it.
2. Use the dashboard to browse the four responders, read How to Play, review local Flood Drill records, or adjust sound, UI scale, reduced motion, and camera sensitivity.
3. Select **Play**, explicitly choose **Solo Flood Drill** or **Multiplayer Versus**, enter a short call sign, and select Maya, Tomas, Kidlat, or Amihan.
4. Deploy. Both choices matchmake through `signal_zero`, filtered by the selected mode. Solo admits one responder; Versus waits for two mode-compatible responders.
5. Mark yourself ready. Solo starts with its one player ready; Versus starts only after both connected players are ready.
6. Capture the central **Weather Relay**. Its progress is decided by the server.
7. The captured relay spawns one **Resilience Core** at the Relay, reserved for the team that earned it.
8. An earning-team player interacts to pick it up and carries it toward that team’s **Bayanihan Beacon**. Defeat or disconnection drops it at the carrier’s current position; it remains restricted to the earning team.
9. Interact with the correct Beacon to deposit the core. Solo records the score/time on the local leaderboard; Versus identifies the winning response team. Then choose rematch or return to the dashboard.

Water begins spreading from the canal after the match starts. Shallow floodwater raises path cost and slows ordinary movement. Both clients receive the same authoritative flood state.

The four selectable responders have different prototype statistics but currently share **Rescue Line** and **Bayanihan Pulse**. Responder-specific ability kits remain future work; the server owns the selected responder, statistics, ability validation, and outcomes.

### Controls

| Input               | Action                                                           |
| ------------------- | ---------------------------------------------------------------- |
| `WASD` / arrow keys | Directly steer the responder relative to the camera              |
| Mouse drag          | Orbit the follow camera                                          |
| Mouse wheel         | Adjust camera distance                                           |
| `Space`             | Jump over barriers and shallow obstacle sweeps                   |
| `Shift`             | Dive in the held movement direction; recovery leaves you exposed |
| Left click          | Grab/release the rescue crate or directly target a hostile       |
| `Q`                 | Aim/cast **Rescue Line** toward the responder's view direction   |
| `E`                 | Cast **Bayanihan Pulse** for four seconds of flood immunity      |
| `F`                 | Interact with the Core, Relay, or home Beacon when in range      |
| `X`                 | Attack-move ahead; clicking a hostile model directly targets it  |
| `Tab`               | Show the scoreboard while held                                   |
| `Escape`            | Cancel targeting or open the local menu                          |

Controls use physical key codes (`KeyboardEvent.code`) for consistent macOS and Windows layouts. Movement is sent as bounded intentions; the server still owns legal paths and final position.

### Rescue Line

Rescue Line originated as Maya’s original directional mobility skill and is shared by all four responder choices in this prototype. `Q` projects a target up to 360 world units in the responder’s view direction. After server validation, the selected responder surges along the clear route, damages hostile responders crossed (the prototype value is 30), and ignores flood slowdown for two seconds. A trace crossing an obstruction is rejected. It costs 25 energy and has a six-second cooldown. The server, not the 3D preview, decides the legal endpoint, crossed enemies, energy cost, and cooldown.

### Flood Drill and Bayanihan Pulse

Choosing Solo Flood Drill explicitly starts the one-player PvE ruleset after that responder readies; Solo is never inferred merely because only one player is present. The drill lasts 90 seconds. Grab the **rescue crate** and haul it onto the gold **Barangay Pump** pressure zone for +400 points and an eight-second flood delay, dodge the storm barriers, capture the central Relay, collect the Core, and deliver it to the blue Beacon. Each browser retains a local top-three board for repeated runs. `E` casts **Bayanihan Pulse**, an original self-support tool shared by the four responders that costs 20 energy and grants four seconds of flood-slow immunity. High scores require choosing when the crate detour is worth its time.

## Test with two browser windows

1. Run `npm run dev`.
2. Open `http://localhost:5174` in two separate browser windows. An incognito window is useful because it provides an obviously separate client session.
3. In both dashboards, select **Multiplayer Versus**, give the clients different call signs, choose responders, and deploy.
4. Confirm both clients matchmake through `signal_zero`, then ready both players.
5. Confirm each window can move only its own responder.
6. Exercise movement around buildings, attacks, Rescue Line, defeat/respawn, relay capture, core delivery, flood spread, victory, and rematch.
7. Keep the browser developer console and the server terminal visible. A visual effect alone is not proof that the server accepted a command; check rejected-command feedback as well.

Brief transport drops automatically reclaim the same room seat within the server’s 20-second grace window. A full page refresh does not persist a reconnection token and may create a new session; that remains a prototype limitation.

## Test between a Mac and a Windows computer

The simplest setup makes one computer the host for both the client and the server.

1. Put both computers on the same trusted home/lab network. Guest Wi-Fi often blocks devices from seeing each other.
2. On the host, run `npm install` once.
3. Find the host’s LAN IPv4 address:
   - macOS Wi-Fi: `ipconfig getifaddr en0`
   - Windows PowerShell: `ipconfig` and locate the active adapter’s `IPv4 Address`
4. Leave the example’s `VITE_SERVER_URL` commented so the teammate’s page automatically targets the host IP. If you previously set an override, remove it or change it to `http://HOST_IP:2567`, then restart `npm run dev`.
5. On the host itself, open `http://localhost:5174`.
6. On the other computer, open `http://HOST_IP:5174`, replacing `HOST_IP`, for example `http://192.168.1.42:5174`.
7. Allow inbound TCP ports **5174** and **2567** on the host’s private-network firewall if prompted. Do not expose these development ports directly to the public internet.
8. Select Multiplayer Versus on both computers, deploy, ready one player on each computer, and repeat the gameplay checks from the two-window test.

The page-host-derived Colyseus endpoint should become `http://HOST_IP:2567` automatically, and the SDK opens the WebSocket connection. If the page loads but multiplayer does not connect, remove a stale `VITE_SERVER_URL` override or set it explicitly to that HTTP endpoint, restart `npm run dev`, and reload both pages.

## Troubleshooting

### The second computer cannot open the page

- Confirm both devices are on the same non-guest network and can reach the host IP.
- Confirm Vite reports a network URL and is listening beyond `localhost`.
- On Windows, set the network profile to Private and allow Node on Private networks.
- Temporarily disconnect VPN software that isolates local traffic.
- Check that ports 5174 and 2567 are not blocked. Do not disable the entire firewall as a first step.

### The page opens, but connection stays offline

- Open the browser developer console and inspect the attempted endpoint/socket URL.
- Client configuration should use `http://<host>:2567` for local development; the Colyseus SDK upgrades it to `ws://<host>:2567` on the wire.
- Confirm the server terminal says it is listening on port 2567.
- Check `.env` for an outdated `VITE_SERVER_URL`; restart Vite after changing environment variables.
- A secure deployment uses an `https://` Colyseus endpoint, which upgrades to `wss://`; the default LAN workflow intentionally uses plain local HTTP/WS.

### Port 5174 or 2567 is already in use

Stop the earlier development process cleanly. To identify listeners:

```sh
# macOS
lsof -nP -iTCP:5174 -sTCP:LISTEN
lsof -nP -iTCP:2567 -sTCP:LISTEN
```

```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 5174,2567 -State Listen
```

Avoid silently changing only one port: the browser and server connection settings must agree.

### WASD does not move the selected responder

Click once inside the 3D arena so the game has keyboard focus, close the local menu with `Escape`, and confirm the match phase is **ACTIVE**. Inputs are intentionally ignored while typing in the name field or before the authoritative match starts.

### Installs differ between macOS and Windows

- Confirm both machines use the `.nvmrc` Node version.
- Pull the same committed `package-lock.json`.
- Run `npm install` from the repository root, not inside an individual workspace.
- Do not “fix” one machine by hand-editing installed files under `node_modules`.

## Verification checklist

Update this list only with commands and manual checks that were actually performed:

- [x] `npm install`
- [x] `npm run test` (41 automated tests)
- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `npm run dev` starts both processes without runtime errors
- [x] Complete capture → carry → deposit → victory → rematch loop; post-conversion 3D clients also pass join/team/ready/active
- [ ] A Mac and Windows client complete a LAN match
- [x] Malformed, duplicate, unauthorized, cooldown, and out-of-range commands are rejected in tests/runtime feedback

## Known limitations

This section is intentionally candid and reflects the completed local runtime pass:

- The slice supports two players, one per team; the competition target is 2v2.
- Four responders are selectable with authoritative prototype statistics, but all currently share Rescue Line and Bayanihan Pulse. Responder-specific ability kits and additional equipment remain placeholders.
- The prototype ends after one Resilience Core; the planned full match requires a richer three-objective/three-core economy.
- The arena and character use original procedural low-poly geometry rather than a production asset pipeline; camera collision, a rigged production model, and broader accessibility polish remain future work.
- Flooding is a deterministic discrete grid simulation, not realistic fluid physics. The Barangay Pump delays propagation, but redirected flow, debris, barriers, and electrical interactions are future work.
- Compact 10 Hz snapshots are appropriate for this tiny slice but will need profiling, interest management, and possibly deltas as entity count grows.
- Brief socket-drop recovery is verified, but page-refresh token persistence, replacement players after an active-match abandonment, host migration, accounts, persistence, spectators, bots, and production deployment are outside this milestone.
- The Three.js production client remains a single substantial JavaScript chunk; code splitting and loading optimization are future work.
- The visual flow was verified in the Codex in-app Chromium browser on macOS. A real Windows/Edge LAN pass, Safari, and mobile/touch controls remain unverified.
- The native desktop shell has a macOS arm64 build and local-server health check, but its Windows archive, installer UX, app icon, notarization, and code-signing workflow need release-owner verification.
- LAN development traffic is unencrypted; public hosting needs HTTPS/WSS on a persistent WebSocket-capable service.
- Placeholder tuning values are not final competitive balance.

## Originality and licensing

The project may use a genre-standard control language, but it must not copy another game’s characters, map, audiovisual assets, item designs, lore, terminology, voice lines, or proprietary code. Game-specific movement, combat, objectives, Rescue Line, and flood rules are written for Signal Zero. The current presentation uses code-drawn geometric placeholders rather than borrowed assets.

Generic open-source libraries are used under their own licenses and are recorded in [docs/AI_ASSET_DISCLOSURE.md](docs/AI_ASSET_DISCLOSURE.md). Before competition submission, the team must review the official competition rules, every dependency license, every external asset license, and the AI disclosure log.

## Further reading

- [Game design](docs/GDD.md)
- [Dashboard, modes, and responder roster](docs/DASHBOARD_AND_MODES.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Beginner guide](docs/BEGINNER_GUIDE.md)
- [AI, dependency, and asset disclosure](docs/AI_ASSET_DISCLOSURE.md)
