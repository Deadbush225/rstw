# AI, Dependency, and Asset Disclosure Log

## Purpose and status

This log supports competition disclosure, originality review, and later license audits for **BAYANIHAN PROTOCOL: SIGNAL ZERO**. It is a development record, not legal advice and not a claim that the competition accepts any particular use of AI or open-source material.

**Current status:** initial record created and reconciled with the implemented repository/runtime pass; human review, final license audit, and competition-rule review remain pending.

Before any submission, a human team member must compare this file with:

- the full Git history and final source tree;
- `package.json` files and `package-lock.json`;
- every file under final asset/audio/font/video directories;
- design source files and exported media;
- the competition’s current official rules and disclosure form;
- retained invoices, permission emails, license texts, source URLs, and AI work records.

When uncertain, record more detail rather than less. “Pending human review” is truthful; an invented approval is not.

## Logging policy

Add an entry whenever AI materially helps create or transform source, tests, documentation, designs, art, animation, audio, music, voice, video, marketing copy, or submission material.

For each entry record:

1. date;
2. tool and model, only as specifically as provenance supports;
3. task performed;
4. affected files/assets;
5. extent of assistance;
6. human review actually performed;
7. material external sources or references;
8. resulting changes or rejection of the output.

Do not rewrite history to make assistance appear smaller. If a later human substantially rewrites an output, append that review outcome; keep the original entry.

## AI assistance log

### AI-001 — Initial vertical-slice engineering assistance

| Field                                  | Record                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                                   | 2026-07-16                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Tool and model                         | **OpenAI Codex / GPT-5**                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Task performed                         | Assisted with the initial TypeScript monorepo/scaffold, shared protocol planning, authoritative server/client vertical-slice implementation, automated-test drafting, project configuration, and technical documentation for the two-player prototype.                                                                                                                                                                                                                     |
| Affected files                         | Repository foundation/configuration; `apps/client/**`; `apps/server/**`; `packages/shared/**`; tests; `README.md`; `AGENTS.md`; and `docs/**`. Reconcile this category list against the final Git diff and replace it with exact paths if the competition form requires them.                                                                                                                                                                                              |
| Extent of assistance                   | Substantial AI-assisted first drafting/generation and engineering suggestions. Generated output requires normal human source review, playtesting, tuning, originality review, and revision; it is not independently certified or competition-approved.                                                                                                                                                                                                                     |
| Human review performed                 | **Pending.** No human approval is asserted by this entry. Record reviewer, date, checks, and resulting edits below after they actually occur.                                                                                                                                                                                                                                                                                                                              |
| External references supplied to the AI | The project brief and generic requirements for TypeScript, Vite, Node.js, Colyseus 0.17, WebSockets, Electron, Vitest, npm workspaces, ESLint, and Prettier; the initial Phaser direction; and later broad verbal references to _Flotsam_ for flooded low-poly mood, Roblox for third-person readability, and _Fall Guys_ / _Human: Fall Flat_ for a broad party-obstacle-course feel. No commercial-game source, code, model, texture, or asset was supplied for copying. |
| Verification                           | On 2026-07-16, installation, lint, formatting, strict type checks, 21 automated tests, production builds, measured 20/10 Hz cadence, early-drop reconnection, a real-SDK complete match, and a two-browser complete match/rematch passed on macOS. The Windows LAN pass remains pending.                                                                                                                                                                                   |

### AI-002 — Design, architecture, onboarding, and disclosure documentation

| Field                      | Record                                                                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                       | 2026-07-16                                                                                                                                                                                                                                                                              |
| Tool and model             | **OpenAI Codex / GPT-5**                                                                                                                                                                                                                                                                |
| Task performed             | Drafted the game vision/vertical-slice distinction, authoritative networking explanation, architecture decisions, milestone gates, Mac/Windows/npm/LAN instructions, Rescue Line rationale, beginner guide, originality restrictions, known limitations, and this disclosure structure. |
| Affected files             | `README.md`, `AGENTS.md`, `docs/GDD.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/BEGINNER_GUIDE.md`, `docs/AI_ASSET_DISCLOSURE.md`                                                                                                                        |
| Extent of assistance       | Primary AI-authored documentation draft based on the human-provided brief and agreed technical contracts. Technical claims were later reconciled with the implemented files and recorded runtime evidence.                                                                              |
| Human review performed     | **Pending.** The team must check factual alignment with final code, cultural wording, competition requirements, and actual test results.                                                                                                                                                |
| External references/assets | None embedded. Library names and common license identifiers in the dependency register must still be checked against the exact installed versions and their bundled license texts.                                                                                                      |

