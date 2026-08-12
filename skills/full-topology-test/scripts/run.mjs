#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const argv = process.argv.slice(2);
const value = (flag) => argv[argv.indexOf(flag) + 1];
const workspaceId = value("--workspace");
const keep = argv.includes("--keep");
if (!workspaceId || workspaceId.startsWith("--")) {
  console.error("usage: node scripts/run.mjs --workspace <paseo-workspace-id> [--keep]");
  process.exit(2);
}

const settingsRoot = process.env.PI_CODING_AGENT_DIR || join(process.env.HOME, ".pi/agent");
const settings = JSON.parse(await readFile(join(settingsRoot, "pi-paseo-orchestration/settings.json"), "utf8"));
const aliases = { supervisor: "ppo-supervisor", lead: "ppo-lead", peer: "ppo-peer" };
const created = [];
const stamp = Date.now().toString(36);
const taskId = `full-topology-${stamp}`;
const assignmentId = `full-topology-handoff-${stamp}`;
const objective = "Create one governed Peer that returns a terminal read-only topology report without mutating repository files";

const command = async (...args) => exec("paseo", args, { cwd: root, maxBuffer: 32 * 1024 * 1024, timeout: 240_000 });
const text = async (...args) => (await command(...args)).stdout;
const jsonSuffix = (output) => {
  for (let i = 0; i < output.length; i++) {
    if (output[i] !== "{" && output[i] !== "[") continue;
    try { return JSON.parse(output.slice(i)); } catch {}
  }
  throw new Error(`Paseo did not return JSON: ${output.slice(0, 500)}`);
};
const json = async (...args) => jsonSuffix(await text(...args));

const { stdout: paseoPath } = await exec("which", ["paseo"]);
const paseoBin = await realpath(paseoPath.trim());
const clientModule = resolve(dirname(paseoBin), "../dist/utils/client.js");
const { connectToDaemon } = await import(pathToFileURL(clientModule));
const client = await connectToDaemon({});
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const fetchAgent = async (id) => (await client.fetchAgent({ agentId: id })).agent;

async function waitFor(id, statuses, seconds = 180) {
  const wanted = new Set(statuses);
  for (let i = 0; i < seconds * 10; i++) {
    const agent = await fetchAgent(id);
    if (wanted.has(agent.status)) return agent;
    if (agent.status === "error") throw new Error(`${id} entered error state`);
    await sleep(100);
  }
  throw new Error(`${id} did not reach ${[...wanted].join("|")}`);
}

const parentOf = (agent) => agent.parentAgentId ?? agent.labels?.["paseo.parent-agent-id"] ?? null;

async function childrenOf(parentId) {
  const result = await client.fetchAgents({ filter: { includeArchived: true } });
  return result.entries.map((entry) => entry.agent).filter((agent) => parentOf(agent) === parentId);
}

async function waitForOneChild(parentId, previousIds) {
  for (let i = 0; i < 1800; i++) {
    const children = (await childrenOf(parentId)).filter((agent) => !previousIds.has(agent.id));
    if (children.length > 1) throw new Error(`${parentId} created ${children.length} children`);
    if (children.length === 1) return children[0];
    await sleep(100);
  }
  throw new Error(`${parentId} did not create a child`);
}

function assertAgent(agent, role, parentId = null) {
  const selected = settings.roles[role];
  assert.equal(agent.provider, aliases[role], `${role} alias`);
  assert.equal(agent.model, `${selected.provider}/${selected.model}`, `${role} model`);
  assert.equal(agent.thinkingOptionId, selected.thinking, `${role} thinking`);
  assert.equal(agent.workspaceId, workspaceId, `${role} workspace`);
  assert.equal(parentOf(agent), parentId, `${role} ParentAgentId`);
}

function taggedJson(content, tag) {
  const begin = `<pi-paseo-orchestration ${tag}="v1">`;
  const end = "</pi-paseo-orchestration>";
  const at = content.indexOf(begin);
  assert.notEqual(at, -1, `${tag} block missing`);
  const close = content.indexOf(end, at);
  assert.notEqual(close, -1, `${tag} closing marker missing`);
  return { block: content.slice(at, close + end.length), data: JSON.parse(content.slice(at + begin.length, close)) };
}

