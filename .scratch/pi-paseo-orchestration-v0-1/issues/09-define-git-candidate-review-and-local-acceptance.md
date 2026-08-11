# Define Git candidate review and local acceptance

Type: grilling
Status: resolved
Blocked by: 06, 08

## Question

What exact Git base, clean-workspace, commit/ref reachability, review identity, correction, evidence, and Lead verdict contract defines a locally accepted candidate in v0.1?

## Answer

## Stable Candidate v0.1

A Stable Candidate is one exact local Git result in one already-validated repository/task context. It is identified by:

```text
git:v1:<task_base_oid>:<candidate_oid>
```

Both values are the repository's canonical full commit object IDs, not abbreviated IDs, branch names, tags, `HEAD`, worktree state, lifecycle state, or prose. `candidate_ref` has meaning only together with the exact project, repository root, workspace, task/revision, and assignment or `lead_tiny` run that supplies it.

- `task_base_oid` is the immutable task baseline. For the first candidate-producing run it equals that run's granted `candidate_base`.
- The first `candidate_oid` is one single-parent commit whose parent is `task_base_oid`.
- A correction from candidate A to B uses a new current-run Human grant with `candidate_base` equal to A's full commit ID. B is one single-parent commit whose parent is A. The `task_base_oid` in B's `candidate_ref` remains the original task baseline.
- Every candidate-producing grant/run creates at most one local commit. The resulting history from task base to current candidate is linear. Merge and amend remain prohibited.
- Candidate scope and review use the cumulative artifact `task_base_oid..candidate_oid`; the current run is additionally checked on `candidate_base..candidate_oid`.

The base and candidate must each resolve, in the exact repository, to the same canonical full commit IDs carried by the contract. The candidate must have the required parent/linear ancestry and remain exactly retrievable at candidate construction, HANDOFF, review start/end, Lead verdict, and Human acceptance. A commit command succeeding is insufficient when these checks fail.

The full commit ID is identity. A branch, tag, `HEAD`, reflog, or worktree is only a locator/retention aid and never substitutes for it. v0.1 creates no dedicated candidate ref, registry, or database.

## Workspace cleanliness and preservation

Before write routing, Lead inspects the checkout for Human-owned or unrelated changes. It never stashes, resets, cleans, stages, commits, overwrites, or relocates them. If the inspected checkout is dirty, candidate work is routed to a distinct isolated worktree/checkout that starts at the exact task base. Two writers never share that checkout.

A candidate-producing checkout must:

1. start with `HEAD` equal to the granted `candidate_base` and with no staged, unstaged, or untracked files;
2. contain only writer-owned changes for the bounded objective;
3. create exactly one local commit under a matching current-run `local_commit` grant;
4. finish with `HEAD` equal to `candidate_oid` and no staged, unstaged, or untracked files after verification; ignored build/cache outputs may remain because they are not candidate artifacts;
5. remain frozen after HANDOFF until correction, Local Acceptance, or explicit abandonment.

A clean check uses Git's stable machine-readable status semantics and includes untracked files. Candidate eligibility does not depend on a human-oriented status line.

Path validation is two-layered:

- machine validation checks the current commit delta and cumulative task diff against normalized `writable_scope` and `exclusions`;
- Lead inspects the exact cumulative diff/artifact for objective relevance, because an unrelated change can still sit inside an allowed path.

Any out-of-scope path, excluded path, unrelated change, unexpected parent, merge, missing object, or dirty residue makes the commit ineligible as a Stable Candidate. The object may remain as evidence, but it cannot advance review or acceptance.

Before a commit, `HEAD != candidate_base` blocks the operation. A bypassed or externally created commit from the wrong base remains ineligible. After HANDOFF, any observed movement of `HEAD`, branch, or supporting ref violates the frozen-worktree contract. Even if the exact commit object still exists, the old HANDOFF loses workflow eligibility until the same candidate is fully revalidated and handed off again, or a new candidate B is created. No gate silently follows the new `HEAD` or ref.

Peer and permitted Lead tiny self-work use the same Git/base/cleanliness/scope/retrievability gates. Their authority route differs; their candidate quality contract does not.

