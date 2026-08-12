---
name: workspace-protocol
description: Author or revise a repository's Pi Paseo Workspace Protocol through a breadth-first Human interview and exact confirmed diff. Use when the Human asks a Supervisor to define routing, ownership, evidence, escalation, or protocol evolution for a governed repository.
---

# Workspace Protocol authoring

Create or revise only the repository-wide `.orchestration/workspace-protocol.md`. Paseo remains the sole lifecycle, workspace, parentage, follow-up, and timeline truth.

Before interviewing, read the packaged [Workspace Protocol authoring guide](./AUTHORING-GUIDE.md). Apply its protocol boundary, routing patterns, evidence rules, anti-pattern catalog, and evolution rules.

## Establish the authoring route

1. Confirm the repository root and the Human-defined `project_id`.
2. Confirm the active Role Profile permits Supervisor protocol authoring and the Human is participating directly.
3. Determine whether the canonical protocol is absent or existing. Read an existing protocol only when that Role Profile and the exposed tools permit it. Skill discovery grants no role, capability, write authority, or permission to read the protocol.
4. A Lead may propose a revision but cannot write it. A Peer may neither read nor edit the full protocol.

Stop if identity or authoring authority is absent or conflicting.

## Interview breadth-first

Interview the Human one group at a time, restating each decision, consequence, hidden assumption, and contradiction before continuing:

1. repository identity and applicability, then criticality, dominant risks, and expensive-to-reverse effects only when they change routing or proof;
2. Human, Supervisor, Lead, and Peer decision boundaries;
3. routing for `tiny/bounded`, `cross-module/lifecycle`, and `architecture-sensitive` work;
4. ownership, one-writer scope, isolated checkouts, dependencies, and handback;
5. per-class Git Stable Candidate, verification, review, Lead verdict, and direct Human Local Acceptance prerequisites;
6. `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, `BLOCKED`, and Human `must_ask` boundaries;
7. evidence-backed project-specific anti-patterns when relevant (candidate signals from the guide's catalog, plus evidence required, open question, and allowed response for each), review triggers, and protocol evolution.

The Human must decide product and priority, irreversible trade-offs, external effects, authority or protocol changes, subjective acceptance, and material cost or risk.

## Draft the closed core

Use exactly the guide's closed frontmatter and H2 schema. The required H2 sections are:

- `Decision matrix` with repository-specific four-role boundaries and Human `must_ask` decisions;
- `Task classes and routing` with all three classes and proportionate routing;
- `Ownership and isolation` with one-writer, checkout, dependency, integration, and handback rules;
- `Candidate, verification, review, and acceptance` with each class's exact `git:v1:<task-base-full-oid>:<candidate-full-oid>` contract, verification evidence, review trigger, Lead verdict, and direct Human Local Acceptance prerequisites;
- `Reopen, dependency, and blocked handling` with evidence, decision owner, and bounded next action;
- `Evolution` with revision authority, Human confirmation, versioning, and effects on running work.

Optional H2 sections are limited to `Project criticality`, `Review and council rules` (or `Review and council`), `Anti-patterns`, and `Supervisor hints`. Include project characteristics only when they change routing or proof. Include anti-patterns only when causal evidence makes them repository-specific; record each as bold text plus signal, evidence required, open question, and allowed response, never as a nested heading. Keep model and thinking selection outside the v0.1 protocol; Human-owned role settings are the operative source. Record only repository-specific allocations and constraints; do not restate the Role Profiles or this authoring workflow.

The Workspace Protocol may narrow workflow and permit tiny Lead self-work, but it cannot grant `edit`, `local_commit`, recovery, or any other Capability. Preserve **Role Profile > Workspace Protocol > current-run Task Authority Envelope > ordinary task prose**. Omission grants nothing.

## Confirm and write

1. Present the exact complete diff and explain material consequences. For creation, set `version: 1`; for revision, increment the existing version by one. Refresh `last_reviewed` in either case.
2. Obtain direct Human confirmation of that exact diff.
3. Immediately before writing, check the confirmed base: the canonical path must still be absent for creation, or its version and digest must still match for revision. On drift, stop, rebuild the diff, and obtain confirmation again.
4. Write only the canonical file. Use Git history; create no parallel changelog or lifecycle store.
5. Re-read the written file and verify it exactly matches the confirmed target. Report its path, version, and digest; a mismatch is a blocker.
6. Apply revisions to new work. If authority, ownership, or acceptance materially changes for running work, stop and re-evaluate it rather than silently changing its pin.

Finish only when the confirmed file matches the written bytes and no section claims capability, Paseo lifecycle truth, authentication, sandboxing, or acceptance it cannot provide. Otherwise return the blocker without writing.