### AI-003 — Runtime QA and hardening pass

| Field                                  | Record                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date                                   | 2026-07-16                                                                                                                                                                                                                                                                                                                                                          |
| Tool and model                         | **OpenAI Codex / GPT-5**                                                                                                                                                                                                                                                                                                                                            |
| Task performed                         | Ran the command suite and two-client flows; visually inspected the 16:9 client; diagnosed and fixed a Colyseus timer-order defect; verified authoritative cadence, socket recovery, commands, combat, objective, flood, victory, and rematch; hardened reconnection, clock estimation, inbound payload schemas, transient UI cleanup, and negative objective tests. |
| Affected files                         | `apps/client/src/**`, `apps/server/src/**`, `packages/shared/src/**`, root configuration, `README.md`, and supporting `docs/**` evidence/status sections.                                                                                                                                                                                                           |
| Extent of assistance                   | Substantial AI-assisted diagnosis, test operation, code revision, and evidence recording.                                                                                                                                                                                                                                                                           |
| Human review performed                 | **Pending.** A human team member must review the fixes, reproduce the Mac/Windows LAN flow, and approve gameplay/cultural/originality decisions before submission.                                                                                                                                                                                                  |
| External references supplied to the AI | Official Colyseus 0.17 documentation and installed package type/runtime declarations were consulted for lifecycle and timer behavior; no third-party gameplay code or commercial-game assets were copied.                                                                                                                                                           |
| Verification                           | Root commands passed; npm reported zero known vulnerabilities; 21 tests passed; two browser clients completed victory/rematch with no captured console warnings/errors; early socket recovery returned to the same room; Windows LAN remains pending.                                                                                                               |

### Human review addendum template

Append one row per real review. Do not pre-fill it with an assumed pass.

| Date    | Reviewer | Entry/files reviewed | Review performed                                                    | Changes required/made | Result  |
| ------- | -------- | -------------------- | ------------------------------------------------------------------- | --------------------- | ------- |
| Pending | Pending  | AI-001 and AI-002    | Source, design, disclosure, and originality review not yet recorded | Pending               | Pending |

## AI-generated or AI-edited media register

No AI-generated raster art, vector art, texture, sprite, animation, sampled audio, music, voice, or video is intentionally recorded in the current vertical slice. The presentation is code-drawn geometry. Its optional sound cues and ambient tones are generated at runtime by original Web Audio oscillator code in `apps/client/src/audio/AudioDirector.ts`; they are not downloaded, sampled, or third-party audio assets. AI assistance to the source that draws and synthesizes those effects is disclosed under AI-001.

This “none recorded” statement must be rechecked against the final repository. If an image/audio generation or editing tool is used later, record:

| Asset ID      | Date | Tool/model | Prompt/task summary | Input/reference rights | Output files | Human edits | Intended use | Human approval      |
| ------------- | ---- | ---------- | ------------------- | ---------------------- | ------------ | ----------- | ------------ | ------------------- |
| None recorded | —    | —          | —                   | —                      | —            | —           | —            | Pending final audit |

Do not assume an AI tool grants rights to an uploaded reference image or to a recognizable character/style. Avoid prompts requesting a living artist’s imitation or another game’s protected characters, icons, map, UI, voice lines, or trade dress. Keep prompts/source references if the competition requires process evidence.

## External asset register

### Assets currently expected in the prototype

| Asset/material                                                                                         | Source/creator                                                               | License/rights basis                                                  | Modifications                      | Use                    | Evidence/status                                        |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- | ---------------------- | ------------------------------------------------------ |
| Arena streets, buildings/barriers, canal/water, Relay, Beacons, heroes, markers, rings, and HUD shapes | Generated at runtime by project source; AI coding assistance disclosed above | Original project implementation; no separate downloaded media license | Code-driven geometry/colors/labels | Prototype presentation | Human visual/originality review pending                |
| Text rendered with system/default browser fonts                                                        | End user’s operating system/browser; no font file distributed by the project | System font availability, not a redistributed font asset              | CSS/font fallback selection only   | Lobby/HUD/debug labels | Confirm final build does not bundle an unrecorded font |
| Production art, icons, animation, SFX, music, voice, video                                             | None recorded for initial slice                                              | Not applicable yet                                                    | —                                  | Future milestones      | Must be registered before addition                     |