## Missing local-commit authority

Edits without a current-run `local_commit` grant are not a Stable Candidate. The writer preserves and freezes its owned uncommitted work and reports `BLOCKED`; it does not emit a candidate-required `HANDOFF`, stage a patch as a substitute candidate, or infer authority from assignment prose, tests, status, or Lead approval.

For a Peer, the Human may send a new exact direct grant for the next run if assignment identity, objective, workspace, scope, pins, and base remain valid. Otherwise Lead ends/replaces the assignment. Lead tiny behaves the same way: it stops and needs a new matching Human `lead_tiny` grant or delegates. Neither role self-grants, relays a grant, or converts edit authority into commit authority.

## Required candidate evidence

A candidate-required Peer `HANDOFF` must contain the exact non-null `candidate_ref` and evidence sufficient to inspect:

- exact project/task/revision/assignment, Peer/parent identities, repository root, workspace/worktree, and pinned Workspace Protocol digest;
- exact cumulative diff/artifact from task base to candidate and changed paths;
- current-delta and cumulative writable-scope/exclusion results;
- each verification command, `PASS`/`FAIL`/`NOT_RUN`, and exact output;
- evidence that verification ran after commit while `HEAD` named the exact candidate, followed by the required clean check;
- residual risks and unfinished dependencies.

Lead tiny supplies the same evidence directly as inputs to its project verdict; it does not fabricate a Peer Report.

Verification evidence from another commit, a pre-commit tree, a moving worktree, or a mismatched repository/task is invalid for the candidate. A verification command that changes tracked or non-ignored untracked state prevents HANDOFF until the writer-owned residue is safely removed and the clean rule passes. Passing tests never repair identity, scope, cleanliness, authority, review, or Human-decision failures.

Lifecycle `idle`/`finished`, command exit success, report arrival, `HANDOFF`, and `candidate_ref` text are evidence inputs only. A required `HANDOFF` with `candidate_ref: null` is invalid; the correct terminal report is `BLOCKED`. Lifecycle finish without a valid HANDOFF leaves evidence missing.

## Exact independent review

Review occurs only when the pinned Workspace Protocol/class/risk gate requires it. The Reviewer is a fresh independent Peer session, not the writer, not a Lead fork/session carrying the Lead's framing, and not a role permitted to fix or accept the candidate.

The neutral Reviewer brief carries facts needed for falsification:

- exact project/task/repository context and `candidate_ref`;
- bounded objective and required properties;
- writable scope, exclusions, candidate artifact/diff and verification evidence;
- review mandate, known risks, and required finding format.

It omits the Lead's preferred solution/verdict, hidden rationale, correction order, and writer advocacy. Factual implementation evidence may be supplied only as evidence, not as a conclusion the Reviewer must preserve.

The Reviewer resolves and verifies both full commit IDs, inspects the exact cumulative artifact through Git object operations or a detached clean read-only checkout at `candidate_oid`, and rechecks identity/retrievability after review. It never reviews a symbolic moving ref or moving writer worktree.

An immutable review result contains:

- `review_result_id`, Reviewer and Reviewer-assignment identity;
- exact `candidate_ref` and review mandate;
- commands, outputs, evidence references, and coverage/gaps;
- `outcome: APPROVE | FINDINGS`;
- zero or more findings, each with stable finding ID, `BLOCKER | NON_BLOCKING`, statement, inspectable evidence, impact, and affected scope;
- for a correction review, references to earlier finding IDs classified as `RESOLVED`, `STILL_OPEN`, or `OBSOLETE`, with evidence.

`APPROVE` means no findings under that mandate. `FINDINGS` is not project rejection or acceptance. Review records are never mutated. Same review ID with changed content is invalid.

Any candidate B invalidates every review result for A as evidence about B. If the review trigger still applies, B receives a new candidate-bound review. The same Reviewer may re-review only while its independence and mandate remain intact; a changed premise, architecture, mandate, or compromised independence requires a fresh Reviewer. A Lead fork, wrong/missing candidate, moving-target inspection, or mismatched mandate makes the review invalid rather than merely risky.

## Correction and reassignment

