# v0.2 Dogfood Notes

Task: `ppo-v02-dogfood-001`
Base: `2da707dafeaa9e109e509440460a34d690fd64b0`
Lead: `835d6fbe-8743-480a-a20c-6c0527b70359`
Supervisor: `46e3cdd0-e0b1-4df8-b3bf-2c98ed4a13c6`

Record only observed runtime behavior. Each unresolved product issue must be fixed in the candidate or remain an explicit acceptance blocker.

## Findings

### DOGFOOD-001 — Agent-scoped creation cannot create sibling roots

- Observation: `paseo_create_agent` documents that agent-scoped creation defaults to the caller workspace and creates a subagent. It exposes no parent override.
- Impact: an ordinary Pi agent already running inside Paseo cannot use this MCP operation to create root Lead and Supervisor siblings.
- Workaround used: invoke `paseo run` with `PASEO_AGENT_ID` and role variables removed, targeting the existing workspace. Both resulting agents have no reported `parentAgentId` and are root agents.
- Required v0.2 behavior: README and runtime guidance must distinguish Human/top-level creation from agent-scoped child creation. No coordinator should claim it can create sibling roots through agent-scoped `create_agent`.

### DOGFOOD-002 — Paseo MCP starts disconnected but reconnect succeeds

- Observation: initial MCP server status was `configured but not connected`; explicit reconnect exposed all 38 Paseo tools and subsequent calls succeeded.
- Impact: a role that treats initial disconnected status as permanent would block valid work.
- Required v0.2 behavior: doctor may perform one bounded reconnect attempt, then fail fast with exact evidence; no repeated polling or config archaeology.

### DOGFOOD-003 — Requested model and runtime model differ

- Observation: Lead was requested as `ppo-lead/openai-codex/gpt-5.6-sol`, while status reports runtime model `openai-codex/gpt-5.6-luna`. Supervisor was requested as `ppo-supervisor/openai-codex/gpt-5.4-mini`, while runtime reports `opencode-go/deepseek-v4-flash`.
- Impact: model routing evidence is ambiguous; UI/request metadata does not prove the actual model used.
- Required v0.2 behavior: doctor and reports distinguish requested route from effective runtime model and use runtime evidence for verification. Confirm whether role-provider override is intended before classifying this as a routing bug.

### DOGFOOD-004 — Top-level root launch does not initially bind completion notification to the Human-facing harness

- Observation: Lead and Supervisor were created as roots through top-level `paseo run -d`, not as children through the Human-facing harness's `create_agent`; the initial launch output contained no harness notification subscription.
- Impact: if the harness simply returns idle after launch, it may not receive root-agent completion automatically.
- Mitigation used: harness sent one bounded prompt to each root through `paseo_send_agent_prompt`. Paseo confirmed that the harness will be notified when the prompted agent finishes/errors/needs permission. Lead and Supervisor were also given an exact callback contract for candidate, blocker, Human-decision and completion events, with one-shot CLI fallback if v0.1 target policy blocks MCP send.
- Required v0.2 behavior: the Human-created-root flow must explicitly establish and test milestone/completion delivery; successful launch without a return event route is not ready.

### DOGFOOD-005 — Active-turn sleep was used instead of returning idle for child notification

- Observation: while Architect Peer `18e6a142-9a3f-4dec-b029-ec19b5827dc5` was active with `notifyOnFinish`, Lead repeatedly ran `sleep` commands waiting for notification.
- Impact: this is polling debt and may prevent queued child completion from starting a new Lead turn.
- Correction: Lead was instructed to finish the bounded turn and return idle so the native notification can wake it.
- Required v0.2 behavior: role guidance must clearly distinguish returning idle from abandoning the project; no sleeps or status polling while waiting on a named Paseo notification.

### DOGFOOD-006 — Returning idle was conflated with issuing a project `NOT_READY` verdict

- Observation: after being told to stop sleeping, Lead ended its turn with project verdict `NOT_READY` solely because the Architect Peer remained active and no candidate existed yet.
- Impact: an expected in-progress dependency was falsely presented as a terminal project verdict; this can prematurely stop implementation.
- Required v0.2 behavior: a Lead waiting on an active notified child returns a nonterminal `WAITING_FOR_EVENT`/idle handoff, not `READY|NOT_READY|NEEDS_HUMAN`. Project verdicts are issued only after terminal evidence gates or an actual unrecoverable blocker.

### DOGFOOD-007 — Authority provenance seam does not exist; handwritten envelopes add ceremony, not authentication

- Observation: Pi input metadata does not distinguish Human text from an agent-delivered prompt. The current extension instead trusts a handwritten marker/JSON schema that any agent can reproduce, while retained Bash can bypass cooperative path gates.
- Impact: normal local implementation cannot start without impossible or misleading provenance proof; schema limitations also reject repository-wide assignments.
- Human decision: remove Task Authority Envelope machinery for ordinary local reversible work. The Human's initial root-Lead task authorizes local implementation; an exact Lead assignment allows its verified Engineer child to edit/test/local-commit. Keep direct Human gates only for external, destructive, protocol, objective, irreversible, secret/cost and Local Acceptance boundaries.
- Required v0.2 behavior: delete rather than expand the envelope parser, grant kinds, capability/scope activation and handwritten/direct-Peer grant UX. Preserve cooperative role/ownership/evidence checks and real high-risk gates.

