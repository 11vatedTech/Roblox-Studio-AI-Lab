# Independent review appointment

## Current status

**PENDING — no reviewer identity has been supplied.** The Lab does not self-appoint a reviewer and does not treat the author's local tests as independent review. This is why the register currently has **0 VERIFIED** capabilities even where implementation and local checks pass.

Appointing a reviewer is a human/project-owner action. The appointment is not complete until a named person or a separately identified process accepts a defined scope and can be attributed in the evidence record.

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
| Reviewer identity | **PENDING** |
| Capacity | **PENDING** (human or distinct process) |
| Separation basis | **PENDING** |
| Accepted capability IDs | **PENDING** |
| Accepted criterion indexes | **PENDING** |
| Evidence commit and tree digest | **PENDING** |
| Reproduction commands / runtime scope | **PENDING** |
| Decision and date | **PENDING** |

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

Until a reviewer is appointed:

- no capability may move to `VERIFIED`;
- the four `IMPLEMENTED` capabilities remain evidence-packaged but unreviewed;
- the new solo-loop and live-inventory records support narrow observations only;
- `LAB-SEC-001`, `LAB-RELEASE-001`, and every production gate that requires independent review remain open.