Findings return through Lead to the original writer when exact agent identity, assignment lineage, scope, workspace, pins, and authority route remain valid. Lead sends one exact-target same-assignment correction follow-up after the writer is idle. Human supplies a new current-run commit grant with `candidate_base` equal to A; the writer produces B and a new HANDOFF. Reviewer never directs or performs the fix.

If the original writer is unavailable/erroring/archived, Lead ends old ownership and creates a new Engineer assignment in a new isolated worktree at retrievable candidate A. The Human grants the new writer/run; B retains the original task base in its candidate reference.

If A is not retrievable, A and A-bound review/evidence are ineligible. If the objective and original task base remain valid and retrievable, Lead restarts from that task base with a new assignment. If the task base is also unavailable or stale, Lead reports `BLOCKED` and reframes through the existing task/Human boundary before any new baseline is chosen. It does not reconstruct a Stable Candidate from patch prose or let Human waive retrievability.

A correction that changes objective, owner, workspace, moving/writable scope, exclusions, material verification, candidate requirement, or pins ends the old assignment. Broader scope follows the existing reopen/dependency/Human-decision path and requires a new matching Human grant. Passing tests or a Reviewer's suggested fix cannot widen it.

## Structured Lead project verdict

Lead emits exactly one strict block at the start of its verdict response:

```text
PI_PASEO_PROJECT_VERDICT_BEGIN v1
{
  "verdict_id": "opaque-token",
  "project_id": "project-token",
  "task_id": "task-token",
  "task_revision": "revision-token",
  "assignment_id": "assignment-token-or-null-for-lead-tiny",
  "repository_root": "<exact-assignment-repository-root>",
  "workspace_id": "workspace-token",
  "workspace_protocol_digest": "digest",
  "candidate_ref": "git:v1:<task_base_oid>:<candidate_oid>",
  "origin": {"kind": "PEER_HANDOFF", "evidence_id": "report-id"},
  "scope_result": "PASS",
  "scope_evidence": ["inspectable-reference"],
  "verification": [
    {"command": "exact command", "result": "PASS", "output_ref": "inspectable-reference"}
  ],
  "review": {
    "required": true,
    "review_result_id": "review-id",
    "outcome": "APPROVE",
    "open_findings": []
  },
  "unfinished_dependencies": [],
  "residual_risks": [],
  "human_decisions": [],
  "verdict": "READY",
  "rationale": "evidence-backed summary"
}
PI_PASEO_PROJECT_VERDICT_END
```

For Lead tiny, `origin.kind` is `LEAD_TINY` and `evidence_id` identifies the current-run evidence. When review is not required, `review` is exactly `{ "required": false, "review_result_id": null, "outcome": "NOT_REQUIRED", "open_findings": [] }`. When review is required, `review_result_id` is non-null and `outcome` is `APPROVE` or `FINDINGS`. Each `human_decisions` entry contains an exact decision ID, `RESOLVED | UNRESOLVED`, and an evidence reference; terminal Local Acceptance is not duplicated there. The schema is closed and versioned. Required arrays may be empty only when semantically allowed. Evidence references point to exact retained diff/artifact, command output, Peer Report, and review records rather than duplicating large outputs. Same verdict ID with changed content is invalid.

Verdict semantics:

- `NOT_READY`: any invalid candidate/HANDOFF, identity/base/scope/cleanliness/evidence failure, unfinished blocking dependency, invalid required review, or unresolved `BLOCKER`. Human-only questions are still listed. This verdict takes precedence over `NEEDS_HUMAN`.
- `NEEDS_HUMAN`: no technical/review blocker remains, but at least one required Human-only product, priority, irreversible trade-off, external-effect, authority/protocol, subjective, or material cost/risk decision is unresolved. Human decides; Lead then re-evaluates the same exact candidate. A material decision change creates the applicable new assignment/candidate/review.
- `READY`: all candidate and protocol gates pass, required review is valid, no `BLOCKER` or blocking dependency remains, and all prerequisite Human decisions are resolved. Open `NON_BLOCKING` finding IDs remain visible in `review.open_findings` and `residual_risks`.

