# Define the doctor contract

Type: grilling
Status: resolved
Blocked by: 01, 03, 04, 05

## Question

Which facts must the observation-only doctor verify for the current cwd/session, which states are PASS/WARN/BLOCKED, what minimum Pi/Paseo/adapter versions or proven capabilities are required, and how can it report remediation without mutating configuration?

## Answer

## Contract boundary

`/ppo:doctor` is a deterministic, observation-only Pi extension command. It inspects only the command's current `ctx.cwd`, the Git repository containing that cwd, the current Pi process/session, and the exact current Paseo agent/workspace reachable from that session. It accepts no alternate path, repository, workspace, agent, or session target.

Doctor never invokes the model; changes active tools; reparses a prompt as a new grant; writes config, profile, protocol, transcript, Git, or workspace state; starts/stops/reloads an agent or daemon; connects an unrelated lazy adapter server merely to discover it; installs/updates a package; or performs repair. A bounded read-only connection to the exact current Paseo daemon is allowed because reachability must be observed. Paseo remains the only lifecycle/workspace control plane. Doctor adds no service, daemon, queue, ledger, mailbox, registry, retry loop, or repair plane.

A report describes one bounded observation interval. It is neither acceptance nor an Authority Grant, and it makes no sandbox, authorization, authentication, isolation, delivery, or security guarantee. Retained Bash and recognizable command guards remain a cooperative Policy Guardrail only.

## Target and temporal consistency

At start, doctor records a new report ID, start time, `ctx.cwd`, Pi session ID, process-latched activation snapshot, and effective `PASEO_AGENT_ID`. It resolves the canonical Git root from `ctx.cwd`; the repository root is never inferred from a title, remote, branch, package path, protocol text, or Paseo workspace name. It then observes only that context.

Before emitting, doctor rechecks the current cwd/session/agent identity plus every critical file digest and live identity used by the report. A change during observation yields `BLOCKED / OBSERVATION_DRIFT`; doctor reports both observations and does not retry until a preferred answer appears. A bounded timeout or unavailable read-only probe is a reported result, not a polling loop.

All Git observations use read-only plumbing/porcelain with `GIT_OPTIONAL_LOCKS=0`. Human-owned staged, unstaged, and untracked changes are reported in bounded form and never stashed, reset, cleaned, staged, committed, overwritten, or relocated.

## Result semantics

Every check has exactly one `status`:

- `PASS`: every mandatory fact for that check was observed in the exact target context and matched the contract. It means only "this check passed during this observation interval." It does not mean the task, candidate, review, project, or security posture is accepted.
- `WARN`: a non-required or currently non-applicable capability is missing; provenance is valid but local/unpinned; or the session is deliberately passive/ungoverned. The current governed role's mandatory workflow can still operate. Warnings remain visible and never count as acceptance.
- `BLOCKED`: a mandatory fact is missing, malformed, ambiguous, stale, mismatched, unreachable, or drifted. Ordinary governed work must not proceed until a Human/operator remedies and reruns doctor. Doctor itself remains available and observation-only.

Overall status is the worst applicable check, with `BLOCKED > WARN > PASS`. A missing/empty role forces overall `WARN` (`UNGOVERNED`) even when passive Pi behavior is otherwise valid. An invalid non-empty role is `BLOCKED`. Role-specific non-applicable checks stay explicit with `applicable: false`; they may be `PASS` only when the contract positively verifies that the capability is correctly absent or not required.

## Compatibility policy

Capability probing is primary. A lower version passes when every required capability and semantic compatibility fact is positively established; an equal or newer version blocks when a required capability is absent or has incompatible behavior. Numeric versions are always evidence, never a substitute for a failed probe.

A version floor is used only for a required semantic that cannot be exercised safely and read-only in the current session and for which first-party evidence establishes the floor. An implementation compatibility table may attest an older equivalent; then the capability passes. Without either a safe probe or an attested equivalent, the check is `BLOCKED / CAPABILITY_UNATTESTED`, not optimistic PASS.

The v0.1 attested reference set is Pi `0.84.1`, Paseo `0.3.1`, and `pi-mcp-adapter` `2.22.0`. These are not blanket floors. Pi must expose the command/tool provenance and active-tool APIs used below and the already-attested run/session hook semantics; Paseo must answer the exact read-only identity/parent/workspace probes below; the adapter must expose one uniquely attributable loaded command/tool surface. Package/test distribution remains outside this ticket.

## Mandatory observation set

Doctor uses one shared parser/digest/policy implementation with runtime activation; it must not implement a second, looser interpretation.

