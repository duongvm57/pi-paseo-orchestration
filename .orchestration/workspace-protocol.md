---
status: active
version: 4
last_reviewed: 2026-08-15
project_id: pi-paseo-orchestration
repository_root: .
---

# Workspace Protocol

This protocol applies repository-wide to all governed work in
`pi-paseo-orchestration`; there are no subdirectory overlays. Paseo remains
the sole lifecycle, workspace, parentage, follow-up, and timeline truth. This
document allocates workflow decisions only: it grants no Capability, Authority
Grant, authentication, filesystem/process/network/Git isolation, lifecycle
state, or Local Acceptance. Precedence is Role Profile > Workspace Protocol >
ordinary task prose.

## Project criticality

- Criticality is high.
- Dominant risks are scope and ownership drift, authority drift, weak
  evidence, and regressions.
- Routing and review remain proportionate to class and evidence. Tiny
  documentation changes do not require independent review unless an explicit
  trigger applies.
- Publication and other external effects remain direct Human decisions and
  are prohibited by the current package workflow.

## Decision matrix

- **Human:** decides product, objective, and priority; irreversible
  architecture and other trade-offs; publication and external effects;
  authority or protocol changes; state or data changes; material cost or risk;
  and direct `LOCAL_ACCEPT`. The Human also decides whenever it is ambiguous
  whether one of these boundaries applies.
- **Supervisor:** observes and proposes. It may inspect evidence, request
  clarification, pause affected work, escalate, and draft protocol revisions.
  It does not route ordinary project work or direct Peers as a substitute Lead.
  Observation is passive and event-triggered: the Supervisor reads Paseo
  evidence (agents, status, activity, workspaces) scoped to its bound Lead(s)
  and performs one bounded observation pass per event or low-frequency
  safety-net heartbeat, then idle. The Lead never sends the Supervisor
  milestones.
  Recovery is gated: the Supervisor may propose a successor Lead with evidence
  and a bounded handoff, but creating one requires an explicit per-incident
  Human authorization; it never self-grants recovery. The Supervisor may write
  a protocol revision only after exact direct Human confirmation of the
  complete diff; the protocol itself grants no capability.
- **Lead:** is the technical arbiter for reversible technical decisions within
  the pinned objective and protocol. It classifies and routes work, assigns
  ownership, decides decomposition, implementation direction, dependencies,
  verification, and handback, and issues the project verdict. It escalates
  every Human `must_ask` decision and cannot claim Local Acceptance. The Lead
  has no write/edit by default; a protocol rule below may permit Lead
  self-work for a named tiny case (opt-in).
