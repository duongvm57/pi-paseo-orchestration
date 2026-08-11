# Verify current Paseo role and parent communication contracts

Type: research
Status: resolved
Blocked by:

## Question

In current first-party Paseo, how are provider environment values passed to Pi, what identity/parentage facts are inspectable, and what supported primitive lets a Peer report progress, blocked state, dependency, or reopen requests to its parent Lead without creating another control plane?

## Answer

Provider env is reapplied on launch/resume, while create-request env is transient and has no inspectable provenance. Paseo supplies exact self identity through `PASEO_AGENT_ID`, parent identity through the reserved parent label, lifecycle/workspace/activity inspection, and exact-target `send_agent_prompt`; it supplies no role or task-governance truth. Critically, `send_agent_prompt` replaces an in-flight target run and has no receipt, idempotency key, or safe retry contract, so it cannot be treated as a mailbox. Package-level reporting must remain a thin protocol over native completion/prompt primitives and must not promise exactly-once delivery.

Research asset: [`paseo-role-communication.md`](../../../.pi-subagents/artifacts/outputs/2ffe468a/research.md)