### Required fields for every future external asset

For any downloaded, commissioned, purchased, recorded, or AI-assisted asset, add:

- exact filename(s) and asset ID;
- creator/rightsholder and source URL or contract;
- license name/version and a saved copy or proof of purchase/permission;
- whether commercial use, competition distribution, modification, and attribution are allowed;
- modifications performed;
- where and how it appears;
- required credit wording;
- human reviewer and review date.

“Free,” “royalty-free,” “found online,” and “temporary” are not licenses. Do not include an asset until its rights are clear.

## External library register

This table documents the intended purpose of direct, generic development/runtime libraries. **The exact final direct dependency list and license texts in the installed versions are authoritative; reconcile this table with every workspace manifest and `package-lock.json`.** Transitive dependencies also require notice/license handling appropriate to the final distribution.

| Library/tool                                            | Purpose in this project                                                             | Manifest version/range at initial log | Commonly published license | Runtime or development  | Audit status                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- | -------------------------- | ----------------------- | ----------------------------------------- |
| Three.js (`three`)                                      | Browser 3D rendering, procedural geometry, lighting, camera, and input presentation | `0.185.1`                             | MIT                        | Client runtime          | License text pending final package audit  |
| Three.js type definitions (`@types/three`)              | Strict TypeScript definitions for the client renderer                               | `0.185.1`                             | MIT                        | Development             | License text pending final package audit  |
| Colyseus client SDK (`@colyseus/sdk`)                   | Browser room join/message/WebSocket client                                          | `0.17.43`                             | MIT                        | Client runtime          | License text pending final audit          |
| Colyseus core (`@colyseus/core`)                        | Authoritative rooms, sessions, lifecycle, and server messaging                      | `0.17.44`                             | MIT                        | Server runtime          | License text pending final package audit  |
| Colyseus WebSocket transport (`@colyseus/ws-transport`) | Persistent WebSocket transport for the room server                                  | `0.17.13`                             | MIT                        | Server runtime          | License text pending final package audit  |
| Express (`express`)                                     | HTTP integration and health/root endpoints around Colyseus                          | `5.1.0`                               | MIT                        | Server runtime          | License text pending final package audit  |
| Zod (`zod`)                                             | Runtime-safe parsing of untrusted messages and shared schemas                       | `4.1.12`                              | MIT                        | Shared/network boundary | License text pending final package audit  |
| Vite (`vite`)                                           | Client development server and production bundling                                   | `7.3.6`                               | MIT                        | Development/build       | License text pending final audit          |
| TypeScript (`typescript`)                               | Strict static typing and compilation                                                | `5.9.3`                               | Apache-2.0                 | Development/build       | License text pending final package audit  |
| Vitest (`vitest`)                                       | Unit/integration test runner                                                        | `3.2.7`                               | MIT                        | Development/test        | License text pending final package audit  |
| ESLint (`eslint`, `@eslint/js`)                         | Static analysis and base JavaScript rules                                           | `9.39.1`                              | MIT                        | Development             | License texts pending final package audit |
| TypeScript ESLint (`typescript-eslint`)                 | TypeScript parsing and lint rules                                                   | `8.46.3`                              | MIT                        | Development             | License text pending final package audit  |
| Globals (`globals`)                                     | Standard environment global definitions for linting                                 | `16.5.0`                              | MIT                        | Development             | License text pending final package audit  |
| Prettier (`prettier`)                                   | Cross-platform source/document formatting                                           | `3.6.2`                               | MIT                        | Development             | License text pending final package audit  |
| Concurrently (`concurrently`)                           | Launch shared watcher, server, and client from one root `dev` command               | `9.2.4`                               | MIT                        | Development             | License text pending final package audit  |
| TSX (`tsx`)                                             | Execute/watch server TypeScript during development                                  | `4.20.6`                              | MIT                        | Development             | License text pending final package audit  |
| Node.js type definitions (`@types/node`)                | Type information for Node.js APIs                                                   | `24.10.1`                             | MIT                        | Development             | License text pending final package audit  |

