#!/usr/bin/env node
// Release smoke for pi-paseo-orchestration (Slice 8). One bounded one-shot
// script, node stdlib only. Run: npm run release:smoke
//
// Against a fresh temporary copy of the package it proves:
//   - the manifest declares exactly one extension and two skills, no adapter
//     dependency, and no install lifecycle scripts
//   - every required resource (extension, skills, companion guide, three
//     private profiles) resolves from canonical loaded-module provenance and is regular,
//     readable, nonempty, and a direct descendant without symlink escape
//   - relocation: the same resources resolve identically from the fresh copy
//   - fail-closed provenance: a module loaded without file provenance does not
//     fall back to cwd/repo-root/config-root/parent search
//   - the settings command writes one closed three-role document at a fresh
//     PI_CODING_AGENT_DIR and a fresh supervisor process applies its exact
//     model and thinking selection
//   - notebook init + append through the real registered handlers write only
//     the create-once manifest and one immutable entry
//   - doctor TUI and RPC produce equivalent canonical non-persistent output
//     and mutate neither the config root nor the project (tree bytes + Git)
//
// The release gate additionally requires the public current-agent observer
// from the independently installed pi-mcp-adapter. That capability is absent
// in this environment by design (this package does not implement or vendor the
// adapter), so the doctor ADAPTER_OBSERVER check is expected BLOCKED: the
// smoke reports it as the exact release blocker and exits 1. A passing smoke
// is evidence for the Human to release — never a release.
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileP = promisify(execFile);
const packageRoot = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const NOW = "2026-01-02T03:04:05.000Z";
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "ppo-smoke", GIT_AUTHOR_EMAIL: "ppo-smoke@example.com",
  GIT_COMMITTER_NAME: "ppo-smoke", GIT_COMMITTER_EMAIL: "ppo-smoke@example.com",
};
const git = (args, cwd) => execFileP("git", ["-c", "commit.gpgsign=false", ...args], { cwd, env: gitEnv });

const results = [];
const report = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// Fixed closed three-role document the select queue produces.
const EXPECTED_SETTINGS = {
  version: 1,
  roles: {
    supervisor: { provider: "anthropic", model: "claude-sonnet-4-5", thinking: "high" },
    lead: { provider: "anthropic", model: "claude-sonnet-4-5", thinking: "medium" },
    peer: { provider: "openai", model: "gpt-5", thinking: "off" },
  },
};
const MODEL_REGISTRY = [
  { provider: "anthropic", id: "claude-sonnet-4-5", name: "Sonnet" },
  { provider: "openai", id: "gpt-5", name: "GPT-5" },
];

// Valid repository-root Workspace Protocol for the fresh project repo; the
// notebook project_id must exactly match its project_id.
const SMOKE_PROTOCOL = `---
status: active
version: 1
last_reviewed: 2026-01-01
project_id: smoke-project
repository_root: .
---

# Workspace Protocol

## decision matrix
The Human decides product, priority, irreversible trade-off, external-effect, authority, protocol, subjective, and material cost/risk questions; every other role treats those as must-ask boundaries. Supervisor owns observation and authoring; Lead owns framing, routing, and verdicts; Peer owns assigned work.

## task classes and routing
Tiny/bounded work may route to the Lead only when the protocol permits it; otherwise bounded work routes to one Peer. Cross-module/lifecycle work routes to one Engineer Peer with an isolated checkout. Architecture-sensitive work routes to an Architect disposition and independent review.

## ownership and isolation
One writer per moving scope; concurrent writers use disjoint scopes and isolated checkouts; ownership returns by explicit handback; the Lead does not take over an owned scope.

## candidate, verification, review, and acceptance
Every class produces one git Stable Candidate; verification is exact commands with recorded evidence; review triggers follow risk class; acceptance is a direct Human message only.

## reopen, dependency, and blocked handling
REOPEN_REQUEST names the failed premise; DEPENDENCY_REQUEST names the owner and requirement; BLOCKED reports bounded attempts; requests are decisions, not candidate acceptance.

## evolution
Revisions increment version and refresh last_reviewed with Human confirmation; material changes stop and re-evaluate running work.
`;

