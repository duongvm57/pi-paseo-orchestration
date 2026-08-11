# Chart the path to the `pi-paseo-orchestration` v0.1 specification

Label: wayfinder:map

## Destination

Produce `specs/pi-paseo-orchestration-v0.1.md`: an implementation-ready specification for an independent, git-installable Pi package whose orchestration model conforms to the reference orchestration model deep dive and ends at a locally accepted Git candidate.

## Notes

- Normative source of truth: [`ref-docs/reference orchestration model-agent-orchestration-deep-dive.md`](../../ref-docs/reference orchestration model-agent-orchestration-deep-dive.md).
- Provisional input only: [`ref-docs/pi-paseo-orchestration-plan.md`](../../ref-docs/pi-paseo-orchestration-plan.md).
- `Minnyat/paseo-pi-team` is not a dependency or compatibility target; its pinned source is implementation evidence only where a ticket explicitly asks for it.
- Use current first-party Pi, Paseo, and `pi-mcp-adapter` contracts for runtime facts.
- v0.1 package shape: one policy extension, focused skills/templates, and an observation-only doctor command.
- v0.1 uses Supervisor, Lead, and Peer. Paseo remains the sole lifecycle/workspace control plane.
- Lead never writes product code in v0.1. An authorized Peer writes and creates the local Git commit candidate.
- `.orchestration/workspace-protocol.md` is mandatory; a Supervisor skill helps the Human author it.
- Publication is absent rather than sandboxed: no push/PR/merge/deploy workflow is built.
- Planning only: tickets resolve decisions. Package implementation is outside this map.

## Decisions so far

- [Verify the official Pi, Paseo, and MCP package seams](issues/01-verify-official-pi-paseo-mcp-package-seams.md) — A Pi extension can inject private role prompts and shape tools; `pi-mcp-adapter` remains an independently installed prerequisite detected by doctor.
- [Extract the minimal role and authority mechanisms from the reference implementation](issues/02-extract-minimal-role-and-authority-mechanisms.md) — Reuse only launcher env → closed role enum and strict per-turn envelope → refreshed tool policy; do not copy compatibility or unrelated hardening.
- [Verify current Paseo role and parent communication contracts](issues/03-verify-current-paseo-role-and-communication-contracts.md) — Paseo exposes identity, parentage, lifecycle and exact-target prompts, but no role/task truth or non-disruptive acknowledged mailbox; package reporting must stay thin and conservative.

## Not yet specified

- Exact internal module/file split after runtime policy, role activation, and doctor seams are decided.
- Final acceptance-test matrix until role policy, authority envelope, candidate review, and doctor contracts are settled.

## Out of scope

- Compatibility or migration from `Minnyat/paseo-pi-team`.
- Multi-host routing or cross-host candidate transport.
- Workspace-snapshot candidates in v0.1.
- OCR, browser automation, watchdog loops, custom model-routing classes, and legacy-install cleanup.
- A second task/session/candidate database or orchestration runtime.
- npm publication in v0.1.
- Push, PR creation, merge, or deploy workflows.
