# Manual Root Team — v0.2 Specification

Type: implementation spec
Status: proposed
Spec version: 2
Target package version: 0.2.0

## Objective

Replace coordinator-based bootstrap with a Human-created Paseo team:

```text
Human
├── Lead (root Paseo agent)
│   └── Peer(s) (Paseo child agents)
└── Supervisor (root Paseo agent bound to one Lead)
```

The Human creates Lead and Supervisor directly through Paseo UI or `paseo run`. Lead creates bounded Peer children. Supervisor observes only its bound Lead. Communication is event-driven and bounded; no daemon, continuous polling, or automatic heartbeat is introduced.

## Non-goals

- Do not modify any repository Workspace Protocol.
- Do not add a coordinator replacement.
- Do not add `/ppo:lead` or `/ppo:supervise` merely to launch agents.
- Do not add continuous polling, a monitoring daemon, or automatic heartbeat.
- Do not add multi-host routing, browser tooling, OCR, or unrelated orchestration features.
- Do not treat lifecycle status, events, tests, reports, or Notebook history as Human Local Acceptance.
- Do not mention external comparison repositories in documentation, specifications intended for release, changelog entries, or commit messages.

## Human workflow

### 1. Create the Lead

From a Human shell without `PASEO_AGENT_ID`, or through the Paseo UI, create a `ppo-lead` agent in the intended repository/workspace and supply the Human task as its initial prompt.

The Lead must verify before governed orchestration:

- its own Paseo identity is observable;
- `ParentAgentId` is absent/null;
- its provider/role is Lead;
- repository and workspace identity are exact;
- the Workspace Protocol is valid and pinned;
- required Paseo MCP operations are connected and discoverable.

### Authority and dirty-checkout ergonomics

The current Task Authority Envelope machinery is ceremony without authentication and must be removed in v0.2, not hidden behind generated JSON.

- The initial task supplied when the Human creates a root Lead authorizes ordinary local, reversible repository work needed to complete that task: inspect, edit, test, create/manage an isolated worktree, create a local commit, create bounded Peer children, and follow them up.
- A verified Engineer Peer child receives permission for ordinary local edit/test/commit from its exact Lead assignment. No marker, JSON envelope, capability list, digest, direct Human-to-Peer grant, scope parser, or authority attenuation protocol is required.
- Remove the user-facing and internal closed `peer|lead_tiny|supervisor_recovery` Task Authority Envelope parser, activation state, commands, gates and tests when they have no remaining nonceremonial consumer. Do not replace them with `lead_orchestration`, hidden tokens, or another grant schema.
- Assignment identity, ownership, base, intended paths and exclusions remain workflow/evidence facts, not capability credentials. Cross-module work stays one assignment when one writer and one Stable Candidate are appropriate.
- Local reversible work is allowed by default for the assigned implementation role. Push, merge, publish, deploy, protocol mutation, destructive/external effects, secrets, material cost, objective changes, irreversible decisions and Local Acceptance remain direct Human-only boundaries.
- Lead and Supervisor responsibilities remain role-bounded: Lead routes and judges rather than doing difficult implementation; Supervisor observes and cannot edit project code. These are cooperative workflow rules, not claims of filesystem security.
- The Lead creates and manages required isolated worktrees itself. It must not tell the Human to prepare Git infrastructure when Git can do so safely.
- A dirty caller checkout is evidence to classify, not an automatic blocker. Untracked/read-only issue notes, specifications, research, generated logs or unrelated documentation do not block creating an isolated worktree from a known clean commit.
- The Lead distinguishes tracked overlap, overwrite risk, another active writer and ambiguous base from non-overlapping read-only dirt. Only a real collision or unresolved ownership/base ambiguity blocks work.
- Isolated work leaves pre-existing caller-checkout dirt untouched. Stable Candidate cleanliness applies to the candidate checkout, not an unrelated Human checkout.
- If an untracked specification is input, bind its canonical path and digest. Copy it into the candidate only when it is an explicit tracked deliverable.
- Reports identify the exact collision and one unblock action. They must not demand a clean repository merely because `git status` is nonempty.

