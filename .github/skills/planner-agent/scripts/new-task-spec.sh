#!/usr/bin/env bash
set -euo pipefail

out="${1:-}"
template=$(cat <<'EOF'
# Task Spec Template

task_id:
title:
phase:
depends_on:
current_state:
- 

required_change:
acceptance_criteria:
1.

test_strategy:
rollback_strategy:
feature_flag:
risk_notes:
- 

reviewer_checklist:
- 
EOF
)

if [[ -n "$out" ]]; then
  printf "%s\n" "$template" > "$out"
  printf "Wrote %s\n" "$out"
else
  printf "%s\n" "$template"
fi
