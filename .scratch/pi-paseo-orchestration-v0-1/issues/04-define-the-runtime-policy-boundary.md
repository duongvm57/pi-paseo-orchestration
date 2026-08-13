# Define the runtime policy boundary

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

What must the Pi extension enforce in code versus state as cooperative role instruction, including active-tool allowlist composition, call-time backstops, unknown-role behavior, per-session state, and the explicit non-sandbox boundary of retained Bash access?

## Answer

The v0.1 extension is an in-process policy guardrail: it shapes Pi capabilities and rejects recognizable disallowed calls, but it is not a sandbox or authentication boundary.

### Enforced in code

- Accept only the closed role enum `supervisor | lead | peer`; use the accepted role as the single source for private Role Profile selection and role tool policy.
- For each agent run, derive the effective active tools as `session baseline ∩ role allowlist ∩ current-run authority`. Although Pi's `setActiveTools()` replaces the active set, this package must compute an intersection and must never re-enable a tool disabled by the Human, CLI, or settings.
- Parse the current run's role-specific Task Authority Envelope afresh before every agent run. A missing, invalid, misplaced, duplicate, or role-mismatched envelope grants no exceptional capability, and a later prompt never inherits an earlier grant. Within the role ceiling, the envelope may admit Peer edit/local-commit, Human-approved tiny Lead edit/local-commit, or Human-approved Supervisor Lead-recovery authority; ticket 06 owns the exact grant schema.
- Backstop every direct tool call against the same effective policy. For multiplexing tools such as `mcp`, also validate the inner target. If a role may not reach every target available through `mcp_script`, omit `mcp_script` rather than attempting to authorize JavaScript with regexes.
- Apply a narrow governed-role Bash/Git guardrail: `git commit` requires current-run local-commit authority and is unavailable to Supervisor; direct `git push`, `git merge`, and `git commit --amend` are always blocked in v0.1. Typed publication/deployment tools remain outside the allowlist.
- An absent role leaves the globally installed extension passive and the session explicitly ungoverned. A non-empty unknown role is a configuration error: fail closed, grant no role capabilities, and expose a clear diagnostic rather than silently becoming passive.

### Cooperative role instruction

The extension can instruct but cannot technically guarantee that:

- Lead does not pre-solve Peer work or self-accept difficult changes; it writes only under the Human-approved tiny-task exception defined by ticket 05;
- Supervisor observes and relays decisions without taking project implementation or acceptance authority;
- Peer stays within owned scope, preserves unrelated work, does not orchestrate agents, and does not use Bash to bypass policy;
- agents follow one-writer, stable-candidate, escalation, evidence, and external-side-effect rules.

### State and reset boundary

The session tool baseline and current role-specific authority live in the extension instance for one Pi session, never in module-global mutable state. `session_start` clears authority and reconstructs the baseline. Every `before_agent_start` replaces authority from that run's prompt, including replacement with no authority when the envelope is absent or invalid. New, resumed, forked, or replaced sessions receive no carried grant; the grant must be stated again.

### Explicit security limit

Because all three governed roles retain Bash, neither a read-only tool surface nor Bash/Git pattern checks provide filesystem, process, network, Git, or identity security. Shell redirection, child programs, aliases, scripts, and indirect commands can bypass recognizable-command checks. Real isolation requires OS/container/worktree permissions outside this package and outside v0.1. Documentation and doctor output must call this a cooperative guardrail, never a sandbox or authorization boundary.

This follows the normative role-governance separation between durable Role Profile, repository Workspace Protocol, current-run task authority, and Paseo lifecycle truth. The two resolved research tickets establish the supported Pi hooks and the minimal fail-closed mechanism. `Minnyat/paseo-pi-team` remains implementation evidence only, not a dependency or compatibility target; v0.1 intentionally differs by intersecting existing active tools, rejecting an explicitly invalid role, avoiding regex authorization of `mcp_script`, and keeping authority state session-local.

Ticket 05 refines this boundary by admitting only Human-approved tiny Lead self-work and Supervisor recovery within current-run grants. Exact role activation/tool surfaces are resolved in [Define role activation and private profiles](05-define-role-activation-and-private-profiles.md), exact envelope fields remain in [Define the minimal task authority envelope](06-define-the-minimal-task-authority-envelope.md), diagnostics remain in [Define the doctor contract](10-define-the-doctor-contract.md), and durable Supervisor notebook storage is separated into [Define the Supervisor notebook contract](13-define-the-supervisor-notebook-contract.md).
