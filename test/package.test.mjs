import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

const extensionSource = await readFile(join(root, manifest.pi.extensions[0]), "utf8");
const extension = await import(
  `data:text/javascript;base64,${Buffer.from(extensionSource).toString("base64")}`
);

const { validateSettings, readSettings, writeSettings, configDir, settingsPath } = extension;

const digestOf = (text) => createHash("sha256").update(text).digest("hex");

// Fresh module instance per test so module-level latch state never leaks.
const freshExtension = async () => {
  const source = await readFile(join(root, manifest.pi.extensions[0]), "utf8");
  const nonce = Math.random().toString(36).slice(2);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${nonce}`);
};

const profileDirFixture = async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-profiles-"));
  for (const role of ["supervisor", "lead", "peer"]) {
    await writeFile(join(dir, `${role}.md`), `# ${role} profile\n\nObserve and report only.\n`);
  }
  return dir;
};

const baseModels = () => [
  { provider: "anthropic", id: "claude-sonnet-4-5", name: "Sonnet" },
  { provider: "openai", id: "gpt-5", name: "GPT-5" },
];

const fakePi = (ctxOverrides = {}) => {
  const handlers = new Map();
  const commands = new Map();
  const notifications = [];
  const holder = { activeTools: [...(ctxOverrides.activeTools ?? [])], modelCalls: [] };
  const ui = {
    select: async () => null,
    confirm: async () => false,
    notify: (...args) => notifications.push(args),
    ...(ctxOverrides.ui ?? {}),
  };
  return {
    handlers,
    commands,
    notifications,
    holder,
    pi: {
      registerCommand: (name, definition) => commands.set(name, definition),
      on: (name, handler) => handlers.set(name, handler),
      setActiveTools: (tools) => { holder.activeTools = [...tools]; },
      getActiveTools: () => [...holder.activeTools],
      setModel: (model) => { holder.modelCalls.push(["setModel", model.provider, model.id]); return true; },
      setThinkingLevel: (level) => { holder.modelCalls.push(["setThinkingLevel", level]); return level; },
    },
    ctx: {
      ui,
      env: { ...process.env, ...(ctxOverrides.env ?? {}) },
      modelRegistry: {
        getAvailable: () => baseModels(),
        find: (provider, id) => baseModels().find((m) => m.provider === provider && m.id === id),
        complete: () => { throw new Error("settings must never invoke a model"); },
      },
      ...(ctxOverrides.ctx ?? {}),
    },
  };
};

const validDoc = {
  version: 1,
  roles: {
    supervisor: { provider: "anthropic", model: "claude-sonnet-4-5", thinking: "high" },
    lead: { provider: "anthropic", model: "claude-sonnet-4-5", thinking: "medium" },
    peer: { provider: "openai", model: "gpt-5", thinking: "off" },
  },
};

test("manifest declares only one Pi extension and one Pi skill", () => {
  assert.deepEqual(manifest.pi, {
    extensions: ["./extensions/pi-paseo-orchestration.ts"],
    skills: ["./skills/workspace-protocol/SKILL.md"],
  });
  assert.deepEqual(manifest.scripts, { test: "node --test test/package.test.mjs" });

  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    assert.equal(manifest[field]?.["pi-mcp-adapter"], undefined);
  }
});

test("declared resources and private profiles are nonempty files", async () => {
  const paths = [
    manifest.pi.extensions[0],
    manifest.pi.skills[0],
    "profiles/supervisor.md",
    "profiles/lead.md",
    "profiles/peer.md",
  ];

  for (const path of paths) {
    const file = join(root, path);
    assert.equal((await stat(file)).isFile(), true, `${path} must be a file`);
    assert.notEqual((await readFile(file, "utf8")).trim(), "", `${path} must be nonempty`);
  }

  assert.equal(JSON.stringify(manifest.pi).includes("profiles"), false);
  assert.match(await readFile(join(root, manifest.pi.skills[0]), "utf8"), /^---\nname: workspace-protocol\ndescription: .+\n---/);
});

