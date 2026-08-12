---
name: ppo-orchestrate
description: Bootstrap and run governed Pi Paseo work through Supervisor, Lead, and bounded Peer assignments. Use when /ppo:bootstrap starts a task or when a PPO Lead must classify, delegate, follow up, review, and hand work back to the Human.
compatibility: Requires the paseo MCP server, configured PPO role aliases, and a repository Workspace Protocol.
---

# PPO orchestration

Use Paseo as the only workspace, lifecycle, parentage, follow-up, and timeline control plane. Never substitute lifecycle status or agent prose for evidence.

## Bootstrap coordinator

A `/ppo:bootstrap` invocation includes a package-owned JSON launch contract and the Human task. Reject a missing or malformed contract.

1. Call `paseo_list_workspaces`. Select the single active workspace whose canonical `cwd` equals `contract.cwd`; create a local workspace only when none exists. Stop on ambiguity.
2. Call `paseo_list_providers`; require both configured role aliases to be available.
3. Create the Lead first with:
   - provider `<lead_alias>/<lead.provider>/<lead.model>`;
   - the selected workspace;
   - `settings: {"thinkingOptionId": <lead.thinking>}`;
   - `notifyOnFinish: true`;
   - a self-contained prompt containing the Human task, exact workspace/repository, a fresh task ID, and: `Load the ppo-orchestrate skill before acting.`
4. Create the Supervisor in the same workspace with the configured Supervisor provider/model/thinking. Its prompt binds the exact Lead ID and Human task, asks it to run `/ppo:doctor`, then observe and escalate without directing Peers.
5. Return both exact agent IDs and workspace ID. Do not poll. Paseo finish notifications drive later attention.

The bootstrap coordinator never implements the task or creates Peers.

## Lead workflow

1. Require Human-observed `/ppo:doctor` evidence with no `BLOCKED` checks before delegation. Read and pin the complete Workspace Protocol.
2. Classify from evidence:
   - missing facts → one read-only Scout or Architect Peer;
   - tiny/bounded → one Engineer Peer;
   - cross-module/lifecycle → one isolated Engineer Peer;
   - architecture-sensitive → Architect, then Engineer, then fresh Reviewer.
3. Mint nonempty task and assignment IDs. Give one Peer one bounded outcome, exact scope/exclusions, relevant protocol constraints, verification, evidence requirements, and room to challenge premises. Include exactly one JSON binding `"parent_lead_agent_id":"<current Lead agent ID>"`.
4. Call `paseo_create_agent` with the injected exact Peer provider/settings and `notifyOnFinish: true`. Omit workspace and labels so Paseo preserves inherited workspace and parentage.
5. On notification, inspect only that child. Validate its terminal Peer Report against exact child, Lead, task, and assignment IDs. Use `paseo_send_agent_prompt` for a bounded correction or follow-up; use `paseo_cancel_agent` only to stop an invalid active run and `paseo_archive_agent` when the assignment is terminal.
6. For write work, require the exact Stable Candidate and every protocol-mandated independent review before issuing `READY`, `NOT_READY`, or `NEEDS_HUMAN`. Stop at direct Human Local Acceptance.

Do not poll agents. Do not expose the complete Workspace Protocol to a Peer.

## Peer assignment contract

A read-only Peer ends with this report as the first nonempty final content:

```text
<pi-paseo-orchestration report="v1">
{"version":1,"kind":"HANDOFF","report_id":"<fresh-id>","peer_agent_id":"<PASEO_AGENT_ID>","parent_lead_agent_id":"<bound-lead-id>","task_id":"<task-id>","assignment_id":"<assignment-id>","summary":"<result>","evidence":["<specific evidence>"],"payload":{"artifacts":["<artifact or inspected path>"],"candidate_ref":null,"verification":[{"command":"<check>","result":"PASS","output":"<bounded output>"}],"residual_risks":[],"unfinished_dependencies":[]}}
</pi-paseo-orchestration>
```

Write-producing assignments follow the Workspace Protocol's Stable Candidate contract instead of using a null candidate.