- **Peer:** exercises independent judgment within the exact assignment scope.
  It may choose an implementation approach, challenge premises, verify, and
  issue findings or `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, and `BLOCKED`
  reports. It may not widen scope, issue a project verdict, or accept work.
  Capability follows the assignment disposition: Engineer assignments carry
  write/edit/commit; Architect, Reviewer, and Scout assignments are read-only.
- **Human `must_ask` boundaries:** product/objective/priority; irreversible
  architecture or trade-offs; publication/external effects; authority/protocol
  changes; state/data changes; direct Local Acceptance; material cost/risk;
  and ambiguity about whether any boundary applies. No role may infer
  authority from a role name, task prose, report, or tool availability.

## Task classes and routing

- **Classification:** The Lead classifies from recorded evidence using scope,
  module and lifecycle coupling, decision reversibility, contract impact, and
  residual risk. Missing technical facts justify only the smallest read-only
  Scout or Architect investigation. If ambiguity touches a Human `must_ask`
  boundary, the Lead asks the Human before continuing; it does not guess. A
  class change caused by material scope, objective, ownership, workspace,
  writable-scope, or authority change ends the assignment and follows the
  new-assignment rules below.
- **Supervisor topology (smallest useful):** A Supervisor is optional. A
  tiny/bounded task may run Lead-only with no Supervisor. The Human creates a
  Supervisor when governance/observation across one or more assigned
  projects/workspaces is warranted, or assigns one to a specific task. No
  fixed ceremony forces a Supervisor on every task.
- **Tiny/bounded:** A local, bounded, reversible change that does not cross
  module or lifecycle boundaries and has no architecture-sensitive decision is
  routed by default to one Engineer Peer. The Peer performs focused checks for
  the changed behavior. Independent review is normally skipped unless an
  explicit review trigger or evidenced risk applies. Lead self-work is not the
  default and is possible only where a protocol rule explicitly permits that
  specific tiny case; the runtime honors that opt-in.
- **Cross-module/lifecycle:** Work spanning modules or lifecycle behavior is
  framed by the Lead, including dependencies and ownership, and routed to one
  Engineer Peer owning the moving scope in an isolated checkout. A Reviewer is
  added only for an explicit trigger or evidenced risk. Overlapping concurrent
  writers are not permitted.
- **Architecture-sensitive:** A read-only Architect first reconstructs the
  relevant facts and returns an immutable evidence report. The Lead binds the
  reversible technical design; the Human decides irreversible trade-offs; one
  Engineer owns implementation in an isolated checkout; and one fresh
  independent Reviewer reviews the exact Stable Candidate.

## Model and effort routing

- The protocol carries selection principles, not hard-coded model IDs.
- Route by task risk and epistemic need: read-only inventory and bounded
  monitoring use economical models; bounded familiar implementation uses a
  strong coding model; cross-module/lifecycle and ownership work uses a strong
  reasoning model; independent falsification uses a separate independent
  provider or session.
- Concrete provider/model/thinking tuples live in Human-owned role settings
  (the operative source). The Lead inspects the currently available
  providers/models before routing and never guesses IDs or silently falls
  back.

## Ownership and isolation

- The Lead assigns one accountable owner for each exact moving scope and path
  set. A shared file has one writer. A material objective, owner, workspace,
  or writable-scope change ends the assignment and requires a new assignment;
  an authority change also ends the assignment and requires a new assignment.
- No overlapping concurrent writer scopes are allowed. Shared-file changes are
  sequenced or explicitly owned by one writer; other owners consume stable
  handbacks rather than moving work.
- Isolation is required for cross-module/lifecycle work,
  architecture-sensitive work, and any concurrent writer work.
  Sequential tiny/bounded work may use the current checkout only when it is
  clean and uncontested. If required isolation is unavailable, work may be
  serialized only while ownership and risk remain valid; otherwise it is
  `BLOCKED` and escalated rather than sharing a moving checkout.
- A handback is a terminal, evidence-bound report naming the exact assignment
  and scope, artifacts or diff, verification commands and results, the Stable
  Candidate when required, findings, risks, and unresolved dependencies.
  Lifecycle idle state or passing tests alone never transfers ownership. The
  Lead validates the handback before accepting the transfer.

## Candidate, verification, review, and acceptance

- **Stable Candidate:** Every write-producing class requires the exact
  canonical Git identity
  `git:v1:<task-base-full-oid>:<candidate-full-oid>` in its exact project,
  repository, workspace, task, and assignment context. Evidence binds the
  full task-base and candidate commit IDs, exact owned cumulative diff,
  post-commit verification, a clean and frozen worktree, and retrievability.
  An uncommitted diff, branch name, `HEAD` prose, lifecycle state, or tests
  alone is not a candidate. A read-only assignment hands back an immutable
  evidence report or artifact and does not pretend to be a Git candidate.
- **Verification:** Tiny/bounded work uses focused checks for the changed
  behavior. Cross-module/lifecycle work uses all affected suites plus relevant
  integration and lifecycle checks. Architecture-sensitive work uses the full
  relevant suite plus public-contract and failure-path evidence. The report
  records exact commands and results bound to the exact candidate, followed by
  cleanliness verification.
- **Independent review:** Tiny/bounded review is normally skipped unless a
  trigger or evidenced risk applies. Cross-module/lifecycle work receives
  independent review for any of these: public API, schema, package,
  distribution, or compatibility change; governance policy, role, authority,
  tool-gate, protocol, parser, acceptance, or reporting semantics change;
  cross-process/session lifecycle, persistence, recovery, or fail-closed
  behavior change; trust or security boundary change, secret handling, path
  validation, or dependency execution surface change; or evidenced prior
  regression, disputed premise, weak verification, or high residual risk.
  Triggered review is by one fresh independent Reviewer of the exact Stable
  Candidate. Architecture-sensitive work always receives one fresh
  independent Reviewer.
- **Lead verdict:** After required evidence and review gates, the Lead issues
  exactly one candidate-bound verdict: `READY`, `NOT_READY`, or
  `NEEDS_HUMAN`. `NOT_READY` applies to technical, identity, scope,
  cleanliness, evidence, review, blocker, or dependency failure.
  `NEEDS_HUMAN` applies when technical gates pass but a Human-only decision
  remains. `READY` requires all applicable gates to pass and all prerequisite
  Human decisions to be resolved. A Lead `READY`, tests, status, report, or
  Reviewer approval never implies acceptance.
- **Human Local Acceptance:** Every write candidate crosses the Local
  Acceptance Boundary only through direct Human `LOCAL_ACCEPT` evidence for
  that exact candidate after required decisions and reviews are resolved.
  Local Acceptance is Human-only; no relayed message or role verdict
  substitutes for it. Read-only evidence is not a Git candidate and does not
  imply acceptance.

## Reopen, dependency, and blocked handling

- **`REOPEN_REQUEST`:** A Peer may issue it when a foundational premise, API or
  lifecycle fact, ownership assumption, or verification contract no longer
  holds. The Peer stops affected work and reports exact evidence and impact.
  The Lead decides `ACCEPT`, `REJECT`, or `NEEDS_HUMAN`. A material objective,
  scope, owner, workspace, or authority change ends the assignment and
  requires the appropriate new assignment.
- **`DEPENDENCY_REQUEST`:** The Peer reports the exact needed owner, API,
  scope, workspace, or decision; bounded attempts; evidence; impact; and
  unblock condition, then stops affected work and routes the request through
  the Lead. The Lead accepts, rejects, reframes, or sequences reversible
  technical dependency work within authority, or escalates a reserved
  decision to the Human. The Peer never widens scope or coordinates scope
  directly.
- **`BLOCKED`:** Missing or conflicting authority, a prerequisite, external
  state, exact identity or evidence, or a required Human decision qualifies as
  blocked. The report includes evidence, impact, options, and an unblock
  condition; the candidate and workspace remain retrievable and affected work
  stops. Retry occurs only after a named prerequisite materially changes;
  blind polling and repeated identical attempts are prohibited.
- **Paseo route:** These reports use the terminal Peer Report route. No second
  control plane, improvised channel, or lifecycle inference may replace it.

## Anti-patterns

**Status-as-acceptance**

- **Signal:** Lifecycle status, passing tests, Reviewer approval, or Lead
  `READY` is presented as completed or accepted work.
- **Evidence required:** The exact candidate, candidate-bound verdict, direct
  Human acceptance route, and any unresolved decision or finding.
- **Open question:** Who inspected and accepted which exact artifact under
  what authority?
- **Allowed response:** Treat status as an attention signal; require the exact
  evidence chain and direct Human `LOCAL_ACCEPT` before claiming acceptance.

**Authority inference**

- **Signal:** A role name, task prose, report, protocol text, or exposed tool is
  treated as an Authority Grant.
- **Evidence required:** The active Role Profile, pinned protocol, effective
  tool set, and requested action.
- **Open question:** Which higher-precedence source grants this exact action,
  scope, and run?
- **Allowed response:** Stop the action unless the complete authority chain is
  present; request the missing Human decision or authorization without
  widening scope.

**Moving-scope collision**

- **Signal:** Review targets moving bytes, writers overlap, a dirty checkout is
  shared, or the latest handoff silently replaces an earlier one.
- **Evidence required:** Exact owner and scope, checkout identity and
  cleanliness, handback state, and Stable Candidate identity.
- **Open question:** Who owns this moving scope, and which immutable candidate
  is being evaluated?
- **Allowed response:** Restore one writer, isolated checkouts, explicit
  handback, and review of the exact Stable Candidate.

**Ceremony and polling debt**

- **Signal:** Bounded work gains a disproportionate council, status is polled
  without new information, identical retries continue, or another control
  plane is introduced.
- **Evidence required:** Task class and risk, decision-changing mandates,
  prerequisite state across attempts, and the proposed system of record.
- **Open question:** What new evidence can this ceremony, retry, or control
  surface produce?
- **Allowed response:** Use the smallest sufficient topology, wait only for a
  named prerequisite change, and keep Paseo as the sole lifecycle control
  plane.

## Evolution

- Evolution is event-driven. The Supervisor or Lead may propose an
  evidence-backed revision when boundaries, risks, workflow, or proportionality
  change.
- Only direct Human confirmation of the exact complete diff authorizes writing
  the canonical `.orchestration/workspace-protocol.md`. Actual revisions
  increment `version` monotonically and refresh `last_reviewed`. An unchanged
  release semantic does not require a version bump merely because a release
  occurred.
- Running assignments retain their pinned protocol for nonmaterial
  future-only revisions. A material authority, ownership, or acceptance change
  stops and re-evaluates affected running work before it continues; it does not
  silently change a pinned assignment.
- Git history is the sole revision history. No parallel changelog, lifecycle
  store, or second policy/control plane is created.
