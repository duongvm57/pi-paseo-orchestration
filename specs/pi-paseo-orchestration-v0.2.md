# Pi Paseo Orchestration v0.2

Type: implementation specification
Status: ready-for-agent
Spec version: 2
Target package version: 0.2.0

## Objective

Replace coordinator-based bootstrap with a Human-created Paseo team. The Human creates a root Lead and a root Supervisor directly; the Lead creates bounded Peer children. Communication is event-driven and bounded; no coordinator, daemon, continuous polling, or automatic heartbeat is introduced.

## Human-created topology

```text
Human
├── Lead (root Paseo agent)
│   └── Peer(s) (Paseo child agents)
└── Supervisor (root Paseo agent bound to one Lead)
```

- Lead and Supervisor require `ParentAgentId = null`; a parented lead/supervisor fails closed before governed work.
- A Peer requires `ParentAgentId = <exact Lead agent ID>`; a root Peer or a Peer of another parent completes as `BLOCKED`.
- The Supervisor observes exactly one bound Lead per active assignment; it does not direct Peers or issue project acceptance.

## Runtime-captured Human authority

The initial root Lead task is captured by the runtime as the current-run Human task authority, including provenance, objective, repository, and requested local effects. The Human writes no marker, JSON envelope, hash, agent ID, assignment ID, scope syntax, or capability name. The runtime mechanically attenuates that authority to the exact child Peer created by the bound Lead; attenuation may narrow but never widen. Push, merge, publish, deploy, protocol mutation, destructive/external effects, secrets/material cost, objective/irreversible decisions, and Local Acceptance remain Human-only boundaries.

## Event-driven communication

- Peer → Lead: narrow parent-scoped kinds `question`, `blocked`, `dependency`, `progress`, `handoff`, resolved from Paseo parentage.
- Lead → Supervisor: milestone events `LEAD_STARTED`, `PEER_BLOCKED`, `CANDIDATE_READY`, `REVIEW_COMPLETE`, `HUMAN_DECISION_REQUIRED`, `LEAD_FINISHED`.
- Supervisor → Lead: evidence-backed observation only to the verified bound Lead.
- One bounded versioned event envelope; duplicate `event_id` is idempotently ignored; receipt is an attention signal, never acceptance or an Authority Grant.

## MCP operation normalization

Canonical and adapter-prefixed operation names route through one explicit alias map (e.g. `create_agent` and `paseo_create_agent`) and produce identical policy decisions. Server identity must be exactly Paseo; unknown prefixes/suffixes remain blocked; normalization never broadens a role allowlist.

## Doctor

Adds checks for `PASEO_MCP_CONNECTED`, `PASEO_REQUIRED_OPERATIONS`, `PASEO_AGENT_IDENTITY`, `PASEO_SELF_INSPECT`, `ROLE_PARENTAGE`, `ROLE_PROVIDER`, `WORKSPACE_BINDING`, `LEAD_SUPERVISOR_BINDING`, `PEER_PARENT_BINDING`, and `EVENT_CAPABILITIES`. Governed Lead/Supervisor/Peer missing mandatory live evidence returns `BLOCKED`; passive sessions report the environment ceiling without pretending governed readiness; the first failed Paseo connection/discovery operation fails fast.

## Removal

`/ppo:bootstrap` and the coordinator workflow are removed. `lead_tiny` and `supervisor_recovery` authority grant kinds are removed. The handwritten authority-envelope markers/parsing and the local edit/commit gate are removed in favor of runtime-captured Human authority.

## Reconciliation and restart

`createdPeerIds` is not the authoritative ownership source; Lead reconciliation selects agents whose actual Paseo parent is the current Lead and validates provider/role/task before lifecycle operations. Process-local sets are caches; restart recovery rederives from Paseo facts.

## Acceptance

Automated checks: `npm test`, `npm run typecheck`, `npm run release:smoke`, `npm pack --dry-run`, `git diff --check`. Expected live-environment ceilings in `release:smoke` are explicit and are not reported as verified facts. Tests are hermetic: every identity/topology fixture passes an explicit environment map that clears `PASEO_AGENT_ID`, `PI_PASEO_ORCHESTRATION_ROLE`, and `PI_PASEO_ORCHESTRATION_*` binding variables.
