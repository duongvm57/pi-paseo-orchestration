# Paseo orchestration topology: independent agents vs parent/child

Type: research
Status: resolved
Date: 2025-08-13 (Paseo v0.3.1)
Sources: installed `@getpaseo/cli` 0.3.1 (+ bundled server/client/protocol), upstream `github.com/getpaseo/paseo` tag `v0.3.1`, official docs at `paseo.sh`.

## TL;DR

- Paseo parentage is **optional and opt-in**. An agent is a "subagent" only when its
  record carries the `paseo.parent-agent-id` label; the label is stamped **only** when the
  creation request supplies an optional `callerAgentId`. No creation request field named
  `parentAgentId` exists — parentage is derived server-side from the caller, never requested.
- **A Human creating agents by hand (CLI from a shell, the app UI, or a top-level MCP
  caller) always produces independent, sibling root agents** with no parent and no
  relationship to each other. This is the platform default for human creation, not a hack.
- **Agent-spawned children** are the second, documented topology: an agent that calls
  `create_agent` (or `paseo run` with `$PASEO_AGENT_ID` set) creates a subagent that
  appears in its parent's Subagents track and is cascade-archived with the parent.
- Paseo documents **no canonical prescription that a coordinator must create a Lead and a
  Supervisor**. Both topologies are first-class; the docs' mental model is
  "workspaces decide where work happens; agent parentage decides who owns the work"
  (paseo.sh/docs/mcp). Detaching a child into a top-level agent is deliberately a
  **manual Human gesture** (`paseo agent detach`), never an agent-facing MCP tool.
- Recommendation: the smallest topology compatible with independent oversight is **two
  top-level agents created directly by the Human** (`paseo run` from a human shell, or the
  UI): one `ppo-lead`, one `ppo-supervisor`, same or separate workspaces, no coordinator.
  Peers remain children of the Lead (native Paseo subagent semantics).

## 1. What parent/child means in Paseo

Parentage is a **label on the child's agent record**, not a separate entity or a field in
creation requests:

- `PARENT_AGENT_ID_LABEL = "paseo.parent-agent-id"` — `packages/protocol/src/agent-labels.ts:1`
  (upstream `v0.3.1`; identical compiled copy at
  `.../node_modules/@getpaseo/cli/node_modules/@getpaseo/protocol/dist/agent-labels.js:1-13`).
- `isDelegatedAgent(agent)` returns true iff that label is present — `agent-labels.ts:14-16`.
  This is the platform's first-class distinction: **delegated (child) vs root (independent)**.
- The agent record table documents the label: "`paseo.parent-agent-id` is set automatically
  for agent-scoped creation and removed by detach" — `docs/data-model.md:92` (upstream).
- `paseo agent inspect <id>` surfaces it as `ParentAgentId:` — installed
  `cli/dist/commands/agent/inspect.js:106` (`.../@getpaseo/cli/node_modules/...` path above).

Consequences of being a child (all in upstream `docs/agent-lifecycle.md`):

- Appears in the parent's **Subagents track**; membership rule
  `parentAgentId === thisAgent.id AND !archivedAt` — `agent-lifecycle.md:125-128`,
  implemented in `packages/app/src/subagents/select.ts:79-81`.
- **Cascade-archived with the parent** (recursively) — `agent-lifecycle.md:74-76`
  ("Cascade is what keeps subagent fleets from outliving their orchestrator"),
  implementation `packages/server/src/server/agent/agent-manager.ts:1524-1545`
  (`cascadeArchiveChildren`, iterates records whose label matches the parent).
- Attention/notification broadcasts are suppressed for delegated agents —
  `agent-manager.ts:4271` (`broadcastAgentAttention` returns early for `isDelegatedAgent`).
- Placement in another workspace does **not** change parentage — `agent-lifecycle.md:42`
  ("Placement never changes parentage"); docs orchestration page: "Passing a workspace ID
  changes where the subagent works, not who its parent is" — `public-docs/orchestration.md:49`.

## 2. `parentAgentId` is absent from creation requests; `callerAgentId` is optional

`CreateAgentRequestMessageSchema` (the wire message for UI, app, and MCP creation) contains:

```
workspaceId:   z.ZodOptional<z.ZodString>
callerAgentId: z.ZodOptional<z.ZodString>   // ← the only parentage input, OPTIONAL
```
— `packages/protocol/src/messages.ts:1322` (schema) and `:1329` (`callerAgentId` optional);
installed copy `.../@getpaseo/protocol/dist/messages.d.ts:1277` (schema start) with
`callerAgentId: z.ZodOptional<z.ZodString>` at `messages.d.ts:1316`.

There is **no `parentAgentId` field anywhere in creation requests**. The only
`parentAgentId` fields in the protocol belong to *provider-native subagent* descriptors
(e.g. Claude Code task subagents), a different concept — `messages.ts:3751, 3773, 3783`.

Server-side derivation (both request paths converge on one function):

```
const parentAgentId = input.legacyDetached ? null : (input.caller?.id ?? null);
... (parentAgentId ? { [PARENT_AGENT_ID_LABEL]: parentAgentId } : {})
```
— `packages/server/src/server/agent/create-agent/intent.ts:30-37` (installed
`create-agent/intent.js:3-9`). Placement precedence: explicit workspace → caller's
workspace → mint a new workspace (`intent.ts:57-66`).

- **UI/session path** (`create_agent_request` over the daemon WebSocket): caller resolved
  only if `callerAgentId` present; otherwise `callerAgent = null` — 
  `packages/server/src/server/session.ts:3286-3299`. The bundled web client forwards
  `callerAgentId` only if the caller supplied it (it never sets it itself) — installed
  `server/dist/server/web-ui/_expo/static/js/web/index-*.js` (`createAgent(e){...}` client
  method and the zod schema are the only two occurrences).
- **MCP path** (`create_agent` tool): `parentAgent = input.callerAgentId ? requireParentAgent(...) : null` — `packages/server/src/server/agent/create-agent/create.ts:308-309`. The tool description states the two modes — `packages/server/src/server/agent/tools/paseo-tools.ts:1401`:
  "Create an agent. **Agent-scoped creation defaults to your workspace and creates your
  subagent. Top-level creation without workspaceId creates a new local workspace.**"
  Agent-scoped creation is always asynchronous, always stamps `paseo.parent-agent-id`,
  and defaults `notifyOnFinish` (finish notification requires parent ownership) —
  `agent-lifecycle.md:42`, `create.ts:205-212`, `agent-prompt.ts:268-274`.
- **Session-path MCP/UI parity**: `resolveSessionCreateAgent` passes `parent: null` to
  config resolution (`create.ts:259`) — the session path has no parent context at all.

## 3. CLI: `paseo run` — parentage is decided by `$PASEO_AGENT_ID`, not by the command

`paseo run <prompt>` is the manual creation command (it creates the agent and starts it).
It resolves the caller from the environment:

```
export function resolveRunCallerAgentId(
  env: { PASEO_AGENT_ID?: string } = process.env,
): string | undefined {
  return env.PASEO_AGENT_ID?.trim() || undefined;
}
```
— `packages/cli/src/commands/agent/run.ts:754-757` (installed
`cli/dist/commands/agent/run.js:549-550`); used at `run.ts:622` (`callerAgentId` passed to
`client.createAgent`). Workspace policy precedence comment — `run.ts:535-556`
(installed `run.js:379`).

- **From a human shell**: no `PASEO_AGENT_ID` → `callerAgentId` undefined → **root agent**.
  "From a human shell, a bare `paseo run` creates a new local workspace for the current
  directory" — `public-docs/cli.md:40`; use `--workspace <id>` to join an existing
  workspace, or `--new-workspace local|worktree` to isolate (`public-docs/cli.md:40-41`).
- **From inside an agent**: "When an existing Paseo agent runs the same command, Paseo
  recognizes it through `PASEO_AGENT_ID`. Without explicit placement, the new agent
  becomes its subagent in the same workspace. `--workspace` can place that subagent
  elsewhere without changing its parent." — `public-docs/cli.md:44`.
- `paseo agent run` is the same handler as `paseo run` (installed
  `cli/dist/cli.js:58` and `cli/dist/commands/agent/index.js:24` both call
  `runRunCommand`).

