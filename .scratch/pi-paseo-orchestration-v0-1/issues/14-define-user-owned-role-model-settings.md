# Define user-owned role model settings

Type: grilling
Status: resolved
Blocked by: 01, 03, 05, 08, 11

## Question

How does the Human choose the exact Pi model and thinking level for Supervisor, Lead, and Peer without package defaults, task-class routing, or a second control plane, and how are those choices applied and verified for governed processes and newly created children?

## Answer

v0.1 stores one Human-owned settings document at `<effective Pi config directory>/pi-paseo-orchestration/settings.json`. It has a closed `version: 1` schema and exactly three required entries: `supervisor`, `lead`, and `peer`. Each entry contains one exact Pi provider ID, model ID, and `thinking` level. `thinking` uses Pi's exact `off|minimal|low|medium|high|xhigh|max` ID and is passed unchanged as Paseo `settings.thinkingOptionId`; there is no conversion. The package supplies no model or thinking default and does not read project files, Paseo config, environment hints, or Role Profile prose as fallback.

`/ppo:settings` is the only package settings surface. It is registered in passive, governed, and blocked Pi sessions, invokes no model, lists models from Pi's current model registry, collects one thinking level for each role, shows the complete replacement, and writes only after Human confirmation. Cancel, incomplete selection, unknown model, or invalid thinking syntax leaves the prior file unchanged. A write failure is explicit and is never reported as success. A successful change applies to fresh governed processes; it does not hot-switch an active process.

A fresh governed process loads and snapshots the complete document, resolves its role's exact provider/model through Pi's model registry, applies it with Pi's public `setModel` and `setThinkingLevel` APIs before ordinary model work, and compares the effective model and thinking level with the snapshot. Missing, malformed, unavailable, unauthenticated, or clamped settings block ordinary model prompts while settings and doctor remain available. Later file or runtime model/thinking drift also blocks until a fresh process starts; there is no fallback.

Lead uses only the snapshotted `peer` selection for every new Peer. Supervisor uses only the snapshotted `lead` selection for an authorized replacement Lead. The already-decided Paseo role alias remains separate; child creation composes that exact alias with the selected Pi provider/model and passes the thinking level through `settings.thinkingOptionId`. The parent verifies the child's observed `runtimeInfo.model` and `runtimeInfo.thinkingOptionId` through supported Paseo agent-status evidence before treating its report as eligible. Creation success alone is insufficient.

There are no task-specific model classes, automatic effort routing, per-project overrides, remote-host routes, resolver service, compatibility matrix, or model fallback in v0.1. This narrows ticket 07: model/effort hints are not operative Workspace Protocol content in v0.1. Add routing only after one fixed selection per role is shown to be inadequate.

No glossary or ADR update is required. These are Human-owned runtime preferences and application rules, not a new domain concept or separate control plane.
