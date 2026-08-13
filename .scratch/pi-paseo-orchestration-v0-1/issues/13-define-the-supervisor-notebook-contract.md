# Define the Supervisor notebook contract

Type: grilling
Status: resolved
Blocked by: 05

## Question

What exact durable location, ownership key, causal entry contract, lifecycle/retention rule, and path-guarded write surface lets a Supervisor preserve reference orchestration notebook evidence across assigned projects without conflating it with a repository Workspace Protocol or gaining general project-write authority?

## Answer

## Boundary, location, and ownership

The Supervisor Notebook is a Human-owned, project-scoped, append-only causal evidence store. It preserves governance observations across Supervisor processes and Pi sessions. It does not govern the project.

The effective storage root is:

```text
<pi-config-dir>/pi-paseo-orchestration/supervisor-notebooks/v1/
```

`<pi-config-dir>` is the canonical effective Pi configuration directory: `PI_CODING_AGENT_DIR` when configured, otherwise Pi's documented per-user default. A project's notebook is:

```text
<storage-root>/projects/<project-key>/
  manifest.json
  entries/
    <entry-id>.json
```

`project-key` is lowercase SHA-256 of the exact UTF-8 Workspace Protocol `project_id`; the Human-provided ID is stored inside the manifest but is never used as a path component. The storage root and every component below it are canonicalized and checked before every operation.

The notebook does not live:

- in the repository, because `.orchestration/workspace-protocol.md` is the repository contract while the notebook is cross-session historical evidence, and repository placement would add a project-write surface;
- in the installed package, because package resources are code/resources and package reconciliation may replace their checkout;
- under Paseo state, because Paseo alone owns lifecycle/workspace state and the package must not write a parallel record into its control-plane store.

There is one notebook per Human-defined protocol project identity. The Human owns creation, archival, and deletion policy. Supervisor agent IDs are writers, not owners. Multiple workspaces and replacement Supervisors for the same project append to the same notebook.

## Identity model

The contract keeps these namespaces separate:

- `protocol_project_id`: durable Human-defined project identity from the current valid Workspace Protocol;
- `paseo_project_id`: exact host-local Paseo project membership bound by the Human; it is distinct from `protocol_project_id`;
- `repository_root`: canonical root observed at the time of the entry; it is a locator, not durable identity;
- `paseo_workspace_id`: exact Paseo workspace identity observed for the event; multiple workspace IDs and checkout roots may belong to one bound Paseo project;
- `lead_agent_id`: exact Paseo Lead identity observed for the event, or an explicit `absent`/`unknown` state;
- `supervisor_agent_id`: exact Paseo identity of the writer;
- `pi_session_id`: Pi session correlation for the write, not project, Supervisor, or authority identity.

`cwd`, title, branch, provider alias, remote, session file path, or process ID never substitutes for these fields. Repository path, Git common/main root, worktree facts, and remote are supporting locators/evidence only. The Human-confirmed binding between `protocol_project_id` and one current `paseo_project_id` does not equate the namespaces; it only says which current Paseo project is being observed for this notebook.

A different workspace path is valid when exact Paseo membership and checkout facts show another workspace of the bound project. A different Paseo project ID, or checkout facts that cannot establish membership in the bound project, is a mismatch rather than an automatic move. Writing stops until the Human classifies it as a move or copy. A confirmed move keeps `protocol_project_id` and `notebook_id` and appends a complete causal rebind entry containing old/new Paseo project and repository locator evidence; later entries reference that rebind. A copy requires Human review/reset of the copied Workspace Protocol identity and a new notebook identity; the old notebook remains untouched.

## Notebook and entry identity, version, schema, and digest

`manifest.json` is create-once and immutable. It contains exactly:

- `contract: "pi-paseo-supervisor-notebook"`;
- `contract_version: "v1"`;
- `manifest_schema: "v1"`;
- opaque `notebook_id`;
- exact `protocol_project_id`;
- Human-confirmed `paseo_project_id_at_creation` and `repository_root_at_creation` as the initial local binding/locator;
- derived `project_key`;
- `created_at`;
- `created_by.supervisor_agent_id` and `created_by.pi_session_id`;
- `creation_route: "human_confirmed"`;
- `manifest_digest: "sha256:<hex>"`, computed over canonical JSON with the digest field omitted.