### 2. Create the Supervisor

After obtaining the exact Lead agent ID, the Human creates a `ppo-supervisor` root agent and supplies an assignment containing:

- exact Lead agent ID;
- exact Human task/task ID;
- exact repository root;
- expected workspace/repository binding.

The Supervisor must inspect itself and the Lead. Both must be root agents. Missing, ambiguous, stale, or conflicting identity completes as `BLOCKED`.

### 3. Bind Supervisor and Lead

The Supervisor sends one bounded `SUPERVISOR_BOUND` message to the exact Lead. It contains:

- schema version;
- event ID;
- Supervisor agent ID;
- Lead agent ID;
- task ID;
- repository root;
- workspace identity when required.

The Lead inspects the claimed Supervisor and verifies its role, root parentage, repository/workspace applicability, and task binding before accepting the binding. Process memory is only a cache; restart recovery must reconcile against Paseo facts.

### 4. Execute through Peer children

The Lead classifies the task under the Workspace Protocol and creates Peers with Paseo `create_agent`. Every Peer must:

- have `ParentAgentId` equal to the current Lead ID;
- use the configured Peer provider/model route;
- inherit or receive an allowed workspace placement;
- receive a bounded assignment and notification contract.

A root Peer or a child of another agent is invalid and completes as `BLOCKED`.

### 5. Observe through bounded events

Lead sends only meaningful milestone events to its bound Supervisor:

- `LEAD_STARTED`;
- `PEER_BLOCKED`;
- `CANDIDATE_READY`;
- `REVIEW_COMPLETE`;
- `HUMAN_DECISION_REQUIRED`;
- `LEAD_FINISHED`.

On an event, Supervisor performs one bounded observation pass, optionally sends an evidence-backed observation to the bound Lead, appends Notebook evidence only when useful, and returns to idle. Idle between events is expected.

## Identity and topology contracts

### Root roles

Lead and Supervisor activation requires:

```text
ParentAgentId = null
```

A Lead or Supervisor with a Paseo parent must fail closed. Existing coordinator-created teams are not migrated in place.

### Peer role

Peer activation requires:

```text
ParentAgentId = <exact Lead agent ID>
```

The parent must inspect as an active/applicable PPO Lead. The Peer derives its Lead from Paseo parentage, not solely from task prose.

### Supervisor binding

A Supervisor observes exactly one Lead per active assignment. It may not:

- select another Lead implicitly;
- direct or message Peers;
- issue project acceptance;
- use an event or observation as an Authority Grant.

### Workspace placement

Parentage and workspace placement are separate facts:

- Lead and Supervisor must apply to the same repository/task but need not be parent/child.
- Shared workspace is allowed when safe.
- Writer Peers may use isolated worktrees while retaining Lead parentage.
- Workspace placement continues to follow the Workspace Protocol.

## Communication contracts

### Peer → Lead

Add a narrow parent-scoped communication path. It must:

1. read the current Peer identity from the active process;
2. inspect the Peer through Paseo;
3. derive `ParentAgentId` from Paseo truth;
4. verify the parent is the applicable Lead;
5. send only to that Lead;
6. fail closed when parentage cannot be proven.

Allowed message kinds:

- `question`;
- `blocked`;
- `dependency`;
- `progress`;
- `handoff`.

### Lead → Supervisor

Lead may send milestone events only to its verified bound Supervisor.

### Supervisor → Lead

Allow Supervisor to send observations only to its verified bound Lead. Observations may contain evidence, uncertainty, question, impact, recommendation, or a relayed Human decision. They may not grant authority or direct Peers.

### Event envelope

Use one bounded versioned envelope with at least:

```json
{
  "version": 1,
  "kind": "CANDIDATE_READY",
  "event_id": "<unique-id>",
  "task_id": "<task-id>",
  "sender_agent_id": "<sender-id>",
  "recipient_agent_id": "<recipient-id>",
  "repository_root": "<canonical-root>",
  "payload": {}
}
```

