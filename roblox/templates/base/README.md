# Roblox experience starter

This is a small, playable, server-authoritative signal collection loop used to validate the Lab's source workflow. It creates a clearly marked graybox training platform and reusable signal fragments at runtime. Replace the validation geometry, tune the loop for the actual game, and review the multiplayer/security checklist before release.

## Source workflow

1. Install Rojo from its official release and confirm `rojo --version` works.
2. Run `rojo serve default.project.json` from this folder.
3. Connect Roblox Studio's Rojo plugin to the server.
4. Use Studio's official MCP connection to inspect the DataModel and playtest.

`rojo build default.project.json -o out.rbxlx` creates a local place file. This command does not publish the experience.

## Loop and trust boundary

- The server owns the signal count, field bounds, pickup identity, distance check, cooldown, and respawn.
- The client can only request collection of a tagged fragment instance; the server validates the request and decides whether to award a signal.
- Client-side HUD text is presentation only.
- The runtime-created geometry is deliberately a test field, not finished art.
