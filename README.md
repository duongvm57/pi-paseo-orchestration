# Pi Paseo Orchestration

This repository currently provides the **initial package skeleton and durable prompt resources** for Pi Paseo Orchestration. It is not the complete v0.1 orchestration system.

## Current package shape

```text
package.json
README.md
extensions/pi-paseo-orchestration.ts
profiles/supervisor.md
profiles/lead.md
profiles/peer.md
skills/workspace-protocol/SKILL.md
test/package.test.mjs
```

The Pi manifest exposes exactly one extension and one skill. The three Role Profiles are private package data: they are not Pi prompts or independently discoverable skills, contain no secrets, and are not loaded by the skeleton extension yet.

The extension currently registers only `/pi-paseo-orchestration`, a harmless status notification proving that Pi loaded the package. The Workspace Protocol skill is a focused Human/Supervisor authoring resource for `.orchestration/workspace-protocol.md`; discovering it grants no role, tool, authority, or access.

## Authority and safety boundary

The intended governance order is:

```text
Role Profile
  > Workspace Protocol
  > current-run Task Authority Envelope
  > ordinary task prose
```

Lower layers cannot widen a higher-layer ceiling. Paseo remains the only source of lifecycle, workspace, parentage, follow-up, and timeline truth.

Profiles and future Policy Guardrails are cooperative in-process controls, not authentication, authorization, or filesystem/process/network/Git/identity sandboxing. They do not establish acceptance or unrestricted authority.

## Not implemented

The skeleton does **not** implement or simulate:

- role activation, profile injection or overrides, and Human-owned role model settings;
- Task Authority Envelope parsing or capability enforcement;
- Policy Guardrails, tool shaping, publication blocking, or governed session behavior;
- doctor, Supervisor Notebook, or protocol-writing runtime surfaces;
- Lead–Peer orchestration, Paseo calls, recovery, or tiny-Lead execution;
- Peer Report validation or transport;
- Stable Candidates, independent review, Lead project verdicts, or Local Acceptance;
- a CLI, daemon, database, queue, mailbox, scheduler, second MCP client, or second runtime.

`pi-mcp-adapter` is intentionally not a dependency and must remain independently installed for future governed runtime work. The required public current-agent observer remains a release prerequisite; this skeleton does not invent or privately scrape that seam.

## Installation shape

Production installation is designed to use a reviewed full Git commit object ID:

```sh
pi install git:<repository-url>@<full-commit-object-id>
```

Update by reviewing a new full commit ID and installing that exact pin in a fresh Pi/Paseo process. Roll back by reinstalling the prior accepted full pin in another fresh process. Until the runtime, doctor, and release smoke exist, installing this skeleton proves package discovery only.

The future Paseo provider aliases are user-renamable; documentation examples use:

- `pi-paseo-orchestration-supervisor`
- `pi-paseo-orchestration-lead`
- `pi-paseo-orchestration-peer`

The planned `/pi-paseo-orchestration:doctor` command and full release smoke are not registered or available in this skeleton.

## Verification

```sh
npm test
git diff --check
```

The standard-library tests cover only package shape, resource discovery, and extension registration. They are not the v0.1 runtime or release suite.

## Public Pi seams used

This skeleton follows the locally installed Pi 0.84.1 public documentation and examples:

- package resources are declared under `package.json#pi`;
- an extension is a TypeScript module with a default factory export;
- the factory uses public `pi.registerCommand()`;
- skills are discovered from an explicitly declared `SKILL.md`.

No uncertain Paseo or adapter API is used.
