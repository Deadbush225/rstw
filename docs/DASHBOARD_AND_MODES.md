# Dashboard, modes, and responder roster

## Player journey

The native and browser builds use the same original front-end journey:

1. **Signal boot** - a brief, skippable loading presentation confirms renderer, interface, and connection readiness. It must not conceal a failed startup.
2. **Response dashboard** - the player can review the current operation, responder roster, instructions, local records, and accessibility/settings before joining a room.
3. **Play setup** - the player explicitly chooses Solo Flood Drill or Multiplayer Versus, enters a display name, and selects one of four responders.
4. **Ready room** - both choices matchmake through the fixed `signal_zero` room name, filtered by the selected mode. The server assigns a response team and exposes authoritative readiness. Solo requires one ready player; Versus requires two.
5. **Match** - the normal Relay -> Core -> Beacon rescue loop runs with flood, pump, crate, storm barriers, movement, abilities, and server-owned outcomes.
6. **Results** - Solo records score/time in the local top-three board. Versus names the winning response team. Rematch or return-to-dashboard actions are clear.

The dashboard uses the broad information architecture of a competitive game client - persistent navigation, a prominent Play action, mode cards, roster browsing, and settings - but does not copy another game's art, assets, composition, wording, icons, colors, or trade dress.

## Competition modes

### Solo Flood Drill

- **Rules category:** PvE with leaderboard.
- **Players:** one.
- **Duration:** 90 seconds.
- **Goal:** earn the highest score while completing as much of the response route as possible.
- **Scoring:** pump/crate intervention, Relay capture, Core recovery, and Beacon delivery award visible points. Time resolves ties on the local top-three board.
- **Skill expression:** movement route, jump/dive timing, storm-barrier avoidance, crate detour choice, and ability timing.
- **End state:** Beacon success or time expiration produces a final score and replay/rematch option.

### Multiplayer Versus

- **Rules category:** PvP, one responder per team in the current prototype.
- **Players:** two; both must be connected and ready.
- **Goal:** secure the Relay, recover the team-restricted Resilience Core, and deliver it to the correct Bayanihan Beacon first.
- **Skill expression:** route choice, direct steering, jump/dive timing, combat pressure, capture control, flood adaptation, and ability timing.
- **End state:** the first valid authoritative Beacon deposit identifies the winning team.

Solo and Versus use the single fixed Colyseus room name `signal_zero`. The selected mode is validated and used as a matchmaking filter, so a Solo player cannot consume a Versus seat and a Versus match cannot silently downgrade to Solo. Do not introduce separate Solo and Multiplayer room names.

## Original responder roster

- **Maya - Rescue Scout:** balanced route control and approachable baseline statistics.
- **Tomas - Flood Engineer:** higher durability and steadier equipment handling at lower movement speed.
- **Kidlat - Rapid Courier:** fastest movement and strong repositioning with lower durability.
- **Amihan - Field Medic:** deeper energy reserves and support-oriented resilience with moderate movement.

All four responders are selectable in both modes. The current vertical slice shares the implemented Rescue Line and Bayanihan Pulse prototype abilities across the roster while the server applies each responder's authoritative statistics. Responder-specific abilities must not be advertised until their server-authoritative behavior, balance, UI, tests, and accessibility cues are implemented together. Character silhouettes, equipment, proportions, and color accents remain original procedural art.

## Dashboard settings

- Sound on/off and master volume preference.
- UI scale: compact, default, or large.
- Reduced motion override in addition to the operating-system preference.
- Camera sensitivity.

Settings are local presentation preferences. They may not change authoritative movement speed, collision, combat, cooldowns, score, flood behavior, or match outcome.

## Competition alignment

The official mechanics allow both PvP and PvE with leaderboards and require short skill- or knowledge-based matches with a clear winner. The dashboard improves the scored requirement that multiple modes be easy to navigate. Mode cards state player count, duration, objective, and win condition before deployment; the How to Play view repeats controls and the Relay -> Core -> Beacon loop. The roster and dashboard reinforce Smart City, disaster-risk-reduction, climate resilience, Filipino setting, spectator readability, and public presentation without borrowing protected commercial-game expression.
