# Pi Paseo Orchestration v0.1

Label: ready-for-agent

## Problem Statement

Pi and Paseo provide agent execution, tools, sessions, workspaces, identity, parentage, and lifecycle control, but they do not provide the reference orchestration model-style separation between durable role conduct, repository workflow rules, current-run capability grants, evidence-bearing handoffs, independent candidate review, and direct Human acceptance.

Without a small package enforcing those distinctions, orchestration can drift into unsafe or ambiguous behavior: role identity can be inferred from prose, tools disabled by the Human can be re-enabled, grants can leak between runs, multiple writers can collide, lifecycle status can be mistaken for acceptance, Peer reports can disrupt an active Lead, and Git work can be reviewed or accepted without one immutable candidate identity. Supervisor observations can also be lost across sessions or accidentally become a second task/control plane.

The package must provide practical governance without replacing Paseo, claiming sandbox-grade isolation, adding publication workflows, or importing compatibility obligations from another orchestration package. The v0.1 workflow must end at a locally accepted, exactly identified Git candidate.

## Solution

Ship one independent, full-commit-pinned, Git-installable Pi package containing one policy extension, three private Role Profiles, one Workspace Protocol authoring skill, one Human-owned role-settings command, an observation-only doctor command, and the narrow Supervisor Notebook initialization/append surfaces.

The Human selects one exact Pi model and thinking level for each role through the settings command. The extension activates exactly one process-latched `supervisor`, `lead`, or `peer` Role Profile from an explicit environment value and applies that role's saved selection without package defaults or task-specific routing. For each run it intersects the Human's existing Pi tool baseline with the role ceiling and the current-run Task Authority Envelope, then applies the same policy at tool-call time. Missing authority leaves the role at its base capabilities; malformed, stale, mismatched, or drifted governed state fails closed. Bash remains available under a cooperative Policy Guardrail, so the package explicitly makes no filesystem, process, network, Git, identity, authentication, or sandbox guarantee.

A mandatory repository-wide Workspace Protocol tells the Lead how to classify and route work proportionately. Paseo remains the only lifecycle, workspace, parentage, follow-up, and timeline control plane. Peers complete each run with one strict terminal Peer Report rather than gaining orchestration tools or a mailbox. Write outcomes become immutable Git Stable Candidates, optionally receive independent review, receive a candidate-bound Lead project verdict, and cross the Local Acceptance Boundary only through a direct canonical Human acceptance message.

Supervisor observations persist in a Human-owned, append-only, project-scoped Notebook under the effective Pi configuration directory. Notebook records are causal evidence only: they never become authority, current task state, acceptance, messaging, or lifecycle truth.

## User Stories