A Lead verdict binds one exact candidate only. Candidate, report, review, protocol pin, scope, evidence, or required Human-decision drift makes it stale. No verdict enum is acceptance.

## Human-only Local Acceptance Boundary

The direct Human acceptance message must start with exactly one canonical block:

```text
PI_PASEO_LOCAL_ACCEPTANCE_BEGIN v1
{
  "decision": "LOCAL_ACCEPT",
  "candidate_ref": "git:v1:<task_base_oid>:<candidate_oid>",
  "project_verdict_id": "verdict-opaque-token"
}
PI_PASEO_LOCAL_ACCEPTANCE_END
```

The begin marker is the first non-empty line. The block is exactly one closed-schema JSON object and exact end marker. Wrong version, malformed/duplicate/misplaced markers or keys, quoted/example/relayed text, unknown fields, non-Human route, candidate mismatch, verdict mismatch, or same-ID mutation does not accept anything. Human provenance is route-bound and cooperative, not cryptographically proven.

The exact candidate crosses the Local Acceptance Boundary only when, at acceptance time:

1. task/repository/workspace context still matches and the verdict carries the assignment's validated protocol pin; a later nonmaterial protocol revision follows the old pin, while a material authority/ownership/acceptance revision has already stopped and re-evaluated the assignment under the locked Workspace Protocol rule;
2. base and candidate resolve to the exact full commit IDs and the frozen candidate remains eligible;
3. cumulative artifact, writable/commit scope, cleanliness, and verification evidence remain valid for that candidate;
4. every required independent review is valid for that candidate and has no open `BLOCKER`;
5. the referenced immutable Lead verdict is `READY` for that exact candidate;
6. all Human-only prerequisite decisions are resolved; and
7. the direct Human supplies the valid `LOCAL_ACCEPT` block above.

This is a terminal local workflow state for that exact candidate, recorded by existing transcript/timeline evidence. It creates no acceptance service, ledger, database, daemon, queue, mailbox, Git tag/ref/note, commit, publication, push, PR, merge, deploy, or external side effect. Human rejection or request for changes does not create Local Acceptance. Acceptance of A never accepts B.

No acceptance is inferred from branch name, ref, `HEAD`, clean status, commit success, lifecycle state, tests, Peer Report, HANDOFF, Reviewer `APPROVE`, Lead `READY`, Human decision prose, or any combination short of the exact boundary.

## Handback, retention, and cleanup seam

After HANDOFF, moving-scope ownership returns to Lead while the original writer stays idle and its worktree stays frozen through the correction window. The exact candidate and evidence must remain retrievable until Local Acceptance or explicit abandonment.

At Local Acceptance or abandonment, Lead hands back exact candidate/evidence/worktree pointers and may archive the idle agent after preserving those pointers. v0.1 does not archive/delete Paseo workspaces, delete worktrees/branches/refs, run Git cleanup/GC, or promise indefinite retention. Later retention and destructive cleanup belong to Human/Paseo/native Git operation outside this package. Cleanup before the boundary that destroys reachability invalidates the candidate.

## Draft audit result

- **Normative-source alignment:** PASS — one writer, stable exact artifact, proportionate review, independent Reviewer, correction through the writer, layered Lead/Human judgment, and evidence rather than lifecycle status.
- **Fixed ceremony:** PASS — review remains conditional on the pinned Workspace Protocol/class/risk trigger; no council, duplicate verification, or mandatory extra writer is introduced.
- **Status-as-acceptance:** PASS — status, tests, HANDOFF, Reviewer outcome, and Lead verdict are all explicitly non-accepting.
- **Moving-target review:** PASS — only full OIDs and exact immutable artifacts are reviewable; drift invalidates eligibility.
- **Second control plane:** PASS — Git objects plus existing Paseo/transcript evidence only; no scheduler, mailbox, candidate registry, acceptance service, or cleanup runtime.
- **Locked-ticket consistency:** PASS after sharpening two seams: nonmaterial protocol revisions retain the assignment pin, and restart after a lost candidate also requires a still-retrievable task base.
- **Scope discipline:** PASS — doctor behavior and package/test distribution remain deferred; publication remains absent.