Requirements:

- sender and recipient identities are inspected before use;
- duplicate `event_id` is idempotently ignored/reported;
- stale or out-of-order events cannot widen authority;
- delivery failure is explicit;
- do not automatically retry ambiguous send operations without an idempotency/acknowledgement guarantee;
- event receipt is an attention signal, not acceptance.

## Reconciliation and restart

Remove `createdPeerIds` as the authoritative ownership source. Lead reconciliation queries Paseo and accepts a lifecycle target only when live evidence proves all facts the current public runtime can actually observe:

- `ParentAgentId` equals the current Lead;
- provider is the configured `ppo-peer` provider;
- observed `cwd` is applicable to the repository.

Task/assignment labels are cooperative correlation metadata, not authentication credentials. Compare the child task label with the bound Lead task when both are observable; a mismatch blocks. Missing task/assignment labels from older children are reported explicitly but do not make every ordinary lifecycle operation impossible. Assignment ID remains mandatory in Peer reports and handoff correlation.

Typed workspace identity is checked when the observer supplies it. When the public runtime cannot expose typed workspace identity inside the lifecycle gate, Doctor reports an exact environment ceiling; the gate must not pretend it verified workspace, but absence alone does not block a child whose exact parent, provider and repository applicability are proven. Do not echo caller-supplied task/assignment values as independent validation.

Process-local sets may remain only as non-authoritative caches. Required restart behavior:

- Lead recovers active/completed Peer children from live Paseo parentage/provider/repository facts;
- Lead recovers and revalidates its bound Supervisor;
- Supervisor revalidates its bound Lead;
- archived, replaced, duplicate, mismatched, or missing agents become explicit terminal/blocking states;
- missing optional correlation/workspace facts become bounded warnings/environment ceilings rather than global lifecycle deadlocks;
- no writer is replaced until previous workspace/Git state is reconciled.

## MCP operation normalization

Support canonical and adapter-prefixed names through one explicit alias map, for example:

```text
create_agent       -> create_agent
paseo_create_agent -> create_agent
```

Apply the same normalization to list, inspect/status/activity, send, cancel, and archive operations used by policy and doctor.

Requirements:

- server identity must be exactly Paseo;
- aliases must be explicitly enumerated;
- unknown prefixes/suffixes remain blocked;
- normalization must not broaden role allowlists;
- canonical and prefixed forms must produce identical policy decisions.

## Doctor changes

Add or revise checks for:

- `PASEO_MCP_CONNECTED`;
- `PASEO_REQUIRED_OPERATIONS`;
- `PASEO_AGENT_IDENTITY`;
- `PASEO_SELF_INSPECT`;
- `ROLE_PARENTAGE`;
- `ROLE_PROVIDER`;
- `WORKSPACE_BINDING`;
- `LEAD_SUPERVISOR_BINDING`;
- `PEER_PARENT_BINDING`;
- `EVENT_CAPABILITIES`.

Rules:

- governed Lead/Supervisor/Peer missing mandatory live evidence returns `BLOCKED`;
- an ordinary passive Human session without Paseo identity reports the environment ceiling without pretending governed readiness;
- Notebook history is never current topology evidence;
- the first failed Paseo connection/discovery operation fails fast instead of prompting adapter/config investigation.

## Removal work

Delete the complete bootstrap surface:

- `/ppo:bootstrap` registration, completion, help, prompt and launch contract;
- coordinator health/preflight and role checks;
- bootstrap-only duplicate-team and task-key logic when no longer used;
- bootstrap sections and entry modes in the orchestration skill;
- README bootstrap instructions;
- bootstrap-specific tests, fixtures, errors and snapshots;
- stale package descriptions that say the skill bootstraps a team.

Retain provider installation/configuration, direct Lead workflow, Supervisor recovery where still valid, Peer routing, Workspace Protocol behavior, and Human Local Acceptance boundaries.

## Profiles and skill updates

### Lead profile/skill

