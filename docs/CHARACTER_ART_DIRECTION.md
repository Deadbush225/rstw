# Maya Character Art Direction

## Visual promise

Maya is a near-future barangay flood responder: prepared, approachable, and immediately readable at third-person camera distance. Her broad shoulders, oversized gloves and boots, compact limbs, and large expressive face create a playful party-rescue silhouette while keeping recognizably human proportions. She is neither a bean mascot nor a loose-limbed ragdoll. Her short storm coat, Rescue Line spool, and modular signal backpack remain practical response gear rather than military armor.

The eight-panel **weather canopy** above her rain hood takes structural inspiration from the broad, rain-shedding geometry of a salakot without reproducing a literal traditional costume. Its function and construction are fictional smart-city response equipment. Team identity appears on the canopy edge, chest badge, backpack battery, and selection marker:

- Bughaw Response uses blue light and a circle.
- Gintong Response uses amber light and a diamond.

The Resilience Core locks into a magnetic backpack cradle, where its cyan octahedron and orbit ring remain visible from behind. The result supports the objective loop visually: a player should be able to see who has the Core without reading the HUD.

## Motion language

Maya moves with practiced enthusiasm rather than perfect athleticism. A run has broad opposing arm swings, a step bounce, canopy wobble, and a small turn lean. Her long idle loop includes breathing, a curious head turn, and a friendly wave. Party-rescue actions exaggerate the pose enough to read through rain and crowding:

- takeoff squashes the body before an airborne stretch, and landing compresses once before settling;
- a dive becomes a compact forward body line with both gloves extended;
- grabbing reaches both gloves toward the rescue prop while the backpack keeps the responder silhouette grounded;
- a barrier impact produces asymmetric arm flailing and a quick wobbling knockdown, followed by an eased recovery;
- Core and flood-immunity states pulse on their equipment rather than changing gameplay state locally.

These animations are intentionally authored as responsive transforms, not simulated ragdoll physics. That keeps Maya controllable, legible, and distinct from existing physics-comedy characters.

## Production constraints

- The prototype is built entirely from original procedural Three.js geometry and code-authored materials.
- It contains no downloaded models, textures, animation clips, logos, or copied character elements.
- Geometry remains deliberately low-poly so multiple responders can render on ordinary school laptops.
- Idle, walk, jump, dive, stumble/recovery, grab, selection, Core, and flood-immunity animation hooks are presentation only. They never decide authoritative gameplay outcomes.
- Future production art should preserve the circle/diamond redundancy for color-vision accessibility and maintain a clear backpack/Core silhouette from the gameplay camera.
