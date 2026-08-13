# Define package distribution and verification

Type: grilling
Status: resolved
Blocked by: 04, 05, 06, 07, 08, 09, 10, 13

## Question

What package resources, Git install/pinning contract, portability rules, examples, and smallest executable test suite must the final v0.1 specification require to prove the decided behavior without speculative modules or compatibility scaffolding? This includes choosing supported read-only Paseo observation and non-persistent Pi output seams for doctor, preserving its TUI/RPC boundary unless a separately justified headless surface is required, and avoiding private adapter internals or a second runtime. It also includes the smallest package-owned Supervisor Notebook append resource and tests for Pi-config-root resolution, create-only concurrent publication, immutable correction/corruption handling, symlink/traversal containment, and absence of writes to project, package, or Paseo state.

## Answer

### Distribution unit and minimum installed surface

v0.1 is one independent Git-installable Pi package. It runs only inside Pi and adds no executable, daemon, sidecar, queue, mailbox, ledger, database, acceptance service, second MCP client, or second runtime.

Its committed distribution surface is:

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

`package.json` explicitly declares exactly one Pi extension and one Pi skill and exposes a `test` script using Node's standard test runner. It has no install lifecycle scripts. Runtime dependencies are allowed only when production code actually imports them. `pi-mcp-adapter` is absent from every dependency field.

The three profiles are private package data loaded only by the extension; they are not Pi prompts, skills, or independently discoverable resources. The package declares no prompts, themes, or examples. README snippets cover the three Paseo provider aliases, Git install/update/rollback, the independent adapter prerequisite, doctor invocation, and the release smoke recipe; no example workspace is installed.

The Workspace Protocol skill is globally discoverable because it is an ordinary Pi package skill. Discovery grants no role, tool, write authority, or permission to read the repository protocol. Its procedure is intended for Supervisor; governed Lead and Peer policy still blocks protocol authoring, and tests prove that invoking or quoting the skill cannot widen their effective surface.

One extension owns the already-decided activation, policy, authority, protocol, reporting, candidate, doctor, and Notebook seams. No additional package or extension module is required by this distribution contract.

### Package discovery and package-root rules

Pi package discovery through the explicit `package.json` manifest is authoritative. Convention-directory discovery is not relied upon for the extension or skill.

The loaded extension derives its package root from its own canonical module/package provenance. Every bundled profile path is resolved relative to that root. The implementation must not discover package resources relative to `cwd`, the repository root, the Pi config root, a Paseo workspace, or an arbitrary parent-directory walk.

For every package-owned resource, resolution must canonicalize the package root and candidate, require the candidate to remain a direct expected descendant, and require the exact readable nonempty regular file without a symlink escape. The complete-directory Human profile override remains the only alternate profile root.

Relocation means installing the same pin under a second fresh Pi config root, or loading a copied development checkout from another absolute root in a fresh process. It does not mean manually moving a Pi-managed checkout. Resource resolution must pass from an unrelated cwd in either case.

Runtime state, Notebook data, generated profiles, caches, and verification evidence are never written into the package checkout.

### Git install, pin, update, and rollback

The production install form is:

```text
pi install git:<repository-url>@<full-commit-object-id>
```

The ref is the full immutable commit object ID reviewed by the Human. Branches, moving tags, abbreviated IDs, and unpinned Git sources are not the production contract. Local or unpinned sources remain development inputs and doctor reports their provenance warning; they do not cause compatibility code.

A pinned source does not advance by running a generic update against the same pin. Updating means:

1. review a new full commit object ID;
2. run `pi install` again with the same repository identity and the new full pin;
3. stop the old Pi/Paseo-owned process and start a fresh one;
4. verify the configured source/ref, managed checkout `HEAD`, loaded extension digest, and package provenance all identify the new pin;
5. run doctor and the release smoke before governed work.

Rollback repeats the flow with the previously accepted full commit object ID and a fresh process. It rolls back package selection and bytes only; it never rolls back project, Paseo, session, or Notebook state.

The package adds no updater, release channel, migration registry, or background check. Pi alone owns package settings and checkout reconciliation. The package never describes reinstalling one pin as a stronger idempotency guarantee than the resulting exact source/ref, checkout `HEAD`, and loaded digest observations.

### Independent adapter and runtime assumptions

