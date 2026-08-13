---
name: ppo-orchestrate
description: Bootstrap and run governed Pi Paseo work through Supervisor, Lead, and bounded Peer assignments. Use when /ppo:bootstrap starts a task or when a PPO Lead must classify, delegate, follow up, review, and hand work back to the Human.
compatibility: Requires the paseo MCP server, configured PPO role aliases, and a repository Workspace Protocol.
---

# PPO orchestration

Use Paseo as the only workspace, lifecycle, parentage, follow-up, and timeline control plane. Never substitute lifecycle status or agent prose for evidence.

## Paseo tool calls

Invoke each Paseo operation through the outer `mcp` tool with the exact shape `{"server":"paseo","tool":"paseo_<operation>","args":{...}}`. Call the named operation directly; the outer tool is a transport, not a discovery or status operation. For example, list workspaces with `{"server":"paseo","tool":"paseo_list_workspaces","args":{}}`.

## Entry modes

A Lead may receive the Human task directly from the PPO Lead Paseo provider or through `/ppo:bootstrap`; both routes use the Lead workflow below. The bootstrap coordinator receives the package-owned JSON launch contract. A direct Lead starts from the Human task without that contract. A direct-mode Supervisor is optional; its prompt binds one exact Lead agent ID and the Human task, and a missing or ambiguous binding completes as `BLOCKED`.

## Bootstrap coordinator

A `/ppo:bootstrap` invocation includes a package-owned JSON launch contract and the Human task. Reject a missing or malformed contract.

1. Call `paseo_list_workspaces`. Select the single active workspace whose canonical `cwd` equals `contract.cwd`; create a local workspace only when none exists. Stop on ambiguity.
2. Call `paseo_list_providers`; require both configured role aliases to be available. Call `paseo_list_agents` once with `{"cwd":"<contract.cwd>","statuses":["running","idle"],"limit":100}` and compare exact PPO labels:
   - an active `pi-paseo-orchestration.task-key` equal to `contract.task_key` completes as `BLOCKED` with the existing team IDs;
   - an active PPO writer for the same checkout completes as `NEEDS_HUMAN` unless the new work is read-only or names a distinct isolated checkout;
   - unrelated read-only teams may proceed.
3. Create the Lead first with:
   - provider `<lead_alias>/<lead.provider>/<lead.model>`;
   - the selected workspace;
   - labels `{"pi-paseo-orchestration.task-key":"<contract.task_key>","pi-paseo-orchestration.team-role":"lead"}`;
   - `settings: {"thinkingOptionId": <lead.thinking>}`;
   - `notifyOnFinish: true`;
   - a self-contained prompt containing the Human task, exact workspace/repository, a fresh task ID, and: `Load the ppo-orchestrate skill before acting.`
4. Create the Supervisor in the same workspace with the same task-key label and team-role `supervisor`, configured Supervisor model/thinking, exact Lead ID, and Human task. Ask it to run `/ppo:doctor`, then observe and escalate without directing Peers.
5. Return both exact agent IDs and workspace ID. This bootstrap completes when both labels and bindings are exact. Continue only from Paseo finish notifications.

The bootstrap coordinator never implements the task or creates Peers.

## Lead workflow

1. Read and pin the complete Workspace Protocol. Use `paseo_list_workspaces` and `paseo_list_providers` only when discovery is needed. Run `/ppo:doctor` for setup, recovery, suspected configuration/runtime drift, or troubleshooting—not as a gate for normal delegation and never ask the Human to copy its output between agents.
2. Classify from evidence:
   - missing facts → one read-only Scout or Architect Peer;
   - tiny/bounded → one Engineer Peer;
   - cross-module/lifecycle → one isolated Engineer Peer;
   - architecture-sensitive → Architect, then Engineer, then fresh Reviewer.
   These are common dispositions; mint a clearer task-specific disposition when it narrows ownership or evidence.
3. Reuse an active assignment only for a bounded follow-up whose task, owner, checkout, and scope remain exact. A retry or changed ownership mints a new assignment ID. Before launch, reconcile active ownership: one writer per moving scope; concurrent writers have disjoint scopes and distinct isolated checkouts; independent read-only assignments may run together. Then mint nonempty task and assignment IDs and complete the Peer brief: disposition; bounded objective and owner; exact repository, workspace/checkout, and scope/exclusions; dependencies; requested capabilities and authority boundary; relevant protocol constraints; known evidence and provisional assumptions; verification and handoff evidence. Frame plans and file lists as provisional inputs and require the Peer's evidence-backed conclusion. Select the Human-configured model route whose description best fits the work, independently of disposition. Include exactly one JSON binding for each of `"model_route":"<route-id>"` and `"parent_lead_agent_id":"<current Lead agent ID>"`. Copy the exact applicable terminal template from **Peer assignment contract** below into the brief. Bind only the known Lead, task, and assignment identity placeholders before launch. Direct the child to replace `<PASEO_AGENT_ID>` from its runtime environment and fill the report ID, result, artifacts, evidence, verification, risks, and dependencies from its work. This step completes when the identity bindings are exact and the template's field names, scalar types, arrays, and payload shape remain unchanged.
4. Call `paseo_create_agent` with the selected route's exact provider/model/thinking tuple and `notifyOnFinish: true`. Omit workspace and labels so Paseo preserves inherited workspace and parentage. This step completes when the policy accepts the exact route, parent binding, inherited workspace, and notification contract.
5. On notification, inspect only that child. Validate its terminal Peer Report against exact child, Lead, task, and assignment IDs. Use `paseo_send_agent_prompt` for a bounded correction or follow-up. After two follow-ups addressing the same symptom or an unchanged prerequisite, complete a root-mechanism check; record either new evidence for one changed next action or the applicable terminal verdict/reclassification before continuing. Use `paseo_cancel_agent` only to stop an invalid active run and `paseo_archive_agent` when the assignment is terminal.
6. For write work, require the exact Stable Candidate and every protocol-mandated independent review before issuing `READY`, `NOT_READY`, or `NEEDS_HUMAN`. Stop at direct Human Local Acceptance.

Do not poll agents. Do not expose the complete Workspace Protocol to a Peer.

## Peer assignment contract

A read-only Peer ends with this exact closed report as the first nonempty final content. Preserve every field name and JSON shape:

```text
<pi-paseo-orchestration report="v1">
{"version":1,"kind":"HANDOFF","report_id":"<fresh-id>","peer_agent_id":"<PASEO_AGENT_ID>","parent_lead_agent_id":"<bound-lead-id>","task_id":"<task-id>","assignment_id":"<assignment-id>","summary":"<result>","evidence":["<specific evidence>"],"payload":{"artifacts":["<artifact or inspected path>"],"candidate_ref":null,"verification":[{"command":"<check>","result":"PASS","output":"<bounded output>"}],"residual_risks":[],"unfinished_dependencies":[]}}
</pi-paseo-orchestration>
```

Write-producing assignments follow the Workspace Protocol's Stable Candidate contract instead of using a null candidate.
