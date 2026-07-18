# Signal Zero: Memory Bank & Game State

## 1. The Environmental Progression
- **Total Match Time:** 8 minutes. No visible numerical timer; progression is tied to the environment.
- **Phase 1: The Calm (0:00 – 0:30):** Movement 100%. Overcast sky, light rain. Villagers walk normally. Players gather Sandbags.
- **Phase 2: The Swell (0:30 – 2:00):** Water Level 1 (shallow flood). 20% speed penalty off sidewalks. Villagers pop umbrellas, jog. Skirmishes at Master Pumps.
- **Phase 3: The Deluge (2:00 – 8:00):** Water Level 2 and 3 (deep flood). 50%+ speed penalty. Villagers retreat to roofs or get stranded.
- **Win Condition:** Highest "Resilience Score" at 8:00.

## 2. Infrastructure & Map
- **Hospital & Evacuation Center:** Critical buildings. If water reaches them, score bleeds out. Evac Center is the drop-off for Villagers and Boats.
- **Sandbags:** Spawn in a massive pile at the team base. Can carry multiple. Snap together to form a wall that blocks water (isBlocked = true).
- **Diesel Generators & Pumps:** Generators are carried slowly. Plugging into a Pump drains water (-1 level/tick) in a radius. Directional Pumps shoot water into the enemy barangay.

## 3. Villager AI Lifecycle
- **State 1: The Calm (Wandering):** Idle or walking slowly on dry sidewalks.
- **State 2: The Panic (Rush Home):** Triggers at 0:30. Random house target. Speed drops in water.
- **State 3: The Stranded (Static):** Triggers at 2:00. On Roof (safe, waving cloth) or In Water (clinging to debris, high priority).
- **Model Asset:** Must be rendered as humanoid people models with animations, NOT abstract cubes.

## 4. Rescue Mechanics (Level 2+ Water)
- **Swimming:** -70% speed. Stamina drains continuously. 0 stamina = drop items, respawn at Evac.
- **Rescue Boats:** Moored at Evac Center. Holds 3 villagers.
- **Boat Weight Physics:** Empty (100% speed), 1 Villager (85%), 2 Villagers (70%), 3 Villagers (50% - sluggish).