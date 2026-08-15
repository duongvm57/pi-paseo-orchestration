# Workspace Protocol Authoring Guide

This guide defines the reference model used when authoring a repository's Workspace Protocol. The protocol is repository-specific orchestration policy: it decides how work is routed, owned, verified, reviewed, escalated, and accepted without replacing Paseo's lifecycle or workspace state.

## 1. Protocol boundary

A repository has one canonical `.orchestration/workspace-protocol.md`.

The protocol may:

- classify repository risks and work;
- narrow role behavior for this repository;
- permit tiny Lead self-work when Human authority and the active Role Profile allow it;
- require isolation, review, evidence, or escalation beyond the defaults;
- record project-specific anti-patterns and revision triggers.

The protocol cannot:

- grant `edit`, `local_commit`, recovery, publication, or another Capability;
- replace Paseo as lifecycle, workspace, parentage, follow-up, or timeline truth;
- redefine global Role Profiles;
- authenticate a Human or prove sandbox isolation;
- turn model output, tool status, or lifecycle status into acceptance.

Preserve this precedence:

```text
Role Profile
  > Workspace Protocol
  > ordinary task prose
```

A lower layer may narrow an upper layer but cannot widen it. Omission grants nothing.

## 2. Readers and decision authority

The Lead reads the protocol before routing governed work. A Supervisor reads it only under an authoring, audit, or revision mandate. A Peer receives only the constraints needed for its assignment; do not broadcast the complete protocol.

Use repository-specific allocations within these decision boundaries:

| Decision | Human | Supervisor | Lead | Peer |
|---|---|---|---|---|
| Product, priority, subjective quality | Decides | Surfaces evidence and questions | Frames the decision | Supplies bounded evidence |
| Irreversible trade-off, material cost or risk, external effect | Decides | Escalates causal evidence | Recommends and pauses | Reports impact; does not assume authority |
| Protocol or authority change | Confirms | Authors only when permitted | May propose | May not author or approve |
| Task framing, routing, dependency order, project verdict | Sets outer bounds | Observes and challenges | Decides within bounds | May reopen a failed premise |
| Assigned implementation or investigation | May constrain | Does not take over by default | Assigns and evaluates | Owns the assigned scope |
| Local Acceptance | Sole accepter through a direct canonical Human acceptance block | Never infers acceptance | Issues a candidate-bound project verdict; never accepts | Never self-accepts |

Disagreement is evidence to reconcile, not disobedience. A Peer may return `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, or `BLOCKED` without gaining authority to expand scope.

## 3. Required protocol content

The runtime accepts a closed Markdown schema. Use this exact shape; every H2-H6 heading is parsed as a protocol section, so keep labels inside sections as bold text or list items rather than additional headings.

<!-- canonical-protocol-skeleton:start -->
```md
---
status: active
version: 1
last_reviewed: YYYY-MM-DD
project_id: HUMAN_DEFINED_ID
repository_root: .
---

# Workspace Protocol

## Decision matrix

State all four role boundaries and explicit Human `must_ask` decisions.

## Task classes and routing

Define `tiny/bounded`, `cross-module/lifecycle`, and `architecture-sensitive` routing.

## Ownership and isolation

Define one-writer scope, isolated checkouts, dependencies, handback, and integration ownership.

## Candidate, verification, review, and acceptance

For every class, define the Git Stable Candidate, exact evidence, review trigger, Lead verdict, and prerequisites for direct Human Local Acceptance.

## Reopen, dependency, and blocked handling

Define `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, and `BLOCKED` evidence, decision owner, and bounded next action.

## Evolution

Define revision authority, Human confirmation, versioning, review triggers, and effects on running work.
```
<!-- canonical-protocol-skeleton:end -->

The only optional H2 headings are `Project criticality`, `Review and council rules` (or `Review and council`), `Anti-patterns`, and `Supervisor hints`. Omit an optional section when it does not change repository behavior. Do not create other headings.

### 3.1 Identity and applicability

Record:

- `status`;
- monotonically increasing `version`;
- `last_reviewed`;
- Human-defined `project_id`;
- `repository_root: .`;
- repository-wide applicability.

### 3.2 Optional project characteristics

When repository characteristics change routing or proof, record them under the optional `Project criticality` section:

- criticality;
- dominant risks;
- expensive-to-reverse effects;
- external side effects;
- subjective outcomes requiring Human judgment.

### 3.3 Decision matrix

Allocate decisions among Human, Supervisor, Lead, and Peer without exceeding Role Profile ceilings. Mark `must_ask` boundaries for authority, product, priority, irreversible choices, external effects, subjective acceptance, and material cost or risk.

### 3.4 Task classes and routing

Define all three classes:

1. `tiny/bounded`;
2. `cross-module/lifecycle`;
3. `architecture-sensitive`.

For each class, specify:

- default topology;
- owner and write scope;
- isolation requirements;
- Stable Candidate identity;
- exact verification evidence;
- independent-review trigger;
- verdict owner;
- prerequisites for direct Human Local Acceptance.

### 3.5 Ownership and handback

Require:

- one writer per moving scope;
- disjoint scopes and isolated checkouts for concurrent writers;
- review only against a Stable Candidate;
- explicit dependency ownership;
- explicit handback before ownership changes;
- an identified integration owner.

### 3.6 Escalation

Define these outcomes as decision requests, not failure or acceptance:

- `REOPEN_REQUEST`: evidence shows the task premise or foundation may be wrong;
- `DEPENDENCY_REQUEST`: another owner, API, scope, or prerequisite is required;
- `BLOCKED`: authority, prerequisite, external state, or a Human decision is missing after bounded attempts.

Each outcome must identify its evidence, decision owner, and allowed next action.

### 3.7 Optional project-specific anti-patterns

Add the optional `Anti-patterns` section only when causal evidence makes a pattern relevant to this repository. Keep entries inside that H2 without nested headings:

```md
**<name>**

- signal:
- evidence required:
- open question:
- allowed response:
```

A signal starts an investigation; it is not a verdict. The response must remain within existing authority.

### 3.8 Evolution

Define:

- who may propose a revision;
- who must confirm material changes;
- which repeated observations trigger review;
- how running work is re-evaluated after authority, ownership, or acceptance changes;
- how version and review date advance.

Use Git history as the change record. Do not create a parallel protocol changelog or lifecycle store.

## 4. Content to leave out

Record model and effort selection principles when they change routing. Keep concrete provider, model, and thinking tuples in Human-owned role settings.

Keep these outside the protocol:

- complete global role behavior already owned by Role Profiles;
- concrete provider/model/thinking tuples;
- task-specific file lists;
- secrets or credentials;
- instructions requiring a Peer to understand Paseo topology;
- ceremony applied to every task regardless of risk;
- unverifiable acceptance claims;
- self-issued authority;
- copied authoring workflow;
- lifecycle history already owned by Paseo.

Record allocations and constraints, not an essay about the orchestration system.

## 5. Routing patterns

Use the smallest topology that can produce trustworthy evidence.

### 5.1 Tiny or bounded

```text
Lead or one Engineer
  -> focused verification
  -> Lead verdict when required
  -> direct Human Local Acceptance when prerequisites pass
```

Permit Lead self-work only when it is tightly coupled, explicitly allowed by the protocol, and covered by current-run Human authority. Do not require a council by default.

### 5.2 Cross-module or lifecycle-sensitive

```text
Lead
  -> one Engineer in an isolated checkout
  -> Git Stable Candidate
  -> independent Reviewer when risk triggers it
  -> Lead verdict
  -> direct Human Local Acceptance when prerequisites pass
```

Add a read-only architecture disposition before implementation when ownership, migration, failure recovery, or lifecycle boundaries are unclear.

### 5.3 Architecture-sensitive

```text
Lead
  -> read-only Architect with a neutral brief
  -> binding design decision
  -> one Engineer for the moving scope
  -> independent Reviewer of the exact Stable Candidate
  -> correction by the same owner
  -> new Git Stable Candidate and Lead verdict
  -> direct Human Local Acceptance when prerequisites pass
```