1. As a Human, I want normal Pi sessions with no orchestration role configured to remain passive and explicitly ungoverned, so that globally installing the package does not take over ordinary Pi use.
2. As a Human, I want each governed process to activate exactly one closed role, so that role identity cannot change through titles, labels, prompts, resumes, or model claims.
3. As a Human, I want role activation bound to the exact Paseo agent process and profile bytes, so that environment or profile drift stops work rather than silently changing policy.
4. As a Human, I want to replace all bundled Role Profiles from one complete absolute directory, so that I can customize role conduct without partial fallback or mixed profile sources.
5. As a Human, I want my existing Pi tool choices to remain a ceiling, so that the package never re-enables a tool I disabled.
6. As a Human, I want exceptional capabilities granted only for one current run, so that an earlier edit, commit, or recovery grant cannot leak into later work.
7. As a Human, I want edit and local-commit capabilities granted separately, so that permission to modify files never implies permission to create a candidate commit.
8. As a Human, I want Lead self-work limited to a confirmed tiny task permitted by the Workspace Protocol, so that difficult implementation remains Peer-owned.
9. As a Human, I want Supervisor Lead recovery bound to an exact provider, workspace, handoff, and objective, so that recovery does not become generic agent-creation authority.
10. As a Human, I want push, merge, amend, pull-request, deploy, and other publication actions absent, so that v0.1 ends at local acceptance.
11. As a Human, I want one repository-wide Workspace Protocol with explicit decision boundaries, so that orchestration follows rules I reviewed rather than inferred defaults.
12. As a Human, I want the Supervisor to interview me and present an exact protocol diff before writing it, so that protocol changes remain directly Human-approved.
13. As a Human, I want protocol revisions versioned and protected by optimistic concurrency, so that concurrent edits cannot silently overwrite one another.
14. As a Human, I want product, priority, irreversible trade-off, external-effect, authority, protocol, subjective, and material cost/risk decisions escalated to me, so that agents do not guess across must-ask boundaries.
15. As a Human, I want the smallest topology appropriate to task risk, so that tiny work is not forced through ceremonial councils or mandatory review without a trigger.
16. As a Human, I want every accepted result bound to full Git commit identities and a direct acceptance block, so that status, tests, or agent prose cannot be mistaken for acceptance.
17. As a Human, I want dirty or unrelated checkout changes preserved untouched, so that orchestration never stashes, resets, cleans, commits, overwrites, or relocates my work.
18. As a Human, I want package installation, update, and rollback pinned to reviewed full commit IDs, so that the loaded package bytes are reproducible.
19. As a Human, I want `pi-mcp-adapter` installed and verified independently, so that the orchestration package does not vendor, mutate, or privately couple to the adapter.
20. As a Human, I want doctor remediation to be advisory and manual, so that diagnosis never mutates configuration, Git, Pi, Paseo, or workspace state.
21. As a Supervisor, I want a private Role Profile focused on observation, evidence, Human decision relay, protocol authoring, and bounded recovery, so that I do not become a project implementer or accepter.
22. As a Supervisor, I want to inspect exact Paseo agents, parentage, activity, and workspaces through supported read-only capabilities, so that observations use lifecycle truth rather than names or cwd guesses.
23. As a Supervisor, I want to record causal evidence across Pi sessions and replacement processes, so that important governance history is not lost with one transcript.
24. As a Supervisor, I want Notebook entries routed by the Human-defined protocol project identity, so that cwd, branch, remote, title, or provider alias cannot select the wrong project history.
25. As a Supervisor, I want concurrent Notebook appends to preserve every distinct entry, so that multiple observers do not require a mutable sequence, lock ledger, or daemon.
26. As a Supervisor, I want corrections and supersessions appended rather than overwritten, so that earlier evidence remains inspectable.
27. As a Supervisor, I want malformed, copied, mismatched, or unsafe Notebook state to stop writes, so that evidence is not silently repaired or rebound.
28. As a Supervisor, I want sensitive evidence bounded and redacted, so that credentials, profiles, raw prompts, transcripts, and complete environments are not persisted.
29. As a Supervisor, I want Notebook recommendations to remain proposals, so that historical evidence cannot automatically change policy, recover a Lead, or mutate a project.
30. As a Lead, I want to verify activation, repository identity, workspace identity, provider capabilities, and the complete Workspace Protocol before orchestration, so that work begins from one governed context.
31. As a Lead, I want to classify work as tiny/bounded, cross-module/lifecycle, or architecture-sensitive using repository policy and evidence, so that topology follows risk rather than a hard-coded feature taxonomy.
32. As a Lead, I want to use a small read-only Scout or Architect investigation when classification facts are missing, so that writes do not start from unresolved assumptions.
33. As a Lead, I want to frame outcomes, ownership, exclusions, dependencies, verification, evidence, and escalation without pre-solving Peer work, so that Peers retain meaningful responsibility and challenge rights.
34. As a Lead, I want one durable Peer Role Profile with assignment-scoped Engineer, Architect, Reviewer, and Scout dispositions, so that task context does not masquerade as role identity.
35. As a Lead, I want every assignment to have exact task, revision, assignment, parent, repository, workspace, protocol, scope, and evidence pins, so that reports and candidates correlate without a second task database.
36. As a Lead, I want one active writer for each moving scope and separate isolated checkouts for concurrent writers, so that Git indexes, refs, generated files, and discovered scope cannot collide.
37. As a Lead, I want dependency edges to block only affected work without creating a scheduler or queue, so that Paseo remains the lifecycle control plane.
38. As a Lead, I want Peer reports to terminate runs and be validated against exact child and parent identity, so that lifecycle state and arrival path are not treated as evidence.
39. As a Lead, I want native finish notifications used only for a reserved idle wait, so that a completion signal does not knowingly replace an in-flight Lead run.
40. As a Lead, I want one bounded inspection after missing or ambiguous evidence rather than polling or retry loops, so that failures stay explicit.
41. As a Lead, I want structured decisions for reopen, dependency, and blocked reports, so that accepting a request cannot be confused with accepting a candidate.
42. As a Lead, I want correction to return to the original valid writer whenever ownership and scope remain valid, so that Reviewer and Lead do not take over implementation.
43. As a Lead, I want changed candidates to invalidate old review and verdict evidence, so that no approval follows a moving target.
44. As a Lead, I want to issue one closed, candidate-bound project verdict, so that technical readiness, unresolved Human decisions, and non-blocking risk remain distinguishable.
45. As a Peer, I want a read-only base surface and an exact current-run grant for writing, so that task prose cannot grant authority.
46. As a Peer, I want one bounded assignment with explicit exclusions and verification, so that I can own an outcome without expanding scope.
47. As a Peer, I want to emit `REOPEN_REQUEST` when a premise fails, so that I can stop an incompatible patch and present evidence and options.
48. As a Peer, I want to emit `DEPENDENCY_REQUEST` when another owner, API, workspace, scope, or Human decision is required, so that dependencies are resolved without self-expansion.
49. As a Peer, I want to emit `BLOCKED` after bounded attempts when authority or prerequisites are missing, so that failure is not disguised as completion.
50. As a Peer, I want to emit `HANDOFF` only when required artifacts, verification, and Stable Candidate evidence exist, so that lifecycle finish is not mistaken for readiness.
51. As a Peer, I want no direct Paseo reporting or retry surface, so that my report cannot disrupt an active Lead or create an unacknowledged mailbox protocol.
52. As a Reviewer, I want a neutral mandate and one exact immutable candidate, so that I can independently falsify the result without inheriting the Lead's preferred conclusion.
53. As a Reviewer, I want findings to carry stable IDs, severity, impact, and inspectable evidence, so that corrections can be checked without mutating prior review records.
54. As an operator, I want doctor to inspect only the current cwd, repository, Pi session, Paseo agent, and typed workspace binding, so that its report cannot accidentally describe another context.
55. As an operator, I want doctor to distinguish `PASS`, `WARN`, and `BLOCKED` by proven capabilities rather than version optimism, so that readiness is evidence-based.
56. As an operator, I want doctor to report package and adapter provenance, role/profile/protocol state, effective tools, authority state, Git context, and Paseo identity in one closed report, so that failures are diagnosable.
57. As an operator, I want equivalent non-persistent TUI and RPC doctor output, so that both interactive and automated observation use the same facts.
58. As an operator, I want print/JSON doctor invocation to fail before probing when no supported output channel exists, so that diagnosis never silently writes a transcript or claims success.
59. As a package maintainer, I want one standard-library hermetic test entry point and one release smoke recipe, so that behavior is proved without a new framework or runtime.
60. As a package maintainer, I want release blocked until the adapter exposes the required public current-agent observer and every mutation boundary passes, so that v0.1 does not ship a private-state scrape or weaker fallback.
61. As a Human, I want one explicit model and thinking selection for each governed role, so that the package neither chooses hidden defaults nor lets Lead vary Peer models by task.