Unknown, missing, duplicate, or mistyped fields make the manifest malformed. Human confirmation is an auditable route, not cryptographic authorship.

Each entry is one closed canonical JSON object with:

- `contract: "pi-paseo-supervisor-notebook-entry"`;
- `schema_version: "v1"`;
- opaque `entry_id`;
- exact `notebook_id` and `protocol_project_id`;
- `recorded_at` and `observed_at` RFC3339 timestamps;
- `writer`: exact `supervisor_agent_id` and `pi_session_id`;
- `context`: exact current `paseo_project_id`, canonical `repository_root`, exact Paseo workspace identity or explicit unknown, exact Lead identity or explicit absent/unknown, the current binding source (`manifest` or a Human-confirmed rebind entry ID), and any pinned protocol version/digest relevant to the observation;
- `observation`;
- nonempty `evidence`;
- `suspected_mechanism`, explicitly marked as a hypothesis with confidence/uncertainty;
- `impact`;
- `question` for the Lead or Human;
- `recommendation`;
- `escalation`: `needed`, intended owner (`lead | human | none`), reason, and exact relay target when one is known;
- `history`: `relation` (`original | correction | supersession`), referenced `(entry_id, entry_digest)` pairs, and reason;
- `sensitivity`: redactions performed and `contains_secret: false`;
- `entry_digest: "sha256:<hex>"`, computed over canonical JSON with the digest field omitted.

An evidence item contains a stable local item ID, observation time, evidence kind, bounded source locator, selected redacted facts or excerpt, an optional source-content digest when safe, a digest of the retained redacted representation, and explicit redaction/truncation notes. It never carries a whole prompt, transcript, environment, profile, protocol, credential-bearing config, or arbitrary command/MCP payload.

A notebook snapshot digest is SHA-256 over the exact manifest file digest plus the sorted sequence of `(relative entry filename, raw file SHA-256)` for every regular file directly under `entries/`, including invalid files. It identifies one observed physical snapshot only. It is not notebook identity, ordering, freshness, authority, or acceptance.

## Append, correction, supersession, and evidence semantics

Append means publishing one new entry file with create-only/no-replace semantics. Existing manifest and entry bytes are never edited, truncated, replaced, normalized, or deleted by Supervisor behavior.

A correction or supersession is a complete new causal entry. It references the old entry ID/digest, states why the old interpretation is wrong or incomplete, repeats the corrected causal fields, and preserves the old file. A patch that removes old evidence is invalid. Readers show the full chain; they may derive a latest interpretation, but never erase the prior observation.

Notebook entries are historical evidence, not current state. Any recommendation, recovery, protocol/profile proposal, or relay that depends on a current fact must re-observe that fact through supported live/file evidence. There is no fixed freshness TTL and no latest-write-wins truth rule.

## Concurrent writers

The notebook has no mutable sequence counter, index, lock ledger, queue, or writer daemon. Concurrent Supervisors publish independent immutable entry files through one create-only atomic publish primitive.

- Different entry IDs may succeed concurrently.
- The same entry ID and same canonical digest is an idempotent duplicate; the second publish changes nothing.
- The same entry ID with different content is a conflict; the existing bytes remain untouched, the new publish fails, and the conflict is relayed with both digests. The writer must use a new entry ID for any later conflict observation.
- Ordering by timestamps/ID is presentation only. Causality comes from explicit references.

The implementation must prove create-only publication and concurrent conflict behavior on every supported platform, but package and test distribution remain outside this contract.

## Missing, malformed, corrupt, stale, and copied notebooks

