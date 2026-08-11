# Define Lead–Peer orchestration and escalation

Type: grilling
Status: resolved
Blocked by: 03, 05, 06, 07, 12

## Question

What is the smallest adaptive Lead–Peer lifecycle for decomposition, one-writer ownership, dispositions, REOPEN/DEPENDENCY/BLOCKED handling, fresh review when required, correction by the original writer, and evidence handoff without fixed ceremony?

## Answer

## Governing invariants

- Paseo remains the only lifecycle, workspace, parentage, follow-up, and timeline control plane. This contract creates no scheduler, queue, daemon, mailbox, task ledger, candidate database, delivery service, or second orchestration runtime.
- Lead owns project framing, adaptive topology, assignment, dependencies, integration, and the project verdict. It does not pre-solve difficult implementation and then ask a Peer to type the answer.
- One durable Peer Role Profile supports task-scoped Engineer, Architect, Reviewer, and Scout dispositions. A disposition is assignment context, not role identity or authority.
- Role Profile, pinned Workspace Protocol, and current-run Task Authority Envelope remain ceilings. Assignment prose, report content, verdicts, lifecycle state, tests, and candidate references never grant capability.
- Peer has no Paseo/orchestration surface. Every Peer run terminates with the v1 Peer Report defined by **Define non-disruptive Peer-to-Lead reporting**.
- A report, `HANDOFF`, lifecycle `idle`/`finished`, native notification, verification pass, or Reviewer approval is not acceptance.
- Lead self-work is limited to a genuinely tiny task only when the pinned Workspace Protocol permits it and a direct Human `lead_tiny` grant permits the exact current-run scope/capability. If the task becomes difficult, Lead stops rather than widening the grant.

## Minimal adaptive lifecycle

The lifecycle is a set of evidence gates, not a fixed ceremony and not a new persisted state machine:

1. **ORIENT** — Lead validates governed activation, exact repository/project/workspace identity, provider/model availability, the Human objective and boundaries, and reads the complete Workspace Protocol. It pins the task revision and protocol version/digest. Invalid or missing prerequisites stop orchestration.
2. **CLASSIFY** — Lead applies the protocol's `tiny/bounded`, `cross-module/lifecycle`, or `architecture-sensitive` criteria and records the evidence/rationale. If technical facts are missing, no write starts: Lead uses the smallest read-only Scout or Architect investigation needed, then classifies again. If the missing item is a Human decision boundary, Lead asks the Human instead of guessing.
3. **FRAME** — Lead decomposes only enough to define bounded outcomes, ownership, exclusions, dependencies, risk, authority requirements, verification, report requirements, and escalation. Solution, file, API, and lifecycle hypotheses remain explicitly provisional unless already evidenced or Human-decided.
4. **ROUTE** — Lead selects the smallest topology allowed by the class and current risk. It either uses a permitted `lead_tiny` run or creates one Peer assignment at a time per moving scope. Optional topology gates are skipped unless their trigger is present.
5. **ASSIGN/START** — Lead mints exact task/assignment identity before `create_agent`, launches against inspected provider/workspace facts, then binds the returned child ID. Write does not begin without the separately valid direct Human-issued current-run Peer Envelope.
6. **WAIT** — Lead uses a reserved idle wait only under the notification rules below; otherwise it performs no polling. Peer runs terminally report meaningful progress, requests, blocked state, or handoff.
7. **EVALUATE** — Lead validates the exact report identity, assignment, parentage, pins, evidence, and report kind. It reconciles requests and dependencies within its boundary or escalates them. Report arrival alone does not advance acceptance.
8. **CANDIDATE** — A write assignment must produce the Stable Candidate required by the assignment before `HANDOFF` can be evaluated. Exact Git candidate construction and eligibility are delegated to **Define Git candidate review and local acceptance**.
9. **REVIEW/CORRECT when triggered** — A fresh independent Reviewer falsifies only the exact Stable Candidate when required. Findings return to the original valid writer; every changed candidate invalidates earlier review results.
10. **PROJECT VERDICT** — Lead issues one structured project verdict for the exact candidate and evidence within its authority. Unresolved Human-only decisions remain explicit.
11. **HUMAN DECISION when required** — Human decides must-ask product, priority, irreversible trade-off, external side effect, authority/protocol change, subjective acceptance, or material cost/risk questions.
12. **LOCAL ACCEPTANCE** — The exact candidate reaches the Local Acceptance Boundary only under ticket 09's Git/evidence/authority contract. Skipped topology gates do not weaken that boundary.