## Implementation Decisions

### Product and control-plane boundary

- v0.1 is one independent Pi package. It runs only inside Pi and adds no executable, daemon, sidecar, scheduler, queue, mailbox, task ledger, candidate registry, acceptance service, second MCP client, second orchestration runtime, or second control plane.
- Paseo remains the sole source of lifecycle, workspace, parentage, follow-up, and timeline truth.
- The normative behavioral source is the reference orchestration model orchestration deep dive. The provisional implementation plan is non-normative. `Minnyat/paseo-pi-team` is neither a dependency nor a compatibility target.
- Publication is absent rather than sandboxed. Push, merge, amend, force-push, pull-request creation, deploy, and package-owned workspace cleanup are not implemented.
- The package uses the domain separation between Role Profile, Workspace Protocol, Task Authority Envelope, Peer Report, Supervisor Notebook, Stable Candidate, Policy Guardrail, Authority Grant, Capability, and Local Acceptance Boundary. None of these substitutes for another.

### Installed surface

- The package manifest declares exactly one extension and one Workspace Protocol authoring skill, plus a standard-library test script. It declares no prompts, themes, examples, install lifecycle scripts, or adapter dependency.
- The extension owns role settings, activation, prompt injection, capability shaping, call-time guardrails, strict contract parsing, doctor, candidate/verdict/acceptance validation, reporting constraints, and Supervisor Notebook surfaces. No speculative extension split is introduced.
- Three nonempty private profile resources are package data for Supervisor, Lead, and Peer. They are not discoverable Pi prompts or skills and contain no secrets.
- README documentation covers full-commit Git installation, update, rollback, three user-renamable Paseo provider aliases, role settings, independent adapter setup, doctor invocation, the cooperative non-sandbox boundary, and release smoke verification.
- Package resources resolve from canonical loaded-module/package provenance, never from cwd, repository root, Pi config root, Paseo workspace, or parent-directory search. Expected resources must be regular, readable, nonempty, direct descendants without symlink escape.

### Human-owned role model settings

- `/ppo:settings` is always registered, invokes no model, and is the only package surface that changes role model settings. It uses Pi's current model registry to collect an exact provider ID, model ID, and one thinking level from `off|minimal|low|medium|high|xhigh|max` for each of Supervisor, Lead, and Peer, shows the complete replacement, and writes only after Human confirmation.
- The complete closed document lives at `<effective Pi config directory>/pi-paseo-orchestration/settings.json` and contains exactly `version: 1` plus a `roles` object with required `supervisor`, `lead`, and `peer` entries; each entry contains exactly string fields `provider`, `model`, and `thinking`. `thinking` is one exact Pi ID from the listed closed set and is passed unchanged as Paseo `settings.thinkingOptionId`; there is no conversion. The document is Human-owned runtime state, not package data, project policy, Paseo lifecycle state, or authority. The package supplies no model/thinking defaults or alternate source.
- Cancel, incomplete selection, unknown model, or invalid thinking syntax preserves the previous document. A write failure is explicit and is never reported as success. A valid replacement affects fresh governed processes only; it does not hot-switch an active process.
- A fresh governed process snapshots the complete document, resolves and applies its role selection through Pi's public model APIs before ordinary model work, and compares the effective model and thinking with the snapshot. Missing, malformed, unavailable, unauthenticated, clamped, file-drifted, or runtime-drifted settings block ordinary prompts while settings and doctor remain available.
- Lead uses the snapshotted Peer selection for every new Peer; Supervisor uses the snapshotted Lead selection for authorized recovery. Child creation combines the separately configured exact Paseo role alias with the selected Pi provider/model and passes the saved `thinking` unchanged as `settings.thinkingOptionId`; observed `runtimeInfo.model` and `runtimeInfo.thinkingOptionId` must match before the child's report is eligible.
- v0.1 has no task-specific model classes, automatic effort routing, per-project override, resolver service, remote-host route, compatibility matrix, fallback, or package-selected default.

### Role activation and private profiles

- `PI_PASEO_ORCHESTRATION_ROLE` is the sole role source. Accepted values are exactly `supervisor`, `lead`, and `peer`. Missing or empty is passive/ungoverned; every other nonempty value, including whitespace and case variants, is invalid.
- Governed activation requires a nonblank effective Paseo agent ID, a complete valid role-settings snapshot, valid profile source, `read`, and an active outer `mcp` tool for Supervisor and Lead. Missing mandatory prerequisites block ordinary model prompts while settings and doctor remain available.
- A complete Human-managed absolute profile directory may replace all three bundled files. It is all-or-nothing; relative, incomplete, unreadable, empty, or unsafe overrides block without fallback.
- First successful activation snapshots role, Paseo agent ID, profile source/path, and all profile digests. Later environment, path, or content drift blocks until a fresh Paseo process starts. Pi new/resume/fork/reload cannot switch role inside the process.
- The selected Role Profile is appended with a package-owned delimiter to the existing chained system prompt before every agent run and is not written as a transcript message. “Private” means absent from normal transcript display, not secret from the process, extensions, provider, model, or OS user.
- Instruction precedence is Role Profile ceiling, then Workspace Protocol narrowing, then current-run Task Authority Envelope, then task prose. Known conflicts block the affected action.
- In governed processes, Pi-native new/resume/fork operations are cancelled in favor of Paseo lifecycle operations. Ungoverned native Pi behavior remains unchanged.

### Policy Guardrail and role ceilings