For a difficult decision, multiple advisers need distinct mandates rather than duplicate votes. Compare alternatives, strongest counterarguments, and reversal conditions. Human judgment remains mandatory for irreversible product, cost, risk, or external-effect choices.

## 6. Evidence and independent judgment

### 6.1 Neutral briefs

Treat a plan as a **provisional map**. State the outcome, constraints, current evidence, risks, exclusions, and checkpoint. Avoid embedding a preferred verdict so deeply that the Peer can only confirm it.

Use natural role language and explicit reopen rights to reduce the **authority gradient**. Independence means evidence-backed judgment, not automatic agreement or performative opposition.

### 6.2 Stable Candidates

A v0.1 Stable Candidate has exactly this identity:

```text
git:v1:<task-base-full-oid>:<candidate-full-oid>
```

Branches, tags, abbreviated IDs, `HEAD`, worktree state, and workspace snapshots are not candidate identities. Candidate-required work without `local_commit` authority is `BLOCKED`; the protocol cannot invent a fallback. Every correction produces one new linear Git candidate and invalidates reviews or verdicts tied to the prior candidate.

### 6.3 Verification and acceptance

Keep these distinct:

- the writer supplies proof for its writes;
- the Reviewer tries to falsify the exact candidate;
- the Lead issues only the project verdicts assigned by the protocol;
- the Human decides owner-only trade-offs and subjective outcomes.

A passing test proves only the behavior it exercises. It does not prove product value, architectural fitness, permission to publish, or acceptance.

### 6.4 Sparse supervision

Prefer events, evidence, and meaningful deadlines over continuous status polling. After two equivalent failures with unchanged state, inspect prerequisites, quota, authentication, and authority before retrying.

## 7. Anti-pattern catalog

Use this catalog to prompt repository-specific questions. Do not copy every entry into every protocol.

### 7.1 Authority-gradient compliance

**Signal:** A Peer repeats the Lead's premise, checks no foundation, and always agrees.

**Question:** What evidence would confirm, partially support, challenge, or block the premise?

**Response:** Request an evidence-backed `CONFIRM`, `PARTIAL`, `CHALLENGE`, or `BLOCK`. Avoid performative contrarianism.

### 7.2 Pre-solving

**Signal:** The plan fixes every file, API, lifecycle, and solution before investigation; the Peer can only pass or fail it.

**Question:** Which assumptions remain untested?

**Response:** Recast the plan as a provisional map and permit `REOPEN_REQUEST`.

### 7.3 Symptom optimization

**Signal:** Repeated corrections patch the same symptom while complexity grows and the generating mechanism stays unchanged.

**Question:** What shared mechanism could produce the whole failure chain?

**Response:** Pause local patches and investigate that mechanism.

### 7.4 Architecture lock-in

**Signal:** Each change needs another adapter or exception because the original architecture is treated as immutable.

**Question:** What alternatives, counterarguments, and reversal conditions were omitted?

**Response:** Trigger independent architecture review for hard-to-reverse decisions.

### 7.5 Architecture fog

**Signal:** Abstractions multiply while ownership, transitions, or failure semantics cannot be stated plainly.

**Question:** Who owns each state, what changes it, and what behavior disappears if an abstraction is removed?

**Response:** Require concrete ownership, lifecycle, failure semantics, and a deletion test.

### 7.6 Moving-scope collision

**Signal:** Multiple writers modify one subsystem, or review occurs while the target changes.

**Question:** What exact scope and candidate does each owner hold?

**Response:** Restore one writer, isolated checkouts, explicit handback, and Stable Candidate identity.

### 7.7 Self-benchmarking

**Signal:** One agent defines success, implements it, measures it, and declares acceptance.

**Question:** Which blind spot could be shared by the metric and implementation?

**Response:** Have Human or Lead define the success boundary and use independent review where risk warrants it.

### 7.8 Test-shaped proof

**Signal:** Tests mirror implementation, mocks erase real failures, or passing checks do not establish the user outcome.