If implementation adds CORS middleware, logging, an asset packer, deployment adapter, font, or any other direct dependency, add it here with its purpose. Avoid adding a dependency when a small, security-critical game-specific rule is clearer to own and test directly.

## External code and reference policy

The project may depend on general open-source libraries under their licenses. It must not copy proprietary or decompiled code, and it should not paste core gameplay implementations from tutorials or repositories.

Initial game-specific systems are intended to be original project implementations:

- movement-order handling and grid path rules;
- combat/chase/defeat/respawn rules;
- Rescue Line validation and effects;
- Weather Relay capture, restricted core spawn/pickup/drop, beacon deposit, and victory;
- deterministic flood propagation and its path/speed effects;
- arena layout and placeholder presentation.

If external example code materially influences a future implementation, record the source URL, author, license, files/sections influenced, amount copied versus independently rewritten, and retained attribution. A compatible license does not remove competition originality requirements.

## Originality checklist

Human reviewers must confirm before a release candidate:

- [ ] No copyrighted commercial-game characters, names, lore, map layouts, icons, art, audio, voice lines, item designs, or UI trade dress are present.
- [ ] Rescue Line’s visuals, rules, timing, naming, and presentation remain an original responder/flood interaction, not a close reproduction of a signature commercial ability.
- [ ] Maya, Tomas, Kidlat, and Amihan designs were developed from original briefs and appropriately researched references.
- [ ] Philippine cultural and disaster-risk-reduction themes received respectful human review.
- [ ] Every external asset has a source, license/permission, proof, modifications record, and required credit.
- [ ] Every direct dependency and distributed transitive license obligation has been reviewed.
- [ ] AI assistance and AI-generated/edited media are fully recorded under the competition’s current rules.
- [ ] Trailer, screenshots, and submission copy show the actual build and use only approved material.

Genre-standard WASD movement, an orbiting third-person camera, ability hotkeys, roles, team fights, obstacle courses, and objectives are control/design vocabulary. The project treats _Flotsam_ only as a broad flooded low-poly mood reference, Roblox only as a broad third-person readability reference, and _Fall Guys_ / _Human: Fall Flat_ only as broad genre references for playful, wobbly cooperative obstacle play; none authorizes copying their characters, assets, proportions, UI, maps, code, or protected expression.

## Required human sign-offs

| Review area                                     | Reviewer   | Date | Evidence                          | Status  |
| ----------------------------------------------- | ---------- | ---- | --------------------------------- | ------- |
| Source architecture and server-authority review | Unassigned | —    | Code review/check results         | Pending |
| Runtime, two-client, and Mac/Windows LAN QA     | Unassigned | —    | README checklist/QA log           | Pending |
| Game design/originality review                  | Unassigned | —    | GDD, comparison notes, playtest   | Pending |
| Cultural/context review                         | Unassigned | —    | Review notes                      | Pending |
| Dependency and transitive-license audit         | Unassigned | —    | Final lockfile/license report     | Pending |
| External asset and credits audit                | Unassigned | —    | Asset register/source archive     | Pending |
| AI disclosure and competition-rule review       | Unassigned | —    | Official rules/form plus this log | Pending |
| Final submission approval                       | Unassigned | —    | Release tag/build checklist       | Pending |

## Release reconciliation procedure

Before tagging a competition build:

1. Export a list of tracked files and compare it with both asset and AI affected-file records.
2. Enumerate direct dependencies from all workspace manifests and inspect the locked versions’ license files.
3. Generate any required third-party notices/credits and test that they ship or are submitted correctly.
4. Search final source/assets for temporary downloads, copied snippets, unapproved fonts, sample media, and vendor logos.
5. Confirm every AI entry has a truthful human-review outcome.
6. Review the organizer’s latest rules rather than relying on an earlier summary.
7. Keep an archive of source URLs, licenses, permissions, contracts, prompts/process records if required, and reviewer notes alongside the release evidence.
8. Update “Known limitations” and runtime results so the disclosure does not imply unverified behavior.

## Change log

| Date       | Change                                                                                          | Author/tool          | Human review |
| ---------- | ----------------------------------------------------------------------------------------------- | -------------------- | ------------ |
| 2026-07-16 | Created initial AI, dependency, asset, originality, and sign-off records for the vertical slice | OpenAI Codex / GPT-5 | Pending      |
