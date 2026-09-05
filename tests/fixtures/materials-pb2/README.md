# Immutable Materials PB2 regression fixture

`canonical-source.zip` is the existing 2026-08-30 source snapshot, copied byte-for-byte
from the former local-only `.tmp/materials-pb2-q043-rebake.zip` dependency.
SHA-256: `04bb4b69741a0ec4cdc188b04ab9e630ae90994f252e0cc233cb6d33f8bc97d5`.

Provenance and package-download/public-source rights are recorded in
`docs/research/materials-science-problem-solutions/2026-08-30/publication-rights-attestation.json`.
This is test input, not a new publication or competing canonical ledger. Do not regenerate
or replace it to make tests pass. Production builders retain their existing explicit
input/hash checks; no production data or publication is changed by these tests.

The full archive is needed to verify 60 source tasks, exact-edition asset hashes,
publication rollback and all 72 runtime references without provider/network access.
It is excluded from Docker images. JSON entries were checked for credential/private-path
markers before inclusion; no credentials or personal account data were found.