**Question:** Under which wrong mechanism would this test still pass?

**Response:** Add the smallest integration, migration, cancellation, or Human evidence that distinguishes the mechanisms.

### 7.9 Edge-case overengineering

**Signal:** Infrastructure cost exceeds the frequency and impact of the edge case it handles.

**Question:** What are the frequency, impact, simpler fallback, and reversal cost?

**Response:** Choose proportionate handling rather than treating completeness as inherently safer.

### 7.10 Polling debt

**Signal:** Status checks or identical retries continue while prerequisites remain unchanged.

**Question:** Which event or prerequisite could create new information?

**Response:** Use event-driven notification, bounded waits, and prerequisite checks.

### 7.11 Ceremony capture

**Signal:** Every task receives councils, votes, or reports regardless of risk; process outgrows evidence.

**Question:** Which additional seat could change the decision, and how?

**Response:** Use the smallest useful topology; give every adviser a distinct mandate.

### 7.12 Framing capture

**Signal:** All presented alternatives share the same untested framing.

**Question:** What is the underlying problem before considering the preferred solution?

**Response:** Ask a neutral Architect to reconstruct the problem; use sealed reports when independence matters.

### 7.13 False independence

**Signal:** A Reviewer inherits the Lead's session, hidden framing, or desired verdict.

**Question:** Is the reviewer fresh, neutrally briefed, and inspecting the exact candidate?

**Response:** Use a fresh session, neutral evidence, and no inherited reasoning chain.

### 7.14 Lead attention dilution

**Signal:** The Lead becomes the answer desk and loses track of dependencies, topology, or acceptance state.

**Question:** Does this question require project authority or only advice?

**Response:** Route ordinary advice elsewhere and return only condensed owner decisions to the Lead.

### 7.15 Skill pollution

**Signal:** Peers orchestrate, Leads sink into framework details, or roles load unrelated skills.

**Question:** Does this material serve the role's current attention layer?

**Response:** Keep macro orchestration with Leads, strategy and observation with Supervisors, and implementation techniques with Peers; disclose branch-specific material only when needed.

### 7.16 Status-as-acceptance

**Signal:** `finished` or `tests pass` is reported as completion without inspecting scope, diff, candidate identity, or unresolved evidence.

**Question:** Who inspected which exact artifact under what acceptance authority?

**Response:** Treat lifecycle status as a wake-up event and run acceptance against the exact artifact.

### 7.17 Supervisor overreach

**Signal:** A Supervisor edits implementation, issues architecture verdicts, or micromanages a Peer without a recovery mandate.

**Question:** Which owner has authority to act on the observation?

**Response:** Raise an evidence-backed question, relay a Human decision, or propose handoff or recovery. Implementation intervention requires explicit recovery authority.

## 8. Protocol evolution

Treat a new anti-pattern as a hypothesis:

```text
observation
  -> causal evidence
  -> recurrence or material-risk assessment
  -> Human-confirmed protocol revision
  -> new version applied to new work
```

A material change to authority, ownership, or acceptance rules requires running work to stop and be re-evaluated. Never silently repin it to the new protocol.

Prefer protocol evolution over infrastructure changes when the lesson is repository-specific. Change shared infrastructure only when the mechanism is cross-repository and enforceable there.

## 9. Authoring quality check

Before presenting a protocol diff, verify that:

- every required section contains a repository-specific decision;
- each task class names owner, Git candidate, evidence, review trigger, Lead verdict, and direct Human acceptance prerequisites;
- concurrent writers cannot own overlapping moving scopes;
- every escalation names a decision owner and bounded next action;
- each included anti-pattern entry contains signal, evidence, open question, and allowed response;
- review always targets an exact Stable Candidate;
- verification is not described as acceptance;
- Human `must_ask` boundaries are explicit;
- the protocol grants no Capability and claims no lifecycle truth;
- the protocol contains no secrets, task-specific scope, model settings, or duplicated Role Profile prose;
- version, review date, project identity, and repository applicability are exact.
