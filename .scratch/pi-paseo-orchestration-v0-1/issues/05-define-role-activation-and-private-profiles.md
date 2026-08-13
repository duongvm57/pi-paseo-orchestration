# Define role activation and private profiles

Type: grilling
Status: resolved
Blocked by: 01, 02, 03

## Question

What is the exact package-owned role environment contract, prompt-loading lifecycle, invalid-role behavior, and minimum tool surface for Supervisor, Lead, and Peer while preserving the authority model in the normative deep dive?

## Answer

The package activates one durable Role Profile from one closed environment contract, binds it to the Paseo-owned process, and narrows the current Pi session's existing tools without claiming a sandbox. The reference orchestration deep dive is normative; Minnyat remains implementation evidence only.

### Activation contract

`PI_PASEO_ORCHESTRATION_ROLE` is the only role source. Its accepted values are exactly `supervisor`, `lead`, or `peer`. Missing or empty means passive/explicitly ungoverned; whitespace, case variants, and every other non-empty value are invalid rather than normalized. Provider names, titles, labels, parentage, task prose, and model output never infer or change role.

A governed activation additionally requires a nonblank effective `PASEO_AGENT_ID` (daemon-owned in the supported Paseo launch), a valid profile source, `read`, and—only for Supervisor and Lead—the active outer `mcp` tool from the independently installed `pi-mcp-adapter`. This is a consistency prerequisite, not authentication: an outside process can spoof environment values. Missing prerequisites block ordinary prompts without invoking the model; `/ppo:doctor` remains available. Missing optional tools produce a degraded surface and are never re-enabled. A direct Pi process with no role remains fully passive, so normal Pi lifecycle commands and tool settings keep working.

Paseo configuration should define three user-renamable provider aliases; the sample names are `pi-paseo-orchestration-supervisor`, `pi-paseo-orchestration-lead`, and `pi-paseo-orchestration-peer`. Each alias persistently sets the one corresponding role env value. The alias is convenience, not identity truth. Per-create transient env is not the supported role path because Paseo does not persist it across resume.

The first successful activation in a Paseo-owned process snapshots the role, `PASEO_AGENT_ID`, profile source/path, and profile digests. `/new`, `/resume`, `/fork`, extension rebinding, and later agent runs cannot change that activation. Current env/path/content is checked against the snapshot; drift blocks until Paseo relaunches the process. Explicit Pi `/reload` does not authorize a different activation. One process therefore has one role, while every extension/session instance retains its own mutable baseline and current-run authority; different roles require different Paseo processes.

### Profile source and loading

The package ships three nonempty files at package-owned paths:

```text
profiles/supervisor.md
profiles/lead.md
profiles/peer.md
```

`PI_PASEO_ORCHESTRATION_PROFILES_DIR` may name one Human-managed absolute directory containing all three exact filenames. It is a full replacement, not a supplement. A relative path, missing/unreadable/empty file, or incomplete directory blocks activation; there is no per-file or error fallback to bundled text. The package verifies structure and digests but cannot semantically prove that Human-authored prose conforms to reference orchestration model.

The selected profile is read into the process activation snapshot and appended, with a package-owned delimiter, to the chained `event.systemPrompt` in every `before_agent_start`. It is not persisted as a transcript message. “Private” means absent from normal transcript display only: the OS user, package/other extension code, Pi process, model provider, and model can read it. Profiles must contain no secrets.

Instruction precedence is:

```text
Role Profile ceiling
  > Workspace Protocol (repository rules; may only narrow)
  > current-run Task Authority Envelope (may only narrow/grant within both ceilings)
  > ordinary task prose
```

Task prose that claims another role or includes a fake Role Profile is ordinary content. A known conflict stops the affected action and is reported/escalated; the package does not attempt semantic policy parsing.

### Session and invalid-state behavior

In a governed process, `session_before_switch` and `session_before_fork` cancel Pi-native `/new`, `/resume`, and `/fork` and direct the Human to Paseo lifecycle operations. The extension is passive and does not cancel them in ordinary native Pi. Opening a Paseo session file from a second native Pi process is not an attach operation and is unsupported while the Paseo agent owns it; `paseo attach` is the supported terminal view.

Every `session_start` clears current-run authority and captures a fresh session-local active-tool baseline. Every `before_agent_start` replaces authority from that run's one canonical envelope; missing, malformed, duplicate, misplaced, or role-mismatched authority never carries forward or raises capability. Invalid role/profile/identity/core-tool states intercept ordinary prompts while leaving doctor and configuration repair paths available. Commands owned by other extensions and later extension hooks remain outside this package's control.

### Effective tool policy

For every run and direct tool call:

```text
effective tools = session baseline ∩ role ceiling ∩ current-run authority
```

The role ceilings are closed: unlisted built-in or extension tools are inactive unless a later owning ticket explicitly adds a narrow surface. The package never re-enables a Human/CLI/settings-disabled tool. If an envelope requests an unavailable optional tool, the run continues with `authority requested but unavailable`; if a required core tool is absent, activation is blocked. `mcp_script` is absent for all roles. Outer `mcp` calls are fail-closed on unknown/malformed inner targets and arguments. Direct push, merge, commit-amend, force-push, PR, and deploy operations are outside every role surface. Recognizable command/path guards are backstops only; retained Bash can bypass them indirectly.

#### Supervisor

Role ceiling:

- Pi: `read`, `bash`; `write`/`edit` only for path-guarded governance artifacts.
- Read-only Paseo discovery: `list_providers`, `list_models`, `inspect_provider`.
- Observation: `list_agents`, `get_agent_status`, `get_agent_activity`, `list_workspaces`.
- Relay: `send_agent_prompt`, constrained by the Role Profile to evidence/owner-decision relay rather than correction-by-fiat.
- Recovery exception: `create_agent` only during one current Human recovery grant created by `/ppo:recover-lead`, with exact provider/workspace/handoff arguments checked against that grant.