- Each session snapshots its active-tool baseline at session start and clears current authority. Each run computes `baseline ∩ role ceiling ∩ current-run authority`; the package never re-enables unavailable or Human-disabled tools.
- Every direct tool call is checked against the same effective policy. Outer MCP calls validate their exact inner target and arguments and fail closed on malformed or unknown values. `mcp_script` is unavailable to every governed role because v0.1 cannot safely authorize arbitrary multiplexed JavaScript.
- Recognizable direct `git commit` requires a current-run local-commit grant. Direct push, merge, amend, force-push, pull-request, and deploy routes are always blocked.
- Supervisor's ceiling includes read, Bash, narrow protocol/Notebook writes, read-only provider/model/Paseo observation, exact Human-decision relay, and exact recovery agent creation only under a valid recovery grant. Supervisor does not implement project work, own architecture, or accept candidates.
- Lead's base includes read, Bash, provider/model discovery, workspace creation/listing, agent monitoring, agent creation/follow-up/update/cancel/archive, and pending-permission observation. Only the Human responds to permissions. Workspace archival is absent.
- Lead write/edit and local commit are conditional capabilities admitted only by a direct Human `lead_tiny` route, a matching Workspace Protocol allowance, and exact current-run scope. If work ceases to be tiny, Lead stops and delegates.
- Peer's base is read and Bash. A matching direct Human envelope may add exact-scope write/edit and separately one local commit. Peer has no outer MCP, orchestration, browser, permission-response, publication, or direct reporting surface.
- The Policy Guardrail is cooperative. Retained Bash, shell redirection, aliases, scripts, child programs, and later extensions can bypass recognizable checks. Documentation and output must never call it a sandbox, authentication boundary, or security isolation.

### Task Authority Envelope

- v0.1 accepts one canonical `v1` authority block as the first nonempty content of a submitted Human message. It contains exactly one closed-schema JSON object between exact begin/end markers. Misplaced, duplicate, malformed, quoted, unknown-version, unknown-field, duplicate-field, mistyped, conflicting, or role-mismatched envelopes grant nothing.
- Every grant carries exact `grant_kind`, activated `role`, `issuer: human`, current Paseo agent ID, nonempty task ID, and bounded objective. Accepted grant kinds are Peer, tiny Lead, and Supervisor recovery.
- Human provenance is route-bound and cooperative: Peer grants come from the direct Human task message; Lead tiny and Supervisor recovery grants come only from their idle governed slash-command flows after multiline Human editing and confirmation.
- Peer and tiny Lead grants contain a nonempty closed capability set of `edit` and/or `local_commit`, normalized repository-relative writable scope, optional in-scope exclusions, and a full candidate base exactly when commit is granted. Tiny Lead also binds the current Workspace Protocol digest.
- Scope rejects absolute paths, traversal, globs, ambiguous prefixes, symlink components, and new files outside an existing real directory. Exclusions must lie within scope.
- Supervisor recovery grants contain no edit/commit capability and bind target role Lead, exact provider alias, workspace ID, handoff ID, and objective. Agent-creation arguments must match the grant and the snapshotted Lead model/thinking selection exactly; successful creation is not proof of Lead activation, so replacement handoff waits for doctor evidence.
- Every run replaces the internal current-run authority record, including replacement with no authority. New, resumed, forked, replaced, or relaunched sessions inherit nothing.
- Requested but unavailable optional capabilities remain absent with diagnostics. Missing required activation capabilities block. A local commit additionally requires current `HEAD` to equal the granted candidate base and the current/cumulative diff to remain in scope.

### Workspace Protocol

- Every governed repository has one canonical repository-root Workspace Protocol applying repository-wide; v0.1 has no overlays. Its metadata includes status, monotonic version, last-reviewed date, Human-defined project ID, and repository-root applicability.
- Its required core defines the Human/Supervisor/Lead/Peer decision matrix; three risk classes and routing; one-writer, isolation, ownership, and handback rules; per-class candidate/verification/review/acceptance rules; reopen/dependency/blocked handling; and evolution rules.
- Optional content is limited to project criticality, review/council rules, anti-patterns, and Supervisor observation/authoring hints. Model/effort routing does not belong in the v0.1 protocol. Omission grants nothing.
- The protocol can narrow workflow and permit tiny Lead self-work, but it cannot grant a Capability or override the Role Profile or Task Authority Envelope.
- Lead resolves the exact repository root, reads the full protocol, validates project identity, and pins version plus digest before orchestration. Missing read evidence or missing/empty/malformed/identity-mismatched/conflicting protocol state blocks governed orchestration.
- Peer receives only assignment-relevant constraints. Reading the full protocol grants no authority and is treated as a governance violation.
- The authoring skill guides Supervisor through a breadth-first Human interview, restates decisions and consequences, presents an exact diff, and writes only after direct confirmation. Lead may propose but not write; Peer may neither read nor edit.
- Every approved revision increments version and refreshes review date. Writes use optimistic concurrency against the confirmed version/digest. A concurrent change requires a fresh read, diff, and Human confirmation.
- New revisions normally apply to new work. A material authority, ownership, or acceptance change stops and re-evaluates running work rather than silently changing its pin.

### Supervisor Notebook

