# Pi Paseo Orchestration

A native Pi package for cooperative role governance. Paseo remains the source of lifecycle, workspace, parentage, follow-up, and timeline truth.

## Package shape

```text
package.json
extensions/pi-paseo-orchestration.ts
profiles/{supervisor,lead,peer}.md
skills/workspace-protocol/{SKILL.md,AUTHORING-GUIDE.md}
skills/ppo-orchestrate/SKILL.md
test/package.test.mjs
test/release-smoke.mjs
```

The manifest exposes exactly one extension and two skills: Workspace Protocol authoring and model-invoked PPO orchestration. The three Role Profiles are private package data: they are not Pi prompts or independently discoverable skills, and contain no secrets.

The extension registers these package surfaces:

- `/ppo:bootstrap <task>`
- `/ppo:settings`
- `/ppo:lead-tiny`
- `/ppo:supervisor-recovery`
- `/ppo:notebook-init`
- `/ppo:doctor`
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
- generic lifecycle authority: Lead follow-up/cancel/archive is restricted to Peers created by that exact Lead process;
- automated Human grants and Local Acceptance; both remain direct Human actions;
- Supervisor Workspace Protocol authoring writes (the declared skill is guidance; it grants no authority);
- full pinned-install/update/rollback proof in the release smoke.

The adapter is intentionally not bundled, vendored, imported through private modules, or declared as a dependency. `MCP_TARGETS` exposes bounded observation to Supervisor and child-specific creation/follow-up/cancel/archive to Lead; role-specific argument validation is repeated at call time and every other inner target remains closed. Missing required capability fails closed.

## Installation and provider aliases

Production installation uses Pi Git package support with a reviewed full commit object ID:

```sh
pi install git:<repository-url>@<full-commit-object-id>
```

Update or rollback by reviewing and installing the exact full commit in a fresh Pi/Paseo process, then verifying package provenance and doctor output. Provider aliases are user-renamable; examples are:

- `pi-paseo-orchestration-supervisor`
- `pi-paseo-orchestration-lead`
- `pi-paseo-orchestration-peer`

`pi-mcp-adapter` is installed independently. Configure the aliases in Paseo's
`~/.paseo/config.json` (names are examples and may be changed consistently):

```json
{
  "daemon": { "mcp": { "injectIntoAgents": true } },
  "agents": {
    "providers": {
      "ppo-supervisor": {
        "extends": "pi",
        "label": "PPO Supervisor",
        "enabled": true,
        "env": { "PI_PASEO_ORCHESTRATION_ROLE": "supervisor" }
      },
      "ppo-lead": {
        "extends": "pi",
        "label": "PPO Lead",
        "enabled": true,
        "env": {
          "PI_PASEO_ORCHESTRATION_ROLE": "lead",
          "PI_PASEO_ORCHESTRATION_PEER_ALIAS": "ppo-peer"
        }
      },
      "ppo-peer": {
        "extends": "pi",
        "label": "PPO Peer",
        "enabled": true,
        "env": { "PI_PASEO_ORCHESTRATION_ROLE": "peer" }
      }
    }
  }
}
```

Restart Paseo after changing aliases. Optional `PI_PASEO_ORCHESTRATION_SUPERVISOR_ALIAS` and `PI_PASEO_ORCHESTRATION_LEAD_ALIAS` override the bootstrap defaults `ppo-supervisor` and `ppo-lead`.

From an ungoverned Pi session in the repository, start normal work with:

```text
/ppo:bootstrap <task>
```

The command validates settings and the Workspace Protocol, then invokes the packaged orchestration skill. It creates sibling Supervisor and Lead roots in the same Paseo workspace; the Lead creates bounded Peer children. Launch individual governed roots manually only for diagnostics or recovery. A Lead
may create a Peer only with the alias from
`PI_PASEO_ORCHESTRATION_PEER_ALIAS`, its snapshotted Peer model/thinking,
the inherited workspace, exact current Lead ID in `parent_lead_agent_id`, and
native finish notification. Supervisor `paseo_create_agent` additionally requires the current Human recovery grant's exact
Lead alias, workspace, objective, and handoff label. The child must still pass
Human-observed doctor evidence before handoff: an alias is convenience, not
role proof.

## Verification

```sh
npm test
npm run release:smoke
git diff --check
```

The standard-library test suite covers package resources, bootstrap, settings, activation, policy, strict contracts, Git candidate checks, Notebook behavior, doctor observation, release gating, and mutation boundaries. Live workflow validation starts with `/ppo:bootstrap <task>` and follows Paseo finish notifications; `notifyOnFinish` is an attention signal, not acceptance. The release smoke proves relocation and local package seams, and exits non-zero while required live adapter/Paseo/install facts remain unproven.

## Public Pi seam

The extension is a TypeScript module with a default factory export. Package resources are declared under `package.json#pi`; the Workspace Protocol skill is declared explicitly. No adapter dependency or private Paseo state scrape is used.