`pi-mcp-adapter` remains a separately installed Pi package prerequisite. This package does not bundle, vendor, install, update, import private adapter modules, or declare it as a transitive dependency. Doctor proves the expected loaded adapter provenance, active outer tool where required, Paseo MCP-configuration attestation, and successful exact read-only observation through public capabilities.

Compatibility is capability-only. Version strings may be reported as evidence, but no numeric version gate, compatibility matrix, range shim, or “newer is safe” rule changes status. If every mandatory Pi, Paseo, adapter, Git, and filesystem capability is positively available with the required provenance and behavior, the applicable check passes. A missing or unprovable mandatory capability blocks regardless of a displayed version.

The package declares no separate operating-system support matrix. It uses runtime path/file/process APIs and tests the exact capabilities it needs. Filesystem class or platform name is never a PASS substitute. Unsupported create-only, durability, or canonical containment/no-symlink semantics fail closed; there is no overwrite, partial-write, or compatibility fallback.

### Doctor observation and output seam

Doctor remains the deterministic extension command already specified. TUI and RPC are the only supported output modes:

- TUI emits one non-persistent command report and its Human table.
- RPC emits the same canonical object through extension UI events and is the headless/automation surface.
- Print/JSON modes perform no probes and fail explicitly with `OUTPUT_CHANNEL_UNAVAILABLE`.

No standalone doctor executable, transcript message, session entry, persisted report, exit-code wrapper, or alternate renderer is added in v0.1.

The selected live Paseo seam is one public in-process read-only observer provided by the already-loaded adapter/Paseo launch integration. It accepts only the expected current `PASEO_AGENT_ID` and a bounded cancellation/timeout signal. It returns the responding daemon identity plus the exact current agent's ID, status, provider, parent ID, cwd, typed workspace ID, and the joined workspace's ID, project ID, cwd, kind, isolation, and lifecycle status. When a parent ID exists, the observer also resolves it internally and returns whether that exact non-self parent exists as one live/stored agent plus its bounded identity/status evidence. It also attests that the Paseo MCP configuration was applied to this Pi process.

The observer uses the adapter's already-configured connection. It exposes no arbitrary caller-selected server, tool, agent, workspace, or mutation target; the current agent's typed workspace and parent joins are fixed parts of the one observation. It invokes no model and creates no second client/runtime. The orchestration package verifies the observer's public provenance and final identity match. Environment variables, process existence, adapter load, names, or cwd joining alone are insufficient.

This observer is a release prerequisite, not compatibility scaffolding. The current package must not scrape private adapter state or silently downgrade. Until the independent prerequisite exposes this public capability and the release smoke passes it, v0.1 is not releasable.

Doctor status is driven by successful capability and behavior probes, not component versions. Uniquely attributable required tools being registered, active where required, and callable on the exact current Paseo path is sufficient; doctor does not compare release versions to decide PASS.

### Minimum package-owned Notebook resources

The extension registers exactly two narrow Supervisor-owned surfaces required by the Notebook contract:

1. one Human-invoked initialization command for create-once manifest creation after explicit confirmation;
2. one typed `supervisor_notebook_append` tool for ordinary causal append after valid initialization.

Neither surface accepts a filesystem path. Inputs are contract fields only. The implementation derives the config root, project key, exact Notebook path, and exact direct-child filename; validates role, activation, protocol/Notebook identity, schema, canonical JSON, digest, containment, and current binding; and performs only the allowed create-once operation. `entry_id` must satisfy the schema's one-filename-component form; separators, dot components, NUL, normalization aliases, and an incorrect final parent are rejected. The append tool is absent from Lead, Peer, passive, and blocked effective surfaces.

The effective Pi config root is re-resolved for every operation from `PI_CODING_AGENT_DIR` when configured, otherwise Pi's per-user default. The storage path and schema remain exactly those defined by the Notebook contract. No project, package, Paseo, transcript, or session path is a fallback.

Both immutable `manifest.json` initialization and entry append use one Human-approved package-private publication primitive under the same Pi-config-root filesystem:

1. create one private exclusive staging file under `<storage-root>/.staging/` with no caller-controlled path;
2. write and sync the complete canonical bytes, then close it;
3. atomically hard-link that inode to the absent exact final manifest or entry path;
4. sync the final parent directory;
5. unlink the staging name and sync `.staging/` before reporting clean success.