const fileExists = async (path) => {
  try { return (await stat(path)).isFile(); } catch { return false; }
};

// Sorted [relative path, "dir"|hex bytes] tree of a directory.
async function tree(base) {
  const map = new Map();
  const walk = async (rel) => {
    for (const name of await readdir(join(base, rel))) {
      const full = join(base, rel, name);
      const st = await stat(full);
      const key = join(rel, name);
      if (st.isDirectory()) { map.set(key, "dir"); await walk(key); }
      else map.set(key, (await readFile(full)).toString("hex"));
    }
  };
  await walk("");
  return [...map.entries()].sort();
}

const resourceDigests = async (resources) => {
  const files = [resources.extension, resources.skill, resources.guide, resources.orchestration_skill, ...Object.values(resources.profiles)];
  const digests = {};
  for (const file of files) digests[file] = createHash("sha256").update(await readFile(file)).digest("hex");
  return digests;
};

const gitState = async (dir) => [
  (await git(["rev-parse", "HEAD"], dir)).stdout.trim(),
  (await git(["status", "--porcelain=v1", "--untracked-files=all"], dir)).stdout,
  (await git(["log", "--oneline", "--all"], dir)).stdout,
].join("\n");

// One valid immutable notebook entry mirroring the hermetic suite fixture.
function smokeEntry(extension, manifest, projectId, projectRoot) {
  const selected = "smoke: bounded release-observation fact";
  const entry = {
    contract: extension.NOTEBOOK_ENTRY_CONTRACT,
    schema_version: "v1",
    entry_id: "entry-1",
    notebook_id: manifest.notebook_id,
    protocol_project_id: projectId,
    recorded_at: NOW,
    observed_at: NOW,
    writer: { supervisor_agent_id: "smoke-supervisor-1", pi_session_id: "smoke-session-1" },
    context: {
      paseo_project_id: "paseo-smoke-project",
      repository_root: projectRoot,
      paseo_workspace_id: "smoke-workspace-1",
      lead_agent_id: "absent",
      binding_source: "manifest",
      protocol_pin: { version: 1, digest: `sha256:${createHash("sha256").update(SMOKE_PROTOCOL).digest("hex")}` },
    },
    observation: "Smoke observation: bounded release evidence.",
    evidence: [{
      item_id: "evidence-1", observed_at: NOW, kind: "session-observation", source: "paseo:current-agent",
      selected, source_digest: null,
      retained_digest: `sha256:${createHash("sha256").update(selected).digest("hex")}`,
      redaction_notes: [], truncated: false,
    }],
    suspected_mechanism: { hypothesis: "Bounded smoke evidence.", uncertainty: "None beyond the bounded observation.", confidence: "medium" },
    impact: "Smoke evidence only; no authority.",
    question: "Does the release gate pass?",
    recommendation: "Resolve the printed release blocker.",
    escalation: { needed: false, owner: "none", reason: "No owner decision is required.", relay_target: null },
    history: { relation: "original", references: [], reason: "First smoke observation." },
    sensitivity: { redactions: [], contains_secret: false },
    entry_digest: "",
  };
  delete entry.entry_digest;
  entry.entry_digest = `sha256:${createHash("sha256").update(extension.canonicalNotebookJson(entry)).digest("hex")}`;
  return entry;
}