A task may loop from EVALUATE to FRAME/ROUTE through a new assignment, or from REVIEW to CORRECT and a new candidate. A loop requires new evidence or a changed prerequisite; there is no unbounded retry or status-wait loop.

## Classification and smallest useful topology

Lead classifies against the pinned Workspace Protocol, not a hard-coded feature taxonomy or role name. Temporary uncertainty does not automatically instantiate the full higher-risk ceremony: it blocks under-classified write and triggers the smallest read-only investigation that resolves the uncertainty.

- **Tiny/bounded** — Default to one Engineer and focused evidence. Lead may self-work only under both protocol permission and a matching direct Human `lead_tiny` grant. No Reviewer or council unless an explicit protocol/risk trigger appears.
- **Cross-module/lifecycle** — Use one writer with isolated ownership. Add an Architect before write only when ownership, lifecycle, API, failure semantics, or reversibility is genuinely unresolved. Add a Reviewer only when the protocol matrix/risk requires independent falsification.
- **Architecture-sensitive** — Use a read-only Architect to reconstruct the problem before implementation, a Lead binding design decision, one Engineer for the moving scope, and a fresh independent Reviewer for the exact candidate. Human decides irreversible/owner-only trade-offs.
- **Council** — Not a default task class. Use only when two or more distinct, decision-changing propositions need genuinely independent mandates. Seats do not vote; Lead reconciles evidence and issues one verdict. A small task is never promoted to council merely to appear rigorous.

The one Peer Role Profile remains invariant. Assignment disposition defines the narrow mandate:

- **Engineer** — owns one bounded write outcome, inspects the relevant flow end-to-end, preserves unrelated changes, verifies its writes, and requests reopen/dependency/authority rather than expanding scope.
- **Architect** — read-only; reconstructs ownership/lifecycle/failure semantics, alternatives, recommendation, strongest counterargument, and reversal conditions. It is not briefed with Lead's preferred answer as a verdict.
- **Reviewer** — read-only and independent from Lead/implementation; receives a neutral mandate and one exact immutable candidate, attempts falsification, and reports findings with inspectable evidence. It does not fix findings or accept the project.
- **Scout** — read-only; obtains missing facts from the relevant local or first-party source, states gaps/confidence, and does not issue architecture or acceptance verdicts beyond its mandate.

## Exact assignment contract and identity

The assignment is an exact semantic prompt contract. v0.1 does not add a parser, service, persistence layer, or ledger merely to hold it. The Lead retains only the coordination context needed for its current Paseo-managed work and preserves evidence through existing session/timeline/Git artifacts.

Every assignment has a closed common core:

- assignment contract version;
- Human-defined `project_id`;
- `task_id` and immutable `task_revision`;
- newly minted `assignment_id`;
- exact `parent_lead_agent_id`;
- task class plus classification evidence/rationale;
- Peer disposition;
- bounded objective and owned outcome;
- known evidence, provisional assumptions, and explicit exclusions;
- exact repository root, Paseo workspace ID, and—when writing—the isolated worktree/checkout identity;
- owned moving scope and exact writable scope/exclusions when write may be requested;
- prerequisite/dependency edges and their observable satisfaction conditions;
- required capabilities and the fact that only a matching Human-issued Envelope can grant them;
- verification contract and evidence expected;
- whether a Stable Candidate is required, plus the candidate requirement/reference seam that ticket 09 must define;
- review trigger/mandate when known;
- escalation routes and Human must-ask boundaries relevant to the outcome;
- Peer Report version (`v1`), exact-parent terminal transport policy, and reserved-wait choice;
- handoff/ownership-return conditions;
- pinned Workspace Protocol version/digest.

