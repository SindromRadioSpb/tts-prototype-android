#!/usr/bin/env bash
# Rebuild the RC3.3 chain from the verified 879 data: edition → stage → AI context → speech text → release data.
# Usage: AUDIT=<findings.json> bash scripts/atlas/rc33/rebuild.sh   (run from the repo root; inputs under .tmp/rc33)
set -euo pipefail
: "${AUDIT:?set AUDIT to the audit findings.json}"
BASE=.tmp/rc33/release/atlas-editions/a97001/841fd6424e8428ba5ebd1f489f514c5dff058d841e415c5a13a42fe7504b47cc
rm -rf .tmp/rc33/candidate .tmp/rc33/rt
mkdir -p .tmp/rc33/rt && cp -r .tmp/rc33/release/atlas-editions .tmp/rc33/rt/
python -I scripts/atlas/rc33/build_rc33.py --source "$BASE" --audit "$AUDIT" --out .tmp/rc33/candidate | tail -1 > .tmp/rc33/build.json
node scripts/atlas/stage-edition.cjs --source .tmp/rc33/candidate --destination .tmp/rc33/rt/atlas-editions > .tmp/rc33/stage.json
node scripts/atlas/rc33/rebind-context.cjs --source-export=.tmp/rc33/export879 --stage=.tmp/rc33/stage.json --candidate=.tmp/rc33/candidate \
  --runtime-data=.tmp/rc33/rt --package=.tmp/rc33/pkg --audit="$AUDIT" > .tmp/rc33/rebind.out
cat .tmp/rc33/stage.json; tail -12 .tmp/rc33/rebind.out
