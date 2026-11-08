# Asset provenance workflow

No asset enters a shared experience until its source, right to use it, technical budget, and Studio result are recorded in `assets/asset-ledger.json`.

For each asset, record:

- Name and original author/source URL or tool.
- License or usage permission and date checked.
- Source file path, source hash, format, dimensions, texture sizes, and triangle count when applicable.
- Roblox asset ID only after an explicit upload has been authorized and completed.
- Collision, scale, LOD, streaming, mobile, and memory notes.
- Import date, target project/place, and visual inspection evidence.

Generated images, meshes, textures, audio, animation, and AI outputs are deliverables with provenance. Do not treat an AI generated result as automatically licensed for any use. Do not buy, upload, publish, or spend Robux without explicit authorization.

## SignalBloom rebuild

Run the asset builder only in Blender background mode with the factory startup scene and a new, isolated output directory:

```powershell
$outputDir = Join-Path '.lab-runtime' ("signal-bloom-rebuild-" + [Guid]::NewGuid().ToString('N'))
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --disable-autoexec --background --factory-startup --python assets/models/signal-garden/build_signal_bloom.py -- --output-dir $outputDir --reference-dir assets/models/signal-garden
```

The builder refuses interactive scenes and non-empty output directories. It records the source script hash, Blender/Python versions, mesh count, triangle count, dimensions, artifact sizes, and SHA-256 hashes. `canonicalModelSha256` hashes normalized mesh geometry, transforms, and material values so a rebuild can be compared across Blender-generated metadata. `.blend`, FBX, and PNG file hashes may differ between equivalent runs; a matching canonical model hash is evidence of matching authored model content, not proof of byte-identical exports or a successful Roblox import.

The source `.blend`, original source textures, generated FBX/preview, and build record remain paired in `assets/models/signal-garden/`. A Roblox import record is added only after import settings, hierarchy, scale, collision, moderation/upload behavior, and reopened-place presence have been verified. The current source-reproduction check does not establish a no-upload Studio representation.
