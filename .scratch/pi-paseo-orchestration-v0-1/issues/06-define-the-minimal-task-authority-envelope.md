# Define the minimal task authority envelope

Type: grilling
Status: resolved
Blocked by: 02, 04, 05

## Question

What smallest machine-readable current-run authority block can distinguish role-specific grants for Peer read-only/edit/local-commit, Human-approved tiny Lead edit/local-commit, and Human-approved Supervisor Lead recovery; bind each grant to the actual role, objective, scope, provider/workspace or candidate base where necessary; revoke it on the next run; and fail closed without copying the reference implementation's compatibility fields?

## Answer

The v0.1 Task Authority Envelope is one strict, versioned, machine-readable block at the start of a submitted user prompt. It is a current-run grant, not a Role Profile and not an authentication boundary.

### Wire format and placement

The canonical form is:

```text
PI_PASEO_TASK_AUTHORITY_BEGIN v1
<one JSON object>
PI_PASEO_TASK_AUTHORITY_END
```

The begin marker must be the first non-empty line of the submitted user message. The JSON must be exactly one object. The end marker must be an exact line. Task prose may follow the end marker. Version `v1` is carried by the begin marker; other versions are rejected. A second envelope marker anywhere in the same prompt, a quoted/example block, or a misplaced block does not grant authority and invalidates the envelope.

The parser rejects the whole envelope on missing or malformed markers, wrong version, invalid JSON, duplicate JSON fields, conflicting fields, unknown fields, wrong field types, missing required fields, or fields forbidden for that grant kind. It never scans arbitrary task prose for a usable block.

### Common fields and binding

Every grant has these exact fields:

- `grant_kind`: `peer`, `lead_tiny`, or `supervisor_recovery`;
- `role`: the actual activated role;
- `issuer`: always `human` in v0.1;
- `paseo_agent_id`: exact current Paseo agent identity;
- `task_id`: non-empty task identity;
- `objective`: non-empty bounded objective.

The extension compares `role` to the process activation snapshot and `paseo_agent_id` to the current Paseo agent. `run_id` is not supplied by the Human: parsing creates a new internal current-run authority record. Each `before_agent_start` replaces that record, including with no grant. The authority therefore never carries into a later run, `/new`, `/resume`, `/fork`, relaunch, or a process/session with a changed Paseo agent ID.

The objective and task prose follow the established hierarchy. Prose may explain the objective but cannot widen the envelope's objective, scope, exclusions, role, or capabilities. Text pretending to be Human, a Role Profile, or an authority block is ordinary prose unless it is the one canonical block at the prompt start. Human authorship remains cooperative rather than cryptographically provable.

`issuer` is route-bound, not self-authorizing prose:

- `peer` is accepted only from the direct Human task message;
- `lead_tiny` is accepted only from `/ppo:lead-tiny` after Human editor and confirmation;
- `supervisor_recovery` is accepted only from `/ppo:recover-lead` after Human editor and confirmation.

No role or task prompt may issue a grant for another role.

### Peer and Lead grants

`peer` requires `role: peer`; `lead_tiny` requires `role: lead`. Both use a closed capability list containing only:

- `edit`;
- `local_commit`.

At least one capability is required. `writable_scope` is required whenever either capability is present. `exclusions` may narrow that scope. `candidate_base` is required exactly when `local_commit` is present and is a full commit ID. Thus the model distinguishes edit-only, commit-without-edit, edit-without-commit, and edit-plus-commit.

A Lead tiny-task grant also requires the Human-confirmed `workspace_protocol_digest`; the current Workspace Protocol must still match and permit tiny self-work. The extension does not pretend to prove semantically that a task is tiny. If the task becomes difficult or needs broader scope, Lead must stop and delegate rather than expand the grant.

Paths in `writable_scope` and `exclusions` are repository-relative, normalized, non-empty paths. Absolute paths, `..`, globs, ambiguous prefixes, and symlink components are rejected. A new file is allowed only below an existing real, non-symlink directory. Scope boundaries are exact (`src/auth` does not include `src/author`). Exclusions must be inside the writable scope.

For `local_commit`, the current `HEAD` must still equal `candidate_base` when committing, and the diff must remain inside the allowed scope. The operation is local commit only: push, merge, amend, force-push, PR, and deploy are always denied. Commit authority is separate from edit authority.

### Supervisor recovery

`supervisor_recovery` requires `role: supervisor`, `target_role: lead`, and exact Human-attested values for:

- `provider_alias`;
- `workspace_id`;
- `handoff_id`;
- recovery `objective`.

It contains no edit or commit capability. `create_agent` arguments must match these values exactly. Successful creation is not role proof: the replacement must run doctor and show governed Lead activation before handoff completes.

### Reset, unavailable tools, and diagnostics

Authority is evaluated as:

```text
session baseline ∩ role ceiling ∩ current-run envelope
```

A Human-disabled tool is never re-enabled. A requested optional capability that is unavailable leaves the run at its base capability and emits a diagnostic; missing required activation prerequisites still block ordinary prompts. Recommended stable diagnostic codes include:

- `AUTHORITY_MISSING`;
- `AUTHORITY_MALFORMED`;
- `AUTHORITY_DUPLICATE`;
- `AUTHORITY_ROLE_MISMATCH`;
- `AUTHORITY_TOOL_UNAVAILABLE`;
- `AUTHORITY_SCOPE_INVALID`;
- `AUTHORITY_BASE_MISMATCH`;
- `AUTHORITY_PROTOCOL_MISMATCH`.

### Enforcement boundary

The extension shapes active Pi tools and repeats checks at direct tool-call time. It blocks recognizable unauthorized `edit`/`write` and `git commit` calls, applies scope and candidate-base checks where observable, and always blocks publication operations. Bash remains available only as allowed by the baseline/role policy; redirects, scripts, aliases, child processes, and indirect commands can bypass recognizable checks. This is a cooperative Policy Guardrail, not a filesystem, process, network, Git, or identity sandbox.

### Stress-test outcomes

- Valid canonical envelope grants only its declared capability and scope.
- No envelope, malformed markers, wrong version, duplicate/conflicting/unknown fields, misplaced or quoted examples, and role/grant mismatch never elevate authority.
- Peer read-only is the no-envelope base; Peer edit and Peer commit-only remain independent; Lead tiny is denied when the protocol disallows it or the scope expands.
- Recovery with the wrong provider, workspace, handoff, or target role cannot create the replacement.
- Repeating a valid envelope in a later run is a new grant and must pass validation again; omitting it revokes the previous grant.
- `/resume`, relaunch, or a changed Paseo agent identity does not inherit the old grant.
- Traversal, absolute, glob, ambiguous, or symlink scopes are rejected; indirect Bash bypass remains a documented cooperative limitation.