Role Profile source/digests remain process-activation evidence under **Define role activation and private profiles**; they are not duplicated as assignment authority. The assignment identifies expected role/disposition, while governed activation and doctor evidence establish the actual role state.

A typed mandate adds only disposition-specific fields:

- Engineer: implementation question, scope, exclusions, method constraints, verification, candidate requirement, and escalation triggers;
- Architect: read-only question, areas to inspect, alternatives/counterargument/reversal output;
- Reviewer: exact candidate reference supplied only after ticket 09 makes it eligible, falsification mandate, prohibited redesign/fix scope, and finding format;
- Scout: factual question, allowed sources/scope, required citations/evidence, and known gaps.

Lead mints `task_id`, `task_revision`, and `assignment_id` before creation. `create_agent.initialPrompt` contains the contract but does not guess a child ID. The Peer reads its own exact identity from daemon-owned `PASEO_AGENT_ID`. When `create_agent` returns, Lead binds the returned child ID to the active assignment and later validates reports against it and current Paseo parentage. Title, cwd, arrival path, provider alias, or prose never substitutes for identity.

If creation fails or its result is ambiguous, Lead does not retry automatically. It performs at most one bounded inspection of supported Paseo facts. If the exact child cannot be identified, the launch remains unresolved; any deliberate retry uses a new assignment identity so a late report cannot attach to the wrong attempt.

Because **Define the minimal task authority envelope** permits Peer write capability only through a direct Human task message, a Lead-created Peer begins without write authority. It may perform the bounded read-only part of the assignment; if the assigned outcome now requires write, it terminally emits `BLOCKED` for the missing grant. The Human sends the canonical Peer Envelope directly to the exact idle Peer for the next run; the message binds the existing assignment/task identity and cannot widen its objective. Lead cannot relay, synthesize, or self-issue that grant. This consequence adds no mailbox or grant broker.

## Ownership, isolation, dependencies, and handback

- One moving write scope has exactly one active writer.
- Concurrent read-only Peers may inspect overlapping material.
- Concurrent writers are allowed only when all prerequisite edges are satisfied, moving scopes are disjoint, and each writer uses a distinct isolated worktree/checkout. Separate Paseo workspace IDs pointing at one checkout are insufficient.
- Writers sharing a checkout are never concurrent, even if their intended file lists differ, because Git index/refs, generated files, and discovered scope can collide.
- An unresolved dependency edge blocks only the dependent assignment; it does not create a scheduler or queue. Lead records the edge in the relevant assignment/coordination context and starts work only when its stated condition is evidenced.
- Overlapping scopes require sequencing: the first writer terminally hands back, Lead validates the report/candidate location and confirms no write run remains active, then ends/replaces ownership before another writer starts.
- Handback returns ownership; it is not candidate acceptance. The worktree and original writer remain available through the correction window until Local Acceptance or explicit abandonment.
- A requested objective, owner, workspace, writable-scope, pin, report-transport, or material verification change ends the old assignment and requires a new `assignment_id`. A capability/scope change also requires a new matching Human grant for the run.

## Paseo run control

### Start

Lead discovers exact provider/model/workspace facts and uses Paseo `create_agent` for a new Peer or exact-target `send_agent_prompt` for a known idle Peer follow-up. It never guesses IDs. Since `send_agent_prompt` replaces an in-flight target run, ordinary follow-up is forbidden while the Peer is running.

### Reserved idle wait

Lead sets native notify-on-finish only when it will end its own run and reserve the Lead agent to remain idle until that event. The reservation is cooperative, not a lock. Starting another Lead run breaks it and may allow a notification to replace that run.

At most one child notification is armed for a Lead reservation. With parallel children, the other runs use no notification; when the armed event wakes the Lead, it may perform one bounded inspection of the relevant siblings. This avoids multiple completion prompts racing to replace a newly awakened Lead run. No polling or heartbeat is introduced.