async function main() {
  console.log(`pi-paseo-orchestration release smoke\npackage root: ${packageRoot}`);

  // ── fresh copy of the package (relocation target) ──
  const copy = await mkdtemp(join(tmpdir(), "ppo-release-smoke-"));
  for (const entry of await readdir(packageRoot)) {
    if (entry === ".git" || entry === ".scratch" || entry === ".pi-glla" || entry === ".pi-subagents" || entry === "node_modules") continue;
    await cp(join(packageRoot, entry), join(copy, entry), { recursive: true, force: true });
  }
  const copyManifest = JSON.parse(await readFile(join(copy, "package.json"), "utf8"));

  // Load the extension from the COPY through the same data-URL seam as the
  // hermetic suite; provenance is passed explicitly as the copy's canonical
  // module file URL.
  const extensionSource = await readFile(join(copy, copyManifest.pi.extensions[0]), "utf8");
  const extension = await import(`data:text/javascript;base64,${Buffer.from(extensionSource).toString("base64")}#release-smoke`);
  const realUrl = pathToFileURL(join(packageRoot, copyManifest.pi.extensions[0]));
  const copyUrl = pathToFileURL(join(copy, copyManifest.pi.extensions[0]));

  const realRes = await extension.resolvePackageResources(realUrl);
  report("manifest and resources resolve from the package root", realRes.ok, realRes.ok ? realRes.resources.package_root : realRes.error);
  const copyRes = await extension.resolvePackageResources(copyUrl);
  report("resources resolve from the fresh copied root", copyRes.ok, copyRes.ok ? copyRes.resources.package_root : copyRes.error);
  let relocationOk = false;
  if (realRes.ok && copyRes.ok) {
    const realDigests = await resourceDigests(realRes.resources);
    const copyDigests = await resourceDigests(copyRes.resources);
    relocationOk = realRes.resources.package_root !== copyRes.resources.package_root
      && Object.values(realDigests).join(",") === Object.values(copyDigests).join(",");
    report("relocation: resource set and digests are identical from the copy", relocationOk,
      relocationOk ? `${Object.keys(realDigests).length} resources, same bytes` : "resource bytes differ between roots");
  }
  const noProvenance = await extension.resolvePackageResources();
  report("module without file provenance fails closed (no cwd/config fallback)", noProvenance.ok === false,
    noProvenance.ok ? "unexpected success" : noProvenance.error);

  // ── fresh PI_CODING_AGENT_DIR and clean project repo with a valid protocol ──
  const config = await mkdtemp(join(tmpdir(), "ppo-smoke-config-"));
  const project = await mkdtemp(join(tmpdir(), "ppo-smoke-project-"));
  await git(["init"], project);
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "src", "main.go"), "package main\n");
  await writeFile(join(project, "README.md"), "smoke project\n");
  await mkdir(join(project, ".orchestration"), { recursive: true });
  await writeFile(join(project, ".orchestration", "workspace-protocol.md"), SMOKE_PROTOCOL, "utf8");
  await git(["add", "-A"], project);
  await git(["commit", "-m", "base"], project);

  // ── fake pi (same seam as the hermetic suite: registerCommand/on capture) ──
  const notifications = [];
  const holder = { activeTools: ["read", "bash", "mcp"], modelCalls: [] };
  const selectQueue = ["anthropic", "claude-sonnet-4-5", "high", "anthropic", "claude-sonnet-4-5", "medium", "openai", "gpt-5", "off"];
  const ui = {
    select: async () => selectQueue.shift() ?? null,
    confirm: async () => true,
    input: async () => "smoke-project",
    notify: (message, level) => notifications.push([message, level]),
  };
  const env = {
    PI_CODING_AGENT_DIR: config,
    PI_PASEO_ORCHESTRATION_ROLE: "supervisor",
    PASEO_AGENT_ID: "smoke-supervisor-1",
    PI_PASEO_ORCHESTRATION_PROFILES_DIR: join(copy, "profiles"),
    PASEO_PROJECT_ID: "paseo-smoke-project",
    PASEO_WORKSPACE_ID: "smoke-workspace-1",
    PASEO_LEAD_AGENT_ID: "absent",
  };
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const pi = {
    registerCommand: (name, definition) => commands.set(name, definition),
    registerTool: (definition) => tools.set(definition.name, definition),
    on: (name, handler) => handlers.set(name, handler),
    setActiveTools: (tools) => { holder.activeTools = [...tools]; },
    getActiveTools: () => [...holder.activeTools],
    setModel: (model) => { holder.modelCalls.push(["setModel", model.provider, model.id]); return true; },
    setThinkingLevel: (level) => { holder.modelCalls.push(["setThinkingLevel", level]); holder.thinking = level; },
      getThinkingLevel: () => holder.thinking,
  };
  extension.default(pi);
  const ctx = {
    ui,
    env,
    cwd: project,
    modelRegistry: {
      getAvailable: () => MODEL_REGISTRY,
      find: (provider, id) => MODEL_REGISTRY.find((m) => m.provider === provider && m.id === id),
      complete: () => { throw new Error("settings must never invoke a model"); },
    },
  };

  // ── settings command write, then exact application at activation ──
  await commands.get("ppo:settings").handler("", ctx);
  let settingsOk = false;
  try {
    const written = JSON.parse(await readFile(join(config, "pi-paseo-orchestration", "settings.json"), "utf8"));
    settingsOk = extension.validateSettings(written).ok && JSON.stringify(written) === JSON.stringify(EXPECTED_SETTINGS);
  } catch { settingsOk = false; }
  report("settings command writes one closed three-role document at the fresh config root", settingsOk,
    settingsOk ? "exact document at pi-paseo-orchestration/settings.json" : "document missing or not closed");

  await handlers.get("session_start")({ reason: "startup" }, ctx);
  const applied = JSON.stringify(holder.modelCalls) === JSON.stringify([
    ["setModel", "anthropic", "claude-sonnet-4-5"], ["setThinkingLevel", "high"],
  ]);
  report("fresh supervisor process applies the exact settings selection", applied,
    applied ? "setModel + setThinkingLevel matched the document" : JSON.stringify(holder.modelCalls));

  // ── notebook init + append through the real registered handlers ──
  const projectKey = extension.deriveNotebookProjectKey("smoke-project");
  const manifestPath = join(config, "pi-paseo-orchestration", "supervisor-notebooks", "v1", "projects", projectKey, "manifest.json");
  const initResult = await commands.get("ppo:notebook-init").handler("", ctx);
  const initOk = initResult.ok === true && await fileExists(manifestPath);
  report("notebook-init writes the create-once manifest", initOk, initOk ? manifestPath : initResult.error ?? initResult.ok);

  let appendOk = false;
  let appendError = "";
  if (initOk) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    try {
      const appendResult = await tools.get("supervisor_notebook_append").execute(
        "smoke-append", { project_id: "smoke-project", entry: smokeEntry(extension, manifest, "smoke-project", project) },
        undefined, undefined, ctx,
      );
      appendOk = Array.isArray(appendResult?.content) && String(appendResult.content[0]?.text ?? "").includes("Notebook entry");
      appendError = appendOk ? "" : "execute resolved without a Notebook entry message";
    } catch (err) {
      appendError = err instanceof Error ? err.message : String(err);
    }
    const entryPath = join(join(manifestPath, ".."), "entries", "entry-1.json");
    appendOk = appendOk && await fileExists(entryPath);
    report("notebook-append writes one immutable entry", appendOk, appendOk ? entryPath : appendError);
  } else {
    report("notebook-append writes one immutable entry", false, "manifest unavailable");
  }

  // ── doctor: TUI/RPC equivalence, no mutation, observer fail-closed ──
  // The doctor run stays hermetic: PATH is stripped so the observation probe
  // cannot depend on the live daemon; the release observer probe below uses
  // the real environment.
  const doctorCmd = commands.get("ppo:doctor");
  const doctorCtx = { ...ctx, env: { ...env, PATH: "/nonexistent-ppo-path" } };
  const configBefore = await tree(config);
  const projectBefore = await tree(project);
  const projectGitBefore = await gitState(project);
  const rpcResult = await doctorCmd.handler("", { ...doctorCtx, rpc: true });
  const tuiResult = await doctorCmd.handler("", { ...doctorCtx, mode: "tui" });
  const normalize = ({ report_id, started_at, finished_at, ...rest }) => rest;
  const tuiRpcOk = rpcResult.ok === true && tuiResult.ok === true && rpcResult.mode === "rpc" && tuiResult.mode === "tui"
    && JSON.stringify(normalize(rpcResult.report)) === JSON.stringify(normalize(tuiResult.report));
  report("doctor TUI and RPC produce equivalent canonical non-persistent output", tuiRpcOk,
    tuiRpcOk ? "identical reports (volatile id/timestamps normalized)" : `${rpcResult.error ?? ""} ${tuiResult.error ?? ""}`.trim());

  const adapterCheck = rpcResult.report?.checks?.find((check) => check.code === "ADAPTER_OBSERVER");
  const adapterFailClosed = adapterCheck?.status === "BLOCKED" && typeof adapterCheck.observed === "string" && adapterCheck.observed !== "";
  const piApiOk = rpcResult.report?.checks?.find((check) => check.code === "PI_CAPABILITIES")?.status === "PASS";
  report("adapter-gated doctor check is BLOCKED with the exact reason in the hermetic smoke env", adapterFailClosed,
    adapterCheck ? `${adapterCheck.status}: ${adapterCheck.observed}` : "ADAPTER_OBSERVER check missing");

  // Release observer probe against the REAL environment: the gate needs the
  // exact current-agent observation proven (identity/model/thinking/parent/
  // cwd) through the installed observer. In an environment without a governed
  // agent identity this stays blocked with the exact reason — never faked.
  const liveProbe = await extension.observePaseoCurrentAgent(process.env.PASEO_AGENT_ID ?? "", { env: process.env });
  const adapterObserverOk = liveProbe.ok === true;
  report("release observer probe proves current-agent observation or reports the exact blocker",
    liveProbe.ok || typeof liveProbe.error === "string",
    liveProbe.ok ? `proven via ${liveProbe.observation.source}` : liveProbe.error);

  const configAfter = await tree(config);
  const projectAfter = await tree(project);
  const projectGitAfter = await gitState(project);
  const mutationOk = JSON.stringify(configBefore) === JSON.stringify(configAfter)
    && JSON.stringify(projectBefore) === JSON.stringify(projectAfter)
    && projectGitBefore === projectGitAfter;
  report("doctor mutates neither the config root nor the project (tree bytes + Git)", mutationOk,
    mutationOk ? "byte-identical" : "mutation detected");

  // ── release gate over the facts this smoke run established ──
  console.log("\nRELEASE GATE (facts proven by this smoke run):");
  const gate = extension.releaseGate({
    relocation: relocationOk,
    doctor_tui_rpc_equivalence: tuiRpcOk,
    settings_exact: settingsOk && applied,
    notebook_primitives: initOk && appendOk,
    mutation_boundaries: mutationOk,
    capabilities: {
      pi_api: piApiOk,
      adapter_current_agent_observer: adapterObserverOk,
    },
  });
  console.log(gate.ok ? "  gate: PASS" : `  gate: BLOCKED (${gate.blockers.length} blocker${gate.blockers.length === 1 ? "" : "s"})`);
  for (const blocker of gate.blockers) {
    console.log(`  blocker: ${blocker.fact} [${blocker.status}] — ${blocker.condition} — owner: ${blocker.owner}`);
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.log(`\nRESULT: FAIL — ${failed.map((result) => result.name).join("; ")}`);
  } else if (!gate.ok) {
    const observerBlocker = gate.blockers.find((blocker) => blocker.fact === "adapter_current_agent_observer");
    console.log(`\nRESULT: FAIL — RELEASE BLOCKER: ${observerBlocker?.condition ?? "current-agent observation is not proven"} — owner: ${observerBlocker?.owner ?? "operator"}; no fallback is accepted. Start the Paseo daemon, run the smoke with PASEO_AGENT_ID set to the exact governed agent, and re-run on the exact commit. (Missing facts install_pinned, hermetic_tests, and paseo_live are proven by the release flow's install and hermetic steps outside this script.)`);
  } else {
    console.log("\nRESULT: PASS — all smoke checks passed.");
  }
  process.exitCode = failed.length > 0 || !gate.ok ? 1 : 0;

  await rm(copy, { recursive: true, force: true });
  await rm(config, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
}

await main();