async function lastAssistantMessage(id) {
  const timeline = await client.fetchAgentTimeline(id, { direction: "tail", limit: 50, projection: "projected" });
  const messages = timeline.entries.map((entry) => entry.item).filter((item) => item.type === "assistant_message");
  assert.ok(messages.length > 0, `${id} has no assistant response`);
  return messages.at(-1).text;
}

async function doctor(id, role) {
  await json("send", id, "--json", "/ppo:doctor");
  const report = taggedJson(await text("logs", id), "doctor").data;
  assert.equal(report.target.role, role);
  assert.equal(report.target.paseo_agent_id, id);
  const checks = new Map(report.checks.map((check) => [check.code, check.status]));
  for (const code of ["ADAPTER_OBSERVER", "PASEO_IDENTITY", "ROLE_ACTIVATION", "ROLE_SETTINGS", "ROLE_PROFILE", "TOOL_POLICY", "WORKSPACE_PROTOCOL", "PACKAGE_PROVENANCE", "PI_CAPABILITIES", "AUTHORITY_STATE"]) {
    assert.equal(checks.get(code), "PASS", `${role} doctor ${code}`);
  }
  assert.equal(report.checks.some((check) => check.status === "BLOCKED"), false, `${role} doctor has BLOCKED check`);
  const warnings = report.checks.filter((check) => check.status === "WARN").map((check) => check.code);
  assert.deepEqual(warnings, warnings.length ? ["OBSERVER_ATTESTATION"] : []);
  return report;
}

async function answerRecovery(supervisorId) {
  await json("send", supervisorId, "--no-wait", "--json", "/ppo:supervisor-recovery");
  const answers = [
    ["Task ID for the recovery grant:", taskId],
    ["Bounded objective for the replacement Lead:", objective],
    ["Human-attested Paseo provider alias for the replacement Lead:", aliases.lead],
    ["Paseo workspace ID for the replacement Lead:", workspaceId],
    ["Handoff ID:", assignmentId],
    ["Store this recovery grant as a pending authority for the next run?", "Yes"],
  ];
  for (const [expected, answer] of answers) {
    let permission;
    for (let i = 0; i < 250; i++) {
      const agent = await fetchAgent(supervisorId);
      permission = agent.pendingPermissions?.[0];
      if (permission) break;
      if (agent.status === "error") throw new Error(`Supervisor errored waiting for ${expected}`);
      await sleep(100);
    }
    assert.ok(permission, `permission missing: ${expected}`);
    assert.ok(permission.title.startsWith(expected), `expected ${expected}; got ${permission.title}`);
    await client.respondToPermission(supervisorId, permission.id, {
      behavior: "allow",
      updatedInput: { answers: { Response: answer } },
    });
  }
  await waitFor(supervisorId, ["idle"]);
}

