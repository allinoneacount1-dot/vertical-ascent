#!/usr/bin/env bash
# G1 step 9 (ref/02 §Pemilik besaran): each check passes when rg finds nothing (rg exits 1).
# Usage: bash scripts/owner-check.sh   (Git Bash, project root)
set -u
fail=0
run() {
  local name="$1"; shift
  echo "## $name"
  echo "\$ rg $*"
  if rg "$@"; then
    echo "-> FAIL (hits above)"
    fail=1
  else
    echo "-> PASS (0 hits)"
  fi
}
echo "# owner-check $(date -Iseconds) commit $(git rev-parse --short HEAD)"
run "camera writes outside src/camera" -n 'camera\.(position|rotation)\.(set|copy|add)|zoomDistance\s*=' src -g '!src/camera/**'
run "inputVelocity outside physics/controller" -n 'inputVelocity' src -g '!src/physics/**' -g '!src/controller/**'
run "applyVelocity/stateVelocity outside physics" -n 'applyVelocity|stateVelocity' src -g '!src/physics/**'
if [ "$fail" -eq 0 ]; then echo "OWNER-CHECK PASS"; else echo "OWNER-CHECK FAIL"; fi
exit "$fail"