- Missing project notebook: no evidence exists at the expected location. Supervisor asks the Human once before creating a new manifest; it never silently recreates history.
- Unreadable root or manifest: report the exact failure, perform no notebook write, and continue only live observation/relay that does not rely on notebook history.
- Malformed manifest, notebook/project/key mismatch, duplicate notebook ID under another project key, or unsafe path: fail closed for all notebook writes; preserve bytes and ask the Human.
- Malformed entry or digest mismatch: preserve the raw file and include it in the physical notebook digest; exclude it from the valid causal projection; report degradation. If the manifest and path boundary remain valid, independent new create-only entries may still be appended, but no correction may overwrite the bad file.
- Stale entry: retain it as historical causal evidence; do not use it as current project, task, lifecycle, authority, or acceptance state without fresh observation.
- Known or suspected copy, changed Paseo project ID, or checkout outside the bound project's observed membership: stop writes. Human classifies move versus copy. Move appends a confirmed rebind entry; copy uses reviewed/reset project identity and a new notebook.

No automatic repair, quarantine move, import, merge, deduplication, or split-brain reconciliation runs.

## Lifecycle

The notebook survives Pi restart, `/resume`, compaction, process replacement, and Paseo runtime closure because it is outside the Pi session and package checkout. Every new write re-resolves the effective Pi config root and revalidates manifest/project/repository/workspace/Lead facts.

Resuming the same Paseo Supervisor may retain its Paseo agent ID while Pi process/session correlation changes; new entries record the currently observed IDs. A replacement Supervisor writes the same project notebook under its new writer ID after validating the project binding. No notebook record transfers role or recovery authority.

Lead recovery/replacement appends evidence naming old and new Lead IDs and handoff facts. It never rewrites old entries, changes Paseo parentage/lifecycle, proves the replacement role, or accepts prior work.

A project move follows the Human-confirmed rebind rule and may bind the notebook to the new exact Paseo project ID while preserving prior binding evidence. A project copy requires a new reviewed protocol and notebook identity. A byte-for-byte copied environment that preserves all identifiers and locators cannot be distinguished cryptographically in v0.1; this is an explicit cooperative limit, not permission to infer identity.

## Retention, archival, cleanup, and sensitive data

There is no automatic TTL, truncation, rotation, archive schedule, or deletion. Supervisor may report count/size and recommend an archive, but only the Human performs archival or cleanup.

Archival preserves the whole manifest, every entry byte, and the pre-archive notebook snapshot digest as one Human-owned unit outside the active project path. Cleanup is Human-only and must not run while an active investigation, recovery, protocol/profile proposal, or unresolved correction still references the evidence. The package never treats deletion as task completion or acceptance.

Files/directories use private per-user permissions where the platform supports them. Notebook content must contain no credentials, tokens, cookies, private keys, complete environment dumps, Role Profile contents, raw full prompts/transcripts, or unredacted sensitive command/MCP payloads. Store a bounded redacted excerpt or selected fact plus a safe digest/pointer. Do not hash a low-entropy secret as a substitute for redaction. If useful evidence cannot be retained safely, record that it was withheld and why.

## Exact Supervisor write surface

The notebook write surface is one package-owned append operation, plus Human-confirmed create-once initialization when the notebook is absent. After valid initialization, an ordinary causal append is part of the Supervisor's base path-guarded governance surface and needs no per-entry ceremony; it grants no authority. Rebinding, archival, and cleanup remain Human-owned. For Supervisor:

- allowed: create the exact deterministic project directory/immutable manifest during confirmed initialization; create one new regular entry file directly under its exact `entries/` directory;
- denied: general built-in `write`/`edit` against notebook files; overwrite, truncate, delete, rename, move, chmod, symlink, hard-link, recursive copy, archive, or repair; every path outside the exact notebook root; every project/repository code path;
- separately governed: the exact Human-confirmed Workspace Protocol authoring workflow already defined elsewhere. Notebook authority never widens that workflow.

Before every operation, canonicalize the Pi config root, require the notebook root to remain beneath it, reject absolute user-supplied paths, `..`, globs, ambiguous prefixes, and every symlink component below the canonical config root, and use create-only publication. Unknown Human-owned files are preserved and never overwritten.

Supervisor retains Bash under the existing cooperative Policy Guardrail. Recognizable shell writes outside the allowed governance surfaces are blocked, but shell indirection can bypass those checks. This contract is not filesystem/process/Git isolation and never describes the path guard as a sandbox or authentication boundary.

## Proposal, relay, and remediation boundary

An entry may recommend a Workspace Protocol or Role Profile change and name the exact observed target version/digest. That recommendation is only evidence for a separate proposal:

