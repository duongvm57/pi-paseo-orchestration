# Pi Paseo Orchestration

A native Pi package for cooperative role governance. Paseo remains the source of lifecycle, workspace, parentage, follow-up, and timeline truth.

## Package shape

```text
package.json
extensions/pi-paseo-orchestration.ts
profiles/{supervisor,lead,peer}.md
skills/workspace-protocol/SKILL.md
test/package.test.mjs
test/release-smoke.mjs
```

The manifest exposes exactly one extension and one Workspace Protocol skill. The three Role Profiles are private package data: they are not Pi prompts or independently discoverable skills, and contain no secrets.

The extension registers these package surfaces:

- `/pi-paseo-orchestration:settings`
- `/pi-paseo-orchestration:lead-tiny`
- `/pi-paseo-orchestration:supervisor-recovery`
- `/pi-paseo-orchestration:notebook-init`
- `/pi-paseo-orchestration:doctor`
- the Supervisor-only typed Notebook append tool

## Governance boundary

The intended order is:

```text
Role Profile
  > Workspace Protocol
  > current-run Task Authority Envelope
  > ordinary task prose
```

Lower layers cannot widen a higher-layer ceiling. The policy guardrail is cooperative in-process control, not authentication, authorization, or filesystem/process/network/Git/identity isolation. Bash, aliases, scripts, child programs, and later extensions may bypass recognizable checks. The package never describes this guardrail as a sandbox.

## Implemented runtime surfaces

- Human-owned exact model/thinking settings for Supervisor, Lead, and Peer.
- Explicit, process-latched role activation and private profile injection.
- Baseline-intersected role tool ceilings, call-time tool checks, publication blocking, and current-run Task Authority Envelopes.
- Repository-root Workspace Protocol validation, Lead pinning, and Peer read protection.
- Strict Peer Report, Stable Candidate, review, verdict, Local Acceptance, Notebook, doctor, package-resource, and release-gate validation seams.
- Observation-only doctor output through supported TUI/RPC channels; it does not invoke the model or mutate project/session state.
- Append-only Supervisor Notebook storage under the effective Pi config directory.

## Current limitations

This package deliberately does not add a second lifecycle or orchestration control plane. The following remain release/runtime prerequisites rather than hidden fallbacks:

- public `pi-mcp-adapter` current-agent observation and live Paseo integration;
- full Lead–Peer agent creation, report transport/notification, recovery, and assignment lifecycle wiring;
- production candidate/verdict/acceptance workflow wiring into live Paseo sessions;
- Supervisor Workspace Protocol authoring writes (the declared skill is guidance; it grants no authority);
- full pinned-install/update/rollback proof in the release smoke.

The adapter is intentionally not bundled, vendored, imported through private modules, or declared as a dependency. `MCP_TARGETS` remains closed until its public observer and target provenance are independently verified; missing required capability fails closed.

## Installation and provider aliases

Production installation uses Pi Git package support with a reviewed full commit object ID:

```sh
pi install git:<repository-url>@<full-commit-object-id>
```

Update or rollback by reviewing and installing the exact full commit in a fresh Pi/Paseo process, then verifying package provenance and doctor output. Provider aliases are user-renamable; examples are:

- `pi-paseo-orchestration-supervisor`
- `pi-paseo-orchestration-lead`
- `pi-paseo-orchestration-peer`

`pi-mcp-adapter` is installed independently.

## Verification

```sh
npm test
npm run release:smoke
git diff --check
```

The standard-library test suite covers package resources, settings, activation, policy, strict contracts, Git candidate checks, Notebook behavior, doctor observation, release gating, and mutation boundaries. The release smoke proves relocation and local package seams, and exits non-zero while required live adapter/Paseo/install facts remain unproven.

## Public Pi seam

The extension is a TypeScript module with a default factory export. Package resources are declared under `package.json#pi`; the Workspace Protocol skill is declared explicitly. No adapter dependency or private Paseo state scrape is used.
