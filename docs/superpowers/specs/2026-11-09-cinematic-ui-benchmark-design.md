# Cinematic UI Benchmark Design

## Status

Approved design for one bounded implementation slice of `projects/benchmark-cinematic-ui`. This is not a completion claim for the benchmark or the Lab.

## Objective

Turn the existing cinematic cue rules into a reproducible, client-only Roblox benchmark that demonstrates ordered title, location, and objective presentation, immediate skip, and reduced-motion behavior.

## Audience and promise

The audience is developers evaluating whether the Lab can build a small, usable cinematic sequence in a Roblox experience. The benchmark promises a readable introduction that leaves the central play view visible and preserves information when skipped or shortened. It is not a finished game intro or evidence of player research.

## Architecture and data flow

- Keep `src/shared/CinematicRules.luau` as the deterministic source of sequence progression and timing.
- Remove the unused server mapping from `default.project.json`; map a new `src/client` LocalScript through `StarterPlayerScripts`.
- The LocalScript owns presentation state, controls, and rendering. It does not write gameplay state or call a server remote.
- Define a bounded, ordered cue list for title, location, and objective. Advance it through `CinematicRules`; render the current cue and completion state from the returned state.
- Use a restrained text fade between cues in standard mode; reduced motion disables the fade and shortens cue timing without changing information or order.
- Skip completes the sequence immediately and leaves the objective visible as the next state.
- Reduced motion is an explicit client-side toggle, initially off. It shortens cue timing through the shared rules without changing cue order or removing information.
- Keep skip and reduced-motion controls visible and operable with Roblox `GuiButton.Activated` so pointer, touch, and gamepad activation use the same path.

## Presentation

Use the approved **Field Notes** direction: an upper-left, left-aligned text stack over the 3D scene, restrained teal location labeling, warm objective emphasis, and a subtle dark contrast backing. Keep the center of the viewport clear. Use responsive constraints and wrapped text so narrow layouts preserve readable text instead of shrinking it indefinitely. This authored presentation is a benchmark treatment, not final art direction for the Lab flagship.

## Boundaries and failure behavior

- Reject malformed or out-of-range cue definitions through the shared rules; do not silently substitute a successful sequence.
- Ignore repeated progression once the sequence is complete; allow the explicit skip action to settle directly on the objective state.
- Keep the controls available for the sequence lifetime and clean up the ScreenGui when the LocalScript is removed.
- Do not add remotes, persistence, third-party assets, purchases, uploads, or publishing.

## Acceptance and verification

1. The project manifest resolves all declared source paths and builds with the pinned Rojo 7.7.1 tool.
2. The pinned Luau 0.745 parser accepts every benchmark source file.
3. Luau CLI specs verify title → location → objective order, normal timing boundaries, immediate skip, reduced-motion timing with unchanged order, completion stability, and malformed cue rejection.
4. The client presents the approved Field Notes layout with persistent skip and reduced-motion controls and an objective-visible completion state.
5. Evidence clearly distinguishes offline rule/build checks from live Studio visual, input, and runtime verification.

Studio runtime, responsive viewport review, and physical input/device behavior remain unverified until a connected Studio session is available. These are not inferred from parser, CLI, or Rojo results.

## Out of scope

- Completing other benchmarks, Signal Garden, or any of the Lab's other capability domains.
- Server-authoritative gameplay, networking, data persistence, or a generic cinematic framework.
- Final flagship art direction, audio, player research, physical-device certification, or release certification.
