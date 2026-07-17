# Contributor and Coding-Agent Rules

This file is the operating contract for anyone changing **BAYANIHAN PROTOCOL: SIGNAL ZERO**. Preserve the project’s server-authoritative design, beginner-maintainable structure, and originality. Read the relevant design document before editing a system.

## Non-negotiable architecture

1. **The server owns gameplay truth.** The client sends intentions, never outcomes.
2. **Shared contracts have one source.** Network types, constants, hero/ability data, map dimensions, and snapshot shapes belong in `packages/shared`; do not re-declare them in an app.
3. **Rendering is not simulation.** Phaser may preview, interpolate, and animate, but it may not decide movement, damage, cooldown success, objective ownership, flood state, resources, respawn, or victory.
4. **Untrusted payloads are validated.** A TypeScript type does not validate bytes received over a socket. Check shape, bounds, ownership, phase, sequence, rate, range, cooldown, energy, and target legality on the server.
5. **Keep the slice understandable.** Prefer small pure functions and focused systems over a god room class, premature ECS framework, service mesh, or database.

The fixed authoritative simulation rate is **20 Hz**. Public snapshots are emitted at **10 Hz**. The arena contract is **24 × 14 tiles at 64 pixels per tile**. Changing any of these requires updating shared constants, tests, architecture notes, and performance assumptions together.

## Folder responsibilities