- The Notebook is stored under a versioned package namespace in the effective Pi config directory, resolved afresh from `PI_CODING_AGENT_DIR` or Pi's documented per-user default. It never lives in the repository, package checkout, Paseo state, transcript, or session.
- One notebook is keyed by lowercase SHA-256 of the exact UTF-8 protocol project ID. The Human ID remains data, never a path component. Protocol project ID, Paseo project ID, repository root, workspace ID, Lead ID, Supervisor ID, and Pi session ID remain distinct namespaces.
- The Human initializes one create-once immutable manifest containing contract/schema version, opaque notebook ID, project IDs and creation locators, derived project key, creation time/route/writer, and canonical digest.
- Every append creates one immutable canonical entry containing contract/schema, entry/notebook/project identities, times, writer, live context and binding source, observation, nonempty bounded evidence, suspected mechanism with uncertainty, impact, question, recommendation, escalation, correction/supersession history, redaction metadata, and canonical digest.
- Corrections and supersessions are complete new entries referencing prior ID/digest pairs. Existing manifest and entry bytes are never edited, replaced, normalized, truncated, or deleted by the package.
- A snapshot digest covers the exact manifest digest and sorted physical entry filenames/raw digests, including invalid entry files. It identifies one observed physical snapshot only and grants no ordering, freshness, authority, or acceptance.
- Notebook initialization is a Human-confirmed command. Ordinary Supervisor append is one typed narrow tool with contract fields only and no caller-supplied filesystem path. The tool is absent for Lead, Peer, passive, and blocked surfaces.
- Publication uses one package-private create-only primitive: exclusive private staging under the same storage root, complete canonical write and sync, atomic no-replace hard-link to the absent final direct-child path, final-parent sync, staging unlink, and staging-directory sync. Unsupported no-replace, durability, privacy, containment, or no-symlink semantics fail closed without fallback.
- Same ID plus same canonical digest is idempotent; same ID plus different digest is a conflict preserving existing bytes. Distinct IDs may append concurrently. Crash orphans stay private staging artifacts and are never auto-promoted or swept.
- Malformed manifests block all writes. Malformed entries are preserved, included in the physical snapshot, excluded from valid causal projection, and do not block unrelated appends when the manifest and path remain valid.
- Project membership/copy ambiguity stops writes for Human move-versus-copy classification. A move appends a confirmed rebind entry; a copy requires reviewed/reset protocol identity and a new notebook. No automatic repair, import, merge, deduplication, archival, cleanup, or reconciliation exists.
- Notebook evidence is historical only. Current actions re-observe live facts. Notebook content never grants authority, controls lifecycle, relays messages, accepts work, or mutates policy.

### Adaptive Lead–Peer lifecycle

- The lifecycle consists of evidence gates, not a new persisted state machine: orient, classify, frame, route, assign/start, wait, evaluate, construct candidate, review/correct when triggered, project verdict, Human decision when required, and Local Acceptance.
- Lead chooses among tiny/bounded, cross-module/lifecycle, and architecture-sensitive classes from the pinned protocol and recorded evidence. Uncertainty triggers the smallest read-only investigation required; a council appears only for multiple genuinely independent decision-changing propositions.
- One Peer Role Profile supports Engineer, Architect, Reviewer, and Scout assignment dispositions. Disposition narrows the mandate but never changes identity or authority.
- Every assignment carries contract version; project/task/revision/assignment/parent identities; task class/rationale/disposition; objective/outcome/evidence/assumptions/exclusions; exact repository/workspace/checkout; ownership and writable scope; dependencies; requested capabilities; verification and candidate contract; review/escalation/handback rules; Peer Report version/transport; and pinned protocol version/digest.
- Lead mints assignment identity before Paseo child creation, then launches every Peer with the snapshotted Peer model/thinking selection and binds the returned exact child ID. Lead never varies model selection by task. Failure or ambiguity permits at most one bounded inspection; a deliberate retry uses a new assignment identity.
- A Lead-created Peer begins read-only because only the Human can issue its write grant. The Peer may investigate, then reports `BLOCKED` if the assigned outcome requires a missing grant. The Human addresses the canonical grant directly to the exact idle Peer for its next run.
- One moving scope has one writer. Overlapping scopes are sequenced through terminal handback. Concurrent writers require satisfied dependencies, disjoint scopes, and distinct isolated checkouts; separate Paseo workspace IDs over one checkout are insufficient.
- Follow-up targets only a known idle Peer, binds the preceding report/request, and starts a new run. Material changes to objective, owner, checkout, scope, verification, candidate rules, pins, report transport, or task revision end the old assignment and require a new assignment; capability/scope changes also require a new Human grant.
- Cancellation is explicit and bounded for Human abort, supersession, unsafe continuation, invalidation, or material pinned change. No cancel/restart loop exists. The original writer and frozen checkout remain available through correction, acceptance, or abandonment.
- Missing reports or lifecycle errors permit one bounded status/activity inspection. Evidence is never reconstructed from lifecycle state or arbitrary prose. Recovery creates fresh assignments where exact old correlation cannot be preserved.

### Peer Reports and notifications

- Every Peer run ends with one strict `v1` Peer Report as the first nonempty content of its final response. The closed kinds are `PROGRESS`, `HANDOFF`, `REOPEN_REQUEST`, `DEPENDENCY_REQUEST`, and `BLOCKED`.
- The common schema binds report, Peer, exact parent Lead, task, and assignment IDs; nonempty summary/evidence; typed payload; and optional superseded report ID. Unknown, duplicate, malformed, mistyped, misplaced, or mismatched data rejects the report.
- `PROGRESS` is a meaningful terminal checkpoint, not timer or polling output. `HANDOFF` carries artifacts, conditional candidate reference, exact verification, residual risks, and unfinished dependencies. Candidate-required work without a candidate reports `BLOCKED`.
- Reopen identifies the failed premise, impact, options, and requested decision. Dependency identifies what is needed, from whom, impact, and whether Human decision is required. Blocked identifies blocker, impact, unblock condition, bounded attempts, and whether unrelated in-scope continuation might exist without widening scope.
- Peer never calls Paseo to report, never retries or reroutes, and gains no orchestration surface. Native finish/error/permission notifications are attention signals only.
- Lead may arm one child finish notification only when ending its own run and reserving itself idle. Parallel children do not arm competing notifications. A broken reservation is a protocol violation because notifications use a replacement path; no non-disruption guarantee is claimed.
- Lead validates report IDs, child ID, self/parent ID, current Paseo parentage, task/assignment, and pinned protocol/transport before use. Title, cwd, workspace name, lifecycle, arrival path, or prose cannot repair correlation.
- Reports are immutable and have no trusted total ordering. Byte-equivalent same-ID reports are duplicates; same-ID mutations are invalid; corrections use a new ID and explicit supersession. Stale assignment reports are rejected.
- Structured Lead request decisions bind the exact report/task/assignment and contain a kind-appropriate decision, evidence-backed rationale, next action, assignment effect, and required Human action. Request `ACCEPT` is not candidate acceptance.

