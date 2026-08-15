# Task: v0.2 conformance with the normative Deep Dive source

Task ID: `ppo-v02-conformance-001`
Type: implementation spec (for the Lead)
Status: ready-for-Lead

## Objective

Bring the v0.2 package into conformance with its normative source
(`ref-docs/agent-orchestration-deep-dive.md`) and, where the deep-dive is
silent, the project plan (`ref-docs/pi-paseo-orchestration-plan.md`). The only
intentional deltas are distribution and local-only publication
(`plan.md:17-43`); everything else must match the normative source.

A full, evidence-cited gap audit already exists:
`.scratch/direct-role-orchestration-v0-2/dogfood-notes.md` → **DOGFOOD-020**.

## The gaps (from DOGFOOD-020)

Confirmed:
- **G1** Peer must not know/use Paseo (`deep-dive:21-23,557-566`); `profiles/peer.md:11-16` forces Peer to self-inspect through Paseo.
- **G2** Peer ceiling has no MCP but profile demands Paseo inspection; Bash does not block `paseo inspect/send`, so in practice the instruction forces a CLI fallback.
- **G6** Supervisor must be able to ask the Lead and relay Human decisions (`deep-dive:338-347`; `plan:457-471`); current Supervisor MCP targets are read-only list/status/activity only.
- **G7** Cardinality must be flexible (`deep-dive:340,1218-1229`); `profiles/supervisor.md` locks exactly one Lead, while runtime does not enforce 1:1 and allows inspecting any agent.
- **G9** Low-frequency heartbeat is an allowed safety net (`deep-dive:727-735`; `plan:1372-1407`); current profile bans any automatic heartbeat.
- **G10** Human-authorized Lead recovery must exist (`deep-dive:338-347`; `plan:496-508`); `supervisor_recovery` grants were removed and the protocol's "Recovery remains grant-bound" is dead prose.
- **G11** Model/effort selection principles belong in the Workspace Protocol (`deep-dive:775-788`; `plan:1681-1697`); the authoring skill excludes them.
- **G12** Lead write/edit must be protocol opt-in (`plan:862-878`); `effectiveTools()` grants write/edit to every Lead regardless of protocol.

Partial:
- **G4** Six Lead→Supervisor milestone events are not per-se wrong (event-driven monitoring fits `deep-dive:727-735`), but they must not become the exclusive Lead-controlled wake-up path nor hard-code observation strategy outside the Workspace Protocol.
- **G5** Human↔Supervisor is the preferred relay route (`deep-dive:306-317`); it is only unsupported because of G6.
- **G8** Supervisor must observe more than milestones: `list_agents/status/activity` exist, but there is no `list_workspaces`/cross-workflow observation contract and the Supervisor is only ever woken by the Lead.

New:
- **N1** Mandatory root Lead + root Supervisor + exact binding for every task violates "smallest-useful topology, no fixed ceremony" (`plan:580-602,2742-2757`) and the tiny topology with no Supervisor (`deep-dive:1171-1177`).
- **N2** Binding/restart reconciliation (`verifyPartnerBinding`) has zero production callers; Doctor reads the process cache it should be revalidating; the first event can self-bind any root `ppo-supervisor` in the repo without checking the Human-announced task binding.
- **N3** Peer→Lead transport is not implemented: `EVENT_PEER_MESSAGE_KINDS` is only a schema; there is no Peer MCP target, no parent-scoped tool, and no route for mid-run `question/blocked/dependency/progress`.
- **N4** Every Peer disposition gets write/edit/commit; there is no runtime Engineer/Architect/Reviewer/Scout distinction, so "read-only Reviewer/Architect" is prose only (`plan:884-912,2764-2771`).
- **N5** The Workspace Protocol is stale: it still uses the current-run Task Authority Envelope, a separate Human authority envelope for Lead self-work, "new Human grant", and envelope-based authority evidence — all machinery v0.2 claims removed.
- **N6** Supervisor observation scope is unbounded in code: `list_agents` is near-global and `status/activity` accept any `agentId` with no reconciliation to the bound Lead/project.
- **N7** Doctor checks `pi.sendEvent` for EVENT_CAPABILITIES while the real transport is outer MCP `send_agent_prompt`; `sendEvent` appears nowhere else.
- **N8** The runtime requires distinct payloads for `REOPEN_REQUEST`/`DEPENDENCY_REQUEST`/`BLOCKED`, but the shipped skill only gives the `HANDOFF` template.

## Boundaries the Human decides (escalate — do not decide)

These touch authority/product boundaries. Raise `HUMAN_DECISION_REQUIRED`
instead of guessing:

- N1: whether Supervisor topology is mandatory or optional per task class.
- G10: the exact gated-recovery authority (who may create a successor Lead, under what evidence).
- G11: any change to model/effort routing policy.
- N4: the capability split per disposition (which dispositions are read-only).

## Exclusions

- Do not touch distribution or local-only publication — those are intentional deltas.
- Do not re-litigate the recorded not-gaps (council/reviewer optional, no need to copy the 17 anti-patterns, protocol filename, Human-confirmed protocol writes).

## Verification

- `npm test`, `npm run typecheck`, `npm pack --dry-run`, `git diff --check`.
- Tests stay hermetic (clear `PASEO_AGENT_ID`, `PI_PASEO_ORCHESTRATION_ROLE`, and binding env vars).
- Fix the wiring/transport gaps (N2/N3/N6/N7/N8) with real production callers, not dead helpers.
