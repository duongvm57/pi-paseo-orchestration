# Pi Paseo Orchestration — Architecture

A deep dive into the architecture and design of `pi-paseo-orchestration`: governed
multi-agent work for [Pi](https://github.com/earendil-works/pi), running through Paseo.

The package gives each process one explicit role — **Supervisor**, **Lead**, or
**Peer** — and keeps Paseo as the source of truth for agents, workspaces,
parentage, and lifecycle. It adds policy guardrails, repository workflow rules,
evidence-bearing handoffs, and local Git candidate acceptance. There is no
coordinator: the Human creates the root Lead and a root Supervisor only when the
task class warrants one.

---

## Executive summary

Five ideas carry the design:

1. **Lead is a binding arbiter, not a plan-authoring bot-herder.** The Lead owns
   framing, routing, ownership, dependencies, integration, and the project
   verdict. It does not pre-solve difficult work and then hand Peers a typing job.
2. **Peer is an independent co-worker, not a function call.** One thin Peer
   profile; the assignment's disposition makes it an Engineer, Architect,
   Reviewer, or Scout. The Peer does not know or use Paseo.
3. **Supervisor is governance, outside the execution flow.** It observes
   Lead–Peer workflows for bias, lost momentum, and anti-patterns, and relays
   Human decisions. It never owns implementation or acceptance.
4. **Three instruction layers, not one fat prompt.** Role profile (identity and
   invariant) → Workspace Protocol (repository tactic) → assignment (bounded
   outcome). Precedence is one-way; a lower layer narrows but never widens a
   higher layer.
5. **Paseo is the only control plane.** The package adds policy guardrails and
   evidence contracts — not another scheduler or agent database.

```
                         Human
                           │
              ┌────────────┴────────────┐
              │                         │
        Supervisor                    Lead
   process observation          project coordination
              │                         │
              └──── observes ───────────┤
                                        │
                                    Peer(s)
                         Engineer / Architect /
                           Reviewer / Scout
```

This is not a rigid `Supervisor > Lead` hierarchy: the two roles hold different
kinds of authority, and the Human keeps owner authority.

---

## Why subagents are not enough

A subagent API solves **process creation**. It does not solve ownership,
independent judgment, coordination, or acceptance. Multi-agent coding commonly
fails in these ways:

- **Authority gradient** — the parent presents the answer, so the child agrees
  and optimizes that answer instead of checking whether its premise is wrong.
- **Perfect-plan trap** — the coordinator pre-selects files, APIs, and lifecycle;
  the worker becomes a typing bot and real dependencies surface late as patches.
- **Attention dilution** — the coordinator also implements and explains local
  details, losing the project-wide view of ownership and lifecycle.
- **Unsafe parallelism** — two agents share one checkout and overwrite the same
  moving files. An agent ID is not filesystem isolation.
- **Biased or stale review** — a reviewer forked from the author inherits the
  framing; a reviewer reading changing files approves a candidate that no longer
  exists.
- **False completion** — `finished`, `idle`, and passing tests are signals, not
  proof that the right artifact was reviewed by the right authority.
- **Split control planes** — workers create untracked workers and no single system
  knows who owns the task, workspace, or correction.

---

## 1. Provenance and conformance

The SLP model and the three instruction layers derive from an internal reference
(the deep dive of a reference orchestration model). That reference distinguishes
**[DIRECT]** conclusions (stated directly by the reference model) from
**[SYNTHESIS]** reconstructions (profiles, prompts, and templates rebuilt from
invariants). Role and provider **names are not the invariant** — independent
judgment and attention are.

This package was checked against the reference by an independent committee of
three contrasting providers (Codex, Grok, and Pi/DeepSeek), which recorded 19
gaps (8 confirmed, 3 partial, 8 new) and returned a PARTIAL verdict with a
blocker. Each was closed across the fix chain. The highest-signal fixes:

- **Recovery (high).** Supervisor recovery could not mint a root successor Lead —
  agent-scoped `create_agent` only creates children, yet Lead/Supervisor fail
  closed on non-root parentage. The Supervisor now proposes the successor and the
  Human creates it.
- **Peer protocol read (medium-high).** The Peer could read the Workspace
  Protocol through `bash` (`cat`/`sed` on `.orchestration/...`). The peer bash
  gate now blocks the protocol path.
- **Skill topology (medium).** Skills were not role-scoped. Each role profile now
  names the skills it may load (`ppo-orchestrate` for the Lead,
  `workspace-protocol` for the Supervisor under mandate, neither for the Peer).
- **Passive governance (G4/G8).** The first implementation inverted the
  reference's observation model: the Lead pushed six milestone events to a
  Supervisor whose ID the Human had announced to it. The Lead now emits only a
  terminal `LEAD_FINISHED` event to a root Human observer, and the Supervisor
  observes passively through Paseo evidence; a Supervisor is never a Lead event
  recipient.
- **Peer Paseo-awareness (G1).** The Peer profile no longer names Paseo
  parentage; it derives its parent Lead from the injected parent identity, and
  never reads Paseo state or the protocol.
- **Multi-Lead binding (G7).** Per-Lead task/workspace binding is a map keyed by
  Lead identity, not a single scalar pair shared across all bound Leads.

Reconciled as non-gaps: the Human-only Local Acceptance boundary (a stricter
repository decision, compatible with owner authority), Git-only candidates (v0.2
always authorizes local commit, closing the snapshot precondition), and
`project_id` living in the protocol rather than every assignment.

---

## 2. Prerequisites

Before standing up the roles, the substrate must be right:

- Pi, Paseo and its CLI, and `pi-mcp-adapter` configured to expose the Paseo MCP
  server to Pi.
- A Git repository for governed work, with the ability to create worktrees for
  concurrent writers.
- A place for the Workspace Protocol (`.orchestration/workspace-protocol.md`) and
  the optional Supervisor Notebook (under Pi's config directory).

A preflight (`/ppo:doctor`) answers four questions: is the control plane
reachable; which providers/models actually exist; which workspaces/agents already
exist and must be preserved; and does the checkout carry user-owned changes that
must not be overwritten.

### One control plane

Within a task, only Paseo owns agent lifecycle, workspace, parentage, follow-up,
and timeline. If a Lead uses Paseo while a Peer spawns native subagents, two
control planes share no ledger and review/cleanup become unreliable. The role
ceilings enforce this: a Peer has no `mcp` tool and its `bash` blocks the Paseo
CLI.

### Independent sessions

A Reviewer or Supervisor must have independent attention. A session forked from
the Lead inherits its premise and framing. Reviewers are therefore fresh agents
briefed neutrally against an exact candidate.

### Workspace isolation

One workspace ID is not filesystem isolation. The minimum safe rule: one writer
per moving scope, separate worktrees for concurrent writers, review only a stable
candidate, explicit handback.

### Discoverable providers

Role policy never hard-codes a model ID. The protocol carries selection
principles; concrete provider/model/thinking tuples live in Human-owned settings
(`/ppo:settings`); the Lead inspects live providers/models before routing.

### Acceptance needs evidence

`idle`, `finished`, "done", and exit code 0 are attention signals, not
acceptance. Acceptance requires the exact artifact, a stable candidate identity,
exact verification commands and output, independent review when required, and an
owner with the authority to accept.

### Human decision boundaries

The Human defines, up front: which projects need independent review; what may be
edited, committed, pushed, or deployed; which scope changes the Lead may decide;
which architecture contracts require the Human; the model budget; and the
evidence level for `ACCEPT`.

---

## 3. The three instruction layers

| Layer | Lifetime | Holds | Must not hold |
|---|---|---|---|
| Role profile (`profiles/*.md`) | Durable, cross-repo | identity, authority, invariant, anti-pattern guard | one repo's tactic |
| Workspace Protocol (`.orchestration/workspace-protocol.md`) | Durable per repo | topology, model/effort policy, review rhythm, escalation | one task's detail |
| Assignment (Peer brief) | One assignment | objective, scope, ownership, exclusions, verification, handoff | the organization manual |

The Lead reads the full protocol; a Peer receives only the extracted constraints
and is blocked from reading the protocol (a read gate plus a peer bash guard).
Precedence is `Role Profile > Workspace Protocol > ordinary task prose`; a lower
layer narrows but never widens a higher layer, and omission grants nothing.

---

## 4. Role model

### 4.1 Human / Owner

Retains owner authority: product intent and priority, irreversible trade-offs,
protocol and authority changes, external effects, material cost or risk, and
direct Local Acceptance. The Human creates the root Lead, and a root Supervisor
only when the task class warrants one. The Human may converse mainly with the
Supervisor to keep the Lead's coordination attention free.

### 4.2 Supervisor — governance observer

**Goal.** Protect the quality of the **workflow and reasoning process**, not
feature implementation.

**Perspective.** Wider than one task: Lead–Peer conversation, session and
git/workspace history, repeated tool failures, lost momentum, recurring
anti-patterns, decisions lost to compaction or handoff.

**Authority it holds.** Observe one or more assigned projects/workspaces; ask a
bound Lead why it chose a strategy; report bias or risk to the Human; relay a
recorded Human decision to the exact Lead; propose a profile or protocol revision;
record causal evidence in the Notebook; propose a successor Lead with evidence
and a bounded handoff.

**Authority it does not hold.** Implementation scope, project architecture,
project acceptance, editing code "to help", or turning a hypothesis into a
correction order without reconciling evidence. It messages only a bound Lead —
never Peers — and never acts as a substitute Lead.

**Recovery.** A successor Lead is a root agent; agent-scoped `create_agent` only
mints children, so the **Human creates the root successor** and the Supervisor
relays the bounded handoff. The Supervisor cannot mint a root Lead itself.

**Output.** Observation, evidence, suspected mechanism with uncertainty, impact,
an open question, recommendation, and whether Human escalation is needed.

**Notebook.** Entries carry causal context (observation, evidence, mechanism,
impact, question, recommendation, escalation) — not verdicts — so the protocol
can evolve from mechanism rather than slogans.

### 4.3 Lead — project authority

**Goal.** Turn an objective into a trustworthy project-level result by owning
framing, topology, role/disposition, ownership, dependency, stable checkpoints,
review, integration, and the project verdict.

**Core behavior.** Reconstruct the task without pre-solving; assign exactly one
owner per moving scope; give neutral, bounded briefs; grant Peers
`REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, `BLOCKED`; wait for events rather than
poll; review only a stable candidate; inspect the actual artifact and evidence;
decide or escalate decisions beyond its authority.

**When does the Lead do the work itself?** Tiny, tightly-coupled tasks may be
Lead self-work when the protocol opts in. Bounded implementation goes to one Peer
Engineer; difficult architecture to a read-only Architect first; difficult
acceptance to a Reviewer who did not implement; subjective/product decisions go
to the Human with evidence, not a simulated proof.

**Inputs.** Objective and acceptance boundary; repository root; the pinned
Workspace Protocol; current provider/model/workspace inventory; user authority;
known dependencies and exclusions.

**Outputs.** Decomposition and owner map; routing decision; answers to
dependency/reopen requests; stable candidate identity; verification evidence; a
project verdict; remaining risks and Human decisions.

### 4.4 Peer — bounded independent worker

**Goal.** Own one bounded outcome and form independent technical judgment. A Peer
is not a smaller Engineer — it is a base profile; the assignment's disposition
makes it an Engineer, Architect, Reviewer, Scout, feature owner, proof auditor, or
shadow implementer.

**Invariants.** Work only in the assigned scope; preserve unrelated changes; no
agent management and no Paseo; never self-expand scope; challenge the premise with
evidence; verify its own writes but never self-accept a difficult change.

**Thin profile.** The profile carries only role invariants; disposition and
method arrive in the assignment. Communication is only to the parent Lead through
narrow kinds (`question`, `blocked`, `dependency`, `progress`, plus a terminal
`handoff` report).

---

## 5. Paseo configuration

### 5.1 What Paseo owns

Provider/model discovery, durable agent identity, parentage, workspace placement,
provider session, process lifecycle, timeline, follow-up, and schedules/heartbeats
when needed. Paseo does **not** decide which council a repo uses, which model tier
a bounded bug gets, which review gate a migration requires, or which risk the
Human accepts — those belong to the protocol and the assignment.

### 5.2 Providers and roles

Three role providers: `ppo-supervisor` (governance observer), `ppo-lead` (project
authority), `ppo-peer` (flexible bounded worker). They are Pi/Paseo providers; the
names are deployment vocabulary, not the invariant.

### 5.3 Model and effort routing

Profiles set defaults; the protocol sets policy; the Lead selects the actual model
after discovering availability. Read-only inventory → economical model;
bounded familiar implementation → strong coding model; cross-module
lifecycle/ownership → strong reasoning model; independent falsification → a
separate provider or session; structured monitoring → economical model. Two
models agreeing does not make an unevidenced conclusion true.

### 5.4 Agent creation contract

Every significant task carries: repository root, workspace/worktree, role and
disposition, objective, owned scope, excluded scope, authority, verification, and
handoff. The Lead binds the route (`model_route`), its own identity
(`parent_lead_agent_id`), and `write_mode` (`write` for Engineer, `read-only` for
Architect/Reviewer/Scout) once in the Peer's initial prompt.

### 5.5 Event-driven monitoring

Polling wastes context. The Lead confirms an agent started, then waits for the
finish notification (`notifyOnFinish`), uses bounded waits, and treats a
low-frequency heartbeat as a safety net only — never re-reads the timeline to
"feel like it is managing".

---

## 6. Workspace Protocol

### 6.1 Definition and readers

`.orchestration/workspace-protocol.md` is the repository-specific orchestration
policy — like `AGENTS.md`, but read by the Lead (mandatory, before orchestration)
and the Supervisor (only under an authoring/audit mandate), and **not** broadcast
to Peers. The Lead extracts the relevant constraints into each assignment.

### 6.2 Required content

Project criticality and risk classes; default topology per task class; model/effort
selection principles; when to use Architect/Reviewer/council; one-writer and
isolation rules; stable checkpoint and candidate identity; verification/proof
expectations; `REOPEN`/`DEPENDENCY`/`BLOCKED` handling; Human decision boundaries;
project-specific anti-patterns; the Supervisor observation/update process; and
versioning with a review date.

### 6.3 What it must not contain

Global role behavior (owned by profiles); guessed model IDs without a fallback
principle; task-specific file lists; secrets; policy requiring a Peer to
understand Paseo topology; ceremony for every task; unverifiable acceptance
statements; self-issued authority.

### 6.4 Evolution

A new anti-pattern is a hypothesis: observation → causal evidence → recurrence or
material-risk assessment → Human-confirmed revision → new version applied to new
work. Git history is the only change record. A material authority, ownership, or
acceptance change stops and re-evaluates running work rather than silently
re-pinning it.

---

## 7. Runtime architecture

The extension (`extensions/pi-paseo-orchestration.ts`) is the single policy
mechanism: one activation latch plus one call-time gate.

### 7.1 Activation and drift latch

First successful activation latches role, agent identity, settings snapshot,
profile source, and profile digests. Everything later is drift-checked against
that latch; a fresh process is required to change role. Lead/Supervisor fail
closed on non-root parentage; a Peer fails closed unless its process parent equals
the bound Lead. Model and thinking level are latched and re-verified at runtime.

### 7.2 Tool ceilings

`supervisor` and `lead` get `read, bash, mcp`; `peer` gets `read, bash`. `write`
and `edit` are granted only when a Lead protocol opts into self-work or a Peer
assignment binds `write_mode: write`. `mcp_script` is in no ceiling.

### 7.3 MCP targets and operation normalization

The outer `mcp` tool is allowlisted per role and operation. The Lead may mint and
control Peer children (`create_agent`, `send_agent_prompt`, `get_agent_status`,
`get_agent_activity`, `cancel_agent`, `archive_agent`) plus discovery. The
Supervisor may only observe (`list_agents`, `list_workspaces`, `get_agent_status`,
`get_agent_activity`) and message its bound Lead (`send_agent_prompt`). The Peer
has no MCP. Operation names are normalized — canonical (`create_agent`) and
adapter-prefixed (`paseo_create_agent`) produce identical decisions; unknown
prefixes stay blocked.

### 7.4 Call-time gates

- **Peer bash** blocks the Paseo CLI and access to the Workspace Protocol path
  (`.orchestration/...` or `workspace-protocol.md`).
- **Publication** routes (`git push`/`merge`, `gh pr`, deploy CLIs) are always
  blocked; `git commit --amend` is forbidden.
- **Local commit** requires the Lead's protocol opt-in or the Peer's write mode.
- **`write`/`edit`** require the same write capability.
- **Peer read gate** blocks `read`/`grep`/`ls`/`find` on the protocol path.

### 7.5 Peer Report envelope

A Peer's terminal response is a closed, versioned JSON envelope —
`PROGRESS`, `HANDOFF`, `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, or `BLOCKED` — with
exact peer/parent/task/assignment IDs and a kind-specific payload. It is validated
as a document only: it grants no authority and accepts nothing.

### 7.6 Stable Candidate

Every write-producing class requires the exact identity
`git:v1:<task-base-full-oid>:<candidate-full-oid>`. A branch, `HEAD`, lifecycle
state, or passing tests alone is never a candidate. Corrections produce a new
linear candidate and invalidate reviews tied to the prior one.

### 7.7 Doctor, Settings, Notebook

- `/ppo:doctor` reports readiness without mutation (Paseo connection, required
  operations, identity, self-inspect, role parentage, provider, workspace binding,
  Supervisor–Lead binding, Peer parent binding, event capabilities).
- `/ppo:settings` owns concrete provider/model/thinking tuples and installs the
  `ppo-*` providers.
- The Supervisor Notebook (`/ppo:notebook-init` + `supervisor_notebook_append`)
  records causal governance evidence outside the repository.

---

## 8. Acceptance model

Verification is not acceptance. The chain is:

```
Engineer proves its writes
  → an independent Reviewer falsifies the exact candidate (when required)
  → the Lead issues a candidate-bound verdict (READY / NOT_READY / NEEDS_HUMAN)
  → the Human issues direct Local Acceptance
```

Lifecycle status, test success, Reviewer approval, and even a Lead `READY` never
imply acceptance. Local Acceptance is Human-only; no relayed message or role
verdict substitutes for it. `NOT_READY` covers technical/identity/scope/evidence
failure; `NEEDS_HUMAN` covers gates passing while a Human-only decision remains.

---

## 9. Philosophy

- **Independent co-worker, not a function call.** Strong agents add value only
  when they can recognize a wrong premise. A neutral brief plus explicit reopen
  rights beats "implement X, PASS/FAIL".
- **Authority gradient.** The steeper the gradient, the weaker the judgment.
  Reduce it with natural role language, outcome ownership, and evidence-based
  reconciliation — while avoiding performative contrarianism.
- **Plan is a provisional map.** A good plan names the outcome, boundaries, risks,
  and checkpoints; it does not pretend every file/API is known.
- **One writer, stable snapshot.** Reviewing a moving target creates false
  confidence.
- **Verification ≠ acceptance.** The writer proves, the Reviewer falsifies, the
  Lead verdicts, the Human accepts owner-only trade-offs.
- **Sparse, event-driven supervision.** Intervene on events, evidence, or
  meaningful deadlines — not continuous status.
- **Continuous optimization lives in the protocol.** Repository lessons patch the
  protocol, never fork the infrastructure.
- **Skill topology follows attention.** Lead = macro (decomposition, routing,
  review); Supervisor = strategy (timeline, anti-pattern, notebook, recovery);
  Peer = micro (language/framework/test/debug).

---

## 10. Anti-pattern catalog

The authoring guide carries the full 17-entry catalog; a repository protocol keeps
only the entries with causal, repository-specific evidence. Highlights:

- **Sheep / authority-gradient compliance** — Peer repeats the premise; respond
  with evidence and an open question, not "please critique".
- **Pre-solving / perfect-plan trap** — recast the plan as a provisional map.
- **Parachute optimization** — a third correction on the same symptom; stop and
  ask which shared mechanism produces the whole chain.
- **Architecture lock-in and fog** — demand concrete owners, transitions, failure
  semantics, and a deletion test.
- **Moving-scope collision** — restore one writer, isolated checkouts, exact
  candidate.
- **Self-benchmark / self-acceptance** — separate metric, implementation, and
  acceptance authority.
- **Test-shaped proof** — ask under which wrong mechanism the test still passes.
- **Polling/loop debt** — after two identical failures, check the prerequisite.
- **Ceremony capture** — smallest useful topology; every adviser a distinct
  mandate.
- **Framing capture** — reconstruct the real problem before the preferred
  solution; use sealed reports when independence matters.
- **Forked independence** — fresh session, neutral brief, exact candidate.
- **Status-as-acceptance** — status only wakes the owner; acceptance runs on the
  exact artifact and authority chain.
- **Supervisor overreach** — an evidence-backed question or a relayed decision,
  never a second Lead.

---

## 11. Topology by difficulty

| Class | Topology |
|---|---|
| Tiny / bounded | Lead or one Engineer → focused checks → Lead inspect → Human accept |
| Cross-module / lifecycle | Lead → one Engineer in an isolated checkout → Stable Candidate → Reviewer if risk triggers → Lead verdict → Human accept |
| Architecture-sensitive | read-only Architect (neutral brief) → Lead design decision → one Engineer → fresh Reviewer → correction → new candidate → Lead verdict → Human accept |

A difficult decision may warrant multiple advisers with **distinct mandates**
rather than duplicate votes; provider count is not authority.

---

## 12. Operational checklist

**Before launch** — correct repo root and identity; protocol read and pinned;
providers/models/workspaces inspected, not guessed; task has objective, ownership,
exclusions, authority, verification; concurrent writers isolated; the brief
carries no disguised verdict.

**While running** — no infinite polling; Peers have reopen/dependency/blocked
rights; scope expansion only proposed, never self-executed; findings are
hypotheses with evidence; disagreement is not disobedience; a repeated correction
triggers a root-mechanism check.

**Before acceptance** — candidate stable with exact identity; actual artifact
inspected; verification command and output real; independent review when required,
against the exact candidate; unresolved findings visible; the accepter has the
right authority; no orphaned task-local heartbeat or schedule.

---

## 13. Boundary: a cooperative guardrail, not a sandbox

The extension narrows Pi's active tools and rejects recognizable disallowed
calls. It is a cooperative in-process policy guardrail — **not** a sandbox or an
authentication boundary. It provides no filesystem, process, network, Git, or
identity isolation; retained shell access and other extensions can bypass
recognizable checks. The role ceilings shape attention and availability, which is
the load-bearing mechanism; they are not a security boundary.
