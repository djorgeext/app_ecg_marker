#!/usr/bin/env bash
set -euo pipefail

out="${1:-}"
template=$(cat <<'EOF'
# Implementation Handoff Template

task_id:
summary_of_changes:
files_touched:
acceptance_criteria_evidence:
tests_run_and_results:
rollback_notes:
residual_risks:
reviewer_handoff_notes:
EOF
)

if [[ -n "$out" ]]; then
  printf "%s\n" "$template" > "$out"
  printf "Wrote %s\n" "$out"
else
  printf "%s\n" "$template"
fi