Supervisor owns workflow/reasoning observation, evidence, causal notebook entries, and Human decision relay, not project implementation, architecture ownership, difficult-change acceptance, or generic code edits. The exact notebook location/lifecycle/path guard is delegated to a new notebook-contract ticket; `.orchestration/workspace-protocol.md` authoring remains a Human-confirmed governance workflow owned by ticket 07. Until those paths/workflows are specified, they grant no additional write path.

Paseo cannot prove that another provider alias sets the Lead role. A recovery grant therefore names an exact Human-attested provider alias, and the replacement's initial prompt requires doctor. Supervisor does not hand off until observed doctor evidence says the replacement is governed Lead. Successful `create_agent` alone is not role proof.

#### Lead

Base effective surface without an exceptional grant:

- Pi: `read`, `bash`.
- Paseo discovery: `list_providers`, `list_models`, `inspect_provider`.
- Workspace: `create_workspace`, `list_workspaces`; no `archive_workspace` in v0.1.
- Monitoring: `list_agents`, `get_agent_status`, `get_agent_activity`.
- Orchestration: `create_agent`, `send_agent_prompt`, `update_agent`, `cancel_agent`, `archive_agent`.
- Permission observation: `list_pending_permissions`; only the Human uses `respond_to_permission`.

Lead owns framing, topology, routing, one-writer ownership, dependency handling, stable-candidate review, integration, and the binding project verdict. It does not pre-solve delegated work. The Lead role ceiling conditionally admits `write`/`edit` and local commit, but those capabilities are absent from the base surface. A Lead may implement, optionally make a local commit, and proportionately self-accept one genuinely tiny task only when all of these hold: the Workspace Protocol permits tiny self-work, an idle Human invokes `/ppo:lead-tiny`, the editor/confirmation attests protocol compatibility, and the current-run envelope grants the exact writable scope. Edit and local-commit grants are separate and default denied. Local acceptance still requires the exact Stable Candidate defined by ticket 09; without commit authority the Lead cannot turn its edits into v0.1's commit candidate. If the task stops being tiny, Lead preserves evidence and delegates instead of expanding its grant. Push/merge/amend/deploy remain blocked.

#### Peer

The base effective surface is `read` and `bash`. The Peer role ceiling conditionally admits `write`/`edit`; a valid current-run Peer envelope may expose them for its exact writable scope and may separately grant one local commit. Peer has no direct Paseo `mcp`, browser authority, `mcp_script`, publication, orchestration, or permission-response surface. Ticket 12 may later add one narrow reporting primitive without exposing general Paseo orchestration. Peer owns one bounded outcome, preserves unrelated work, challenges bad premises with evidence, verifies its own writes, and reports `REOPEN`, `DEPENDENCY`, or `BLOCKED` rather than expanding scope. Difficult-change acceptance remains with Lead/Human.

### Human-issued current-run grants

Ticket 06 will define one strict, versioned Task Authority Envelope format with role-specific grant kinds for Peer edit/local-commit, Lead tiny-task edit/local-commit, and Supervisor Lead recovery. Only one complete canonical block at the beginning of the injected prompt is recognized; unknown fields, duplicates, malformed markers, text scans, quoted examples, and role/grant mismatches confer no authority. The exact issuer/field rules remain ticket 06's responsibility.

`/ppo:lead-tiny` and `/ppo:recover-lead` use one multiline `ctx.ui.editor()` followed by `ctx.ui.confirm()`, then inject a user message whose authority block is the first nonempty content. `lead-tiny` refuses outside an idle governed Lead; `recover-lead` refuses outside an idle governed Supervisor. They do not directly mutate role or tools, cannot grant outside the role ceiling/session baseline, refuse automatic/background approval, and leave an auditable Human message. These are slash commands, not LLM tools. No custom LLM tool is added by ticket 05.

### Doctor observations

`/ppo:doctor` is always registered, including passive and blocked states, and remains observation-only. It must expose facts for ticket 10 to classify and format:

- governed, ungoverned, or blocked activation;
- role missing/empty/invalid and `PASEO_AGENT_ID` presence;
- bundled versus override profile source, resolved paths, digests, and missing/unreadable/empty files;
- activation env/path/content drift;
- required and optional tool availability/effective removal;
- `pi-mcp-adapter` command provenance and duplicate/colliding package commands;
- known non-sandbox, prompt-chain, tool-ordering, and second-process limitations.

Loaded adapter provenance does not prove Paseo MCP connectivity/authentication; ticket 10 decides which runtime capability probes and PASS/WARN/BLOCKED severities are required.

### Explicit enforcement limits

This is still a cooperative Policy Guardrail. The extension cannot prove Human authorship cryptographically, decide whether work is truly tiny, semantically validate custom profiles or Workspace Protocol prose, isolate Bash/filesystem/network/process/Git behavior, guarantee that later extensions do not alter the final prompt/tool arguments, or make `send_agent_prompt` acknowledged/non-disruptive. OS/container/worktree permissions remain the real isolation boundary.

This answer corrects ticket 04's overly strict sentence that Lead never writes: the reference model permits tightly coupled tiny Lead self-work when protocol and Human authority permit it. Ticket 04's intersection, per-run reset, and non-sandbox conclusions remain unchanged. Ticket 06 must be widened from Peer-only authority to all three role-specific current-run grants. A separate ticket must define the Supervisor notebook contract; no tmux/Herdr follow-up is recorded.
