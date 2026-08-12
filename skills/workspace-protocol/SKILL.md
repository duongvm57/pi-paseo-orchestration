---
name: workspace-protocol
description: Author or revise a repository's Pi Paseo Workspace Protocol through a breadth-first Human interview and exact confirmed diff. Use when the Human asks a Supervisor to define routing, ownership, evidence, escalation, or protocol evolution for a governed repository.
---

# Workspace Protocol authoring

Create or revise only the repository-wide `.orchestration/workspace-protocol.md`. Paseo remains the sole lifecycle, workspace, parentage, follow-up, and timeline truth.

## Establish the authoring route

1. Confirm the repository root and the Human-defined `project_id`.
2. Confirm the active Role Profile permits Supervisor protocol authoring and the Human is participating directly.
3. Determine whether the canonical protocol is absent or existing. Read an existing protocol only when that Role Profile and the exposed tools permit it. Skill discovery grants no role, capability, write authority, or permission to read the protocol.
4. A Lead may propose a revision but cannot write it. A Peer may neither read nor edit the full protocol.

Stop if identity or authoring authority is absent or conflicting.

## Interview breadth-first

Interview the Human one group at a time, restating each decision, consequence, hidden assumption, and contradiction before continuing:

1. repository identity, applicability, criticality, dominant risks, and expensive-to-reverse effects;
2. Human, Supervisor, Lead, and Peer decision boundaries;
3. routing for `tiny/bounded`, `cross-module/lifecycle`, and `architecture-sensitive` work;
4. ownership, one-writer scope, isolated checkouts, dependencies, and handback;
5. per-class Stable Candidate, verification, review, verdict, and Local Acceptance rules;
6. `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, `BLOCKED`, and Human `must_ask` boundaries;
7. anti-patterns, review triggers, and protocol evolution.

The Human must decide product and priority, irreversible trade-offs, external effects, authority or protocol changes, subjective acceptance, and material cost or risk.

## Draft the closed core

The draft must include:

- `status`, monotonically increasing `version`, `last_reviewed`, `project_id`, `repository_root: .`, and repository-wide applicability;
- a repository-specific four-role decision matrix within the Role Profile ceilings;
- the three task classes and proportionate routing;
- ownership, isolation, one-writer, dependency, and handback rules;
- each class's candidate identity, verification evidence, reviewer trigger, verdict, and accepter;
- escalation handling and evolution rules.

Optional material is limited to project characteristics, review or council rules, anti-patterns, and Supervisor observation or authoring hints. Keep model and thinking selection outside the v0.1 protocol; Human-owned role settings are the operative source. Record only repository-specific allocations and constraints; do not restate the Role Profiles or this authoring workflow.

The Workspace Protocol may narrow workflow and permit tiny Lead self-work, but it cannot grant `edit`, `local_commit`, recovery, or any other Capability. Preserve **Role Profile > Workspace Protocol > current-run Task Authority Envelope > ordinary task prose**. Omission grants nothing.

## Confirm and write

1. Present the exact complete diff and explain material consequences. For creation, set `version: 1`; for revision, increment the existing version by one. Refresh `last_reviewed` in either case.
2. Obtain direct Human confirmation of that exact diff.
3. Immediately before writing, check the confirmed base: the canonical path must still be absent for creation, or its version and digest must still match for revision. On drift, stop, rebuild the diff, and obtain confirmation again.
4. Write only the canonical file. Use Git history; create no parallel changelog or lifecycle store.
5. Re-read the written file and verify it exactly matches the confirmed target. Report its path, version, and digest; a mismatch is a blocker.
6. Apply revisions to new work. If authority, ownership, or acceptance materially changes for running work, stop and re-evaluate it rather than silently changing its pin.

Finish only when the confirmed file matches the written bytes and no section claims capability, Paseo lifecycle truth, authentication, sandboxing, or acceptance it cannot provide. Otherwise return the blocker without writing.