- Require root topology.
- Accept the Human task directly.
- Bind/reconcile one Supervisor.
- Create and reconcile Peer children using Paseo truth.
- Send bounded milestone events.
- Preserve existing evidence, Stable Candidate, independent review and escalation responsibilities.

### Supervisor profile

- Require root topology and one exact Lead binding.
- Permit bounded observation and exact-target communication to the Lead.
- Do not direct Peers or own project acceptance.
- Treat the observation loop as event-triggered work, not a persistent process.

### Peer profile

- Require an applicable Lead parent.
- Resolve Lead communication from actual parentage.
- Remain unable to create/manage agents.

## Test-fixture isolation

Tests must not inherit or depend on the runner's real agent environment. Every fixture that exercises identity/topology must pass an explicit environment map and clear at least:

```text
PASEO_AGENT_ID
PI_PASEO_ORCHESTRATION_ROLE
PI_PASEO_ORCHESTRATION_* binding variables
```

Tests must remain hermetic when run inside either a Paseo agent or an ordinary shell.

## Compatibility and migration

This is a breaking topology/command change and targets package `0.2.0` with specification version 2.

- Existing settings and provider aliases should remain compatible where possible.
- `/ppo:bootstrap` is removed, not silently reinterpreted.
- Existing coordinator-created Lead/Supervisor children are not promoted automatically.
- Finish/archive old teams, then create new root Lead and Supervisor agents.
- Document restart requirements after package/provider changes.
- Verify whether existing Supervisor Notebook manifests remain valid; migrate only if their schema actually depends on coordinator parentage.

## Implementation worklist

1. Remove bootstrap command, coordinator workflow and dead supporting code.
2. Update package/skill descriptions and README for direct Human creation.
3. Add self-inspection and root/child topology validation.
4. Implement Supervisor→bound-Lead observation transport and guards.
5. Implement Lead↔Supervisor handshake and reconciliation.
6. Implement bounded milestone envelopes and event handling.
7. Implement Peer→parent-Lead communication from Paseo parentage.
8. Replace authoritative `createdPeerIds` checks with Paseo reconciliation.
9. Add explicit MCP operation normalization.
10. Extend doctor with connection, topology and binding checks.
11. Update profiles and orchestration skill.
12. Delete Task Authority Envelope machinery for ordinary local work; allow assigned Engineer local edit/test/commit directly, retain only real external/destructive/Human-only gates, and add dirty-checkout classification with Lead-managed worktrees.
13. Make tests hermetic against ambient agent environment.
14. Add migration/release documentation without external attribution.
15. Set package version to `0.2.0` and spec version to 2.

## Acceptance matrix

### Automated

```sh
npm test
npm run typecheck
npm run release:smoke
npm pack --dry-run
git diff --check
```

All commands must pass in the supported release environment. Expected live-environment ceilings in `release:smoke` must be explicit and must not be reported as verified facts.

### Topology and communication

1. Human-created root Lead activates.
2. Human-created root Supervisor activates and binds the exact Lead.
3. A Lead or Supervisor with a parent is blocked.
4. Lead creates a valid Peer child.
5. A root Peer or Peer with the wrong parent is blocked.
6. Peer sends each allowed message kind only to its actual parent Lead.
7. Peer cannot message another Lead or Supervisor.
8. Lead restart reconciles existing Peer children from exact parentage, configured Peer provider and repository applicability without process-local ownership memory.
9. A wrong parent/provider/repository or an observable task-label mismatch blocks; missing task/assignment labels or unavailable typed workspace are explicit warnings/Doctor ceilings, not silent PASS and not global lifecycle deadlocks.
10. Supervisor restart revalidates the Lead binding.
11. Lead accepts only a verified root Supervisor binding.
12. Supervisor sends observation only to its bound Lead.
13. Lead sends milestones only to its bound Supervisor.
14. Duplicate/stale/out-of-order events do not grant authority or acceptance.
15. Delivery ambiguity does not cause automatic duplicate sends.
16. Supervisor returns to idle after a bounded observation pass.
17. No daemon, continuous polling, or automatic heartbeat is introduced.
18. Canonical and prefixed MCP operation names receive identical policy decisions.
19. Missing Paseo MCP connectivity fails fast with `BLOCKED` for governed work.
20. Tests pass with ambient agent identity variables present and absent.
21. An untracked `.scratch` specification plus unrelated Markdown does not block isolated implementation from a known base commit.
22. A tracked overlapping modification, overwrite risk, competing writer, or ambiguous base is still blocked with exact evidence.
23. Human can type only `implement <spec-path>`; no later marker, JSON, digest, capability list, scope syntax or direct Peer grant is required for ordinary local edit/test/commit work.
24. A verified Engineer child can edit, test and locally commit its exact assignment without Task Authority Envelope activation.
25. Lead can create the bounded Engineer Peer and prepare its isolated checkout without a separate grant.
26. Cross-module repository work succeeds in one assignment and one Stable Candidate without an authority scope parser.
27. Push, merge, publish, deploy, protocol mutation, destructive/external effects and Local Acceptance remain blocked pending direct Human action.
28. Pre-existing caller-checkout dirt remains byte-for-byte untouched by isolated implementation.
29. Existing Workspace Protocol files remain byte-for-byte unchanged.