Finish, error, and permission notifications are attention only. Lead still retrieves/validates the exact Peer Report. Only Human responds to permission; Lead never interprets permission as a dependency decision.

### Follow-up

A follow-up starts a new Peer run. Lead sends it only to the exact idle child after validating the preceding report/event. It binds the preceding report/request ID and states the structured decision/next action. No automatic clarification, duplicate correction, resend, or report retry occurs.

### Cancel

Lead uses bounded explicit cancellation when Human aborts, the assignment is superseded, a material pinned boundary changes, continued work is unsafe, or an in-flight assignment is invalidated. Cancellation is lifecycle control, not acceptance or proof that a report exists. Lead performs no cancel/restart loop.

### Archive

Lead does not archive the original writer after `HANDOFF`. It keeps that Peer idle and the worktree available for valid correction until Local Acceptance or explicit candidate/assignment abandonment. Then it may archive the agent after preserving an inspectable evidence pointer. v0.1 does not archive workspaces through this package and does not keep task-local agents forever.

## Peer Reports and structured Lead decisions

Lead applies the strict v1 validation, duplicate, supersession, stale, transport, and identity rules from **Define non-disruptive Peer-to-Lead reporting** before using any report.

- **PROGRESS** — meaningful terminal checkpoint, not timer output. A valid report updates Lead's coordination evidence. No acknowledgment is mandatory. If continuation is useful and the assignment core is unchanged, Lead may send one deliberate same-assignment follow-up after the Peer is idle.
- **HANDOFF** — says only that the bounded assignment outcome is ready for evaluation. Lead checks artifacts, exact candidate requirement, verification, risks, and dependencies. Missing required Stable Candidate is invalid/missing evidence and cannot become acceptance. A later candidate B makes every review/verdict tied to candidate A inapplicable to B.
- **REOPEN_REQUEST** — Peer stops the incompatible patch. Lead returns the already-locked `ACCEPT`, `REJECT`, or `NEEDS_HUMAN` request verdict. `REJECT` requires evidence-backed rationale and an explicit next action; it can resume the same assignment only if its objective/ownership/scope/pins remain valid. Repeating the same rejected request without new evidence does not create an infinite debate.
- **DEPENDENCY_REQUEST** — Peer remains stopped. Lead returns `ACCEPT`, `REJECT`, or `NEEDS_HUMAN`. `ACCEPT` recognizes the dependency but grants no scope/authority. Lead satisfies/routs the dependency, creates a new assignment where a material field changes, and waits for Human where the dependency crosses a must-ask boundary.
- **BLOCKED** — Lead returns `RESUME`, `REASSIGN`, `NEEDS_HUMAN`, or `CANCEL`. `RESUME` is allowed only after the blocker is evidenced removed and the same assignment remains valid; the next run still needs any applicable Human grant. `can_continue_elsewhere` in the report never widens scope.

A structured request verdict contains:

- verdict contract version;
- exact `report_id`, `task_id`, and `assignment_id`;
- kind-appropriate decision enum;
- evidence-backed rationale;
- exact next action;
- assignment effect: unchanged, ended/replaced, or waiting for Human;
- required Human decision/grant, if any.

`ACCEPT` in a request verdict accepts only the request. `RESUME`, a progress follow-up, and `HANDOFF` evaluation are not candidate acceptance.

## Human decision and authority escalation

Lead evaluates every request on two independent axes:

1. **Decision boundary** — Human is required for product objective/priority, irreversible architecture/trade-offs, external effects, authority or protocol changes, subjective acceptance, material cost/risk above the protocol threshold, and any absent/ambiguous must-ask boundary.
2. **Assignment/authority delta** — A changed objective, owner, workspace/worktree, moving/writable scope, material verification/candidate requirement, or pinned protocol/report/task revision ends the assignment and requires a new identity. A changed capability or writable scope also needs a new direct Human current-run grant. A clarification that changes none of those may use a same-assignment follow-up.