The final file has one link after cleanup. This is the only internal staging/link exception to the Notebook's physical write surface. It does not expose hard-link, unlink, source path, destination path, or generic filesystem authority to Supervisor. Symlinks, rename-overwrite, and writing partial bytes directly to the final name remain forbidden. If the host cannot provide exclusive staging, same-filesystem atomic no-replace link, file sync, directory sync, and canonical containment/no-symlink checks, the operation fails closed; there is no native helper, weaker fallback, or platform/version branch.

Immediately before every filesystem action, the implementation canonicalizes the effective config/storage/final parents, rejects every symlink component below the canonical config root, and requires the final parent to be exact; it re-observes those facts and the final file after publication. Initialization durably syncs each newly created directory and parent. On an existing final path, same canonical bytes/digest causes a parent sync and idempotent success; different bytes/digest is a conflict and existing bytes remain untouched. After a post-link error, the operation re-observes the final path and reports committed, conflict, failed, or indeterminate; it never deletes or replaces the final file. These recognizable checks are the existing cooperative path guard, not protection against a hostile process swapping directories between syscalls and not a filesystem sandbox.

A crash may leave only a private staging orphan. It is not Notebook evidence, is never promoted or interpreted as an entry, and is not removed by an automatic sweeper; Human cleanup is advisory. Distinct entry IDs can publish concurrently. A malformed/corrupt manifest blocks every write. A malformed/corrupt entry is preserved, reported, and included only in the physical snapshot; when the manifest and anchored path remain valid, it does not block an unrelated new append and is never repaired or replaced. Corrections, supersessions, and Human-confirmed moves are new complete entries. Copy/membership mismatch stops writes until the Human route defined by the Notebook contract is satisfied.

Initialization and append request private per-user permissions for storage, staging, manifest, and entries where the host supports them, verify the resulting modes/capability, and fail closed when the supported host cannot provide the required privacy. They never chmod existing Human-owned content.

### Smallest executable verification suite

The package uses one committed Node standard-runner entry point, `test/package.test.mjs`. It may use inline fixtures, temporary directories, temporary Git repositories, fake Pi contexts, and fake read-only Paseo responses. No test framework, fixture service, daemon, candidate database, or compatibility harness is required.

The mandatory hermetic suite proves:

1. **Package/discovery:** the manifest discovers exactly one extension and one skill; profiles remain private; no prompt/theme/example is exposed; the adapter is absent from dependencies; no install lifecycle script exists; fresh-root relocation and unrelated cwd preserve resource resolution; missing, empty, non-regular, or symlink-escaped resources fail closed.
2. **Activation and policy:** table-driven cases cover the closed roles, passive/invalid states, immutable process snapshot, complete profile override, session baseline intersection, per-run authority reset, required/forbidden tools, and no Human-disabled tool re-enablement. Call-time tests reject malformed/unknown inner `mcp` targets and arguments; well-formed but role-forbidden targets such as permission response, workspace archival, or Supervisor agent creation without the exact recovery grant; unauthorized edit/write/commit; and every push/merge/amend/PR/deploy route. The globally discoverable authoring skill grants no Lead/Peer authority.
3. **Strict contracts:** canonical valid/invalid fixtures cover Task Authority Envelopes, Workspace Protocol, Peer report, Lead verdict/local acceptance, and Notebook manifest/entry schemas and digests. Unknown, duplicate, mistyped, stale, or identity-mismatched data fails closed.
4. **Git candidate:** temporary repositories prove clean start/end, exact parent and linear ancestry from the accepted base, cumulative scope, full immutable identity, local retrievability, wrong-base and merge-candidate rejection, post-HANDOFF drift invalidation, and no push/merge/amend side effect.
5. **Doctor:** fake TUI and RPC contexts emit the same bounded report without a transcript/session write; print/JSON performs zero probes; capability/provenance success passes without version comparison; missing or ambiguous provenance, inactive required tools, absent MCP-configuration attestation, unreachable/mismatched live binding, observation drift, or attempted mutation blocks; remediation remains advisory.
6. **Notebook initialization and append:** explicit/default Pi-config-root resolution; concurrent create-once initialization; same/different manifest collision; staged-link crash points before and after publication; staging orphan non-promotion; concurrent distinct entry appends; same-ID idempotency/conflict and durability; immutable corrections; corrupt-manifest write blocking; corrupt-entry preservation plus successful unrelated append; move/copy/rebind and membership mismatch; direct-child validation; canonical containment and symlink/traversal rejection; the explicit cooperative TOCTOU limitation; private per-user permissions where supported; unsupported publication semantics; and no automatic repair or staging sweep.
7. **Mutation boundary:** filesystem and fake-control-plane spies prove doctor writes nothing and Notebook operations write only the exact config-root initialization, package-private staging, manifest, and final-entry paths. Project files, package files, Git state, and Paseo state remain byte-for-byte unchanged. Pi transcript/session immutability is required for doctor; ordinary model tool-call recording is not misrepresented as a Notebook or Paseo mutation.