### Stable Candidate, review, verdict, and Local Acceptance

- A v0.1 Stable Candidate is identified only as `git:v1:<task-base-full-oid>:<candidate-full-oid>` in the exact project/repository/workspace/task/assignment context. Branches, tags, abbreviated IDs, `HEAD`, worktree state, status, and prose are not identity.
- The first candidate is one single-parent commit over the granted immutable task base. Each correction is one new single-parent commit over the preceding candidate while preserving the original task base in the reference. Each candidate-producing grant/run creates at most one commit; history remains linear; merge and amend are forbidden.
- Candidate checkouts start clean at the granted base, contain only owned in-scope work, finish at the candidate commit with no staged/unstaged/untracked residue, and freeze after handoff. Ignored build/cache files are not artifacts. Dirty Human work is preserved and candidate work moves to an isolated checkout.
- Eligibility checks full object identity/retrievability, exact parent/ancestry, current and cumulative scope/exclusions, cumulative objective relevance, clean state, and absence of unrelated changes at construction, handoff, review start/end, verdict, and acceptance.
- Movement of supporting `HEAD`, branch, or ref after handoff invalidates workflow eligibility until exact revalidation plus new handoff, or a new candidate. No gate follows a moving ref.
- Candidate evidence binds exact context, identities, protocol pin, cumulative diff and changed paths, scope results, each command/result/output, post-commit verification at exact candidate, clean check, residual risks, and unfinished dependencies.
- Independent review is required only by protocol/class/risk. The Reviewer is a fresh independent Peer, never the writer or a Lead fork carrying preferred framing, and receives one neutral candidate-bound falsification mandate.
- Review resolves exact Git objects and inspects the immutable cumulative artifact. Its immutable result binds review/Reviewer/assignment/candidate/mandate, commands/evidence/coverage, outcome `APPROVE` or `FINDINGS`, and findings with stable ID, severity, evidence, impact, and scope. Correction reviews classify earlier findings as resolved, open, or obsolete.
- Candidate B invalidates every review and verdict about A. The same Reviewer may re-review only while independence and mandate remain intact; changed premise, architecture, mandate, or independence requires a fresh Reviewer.
- Corrections return to the original valid writer. Unavailable or invalid ownership requires a new Engineer assignment and isolated checkout at the retrievable prior candidate. Scope or objective expansion follows reopen/dependency/Human decision and new grant rules.
- Lead emits one strict `v1` project verdict block first. It binds exact project/task/revision/assignment/repository/workspace/protocol/candidate/origin, scope and verification evidence, review state, dependencies, residual risks, Human decisions, and one verdict: `NOT_READY`, `NEEDS_HUMAN`, or `READY`.
- `NOT_READY` wins for any technical, identity, scope, cleanliness, evidence, review, blocker, or dependency failure. `NEEDS_HUMAN` applies only when technical gates pass but a Human-only decision remains. `READY` requires every candidate/protocol/review gate, no blocker, and all prerequisite Human decisions resolved. No verdict is acceptance.
- Local Acceptance requires one direct Human `v1` acceptance block first, with exact `LOCAL_ACCEPT`, candidate reference, and immutable READY verdict ID. The route and closed schema fail closed on malformed, duplicate, relayed, mismatched, stale, or example text.
- At acceptance, the package revalidates exact context, candidate retrievability/freeze/scope/cleanliness/evidence, required review, READY verdict, and Human prerequisite decisions. Acceptance records a terminal local workflow state in existing transcript/timeline evidence only and creates no tag, ref, note, commit, database, service, or publication effect.

### Doctor

- `/ppo:doctor` is always registered when the package is loaded, including passive and blocked states. It is deterministic, observation-only, never invokes the model, and accepts no alternate target.
- Doctor inspects only current canonical cwd, containing Git repository, Pi process/session, process activation, exact Paseo agent and typed workspace binding, current package/adapter provenance, Role Profile, Workspace Protocol, effective tools, and internal current-run authority result.
- It records a bounded observation interval and rechecks critical identity/digests before output. Drift yields `BLOCKED / OBSERVATION_DRIFT`; timeout/unavailability is reported without polling or retry.
- Checks use `PASS`, `WARN`, and `BLOCKED`; overall status is the worst applicable result. Ungoverned is WARN. Invalid role or any missing/malformed/ambiguous/stale/mismatched mandatory governed fact is BLOCKED.
- Compatibility is capability-first. Reference versions are evidence, not blanket floors. Lower versions pass when required semantics are positively proven or attested; newer versions block when required behavior is absent or unprovable.
- Required observations include repository root and clean/dirty counts; Pi APIs and package provenance/collisions; live Paseo daemon/client, identity, cwd, typed workspace, parentage; unique adapter command/tool provenance and applied MCP configuration; role/profile and model-settings snapshots plus drift; requested/effective model and thinking; protocol schema/project/pin/digest; baseline/ceiling/requested/effective tool sets; and internal authority state/correlation.
- Supervisor/Lead require unique active adapter/Paseo capability. Peer and ungoverned sessions warn on adapter absence. Peer must lack outer MCP; every governed role must lack `mcp_script` and publication/deployment surfaces.
- Doctor emits one closed canonical `v1` report first, then a Human table derived from the same in-memory object. The report contains exact target, compatibility checks, deterministic ordered evidence, policy state, no-mutation assertion, bounded redaction, manual remediation, and explicit non-acceptance/non-sandbox limitations.
- TUI and RPC are the supported non-persistent output modes. Print/JSON performs no probes and explicitly fails `OUTPUT_CHANNEL_UNAVAILABLE`. Doctor never writes transcript/session output as a fallback and has no standalone executable or exit-code contract.
- The required public observer uses the already-loaded adapter/Paseo integration and fixed current agent ID to return daemon identity, agent/provider/status/parent/cwd/typed workspace, observed `runtimeInfo.model` and `runtimeInfo.thinkingOptionId`, joined workspace/project facts, resolvable parent evidence, and MCP-configuration attestation. It exposes no arbitrary target or mutation and creates no second client.
- Every non-PASS check names the responsible Human/operator/Lead/Supervisor and the smallest manual action. Mutating commands are marked but never run. Doctor never installs, edits, reloads, restarts, repairs, pushes, merges, deploys, or accepts.

