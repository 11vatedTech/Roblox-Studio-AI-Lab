# Evidence record contract

`evidence/registry.json` is the typed index. Each record points to a source JSON file and carries the SHA-256 digest of that file's canonical content. The digest is a file-content hash; it is not a Git blob ID. Text records (`.json`, `.log`, `.txt`, `.md`, `.csv`) are digested in canonical LF form so a Windows working tree and a clean CI checkout of the same record produce the same digest; binary references are hashed byte-for-byte.

## Source identity

New verification records include `sourceIdentity` with the full Git commit, `treeSha256`, and `dirty` state. The source-tree digest covers Git-tracked and nonignored untracked files in their working-tree contents. It excludes the `evidence/` artifact root to avoid a report changing the source snapshot that it records. The record also lists its digest scope and tool versions. A dirty snapshot remains usable as historical evidence because its exact content digest is recorded; it must not be described as a clean commit result.

Legacy records may omit source identity so their historical, narrowly scoped result remains visible. They cannot support a `VERIFIED` capability.

## Capability coverage and review

A typed source record that supports a capability may include `capabilityCoverage`, with a capability ID and zero-based indexes into that register entry's `acceptanceCriteria`. A capability can be `VERIFIED` only when every reference resolves to exactly one typed, `passed` record; the records identify their source snapshot; all acceptance-criterion indexes are covered; and the records include a passed `independentReview` with distinct author and reviewer identities plus a separation basis.

The registry validates the shape and linkage of these claims. It does not authenticate a model provider or human identity by itself. Use process-attributed task-execution evidence or a human attestation for the actual review, and record any remaining identity assurance limits.

## Scope limits

A passing test report supports only the scenarios and criteria it names. Fixture tests do not establish live Studio behavior. A desktop capture does not establish device performance. A successful Rojo build does not establish runtime gameplay or visual approval. Keep these grades separate in the source record and capability register.