First-party Git facts used are limited to official Git contracts: [`git rev-parse --verify` and `^{commit}`](https://git-scm.com/docs/git-rev-parse) validate an existing commit object; [porcelain status](https://git-scm.com/docs/git-status) is stable for machine parsing; [`git diff-tree`](https://git-scm.com/docs/git-diff-tree) compares committed trees; and [`git gc`](https://git-scm.com/docs/git-gc) may remove unreachable objects, which is why reachability is rechecked through the boundary. These facts justify checks only; they do not add authority or workflow.

## Required stress-test outcomes

| Scenario | Required outcome |
|---|---|
| Human-owned uncommitted changes exist | Preserve untouched; route candidate work to a clean isolated worktree. |
| Writer commits from wrong `candidate_base` | Block before commit; a bypassed commit is ineligible. |
| Diff has a path outside writable scope/exclusions | Ineligible; no valid HANDOFF/review/verdict/acceptance. |
| Commit contains unrelated changes | Lead's exact cumulative-diff inspection marks it ineligible even if paths are allowed. |
| Commit succeeds but object/ref is no longer retrievable | No Stable Candidate; report `BLOCKED`/restart as applicable. |
| Branch/ref moves after HANDOFF | Old HANDOFF loses eligibility; never follow the ref; revalidate+handoff or create B. |
| Peer hands off A then creates B | B needs a new HANDOFF; all A review/verdict evidence is inapplicable to B. |
| Reviewer sees A but Lead verdict names B | Verdict is `NOT_READY` due review identity mismatch. |
| Reviewer sees moving worktree | Review invalid; inspect exact OIDs afresh. |
| Reviewer is a Lead fork with old framing | Independence invalid; use a fresh neutral Reviewer. |
| Tests pass but candidate identity mismatches | Fail closed; `NOT_READY`. |
| Candidate is correct but verification evidence is for another commit | Evidence invalid; rerun at exact candidate. |
| Reviewer has unresolved BLOCKER | Lead `NOT_READY`; Human cannot acceptance-block override it. |
| Original writer corrects findings into B | New grant with base A, new HANDOFF, and new review when trigger remains. |
| Original writer unavailable | End ownership; new Engineer assignment/worktree/grant at retrievable A. |
| Correction widens writable scope | Stop; new assignment and Human grant after existing decision path. |
| Peer edits without local-commit authority | Preserve/freeze edits and emit `BLOCKED`; no candidate-required HANDOFF. |
| Lead tiny edits without local-commit authority | Stop; new Human `lead_tiny` grant or delegate; no self-grant. |
| Lifecycle finishes without valid HANDOFF | Attention only; evidence remains missing. |
| Required HANDOFF has `candidate_ref: null` | Invalid; correct report kind is `BLOCKED`. |
| Human-only decision unresolved | Lead `NEEDS_HUMAN` only after other blockers clear; no Local Acceptance. |
| Lead tries to accept by status or Reviewer APPROVE | No effect; only direct Human acceptance block crosses boundary. |
| Lead/Peer tries push, merge, amend, or publication | Denied/stopped as out of scope; candidate/local acceptance grants no such authority. |
| Workflow creates candidate DB/acceptance service | Reject as second-control-plane behavior; use Git objects and existing transcript/timeline evidence. |

## Residual assumptions and explicit seams

- Full object ID means the canonical full ID for the repository's configured Git object format; the contract does not hard-code an abbreviated length or branch name.
- Git/OS/Paseo facts can be rechecked but the package cannot prevent external mutation; drift fails closed without sandbox claims.
- Repository/task/workspace binding already comes from the locked assignment, activation, Paseo identity, and Workspace Protocol contracts; `candidate_ref` does not duplicate them.
- Objective relevance and subjective residual-risk acceptance require Lead/Human judgment; path checks and tests do not prove them automatically.
- Exact doctor diagnostics/repair are deferred to “Define the doctor contract”. Package resource layout and executable test distribution are deferred to “Define package distribution and verification”. This ticket defines required behavior/evidence only.
- No publication, cross-host transport, workspace-snapshot candidate, dedicated candidate ref, acceptance database/service, task ledger, daemon, queue, mailbox, or cleanup workflow is introduced.