1. re-observe the current target;
2. prepare an exact diff;
3. present evidence, trade-offs, and affected future work;
4. obtain direct Human confirmation;
5. use only the already-authorized protocol/profile workflow.

The notebook never edits protocol/profile files, changes a running task's pin, grants authority, or applies policy automatically. A Human decision may be relayed to the exact Lead through Paseo only under the existing relay rules; the notebook is not the transport or receipt.

Remediation is advisory. Supervisor and notebook tooling never install/update packages, edit config, restart/reload lifecycle, create arbitrary agents, push, merge, amend, deploy, accept a candidate, mutate project state, or execute a recommendation. Recovery remains separately Human-granted and exact-targeted.

## Explicit non-authority semantics

The notebook is not:

- a source of Role Profile, Task Authority Envelope, capability, assignment, acceptance, or Local Acceptance;
- task state, lifecycle truth, current project state, a candidate database, or a status ledger;
- a mailbox, queue, scheduler, daemon, retry service, notification receipt, or control plane;
- permission for Supervisor to edit project code, direct a Peer, issue an architecture verdict, or accept work.

Paseo remains the sole lifecycle/workspace/parentage control plane. Live Paseo and repository facts remain the sources for current observation. A notebook field named `impact`, `recommendation`, or `escalation` has no execution effect.

## Stress-test outcomes

1. One Supervisor observes many projects: writes route by exact protocol project ID into separate notebooks; no cwd-only routing.
2. Many workspaces belong to one project: one notebook; each entry records exact Paseo project/workspace IDs and checkout locator; a path difference alone does not split the notebook.
3. Repository moves: changed project membership or unexplained checkout lineage stops writes until a Human-confirmed rebind entry; durable protocol/notebook identity remains.
4. Repository is copied: copied protocol identity is reviewed/reset and a new notebook is created; old evidence is not reused as current state.
5. Workspace/project mismatch: reject append and relay mismatch; do not infer from cwd.
6. Lead recovery/replacement: retain old/new exact Lead IDs and handoff evidence; notebook grants no recovery or acceptance.
7. Two Supervisors write concurrently: distinct create-only entries both survive; there is no global counter or last-write-wins.
8. Duplicate entry ID: same digest is no-op; different digest is conflict and preserves existing bytes.
9. Correction would remove evidence: reject overwrite/patch; append full correction and preserve original.
10. Notebook missing/unreadable/malformed/corrupt: ask once before new creation; otherwise preserve, report, and fail notebook writes as scoped above; live observation may continue.
11. Symlink/path traversal: canonical containment and no-symlink checks reject the write; no fallback path.
12. Secret or raw sensitive prompt appears: withhold/redact it; retain only bounded safe evidence and redaction metadata.
13. Human-owned content would be overwritten: create-only conflict; existing bytes win and no mutation occurs.
14. Stale observation is used as current state: invalid use; re-observe before action/proposal/relay.
15. Notebook is cited as authority/acceptance: reject; it is historical evidence only.
16. Notebook is used as task ledger/mailbox/control plane: reject; no corresponding state or runtime exists.
17. Supervisor tries to use path guard to edit project code: reject path; retained Bash limitation remains explicit rather than permission.
18. Protocol/profile is changed automatically from a recommendation: reject; exact diff and Human confirmation are separate.
19. Cleanup would delete still-referenced evidence: do not delete; Human resolves references first.
20. Remediation tries to install, push, merge, or mutate state: reject; emit manual advisory only.

## Residual assumptions and downstream seam

- Effective Pi config directory resolution and per-user private filesystem permissions remain available.
- Supported filesystems can provide a create-only/no-replace publication primitive with crash-safe complete-entry visibility. The implementation and executable portability tests belong to package distribution/verification work and may not weaken these semantics.
- Human confirmation, environment values, file ownership, and agent labels are cooperative evidence, not cryptographic identity.
- Exact remote/copy provenance is not universally available. Unknown locator/identity changes therefore stop for Human classification rather than being guessed.
- Multi-host notebook synchronization and transport are out of scope.
- The exact package resource layout, Git install/pinning, command/test distribution, and headless test surface remain unresolved here.
