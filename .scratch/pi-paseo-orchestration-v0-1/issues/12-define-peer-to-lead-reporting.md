# Define non-disruptive Peer-to-Lead reporting

Type: grilling
Status: open
Blocked by: 03

## Question

Given that Paseo's `send_agent_prompt` replaces an in-flight Lead run and provides no receipt, idempotency key, or safe retry contract, how should Peer progress, blocked, dependency, and reopen reports reach the exact parent Lead? Decide whether v0.1 should rely on structured terminal handoff plus Paseo finish/permission notification, allow carefully gated idle-parent sends, or expose another thin protocol over an existing supported Paseo primitive—without creating a queue, daemon, or task ledger.