### 1. Current cwd and repository

- `CONTEXT.CWD`: canonical `ctx.cwd` exists and is readable.
- `GIT.REPOSITORY`: resolve one canonical repository root containing `ctx.cwd`; report root, full `HEAD` when available, branch only as a locator, and bounded clean/dirty counts including untracked files.
- `CONTEXT.CWD_MATCH`: compare `ctx.cwd`, effective `PASEO_AGENT_CWD` when present, live Paseo agent cwd, workspace cwd, and repository root according to their distinct meanings. `ctx.cwd` and the live snapshot must identify the same current checkout context. A present `PASEO_AGENT_CWD` must match; its absence is `WARN` when the live typed snapshot still proves cwd, because it is not a locked activation prerequisite. The Workspace Protocol must live at the repository root.

Outside Git is `BLOCKED` for a governed activation and `WARN` for an ungoverned session. A wrong root/cwd, symlink/canonical-path mismatch that changes identity, or a workspace aimed at another checkout is `BLOCKED`.

### 2. Pi runtime and package provenance

- `PI.CAPABILITIES`: positively observe the required Pi APIs: registered command provenance, all-tool provenance, active tools, and the presence of active-tool replacement plus run/session interception APIs. Doctor does not mutate tools or start a model run to exercise them; semantics that cannot be tested read-only must be covered by the compatibility attestation described above.
- `PACKAGE.SELF`: find exactly one loaded doctor command with canonical Pi `sourceInfo`; resolve its package manifest identity/version and extension content digest; report user/project/temporary scope and package/top-level origin.
- `PACKAGE.COLLISION`: no duplicate/colliding doctor command or conflicting package identity may be silently selected.

A uniquely loaded expected package is required. Missing/ambiguous/mismatched provenance or collision is `BLOCKED`. A valid local or unpinned source is `WARN`; pin policy is left to ticket 11. If the whole extension is not loaded, the command cannot run: absence of the command in first-party Pi command discovery is the evidence, and the operator must load the package before rerunning. Doctor never claims it diagnosed itself from an unavailable command.

### 3. Paseo reachability, identity, parentage, and workspace

Use bounded read-only capabilities, not names or process existence alone:

- `PASEO.REACHABLE`: the exact configured daemon answers a supported read-only request; a PID, socket file, CLI binary, or adapter load alone is insufficient.
- `PASEO.VERSION`: report client and responding daemon versions separately and any mismatch. A mismatch is `WARN` when all mandatory capabilities pass, and `BLOCKED` only when it causes an incompatible or unattested required capability.
- `PASEO.IDENTITY`: effective nonblank `PASEO_AGENT_ID` equals the exact live agent snapshot ID; provider is Pi; archived/closed/missing identity is rejected.
- `PASEO.CWD`: live agent cwd and effective `PASEO_AGENT_CWD` canonically match `ctx.cwd`.
- `PASEO.PARENT`: report the exact current parent ID and whether it is well-formed, non-self, and resolves to one live/stored Paseo agent. Peer requires one resolvable parent; missing, malformed, self-parent, or unresolvable parentage is `BLOCKED`. Supervisor/Lead may be roots or recovery children, so presence is reported rather than role-inferred. Paseo parentage never proves the parent's Role Profile. Where a recovery Supervisor or Lead already holds an expected parent ID, it compares that external evidence to the report; doctor does not invent or persist an assignment pin.
- `PASEO.WORKSPACE`: obtain the agent's exact typed workspace ID from its live snapshot, join that exact ID to one active workspace, and report workspace ID, project ID, cwd, isolation and kind. A unique cwd guess is not a typed binding. Missing, duplicate, archived, mismatched, or unprovable binding is `BLOCKED` for governed work.

Provider alias, title, cwd, workspace name, model, label prose, lifecycle status, and parentage never establish package role, authority, task state, or acceptance.

### 4. Adapter availability and provenance

