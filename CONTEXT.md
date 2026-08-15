# Pi Paseo Orchestration

A native Pi package that applies reference role governance while leaving lifecycle and workspace truth with Paseo.

## Language

**Role Profile**:
A durable identity and authority contract for Supervisor, Lead, or Peer.
_Avoid_: Agent type, disposition

**Workspace Protocol**:
A repository-specific orchestration contract interpreted by the Lead. Here, workspace means the project's operating context, not a Git worktree.
_Avoid_: Global role prompt, task brief

**Assignment**:
The exact Lead-issued bounded outcome for one Peer run. It is a workflow fact, not a capability credential or authentication.
_Avoid_: Task prose as authority, permanent permission, role identity

**Peer Report**:
A versioned, evidence-bearing terminal handoff from one Peer run to its exact parent Lead. It is neither proof of delivery or acceptance nor a source of authority.
_Avoid_: Status message, mailbox event, authority grant

**Supervisor Notebook**:
A Human-owned, project-scoped, append-only store of causal governance evidence written by Supervisors. It is historical evidence, not authority, task or lifecycle state, acceptance, or a communication/control plane.
_Avoid_: Task ledger, mailbox, lifecycle store

**Human-only boundary**:
A decision or effect reserved for the Human: publication, protocol mutation, secrets/material cost, irreversible trade-offs, and Local Acceptance.
_Avoid_: Role identity, unrestricted control

**Capability**:
One concrete action exposed to a run, such as `edit` or `local_commit`. Ordinary local reversible work comes from the initial Human task or an Engineer write-mode assignment.
_Avoid_: General trust, sandbox guarantee

**Policy Guardrail**:
In-process capability shaping that limits exposed Pi tools and rejects recognizable disallowed calls without claiming filesystem, process, network, Git, or identity isolation.
_Avoid_: Sandbox, authorization boundary

**Stable Candidate**:
An immutable, exactly retrievable local work result eligible for verification and acceptance.
_Avoid_: Working tree, finished status

**Local Acceptance Boundary**:
The terminal workflow state where an exact Stable Candidate is accepted locally without publication.
_Avoid_: Merge-ready, deployed
