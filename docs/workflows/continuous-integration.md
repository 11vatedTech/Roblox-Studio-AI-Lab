# Continuous integration

The GitHub Actions workflow at `.github/workflows/ci.yml` runs on pushes, pull requests, and manual dispatches. It uses a Windows-hosted runner, Node.js 24 LTS, the repository's checksum-pinned Rojo and Luau installers, the offline suite, evidence-registry checks, and all declared Rojo builds.

Each run captures the source commit and working-tree digest, hashes generated place files, builds a portable source/tool package, validates its contents, extracts it into a clean temporary directory, and reruns the offline tests and builds there. It uploads those reports, the portable package, and build outputs. The artifact action is pinned by full commit SHA and retains artifacts for 14 days. The workflow has read-only repository permissions and does not use secrets, upload assets to Roblox, or publish a place.

Local evidence of the workflow definition and its commands does not prove a hosted run. The first hosted result remains outstanding until a branch containing this workflow is pushed and GitHub Actions completes it. Local portable packaging and clean-extraction verification are performed by `scripts/package-lab.ps1` and `scripts/verify-package.ps1`.
