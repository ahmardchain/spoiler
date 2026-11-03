#!/bin/bash
# Solve every level in parallel (4 at a time) with the beam-search bot, then merge into src/solutions.json
cd "$(dirname "$0")/.."
N=$(grep -c "^  lvl(" src/levels.ts)
seq 1 $N | xargs -P 4 -I{} sh -c 'timeout 900 npx tsx scripts/solve.ts {} ${BEAMS:-300,1000} > /tmp/solve-{}.log 2>&1; tail -1 /tmp/solve-{}.log'
npx tsx scripts/merge.ts
