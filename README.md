# Pi Paseo Orchestration

Governed multi-agent work for [Pi](https://github.com/earendil-works/pi) running through Paseo.

The package gives each process one explicit role—**Supervisor**, **Lead**, or **Peer**—and keeps Paseo as the source of truth for agents, workspaces, parentage, and lifecycle. It adds policy guardrails, repository workflow rules, direct bounded assignments for ordinary local work, evidence-bearing handoffs, and local Git candidate acceptance. There is no coordinator: the Human creates the root Lead, and creates a root Supervisor only when the task class warrants one.

## Why subagents are not enough

A subagent API solves **process creation**. It does not solve ownership, independent judgment, coordination, or acceptance. In practice, multi-agent coding commonly fails in these ways:

- **Authority gradient:** when a parent already presents the answer, the child tends to agree and optimize that answer instead of checking whether its premise is wrong.
- **Perfect-plan trap:** the coordinator pre-selects files, APIs, and lifecycle before implementation. The worker becomes a typing bot, while real dependencies surface late as compatibility patches.
- **Attention dilution:** when the coordinator also implements, debugs, and repeatedly explains local details, it loses the project-wide view of ownership, dependencies, and agent lifecycle.
- **Unsafe parallelism:** two agents can share one checkout and overwrite the same moving files. A workspace or agent ID does not provide filesystem isolation.
- **Biased or stale review:** a reviewer forked from the author inherits the same framing, while a reviewer reading changing files may approve a candidate that no longer exists.
- **False completion:** `finished`, `idle`, "done," and passing tests are signals—not proof that the right artifact was reviewed by the right authority.
- **Split control planes:** if workers create their own untracked workers, no single system knows who owns the task, workspace, correction, or cleanup.

More agents can therefore increase confidence and activity without increasing correctness.

## Why Supervisor–Lead–Peer

This package applies the Deep Dive's **Supervisor–Lead–Peer (SLP)** model by separating kinds of judgment instead of building a rigid `Supervisor > Lead > Peer` hierarchy:

```
                         Human
                           │
              ┌────────────┴────────────┐
              │                         │
        Supervisor                    Lead
   process observation          project coordination
              │                         │
              └──── observes ───────────┤
                                        │
                                    Peer(s)
                         Engineer / Architect /
                           Reviewer / Scout
```

- **Human** retains owner authority: product intent, important trade-offs, exceptional grants, protocol changes, and final acceptance.
- **Supervisor** protects the quality of the workflow and reasoning process. It watches for bias, repeated failure, lost momentum, moving scope, and weak evidence; it does not normally implement or accept the project.
- **Lead** owns project framing, routing, dependencies, integration, and the project verdict. It does not pre-solve difficult work and then ask Peers to type its preferred answer.
- **Peer** is an independent co-worker that owns one bounded outcome. It may challenge the premise, request a dependency, or stop as blocked; disagreement is reconciled with evidence rather than treated as disobedience.

This separation preserves independent judgment: the author proves its work, an independent Reviewer falsifies the exact candidate when required, the Lead judges project readiness, and the Human accepts owner-only trade-offs.

## One supported startup flow

The Human creates the team directly; there is no coordinator and no `/ppo:bootstrap`.

1. **Create the Lead.** From a Human shell without `PASEO_AGENT_ID`, or through the Paseo UI, create a `ppo-lead` agent in the intended repository/workspace and supply the Human task as its initial prompt. The Lead is a root agent.
2. **Create the Supervisor when needed.** After obtaining the exact Lead agent ID, create a `ppo-supervisor` root agent only when the Human assigns one or the task class warrants it. Tiny/bounded tasks may skip this step and run Lead-only. Supply an assignment binding the exact Lead agent ID, the exact Human task/task ID, the exact repository root, and the expected workspace binding.
3. **Bind Supervisor and Lead.** When a Supervisor exists, the Human announces the exact Supervisor agent ID to the Lead. The first Lead milestone to that Supervisor is the canonical binder: the runtime verifies role, root parentage, repository/workspace applicability, and task binding before accepting it. The Supervisor may ask that bound Lead or relay a Human decision to it.
4. **The Lead creates Peer children** through `paseo_create_agent`. Every Peer has `ParentAgentId` equal to the Lead and receives one bounded assignment.

The Lead delegates bounded assignments to Peer children and returns the final candidate to the Human for local acceptance. Lead and Supervisor must both be root agents (`ParentAgentId = null`); a parented Lead or Supervisor fails closed before governed work, and a root or wrong-parent Peer is `BLOCKED`. Root launch does not automatically subscribe another Pi harness to completion: when a harness must receive the result, it sends one bounded prompt after launch containing its exact root Pi observer agent ID and callback contract. The Lead sends only the terminal `LEAD_FINISHED` event to that observer; milestones go to the verified root Supervisor. Both routes use a closed event envelope through `paseo_send_agent_prompt`; CLI `paseo send` is not a fallback. An interactive Human may instead observe the root agents in Paseo.

## How it works

1. Each process receives one durable Role Profile. The Lead also reads the repository's Workspace Protocol; each Peer receives only its bounded assignment. Keeping these layers separate avoids spending Peer attention on the whole organization manual.
2. The initial root Lead task and each exact Peer assignment authorize ordinary local reversible inspect, test, and worktree work. Lead write/edit/commit requires Workspace Protocol opt-in; Peer write/edit/commit requires an Engineer `write_mode` binding. The Human types only `implement <spec-path>` (or equivalent) once; no marker, JSON envelope, hash, agent ID, assignment ID, scope syntax, capability list, digest, or grant is ever written. Assignment, ownership, scope, and exclusions are workflow facts, not capability credentials.
3. The Lead describes the outcome, constraints, known evidence, writable scope, exclusions, and verification—not a supposedly final implementation plan. One moving write scope has one owner; concurrent writers need disjoint scopes and isolated checkouts. The Lead prepares required isolated worktrees itself.
4. A dirty caller checkout is evidence to classify, not an automatic blocker: untracked/read-only issue notes, specifications, research, generated logs, or unrelated documentation do not block an isolated worktree from a known clean commit. Only a real collision, overwrite risk, competing writer, or ambiguous base blocks work.
5. A Peer ends its run with a correlated report: `HANDOFF`, `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, or `BLOCKED`. The Lead reacts to that event instead of polling and consuming coordination attention.
6. Write work produces one exact local Git **Stable Candidate**. Required review and verification bind to that commit, the Lead issues a candidate-bound verdict, and only a direct Human action crosses the Local Acceptance Boundary.
7. Communication is event-driven and bounded. The Lead sends milestone events to its verified Supervisor; the Supervisor performs one bounded observation pass per event, or on a low-frequency heartbeat used only as a safety net, and returns to idle. No daemon or continuous polling loop is introduced.
8. Paseo remains the only lifecycle, workspace, parentage, follow-up, and timeline control plane. This package adds policy and evidence contracts, not another scheduler or agent database.

Use this package when those boundaries matter. For a small single-agent task, ordinary Pi is simpler.

## Prerequisites

- Pi
- Paseo and its CLI
- `pi-mcp-adapter`, installed separately and configured to expose the Paseo MCP server to Pi
- A Git repository for governed work

This package does not bundle Paseo or `pi-mcp-adapter`.

## Install

Choose either npm or Git.

### npm

```
pi install npm:pi-paseo-orchestration
```

Pin a specific release when reproducibility matters:

```
pi install npm:pi-paseo-orchestration@0.2.0
```

### Git

A commit SHA is optional. Install the current repository version with:

```
pi install git:github.com/duongvm57/pi-paseo-orchestration
```

You may pin a tag or full commit SHA when you need an immutable version:

```
pi install git:github.com/duongvm57/pi-paseo-orchestration@<tag-or-full-sha>
```

After changing package version or source, restart Pi/Paseo. Wait until `paseo status` reports the daemon reachable, then reconnect the injected Paseo MCP server once; if it is still unavailable, fail fast with that exact evidence rather than polling or silently falling back to CLI. `pi-mcp-adapter` remains a separate installation; this package does not add or update it.

## Set up

### 1. Choose models and install Paseo providers

Open an ordinary, ungoverned Pi session and run:

```
/ppo:settings
```

Choose the Supervisor and Lead models, then configure the built-in Peer routes:

- `fast`
- `general`
- `reasoning`
- `coding`
- `architecture`
- `reviewer`

Custom Peer routes are also supported. Use a capable model for Lead orchestration; cheaper models are appropriate for bounded Peer work when they can follow the assignment contract. Run `/ppo:settings` again and choose **Paseo profiles** to install or update these providers without changing unrelated Paseo configuration:

- `ppo-supervisor`
- `ppo-lead`
- `ppo-peer`

Restart Paseo after updating the providers.

### 2. Create the repository protocol

Every governed repository needs:

```
.orchestration/workspace-protocol.md
```

This file contains decisions that cannot safely be global: how this repository classifies work, assigns writers, isolates concurrent changes, requires review, verifies candidates, and escalates decisions to the Human. The Lead refuses governed work when the protocol is missing or invalid.

From an ordinary Pi session opened at the repository root, send this exact prompt:

```
Use the workspace-protocol skill to create .orchestration/workspace-protocol.md for this repository. Interview me before writing and show me the exact proposed diff for confirmation.
```

`workspace-protocol` is a packaged Pi skill, not a slash command. Pi loads the skill, interviews you about the repository's rules, and writes only the confirmed protocol.

### 3. Check readiness

From the repository:

```
/ppo:doctor
```

Doctor is observation-only. It reports the current Pi, Git, role, settings, protocol, Paseo connection, identity, topology, and binding state without repairing or mutating them.

### 4. Start work

Follow the one supported startup flow above: the Human creates the root Lead with the task, and a root Supervisor only when warranted; the Lead creates Peer children and returns the final candidate to the Human for local acceptance.

### Supervisor Notebook

The Supervisor Notebook is an optional, project-scoped history of **why** the Supervisor made an observation or recommendation. It is useful for preserving causal evidence across runs—for example, a blocked dependency, a recurring failure, or a question that needs Human attention.

It is **not** a task queue, chat channel, source of authority, current status, or automatic decision-maker. Notebook entries never grant permissions or change the project. The Notebook lives under Pi's config directory, not in the repository.

Initialize it explicitly from an ordinary Human session (or an active Supervisor) connected to a Paseo workspace when you want this history:

```
/ppo:notebook-init
```

After initialization, an activated Supervisor can append entries through the narrow `supervisor_notebook_append` tool. Most users can ignore this feature until they need durable governance evidence across runs.

## Commands

| Command | Purpose |
| --- | --- |
| `/ppo:settings` | Configure role models, Peer routes, and Paseo providers. |
| `/ppo:doctor` | Report readiness for the current context without mutation. |
| `/ppo:notebook-init` | Initialize the Supervisor Notebook for the current project. |

The extension also exposes `supervisor_notebook_append` only to an activated Supervisor.

## Operating model

```
Role Profile
  > Workspace Protocol
  > ordinary task prose
```

A lower layer cannot widen a higher layer. Ordinary inspect/test/worktree work is authorized by the initial Human task and the exact assignment; Lead write/edit/commit requires protocol opt-in and Peer write requires Engineer write_mode. The Human controls settings, protocol changes, and final local acceptance; the Supervisor is observation-only and never edits project code. Human-only boundaries—push, merge, publish, deploy, protocol mutation, destructive/external effects, secrets/material cost, objective/irreversible decisions, and Local Acceptance—are preserved.

Write work ends at an immutable local Git candidate. The package does not push, create pull requests, merge, deploy, or treat tests, lifecycle status, or agent prose as acceptance.

## Security boundary

The extension narrows Pi's active tools and rejects recognizable disallowed calls. This is a cooperative in-process **policy guardrail**, not a sandbox or an authentication/authorization boundary. It does not isolate the filesystem, processes, network, Git, shell aliases, child programs, or other extensions.

Missing, malformed, mismatched, or drifted governed state fails closed. Ordinary Pi sessions without `PI_PASEO_ORCHESTRATION_ROLE` remain ungoverned. Governed Lead/Supervisor/Peer missing mandatory live Paseo evidence returns `BLOCKED`.

## Development

```
npm install
npm test
npm run typecheck
npm run release:smoke
npm pack --dry-run
git diff --check
```

`npm run release:smoke` intentionally exits non-zero when live Paseo identity/workspace facts or exact-version Pi install evidence are unavailable.

## Published package

The npm tarball is intentionally limited to:

```
package.json
README.md
extensions/pi-paseo-orchestration.ts
profiles/{supervisor,lead,peer}.md
skills/ppo-orchestrate/SKILL.md
skills/workspace-protocol/{SKILL.md,AUTHORING-GUIDE.md}
```

Tests, specifications, reference documents, scratch state, and development dependencies are excluded. The manifest exposes one extension and two skills. Role Profiles are private package data and are not independently discoverable Pi prompts or skills.
