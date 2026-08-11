# Chart the path to the `pi-paseo-orchestration` v0.1 specification

Label: wayfinder:map

## Destination

Produce `specs/pi-paseo-orchestration-v0.1.md`: an implementation-ready specification for an independent, git-installable Pi package whose orchestration model conforms to the reference orchestration model deep dive and ends at a locally accepted Git candidate.

## Notes

- Normative source of truth: [`ref-docs/reference orchestration model-agent-orchestration-deep-dive.md`](../../ref-docs/reference orchestration model-agent-orchestration-deep-dive.md).
- Provisional input only: [`ref-docs/pi-paseo-orchestration-plan.md`](../../ref-docs/pi-paseo-orchestration-plan.md).
- `Minnyat/paseo-pi-team` is not a dependency or compatibility target; its pinned source is implementation evidence only where a ticket explicitly asks for it.
- Use current first-party Pi, Paseo, and `pi-mcp-adapter` contracts for runtime facts.
- v0.1 package shape: one policy extension, focused skills/templates, a Human-owned role-settings command, and an observation-only doctor command.
- v0.1 uses Supervisor, Lead, and Peer. Paseo remains the sole lifecycle/workspace control plane.
- Lead is read-only by default. When the Workspace Protocol permits, the Human may grant one current-run tiny-task edit/local-commit exception; difficult implementation remains Peer-owned.
- `.orchestration/workspace-protocol.md` is mandatory; a Supervisor skill helps the Human author it.
- Publication is absent rather than sandboxed: no push/PR/merge/deploy workflow is built.
- Planning only: tickets resolve decisions. Package implementation is outside this map.

## Decisions so far

- [Verify the official Pi, Paseo, and MCP package seams](issues/01-verify-official-pi-paseo-mcp-package-seams.md) — A Pi extension can inject private role prompts and shape tools; `pi-mcp-adapter` remains an independently installed prerequisite detected by doctor.
- [Extract the minimal role and authority mechanisms from the reference implementation](issues/02-extract-minimal-role-and-authority-mechanisms.md) — Reuse only launcher env → closed role enum and strict per-run envelope → refreshed tool policy; do not copy compatibility or unrelated hardening.
- [Verify current Paseo role and parent communication contracts](issues/03-verify-current-paseo-role-and-communication-contracts.md) — Paseo exposes identity, parentage, lifecycle and exact-target prompts, but no role/task truth or non-disruptive acknowledged mailbox; package reporting must stay thin and conservative.
- [Define the runtime policy boundary](issues/04-define-the-runtime-policy-boundary.md) — Intersect named Pi tools with session-local, current-run authority and narrow call-time guardrails; role conduct and retained Bash remain cooperative, not sandboxed.
- [Define role activation and private profiles](issues/05-define-role-activation-and-private-profiles.md) — Activate one process-latched env role and private profile, fail closed on invalid/drifted governed state, apply closed per-role tool ceilings, and admit only Human-confirmed current-run tiny Lead or Supervisor recovery exceptions.
- [Define the minimal task authority envelope](issues/06-define-the-minimal-task-authority-envelope.md) — Use one strict v1 JSON grant block per current run, bound to role/task/Paseo identity and exact scope; separate edit and local-commit authority, require candidate base for commits, bind recovery to Human-attested provider/workspace/handoff, and reset/fail closed without sandbox claims.
- [Define Workspace Protocol and Supervisor authoring](issues/07-define-workspace-protocol-and-supervisor-authoring.md) — Use one repository-wide, Human-approved protocol with strict identity/core sections, risk-based routing, one-writer stable-candidate rules, pinned version/digest, and Supervisor draft/update authority that never exceeds Role Profile or Task Authority Envelope.
- [Define non-disruptive Peer-to-Lead reporting](issues/12-define-peer-to-lead-reporting.md) — Use strict v1 terminal Peer Reports with exact assignment correlation and evidence; native notifications are reserved-idle attention signals only, with no Peer send, retry, mailbox, delivery guarantee, or authority effect.
- [Define Lead–Peer orchestration and escalation](issues/08-define-lead-peer-orchestration-and-escalation.md) — Use adaptive risk gates, neutral exact assignments, isolated one-writer ownership, bounded Paseo-native recovery, candidate-bound independent review, and layered Lead/Human acceptance without fixed ceremony.
- [Define Git candidate review and local acceptance](issues/09-define-git-candidate-review-and-local-acceptance.md) — Bind clean local Git candidates, evidence, review, Lead readiness, and direct Human acceptance to exact full commit identities; candidate drift fails closed without publication or another control plane.
- [Define the doctor contract](issues/10-define-the-doctor-contract.md) — Probe the exact current cwd/repository/Pi/Paseo context with capability-first, role-aware readiness checks and emit closed v1 evidence plus manual-only remediation without mutation, acceptance, or security claims.
- [Define the Supervisor notebook contract](issues/13-define-the-supervisor-notebook-contract.md) — Keep one Human-owned per-project causal notebook under Pi config, using immutable concurrent entries and exact identity/path guards without authority, acceptance, project-write, or control-plane effects.
- [Define package distribution and verification](issues/11-define-package-distribution-and-verification.md) — Ship one full-commit-pinned Git package with one extension, three private profiles, one protocol-authoring skill, an independently installed adapter, capability-based TUI/RPC doctor checks, narrow Notebook writes, and the smallest hermetic plus release-smoke verification surface.
- [Define user-owned role model settings](issues/14-define-user-owned-role-model-settings.md) — Store one complete Human-owned Supervisor/Lead/Peer model-and-thinking selection under the Pi config directory; apply and verify it fail-closed in fresh governed processes and exact child creation, with no defaults, hot switching, task-class router, or fallback.

## Not yet specified

- None beyond the questions already captured by open child tickets.

## Out of scope

- Compatibility or migration from `Minnyat/paseo-pi-team`.
- Multi-host routing or cross-host candidate transport.
- Workspace-snapshot candidates in v0.1.
- OCR, browser automation, watchdog loops, custom model-routing classes, and legacy-install cleanup.
- A second task/session/candidate database or orchestration runtime.
- npm publication in v0.1.
- Push, PR creation, merge, or deploy workflows.
