---
name: ppo-orchestrate
description: Run governed Pi Paseo work through a Human-created root Lead, a root Supervisor, and bounded Peer assignments. Use when a PPO Lead must classify, delegate, follow up, review, and hand work back to the Human.
compatibility: Requires the paseo MCP server, configured PPO role aliases, and a repository Workspace Protocol.
---

# PPO orchestration

Use Paseo as the only workspace, lifecycle, parentage, follow-up, and timeline control plane. Never substitute lifecycle status or agent prose for evidence.

No coordinator or `/ppo:bootstrap` creates the team. The Human creates the root Lead and root Supervisor directly through Paseo UI or `paseo run`; the Lead creates bounded Peer children through `paseo_create_agent`.

## Paseo tool calls

Invoke each Paseo operation through the outer `mcp` tool with the exact shape `{"server":"paseo","tool":"paseo_<operation>","args":{...}}`. Call the named operation directly; the outer tool is a transport, not a discovery or status operation. Canonical (`create_agent`) and adapter-prefixed (`paseo_create_agent`) operation names are normalized identically by policy. For example, list workspaces with `{"server":"paseo","tool":"paseo_list_workspaces","args":{}}`.

## Topology

- Lead and Supervisor must be root agents (`ParentAgentId = null`). A Lead or Supervisor with a Paseo parent fails closed.
- The Human creates the root Lead first, supplies the Human task as its initial prompt, then creates the root Supervisor and binds it to the exact Lead.
- A Peer's `ParentAgentId` must equal the exact current Lead; a root Peer or a Peer of another agent is invalid and completes as `BLOCKED`.
- Parentage and workspace placement are separate facts. A writer Peer may use an isolated worktree while retaining Lead parentage.

## Entry modes

A Lead receives the Human task directly as a root agent. A Supervisor is created by the Human with a prompt binding one exact Lead agent ID, the Human task, the exact repository root, and the expected workspace binding. A missing, ambiguous, stale, or conflicting binding completes as `BLOCKED`.

## Supervisor binding

1. The Supervisor inspects itself and the bound Lead; both must be root agents.
2. The Supervisor sends one bounded `SUPERVISOR_BOUND` message to the exact Lead containing the schema version, event ID, Supervisor agent ID, Lead agent ID, task ID, repository root, and workspace identity when required.
3. The Lead inspects the claimed Supervisor and verifies role, root parentage, repository/workspace applicability, and task binding against live Paseo facts before accepting. Process memory is only a cache; restart recovery revalidates against Paseo facts.

## Lead workflow

1. Verify before governed orchestration: your own Paseo identity is observable, `ParentAgentId` is absent, provider/role is Lead, repository and workspace identity are exact, the Workspace Protocol is valid and pinned, and required Paseo MCP operations are connected and discoverable.
2. Accept the Human task directly. The initial Human task and each exact Peer assignment authorize ordinary local reversible work (edit, test, worktree, local commit) directly. Do not ask the Human to write markers, JSON, hashes, agent IDs, assignment IDs, scope syntax, capability lists, digests, or grants.
3. Read and pin the complete Workspace Protocol. Use `paseo_list_workspaces` and `paseo_list_providers` only when discovery is needed. Run `/ppo:doctor` for setup, recovery, suspected configuration/runtime drift, or troubleshooting—not as a gate for normal delegation and never ask the Human to copy its output between agents.
4. Classify from evidence:
   - missing facts → one read-only Scout or Architect Peer;
   - tiny/bounded → one Engineer Peer;
   - cross-module/lifecycle → one isolated Engineer Peer;
   - architecture-sensitive → Architect, then Engineer, then fresh Reviewer.
   These are common dispositions; mint a clearer task-specific disposition when it narrows ownership or evidence.