A Peer report, Lead verdict, Workspace Protocol sentence, Human decision relayed as prose, or lifecycle transition never substitutes for the Task Authority Envelope. Human decisions that arrive while a Peer runs are not pushed through `send_agent_prompt`: if materially invalidating, Lead intentionally cancels, ends the assignment, and reissues after the target is idle; if nonmaterial, Lead waits for the terminal report and follows up against the same assignment. Native permission requests remain Human-only and do not silently revise assignment scope.

## Stable Candidate, review, correction, and acceptance seam

Ticket 08 requires, but does not define, ticket 09's Stable Candidate mechanics:

- every write handoff that requires acceptance must name one immutable, exactly retrievable candidate;
- Reviewer and Lead verdicts must bind that exact identity;
- candidate mismatch or mutation fails closed;
- candidate B invalidates review/verdict evidence for candidate A;
- ticket 09 must define Git base, cleanliness, reachability, correction candidate construction, evidence, and the exact Local Acceptance record without relying on lifecycle status.

A fresh independent Reviewer is required when the pinned Workspace Protocol/class matrix demands it, when the task is architecture-sensitive/difficult, or when prior review independence is invalid (Reviewer implemented the work, is a Lead fork/session carrying preferred framing, reviewed a moving target, is unavailable, or its mandate/candidate identity is wrong). The Reviewer receives a neutral brief and only one eligible exact candidate.

After findings, correction returns to the original Engineer when its agent identity, assignment lineage, worktree, moving scope, pins, and authority route remain valid. The Reviewer never fixes its own findings, and Lead does not patch them unless the separate tiny-self-work contract genuinely applies to a distinct tiny task. If the original writer is unavailable/erroring/archived or correction expands ownership/scope, Lead ends that assignment and creates a new Engineer assignment in an isolated workspace with any required Human grant.

A changed candidate always requires a new candidate-bound review result when the review trigger still applies. The same still-independent Reviewer may re-examine a correction that preserves the original mandate; a new fresh Reviewer is mandatory if the correction changes the premise/architecture/mandate or compromises independence. No old approval carries forward.

Evidence remains layered and non-substitutable:

1. Engineer/Peer verification proves only the checks performed against its write/candidate.
2. Reviewer findings/approval independently falsify only the exact candidate and mandate.
3. Lead validates identity, scope, dependencies, evidence, protocol gates, and issues the project verdict within authority.
4. Human resolves Human-only/subjective decisions.
5. Ticket 09's exact contract alone records Local Acceptance for the exact candidate.

## Failure, staleness, and protocol change

- **Peer error/unavailable or lifecycle finish without a valid Peer Report** — native status is attention only. Lead performs at most one bounded activity/status inspection. Missing evidence remains missing; it is not reconstructed from status or prose. Lead cancels/ends/reassigns with a new assignment identity as appropriate.
- **Notification missing or parent unavailable/archived** — Peer does not retry or reroute. Lead, Human, or separately authorized recovery Lead may make one bounded later inspection. No receipt or exactly-once delivery is claimed.
- **Lead error/unavailable** — only Human/Supervisor recovery under the already-defined exact recovery grant may create a replacement. Replacement must prove governed Lead activation through doctor before handoff. Reports addressed to the old Lead do not become reports to the new Lead; recovery inspects retained evidence once and creates fresh assignments where needed.
- **Stale report after reassignment** — reject on exact task/assignment/parent/child/pin mismatch regardless of arrival order or lifecycle status.
- **Protocol/task/report change** — assignment pins assignment-contract version, task revision, Workspace Protocol version/digest, Peer Report version, and transport. New protocol revisions normally apply to new assignments. A material authority/ownership/acceptance change stops and re-evaluates the current assignment; it never silently live-updates.
- **Tiny work becomes difficult** — Lead stops edits, preserves evidence, does not expand/self-renew the grant, classifies again, and delegates the moving scope. Partial Lead work and passing checks are not acceptance.
- **Second-control-plane attempt** — Peer has no orchestration tools; recognizable disallowed calls are blocked by the cooperative Policy Guardrail. Lead/Peer must stop the affected action and report the governance violation. Retained Bash remains a documented limitation, not permission to create native subagents, schedulers, queues, daemons, mailboxes, or parallel ledgers.
- **Polling/retry attempt** — replace with one reserved event wait or one bounded inspection after a meaningful gap/failure. Identical failures without changed prerequisite stop; there is no infinite retry.

