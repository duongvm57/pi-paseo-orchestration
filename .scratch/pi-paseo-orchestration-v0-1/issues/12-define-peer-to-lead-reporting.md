# Define non-disruptive Peer-to-Lead reporting

Type: grilling
Status: resolved
Blocked by: 03

## Question

Given that Paseo's `send_agent_prompt` replaces an in-flight Lead run and provides no receipt, idempotency key, or safe retry contract, how should Peer progress, blocked, dependency, and reopen reports reach the exact parent Lead? Decide whether v0.1 should rely on structured terminal handoff plus Paseo finish/permission notification, allow carefully gated idle-parent sends, or expose another thin protocol over an existing supported Paseo primitive—without creating a queue, daemon, or task ledger.

## Answer

v0.1 uses one strict, versioned **Peer Report** as the terminal handoff of every Peer run. The Peer writes the report at the start of its final assistant response; it does not call Paseo, send directly to the Lead, retry delivery, reroute to another role, or gain an orchestration surface. Paseo remains the sole lifecycle, workspace, and parentage control plane. The package adds no queue, daemon, mailbox, report database, task ledger, delivery receipt, idempotency key, or exactly-once claim.

### Transport and notification contract

A report terminates the current Peer run, not necessarily the task. `PROGRESS`, `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, and `BLOCKED` may all expect a later Lead follow-up; `HANDOFF` says only that the assignment outcome is ready for Lead evaluation.

The Lead may request native Paseo finish notification only for a **reserved idle wait**: it launches or prompts the Peer in the background, ends its own run, and reserves the Lead agent to remain idle until the child event. Finish, error, and permission notifications are attention signals only. A finish notification may carry the latest Peer response, but the Lead must still extract and validate the report. Error does not imply `BLOCKED`; permission does not imply `DEPENDENCY_REQUEST`, and only the Human responds to permission requests under the existing authority contract.

This is conditional operational safety, not a non-disruption guarantee. Paseo sends native notifications through the same replacement path as other prompts. If the Lead begins another run while a notification subscription is outstanding, the notification can replace that run. The package cannot lock the Lead idle or retract the subscription. A broken reservation is a protocol violation and known recovery case, not evidence that the report was delivered safely.

Idle status alone is not permission to send. v0.1 exposes no idle-parent send tool, including for `BLOCKED`, and the Peer never calls `send_agent_prompt`. If notification was not armed, fails, or the exact parent is unavailable, archived, erroring, or closed, the report remains only in the child response/activity or terminal. The Peer stops without retry or rerouting. The Lead, Human, or a separately authorized recovery Lead may make one bounded inspection later; if the exact report cannot be retrieved, it is treated as missing rather than reconstructed from lifecycle state or prose. There is no polling loop, heartbeat, infinite retry, or alternate mailbox.

### Wire format

The canonical final response begins:

```text
PI_PASEO_PEER_REPORT_BEGIN v1
{
  "kind": "HANDOFF",
  "report_id": "report-opaque-token",
  "peer_agent_id": "00000000-0000-0000-0000-000000000000",
  "parent_lead_agent_id": "00000000-0000-0000-0000-000000000000",
  "task_id": "task-opaque-token",
  "assignment_id": "assignment-opaque-token",
  "summary": "Bounded human-readable summary",
  "evidence": ["Inspectable evidence reference"],
  "payload": {}
}
PI_PASEO_PEER_REPORT_END
```

`supersedes_report_id` is the only optional common field. Prose may follow the end marker but has no report semantics. The begin marker must be the first non-empty line of the Peer final response. The block contains exactly one JSON object and one exact end marker. Missing, duplicated, misplaced, malformed, or unknown markers, JSON keys, payload keys, or enum values reject the whole report. Duplicate JSON fields are rejected. v0.1 accepts only marker version `v1`; it does not repair or best-effort reinterpret malformed or unknown versions.

Every common field other than `supersedes_report_id` is required. `summary` and each `evidence` item are non-empty strings; `evidence` is non-empty. `peer_agent_id` and `parent_lead_agent_id` are exact Paseo UUIDs. `task_id`, `assignment_id`, and `report_id` are non-empty opaque tokens compared exactly. A retry of the same semantic report, if one is observed despite the no-retry rule, must retain the same `report_id`; a changed report gets a new ID.

For the initial run, the Peer reads its exact self identity from daemon-owned `PASEO_AGENT_ID`; governed activation already requires that value to be nonblank and process-latched. Reading this identity fact through the existing environment/Bash surface does not give the Peer a Paseo orchestration tool or make the value authentication. The Lead cannot place the child ID in `create_agent.initialPrompt`, because current Paseo requires that prompt and returns the new ID only after creation has started.

The Lead supplies its exact parent Lead ID, task ID, assignment ID, report protocol version, and transport policy in the assignment; the Peer echoes them and adds its environment-derived self ID. This assignment context is correlation data, not authority. After `create_agent` returns, the Lead records the actual child ID for the active assignment. On receipt, it verifies its own exact ID, the report's Peer ID against that returned child ID, current Paseo parentage, current task and assignment, and pinned protocol version. Paseo parentage alone does not prove the parent has a Lead Role Profile. Missing or mismatched identity fails closed; the Lead does not infer or repair it from title, cwd, workspace, lifecycle, transcript, or arrival path.

### Report kinds

The closed `kind` enum and typed payloads are:

- `PROGRESS`: `completed`, `next`, and `risks`, each an array of non-empty strings. It is emitted only at a meaningful checkpoint—new evidence, a completed phase, or a material risk/estimate change—not on a timer and not merely because the Lead polled.
- `HANDOFF`: `artifacts`, `candidate_ref`, `verification`, `residual_risks`, and `unfinished_dependencies`. `artifacts`, risks, and dependencies are arrays of strings. `candidate_ref` is a string or `null`, conditional on the assignment's Stable Candidate gate. Each verification item contains exact `command`, `result` (`PASS`, `FAIL`, or `NOT_RUN`), and `output`. A task that requires a Stable Candidate cannot produce a valid `HANDOFF` with `candidate_ref: null`; it emits `BLOCKED` instead. Read-only Architect, Reviewer, or Scout assignments may hand off exact artifacts/evidence without a Git candidate when their assignment permits it.
- `REOPEN_REQUEST`: `failed_premise`, `impact`, `options`, and `requested_decision`. Evidence must identify why the foundation, lifecycle, API, ownership, or verification premise no longer stands. The Peer stops the incompatible patch. Options are proposals, not correction orders.
- `DEPENDENCY_REQUEST`: `needed`, `needed_from`, `impact`, and boolean `human_decision_required`. Naming another owner, API, workspace, scope, or Human decision neither creates the dependency nor grants access to it.
- `BLOCKED`: `blocker`, `impact`, `unblock_condition`, `bounded_attempts`, and boolean `can_continue_elsewhere`. Attempts are evidence of bounded work already tried, not a retry schedule. `can_continue_elsewhere` is information only and does not expand writable scope.

A `HANDOFF` may list residual risk or a non-blocking future dependency. If an unresolved item prevents the assigned outcome or required candidate, the correct kind is `BLOCKED` or `DEPENDENCY_REQUEST`, not a partial-success handoff disguised as completion.

### Lead handling, requests, and authority

`REOPEN_REQUEST` and `DEPENDENCY_REQUEST` leave the Peer stopped until the Lead sends a structured follow-up that references the exact `report_id` and states `ACCEPT`, `REJECT`, or `NEEDS_HUMAN`, with rationale and next action. Here `ACCEPT` accepts the request only; it is not candidate acceptance. A rejected reopen may resume the original assignment only after the Lead gives evidence-backed rationale and explicitly restates that next action. A dependency beyond the Lead's decision boundary receives `NEEDS_HUMAN` and remains stopped.

If the decision materially changes objective, ownership, workspace, writable scope, authority, report protocol, or transport, the old assignment ends and the Lead issues a new `assignment_id`. Any new capability still requires the applicable Human-issued current-run Task Authority Envelope. A report, request verdict, Workspace Protocol clause, or ordinary prompt cannot grant capability beyond the Role Profile and current envelope.

Unknown authority, approval, writable-scope, or capability fields invalidate the report. Claims embedded in `summary`, `evidence`, payload prose, or trailing prose have no authority effect. The Lead must reject or route scope expansion through the existing request, Human-decision, assignment, and grant contracts.

### Duplicate, stale, correction, and ordering

Reports are immutable and have no trusted total ordering:

- same `report_id` and byte-equivalent body: ignore as a duplicate;
- same `report_id` with different content: invalid protocol violation;
- a correction uses a new `report_id` and `supersedes_report_id` naming the earlier report;
- supersession preserves the earlier evidence and does not make the correction automatically true;
- two different reports that conflict are reconciled by the Lead against current assignment and evidence; neither arrival order nor prose timestamp wins;
- a report for an ended/replaced task or assignment is stale and rejected;
- a failed or ambiguous delivery is never automatically retried, because Paseo exposes no receipt, idempotency, or safe retry contract.

The Lead may ask the idle Peer for clarification through a normal, exact-target follow-up after it has deliberately evaluated the report. That is a new Peer run and produces a new report; it is not an automatic duplicate correction.

### Stable Candidate, verification, and acceptance

`HANDOFF`, lifecycle `finished`, Peer idle, tests passing, and native notification are not acceptance. The Lead first validates report identity and assignment, then inspects the exact immutable Stable Candidate or permitted read-only artifact, checks exact verification commands/results, applies the Workspace Protocol's reviewer gate, and confirms that the accepter has authority. If the candidate changed, prior review is invalid. Only then may the Lead issue the project verdict within the Local Acceptance Boundary; Human-only decisions remain with the Human.

A finish notification with no valid report or insufficient evidence is only an attention event. The Lead performs at most one bounded inspection and requests a fresh handoff or classifies the run as error/missing evidence. It does not synthesize a successful report, infer acceptance from status, or poll until desired evidence appears.

### Evolution

Each assignment pins the Peer Report version and transport policy. Closed-schema additive or breaking changes require a new explicit marker version. Unknown versions fail closed while their raw text may be retained as evidence. There is no in-band best-effort negotiation. A material protocol or transport change during a task stops and re-evaluates the assignment, then uses a new `assignment_id`; it never silently switches a running task. Future package versions may explicitly support more than one pinned report version, but v0.1 supports only `v1`.

### Stress-test outcomes

- Peer emits `BLOCKED` while Lead is running: no direct send occurs; the report remains in the child. If the Lead violated an outstanding idle reservation, native notification may replace the Lead run and recovery uses available transcript evidence without claiming lossless restoration.
- Peer emits `BLOCKED` while Lead is idle: only a previously armed reserved-idle notification wakes it; idle alone is not a send gate.
- The same report appears twice: an exact duplicate is ignored; a same-ID mutation is invalid.
- A report arrives after task or assignment replacement: reject it as stale.
- Lead does not receive the report: Peer stops and does not retry; one later bounded inspection is permitted.
- `send_agent_prompt` would replace an in-flight Lead run: Peer v0.1 never invokes it.
- A transport error has no idempotency contract: no automatic or Peer-driven retry.
- Report names the wrong parent or lacks task identity: fail closed without inference.
- Lead rejects `REOPEN_REQUEST`: Peer resumes only after the explicit request verdict and next action; rejection does not erase the report evidence.
- `DEPENDENCY_REQUEST` needs a Human decision: Lead returns `NEEDS_HUMAN`; Peer waits.
- Peer finishes implementation without a required Stable Candidate: it emits `BLOCKED`, not `HANDOFF`.
- Lifecycle finish lacks handoff evidence: attention only; no acceptance.
- Peer has no Paseo authority: terminal handoff remains the complete Peer-side mechanism.
- Report claims broader authority or writable scope: the claim has no effect and unknown authority fields invalidate the report.
- Two reports conflict: Lead reconciles evidence; no latest-wins or duplicate correction loop.
- Report version or transport changes mid-assignment: stop, re-evaluate, and create a new assignment identity.
