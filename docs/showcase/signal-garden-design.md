# AI Roblox Studio Lab — Showcase Experience: Signal Garden

## Player promise

Explore a bioluminescent marsh with a partner, discover a resonance route, and bring dormant habitats back to life. Players should feel like field researchers whose choices physically change the world.

## Session loop

1. Enter the lantern dock and read a short route clue.
2. Search for fragments in distinct marsh landmarks while managing safe traversal.
3. Carry fragments to a relay node and choose one of two live routes.
4. Complete the circuit by coordinating two spatial switches.
5. Watch the habitat respond, collect a field record, and choose a more difficult route variation for the next run.

## Authority and network contract

The server owns fragment availability, inventory count, relay activation, route choice, completion, and rewards. The client sends requests with an instance and intent only. The server validates type, tag, ancestry, distance, ownership, route state, and rate before mutating state. The client presents prompts, HUD state, lighting feedback, and audio only.

## Slice scope

- One dock, one traversable marsh circuit, two landmarks, one two-player relay puzzle, and two route variants.
- A single reliable objective and one short replay loop; no MMO, trading, persistent economy, or paid content.
- Assets must be original or have clear licenses, with scale, collision, LOD, and mobile budgets recorded.
- Visual direction uses layered reeds, reflective water, soft volumetric color, readable beacon silhouettes, and restrained luminous accents. Primitive geometry is acceptable only as labeled graybox during validation.

## Test plan

- Solo and two-client Studio runs; disconnect/rejoin; respawn during a route; repeat remote requests; invalid instance, far-away target, wrong phase, and unauthorized route change.
- Mobile readability at a narrow resolution and touch interaction reach.
- Console error scan, capture before/after of the route response, and profile representative rendering/physics/network costs.
- No Studio outcome is recorded until it is executed and saved in `evidence/` with place and instance identity.

## Current traversal repair status

The central archive platform spans X=-22 through X=22. MossSwitchA is centered at X=-27 and BloomSwitchB at X=27. `WorldBuilder` adds a 14×2×14 collidable support pad under each outer plate, coplanar with the hub top at Y=9 and overlapping the hub by two studs. The two inner plates remain on the hub. A live single-player Play run in the generated local build verified traversal to both outer supports, normal prompt interaction, successful Moss and Bloom restorations, timeout recovery to route choice, and the post-restoration reset. The player reached each outer plate area with 100 health. Full evidence, place identity, and screenshots are recorded in `evidence/studio/signal-garden-p0-run.json`. Two-client coordination, touch/controller arrival, device performance, and final-art acceptance remain unverified.
