# Local path policy

The Lab treats every project, library, and backup path as untrusted input. Callers pass `resolveWithin(root, ...components)` one validated path component at a time. A component may not be empty, contain NUL, embed either path separator, be `.` or `..`, or begin with a drive prefix. This syntax check is host-independent, so a Windows drive-relative path is rejected even when the Lab is running on POSIX.

After component validation, `resolveWithin` resolves the target, checks that it remains below the selected root, and rejects existing symbolic-link components. APIs that accept a user-visible nested relative path split it on `/` and `\\`, then pass the resulting components to this function. Filesystem reads must additionally confirm the resolved target remains within the selected root.

The backup tool includes only the declared Lab source roots and root manifests. It excludes `.git`, dependency/runtime/download folders, Rojo runtime files, generated evidence, Blender autosaves, and prior backup archives. OneDrive Cloud Files may use reparse tags and remain readable; recognized symbolic links and junctions are rejected. Each ZIP contains a manifest with source-relative paths, byte lengths, and SHA-256 hashes.

The restore verifier validates every ZIP entry before extraction, rejects rooted or traversal paths and symbolic-link entries, creates a unique restore directory under the system temporary root, and verifies the extracted file inventory and hashes against the manifest. It never extracts over an existing destination.