| Path              | Owns                                                                                                                              | Must not own                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/client`     | Phaser scenes, canvas controls, targeting previews, camera, HUD, connection presentation, snapshot interpolation                  | Final positions, damage, captures, cooldown decisions, flood propagation, victory                                 |
| `apps/server`     | Colyseus room lifecycle, command validation, fixed-step simulation, paths, combat, abilities, objectives, flood, respawn, rematch | Phaser objects, DOM, browser APIs, client-only visual state                                                       |
| `packages/shared` | Serialisable contracts, constants, IDs, ability/hero/map data, geometry helpers, and safe parsers                                 | Node- or browser-only side effects, secret configuration, live room instances, authoritative A\*/flood simulation |
| `docs`            | Design intent, architecture, decisions, roadmap, onboarding, disclosure records                                                   | Claims that were not verified                                                                                     |

Apps may import from `packages/shared`. The shared package must not import from either app, and one app must not reach into the other app’s source.

## Network contract

The Colyseus room name is `signal_zero`.

Client-to-server message families are:

- `command` for `MOVE`, `ATTACK_TARGET`, `ATTACK_MOVE`, `CAST_ABILITY`, `INTERACT`, `STOP`, and `HOLD_POSITION` intentions
- `ready` for lobby readiness
- `rematch` for a post-match rematch vote/readiness signal

Server-to-client message families are:

- `welcome` for player/team/session identity
- `snapshot` for public authoritative state
- `event` for transient accepted gameplay events
- `command-result` for acknowledgement or a safe rejection reason
- `notice` for connection, lobby, and match information

Each gameplay command must carry a type, monotonically increasing sequence number, and the minimum target data required for that command. Never trust a client-supplied player ID over the sending Colyseus session. Repeated, stale, malformed, impossible, unauthorized, out-of-range, or phase-inappropriate commands must fail safely and must not partially mutate state.

Never accept client claims such as:

- “my position is now X/Y”
- “I dealt 30 damage”
- “my cast hit”
- “I captured or deposited the core”
- “my team won”

The server derives those facts during its fixed-step simulation.

## Simulation and synchronization rules

- Advance gameplay from a fixed 50 ms step, not the client frame rate.
- Publish snapshots every two simulation steps (10 Hz), while clients may render at display refresh rate.
- Keep compact public state separate from private server internals. Do not send hidden or unnecessary state merely because it is convenient.
- Use stable entity IDs and deterministic iteration/tie-breaking where results affect play.
- Treat the 24 × 14 collision/flood grid as authoritative. World coordinates must be checked against bounds and walkability.
- A\* owns route choice. Flood depth increases traversal cost; impassable tiles remain impassable. Do not let visual water alone slow or redirect a hero.
- Keep the authoritative A\* and flood implementations under `apps/server/src/simulation`; shared owns their map/contracts/constants, not a second simulation.
- Client interpolation may smooth snapshot positions but must converge to server state and must not generate authoritative hits or captures.
- Timeouts, cooldowns, attack intervals, respawns, capture progress, and flood steps use server simulation time.
- No database is required for live match state. Do not place authoritative real-time state in Firebase or a similar external store.

## Rescue Line contract

Rescue Line is an original Maya prototype ability, not a recreation of another game’s hook or dash.

- Normal cast: press `Q`, preview, then left-click a point up to 360 pixels away.
- Server validation: match phase, living ownership, payload shape, finite coordinates, range, energy, cooldown, and a clear walkable trace.
- Server execution: move Maya only to the furthest safe point on the trace, apply the configured prototype damage (currently 30) to hostile heroes crossed, grant two seconds of flood-slow immunity, spend 25 energy, and start the six-second cooldown.
- Client responsibility: display range/line previews and accepted/rejected feedback. A preview is never proof that the cast succeeds.

If its numbers change, update shared ability data and tests rather than scattering literals through server and client code.

## TypeScript and code conventions

- Keep TypeScript `strict` enabled. Do not bypass failures with looser compiler flags.
- Avoid `any`. When an unsafe external boundary requires it, isolate it, validate immediately, and document why.
- Prefer discriminated unions, exhaustive switches, readonly data, and explicit public snapshot types.
- Use accessible full names. A short conventional `x`, `y`, or `dt` is fine locally; opaque system-wide abbreviations are not.
- Keep data separate from behavior: hero and ability numbers belong in definitions, while systems execute them.
- Write comments for constraints and reasoning, not line-by-line narration.
- Avoid circular dependencies and module-level mutable singletons.
- Use `KeyboardEvent.code` or Phaser’s physical-key equivalent for cross-platform controls.
- Suppress the browser context menu only on the game canvas.
- Keep formatting cross-platform; do not rely on case-insensitive paths or Unix-only scripts.
- Never commit `.env`, credentials, generated secrets, or machine-specific paths. Remember that `VITE_*` variables are public browser configuration.
- Keep the root environment contract aligned: Vite reads it via `envDir`, the server entrypoint automatically loads the optional root `.env` with Node’s built-in `loadEnvFile`, and server configuration prefers `SERVER_HOST`/`SERVER_PORT` with `HOST`/`PORT` fallbacks. Colyseus client configuration uses an HTTP(S) endpoint; the SDK performs the WS(S) upgrade.

## Testing expectations

Every behavior change needs tests proportional to its risk.

At minimum, maintain automated coverage for:

- A\* reachability, obstacle avoidance, out-of-bounds rejection, unreachable goals, deterministic tie-breaking, and higher flood path costs
- Flood propagation determinism, maximum level, resistance/elevation rules, and movement-cost thresholds
- Command payload validation, ownership, sequence replay rejection, phase checks, range checks, cooldowns, and energy costs
- Combat targeting, interval timing, target invalidation, defeat, and timed respawn
- Rescue Line safe endpoint, obstruction, crossed-enemy selection, cooldown, energy, damage, and flood-slow immunity
- Relay capture/contest, team-restricted core spawn/pickup/drop, beacon deposit, victory, and rematch reset
- Serialization of every public snapshot and message contract

Before calling work complete, run from the repository root:

```sh
npm run test
npm run lint
npm run typecheck
npm run build
```

For networking or rendering changes, also run `npm run dev`, test two independent browser clients, inspect both browser consoles and the server terminal, and record what was actually checked. A passing unit test does not replace the end-to-end match loop.

## Safe change workflow

1. Identify which shared contract or design rule the feature touches.
2. Update or add shared data/types first when a contract changes.
3. Add server validation and authoritative behavior.
4. Add client input/presentation without duplicating authority.
5. Add deterministic/security-sensitive tests.
6. Run the full check suite and a two-client manual test where relevant.
7. Update `README.md`, architecture/decision docs, known limitations, and `docs/AI_ASSET_DISCLOSURE.md` as appropriate.

Do not hide a failing feature with a client-only animation, disable a lint rule broadly, or claim runtime success without running it. If a check cannot be run, state exactly why and leave its status pending.

## Originality and licensing

Genre-standard inputs such as right-click movement and QWER abilities are allowed design language, not permission to copy content. Do not copy or closely reproduce another game’s:

- characters, silhouettes, ability kits, item designs, names, lore, maps, icons, artwork, audio, voice lines, UI trade dress, or terminology
- proprietary source, decompiled behavior, or tutorial/repository implementation of core game systems

Write Signal Zero’s game-specific movement, combat, objective, ability, map, and flood rules for this project. Use original geometric placeholders until licensed production assets are approved. Record every external library and asset, its source, author if applicable, license, modifications, and proof of license in `docs/AI_ASSET_DISCLOSURE.md`.

AI assistance must also be logged there. Use the truthful generic identification **OpenAI Codex / GPT-5** unless stronger provenance is known; do not invent a more specific model name. Human review is required before competition submission, and “pending” is preferable to a false claim.

## Documentation integrity

- Keep the Game Design Document aspirational scope clearly separate from implemented vertical-slice scope.
- Add an entry to `docs/DECISIONS.md` for a choice that meaningfully constrains future architecture or design.
- Move roadmap status only after its exit criteria are verified.
- Keep `README.md`’s **Known limitations** and verification checklist current.
- Serious legality, scope, privacy, security, or competition-eligibility questions must be raised to the human team rather than silently assumed.
