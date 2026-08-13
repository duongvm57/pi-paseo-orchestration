# Pi Paseo Orchestration

Governed multi-agent work for [Pi](https://github.com/earendil-works/pi) running through Paseo.

The package gives each process one explicit role—**Supervisor**, **Lead**, or **Peer**—and keeps Paseo as the source of truth for agents, workspaces, parentage, and lifecycle. It adds policy guardrails, repository workflow rules, bounded per-run grants, evidence-bearing handoffs, and local Git candidate acceptance.

## Why subagents are not enough

A subagent API solves **process creation**. It does not solve ownership, independent judgment, coordination, or acceptance. In practice, multi-agent coding commonly fails in these ways:

- **Authority gradient:** when a parent already presents the answer, the child tends to agree and optimize that answer instead of checking whether its premise is wrong.
- **Perfect-plan trap:** the coordinator pre-selects files, APIs, and lifecycle before implementation. The worker becomes a typing bot, while real dependencies surface late as compatibility patches.
- **Attention dilution:** when the coordinator also implements, debugs, and repeatedly explains local details, it loses the project-wide view of ownership, dependencies, and agent lifecycle.
- **Unsafe parallelism:** two agents can share one checkout and overwrite the same moving files. A workspace or agent ID does not provide filesystem isolation.
- **Biased or stale review:** a reviewer forked from the author inherits the same framing, while a reviewer reading changing files may approve a candidate that no longer exists.
- **False completion:** `finished`, `idle`, “done,” and passing tests are signals—not proof that the right artifact was reviewed by the right authority.
- **Split control planes:** if workers create their own untracked workers, no single system knows who owns the task, workspace, correction, or cleanup.

More agents can therefore increase confidence and activity without increasing correctness.

## Why Supervisor–Lead–Peer

This package applies the Deep Dive's **Supervisor–Lead–Peer (SLP)** model by separating kinds of judgment instead of building a rigid `Supervisor > Lead > Peer` hierarchy:

```text
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

## How it works

1. `/ppo:bootstrap <task>` creates independent Supervisor and Lead processes in the same Paseo workspace. They are siblings with different authority, not a Supervisor-owned execution chain.
2. Each process receives one durable Role Profile. The Lead also reads the repository's Workspace Protocol; each Peer receives only its bounded assignment. Keeping these layers separate avoids spending Peer attention on the whole organization manual.
3. The Lead describes the outcome, constraints, known evidence, writable scope, exclusions, and verification—not a supposedly final implementation plan. One moving write scope has one owner; concurrent writers need disjoint scopes and isolated checkouts.
4. Edit and local-commit capability come from a strict **current-run Task Authority Envelope**. Task prose alone cannot grant tools, and the grant is replaced on the next run.
5. A Peer ends its run with a correlated report: `HANDOFF`, `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, or `BLOCKED`. The Lead reacts to that event instead of polling and consuming coordination attention.
6. Write work produces one exact local Git **Stable Candidate**. Required review and verification bind to that commit, the Lead issues a candidate-bound verdict, and only a direct Human action crosses the Local Acceptance Boundary.
7. Paseo remains the only lifecycle, workspace, parentage, follow-up, and timeline control plane. This package adds policy and evidence contracts, not another scheduler or agent database.

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

```sh
pi install npm:pi-paseo-orchestration
```

Pin a specific release when reproducibility matters:

```sh
pi install npm:pi-paseo-orchestration@0.1.0
```

### Git

A commit SHA is optional. Install the current repository version with:

```sh
pi install git:github.com/duongvm57/pi-paseo-orchestration
```

You may pin a tag or full commit SHA when you need an immutable version:

```sh
pi install git:github.com/duongvm57/pi-paseo-orchestration@<tag-or-full-commit-sha>
```

After changing package version or source, restart Pi/Paseo. `pi-mcp-adapter` remains a separate installation; this package does not add or update it.

## Set up

### 1. Choose models and install Paseo providers

Open an ordinary, ungoverned Pi session and run:

```text
/ppo:settings
```

Choose the Supervisor and Lead models, then configure the built-in Peer routes:

- `fast`
- `general`
- `reasoning`
- `coding`
- `architecture`
- `reviewer`

Custom Peer routes are also supported. Run `/ppo:settings` again and choose **Paseo profiles** to install or update these providers without changing unrelated Paseo configuration:

- `ppo-supervisor`
- `ppo-lead`
- `ppo-peer`

Restart Paseo after updating the providers.

### 2. Create the repository protocol

Every governed repository needs:

```text
.orchestration/workspace-protocol.md
```

This file contains decisions that cannot safely be global: how this repository classifies work, assigns writers, isolates concurrent changes, requires review, verifies candidates, and escalates decisions to the Human. The Lead refuses governed work when the protocol is missing or invalid.

From an ordinary Pi session opened at the repository root, send this exact prompt:

```text
Use the workspace-protocol skill to create .orchestration/workspace-protocol.md for this repository. Interview me before writing and show me the exact proposed diff for confirmation.
```

`workspace-protocol` is a packaged Pi skill, not a slash command. Pi loads the skill, interviews you about the repository's rules, and writes only the confirmed protocol.

### 3. Check readiness

From the repository:

```text
/ppo:doctor
```

Doctor is observation-only. It reports the current Pi, Git, role, settings, protocol, and Paseo state without repairing or mutating them.

### 4. Start work

From an idle, ungoverned Pi session in the repository:

```text
/ppo:bootstrap <task>
```

Bootstrap validates settings and the Workspace Protocol, then creates sibling Supervisor and Lead agents in the current Paseo workspace. The Lead delegates bounded assignments to Peer children and returns the final candidate to the Human for local acceptance.

### Supervisor Notebook

The Supervisor Notebook is an optional, project-scoped history of **why** the Supervisor made an observation or recommendation. It is useful for preserving causal evidence across runs—for example, a blocked dependency, a recurring failure, or a question that needs Human attention.

It is **not** a task queue, chat channel, source of authority, current status, or automatic decision-maker. Notebook entries never grant permissions or change the project. The Notebook lives under Pi's config directory, not in the repository.

Initialize it explicitly when you want this history:

```text
/ppo:notebook-init
```

After initialization, an activated Supervisor can append entries through the narrow `supervisor_notebook_append` tool. Most users can ignore this feature until they need durable governance evidence across runs.

## Commands

| Command | Purpose |
| --- | --- |
| `/ppo:bootstrap <task>` | Start a governed Supervisor/Lead team for one task. |
| `/ppo:settings` | Configure role models, Peer routes, and Paseo providers. |
| `/ppo:doctor` | Report readiness for the current context without mutation. |
| `/ppo:lead-tiny` | Store a Human-confirmed one-run tiny Lead edit/commit grant. |
| `/ppo:supervisor-recovery` | Store a Human-confirmed bounded Lead recovery grant. |
| `/ppo:notebook-init` | Initialize the Supervisor Notebook for the current project. |

The extension also exposes `supervisor_notebook_append` only to an activated Supervisor.

## Operating model

```text
Role Profile
  > Workspace Protocol
  > current-run Task Authority Envelope
  > task prose
```

A lower layer cannot widen a higher layer. The Human controls settings, exceptional grants, protocol changes, and final local acceptance; the SLP roles follow the responsibilities above.

Write work ends at an immutable local Git candidate. The package does not push, create pull requests, merge, deploy, or treat tests, lifecycle status, or agent prose as acceptance.

## Security boundary

The extension narrows Pi's active tools and rejects recognizable disallowed calls. This is a cooperative in-process **policy guardrail**, not a sandbox or an authentication/authorization boundary. It does not isolate the filesystem, processes, network, Git, shell aliases, child programs, or other extensions.

Missing, malformed, mismatched, or drifted governed state fails closed. Ordinary Pi sessions without `PI_PASEO_ORCHESTRATION_ROLE` remain ungoverned.

## Development

```sh
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

```text
package.json
README.md
extensions/pi-paseo-orchestration.ts
profiles/{supervisor,lead,peer}.md
skills/ppo-orchestrate/SKILL.md
skills/workspace-protocol/{SKILL.md,AUTHORING-GUIDE.md}
```

Tests, specifications, reference documents, scratch state, and development dependencies are excluded. The manifest exposes one extension and two skills. Role Profiles are private package data and are not independently discoverable Pi prompts or skills.