**Sibling independent agents are therefore the plain default for Human CLI usage**: two
`paseo run` invocations from the same human shell produce two root agents with no parent
and no relationship to each other. The docs' multi-agent CLI example is the *agent-spawned*
variant (Agent A spawns Agent B because A's id is in the environment) —
`public-docs/cli.md:250-257`.

## 4. Detach: the sanctioned child → top-level transition

"Make a subagent top-level" — `paseo agent detach <id>` — `public-docs/cli.md:180-183`:
"Detaching is an explicit lifecycle action, not a creation flag. The agent keeps running;
only its relationship to its parent changes."

- Implementation: `detachAgent` removes the `paseo.parent-agent-id` label only —
  `agent-manager.ts:1753-1793`; CLI command `packages/cli/src/commands/agent/detach.ts:53-54`
  (installed `cli/dist/commands/agent/detach.js:31`).
- "Detach is deliberately a manual lifecycle gesture, not an agent-facing MCP tool" —
  `agent-lifecycle.md:49`; "MCP does not expose an agent-detach tool. Detaching is a
  manual user action in the app or CLI." — `public-docs/mcp.md:28`.
- The app UI also offers Detach in the Subagents track (installed web bundle,
  `Detach` strings in `web-ui/_expo/static/js/web/index-*.js`).

Corollary for our repo: a Supervisor spawned by a coordinator is *owned* by that
coordinator (track membership + cascade archive). If it were spawned by the Lead, it would
be owned by the Lead — directly incompatible with independent oversight. The platform's
own answer to "how do I get an independent agent" is: create it top-level, or detach it.

## 5. Canonical vs merely supported

- **Both topologies are first-class and documented**; there is no single canonical
  prescription of *who* may create agents. The orchestration docs present agent→subagent
  delegation as the flagship multi-agent pattern (`public-docs/orchestration.md:11-49`),
  and the CLI/UI docs present Human shell/UI creation as the everyday path
  (`public-docs/cli.md:40-44`).
- The docs' mental model is explicit and is the closest thing to a canonical rule:
  "**Workspaces decide where work happens; agent parentage decides who owns the work.**"
  — `public-docs/mcp.md:21`. By that rule, a Human-owned Supervisor and a Human-owned
  Lead are independent by construction; nothing in the platform links two root agents.
- Nothing in Paseo prescribes a **coordinator** concept. No docs page, protocol message,
  or CLI command models a coordinator that owns other agents' relationships; the only
  ownership relation is the `paseo.parent-agent-id` label. Our repo's `/ppo:bootstrap`
  coordinator is a repo-invented layer, not a Paseo convention (see §7).
- Docs explicitly say subagent→top-level is a Human-gated transition ("If you want to
  turn any subagent into a top-level agent, detach it manually in the app or with
  `paseo agent detach`; detachment is not an agent-creation mode" —
  `public-docs/orchestration.md:60`).

## 6. Manual Human creation path (Lead + Supervisor, no coordinator)

Prerequisites: daemon running (`paseo daemon start`), `ppo-lead` / `ppo-supervisor`
providers installed (repo `README.md:119-125`; providers are local daemon configuration —
custom providers are a Paseo-supported extension point, not a Paseo core concept).

From a **human shell** (no `PASEO_AGENT_ID` in the environment — verify with
`env | grep PASEO_AGENT_ID` if unsure):

```bash
# Lead — independent root agent in the current repo workspace
paseo run --provider ppo-lead/<model> --title "PPO Lead" "..."

# Supervisor — independent root agent (sibling; may share or use another workspace)
paseo run --provider ppo-supervisor/<model> --title "PPO Supervisor" "..."

# optional: same workspace as the repo (recommended for Lead+Peers)
paseo run --provider ppo-lead/<model> --workspace <workspace-id> "..."
# or isolate a new worktree workspace:
paseo run --provider ppo-supervisor/<model> --new-workspace worktree ...
```

Each invocation returns an `agentId` (use `--background` to return immediately, or run
foreground and let it complete; `--wait-timeout`, `--output-schema` also available —
installed `cli/dist/commands/agent/run.js:14-58`).

Verify independence after creation:

```bash
paseo agent inspect <agentId>   # shows "ParentAgentId: null" (installed inspect.js:106)
paseo ls -a -g --json           # both agents listed; no linkage
```

Alternative manual paths with identical semantics (root agents):

- **App UI**: create an agent normally; the UI create flow sends no `callerAgentId`
  (§2), so every UI-created agent is top-level.
- **Top-level MCP caller** (a client session that is not itself a Paseo agent):
  `create_agent` without `workspaceId` → new local workspace, root agent —
  `paseo-tools.ts:1401`, `public-docs/mcp.md:25`.

Peers: the Lead creates them with `paseo_create_agent` (agent-scoped, so they are the
Lead's subagents — native semantics, and exactly what the repo's role policy already
requires; `skills/ppo-orchestrate/SKILL.md:50`).

## 7. Separation from repo-invented protocol

- The `/ppo:bootstrap` coordinator calling `paseo_create_agent` for Lead and Supervisor is
  a **repo design choice**: "Omit workspace and labels so Paseo preserves inherited
  workspace and parentage" — `skills/ppo-orchestrate/SKILL.md:50` (the coordinator's
  session makes the creates agent-scoped, so Lead/Supervisor become its children).