### Installation, update, rollback, and release gate

- Production installation uses Pi's Git package support with the repository URL and a reviewed full immutable commit ID. Branches, tags, abbreviated IDs, and unpinned sources are development inputs and produce provenance warnings.
- Update means review a new full commit ID, reinstall that exact pin, start a fresh Pi/Paseo process, verify configured source/ref, managed checkout `HEAD`, extension digest, package provenance, doctor, and release smoke. Rollback repeats the flow with the prior accepted pin and changes package bytes only.
- `pi-mcp-adapter` is separately installed and never bundled, vendored, installed, updated, imported through private modules, or declared as a dependency. The release requires a public provenance-checkable current-agent observation capability; private-state scraping or silent downgrade is forbidden.
- No compatibility shim, updater, release channel, migration registry, OS support matrix, standalone doctor, repair command, example workspace, or generated runtime state is added.
- Release is blocked until fresh pinned installation and relocation succeed, all required Pi/Paseo/adapter capabilities are proven, doctor produces equivalent non-persistent TUI/RPC output, role settings apply exactly, the Notebook publication primitive passes concurrency/crash/durability/containment tests, hermetic tests pass, release smoke passes on the exact package commit, and mutation-boundary tests prove settings write only their one config file and Notebook writes only its narrow storage surface, with no project/package/Git/Paseo mutation.

## Testing Decisions

### Test philosophy and seam

- Tests assert external contracts rather than private helper structure: loaded package resources, registered extension/skill/commands/tools, effective tool behavior at agent-run and call-time boundaries, emitted canonical blocks, exact Git object eligibility, observable filesystem bytes, doctor events, and Paseo calls.
- The highest practical seam is one package-level Node standard-runner test entry point that loads the real extension against fake Pi contexts, fake public read-only Paseo observations, temporary Pi config roots, and temporary Git repositories. Lower-level parser or filesystem seams are used only where the same contract needs adversarial fixtures or crash-point control.
- No test framework, fixture service, daemon, compatibility harness, candidate database, or test-only runtime surface is added. Inline fixtures and standard Node facilities are sufficient.
- The repository has no implementation or existing tests, so there is no local prior-art suite to copy. Pi's manifest/extension contracts, public Paseo observer contract, Node's standard test runner, and official Git plumbing/porcelain behavior are the reference seams.

### Mandatory hermetic coverage

1. **Package and relocation:** exactly one extension and two skills (Workspace Protocol authoring plus the user-invoked live topology proof); profiles remain private; no prompt/theme/example; no adapter dependency or install script; fresh config roots, copied development roots, and unrelated cwd resolve resources; missing/empty/non-regular/symlink-escaped resources block.
2. **Settings, activation, and policy:** settings is available without a model in passive/governed/blocked states; cancel and invalid input preserve the prior file; one confirmed complete replacement is stored only at the effective Pi config path; all three roles resolve/apply exact model and thinking; missing/unavailable/clamped or file/runtime-drifted settings block. Also cover passive/invalid role, process-latched identity/profile snapshot, complete profile override, session reset, baseline intersection, required and forbidden surfaces, no tool re-enablement, guarded outer MCP targets/arguments, unauthorized edit/write/commit, and blocked publication/deployment routes.
3. **Strict contracts:** valid and adversarial fixtures for Task Authority Envelope, Workspace Protocol, Peer Report, Lead verdict, Local Acceptance, Notebook manifest, and Notebook entry. Unknown, duplicate, mistyped, misplaced, stale, mismatched, malformed, or unsupported-version data fails closed.
4. **Authority lifetime and scope:** no-envelope base, run-to-run revocation, route-bound Peer/Lead/recovery grants, tool unavailable behavior, protocol mismatch, candidate-base mismatch, normalized exact scope/exclusions, traversal/absolute/glob/ambiguous/symlink rejection, and no prose-based widening.
5. **Role behavior:** Supervisor path-guarded governance only; Lead tiny dual protocol/grant requirement and stop-on-growth; Peer no orchestration/report send; authoring skill unable to widen Lead/Peer capabilities.
6. **Git candidate:** clean start/end including untracked files, exact full IDs, parent and linear ancestry, one commit per run, current/cumulative scope, objective-relevance evidence seam, wrong base/merge/out-of-scope/unrelated residue rejection, local retrievability, frozen handoff drift, changed-candidate review invalidation, and no push/merge/amend effects.
7. **Review, verdict, and acceptance:** independence and neutral candidate binding; immutable review/findings; correction chain; stale review/verdict rejection; `NOT_READY` precedence, `NEEDS_HUMAN`, `READY`; direct Human route; candidate/verdict mismatch; and proof that lifecycle, tests, handoff, Reviewer approval, or READY alone never accepts.
8. **Reporting and orchestration:** exact child/parent/task/assignment correlation, exact configured Peer model/thinking transmission and observed-runtime match, report kinds/payloads, duplicate/mutation/supersession/staleness, no Peer Paseo send/retry, reserved-idle notification constraints, bounded inspection, assignment replacement triggers, one-writer ownership, and separate checkout requirement.
9. **Doctor:** equivalent canonical TUI/RPC object and table; no transcript/session write; zero probes in print/JSON; capability success independent of version comparison; provenance collisions, missing tools, absent MCP attestation, unreachable/mismatched bindings, parent rules, role-settings/model/thinking/profile/protocol/tool/authority drift, observation drift, bounded redaction, deterministic ordering, advisory remediation, and no mutation.
10. **Notebook initialization/append:** explicit/default config root; create-once manifest; same/different collision; concurrent initialization and distinct appends; same-ID idempotency/conflict; crash points before/after publish; orphan non-promotion; immutable correction/supersession; corrupt manifest blocking; corrupt entry preservation with unrelated append; move/copy/rebind mismatch; direct-child filename validation; canonical containment; traversal/symlink rejection; private permissions; unsupported durability semantics; no overwrite/repair/sweep.
11. **Mutation boundary:** byte-for-byte spies prove doctor writes nothing, settings writes only its exact config file after confirmation, and Notebook operations write only expected config-root directories, private staging, immutable manifest, and immutable entry. Project, package, Git, Paseo, and doctor transcript/session state remain unchanged.
12. **Stress scenarios:** cover every fail-closed outcome specified above, including dirty Human checkout, missing commit authority, notification replacement, lost report, stale assignment, unavailable original writer, protocol material drift, false premise, unresolved dependency, Human decision during a run, copied Notebook, and attempted second-control-plane behavior.

