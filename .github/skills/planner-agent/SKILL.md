---
name: planner-agent
description: "Use when: you need planning-only task specs, acceptance criteria, dependencies, or clarification requests for the ECG Marker refactor."
argument-hint: "Provide objective, phase scope, constraints, blockers, and repo facts to preserve."
---

# Planner Agent

## When to Use
- You need task specs for a change.
- You need acceptance criteria and tests.
- You need dependency or risk notes.
- Requirements are unclear and need a CR.

## Inputs Needed
- Objective or feature request.
- Phase scope or target task_ids.
- Constraints and blockers.
- Repo facts to preserve.

## Procedure
1. Confirm scope is planning only.
2. Collect required inputs.
3. Call `runSubagent` with `agentName: planner-agent`.
4. Return the task specs or CR.

## Helpers
- Task spec template: [task-spec-template](./assets/task-spec-template.md)
- Clarification request template: [clarification-request-template](./assets/clarification-request-template.md)
- Task spec script: [new-task-spec.sh](./scripts/new-task-spec.sh)

## Output
- Task specs with acceptance criteria.
- Dependencies, risks, and test strategy.
- Clarification requests if blocked.
