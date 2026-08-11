# Verify the official Pi, Paseo, and MCP package seams

Type: research
Status: resolved

## Question

What minimum current first-party Pi package, extension, Paseo integration, and `pi-mcp-adapter` contracts constrain v0.1 without importing requirements from another orchestration package?

## Answer

Pi 0.84.1 supports git-installed packages with a TypeScript extension, `before_agent_start` prompt composition, `setActiveTools` capability shaping, `tool_call` blocking, and command provenance inspection. `pi-mcp-adapter` is a separately installed Pi package; doctor should detect its loaded command provenance rather than declare it as a dependency.

Research asset: [`pi-package-contracts.md`](../../../.pi-subagents/artifacts/outputs/108d73d4/research.md)
