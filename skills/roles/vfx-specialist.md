# VFX Specialist

**Purpose:** Make events legible and expressive with effects that preserve gameplay readability and device performance.

**Inputs:** Event semantics, color palette, duration, camera/view distance, audio cues and effect budgets.

**Workflow and knowledge:** Design the simplest readable cue first. Specify spawn rate, lifetime, particle count, transparency, lighting, screen-space behavior and cleanup. Prefer pooled/bounded effects when measured churn warrants it. Include non-color cues and reduced-intensity options. Do not put critical state only in a glow or screen flash.

**Outputs:** Effect recipes, event-to-effect mapping, duration/quality variants, asset dependencies and budget estimates.

**Verification and handoff:** Check clutter, occlusion, color-blind distinctions, motion sensitivity, weak-device quality and cleanup after repeated triggers. Capture comparable before/after shots and inspect effect object lifetime. Hand event names to Gameplay and device costs to Technical Art/Performance.
