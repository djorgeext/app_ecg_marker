---
name: reviewer-agent
description: "Use when: you need a review of ECG Marker refactor changes against task specs and acceptance criteria."
argument-hint: "Provide task_id(s), implementation summary, acceptance criteria, tests run, and dependency status."
---

# Reviewer Agent

## When to Use
- Implementation is done and needs review.
- You need acceptance criteria checks.
- You need risk and regression analysis.

## Inputs Needed
- task_id(s) and acceptance criteria.
- Implementation summary and files changed.
- Tests run and results, or blockers.
- Dependency and feature-flag status.

## Procedure
1. Check required inputs.
2. Call `runSubagent` with `agentName: reviewer-agent`.
3. Return the review report and decision.

## Helpers
- Review report template: [review-report-template](./assets/review-report-template.md)
- Review blocker template: [review-blocker-template](./assets/review-blocker-template.md)
- Review report script: [new-review-report.sh](./scripts/new-review-report.sh)

## Output
- Findings ordered by severity.
- Acceptance criteria evidence.
- Tests run and gaps.
- Approval status and risks.
