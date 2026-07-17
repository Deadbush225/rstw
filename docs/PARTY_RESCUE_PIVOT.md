# Bayanihan Rush: Party-Rescue Pivot

## Player promise

**Bayanihan Protocol: Signal Zero** becomes a short, physical third-person rescue race. Responders wobble, jump, dive, grab a relief crate, activate flood infrastructure, secure the Weather Relay, and carry the Resilience Core home while the district floods around them.

The tone is energetic and playful without making disaster victims or real tragedy into a joke. Comedy comes from responder movement, recoverable stumbles, improvised infrastructure, and friendly competition—not from harm to residents.

## Competition fit

- **Themes:** Smart City, Disaster Risk Reduction and Management, and Climate Change remain central to the rules rather than decorative lore.
- **Esports-ready:** one responder runs a 90-second scored PvE Flood Drill with a local leaderboard; two responders enter a short PvP rescue race with a clear winning Beacon.
- **Skill:** camera-relative movement, jump timing, dive recovery, physical crate routing, hazard reading, flood-route choice, Rescue Line execution, and objective timing create mastery.
- **Spectators:** chunky silhouettes, team shapes, objective beams, large obstacle motion, short rounds, visible Core carrying, and dramatic recoverable mistakes keep the match understandable.
- **Technology:** authoritative WebSocket multiplayer, deterministic flood propagation, server-owned party physics, and a procedural Three.js world remain demonstrable technical features.

## Implemented vertical-slice loop

1. **Deploy:** one player starts Flood Drill; two players start a versus race.
2. **Scramble:** steer directly with WASD, jump with Space, and dive with Shift.
3. **Bayanihan task:** grab and drag the relief crate onto the Barangay Pump plate to delay the flood and earn drill score.
4. **Obstacle run:** cross rotating storm barriers and recover from authoritative stumbles.
5. **Restore:** enter the Weather Relay zone and hold it long enough to spawn the Core.
6. **Recover:** interact with the Core and choose a flooded or safer return route.
7. **Finish:** reach the correct Bayanihan Beacon and deposit the Core. Solo time produces a score; in versus, the first legal deposit wins.

## Originality boundary

Commercial party-platform and physical-puzzle games are broad genre references only. Signal Zero must not reproduce another title's bean avatar, blank ragdoll, obstacle layout, color script, interface, sound, physics tuning, map, animation, name, or protected visual expression.

Our identity is:

- Filipino smart-city flood response rather than a television obstacle show or abstract dreamscape;
- a Maya responder silhouette with a smart rain canopy, rescue spool, signal backpack, and team circle/diamond language;
- a relief-crate-to-pump cooperative task tied directly to flood control;
- Relay, Resilience Core, and Bayanihan Beacon objective escalation;
- Bughaw/Gintong civic-response teams and original Barangay Maligaya architecture;
- deterministic server-owned flood pressure inside a playful physical race.

## Feel targets

- Steering begins immediately and stops cleanly; no A\* waypoint oscillation under held WASD.
- A jump has a readable launch, apex, and landing squash.
- A dive gives a useful burst but creates a punishable recovery window.
- Grab state and the crate's owner are obvious from both camera and HUD.
- Hazard hits knock the responder aside without causing long loss-of-control chains.
- The camera stays close enough to read Maya but pulls back enough around large hazards.
- Flood timing creates route decisions before the whole course becomes deep water.

## Human review before submission

- Playtest onboarding with students who have not seen the project.
- Review Filipino visual/cultural references for respect and specificity.
- Confirm every AI-assisted source and design decision is disclosed.
- Record original source files and prompts; retain dependency licenses.
- Capture trailer footage only from the final build and avoid comparative marketing using commercial game trademarks.