5. Reuse an active assignment only for a bounded follow-up whose task, owner, checkout, and scope remain exact. A retry or changed ownership mints a new assignment ID. Before launch, reconcile active ownership: one writer per moving scope; concurrent writers have disjoint scopes and distinct isolated checkouts; independent read-only assignments may run together. Then mint nonempty task and assignment IDs and complete the Peer brief: disposition; bounded objective and owner; exact repository, workspace/checkout, and scope/exclusions; dependencies; requested capabilities and applicable Human-only boundaries; relevant protocol constraints; known evidence and provisional assumptions; verification and handoff evidence. Frame plans and file lists as provisional inputs and require the Peer's evidence-backed conclusion.
6. Create and manage required isolated worktrees yourself. A dirty caller checkout is evidence to classify, not an automatic blocker: untracked/read-only issue notes, specifications, research, generated logs, or unrelated documentation do not block creating an isolated worktree from a known clean commit. Only a real collision, overwrite risk, competing writer, or ambiguous base blocks work.
7. Select the Human-configured model route whose description best fits the work, independently of disposition. Include exactly one JSON binding for each of `"model_route":"<route-id>"` and `"parent_lead_agent_id":"<current Lead agent ID>"`. Copy the exact applicable terminal template from **Peer assignment contract** below into the brief. Bind only the known Lead, task, and assignment identity placeholders before launch. Direct the child to replace `<PASEO_AGENT_ID>` from its runtime environment and fill the report ID, result, artifacts, evidence, verification, risks, and dependencies from its work.
8. Call `paseo_create_agent` with the selected route's exact provider/model/thinking tuple and `notifyOnFinish: true`. Omit workspace and labels so Paseo preserves inherited workspace and parentage. This step completes when the policy accepts the exact route, parent binding, inherited workspace, and notification contract.
9. On notification, inspect only that child. Validate its terminal Peer Report against exact child, Lead, task, and assignment IDs. Use `paseo_send_agent_prompt` for a bounded correction or follow-up. After two follow-ups addressing the same symptom or an unchanged prerequisite, complete a root-mechanism check; record either new evidence for one changed next action or the applicable terminal verdict/reclassification before continuing. Use `paseo_cancel_agent` only to stop an invalid active run and `paseo_archive_agent` when the assignment is terminal.
10. For write work, require the exact Stable Candidate and every protocol-mandated independent review before issuing `READY`, `NOT_READY`, or `NEEDS_HUMAN`. Stop at direct Human Local Acceptance.

Do not poll agents. Do not expose the complete Workspace Protocol to a Peer. Do not sleep while waiting on a named Paseo notification: finish the bounded turn and return idle. Idle is not a project verdict, and no continuous polling, monitoring daemon, or automatic heartbeat is introduced.

## Observation through bounded events

The Lead sends only meaningful milestone events to its verified bound Supervisor: `LEAD_STARTED`, `PEER_BLOCKED`, `CANDIDATE_READY`, `REVIEW_COMPLETE`, `HUMAN_DECISION_REQUIRED`, `LEAD_FINISHED`. Each event triggers exactly one bounded Supervisor observation pass; the Supervisor may send an evidence-backed observation to the bound Lead and append Notebook evidence when useful, then returns to idle. Event receipt is an attention signal and not acceptance; it carries no authority.

A Peer communicates with its parent Lead only through the allowed kinds `question`, `blocked`, `dependency`, `progress`, and `handoff`, resolving the parent from Paseo parentage. A Supervisor sends observations only to its one verified bound Lead and never directs Peers or issues project acceptance.

## Peer assignment contract

A read-only Peer ends with the exact closed report as the first nonempty final content. Preserve every field name and JSON shape. The Lead copies the terminal template for the disposition (HANDOFF for read-only, the Workspace Protocol's Stable Candidate contract for write-producing assignments) into the Peer brief and binds identity placeholders before launch.

```text
<pi-paseo-orchestration report="v1">
{"version":1,"kind":"HANDOFF","report_id":"<fresh-id>","peer_agent_id":"<PASEO_AGENT_ID>","parent_lead_agent_id":"<bound-lead-id>","task_id":"<task-id>","assignment_id":"<assignment-id>","summary":"<result>","evidence":["<specific evidence>"],"payload":{"artifacts":["<artifact or inspected path>"],"candidate_ref":null,"verification":[{"command":"<check>","result":"PASS","output":"<bounded output>"}],"residual_risks":[],"unfinished_dependencies":[]}}
</pi-paseo-orchestration>
```

Write-producing assignments follow the Workspace Protocol's Stable Candidate contract instead of using a null candidate.