test("settings document is closed: valid doc passes, every drift fails", () => {
  assert.deepEqual(validateSettings(validDoc), { ok: true });

  const invalid = [
    ["missing version", { ...validDoc, version: undefined }],
    ["wrong version", { ...validDoc, version: 2 }],
    ["missing role", { version: 1, roles: { lead: validDoc.roles.lead, peer: validDoc.roles.peer } }],
    ["extra role", { version: 1, roles: { ...validDoc.roles, intern: validDoc.roles.peer } }],
    ["missing role key", { version: 1, roles: { ...validDoc.roles, lead: { provider: "x", model: "y" } } }],
    ["extra role key", { version: 1, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, effort: "high" } } }],
    ["empty provider", { version: 1, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, provider: "" } } }],
    ["non-string model", { version: 1, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, model: 5 } } }],
    ["unknown thinking", { version: 1, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, thinking: "turbo" } } }],
    ["empty thinking", { version: 1, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, thinking: "" } } }],
    ["roles not object", { version: 1, roles: [] }],
  ];

  for (const [label, doc] of invalid) {
    assert.notEqual(validateSettings(doc).ok, true, `${label} must fail`);
  }
});

test("readSettings: missing file is null, malformed or invalid state throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-read-"));
  try {
    assert.equal(await readSettings(dir), null);

    const bad = join(dir, "pi-paseo-orchestration");
    await mkdir(bad, { recursive: true });
    await writeFile(join(bad, "settings.json"), "{nope", "utf8");
    await assert.rejects(() => readSettings(dir), /not valid JSON/);

    await writeFile(join(bad, "settings.json"), JSON.stringify({ version: 2, roles: {} }), "utf8");
    await assert.rejects(() => readSettings(dir), /invalid/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeSettings: writes exactly the closed document, atomically, at the config path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-write-"));
  try {
    await writeSettings(dir, validDoc);
    const path = settingsPath(dir);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), validDoc);
    assert.deepEqual(await readdir(join(dir, "pi-paseo-orchestration")), ["settings.json"]);
    assert.equal((await stat(path)).mode & 0o777, 0o600);

    // Overwrite replaces bytes without residue.
    const next = { ...validDoc, roles: { ...validDoc.roles, peer: { ...validDoc.roles.peer, thinking: "low" } } };
    await writeSettings(dir, next);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), next);
    assert.deepEqual(await readdir(join(dir, "pi-paseo-orchestration")), ["settings.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeSettings: refuses invalid documents and reports write failure explicitly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-fail-"));
  try {
    await assert.rejects(() => writeSettings(dir, { ...validDoc, version: 9 }), /refusing/);
    assert.deepEqual(await readdir(dir), []);

    // Block the target directory with a file so the write must fail.
    await writeFile(join(dir, "pi-paseo-orchestration"), "blocker", "utf8");
    await assert.rejects(() => writeSettings(dir, validDoc));
    assert.equal(await readFile(join(dir, "pi-paseo-orchestration"), "utf8"), "blocker");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("configDir resolves from PI_CODING_AGENT_DIR or the documented per-user default", () => {
  assert.equal(configDir({ PI_CODING_AGENT_DIR: "/x/y" }, "/home/u"), "/x/y");
  assert.equal(configDir({}, "/home/u"), join("/home/u", ".pi", "agent"));
});

async function runSettingsWith(fake, env) {
  const ext = await freshExtension();
  ext.default(fake.pi);
  const settings = fake.commands.get("pi-paseo-orchestration:settings");
  await settings.handler("", { ...fake.ctx, env: env ?? process.env });
  return fake;
}

test("extension registers the settings command and a handler that never calls a model", async () => {
  const fake = fakePi();
  fake.pi.registerCommand("pi-paseo-orchestration:settings", {
    description: "…",
    handler: async () => { throw new Error("no model call"); },
  });
  const source = await readFile(join(root, manifest.pi.extensions[0]), "utf8");
  const ext = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  ext.default(fake.pi);
  assert.deepEqual([...fake.commands.keys()], ["pi-paseo-orchestration:settings"]);
});

test("settings command: cancel anywhere preserves prior bytes and writes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-cancel-"));
  try {
    const priorDir = join(dir, "pi-paseo-orchestration");
    await mkdir(priorDir, { recursive: true });
    await writeFile(join(priorDir, "settings.json"), JSON.stringify(validDoc), "utf8");

    const fake = fakePi({ ui: { select: async () => null } });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });

    assert.deepEqual(JSON.parse(await readFile(join(priorDir, "settings.json"), "utf8")), validDoc);
    assert.equal(fake.notifications.some(([msg]) => /unchanged|Cancelled/i.test(msg)), true);
    assert.equal(fake.notifications.some(([, level]) => level === "error"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings command: declined confirmation writes nothing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-decline-"));
  try {
    const queue = ["anthropic", "claude-sonnet-4-5", "high", "anthropic", "claude-sonnet-4-5", "medium", "openai", "gpt-5", "off"];
    const fake = fakePi({
      ui: { select: async () => queue.shift() ?? null, confirm: async () => false },
    });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });

    assert.deepEqual(await readdir(dir), []);
    assert.equal(fake.notifications.some(([msg]) => /unchanged/i.test(msg)), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings command: confirmed selection writes exactly one closed document", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-write-"));
  try {
    const queue = ["anthropic", "claude-sonnet-4-5", "high", "anthropic", "claude-sonnet-4-5", "medium", "openai", "gpt-5", "off"];
    const fake = fakePi({
      ui: { select: async () => queue.shift() ?? null, confirm: async () => true },
    });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });

    assert.deepEqual(
      JSON.parse(await readFile(join(dir, "pi-paseo-orchestration", "settings.json"), "utf8")),
      validDoc,
    );
    assert.equal(fake.notifications.some(([msg]) => /written/i.test(msg)), true);
    assert.equal(fake.notifications.some(([, level]) => level === "error"), false);
    assert.deepEqual(await readdir(dir), ["pi-paseo-orchestration"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings command: malformed prior settings block with an explicit error, bytes preserved", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-blocked-"));
  try {
    const priorDir = join(dir, "pi-paseo-orchestration");
    await mkdir(priorDir, { recursive: true });
    await writeFile(join(priorDir, "settings.json"), "{broken", "utf8");

    const fake = fakePi();
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });

    assert.equal(await readFile(join(priorDir, "settings.json"), "utf8"), "{broken");
    assert.equal(fake.notifications.some(([, level]) => level === "error"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ─── Lát 2: role activation & policy guardrail ───────────────────────────────

const { parseRole, resolveProfileSource, activate, verifyLatch, intersectTools, checkToolCall } = extension;

test("parseRole: closed role source, empty is passive, anything else invalid", () => {
  assert.deepEqual(parseRole({}), { ok: true, role: null });
  assert.deepEqual(parseRole({ PI_PASEO_ORCHESTRATION_ROLE: "" }), { ok: true, role: null });
  assert.deepEqual(parseRole({ PI_PASEO_ORCHESTRATION_ROLE: "supervisor" }), { ok: true, role: "supervisor" });
  assert.deepEqual(parseRole({ PI_PASEO_ORCHESTRATION_ROLE: "lead" }), { ok: true, role: "lead" });
  assert.deepEqual(parseRole({ PI_PASEO_ORCHESTRATION_ROLE: "peer" }), { ok: true, role: "peer" });
  for (const bad of ["Lead", " LEAD ", "admin", "supervisor,lead", "1", "\n", "  "]) {
    assert.equal(parseRole({ PI_PASEO_ORCHESTRATION_ROLE: bad }).ok, false, `${JSON.stringify(bad)} must be invalid`);
  }
});

test("resolveProfileSource: absolute complete dir overrides; relative/incomplete/empty/symlink-escape block", async () => {
  const good = await profileDirFixture();
  try {
    const src = await resolveProfileSource({ PI_PASEO_ORCHESTRATION_PROFILES_DIR: good });
    assert.equal(src.ok, true);
    assert.equal(src.source, "override");

    const relative = await resolveProfileSource({ PI_PASEO_ORCHESTRATION_PROFILES_DIR: "profiles" });
    assert.equal(relative.ok, false);

    const incomplete = await mkdtemp(join(tmpdir(), "ppo-incomplete-"));
    await writeFile(join(incomplete, "supervisor.md"), "x");
    assert.equal((await resolveProfileSource({ PI_PASEO_ORCHESTRATION_PROFILES_DIR: incomplete })).ok, false);

    const emptyFile = await mkdtemp(join(tmpdir(), "ppo-empty-"));
    for (const role of ["supervisor", "lead", "peer"]) await writeFile(join(emptyFile, `${role}.md`), "");
    assert.equal((await resolveProfileSource({ PI_PASEO_ORCHESTRATION_PROFILES_DIR: emptyFile })).ok, false);

    const escape = await mkdtemp(join(tmpdir(), "ppo-escape-"));
    const outside = await mkdtemp(join(tmpdir(), "ppo-outside-"));
    await writeFile(join(outside, "peer.md"), "outside bytes");
    for (const role of ["supervisor", "lead"]) await writeFile(join(escape, `${role}.md`), "x");
    await symlink(join(outside, "peer.md"), join(escape, "peer.md"));
    assert.equal((await resolveProfileSource({ PI_PASEO_ORCHESTRATION_PROFILES_DIR: escape })).ok, false);

    assert.equal((await resolveProfileSource({}, join(root, "profiles"))).ok, true, "bundled source must resolve");
  } finally {
    await rm(good, { recursive: true, force: true });
  }
});

async function activatedFixture(ext, { env = {}, models = baseModels(), config = null } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ppo-activate-"));
  if (config) {
    await mkdir(join(dir, "pi-paseo-orchestration"), { recursive: true });
    await writeSettings(dir, config);
  }
  const profiles = await profileDirFixture();
  const modelsUsed = models;
  const result = await ext.activate({
    env: { PI_PASEO_ORCHESTRATION_ROLE: "lead", PASEO_AGENT_ID: "agent-7", ...env },
    dir,
    profileDir: profiles,
    models: modelsUsed,
    setModel: async (m) => { ext.lastModel = m; return true; },
    setThinkingLevel: async (level) => level,
  });
  return { dir, profiles, result };
}

test("activate: governed role requires agent id, settings snapshot, profile, and exact model application", async () => {
  const ext = await freshExtension();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-act-"));
  try {
    const baseEnv = { PI_PASEO_ORCHESTRATION_ROLE: "lead", PASEO_AGENT_ID: "agent-7" };

    const noAgent = await ext.activate({ env: { ...baseEnv, PASEO_AGENT_ID: "" }, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: async (l) => l });
    assert.equal(noAgent.ok, false);

    const noSettings = await ext.activate({ env: baseEnv, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: async (l) => l });
    assert.equal(noSettings.ok, false);

    await writeSettings(dir, validDoc);
    const unknownModel = await ext.activate({ env: { ...baseEnv, PI_PASEO_ORCHESTRATION_ROLE: "peer" }, dir, profileDir: profiles, models: [{ provider: "nope", id: "nope" }], setModel: async () => true, setThinkingLevel: async (l) => l });
    assert.equal(unknownModel.ok, false);

    const ok = await ext.activate({ env: baseEnv, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: async (l) => l });
    assert.equal(ok.ok, true);
    assert.equal(ok.latch.role, "lead");
    assert.equal(ok.latch.agentId, "agent-7");
    assert.deepEqual(ok.latch.settings, validDoc);
    assert.match(ok.latch.profileText, /# lead profile/);
    assert.equal(ok.latch.profileDigest, digestOf(ok.latch.profileText));

    // Passive role latches nothing.
    const passive = await ext.activate({ env: { PASEO_AGENT_ID: "agent-7" }, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: async (l) => l });
    assert.equal(passive.ok, true);
    assert.equal(passive.latch, null);
  } finally {
    await rm(profiles, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifyLatch: settings, profile, role, or agent drift blocks; unchanged passes", async () => {
  const ext = await freshExtension();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-verify-"));
  try {
    await writeSettings(dir, validDoc);
    const baseEnv = { PI_PASEO_ORCHESTRATION_ROLE: "lead", PASEO_AGENT_ID: "agent-7" };
    const { latch } = await ext.activate({ env: baseEnv, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: async (l) => l });

    assert.equal((await ext.verifyLatch(latch, baseEnv, dir, profiles)).ok, true);

    await writeSettings(dir, { ...validDoc, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, thinking: "low" } } });
    assert.equal((await ext.verifyLatch(latch, baseEnv, dir, profiles)).ok, false);

    await writeSettings(dir, validDoc);
    const drifted = { ...latch, role: "peer" };
    assert.equal((await ext.verifyLatch(drifted, baseEnv, dir, profiles)).ok, false);

    const driftedEnv = { ...baseEnv, PI_PASEO_ORCHESTRATION_ROLE: "peer" };
    assert.equal((await ext.verifyLatch(latch, driftedEnv, dir, profiles)).ok, false);

    const driftedAgent = { ...baseEnv, PASEO_AGENT_ID: "agent-8" };
    assert.equal((await ext.verifyLatch(latch, driftedAgent, dir, profiles)).ok, false);

    await writeFile(join(profiles, "lead.md"), "# changed profile\n");
    assert.equal((await ext.verifyLatch(latch, baseEnv, dir, profiles)).ok, false);
  } finally {
    await rm(profiles, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("intersectTools: baseline ∩ role ceiling, mcp_script never included", () => {
  const baseline = ["read", "bash", "write", "edit", "mcp", "mcp_script", "ls", "todo"];
  assert.deepEqual(extension.intersectTools(baseline, "peer"), ["read", "bash"]);
  assert.deepEqual(extension.intersectTools(baseline, "lead"), ["read", "bash", "mcp"]);
  assert.deepEqual(extension.intersectTools(baseline, "supervisor"), ["read", "bash", "mcp"]);
  assert.deepEqual(extension.intersectTools(["read", "bash", "mcp"], "peer"), ["read", "bash"]);
});

test("checkToolCall: closed per-role gates, outer MCP validation, git publication routes", () => {
  const peerPolicy = { role: "peer", allowed: ["read", "bash"] };
  const leadPolicy = { role: "lead", allowed: ["read", "bash", "mcp"] };

  assert.equal(extension.checkToolCall("read", {}, peerPolicy), undefined);
  assert.equal(extension.checkToolCall("write", { path: "/x" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("edit", { path: "/x" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("mcp_script", {}, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("mcp_script", {}, leadPolicy).block, true);
  assert.equal(extension.checkToolCall("todo", {}, peerPolicy).block, true);

  // Outer MCP: no validated targets configured yet → all blocked, malformed fails closed.
  assert.equal(extension.checkToolCall("mcp", { tool: "x" }, leadPolicy).block, true);
  assert.equal(extension.checkToolCall("mcp", "not-an-object", leadPolicy).block, true);

  // With a validated fixture target, exact server/tool/args pass and drift fails closed.
  const observerPolicy = { role: "lead", allowed: ["read", "bash", "mcp"], mcpTargets: { paseo: new Set(["observe_current_agent"]) } };
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "observe_current_agent", args: {} }, observerPolicy), undefined);
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "unknown_tool", args: {} }, observerPolicy).block, true);
  assert.equal(extension.checkToolCall("mcp", { server: "other", tool: "observe_current_agent", args: {} }, observerPolicy).block, true);
  assert.equal(extension.checkToolCall("mcp", { tool: "observe_current_agent" }, observerPolicy).block, true);
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "observe_current_agent", args: "nope" }, observerPolicy).block, true);

  // Git: commits need a grant (none yet) and publication routes are always blocked.
  for (const cmd of ["git commit -m x", "git push origin main", "git push --force origin main", "git merge feature", "git commit --amend", "gh pr create", "git pull --rebase && git push"]) {
    assert.equal(extension.checkToolCall("bash", { command: cmd }, peerPolicy).block, true, `must block: ${cmd}`);
  }
  for (const cmd of ["git status", "git log --oneline", "git diff", "git branch -a", "git fetch origin", "ls -la", "npm test", "git checkout -b feature", "git stash list"]) {
    assert.equal(extension.checkToolCall("bash", { command: cmd }, peerPolicy), undefined, `must pass: ${cmd}`);
  }
});

test("wiring: passive env stays ungoverned; governed blocks input, injects profile, shapes tools, gates calls", async () => {
  const ext = await freshExtension();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-wire-"));
  try {
    await writeSettings(dir, validDoc);
    const fake = fakePi({
      activeTools: ["read", "bash", "write", "mcp", "mcp_script"],
      env: { PI_PASEO_ORCHESTRATION_ROLE: "lead", PASEO_AGENT_ID: "agent-7", PI_CODING_AGENT_DIR: dir, PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles },
    });
    fake.pi.setActiveTools = (tools) => { fake.holder.activeTools = [...tools]; };
    fake.pi.getActiveTools = () => [...fake.holder.activeTools];
    ext.default(fake.pi);

    assert.deepEqual([...fake.handlers.keys()].sort(), ["before_agent_start", "input", "session_before_fork", "session_before_switch", "session_start", "tool_call"]);

    // session_start activates with exact model application.
    const registry = fake.ctx.modelRegistry;
    fake.ctx.model = registry.find("anthropic", "claude-sonnet-4-5");
    fake.ctx.thinkingLevel = "medium";
    const modelRegistry = { ...registry };
    fake.ctx.modelRegistry = {
      ...modelRegistry,
      find: (p, id) => registry.find(p, id),
    };
    await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);

    // Baseline snapshot → effective tools shaped at run start.
    const beforeResult = await fake.handlers.get("before_agent_start")(
      { prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: ["read", "bash", "write", "mcp", "mcp_script"] } },
      fake.ctx,
    );
    assert.deepEqual(fake.holder.activeTools, ["read", "bash", "mcp"]);
    assert.match(beforeResult.systemPrompt, /<pi-paseo-orchestration role="lead"/);
    assert.match(beforeResult.systemPrompt, /# lead profile/);
    assert.doesNotMatch(beforeResult.systemPrompt, /write/);

    // tool_call: write blocked, read passes, mcp blocked (no validated targets).
    const blocked = await fake.handlers.get("tool_call")({ toolName: "write", input: { path: "/x" } }, fake.ctx);
    assert.equal(blocked.block, true);
    const passed = await fake.handlers.get("tool_call")({ toolName: "read", input: {} }, fake.ctx);
    assert.equal(passed, undefined);
    const mcpBlocked = await fake.handlers.get("tool_call")({ toolName: "mcp", input: { server: "paseo", tool: "x" } }, fake.ctx);
    assert.equal(mcpBlocked.block, true);

    // Governed: Pi-native new/fork are cancelled.
    assert.equal((await fake.handlers.get("session_before_switch")({}, fake.ctx)).cancel, true);
    assert.equal((await fake.handlers.get("session_before_fork")({}, fake.ctx)).cancel, true);

    // Input gate: intact state passes through, drift blocks.
    const inputPass = await fake.handlers.get("input")({ text: "hi", source: "interactive" }, fake.ctx);
    assert.deepEqual(inputPass, { action: "continue" });
    await writeSettings(dir, { ...validDoc, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, thinking: "low" } } });
    const inputBlock = await fake.handlers.get("input")({ text: "hi", source: "interactive" }, fake.ctx);
    assert.deepEqual(inputBlock, { action: "handled" });
    assert.equal(fake.notifications.some(([, level]) => level === "error"), true);
  } finally {
    await rm(profiles, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("wiring: passive process is never blocked, profiled, or shaped", async () => {
  const ext = await freshExtension();
  const fake = fakePi({ env: { PI_CODING_AGENT_DIR: "/nonexistent-ppo" } });
  ext.default(fake.pi);
  await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);
  const input = await fake.handlers.get("input")({ text: "hi" }, fake.ctx);
  assert.deepEqual(input, { action: "continue" });
  const before = await fake.handlers.get("before_agent_start")({ prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: ["read", "bash"] } }, fake.ctx);
  assert.equal(before, undefined);
  assert.deepEqual(fake.holder.activeTools, []);
});

test("checkToolCall: prototype-named mcp servers fail closed without crashing", () => {
  const leadPolicy = { role: "lead", allowed: ["read", "bash", "mcp"] };
  for (const server of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    assert.equal(extension.checkToolCall("mcp", { server, tool: "x", args: {} }, leadPolicy).block, true, `${server} must be blocked`);
  }
});

test("checkToolCall: git global-flag forms and deploy routes are blocked", () => {
  const peerPolicy = { role: "peer", allowed: ["read", "bash"] };
  for (const cmd of [
    "git --no-pager commit -m x",
    "git -C /repo push origin main",
    "git --git-dir=/x/.git merge feature",
    "vercel deploy",
    "netlify deploy",
    "flyctl deploy --remote-only",
    "git status && vercel deploy",
  ]) {
    assert.equal(extension.checkToolCall("bash", { command: cmd }, peerPolicy).block, true, `must block: ${cmd}`);
  }
});

test("wiring: missing read or outer mcp baseline blocks a governed lead", async () => {
  const ext = await freshExtension();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-prereq-"));
  try {
    await writeSettings(dir, validDoc);
    const env = { PI_PASEO_ORCHESTRATION_ROLE: "lead", PASEO_AGENT_ID: "agent-7", PI_CODING_AGENT_DIR: dir, PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles };

    // Lead without the outer mcp tool: activation succeeds, baseline check blocks.
    const fakeNoMcp = fakePi({ activeTools: ["read", "bash"], env });
    fakeNoMcp.pi.getActiveTools = () => [...fakeNoMcp.holder.activeTools];
    ext.default(fakeNoMcp.pi);
    await fakeNoMcp.handlers.get("session_start")({ reason: "startup" }, fakeNoMcp.ctx);
    const blockedInput = await fakeNoMcp.handlers.get("input")({ text: "hi" }, fakeNoMcp.ctx);
    assert.deepEqual(blockedInput, { action: "handled" });
    assert.equal(fakeNoMcp.notifications.some(([msg]) => /outer mcp tool is not active/.test(msg)), true);

    // Peer without read: blocked too.
    const ext2 = await freshExtension();
    const fakeNoRead = fakePi({ activeTools: ["bash"], env: { ...env, PI_PASEO_ORCHESTRATION_ROLE: "peer" } });
    fakeNoRead.pi.getActiveTools = () => [...fakeNoRead.holder.activeTools];
    ext2.default(fakeNoRead.pi);
    await fakeNoRead.handlers.get("session_start")({ reason: "startup" }, fakeNoRead.ctx);
    const blockedRead = await fakeNoRead.handlers.get("input")({ text: "hi" }, fakeNoRead.ctx);
    assert.deepEqual(blockedRead, { action: "handled" });
    assert.equal(fakeNoRead.notifications.some(([msg]) => /read tool is not active/.test(msg)), true);
  } finally {
    await rm(profiles, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});
