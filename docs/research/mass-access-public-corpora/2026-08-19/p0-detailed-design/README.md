# MASS-ACCESS P0 detailed design and red-test artifacts

Date: 2026-08-19

Status: `OWNER-APPROVED D1–D6 · DESIGN FROZEN · I3 IMPLEMENTED LOCALLY · 12/14 CHECKS RED`

Branch: `mass-access-p0-design-red-tests`

Design baseline: `955bf3146ced22a4c9bfc55fa9eb4cb4a9ac88e8`

Owner authority:

```text
NEXT=DETAILED_DESIGN_AND_RED_TESTS_ONLY
B9=KEEP_FROZEN
MIGRATION=NO
OWNER_DATA_WRITES=NO
DEPLOY=NO
COMMIT=YES
PUSH=YES
```

## Artifacts

- [Detailed UX flows and localized copy](UX_FLOW_AND_COPY_SPEC.md)
- [Domain, API and security contract](DOMAIN_API_SECURITY_SPEC.md)
- [Red-test matrix and expected baseline](RED_TEST_MATRIX.md)
- [Canonical P0 design packet](../../../../planning/LINGUISTPRO_MASS_ACCESS_P0_DETAILED_DESIGN_AND_RED_TEST_CONTRACT_2026_08_19.md)
- [I3 Send or save implementation record](../../../../planning/LINGUISTPRO_MASS_ACCESS_I3_SHARE_IMPLEMENTATION_2026_08_19.md)
- Machine-readable frozen fixture:
  `scripts/premium/fixtures/mass-access-p0/contract-v1.json`
- Executable red contract:
  `scripts/premium/mass-access-p0-contract-red.js`

## Generation and evidence

The artifacts were written from current repository code, the owner-approved
MASS-ACCESS decision packet, Study Songs schema/canon, the closed Library/corpus
contract, the B9 freeze and current RU/EN/HE localization conventions. No generated
or inferred learner data was used.

Run the intentionally isolated contract with:

```text
npm run smoke:mass-access:p0:red
```

After the separately authorized I3 successor, expected P0 result remains non-zero
exit `1`: all green guards pass, `P0-R11` and `P0-R12` report `IMPLEMENTED`, and the
other 12 implementation checks remain `RED`. The script is deliberately excluded from
`npm test` and production gates until implementation is separately authorized.

## Legal/product limitation

The copyright notice is a contact and takedown process, not a substitute for rights
clearance. Section 19 of Israel's Copyright Act lists purpose/character among several
fair-use factors and includes private study, research, criticism, review, reporting,
quotation and instruction/examination by an educational institution as examples.
Non-commercial educational purpose can therefore be relevant, but it does not make
whole-song text/audio publication automatically permissible. Per-item rights remain
a release gate. This is product/engineering design, not legal advice.

Primary reference: [WIPO Lex, Israel Copyright Act 2007](https://www.wipo.int/wipolex/en/legislation/details/5016).

## Execution record

```text
RUNTIME_CODE=NONE
SCHEMA=NONE
MIGRATION=NONE
OWNER_DATA_WRITES=NONE
PRODUCTION_READS=NONE
PRODUCTION_WRITES=NONE
DEPLOY=NONE
B9=FROZEN
```