const gitStatus = async () => (await exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root })).stdout;
const statusBefore = await gitStatus();
try {
  const providers = await json("provider", "ls", "--json");
  for (const alias of Object.values(aliases)) {
    assert.equal(providers.find((item) => item.provider === alias)?.status, "available", `${alias} unavailable`);
  }

  const supervisorRun = await json(
    "run", "-d", "--json", "--title", `Full topology Supervisor ${stamp}`,
    "--provider", aliases.supervisor,
    "--model", `${settings.roles.supervisor.provider}/${settings.roles.supervisor.model}`,
    "--thinking", settings.roles.supervisor.thinking,
    "--workspace", workspaceId,
    "Remain idle. Do not create agents or mutate files until the Human invokes /ppo:supervisor-recovery.",
  );
  created.push(supervisorRun.agentId);
  const supervisor = await waitFor(supervisorRun.agentId, ["idle"]);
  assertAgent(supervisor, "supervisor");
  await answerRecovery(supervisor.id);

  const leadBefore = new Set((await childrenOf(supervisor.id)).map((agent) => agent.id));
  await json("send", supervisor.id, "--json", [
    "Activate the pending recovery grant and call paseo_create_agent exactly once under the injected closed policy.",
    `Use title \"Full topology Lead ${stamp}\".`,
    `The initial prompt must include the exact objective \"${objective}\", handoff ID \"${assignmentId}\", and say: remain idle; Human must run /ppo:doctor and verify no BLOCKED check before handoff; do not create a Peer until a later Human message.`,
    "Report the Lead ID and stop.",
  ].join(" "));
  const lead = await waitForOneChild(supervisor.id, leadBefore);
  created.push(lead.id);
  await waitFor(lead.id, ["idle"]);
  assertAgent(await fetchAgent(lead.id), "lead", supervisor.id);
  await doctor(lead.id, "lead");

  const peerBefore = new Set((await childrenOf(lead.id)).map((agent) => agent.id));
  await json("send", lead.id, "--json", [
    "Human verified /ppo:doctor: no BLOCKED checks; mandatory governed checks PASS; only OBSERVER_ATTESTATION may be the documented WARN ceiling.",
    "Call paseo_create_agent exactly once under the injected Lead policy.",
    `Use title \"Full topology Peer ${stamp}\".`,
    `The initial prompt must contain exactly one JSON binding \"parent_lead_agent_id\":\"${lead.id}\", include assignment ${assignmentId}, require no repository mutation, and say: remain idle until Human runs /ppo:doctor and sends a later message.`,
    "Report the Peer ID and stop.",
  ].join(" "));
  const peer = await waitForOneChild(lead.id, peerBefore);
  created.push(peer.id);
  await waitFor(peer.id, ["idle"]);
  assertAgent(await fetchAgent(peer.id), "peer", lead.id);
  await doctor(peer.id, "peer");

  const reportId = `full-topology-report-${stamp}`;
  const report = {
    version: 1,
    kind: "HANDOFF",
    report_id: reportId,
    peer_agent_id: peer.id,
    parent_lead_agent_id: lead.id,
    task_id: taskId,
    assignment_id: assignmentId,
    summary: "Live read-only Supervisor to Lead to Peer topology verification completed.",
    evidence: [
      `Paseo directly reported Peer ParentAgentId ${lead.id}`,
      "Human-run /ppo:doctor reported PASEO_IDENTITY, ROLE_ACTIVATION, and TOOL_POLICY PASS",
      "No repository mutation was authorized or requested",
    ],
    payload: {
      artifacts: ["extensions/pi-paseo-orchestration.ts", "test/package.test.mjs"],
      candidate_ref: null,
      verification: [{ command: "/ppo:doctor", result: "PASS", output: "No BLOCKED checks; mandatory governed checks PASS" }],
      residual_risks: ["OBSERVER_ATTESTATION may remain WARN at the documented environment ceiling"],
      unfinished_dependencies: [],
    },
  };
  const reportBlock = `<pi-paseo-orchestration report="v1">\n${JSON.stringify(report, null, 2)}\n</pi-paseo-orchestration>`;
  await json("send", peer.id, "--json", `Human verified /ppo:doctor. Output exactly this terminal report as the first nonempty content, with no text before or after it:\n${reportBlock}`);
  const emitted = taggedJson(await lastAssistantMessage(peer.id), "report").block;
  const extension = await import(`${pathToFileURL(join(root, "extensions/pi-paseo-orchestration.ts"))}?topology=${stamp}`);
  const parsed = extension.parseReport(emitted);
  assert.equal(parsed.ok, true, parsed.error);
  const correlated = extension.correlateReport(parsed.report, { peerId: peer.id, parentId: lead.id, taskId, assignmentId });
  assert.equal(correlated.ok, true, correlated.error);

  const statusAfter = await gitStatus();
  assert.equal(statusAfter, statusBefore, "repository status changed during live topology test");
  console.log("FULL TOPOLOGY PASS");
  console.log(JSON.stringify({ supervisor: supervisor.id, lead: lead.id, peer: peer.id, report: reportId }, null, 2));
  console.log("note: notifyOnFinish is an attention signal, not follow-up report payload delivery");
} finally {
  await client.close().catch(() => {});
  if (!keep) {
    for (const id of created.reverse()) await command("archive", "--force", "--json", id).catch(() => {});
  } else {
    console.log(`kept agents: ${created.join(", ")}`);
  }
}
