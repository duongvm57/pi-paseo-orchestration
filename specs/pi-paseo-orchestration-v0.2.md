# Pi Paseo Orchestration v0.2

Type: implementation specification
Status: ready-for-agent
Spec version: 2
Target package version: 0.2.0

## Objective

Replace coordinator-based bootstrap with a Human-created Paseo team. The Human creates a root Lead and, when the task class warrants it, a root Supervisor; the Lead creates bounded Peer children. Tiny/bounded tasks may run Lead-only. Communication is event-driven and bounded; no coordinator, daemon, or continuous polling loop is introduced. A low-frequency heartbeat is only a safety net.

## Human-created topology

```text
Human
├── Lead (root Paseo agent)
│   └── Peer(s) (Paseo child agents)
└── Supervisor (optional root Paseo agent bound to assigned Lead(s))
```

- Lead and Supervisor require `ParentAgentId = null`; a parented lead/supervisor fails closed before governed work.
- A Peer requires `ParentAgentId = <exact Lead agent ID>`; a root Peer or a Peer of another parent completes as `BLOCKED`.
- A Supervisor is optional per task class. The Human creates and binds a Supervisor only when the task class warrants it; the Supervisor observes one or more assigned Leads, projects, or workspaces passively through Paseo evidence. A Lead never binds or reports to a Supervisor, and the Supervisor does not direct Peers or issue project acceptance.

## Resolved Human model for ordinary local work

The initial Human root task and the exact Lead assignment authorize ordinary local reversible repository work directly — inspect, edit, test, create/manage an isolated worktree, and create a local commit. No runtime-captured authority state, marker, JSON envelope, capability list, digest, scope parser, attenuation token, or Human-to-Peer grant exists; assignment, ownership, scope, and exclusions are workflow/evidence facts, not capability credentials. The observation-only Supervisor never edits project code. Push, merge, publish, deploy, protocol mutation, destructive/external effects, secrets/material cost, objective/irreversible decisions, and Local Acceptance remain direct Human-only boundaries. Candidate/review/acceptance validation stays an artifact check independent of any authority credential.

## Event-driven communication

- Peer → Lead: narrow parent-scoped kinds `question`, `blocked`, `dependency`, `progress`, `handoff`, resolved from Paseo parentage.
- Lead → Human observer: exactly one terminal `LEAD_FINISHED` completion event when a root Pi observer callback contract was supplied.
- Supervisor → bound Lead: ask why a strategy was chosen, or relay a recorded Human decision. Supervisor → Human/Notebook: evidence-backed observation. The Supervisor observes passively through Paseo evidence; there is no Lead→Supervisor milestone channel.
- One bounded versioned event envelope; duplicate `event_id` is idempotently ignored; receipt is an attention signal, not acceptance, and carries no authority.

## Cooperative task/assignment label contract

When a Lead adds cooperative task/assignment correlation labels to a new `create_agent` call, the `labels` object is closed and namespaced under `pi-paseo-orchestration.`. The only recognized keys are `pi-paseo-orchestration.task-key` and `pi-paseo-orchestration.assignment-key`; any other key is rejected drift. Peer write capability is an assignment fact bound once in `initialPrompt` as `"write_mode":"write"` or `"write_mode":"read-only"`; omitted write_mode is read-only. Labels are correlation metadata only (never authentication), and the child still inherits the exact workspace and Paseo-supplied parentage — `labels` never carries or overwrites `workspaceId`/parentage. Rejecting an unknown label key leaves the session unscathed (block the call, reuse the old closed `create_agent` shape which omits `labels`). The reconciliation side reads these labels from live inspection only when the observer supplies them; caller-supplied task/assignment values are never accepted as validation.

## MCP operation normalization

Canonical and adapter-prefixed operation names route through one explicit alias map (e.g. `create_agent` and `paseo_create_agent`) and produce identical policy decisions. Server identity must be exactly Paseo; unknown prefixes/suffixes remain blocked; normalization never broadens a role allowlist.

## Doctor

Adds checks for `PASEO_MCP_CONNECTED`, `PASEO_REQUIRED_OPERATIONS`, `PASEO_AGENT_IDENTITY`, `PASEO_SELF_INSPECT`, `ROLE_PARENTAGE`, `ROLE_PROVIDER`, `WORKSPACE_BINDING`, `SUPERVISOR_LEAD_BINDING`, `PEER_PARENT_BINDING`, and `EVENT_CAPABILITIES`. Governed Lead/Supervisor/Peer missing mandatory live evidence returns `BLOCKED`; passive sessions report the environment ceiling without pretending governed readiness; the first failed Paseo connection/discovery operation fails fast.

## Removal

`/ppo:bootstrap` and the coordinator workflow are removed. `lead_tiny` and `supervisor_recovery` authority grant kinds are removed. All hidden Task Authority Envelope ceremony for ordinary work is deleted — not renamed: the envelope parser, markers, grant/capability/scope-parser machinery, `currentAuthority`/`authorityActive`/`authorityReason` state and getters, `createdPeerIds` ownership cache, and the local edit/commit gate are gone. Ordinary local reversible edit/test/commit is allowed directly by the assignment; only real external/destructive/Human-only gates remain.

## Reconciliation and restart

`createdPeerIds` is not the authoritative ownership source; Lead reconciliation selects agents whose actual Paseo parent is the current Lead and validates provider/role/task before lifecycle operations. Process-local sets are caches; restart recovery rederives from Paseo facts.

A Lead lifecycle call toward a child is allowed only when live Paseo inspection proves:

- `ParentAgentId` equals the current Lead;
- provider equals the configured Peer provider (derived from the Human-configured `PI_PASEO_ORCHESTRATION_PEER_ALIAS`/Peer settings, never echoed from the child-operation caller);
- observed `cwd` is applicable to the exact repository, and a typed child workspace identity reconciles with the exact bound-Lead workspace (or an independently supplied expected workspace) when both are observable. Typed workspace is never sourced from child-op caller args.

Task/assignment labels are cooperative correlation metadata, not authentication credentials. The child task label is compared with the bound Lead task only when both are independently observable from live inspection; a mismatch blocks. Missing task/assignment labels on legacy children are reported as explicit bounded warnings, never a lifecycle deadlock. Assignment ID remains mandatory in Peer report and handoff correlation. Caller-supplied task/assignment values are never treated as independent validation; the closed child-operation shapes carry only `agentId` (+ `prompt` for send).

Typed workspace identity is checked when both the child's typed workspace and an independent expected reference (the exact bound-Lead typed workspace, or an explicitly supplied expected workspace) are observable; a mismatch fails closed (BLOCKED). When either the public runtime cannot expose typed workspace identity inside the lifecycle gate (child or bound-Lead side), Doctor reports an exact environment ceiling and the gate never claims workspace PASS; absence alone does not block a child whose exact parent, provider and repository applicability are proven. An otherwise missing/ambiguous observation, a parent other than the current Lead, a provider mismatch, a repository mismatch, or a supplied workspace mismatch fails closed (BLOCKED).

## Acceptance

Automated checks: `npm test`, `npm run typecheck`, `npm run release:smoke`, `npm pack --dry-run`, `git diff --check`. Expected live-environment ceilings in `release:smoke` are explicit and are not reported as verified facts. Tests are hermetic: every identity/topology fixture passes an explicit environment map that clears `PASEO_AGENT_ID`, `PI_PASEO_ORCHESTRATION_ROLE`, and `PI_PASEO_ORCHESTRATION_*` binding variables.
