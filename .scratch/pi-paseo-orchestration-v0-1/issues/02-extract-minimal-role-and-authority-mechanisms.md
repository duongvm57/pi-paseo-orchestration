# Extract the minimal role and authority mechanisms from the reference implementation

Type: research
Status: resolved

## Question

At pinned commit `35ceaace5ea8b37d1cf89e9717226ce81364f375`, how does `Minnyat/paseo-pi-team` pass role identity and enforce current-turn Peer authority, and what is the smallest mechanism worth considering in an independent package?

## Answer

The reusable core is: Paseo provider env supplies a closed role enum; the extension derives prompt and tool policy from it; each Peer run reparses a strict delimited authority block; invalid or absent authority becomes read-only; active tools and call-time checks derive from the same ephemeral record. Bash/Git checks are cooperative heuristics, not a sandbox. Compatibility schemas and unrelated browser/OCR/multi-host/publication logic are excluded.

Research asset: [`baseline-role-authority.md`](../../../.pi-subagents/artifacts/outputs/427daac9/research.md)