### Release smoke

- Run against the exact package commit proposed for release using fresh temporary Pi config and project directories and a clean Git repository containing a valid Workspace Protocol.
- Install the package by full commit ID and the adapter independently; prove configured source/ref, managed checkout `HEAD`, resource paths, clean package resources, extension digest, and provenance all identify that pin.
- Use the settings command to confirm one complete three-role model/thinking document, then create exact Paseo project/workspace bindings and fresh Supervisor, Lead, and Peer sessions; Peer has the exact live Lead parent and every process reports the configured effective model/thinking.
- Invoke doctor over RPC without a model invocation in all roles and require canonical non-persistent PASS reports for repository/protocol, live agent/workspace/parent, model settings, MCP-configuration, package/adapter provenance, and effective tool facts.
- Prove Supervisor alone exposes Notebook append, Peer lacks outer MCP, all roles lack `mcp_script`, and doctor changes no project, package, Git, session/transcript, or Paseo state.
- When a prior accepted pin exists, verify update and rollback through fresh processes and exact source/ref/HEAD/digest/doctor checks. Retain exact commands and bounded output as release evidence outside package and Paseo runtime state.
- Notebook append behavior itself is exercised hermetically through the real registered handler; release smoke does not add a model call or test-only tool/command.

## Out of Scope

- Compatibility, migration, or shared schemas with `Minnyat/paseo-pi-team`.
- Multi-host routing, cross-host candidate transport, or multi-host Notebook synchronization.
- Workspace-snapshot candidates; v0.1 accepts Git commit candidates only.
- Push, pull-request creation, merge, deploy, package publication, or external side-effect workflows.
- Browser automation, OCR, watchdogs, heartbeats, polling loops, custom model-routing classes, task-specific or automatic model routing, active-process model hot switching, or legacy-install cleanup.
- A second task/session/candidate/acceptance database, scheduler, queue, daemon, mailbox, delivery receipt, report registry, or orchestration runtime.
- A standalone doctor executable, print/JSON doctor support, persisted doctor reports, repair mode, or doctor exit-code wrapper.
- Automatic package update, migration, release channels, platform/version compatibility shims, or an OS support matrix.
- General Supervisor filesystem tools, project-code editing, architecture ownership, candidate acceptance, automatic remediation, archival, cleanup, or Notebook repair.
- Automatic workspace/worktree/branch/ref deletion, Git garbage collection, indefinite candidate retention, or Paseo workspace archival.
- Cryptographic Human, role, environment, provider, profile, protocol, or agent authentication.
- Filesystem, process, network, Git, identity, or hostile-TOCTOU isolation. Those require OS/container/worktree controls outside this package.
- Semantic proof that a Human-authored profile conforms to reference orchestration model, that protocol prose is wise, that a Lead task is truly tiny, or that objective relevance and subjective residual risk are correct.
- npm publication in v0.1.

## Further Notes

- The reference orchestration model deep dive remains normative when prose in the provisional plan differs. The resolved map decisions represented here define the v0.1 implementation contract.
- Reference runtime versions observed during planning were Pi `0.84.1`, Paseo `0.3.1`, and `pi-mcp-adapter` `2.22.0`; implementation and doctor use proven capabilities and attested semantics rather than optimistic version gates.
- Git object identity, stable porcelain status, committed-tree comparison, and possible garbage collection of unreachable objects justify repeated full-ID, cleanliness, diff, and retrievability checks. They do not create authority or acceptance.
- Human routes, environment values, process snapshots, file digests, and Paseo facts are consistency evidence, not cryptographic identity.
- If the required public read-only Paseo observer or create-only durable Notebook publication semantics are unavailable, the correct v0.1 outcome is not a fallback: release remains blocked.