## Stress-test outcomes

1. **Lead pre-solves, Peer only types code** — reject the brief at FRAME; restate outcome/boundaries/evidence as provisional and preserve Peer reopen rights.
2. **Two Peers edit one moving scope** — block concurrency; one owner keeps it, the other waits or receives a genuinely disjoint new scope/worktree.
3. **Two writers share one checkout** — block; create isolated worktrees or sequence through explicit handback.
4. **Peer discovers a false premise during implementation** — stop incompatible write and terminally emit `REOPEN_REQUEST` with evidence/options.
5. **Lead rejects `REOPEN_REQUEST`** — structured `REJECT` binds report/assignment, gives evidence and explicit next action; resume only if original assignment remains valid.
6. **Dependency requires new scope or Human decision** — no scope expansion; `NEEDS_HUMAN` where boundary applies, then new assignment/grant when material fields/capabilities change.
7. **Peer `BLOCKED` while Lead is running** — no direct send. Report remains terminal in child; a broken reserved notification may replace Lead and is recovered only from bounded available evidence.
8. **Notification replaces an in-flight Lead run** — classify as broken reservation/protocol violation; inspect once, preserve available transcript, and make no lossless-delivery claim.
9. **Peer finishes without required Stable Candidate** — valid outcome is `BLOCKED`, not `HANDOFF`; lifecycle finish is not acceptance.
10. **Peer hands off candidate A then continues to candidate B** — A and all A-bound review become inapplicable; B requires a new terminal report and candidate-bound review/verdict.
11. **Reviewer sees a moving target** — stop/reject review; wait for one exact immutable candidate.
12. **Reviewer is a Lead fork/session carrying its framing** — independence invalid; launch a fresh neutral Reviewer.
13. **Reviewer has findings and original writer is unavailable** — end old ownership; create a new Engineer assignment/worktree/grant; review the resulting new candidate.
14. **Correction widens writable scope** — stop; dependency/reopen decision, new assignment, and new Human grant are required.
15. **Verification passes but candidate identity mismatches** — fail closed; no review/project verdict/acceptance for that candidate.
16. **Lifecycle finished but Peer Report is missing** — attention only; one bounded inspection, then missing evidence/error handling.
17. **Tiny task grows difficult** — Lead stops, preserves evidence, reclassifies and delegates; no grant expansion or self-acceptance.
18. **Workspace Protocol changes during assignment** — retain the pin for nonmaterial future-only revisions; material authority/ownership/acceptance change cancels/stops and creates a re-evaluated assignment.
19. **Human sends a decision while Peer runs** — do not replacement-prompt the Peer; cancel if materially invalidated, otherwise wait and follow up after terminal report.
20. **A stale Peer Report arrives after reassignment** — reject exact identity/pin mismatch; never latest-wins.
21. **Small task is forced through council** — reject ceremony unless an explicit decision-changing protocol/risk trigger exists; if the pinned protocol itself mandates disproportionate ceremony, Lead cannot waive it and asks Human to revise the protocol.
22. **Lead polls for progress continuously** — stop polling; use meaningful terminal reports, one reserved idle notification, or one bounded inspection.
23. **Lead or Peer creates a second control plane** — stop/block the affected action, preserve evidence, and return to Paseo-native lifecycle/workspace truth.

## Explicit non-goals

This resolution does not define ticket 09's Git base, clean-workspace rule, commit/ref reachability, candidate construction, exact review record, or Local Acceptance record. It does not resolve package doctor, distribution, Supervisor notebook, or publication. It adds no status-derived acceptance, polling loop, automatic retry, council default, orchestration database, scheduler, queue, daemon, mailbox, native subagent tree, or workspace archive workflow.