- The repo's role-policy layer is local invention layered **on top of** platform
  primitives: it gates `paseo_create_agent` arguments and binds a
  `parent_lead_agent_id` string *inside the prompt* (a prompt-level convention, invisible
  to Paseo) — `extensions/pi-paseo-orchestration.ts:427-518`. Paseo's real parentage
  comes automatically from `callerAgentId` and is stamped as a label (§1-2).
- Therefore: Human → Lead, Human → Supervisor via `paseo run` is **pure platform
  behavior** (no coordinator, no custom code), while the current bootstrap path is
  platform-valid but coordinator-shaped.

## 8. Recommendation

Smallest topology compatible with independent oversight: **two top-level agents created
by the Human** — one `ppo-lead`, one `ppo-supervisor` — via `paseo run` from a human
shell (or the UI), no coordinator, with the Lead spawning Peers as its native subagents.

- Independence is the platform default for Human creation (§2-3); nothing extra must be
  built. The Supervisor is not in the Lead's Subagents track and is not cascade-archived
  with it (§1).
- This removes the repo's one piece of invented topology (the bootstrap coordinator)
  while keeping every Paseo primitive the role protocol already relies on.

## Evidence index

| Claim | Source |
|---|---|
| Parentage = `paseo.parent-agent-id` label | github.com/getpaseo/paseo@v0.3.1 `packages/protocol/src/agent-labels.ts:1-16`; `docs/data-model.md:92` |
| `callerAgentId` optional, no `parentAgentId` in creation | `packages/protocol/src/messages.ts:1322,1329`; installed `.../@getpaseo/protocol/dist/messages.d.ts:1277,1316` |
| parentAgentId derived from caller or null | `packages/server/src/server/agent/create-agent/intent.ts:30-37` |
| UI/session path caller optional | `packages/server/src/server/session.ts:3286-3299` |
| MCP create_agent two modes | `packages/server/src/server/agent/tools/paseo-tools.ts:1401`; `create-agent/create.ts:308-309` |
| `paseo run` reads `$PASEO_AGENT_ID` | `packages/cli/src/commands/agent/run.ts:622,754-757`; `public-docs/cli.md:40-44` |
| Detach = manual, label-removal only | `packages/server/src/server/agent/agent-manager.ts:1753-1793`; `public-docs/cli.md:180-183`; `public-docs/mcp.md:28` |
| Child consequences (track, cascade archive) | `docs/agent-lifecycle.md:42-49,74-76,125-128`; `agent-manager.ts:1524-1545,4271` |
| "Workspaces decide where work happens; parentage decides who owns the work" | paseo.sh/docs/mcp (mental model) |
| Human shell run → new local workspace, root agent | paseo.sh/docs/cli §Running agents; `run.ts:535-556` |
| Orchestration (agent→subagent) doc | paseo.sh/docs/orchestration; `public-docs/orchestration.md:11-60` |
| Repo: bootstrap coordinator + prompt-level binding | `skills/ppo-orchestrate/SKILL.md:50`; `extensions/pi-paseo-orchestration.ts:427-518` |

Version note: installed CLI is `@getpaseo/cli@0.3.1`; upstream `v0.3.1` tag matches.
`paseo.sh` docs track the latest release and may be slightly ahead; every local-source
claim above was verified against the installed 0.3.1 package and/or the `v0.3.1` tag.