The Notebook handler is invoked directly through its registered fake Pi tool context in hermetic tests; RPC has no direct custom-tool execution path, so the release smoke does not add a test-only command or pretend to invoke that tool without a model.

One release smoke recipe is required for the package commit being published:

1. use fresh temporary Pi config and project directories; initialize a Git repository, create one valid repository-root Workspace Protocol fixture, and commit that clean baseline;
2. install the package by full Git commit pin and install `pi-mcp-adapter` independently;
3. verify configured source/ref, checkout `HEAD`, clean tracked package resources, manifest resource paths, and loaded extension digest identify that exact pin;
4. create the exact Paseo project/workspace binding, then launch fresh governed sessions with the three role aliases; launch Peer with the exact live Lead as its resolvable parent;
5. invoke doctor over RPC in each session and verify the canonical non-persistent PASS report, repository/protocol facts, public live Paseo self/workspace/parent binding, MCP-configuration attestation, package/adapter provenance, and role-effective tools;
6. verify Supervisor alone has the Notebook append tool, Peer lacks outer `mcp`, every governed role lacks `mcp_script`, and doctor changed no project, package, Git, session/transcript, or Paseo state;
7. when a prior accepted pin exists, stop the old process, repin to the reviewed new commit, start a fresh process, verify source/ref/`HEAD`/loaded digest and doctor, then repeat with the old pin to prove rollback of package bytes only.

The smoke invokes no model. Notebook append behavior and its mutation boundary are proven hermetically through the real registered handler rather than a second runtime surface. The smoke may be manual or release-automation driven; it is not part of ordinary hermetic CI. Exact pins, commands, and bounded outputs are retained as release evidence outside package/Paseo runtime state.

### Explicit exclusions and release gate

v0.1 ships no compatibility scaffolding, version gate, OS/install-scope matrix, auto-update, package migration, standalone doctor CLI, example workspace, prompt template, general Notebook filesystem tool, general Paseo client, repair command, acceptance service, or persistence beyond the already-defined Supervisor Notebook.

Distribution is ready only when:

- exact manifest resources load from a fresh full-commit Git install;
- the independent adapter is uniquely loaded and all role-required capabilities are proven;
- doctor can perform the bounded live Paseo observation through the public in-process read-only observer and emit equivalent non-persistent TUI/RPC output;
- the approved internal staged-link primitive passes the manifest/entry concurrency, crash, durability, cleanup, canonical-containment, and symlink/traversal tests without exposing a general filesystem operation or claiming sandbox-grade TOCTOU protection;
- the hermetic suite passes;
- the release smoke passes on the commit being published;
- tests prove doctor/Notebook operations do not write project, package, Git, or Paseo state.

No glossary or ADR update is required. Package layout, installation mechanics, and verification evidence are implementation/distribution terms; they add no domain concept or unresolved architecture choice beyond the existing contracts.

## Comments

### 2026-08-13 — superseded Git-only distribution decision

The Human selected public npm distribution so installation matches other Pi packages. `pi-paseo-orchestration` is now a versioned public npm package with a closed runtime `files` allowlist. The public convenience form is `pi install npm:pi-paseo-orchestration`; governed reproducible use pins `npm:pi-paseo-orchestration@<exact-version>`. Versioned sources remain pinned during Pi package updates; update and rollback install another reviewed exact version in a fresh process.

Release evidence now binds the npm package name/version, packed file set, tarball integrity, installed manifest/resource digests, and loaded extension digest. Hermetic verification runs `npm pack --dry-run`; release smoke packs and installs the candidate tarball in a fresh root; final release still requires a fresh exact-version Pi install plus the existing live Paseo/adapter evidence. The Git-only answer above remains historical context and is superseded by the npm distribution contract in the v0.1 spec.

Publishing this Pi package does not add project-result publication: push, pull request, merge, and deploy remain absent.