## Kết quả mong muốn — Acceptance gate

Chỉ nghiệm thu phiên bản `0.2.0` khi quan sát được toàn bộ kết quả sau:

- Human có thể tạo trực tiếp một Lead root và một Supervisor root bằng Paseo UI hoặc `paseo run`; không cần coordinator hay `/ppo:bootstrap`.
- Lead và Supervisor có `ParentAgentId = null`; role root có parent bị chặn trước governed work.
- Supervisor bind đúng một Lead bằng live Paseo evidence, gửi observation được tới Lead đó và bị chặn khi nhắm agent khác.
- Lead tạo được Peer child; Peer có `ParentAgentId` đúng Lead và bị chặn nếu root hoặc thuộc parent khác.
- Peer hỏi/báo blocker/handoff được tới parent Lead thực tế mà không dựa vào Lead ID chỉ có trong prompt.
- Sau restart, Lead tìm lại đúng Peer children và Supervisor binding từ Paseo; process-local memory không phải nguồn ownership duy nhất.
- Lead gửi milestone tới đúng Supervisor; mỗi event chỉ kích hoạt một bounded observation pass, không grant authority và không đồng nghĩa acceptance.
- Supervisor trở lại `idle` sau observation; hệ thống không tạo daemon, continuous polling hoặc heartbeat tự động.
- Doctor chứng minh hoặc block chính xác MCP connection, identity, topology, workspace và binding; lỗi Paseo đầu tiên dừng fail-fast.
- Checkout chỉ có untracked `.scratch`/Markdown không liên quan không bị coi là blocker; Lead tự tạo isolated worktree và chỉ block collision thật.
- Human chỉ cần nhập `implement <spec-path>` một lần; Engineer child được phép local edit/test/commit theo exact assignment, không có authority marker/JSON, capability list, scope parser hay direct Peer grant.
- Lead orchestration bình thường và chuẩn bị isolated checkout không cần grant riêng; cross-module work hoạt động trong một assignment và một Stable Candidate.
- Canonical và prefixed MCP operation names cho cùng policy result mà không mở rộng allowlist.
- Existing Workspace Protocol files không thay đổi byte nào.
- README chỉ mô tả một startup flow được hỗ trợ và người dùng có thể thực hiện flow đó từ đầu đến cuối.
- Toàn bộ automated checks và live topology/communication cases trong Acceptance matrix có bằng chứng PASS; environment ceiling phải được ghi rõ, không được tính là PASS.

## Done when

- The implementation worklist is complete.
- The Acceptance gate above is satisfied.
- The acceptance matrix passes or every environment-bound check has exact recorded evidence and an explicit environment ceiling.
- Package metadata reports `0.2.0` and the new specification reports version 2.
- README describes one supported startup flow: Human creates root Lead, then root Supervisor, and Lead creates Peer children.
- No documentation or commit message references an external comparison repository.
