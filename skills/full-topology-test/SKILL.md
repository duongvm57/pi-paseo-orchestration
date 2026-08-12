---
name: full-topology-test
description: Run the live Pi Paseo Supervisor → Lead → Peer integration proof, including recovery-form RPC, role identity, doctor policy, report correlation, and cleanup.
disable-model-invocation: true
compatibility: Requires Node.js, the paseo CLI, a running Paseo daemon, configured ppo-supervisor/ppo-lead/ppo-peer aliases, and an existing workspace.
---

# Full topology test

Run the packaged test driver; do not reconstruct the flow from memory:

```bash
node ./scripts/run.mjs --workspace <paseo-workspace-id>
```

Use `--keep` only when a Human asks to inspect the live agents afterward. Otherwise the driver archives every agent it creates, including failed partial runs.

## Pass contract

Accept `FULL TOPOLOGY PASS` only when the driver proves all of these from live Paseo state and package validators:

1. fresh `ppo-supervisor` has the configured Supervisor model/thinking and the requested workspace;
2. `/ppo:supervisor-recovery` receives the six Human RPC answers with exact prompt titles and stores the Paseo alias `ppo-lead`;
3. Supervisor creates one `ppo-lead` whose `ParentAgentId` is the Supervisor and whose workspace/model/thinking are exact;
4. Human `/ppo:doctor` on Lead has no `BLOCKED` check and `ROLE_ACTIVATION`, `PASEO_IDENTITY`, and `TOOL_POLICY` are `PASS`;
5. Lead creates one `ppo-peer` whose `ParentAgentId` is the Lead and whose workspace/model/thinking are exact;
6. Human `/ppo:doctor` on Peer has the same mandatory passes;
7. the terminal Peer Report parses under the package schema and correlates to exact Peer, Lead, task, and assignment IDs;
8. repository status is byte-for-byte unchanged by the live run.

`OBSERVER_ATTESTATION WARN` is the documented current environment ceiling. It is acceptable only when every mandatory check above is `PASS` and no check is `BLOCKED`.

## Failure classification

- `Pi RPC request timed out for prompt`: the recovery answers missed Pi's dialog timeout; rerun the driver, never answer the form manually one field at a time.
- Recovery provider prompt is absent or offers Pi model providers: package regression; the field must be a Human-attested Paseo alias text input.
- `TOOL_POLICY BLOCKED` with Goal/List tools: package regression; `/ppo:doctor` must heal post-activation tool drift before reporting.
- Child identity/model/thinking/workspace mismatch: package/Paseo integration failure; do not trust agent prose.
- Peer report schema/correlation failure: assignment/report failure; do not treat idle/completed as evidence.
- Missing Lead timeline payload after a later Peer follow-up: expected Paseo behavior. `notifyOnFinish` is an attention signal for the created child run, not a mailbox or delivery guarantee for subsequent follow-up report payloads. Inspect the Peer timeline and validate the report directly.

Do not claim full topology success from Supervisor → Lead creation alone or from Lead → Peer creation alone.
