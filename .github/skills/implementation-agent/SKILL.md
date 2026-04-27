---
name: implementation-agent
description: "Use when: you need to implement planner-approved tasks for the ECG Marker refactor and report evidence."
argument-hint: "Provide task_id(s), acceptance criteria, depends_on status, feature-flag expectation, and CR decisions."
---

# Implementation Agent

## When to Use
- A planner task is approved and ready to build.
- You need code changes with evidence.
- You need test results and rollback notes.

## Inputs Needed
- task_id(s) and acceptance criteria.
- depends_on status and feature flags.
- CR decisions and constraints.
- Any known blockers.

## Procedure
1. Verify all required inputs are present.
2. Confirm dependencies are complete.
3. Call `runSubagent` with `agentName: implementation-agent`.
4. Review the handoff and evidence.

## Helpers
- Handoff template: [implementation-handoff-template](./assets/implementation-handoff-template.md)
- Evidence checklist: [acceptance-evidence-checklist](./assets/acceptance-evidence-checklist.md)
- Handoff script: [new-implementation-handoff.sh](./scripts/new-implementation-handoff.sh)

## Output
- Code changes and files touched.
- Evidence per acceptance criterion.
- Tests run and results.
- Rollback notes and risks.
