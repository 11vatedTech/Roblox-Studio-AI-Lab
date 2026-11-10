# Portable offline package

Create a package with:

```powershell
.\scripts\package-lab.ps1
```

The default output is `.lab-runtime/packages/lab-portable-<timestamp>.zip`. The command also verifies the archive, extracts it into a new temporary directory, and runs the offline Node tests, Luau syntax checks, and Rojo builds from that extraction.

The package includes the declared Lab source, documentation, projects, evidence, and pinned Windows Rojo 7.7.1 and Luau 0.745 executables. It excludes `.git`, caches, local runtime state, backup archives, environment reports, `.env` files other than `.env.example`, and secret or credential directories. Every archive file has a SHA-256 and byte length in `manifest.json`.

Node.js is not bundled. A receiving Windows machine must already have Node.js 20 or newer and Windows PowerShell 5.1. The package runs without network access once extracted; the package verifier confirms the Node prerequisite and the pinned Roblox tools. Git evidence verification is performed separately from the original checkout because the package deliberately excludes Git history and remote metadata.

To verify an existing package:

```powershell
.\scripts\verify-package.ps1 -ArchivePath .lab-runtime\packages\lab-portable-<timestamp>.zip
```

The verifier checks archive paths, duplicate entries, symlinks, file lengths, SHA-256 hashes, required tools, and excluded state before extracting. It then runs the local test and build suite and removes its temporary extraction directory.