### DOGFOOD-008 — First candidate hid authority machinery instead of deleting it

- Candidate: `ccd21dd674bb2ea48800a7eec43868d50c0b6f18`.
- Observation: handwritten authority markers/parser were removed, but `currentAuthority`, `authorityReason`, `doctorAuthorityState`, authority-dependent `effectiveTools`, initial-message provenance capture, Peer parent-derived authority, scope/commit gates, and process-local `createdPeerIds` remain. `CEILINGS.peer` still lacks edit/write and comments still state these tools come only from Task Authority Envelope authority. README and tracked v0.2 spec still describe runtime-captured/attenuated authority. Tests retain a `Task Authority Envelope` slice, envelope fixtures, `lead_tiny` protocol prose, `validateScope`, `checkCommitGate`, and authority getters.
- Impact: candidate contradicts the direct Human decision and Supervisor review gate; normal local work still depends on hidden authority state and provenance inference.
- Required correction: delete ordinary-work authority state/gating and stale tests/docs rather than renaming it. Engineer assignment and cooperative role rules should govern local edit/test/local-commit; retain only real external/destructive/Human-only boundaries and candidate evidence validation that does not depend on authority credentials.

### DOGFOOD-009 — Long-running Lead became permanently blocked by model drift

- Observation: the Lead was originally latched while its role provider resolved to a different effective runtime model; later Paseo status resolved the requested `openai-codex/gpt-5.6-sol`. The v0.1 extension treated that change as permanent runtime drift and blocked subsequent Bash/MCP, including fresh acceptance commands and Reviewer creation.
- Impact: corrected commit `dfd2ce169e9956e5d4c310f9f42ff3edc8929f9e` exists and is clean, but the original Lead cannot complete post-commit verification/review. A long dogfood run cannot recover after provider/model resolution changes.
- Required correction: requested route and effective runtime model must be distinguished. Unexpected model change should fail the affected turn with exact evidence, but recovery must be possible through a fresh correctly configured Lead bound to the existing candidate; do not strand immutable work or require reimplementation.

### DOGFOOD-010 — Restart reconciliation requires facts the public runtime cannot observe

- Candidate: `e3a763bab5b7a7bd5455db77012bacbe60b793dc`.
- Observation: live CLI inspection exposes parent, provider and cwd but not typed workspace, labels, task or assignment. MCP status exposes workspace and labels, but the extension's synchronous `tool_call` gate has no public result/observer seam. The implementation therefore weakened mandatory task/assignment/workspace checks to keep normal lifecycle calls usable; independent review correctly rejected the silent weakening.
- Impact: the active spec demands independent fail-closed facts that the package cannot currently obtain, making successful lifecycle reconciliation impossible without upstream work.
- Human decision: simplify v0.2 reconciliation to facts Paseo currently proves. Require exact parent, configured `ppo-peer` provider and repository applicability; compare task labels when observable; treat missing legacy assignment labels and unavailable typed workspace as explicit warning/Doctor ceilings rather than global lifecycle blockers. Do not claim authentication or independent authorization from mutable labels.

### DOGFOOD-011 — Milestone returned a short Peer ID where exact ID was required

- Observation: recovery Lead reported corrective Engineer as `5f47d13c`; `get_agent_status` requires the exact full agent ID and returned not found. A bounded `list_agents` reconciliation resolved `5f47d13c-4107-4845-b866-469c36cc797b`.
- Impact: observers cannot safely inspect or target the reported agent without an additional broad lookup, and short-ID collisions remain possible.
- Required correction: every assignment, milestone, handoff and callback carries full Paseo agent IDs; short IDs are display-only.

## Live v0.2 end-to-end validation

Candidate under test: `57d9d820128d25a6188c403903a1a960e7e2f90f`
Temporary package source: `/tmp/ppo-v02-eng-fix-006`
Temporary repository/workspace: `/tmp/ppo-v02-live-dogfood` / `wks_73e22ac687b344e3`
Task: `ppo-v02-live-e2e-001`
Lead: `0fe46f78-a7f0-4c5e-801a-822198efc3fd`
Supervisor: `9299b4b5-6feb-48d8-920f-a9115340ca84`

The Human-facing Pi package source was temporarily switched from the main checkout to the exact candidate and Paseo was restarted. The live task must prove root Lead/Supervisor binding, actual Peer child creation, local reversible Engineer edit/commit, independent review, bounded event delivery and terminal callback. After the run, restore `/home/duongvm/.pi/agent/settings.json` from `/tmp/pi-agent-settings-before-ppo-v02-live.json` and restart Paseo regardless of result.

### DOGFOOD-012 — Live root agents spin without observable progress

