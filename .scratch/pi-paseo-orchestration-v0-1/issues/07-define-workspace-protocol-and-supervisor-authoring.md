# Define Workspace Protocol and Supervisor authoring

Type: grilling
Status: resolved

Blocked by:

## Question

What exact repository-specific decisions must `.orchestration/workspace-protocol.md` contain, and how should a Supervisor skill interview the Human, create/version it, and preserve the separation between Role Profile, Workspace Protocol, and Task Assignment?

## Answer

### Purpose and scope

`.orchestration/workspace-protocol.md` is the repository-specific orchestration contract. It defines how this repository routes work, chooses proportionate topology, assigns moving scopes, isolates writers, verifies stable candidates, and escalates decisions. It applies to the whole repository from one file under the repository root; v0.1 has no subdirectory overlays.

It is not a Role Profile, Task Authority Envelope, task brief, authentication boundary, filesystem/process/network/Git sandbox, Paseo lifecycle ledger, or reporting mailbox. Paseo remains the sole lifecycle/workspace/parentage control plane. Reporting transports remain the subject of ticket 12.

### Identity, validity, and activation

The protocol metadata must include:

- `status`;
- monotonically increasing `version`;
- `last_reviewed`;
- a Human-defined `project_id`;
- `repository_root: .` and repository-wide applicability.

Absolute paths are not project identity, and remote/VCS identity is not mandatory. The Lead must resolve the current repository root, locate the protocol there, and pin the protocol version/digest into task evidence. A copied protocol is not valid for a new repository until Human resets/reviews its identity and metadata.

Missing, empty, malformed, identity-mismatched, or conflicting protocol state fails closed for governed orchestration. Doctor/repair paths remain available to expose the problem. An absent optional section means no additional policy or permission; it never means permission by default.

### Required and optional sections

The required core is:

