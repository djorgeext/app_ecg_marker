#!/usr/bin/env bash
set -euo pipefail

out="${1:-}"
template=$(cat <<'EOF'
# Review Report Template

task_id:
review_summary:
findings:
acceptance_criteria_evidence:
tests_run_and_results:
approval_status:
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