- `ADAPTER.LOADED`: identify exactly one loaded `mcp` extension command (including Pi's collision suffix rules) whose canonical provenance and manifest identify `pi-mcp-adapter`; report adapter version and source.
- `ADAPTER.TOOL`: verify the corresponding outer `mcp` tool provenance and whether it is registered and active.
- `ADAPTER.PASEO_PATH`: require the live Paseo agent snapshot to attest that MCP server configuration was applied for this Pi process, then combine that fact with the uniquely loaded/active adapter and successful exact read-only Paseo probes. The adapter's public status snapshot may add server names/status/counts without connecting, but it does not expose an inner-tool catalog and is not treated as proof of individual target names. Adapter load alone does not prove Paseo reachability or routing.
- `ADAPTER.COLLISION`: duplicate names, missing provenance, name-only matches, or conflicting sources are ambiguous.

Missing/ambiguous adapter provenance, an inactive outer `mcp`, absent Paseo MCP configuration attestation, or failed required Paseo read-only capabilities are `BLOCKED` for Supervisor and Lead; adapter absence is `WARN` for Peer and ungoverned sessions. Peer must not have outer `mcp` active. `mcp_script` must be inactive for every governed role. An active forbidden surface is `BLOCKED` policy drift.

### 5. Role activation and Role Profile

- `ROLE.ENV`: report missing/empty, exact `supervisor | lead | peer`, or invalid without trimming/case normalization.
- `ROLE.SNAPSHOT`: compare current role, `PASEO_AGENT_ID`, profile source/path, and profile digests to the first successful process activation snapshot.
- `PROFILE.SOURCE`: report bundled versus Human override; an override must be one absolute complete directory containing all three exact nonempty readable files.
- `PROFILE.SELECTED`: report selected profile path and SHA-256 digest, never profile contents; all three structural/digest facts are checked.
- `PROFILE.DRIFT`: current env/path/content must match the process snapshot.

Missing/empty role is `WARN / UNGOVERNED`. Invalid role, governed activation without Paseo identity, missing/unreadable/empty/incomplete profile state, selected-role mismatch, or any process drift is `BLOCKED`. A structurally valid custom profile may pass, while the limitations list states that prose conformance is not machine-provable and profiles must contain no secrets.

### 6. Workspace Protocol

At the exact repository root, use the canonical strict Workspace Protocol parser to report:

- canonical path `.orchestration/workspace-protocol.md`;
- status, version, last-reviewed value, Human-defined project identity, repository-wide root declaration, required-core completeness, and closed optional-section validity; the current snapshot can validate the version's form and compare it with an activation/task pin, but it does not claim historical monotonicity without retained evidence;
- SHA-256 digest of the exact bytes;
- protocol `project_id` match against the current task/assignment's Human-defined project pin, when present;
- the exact Paseo workspace project ID as a separate lifecycle fact. These are distinct identity namespaces and are never equated unless a future explicit binding says so;
- activation/current-task pinned version and digest, when present.

Missing, empty, unreadable, malformed, conflicting, repository-root mismatch, project-identity mismatch, or invalid required core is `BLOCKED` for governed orchestration. When an existing machine-visible task pin is available, a changed file digest/version is `BLOCKED / PROTOCOL_DRIFT` and requires Lead/Human re-evaluation; doctor never silently changes the pin or decides materiality. For a governed task that claims a pin but exposes none to the package, doctor reports `BLOCKED / PROTOCOL_PIN_UNAVAILABLE` rather than inventing or scraping one from prose. With no current task context, the pin check is explicitly non-applicable and only current valid protocol state is reported.

### 7. Effective tools and policy

Report four distinct sets with canonical tool provenance:

1. session baseline captured at `session_start`;
2. closed Role Profile ceiling;
3. current-run requested/granted capability set;
4. actual effective active tools at doctor invocation.

For each expected tool, report `active`, `inactive`, or `unavailable` and a reason such as `human_disabled`, `outside_role_ceiling`, `authority_absent`, `authority_rejected`, `optional_unavailable`, or `policy_drift`. Recompute expected policy as baseline ∩ role ceiling ∩ current-run authority, but never call `setActiveTools` from doctor.

A Human-disabled tool is never re-enabled. Missing a role-required core capability is `BLOCKED`; a requested optional capability that Human disabled or that is unavailable is `WARN / AUTHORITY_TOOL_UNAVAILABLE` while remaining absent. Any active tool outside the expected intersection, forbidden `mcp_script`, or direct publication/deployment surface is `BLOCKED`. Tool visibility and Bash/Git call guards are not a sandbox.

### 8. Current-run Task Authority Envelope

Report the extension's internal parse result and correlation, not a new parse of arbitrary transcript prose:

- state: `none`, `valid`, `rejected`, or `stale_inactive`;
- internal run correlation and whether a run is currently active;
- marker version, grant kind, role, issuer route, Paseo agent ID, task ID, capabilities, normalized scope/exclusions, candidate base or recovery binding when applicable;
- envelope digest and rejection diagnostic codes;
- requested versus actually available capabilities.

Do not echo the raw prompt or claim cryptographic Human authorship. At idle, an earlier grant is inactive and cannot be called current authority. No envelope is `PASS / BASE_ONLY` when the role's base read-only behavior is expected. A malformed/mismatched current request is `BLOCKED` for that requested run and grants nothing. A stale grant that remains effective is `BLOCKED / AUTHORITY_STALE`; a retained but provably inactive historical record is reported as `stale_inactive` and cannot grant capability.

## Exact report and evidence contract

In TUI or RPC mode, the command emits exactly one canonical block first through the non-persistent command UI channel, then a human table derived from the same in-memory object. It does not append a transcript/session entry. Pi's print/JSON modes expose no supported extension-command UI output channel; there doctor performs no probes and fails explicitly with `OUTPUT_CHANNEL_UNAVAILABLE` rather than silently succeeding or mutating the transcript. A headless/standalone output channel belongs to ticket 11.

```text
PI_PASEO_DOCTOR_REPORT_BEGIN v1
{
  "report_id": "opaque-token",
  "started_at": "RFC3339 timestamp",
  "finished_at": "RFC3339 timestamp",
  "doctor": {
    "contract_version": "v1",
    "package_version": "version",
    "source": {"scope": "user|project|temporary", "origin": "package|top-level", "source": "canonical Pi source", "digest": "sha256"}
  },
  "overall_status": "PASS|WARN|BLOCKED",
  "activation": "governed|ungoverned|blocked",
  "target": {
    "cwd": "canonical path",
    "repository_root": "canonical path or null",
    "pi_session_id": "id or null",
    "paseo_agent_id": "id or null",
    "workspace_id": "id or null",
    "paseo_project_id": "id or null",
    "protocol_project_id": "id or null",
    "role": "supervisor|lead|peer|null"
  },
  "compatibility": [
    {"component": "pi|paseo-client|paseo-daemon|adapter", "version": "string|null", "strategy": "capability|floor", "required_capabilities": ["code"], "missing_capabilities": [], "floor": "string|null", "status": "PASS|WARN|BLOCKED"}
  ],
  "checks": [
    {
      "code": "stable.diagnostic.code",
      "subject": "bounded subject",
      "applicable": true,
      "required": true,
      "status": "PASS|WARN|BLOCKED",
      "expected": "bounded exact expectation",
      "observed": "bounded exact observation",
      "evidence": [
        {"kind": "api|env|file|command|memory", "source": "fact source", "digest": "sha256|null", "exit_code": "integer|null", "output": "bounded redacted output or null"}
      ],
      "remediation": {
        "owner": "human|operator|lead|supervisor|null",
        "action": "manual instruction or null",
        "commands": [{"command": "copyable command", "mutates": true}],
        "rerun_required": true
      }
    }
  ],
  "policy": {
    "session_baseline": ["tool"],
    "role_ceiling": ["tool"],
    "authority_state": "none|valid|rejected|stale_inactive",
    "requested_capabilities": ["capability"],
    "effective_tools": [{"name": "tool", "source": "canonical provenance", "state": "active|inactive|unavailable", "reason": "code"}]
  },
  "mutations": {"attempted": false, "performed": false},
  "limitations": ["not acceptance", "not a sandbox or security guarantee", "Human/profile semantics are not cryptographically or semantically proven"]
}
PI_PASEO_DOCTOR_REPORT_END
```

The schema is closed: unknown/missing/duplicate fields, wrong types, duplicate check codes, malformed markers, or a body whose table disagrees with the block makes the report malformed. Arrays are deterministically ordered by component/check/tool code. Paths are canonical; commit IDs and digests are full; timestamps state the observation interval. Output is bounded and secret-redacted. Doctor never emits profile/protocol contents, credentials, tokens, complete environment, raw authority prompt, or arbitrary MCP/config payloads. File/API evidence carries selected fields plus digest; command evidence carries the exact read-only command, exit code, and bounded stdout/stderr. Truncation is explicit with a digest/count, never silent.

The table shows overall status, exact target, one row per check (`STATUS | CODE | OBSERVED | REMEDIATION`), effective authority/tools, and limitations. It does not introduce facts absent from the JSON block. Report IDs are correlation only; doctor does not persist or register them.

## Remediation and exit behavior

Every non-PASS check names the owner and smallest manual action. A copyable command may be shown only when its effect is known; every command that installs, edits, reloads, restarts, or otherwise mutates is marked `mutates: true` and is never run by doctor. Doctor never recommends push, merge, amend, deploy, automatic acceptance, automatic retry, or a repair service. Installation/configuration may be suggested as a Human/operator action only; after any action, the Human reruns doctor.

After output, the slash command returns to the same Pi session. It does not call the model, exit Pi, alter the command's process status, trigger repair, or map overall status to a process exit code. A future executable/CI exit-code contract belongs to ticket 11.

## Required stress-test outcomes

| Scenario | Outcome |
|---|---|
| Outside Git | Governed: `BLOCKED / GIT_REPOSITORY_MISSING`; ungoverned: overall `WARN`. |
| Wrong repository root/cwd | `BLOCKED / CONTEXT_CWD_MISMATCH`; report all conflicting canonical values. |
| Paseo unreachable | Governed: `BLOCKED / PASEO_UNREACHABLE`; ungoverned: `WARN`; no retry/start. |
| Paseo identity/workspace/parent missing or mismatched | `BLOCKED` for the applicable governed invariant; never infer from title/cwd/name. |
| Extension not loaded | Doctor command is unavailable; first-party command discovery shows absence. No false self-diagnosis. |
| Extension or adapter provenance ambiguous/colliding | `BLOCKED` when required; no name/path guess. |
| Adapter absent | Supervisor/Lead `BLOCKED`; Peer/ungoverned `WARN`. |
| Older version, capabilities sufficient | `PASS` unless one unprobeable semantic lacks an attested equivalent. |
| Newer version, capability missing | `BLOCKED`; version does not override the failed probe. |
| Role env invalid or activation drifted | `BLOCKED`; no normalization/fallback/passive downgrade. |
| Profile missing, invalid, or digest drifted | `BLOCKED`; no fallback from an override to bundled content. |
| Protocol missing/malformed/identity mismatch | `BLOCKED`; no best-effort parser or default permission. |
| Protocol changes during a task | Machine-visible pin mismatch: `BLOCKED / PROTOCOL_DRIFT`; claimed but unavailable pin: `BLOCKED / PROTOCOL_PIN_UNAVAILABLE`; preserve evidence and require re-evaluation. |
| Human disabled a tool | Never re-enable. Required core: `BLOCKED`; requested optional: `WARN`; forbidden tool absent: `PASS`. |
| Authority missing | `PASS / BASE_ONLY`; no exceptional capability. |
| Authority malformed/mismatched | `BLOCKED` for the requested run; grants nothing. |
| Authority stale | Effective stale grant: `BLOCKED`; provably inactive record remains evidence only. |
| Doctor would mutate config/Git/workspace/tool/session state | Contract failure; abort the action and emit no success report. Mutation checks belong to ticket 11's executable verification, not a repair feature. |
| Doctor labels PASS as acceptance | Invalid report/contract failure; PASS is observation readiness only. |
| Bash/guardrails described as sandbox | Invalid report/contract failure; limitations must state cooperative guardrail. |
| Remediation requires automatic install/edit/reload/restart/push/merge/deploy | Invalid. Only explicit manual actions may be listed; push/merge/deploy are never remediation. |

## Residual assumptions and seams

- The package can use a supported read-only Paseo observation seam that returns the exact agent-to-workspace binding. The current CLI's human-facing inspect projection may omit that field even when the typed daemon snapshot has it; cwd-only joining is insufficient. Ticket 11 may choose packaging/dependency mechanics but may not weaken this fact requirement.
- The adapter's current public status event exposes server state/counts, not an inner-tool catalog. v0.1 therefore proves the current Paseo path by combining Paseo's process-level MCP-configuration attestation, unique active adapter provenance, and exact read-only Paseo capability probes; it does not claim to enumerate every inner target through an unsupported adapter API.
- Pi can prove loaded command/tool provenance, but an unloaded extension cannot run its own doctor. Command discovery outside the package is the only honest negative observation.
- Doctor can validate profile and protocol syntax, identity, and bytes, not the truth or intent of Human-authored prose. Generic assignment prose is not a machine-readable pin source; doctor compares only a pin already exposed by existing package state and otherwise reports that evidence unavailable.
- Environment values and Paseo labels are consistency evidence, not authentication. Human routes are cooperative, not cryptographic.
- External processes can change Git, files, tools, daemon, or workspace immediately after the report. The bounded interval and final recheck expose observed drift; no lock or isolation is claimed.
- TUI and RPC provide the supported non-persistent command output path. Print/JSON mode has no such extension-command UI path in the current Pi contract, so headless output remains a distribution seam rather than an implicit transcript write.
- This ticket does not decide package resource layout, dependency bundling, install pin policy, a standalone CLI, exit codes, or executable test distribution.