1. status, version, review date, and identity;
2. the Human/Supervisor/Lead/Peer decision-boundary matrix;
3. three risk-based task classes and routing;
4. ownership, one-writer, workspace-isolation, and handback rules;
5. a per-class Stable Candidate, verification, review, and acceptance matrix;
6. `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, `BLOCKED`, and escalation handling;
7. protocol evolution rules.

Optional sections are allowed only from the fixed schema: project characteristics/criticality, model/effort hints, review/council rules, anti-pattern catalog, and Supervisor observation/authoring hints. Optional content cannot grant a capability or override a required boundary.

### Authority boundaries

- **Human** owns product objective and priority, irreversible architecture/trade-offs, external side effects, authority/protocol changes, subjective acceptance, and cost/risk above the declared threshold. The Human is the final protocol approver.
- **Supervisor** observes workflow and reasoning, records causal evidence, interviews the Human, drafts or updates the protocol after direct Human confirmation, and proposes revision or recovery. It does not own implementation, project architecture, project acceptance, or unilateral authority changes.
- **Lead** reads the full protocol before orchestration, resolves identity, selects a task class and routing within the contract, owns topology/ownership/dependencies/integration, and gives the project verdict within its current Role Profile and Task Authority Envelope.
- **Peer** does not read the full protocol or edit it. The Lead passes relevant constraints in the assignment. Peer owns one bounded outcome, preserves unrelated work, and may challenge premises through the three escalation signals.

The protocol can narrow workflow and permit a repository strategy such as tiny Lead self-work, but it cannot grant `edit`, `local_commit`, recovery, or any other capability. Effective authority remains bounded by Role Profile and the current-run Task Authority Envelope. A protocol conflict with either layer blocks the affected action; it is not silently ignored or interpreted as an override.

### Task classes, routing, ownership, and evidence

The protocol uses three semantics rather than a long feature taxonomy:

- `tiny/bounded`: the smallest topology and focused verification; Lead self-work is still denied unless the protocol permits it and a valid `lead_tiny` grant exists;
- `cross-module/lifecycle`: explicit owner, isolated workspace for writers, stronger lifecycle evidence, and review when the class matrix requires it;
- `architecture-sensitive`: independent reconstruction/review and evidence proportionate to irreversible ownership or lifecycle decisions.

Each class must define minimum topology, candidate identity, workspace/writer rule, verification commands or evidence, reviewer trigger, and accepter. A moving scope has one writer. A shared workspace with two writers is blocked until scopes are separated by worktree or an explicit handback. A Reviewer examines only the exact immutable Stable Candidate; if that candidate changes, the prior review is invalid.

`REOPEN_REQUEST` means the foundation, premise, lifecycle, API, ownership, or verification assumption no longer stands. `DEPENDENCY_REQUEST` means another owner, API, scope, workspace, or decision is required. `BLOCKED` means authority, prerequisite, external state, or Human decision is missing. None authorizes scope expansion or unbounded retry. Lifecycle status, test pass, or a `done` message is not acceptance.

The protocol must define a lean path for the smallest class. Lead may not waive a protocol-mandated ceremony; if a protocol demands disproportionate ceremony, the issue is escalated and the Human revises the protocol. If the Human decision boundary is absent or ambiguous, Lead pauses irreversible action, presents choices and evidence, and asks the Human rather than inferring permission. The mandatory Human boundary includes product/priority, irreversible trade-offs, external effects, authority/protocol changes, subjective acceptance, and material cost/risk.

### Read and authoring workflow

Lead must read the complete protocol and carry its pinned version/digest into task context before orchestration. Without evidence of that read, Lead cannot orchestrate. Peer must not use the full protocol as task authority; a mistaken full read is a governance violation, not a new authority source. The runtime may apply narrow recognizable guards but does not claim filesystem isolation.

Supervisor interviews the Human breadth-first and then narrows the contract: identity/scope; criticality/risk; task classes/routing; ownership/isolation; verification/candidate acceptance; escalation and Human `must_ask` boundaries; anti-patterns and evolution. After each group it restates the decision, exposes hidden assumptions, contradictions, and downstream impact, and only then builds a draft diff. The Human confirms that exact diff before Supervisor writes or updates the canonical file. Lead may propose a change but cannot write it; Peer cannot read or edit the protocol.

A `lead_tiny` Envelope cannot override a protocol prohibition. Lead must refuse or delegate; the Human must approve a protocol revision before the strategy changes. Supervisor has no temporary override and cannot retroactively change a pinned task. Supervisor may only propose a revision or a separately valid Human-approved recovery grant.

### Versioning, review, history, and conflicts

`version` increases and `last_reviewed` is refreshed for each approved revision. Git history is the canonical history; no parallel changelog is required. Writes use optimistic concurrency against the Human-approved version/digest. If another person changes the file first, the update stops, the new diff is re-read, and Human confirmation is obtained again; last-write-wins is forbidden.

A task pins its protocol version/digest. New revisions apply to new tasks. If a revision changes authority, ownership, or acceptance for a running task, that task stops and is re-evaluated instead of silently switching policy mid-run.

### Stress-test outcomes

- missing, empty, malformed, or identity-invalid protocol: fail closed; doctor/repair remains available;
- Role Profile conflict or attempt to exceed the Envelope: block the affected action;
- Peer reads the full file: no authority is gained; report the governance violation;
- Lead has not read the full file: no orchestration;
- tiny Lead task prohibited by protocol: refuse or delegate;
- protocol changes mid-task: keep the pinned version unless a material boundary change forces stop/re-evaluation;
- two concurrent protocol editors: optimistic-concurrency stop and fresh Human confirmation;
- Supervisor attempts an authority change: proposal only;
- excessive ceremony for a small task: lean path is required; conflict escalates rather than being silently waived;
- two writers/shared workspace: block and isolate or hand back;
- candidate changes during review: previous review is invalid;
- unclear Human boundary: pause and ask;
- old protocol copied to a new repository: fail identity until Human resets and reviews it.
