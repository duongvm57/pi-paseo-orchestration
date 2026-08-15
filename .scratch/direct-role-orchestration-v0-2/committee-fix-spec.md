# Task: fix committee findings (DOGFOOD-021) on candidate 0c67500

Task ID: `ppo-v02-conformance-fix-001`
Type: implementation spec (for the Lead)
Status: ready-for-Lead

## Objective

An independent committee of 3 reviewers (deepseek-v4-pro, grok-4.6, gpt-5.6-sol)
returned PARTIAL on candidate `0c67500`. Fix the blocker and the converged
findings so the candidate reaches CONFORMANT against
`ref-docs/agent-orchestration-deep-dive.md`. Full consensus in
`.scratch/direct-role-orchestration-v0-2/dogfood-notes.md` → DOGFOOD-021.

## Blocker (3/3)

**Supervisor-side binding is unwired.** `boundLeadIds`
(`extensions/pi-paseo-orchestration.ts:4444-4462`) is populated only by
Peer-activation and dead helpers `verifyPartnerBinding(kind:"lead")` /
`bindExactPartner` — no production path for a Supervisor. Result: Supervisor
`send_agent_prompt`/`list_agents`/`get_agent_status`/`get_agent_activity` all
fail closed; observation went from unbounded-but-working to dead. Fix: a
Supervisor must bind its assigned Lead(s) from its own binding input, with live
verification (root + role + repo + task), revalidated on restart.

## Converged findings to fix

1. **G10 recovery route** — after per-incident Human authorization there is no
   executable path to create a successor Lead (Supervisor has no `create_agent`;
   skill says "does not create agents"). Provide the gated path or align the
   prose with the real capability (deep-dive `:338-347` requires the mechanism
   exist).
2. **N4 write_mode immutable per assignment** — `ext:5184-5208` re-scans every
   later input, so a read-only Reviewer can be elevated to writer without a new
   assignment. Bind `write_mode` only from the assignment brief (first input).
3. **G4 observation strategy → protocol** — six milestone kinds and exactly-one
   pass are hardcoded (`ext:1144-1148`; `skills/ppo-orchestrate/SKILL.md:54-56`).
   Move the observation rhythm to the Workspace Protocol.
4. **N5/CONTEXT.md stale** — `CONTEXT.md:15-17,27-32` still defines Task
   Authority Envelope / Authority Grant as active. De-stale it.
5. **G12 prose/runtime contradiction** — `profiles/lead.md:7` and
   `README.md:61,203` grant Lead write/commit directly; runtime requires
   protocol opt-in. Align prose to runtime.
6. **N3 transport** — `deliverPeerLeadMessage` execs `paseo send ... --no-wait`
   (`ext:4636`), the CLI the package bans as fallback, and there is no
   receive-side gate for incoming Peer→Lead envelopes. Use the proper route +
   add a receive-side parse/validate.
7. **G7/N6 multi-binding state** — scalar `boundTaskId`/`boundWorkspaceId`
   cannot represent multiple assigned Leads. Use a set of
   `{leadId, taskId, workspaceId}` tuples.

## Single-member findings (apply if confirmed)

- Stale `CEILINGS` comment (`ext:143-145`) still claims blanket write/edit.
- First-milestone bind ignores the Human-announced Supervisor ID (binds on
  task-label match OR unobservable); bind on the announced ID.

## Exclusions

- Do not touch distribution/local-only publication (intentional deltas).
- Do not re-litigate the recorded not-gaps.

## Verification

- `npm test`, `npm run typecheck`, `npm pack --dry-run`, `git diff --check`.
- Add a regression test proving `boundLeadIds` is populated in a Supervisor
  production path (not only a test helper), and that `write_mode` cannot change
  after the first input.