- Result: `NOT_READY`; no candidate acceptance claim.
- Reproduction: create Human root Lead `0fe46f78-a7f0-4c5e-801a-822198efc3fd` and root Supervisor `9299b4b5-6feb-48d8-920f-a9115340ca84`, then prompt the tiny `ppo-v02-live-e2e-001` task.
- Observation: both agents remained `running` for minutes with an active turn, zero curated activity, no Peer creation, no milestone/callback and no repository change. Retrying one consolidated prompt after cancellation reproduced the same symptom. Cancellation itself returned `This operation was aborted`; agents only transitioned to idle/finished afterward.
- Safety: `LIVE_DOGFOOD.md` remained absent and the temporary checkout remained clean. The original Pi package source was restored and Paseo restarted before further work.
- Impact: candidate `57d9d820128d25a6188c403903a1a960e7e2f90f` lacks required live release-flow evidence.
- Minimized diagnosis (no further daemon restart):
  - Baseline `pi/openai-codex/gpt-5.6-luna` returned `PONG` with model usage; the model/provider path is healthy.
  - Active-agent `paseo inspect "$PASEO_AGENT_ID" --json` completed and returned `SELF_INSPECT_PASS`; current-agent CLI inspection is possible after registration.
  - The exact candidate extension, loaded explicitly with the MCP adapter and an already-registered matching Lead identity, returned `PONG`; candidate initialization/model shaping is not universally broken.
  - Both failed live roots retain `LastUsage: null` and zero activity. The model was never invoked: failure is before the first model request, inside fresh governed-agent startup/first-input handling.
  - Sending an overlapping prompt to a baseline agent completed with `SECOND_DONE`; prompt replacement alone does not reproduce the failure.
- Ranked remaining cause: the candidate performs fail-closed self-observation during `session_start` while the newly created Paseo agent may not yet be inspectable, then keeps the activation failure sticky. Because `blockWith` reports only through `ctx.ui.notify`, headless Paseo exposes no reason and the handled initial input looks like an indefinitely running turn. A missing active `mcp` tool at the same startup seam is the secondary possibility; current evidence cannot distinguish it because the block reason was not persisted.
- Required correction before another team run: make governed startup failure terminal and machine-observable (exact block reason in Paseo activity/status), and add a fresh-agent integration check that fails when first input is silently handled with `LastUsage: null`. Do not retry or silently weaken fail-closed identity checks.

### DOGFOOD-013 — Startup race fixed and verified live (commit cb0a877)

- Root cause: fresh governed root agents failed closed during `session_start` when self/topology observation could not yet see the newly created Paseo agent, then the sticky block made the first input look like a silently spinning turn (`LastUsage: null`, zero activity).
- Fix `50b4e97` surfaced every block as a machine-visible custom message (`pi-paseo-orchestration-blocked`), proving the block existed but was hidden.
- Fix `cb0a877` defers topology observation to the first input: `session_start` marks activation pending when parentage is not yet observable; the `input` handler retries activation once, then runs the normal gates. Fail-closed semantics are unchanged — a retry that still cannot observe topology reports the exact reason.
- Live verification (deepseek-v4-flash, ~$0.0005): fresh `ppo-lead` agent returned `PONG`; pre-fix it blocked with "governed lead activation requires live Paseo self/topology evidence". Regression test "fresh governed activation defers topology observation to first input" added; full suite 96/96 pass.
- Main repo now carries the full v0.2 candidate (merge a820437); package source stays pointed at the main checkout.

### DOGFOOD-014 — MCP connection drops after paseo restart; reconnect must wait for daemon ready

- Mechanism: Paseo injects the `paseo` MCP server into Pi agents through a temporary `--mcp-config` file (the static `~/.pi/agent/mcp.json` is empty). The server connects to the daemon on `127.0.0.1:6767`; pi-mcp-adapter defaults to `lifecycle: lazy` (no auto-reconnect), so a daemon restart drops the connection.
- Operating rule: after `paseo restart`, first wait until `paseo status` reports `running`/`reachable`, then call `mcp({ connect: "paseo" })`; if it fails with "Tool mcp not found", wait 5-10s and retry — the MCP gateway needs the daemon ready before it can reconnect. Do not fall back to the CLI silently without attempting this.


- Root cause: fresh governed root agents failed closed during `session_start` when self/topology observation could not yet see the newly created Paseo agent, then the sticky block made the first input look like a silently spinning turn (`LastUsage: null`, zero activity).
- Fix `50b4e97` surfaced every block as a machine-visible custom message (`pi-paseo-orchestration-blocked`), proving the block existed but was hidden.
- Fix `cb0a877` defers topology observation to the first input: `session_start` marks activation pending when parentage is not yet observable; the `input` handler retries activation once, then runs the normal gates. Fail-closed semantics are unchanged — a retry that still cannot observe topology reports the exact reason.
- Live verification (deepseek-v4-flash, ~$0.0005): fresh `ppo-lead` agent returned `PONG`; pre-fix it blocked with "governed lead activation requires live Paseo self/topology evidence". Regression test "fresh governed activation defers topology observation to first input" added; full suite 96/96 pass.
- Main repo now carries the full v0.2 candidate (merge a820437); package source stays pointed at the main checkout.
