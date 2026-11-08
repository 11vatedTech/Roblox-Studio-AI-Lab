# Misprint Menagerie

**Working title:** Misprint Menagerie (name search and clearance are future work)

An unpublished Roblox vertical slice about collecting six authored creatures from erased worlds and using their distinct summon forms to counter an arena boss. The design spec is [`docs/superpowers/specs/2026-11-06-misprint-menagerie-design.md`](../../docs/superpowers/specs/2026-11-06-misprint-menagerie-design.md).

## Build

From the repository root, run `scripts/build-all.ps1`. From this project directory, run `..\..\scripts\build-all.ps1`. Generated `.rbxlx` builds are written under the ignored `.lab-runtime/builds/` directory.

## Current boundary

The first slice targets mobile and PC, supports one to three players, and has one Index hub, one arena, one two-phase boss, and six fixed card identities. Unlocks are server-owned but session-only; they reset when a player leaves. The slice has no DataStore writes, paid offers, cross-server matchmaking, uploads, or publishing. Do not present this project as a complete commercial game or evidence of revenue.

Source under `src/` is canonical. The generated place is a local test artifact. Update `evidence/` only from actual builds and Roblox Studio sessions.
