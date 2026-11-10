# Independent review appointment

## Current status

**APPOINTED — automated distinct process, limited scope (not human).** A separate Node process, `process:lab-review:30676:d370aa77-0904-44b5-b342-ee81eb038626`, reviewed the recorded `LAB-STUDIO-002` evidence on 2026-11-10 and passed 21 of 21 checks, including the full 118-test suite. It is a real separate execution surface, but the same operator wrote the implementation, evidence, and review script; it is not human-independent judgment. The register remains at **0 VERIFIED**.

The project owner has not supplied a human reviewer. This appointment covers the recorded reversible start/stop gate and the approval/audit model only. A later sealed sandbox run exercised create, replace, save, upload, marker-checked delete, and cleanup, but this review did not inspect or reproduce it; that record is outside the accepted review scope. The 2026-11-10 multiplayer/device gate records are also outside this appointment: one is a single-client surface audit and one is an emulator-only device probe, both `blocked`. `LAB-STUDIO-002` therefore remains `IN_PROGRESS` with a high open defect. Publishing and Rojo sync remain unexercised, and no capability is `VERIFIED`.

## Eligibility

A reviewer must:

- be distinct from the author who produced the implementation and evidence;
- have no ownership conflict in the reviewed scope;
- be able to reproduce the recorded commands or inspect the named runtime/device evidence;
- record a decision against specific capability IDs and acceptance-criterion indexes;
- accept that a local self-review, a same-process agent, or an unreviewed screenshot is not sufficient.

A human attestation uses `separation: "distinct-human"`. A separately identified process may use `separation: "distinct-process"`, but it must be a real distinct execution surface; a test fixture cannot be presented as human review.

## Appointment record

Fill this before any capability is submitted for `VERIFIED`:

| Field | Value |
|---|---|
| Reviewer identity | `process:lab-review:30676:d370aa77-0904-44b5-b342-ee81eb038626` |
| Capacity | Automated Node.js distinct process (not human) |
| Separation basis | Separate OS process and PID/session; author `implementation-agent:buffy`; same operator wrote both, so this is not human-independent judgment |
| Accepted capability IDs | `LAB-STUDIO-002` |
| Accepted criterion indexes | `0, 1` for the recorded reversible gate and approval/audit model |
| Evidence commit and tree digest | Reviewed `2b6210c64120f94e87324b2bcd6d7f95d8d70a8c` / `ab61cdb600033d5c9a1b2a4f038afe230718851ddd7338765d5fb207e1ccdb3f`; evidence commit `fc11ac3be3aee65eed110602abbd20f35c995fd3`; merged evidence SHA-256 `4645d216d466a7050cb050cd92774ff0bfad1eed0ce1c2bb9cc8551dea99a582` |
| Reproduction commands / runtime scope | `npm run review:studio`; `npm test` (118/118); read-only `GET /api/studio/state`; no live start/stop rerun |
| Decision and date | `passed` on the recorded evidence, 2026-11-10; no `VERIFIED` promotion |

## Review finding

The automated process passed all 21 checks. It verified the recorded reversible start/stop evidence, the five risk classes, the closed catalog, approval binding, token-free audit, current read-only Studio state, and the full Node suite. It did not re-run the live operation and did not exercise save, destructive mutation, upload, publishing, or Rojo sync. The later `evidence/studio/lab-studio-sandbox-probe-20261110.json` run exercised save, destructive mutation, and upload in a disposable place, but it is outside this review and is not human review. The two `evidence/studio/lab-*-gate-probe-20261110.json` / `lab-device-emulator-probe-20261110.json` records are also outside this review; they record blocked single-client and emulator-only observations. Raw report: `evidence/studio/lab-studio-002-independent-review-20261110.json` (SHA-256 `f82be867be087add867e719189e2d7bdf848fb5b0cd7795006280ddc10ed531a`).

## Attestation requirements

The evidence source record must include an `independentReview` object with:

- `status: "passed"`;
- a reviewer identity different from the author identity;
- `separation` of `distinct-human` or `distinct-process`;
- the reviewed source commit and tree digest;
- the capability IDs and acceptance-criterion indexes covered;
- the commands or runtime observations actually reproduced;
- any limitations and the final decision.

`evidence/registry.json` validates the shape and linkage. It does not authenticate a human by itself; the reviewer identity and attestation remain a project-governance responsibility.

## Immediate consequence

Until a human reviewer and the remaining external gates are in place:

- no capability may move to `VERIFIED` on this automated review alone;
- `LAB-STUDIO-002` remains `IN_PROGRESS` with its high open defect; its new sandbox save/destructive/upload evidence is not covered by this review;
- `LAB-ROJO-002` is `BLOCKED_EXTERNAL` on the absent Studio plugin, not reviewed as a live sync;
- the four `IMPLEMENTED` capabilities remain evidence-packaged but unreviewed;
- the solo-loop, inventory, sandbox, and new multiplayer/device gate records support narrow observations only; the gate records are blocked evidence, not a two-client or physical-device pass;
- `LAB-SEC-001`, `LAB-RELEASE-001`, and every production gate that requires independent review remain open.
