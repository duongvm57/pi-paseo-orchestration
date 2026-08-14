import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFile = promisify(execFileCallback);

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
  { provider: "anthropic", id: "claude-sonnet-4-5", name: "Sonnet", reasoning: true },
  { provider: "openai", id: "gpt-5", name: "GPT-5", reasoning: true },
];

const fakePi = (ctxOverrides = {}) => {
  const role = ctxOverrides.env?.PI_PASEO_ORCHESTRATION_ROLE;
  const runtimeModel = role === "peer" ? baseModels()[1] : baseModels()[0];
  const runtimeThinking = role === "supervisor" ? "high" : role === "peer" ? "off" : "medium";
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  const notifications = [];
  const holder = { activeTools: [...(ctxOverrides.activeTools ?? [])], modelCalls: [], sentMessages: [], thinking: runtimeThinking };
  const ui = {
    select: async () => null,
    confirm: async () => false,
    notify: (...args) => notifications.push(args),
    ...(ctxOverrides.ui ?? {}),
  };
  return {
    handlers,
    commands,
    tools,
    notifications,
    holder,
    pi: {
      registerCommand: (name, definition) => commands.set(name, definition),
      // Current Pi API: registerTool accepts ONE definition object with name,
      // label, description, parameters, execute. The old two-argument form is
      // gone — passing a name string yields a tool whose .name is undefined,
      // which breaks the provider payload ("missing field `name`"). The stub
      // mirrors the real runtime: a string first argument is a fake failure.
      registerTool: (definition) => {
        if (typeof definition !== "object" || definition === null || typeof definition.name !== "string") {
          throw new Error("registerTool must receive a definition object with a string name");
        }
        tools.set(definition.name, definition);
      },
      on: (name, handler) => handlers.set(name, handler),
      setActiveTools: (tools) => { holder.activeTools = [...tools]; },
      getActiveTools: () => [...holder.activeTools],
      setModel: (model) => { holder.modelCalls.push(["setModel", model.provider, model.id]); return true; },
      setThinkingLevel: (level) => { holder.modelCalls.push(["setThinkingLevel", level]); holder.thinking = level; },
      getThinkingLevel: () => holder.thinking,
      sendMessage: (message, options) => { holder.sentMessages.push([message, options]); },
      sendUserMessage: (message) => { holder.sentUserMessage = message; },
    },
    ctx: {
      ui,
      env: (() => { const e = { ...process.env }; for (const k of Object.keys(e)) { if (k === "PASEO_AGENT_ID" || k.startsWith("PI_PASEO_ORCHESTRATION")) delete e[k]; } return { ...e, ...(ctxOverrides.env ?? {}) }; })(),
      model: runtimeModel,
      thinkingLevel: runtimeThinking,
      modelRegistry: {
        getAvailable: () => baseModels(),
        find: (provider, id) => baseModels().find((m) => m.provider === provider && m.id === id),
        complete: () => { throw new Error("settings must never invoke a model"); },
      },
      observeParentAgentId: async () => role === "peer" ? "lead-7" : null,
      ...(ctxOverrides.ctx ?? {}),
    },
  };
};

const peerRoute = (description, over = {}) => ({ description, provider: "openai", model: "gpt-5", thinking: "off", ...over });
const validDoc = {
  version: 2,
  roles: {
    supervisor: { provider: "anthropic", model: "claude-sonnet-4-5", thinking: "high" },
    lead: { provider: "anthropic", model: "claude-sonnet-4-5", thinking: "medium" },
  },
  peer_routes: {
    fast: peerRoute("Low-cost, low-latency bounded triage and simple read-only work."),
    general: peerRoute("Balanced default for mixed repository work."),
    reasoning: peerRoute("Deep analysis for ambiguous or high-complexity problems."),
    coding: peerRoute("Implementation, debugging, and verification."),
    architecture: peerRoute("Architecture, migration, lifecycle, and hard-to-reverse decisions."),
    reviewer: peerRoute("Independent review of correctness, security, regressions, and maintainability."),
  },
};
const modelSettingsQueue = () => [
  "Role models",
  "anthropic", "claude-sonnet-4-5", "high",
  "anthropic", "claude-sonnet-4-5", "medium",
  "Use one model for all routes", "openai", "gpt-5", "off", "Finish",
];

test("manifest declares one Pi extension and the two packaged skills", () => {
  assert.deepEqual(manifest.pi, {
    extensions: ["./extensions/pi-paseo-orchestration.ts"],
    skills: ["./skills/workspace-protocol/SKILL.md", "./skills/ppo-orchestrate/SKILL.md"],
  });
  assert.deepEqual(manifest.scripts, { test: "node --test test/package.test.mjs", typecheck: "tsc --noEmit", "release:smoke": "node test/release-smoke.mjs" });

  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    assert.equal(manifest[field]?.["pi-mcp-adapter"], undefined);
  }
});

test("npm tarball is public, versioned, and contains only runtime package resources", async () => {
  assert.equal(manifest.name, "pi-paseo-orchestration");
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.notEqual(manifest.private, true);
  assert.deepEqual(manifest.publishConfig, { access: "public" });
  assert.deepEqual(manifest.files, [
    "extensions/pi-paseo-orchestration.ts",
    "profiles/*.md",
    "skills/ppo-orchestrate/SKILL.md",
    "skills/workspace-protocol/SKILL.md",
    "skills/workspace-protocol/AUTHORING-GUIDE.md",
  ]);

  const { stdout } = await execFile("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root });
  const [packed] = JSON.parse(stdout);
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  assert.deepEqual(packed.files.map(({ path }) => path).sort(), [
    "README.md",
    "extensions/pi-paseo-orchestration.ts",
    "package.json",
    "profiles/lead.md",
    "profiles/peer.md",
    "profiles/supervisor.md",
    "skills/ppo-orchestrate/SKILL.md",
    "skills/workspace-protocol/AUTHORING-GUIDE.md",
    "skills/workspace-protocol/SKILL.md",
  ]);
});

test("declared resources and private profiles are nonempty files", async () => {
  const paths = [
    manifest.pi.extensions[0],
    ...manifest.pi.skills,
    "skills/workspace-protocol/AUTHORING-GUIDE.md",
    "profiles/supervisor.md",
    "profiles/lead.md",
    "profiles/peer.md",
  ];

  for (const path of paths) {
    const file = join(root, path);
    assert.equal((await stat(file)).isFile(), true, `${path} must be a file`);
    assert.notEqual((await readFile(file, "utf8")).trim(), "", `${path} must be nonempty`);
  }
  for (const role of ["lead", "peer", "supervisor"]) {
    assert.match(await readFile(join(root, `profiles/${role}.md`), "utf8"), /short IDs are display-only/);
  }

  assert.equal(JSON.stringify(manifest.pi).includes("profiles"), false);
  const skill = await readFile(join(root, manifest.pi.skills[0]), "utf8");
  const orchestrationSkill = await readFile(join(root, manifest.pi.skills[1]), "utf8");
  const guide = await readFile(join(root, "skills/workspace-protocol/AUTHORING-GUIDE.md"), "utf8");
  assert.match(skill, /^---\nname: workspace-protocol\ndescription: .+\n---/);
  assert.match(skill, /\.\/AUTHORING-GUIDE\.md/);
  assert.match(orchestrationSkill, /^---\nname: ppo-orchestrate\ndescription: .+\ncompatibility: .+\n---/);
  assert.match(orchestrationSkill, /paseo_create_agent/);
  assert.match(orchestrationSkill, /paseo_send_agent_prompt/);
  assert.match(orchestrationSkill, /"server":"paseo","tool":"paseo_<operation>","args":\{\.\.\.\}/);
  assert.match(orchestrationSkill, /outer tool is a transport, not a discovery or status operation/);
  assert.match(orchestrationSkill, /complete the Peer brief/);
  assert.match(orchestrationSkill, /Copy the exact applicable terminal template/);
  assert.match(orchestrationSkill, /After two follow-ups addressing the same symptom or an unchanged prerequisite/);
  assert.match(orchestrationSkill, /one writer per moving scope/);
  assert.match(orchestrationSkill, /no \/ppo:bootstrap|Human creates the root Lead/);
  assert.match(orchestrationSkill, /binds one exact Lead|root agent/);
  assert.match(await readFile(join(root, "profiles/supervisor.md"), "utf8"), /binds one exact Lead agent ID and Human task/);
  assert.doesNotMatch(orchestrationSkill, /full-topology-test|scripts\/run\.mjs/);
  assert.match(guide, /^# Workspace Protocol Authoring Guide\n/);
  assert.deepEqual(guide.match(/^## \d+\..+$/gm), [
    "## 1. Protocol boundary",
    "## 2. Readers and decision authority",
    "## 3. Required protocol content",
    "## 4. Content to leave out",
    "## 5. Routing patterns",
    "## 6. Evidence and independent judgment",
    "## 7. Anti-pattern catalog",
    "## 8. Protocol evolution",
    "## 9. Authoring quality check",
  ]);
  const skeletonMatch = /<!-- canonical-protocol-skeleton:start -->\n```md\n([\s\S]+?)\n```\n<!-- canonical-protocol-skeleton:end -->/.exec(guide);
  assert.notEqual(skeletonMatch, null, "guide must contain one canonical protocol skeleton");
  const skeleton = skeletonMatch[1].replace("YYYY-MM-DD", "2026-01-01").replace("HUMAN_DEFINED_ID", "guide-fixture");
  assert.equal(extension.validateProtocol(skeleton).ok, true, extension.validateProtocol(skeleton).error);
  assert.match(guide, /git:v1:<task-base-full-oid>:<candidate-full-oid>/);
  assert.match(guide, /Human is the sole Local Accepter|Sole accepter through a direct canonical Human acceptance block/);
  assert.match(guide, /optional `Anti-patterns` section/);
  assert.doesNotMatch(guide, /[^\x00-\x7F]/);
  assert.match(await readFile(join(root, "profiles/peer.md"), "utf8"), /classify material premises as supported, partial, or failed/);
});



test("settings document is closed: valid doc passes, every drift fails", () => {
  assert.deepEqual(validateSettings(validDoc), { ok: true });

  const invalid = [
    ["missing version", { ...validDoc, version: undefined }],
    ["wrong version", { ...validDoc, version: 1 }],
    ["missing role", { ...validDoc, roles: { lead: validDoc.roles.lead } }],
    ["extra role", { ...validDoc, roles: { ...validDoc.roles, peer: validDoc.peer_routes.general } }],
    ["missing role key", { ...validDoc, roles: { ...validDoc.roles, lead: { provider: "x", model: "y" } } }],
    ["extra role key", { ...validDoc, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, effort: "high" } } }],
    ["empty provider", { ...validDoc, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, provider: "" } } }],
    ["non-string model", { ...validDoc, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, model: 5 } } }],
    ["unknown thinking", { ...validDoc, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, thinking: "turbo" } } }],
    ["roles not object", { ...validDoc, roles: [] }],
    ["missing default route", { ...validDoc, peer_routes: { ...validDoc.peer_routes, fast: undefined } }],
    ["invalid custom route", { ...validDoc, peer_routes: { ...validDoc.peer_routes, "Bad Route": validDoc.peer_routes.fast } }],
    ["route extra key", { ...validDoc, peer_routes: { ...validDoc.peer_routes, fast: { ...validDoc.peer_routes.fast, effort: "high" } } }],
  ];

  for (const [label, doc] of invalid) {
    assert.notEqual(validateSettings(doc).ok, true, `${label} must fail`);
  }
});

test("readSettings: missing file is null, v1 migrates in memory, malformed or invalid state throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-read-"));
  try {
    assert.equal(await readSettings(dir), null);

    const v1Dir = join(dir, "pi-paseo-orchestration");
    await mkdir(v1Dir, { recursive: true });
    const v1 = { version: 1, roles: { ...validDoc.roles, peer: { provider: "openai", model: "gpt-5", thinking: "off" } } };
    await writeFile(join(v1Dir, "settings.json"), JSON.stringify(v1), "utf8");
    const migrated = await readSettings(dir);
    assert.equal(migrated.version, 2);
    assert.deepEqual(migrated.peer_routes.fast, validDoc.peer_routes.fast);
    assert.deepEqual(JSON.parse(await readFile(join(v1Dir, "settings.json"), "utf8")), v1, "migration must not mutate prior bytes");

    const bad = join(dir, "pi-paseo-orchestration");
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
    const next = { ...validDoc, peer_routes: { ...validDoc.peer_routes, fast: { ...validDoc.peer_routes.fast, thinking: "low" } } };
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
  const settings = fake.commands.get("ppo:settings");
  await settings.handler("", { ...fake.ctx, env: env ?? process.env });
  return fake;
}

test("extension registers the settings command and a handler that never calls a model", async () => {
  const fake = fakePi();
  fake.pi.registerCommand("ppo:settings", {
    description: "…",
    handler: async () => { throw new Error("no model call"); },
  });
  const source = await readFile(join(root, manifest.pi.extensions[0]), "utf8");
  const ext = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  ext.default(fake.pi);
  assert.deepEqual([...fake.commands.keys()].sort(), [
    "ppo:doctor",
    "ppo:notebook-init",
    "ppo:settings",
  ]);
  assert.equal(fake.commands.has("ppo:notebook-append"), false);
  assert.equal([...fake.commands.keys()].some((name) => name.startsWith("pi-paseo-orchestration:")), false);
  // Provider contract: tool names must match ^[a-zA-Z0-9_-]+$ — a colon or
  // other punctuation breaks every chat request ("Invalid 'tools[n].function.name'")
  // even when the name field itself is present.
  for (const name of fake.tools.keys()) {
    assert.match(name, /^[a-zA-Z0-9_-]+$/, `tool name ${name} must match the provider pattern`);
  }
  assert.equal(fake.tools.get("supervisor_notebook_append")?.label, "Supervisor Notebook Append");
  assert.equal(typeof fake.tools.get("supervisor_notebook_append")?.execute, "function");
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
    const queue = modelSettingsQueue();
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

test("settings command: Esc at saved-settings edit menu preserves prior settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-custom-cancel-"));
  try {
    await writeSettings(dir, validDoc);
    const before = await readFile(settingsPath(dir), "utf8");
    const queue = ["Role models", null];
    const fake = fakePi({ ui: { select: async () => queue.shift(), confirm: async () => true } });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });
    assert.equal(await readFile(settingsPath(dir), "utf8"), before);
    assert.equal(fake.notifications.some(([message]) => /Cancelled/.test(message)), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings command: saved settings ask what to edit before model fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-edit-target-"));
  try {
    await writeSettings(dir, validDoc);
    const calls = [];
    const queue = ["Role models", "Supervisor", "anthropic", "claude-sonnet-4-5", "high"];
    const fake = fakePi({ ui: {
      select: async (title) => { calls.push(title); return queue.shift() ?? null; },
      confirm: async () => false,
    } });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });
    assert.deepEqual(calls.slice(0, 3), ["PPO settings:", "Edit saved model settings:", "Provider for supervisor:"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings command: saved settings can be configured end-to-end again", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-reconfigure-all-"));
  try {
    await writeSettings(dir, validDoc);
    const calls = [];
    const queue = [
      "Role models", "Configure all settings",
      "anthropic", "claude-sonnet-4-5", "high",
      "anthropic", "claude-sonnet-4-5", "medium",
      "Use one model for all built-in routes", "openai", "gpt-5", "off",
    ];
    const fake = fakePi({ ui: {
      select: async (title) => { calls.push(title); return queue.shift() ?? null; },
      confirm: async () => false,
    } });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });
    assert.equal(calls.includes("Provider for supervisor:"), true);
    assert.equal(calls.includes("Provider for lead:"), true);
    assert.equal(calls.includes("Provider for all built-in Peer routes:"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings command: confirmed selection writes exactly one closed document", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-write-"));
  try {
    const queue = modelSettingsQueue();
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

    const fake = fakePi({ ui: { select: async () => "Role models" } });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });

    assert.equal(await readFile(join(priorDir, "settings.json"), "utf8"), "{broken");
    assert.equal(fake.notifications.some(([, level]) => level === "error"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings command: installs only three PPO Paseo profiles and preserves other config", async () => {
  const home = await mkdtemp(join(tmpdir(), "ppo-paseo-home-"));
  try {
    const path = join(home, "config.json");
    await writeFile(path, JSON.stringify({ version: 1, daemon: { port: 9 }, agents: { providers: { custom: { enabled: true }, "ppo-peer": { stale: true } } } }), "utf8");
    const queue = ["Paseo profiles"];
    const fake = fakePi({ ui: { select: async () => queue.shift() ?? null, confirm: async () => true } });
    await runSettingsWith(fake, { ...process.env, PASEO_HOME: home });
    const config = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(config.daemon, { port: 9 });
    assert.deepEqual(config.agents.providers.custom, { enabled: true });
    assert.equal(config.agents.providers["ppo-peer"].env.PI_PASEO_ORCHESTRATION_ROLE, "peer");
    assert.match(fake.notifications.at(-1)[0], /Restart Paseo/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

// ─── Slice 2: role activation & policy guardrail ───────────────────────────────

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

    const noAgent = await ext.activate({ env: { ...baseEnv, PASEO_AGENT_ID: "" }, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: (l) => {}, getThinkingLevel: () => "medium" });
    assert.equal(noAgent.ok, false);

    const noSettings = await ext.activate({ env: baseEnv, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: (l) => {}, getThinkingLevel: () => "medium" });
    assert.equal(noSettings.ok, false);

    await writeSettings(dir, validDoc);
    const peerEnv = { ...baseEnv, PI_PASEO_ORCHESTRATION_ROLE: "peer" };
    const approvedPeer = await ext.activate({ env: peerEnv, dir, profileDir: profiles, models: baseModels(), currentModel: baseModels()[1], currentThinking: "off", observedParentAgentId: "lead-7", expectedParentAgentId: "lead-7", setModel: async () => true, setThinkingLevel: () => {}, getThinkingLevel: () => "off" });
    assert.equal(approvedPeer.ok, true);
    assert.equal(approvedPeer.latch.selectedPeerRoute, "fast");
    const unapprovedPeer = await ext.activate({ env: peerEnv, dir, profileDir: profiles, models: baseModels(), currentModel: baseModels()[0], currentThinking: "high", observedParentAgentId: "lead-7", setModel: async () => true, setThinkingLevel: () => {}, getThinkingLevel: () => "high" });
    assert.equal(unapprovedPeer.ok, false);
    assert.match(unapprovedPeer.error, /allowed Human-configured route/);
    const wrongPeerThinking = await ext.activate({ env: peerEnv, dir, profileDir: profiles, models: baseModels(), currentModel: baseModels()[1], currentThinking: "high", observedParentAgentId: "lead-7", setModel: async () => true, setThinkingLevel: () => {}, getThinkingLevel: () => "high" });
    assert.equal(wrongPeerThinking.ok, false);

    // setThinkingLevel returns void in the real Pi API; the effective level
    // must be read back. A clamped level (read-back mismatch) blocks.
    const clamped = await ext.activate({ env: baseEnv, dir, profileDir: profiles, models: baseModels(), observedParentAgentId: null, setModel: async () => true, setThinkingLevel: (l) => {}, getThinkingLevel: () => "off" });
    assert.equal(clamped.ok, false);
    assert.match(clamped.error, /unavailable or clamped/);
    const noObservation = await ext.activate({ env: baseEnv, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: (l) => {}, getThinkingLevel: () => "medium" });
    assert.equal(noObservation.ok, false);
    assert.match(noObservation.error, /requires live Paseo self\/topology evidence/);

    const ok = await ext.activate({ env: baseEnv, dir, profileDir: profiles, models: baseModels(), observedParentAgentId: null, setModel: async () => true, setThinkingLevel: (l) => {}, getThinkingLevel: () => "medium" });
    assert.equal(ok.ok, true);
    assert.equal(ok.latch.role, "lead");
    assert.equal(ok.latch.agentId, "agent-7");
    assert.deepEqual(ok.latch.settings, validDoc);
    assert.match(ok.latch.profileText, /# lead profile/);
    assert.equal(ok.latch.profileDigest, digestOf(ok.latch.profileText));

    // Passive role latches nothing.
    const passive = await ext.activate({ env: { PASEO_AGENT_ID: "agent-7" }, dir, profileDir: profiles, models: baseModels(), setModel: async () => true, setThinkingLevel: (l) => {}, getThinkingLevel: () => "medium" });
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
    const runtime = { model: baseModels()[0], thinkingLevel: "medium" };
    const { latch } = await ext.activate({ env: baseEnv, dir, profileDir: profiles, models: baseModels(), observedParentAgentId: null, setModel: async () => true, setThinkingLevel: (l) => {}, getThinkingLevel: () => "medium" });

    assert.equal((await ext.verifyLatch(latch, baseEnv, dir, runtime)).ok, true);

    await writeSettings(dir, { ...validDoc, roles: { ...validDoc.roles, lead: { ...validDoc.roles.lead, thinking: "low" } } });
    assert.equal((await ext.verifyLatch(latch, baseEnv, dir, runtime)).ok, false);

    await writeSettings(dir, validDoc);
    const drifted = { ...latch, role: "peer" };
    assert.equal((await ext.verifyLatch(drifted, baseEnv, dir, runtime)).ok, false);

    const driftedEnv = { ...baseEnv, PI_PASEO_ORCHESTRATION_ROLE: "peer" };
    assert.equal((await ext.verifyLatch(latch, driftedEnv, dir, runtime)).ok, false);

    const driftedAgent = { ...baseEnv, PASEO_AGENT_ID: "agent-8" };
    assert.equal((await ext.verifyLatch(latch, driftedAgent, dir, runtime)).ok, false);

    await writeFile(join(profiles, "lead.md"), "# changed profile\n");
    assert.equal((await ext.verifyLatch(latch, baseEnv, dir, runtime)).ok, false);
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

  // Git: local reversible commit is allowed for implementation roles with no authority state.
  for (const cmd of ["git push origin main", "git push --force origin main", "git merge feature", "git commit --amend", "gh pr create", "git pull --rebase && git push"]) {
    assert.equal(extension.checkToolCall("bash", { command: cmd }, peerPolicy).block, true, `must block: ${cmd}`);
  }
  const listPolicy = { role: "lead", allowed: ["mcp"], mcpTargets: { paseo: new Set(["paseo_list_agents"]) } };
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "paseo_list_agents", args: { statuses: ["idle", "running"], limit: 100 } }, listPolicy), undefined);
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "paseo_list_agents", args: { workspaceId: "guessed" } }, listPolicy).block, true);

  for (const cmd of ["git commit -m x", "git status", "git log --oneline", "git diff", "git branch -a", "git fetch origin", "ls -la", "npm test", "git checkout -b feature", "git stash list"]) {
    assert.equal(extension.checkToolCall("bash", { command: cmd }, peerPolicy), undefined, `must pass: ${cmd}`);
  }
});


test("checkToolCall: Lead lifecycle routes target only live-reconciled Peer children", () => {
  const policy = {
    role: "lead",
    allowed: ["mcp"],
    mcpTargets: { paseo: new Set(["send_agent_prompt", "get_agent_status", "get_agent_activity", "cancel_agent", "archive_agent"]) },
    reconciledChildId: "peer-1",
  };
  for (const tool of ["paseo_get_agent_status", "paseo_get_agent_activity", "paseo_cancel_agent", "paseo_archive_agent"]) {
    assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool, args: { agentId: "peer-1" } }, policy), undefined);
    // A non-reconciled target fails closed: only live reconciliation is authoritative.
    assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool, args: { agentId: "other" } }, policy).block, true);
    assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool, args: { agentId: "peer-2" } }, { ...policy, reconciledChildId: null }).block, true);
  }
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "paseo_send_agent_prompt", args: { agentId: "peer-1", prompt: "Return exact evidence" } }, policy), undefined);
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "paseo_send_agent_prompt", args: { agentId: "peer-1", prompt: "" } }, policy).block, true);
  const eventPolicy = { ...policy, reconciledChildId: null, reconciledEventRecipientId: "sup-1" };
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "paseo_send_agent_prompt", args: { agentId: "sup-1", prompt: "<validated event>" } }, eventPolicy), undefined);
  assert.equal(extension.checkToolCall("mcp", { server: "paseo", tool: "paseo_send_agent_prompt", args: { agentId: "other", prompt: "<validated event>" } }, eventPolicy).block, true);
});

// Cooperative task/assignment labels are OPTIONAL on create_agent (legacy/
// no-label calls stay valid). When supplied, the labels object must be closed
// to exactly the two namespaced correlation keys with trimmed nonempty string
// values. Unknown keys, empty/nonobject labels, empty/untrimmed values,
// workspaceId, and caller-supplied lifecycle task/assignment extras are
// rejected; workspaceId stays omitted so inherited parentage/workspace
// placement is preserved.
test("checkToolCall: create_agent accepts optional closed namespaced correlation labels and rejects drift", () => {
  const createPolicy = {
    role: "lead",
    allowed: ["mcp"],
    mcpTargets: { paseo: new Set(["create_agent"]) },
    peerRoutes: { fast: { provider: "openai", model: "gpt-5", thinking: "off", description: "fast route" } },
    peerProviderAlias: "ppo-peer",
    currentAgentId: "agent-7",
  };
  const blank = { title: "Bounded peer", provider: "ppo-peer/openai/gpt-5", settings: { thinkingOptionId: "off" }, initialPrompt: 'Use "model_route":"fast" and bind "parent_lead_agent_id":"agent-7".', notifyOnFinish: true };
  const call = (args) => extension.checkToolCall("mcp", { server: "paseo", tool: "paseo_create_agent", args }, createPolicy);
  const TASK = "pi-paseo-orchestration.task-key";
  const ASSIGN = "pi-paseo-orchestration.assignment-key";
  // Omitted labels pass (legacy/no-label contract).
  assert.equal(call({ ...blank }), undefined);
  // Exactly one allowed namespaced label passes.
  assert.equal(call({ ...blank, labels: { [TASK]: "task-1" } }), undefined);
  assert.equal(call({ ...blank, labels: { [ASSIGN]: "asgn-1" } }), undefined);
  // Both allowed namespaced labels pass.
  assert.equal(call({ ...blank, labels: { [TASK]: "task-1", [ASSIGN]: "asgn-1" } }), undefined);
  // Unknown key, empty labels object, and nonobject labels block.
  assert.equal(call({ ...blank, labels: { unexpected: "x" } }).block, true);
  assert.equal(call({ ...blank, labels: { [TASK]: "task-1", extra: "x" } }).block, true);
  assert.equal(call({ ...blank, labels: {} }).block, true);
  assert.equal(call({ ...blank, labels: "not-an-object" }).block, true);
  assert.equal(call({ ...blank, labels: [TASK] }).block, true);
  // Empty, untrimmed, and non-string values block.
  assert.equal(call({ ...blank, labels: { [TASK]: "" } }).block, true);
  assert.equal(call({ ...blank, labels: { [TASK]: "   " } }).block, true);
  assert.equal(call({ ...blank, labels: { [TASK]: " padded " } }).block, true);
  assert.equal(call({ ...blank, labels: { [TASK]: 7 } }).block, true);
  // workspaceId and caller-supplied lifecycle task/assignment extras block.
  assert.equal(call({ ...blank, workspaceId: "wks-guessed" }).block, true);
  assert.equal(call({ ...blank, labels: { taskId: "task-1" } }).block, true);
  assert.equal(call({ ...blank, labels: { assignmentId: "asgn-1" } }).block, true);
  assert.equal(call({ ...blank, labels: { [TASK]: "task-1", parentLeadAgentId: "agent-7" } }).block, true);
});

test("wiring: passive env stays ungoverned; governed blocks input, injects profile, shapes tools, gates calls", async () => {
  const ext = await freshExtension();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-wire-"));
  const repo = await gitRepoFixture(); // governed Lead processes need a valid pinned protocol
  const previous = process.cwd();
  process.chdir(repo.dir);
  try {
    await writeSettings(dir, validDoc);
    const fake = fakePi({
      activeTools: ["read", "bash", "write", "mcp", "mcp_script"],
      env: { PI_PASEO_ORCHESTRATION_ROLE: "lead", PI_PASEO_ORCHESTRATION_PEER_ALIAS: "ppo-peer", PASEO_AGENT_ID: "agent-7", PI_CODING_AGENT_DIR: dir, PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles },
    });
    fake.pi.setActiveTools = (tools) => { fake.holder.activeTools = [...tools]; };
    fake.pi.getActiveTools = () => [...fake.holder.activeTools];
    ext.default(fake.pi);

    assert.deepEqual([...fake.handlers.keys()].sort(), ["agent_end", "before_agent_start", "input", "session_before_fork", "session_before_switch", "session_start", "tool_call"]);

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
    assert.deepEqual(fake.holder.activeTools, ["read", "bash", "write", "mcp"]);
    assert.match(beforeResult.systemPrompt, /<pi-paseo-orchestration role="lead"/);
    assert.match(beforeResult.systemPrompt, /# lead profile/);
    assert.match(beforeResult.systemPrompt, /ppo-peer\/openai\/gpt-5/);

    // tool_call: local write/edit and read pass for the Lead role (no authority
    // state), unknown MCP is blocked, and the role-bound create_agent route
    // passes through the real handler.
    const passedWrite = await fake.handlers.get("tool_call")({ toolName: "write", input: { path: "/x" } }, fake.ctx);
    assert.equal(passedWrite, undefined);
    const passed = await fake.handlers.get("tool_call")({ toolName: "read", input: {} }, fake.ctx);
    assert.equal(passed, undefined);
    const mcpBlocked = await fake.handlers.get("tool_call")({ toolName: "mcp", input: { server: "paseo", tool: "x" } }, fake.ctx);
    assert.equal(mcpBlocked.block, true);
    for (const tool of ["paseo_list_workspaces", "paseo_list_providers"]) {
      assert.equal(await fake.handlers.get("tool_call")({ toolName: "mcp", input: { server: "paseo", tool, args: {} } }, fake.ctx), undefined);
      assert.equal((await fake.handlers.get("tool_call")({ toolName: "mcp", input: { server: "paseo", tool, args: { unexpected: true } } }, fake.ctx)).block, true);
    }
    const createPassed = await fake.handlers.get("tool_call")({
      toolName: "mcp",
      input: {
        server: "paseo",
        tool: "paseo_create_agent",
        args: {
          title: "Bounded peer",
          provider: "ppo-peer/openai/gpt-5",
          settings: { thinkingOptionId: "off" },
          initialPrompt: 'Use "model_route":"fast" and return the bounded read-only Peer Report with "parent_lead_agent_id":"agent-7".',
          notifyOnFinish: true,
        },
      },
    }, fake.ctx);
    assert.equal(createPassed, undefined);

    // Integrated-path create_agent label contract: labels omitted passes
    // (legacy); a closed namespaced label object passes; unknown/lifecycle
    // keys and workspaceId drift block through the real handler.
    const createArgs = (extra) => ({
      server: "paseo", tool: "paseo_create_agent",
      args: {
        title: "Bounded peer",
        provider: "ppo-peer/openai/gpt-5",
        settings: { thinkingOptionId: "off" },
        initialPrompt: 'Use "model_route":"fast" and return the bounded read-only Peer Report with "parent_lead_agent_id":"agent-7".',
        notifyOnFinish: true,
        ...extra,
      },
    });
    assert.equal(await fake.handlers.get("tool_call")({ toolName: "mcp", input: createArgs({}) }, fake.ctx), undefined, "labels omitted must pass");
    assert.equal(await fake.handlers.get("tool_call")({ toolName: "mcp", input: createArgs({ labels: { "pi-paseo-orchestration.task-key": "task-1", "pi-paseo-orchestration.assignment-key": "asgn-1" } }) }, fake.ctx), undefined, "closed namespaced labels must pass");
    assert.equal((await fake.handlers.get("tool_call")({ toolName: "mcp", input: createArgs({ labels: { "pi-paseo-orchestration.task-key": "task-1", taskId: "x" } }) }, fake.ctx)).block, true, "unknown lifecycle label key must block");
    assert.equal((await fake.handlers.get("tool_call")({ toolName: "mcp", input: createArgs({ labels: {} }) }, fake.ctx)).block, true, "empty labels object must block");
    assert.equal((await fake.handlers.get("tool_call")({ toolName: "mcp", input: createArgs({ labels: { "pi-paseo-orchestration.task-key": "  " } }) }, fake.ctx)).block, true, "untrimmed label value must block");
    assert.equal((await fake.handlers.get("tool_call")({ toolName: "mcp", input: createArgs({ workspaceId: "wks-guessed" }) }, fake.ctx)).block, true, "workspaceId must block");

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
    await rm(repo.dir, { recursive: true, force: true });
    process.chdir(previous);
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

test("handler: a normal Lead child lifecycle op reconciles through the integrated gate after restart", async () => {
  // Regression (ppo-v02-dogfood-001): dfd2ce1 wired expectedTaskId/expectedAssignmentId
  // from the closed child-operation args (which never carry them), so every normal
  // Lead follow-up/status/cancel/archive call blocked before reconciliation. The
  // revised contract derives the mandatory expected provider from the configured
  // Peer alias (ppo-peer), not the op caller; the fake `paseo inspect` proves live
  // parent/provider/repository match while the op carries only { agentId }.
  const ext = await freshExtension();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-recon-"));
  await writeSettings(dir, validDoc);
  const repo = await gitRepoFixture();
  const bin = await mkdtemp(join(tmpdir(), "ppo-recon-bin-"));
  const previous = process.cwd();
  process.chdir(repo.dir);
  try {
    // The child and the Lead observe identically through the fake CLI: echo the
    // requested id so the bound-Lead task-label observation also resolves, report
    // the configured Peer provider (ppo-peer), and omit workspaceId (unobservable
    // at the CLI lifecycle seam → an explicit environment-ceiling warning, not a
    // PASS and not a deadlock).
    const script = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  printf '{"Id":"%s","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}","ParentAgentId":"lead-9"}' "$2"\n  exit 0\nfi\necho "unknown command" >&2\nexit 1\n`;
    await writeFile(join(bin, "paseo"), script, { mode: 0o755 });

    const fake = fakePi({
      activeTools: ["read", "bash", "mcp", "mcp_script"],
      env: { PI_PASEO_ORCHESTRATION_ROLE: "lead", PI_PASEO_ORCHESTRATION_PEER_ALIAS: "ppo-peer", PASEO_AGENT_ID: "lead-9", PASEO_LEAD_AGENT_ID: "", PI_CODING_AGENT_DIR: dir, PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles, PATH: `${bin}:${process.env.PATH ?? ""}` },
    });
    fake.pi.setActiveTools = (tools) => { fake.holder.activeTools = [...tools]; };
    fake.pi.getActiveTools = () => [...fake.holder.activeTools];
    ext.default(fake.pi);
    const registry = fake.ctx.modelRegistry;
    fake.ctx.model = registry.find("anthropic", "claude-sonnet-4-5");
    fake.ctx.thinkingLevel = "medium";
    fake.ctx.modelRegistry = { ...registry };
    await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);
    await fake.handlers.get("before_agent_start")(
      { prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: ["read", "bash", "mcp", "mcp_script"] } },
      fake.ctx,
    );

    // Every real closed child-operation shape (agentId [+ prompt]) must be usable.
    const opShapes = [
      { server: "paseo", tool: "send_agent_prompt", args: { agentId: "agent-42", prompt: "Return exact evidence" } },
      { server: "paseo", tool: "get_agent_status", args: { agentId: "agent-42" } },
      { server: "paseo", tool: "get_agent_activity", args: { agentId: "agent-42" } },
      { server: "paseo", tool: "cancel_agent", args: { agentId: "agent-42" } },
      { server: "paseo", tool: "archive_agent", args: { agentId: "agent-42" } },
    ];
    for (const op of opShapes) {
      const res = await fake.handlers.get("tool_call")({ toolName: "mcp", input: op }, fake.ctx);
      assert.equal(res, undefined, `${op.tool} must pass the integrated gate (got ${JSON.stringify(res)})`);
      // The unobservable typed workspace at the CLI seam surfaces as an explicit
      // environment-ceiling warning (info), never a silent PASS.
      assert.equal(fake.notifications.some(([msg, level]) => level === "info" && /typed workspace identity.*not observable/.test(msg)), true, `${op.tool} must surface the workspace environment ceiling`);
    }

    // A closed milestone envelope to a live root Supervisor passes the same
    // integrated MCP gate without being misclassified as a Peer lifecycle call.
    const eventBin = await mkdtemp(join(tmpdir(), "ppo-event-recipient-"));
    const eventScript = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  printf '{"Id":"sup-1","Provider":"ppo-supervisor","Status":"idle","Cwd":"${repo.dir}","ParentAgentId":""}'\n  exit 0\nfi\nexit 1\n`;
    await writeFile(join(eventBin, "paseo"), eventScript, { mode: 0o755 });
    try {
      const event = buildEventEnvelope({ kind: "CANDIDATE_READY", taskId: "task-1", senderAgentId: "lead-9", recipientAgentId: "sup-1", repoRoot: repo.dir });
      assert.equal(event.ok, true);
      const prompt = `<pi-paseo-orchestration event="v1">${JSON.stringify(event.envelope)}</pi-paseo-orchestration>`;
      const delivered = await fake.handlers.get("tool_call")({ toolName: "mcp", input: { server: "paseo", tool: "paseo_send_agent_prompt", args: { agentId: "sup-1", prompt } } }, { ...fake.ctx, env: { ...fake.ctx.env, PATH: `${eventBin}:${process.env.PATH ?? ""}` } });
      assert.equal(delivered, undefined, JSON.stringify(delivered));
      const duplicate = await fake.handlers.get("tool_call")({ toolName: "mcp", input: { server: "paseo", tool: "paseo_send_agent_prompt", args: { agentId: "sup-1", prompt } } }, { ...fake.ctx, env: { ...fake.ctx.env, PATH: `${eventBin}:${process.env.PATH ?? ""}` } });
      assert.equal(duplicate.block, true);
      assert.match(duplicate.reason, /duplicate event_id/);
    } finally {
      await rm(eventBin, { recursive: true, force: true });
    }

    // A child whose live parent is NOT the current Lead still fails closed.
    const rogueBin = await mkdtemp(join(tmpdir(), "ppo-recon-rogue-"));
    const rogue = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  printf '{"Id":"agent-99","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}","ParentAgentId":"someone-else"}'\n  exit 0\nfi\nexit 1\n`;
    await writeFile(join(rogueBin, "paseo"), rogue, { mode: 0o755 });
    try {
      const blocked = await fake.handlers.get("tool_call")({
        toolName: "mcp",
        input: { server: "paseo", tool: "get_agent_status", args: { agentId: "agent-99" } },
      }, { ...fake.ctx, env: { ...fake.ctx.env, PATH: `${rogueBin}:${process.env.PATH ?? ""}` } });
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /does not equal the current Lead/);
    } finally {
      await rm(rogueBin, { recursive: true, force: true });
    }

    // Configured Peer provider mismatch blocks (derived from alias, not caller).
    const otherAliasBin = await mkdtemp(join(tmpdir(), "ppo-recon-alias-"));
    const otherAlias = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  printf '{"Id":"agent-42","Provider":"other-peer","Status":"running","Cwd":"${repo.dir}","ParentAgentId":"lead-9"}'\n  exit 0\nfi\nexit 1\n`;
    await writeFile(join(otherAliasBin, "paseo"), otherAlias, { mode: 0o755 });
    try {
      const blocked = await fake.handlers.get("tool_call")({
        toolName: "mcp",
        input: { server: "paseo", tool: "cancel_agent", args: { agentId: "agent-42" } },
      }, { ...fake.ctx, env: { ...fake.ctx.env, PATH: `${otherAliasBin}:${process.env.PATH ?? ""}` } });
      assert.equal(blocked.block, true);
      assert.match(blocked.reason, /does not match the configured Peer provider/);
    } finally {
      await rm(otherAliasBin, { recursive: true, force: true });
    }
  } finally {
    process.chdir(previous);
    await rm(bin, { recursive: true, force: true });
    await rm(profiles, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
  }
});

test("handler: reconciliation compares typed child workspace against the exact bound-Lead workspace, and repository/task-label mismatch close through the integrated gate", async () => {
  // Handler-seam regressions (ppo-v02-dogfood-001, review-555b22d2): the
  // integrated tool_call handler invokes reconcilePeerChild WITHOUT an
  // independently supplied expectedWorkspaceId, so the reconcile function must
  // fall back to the exact bound-Lead typed workspace as the independent live
  // reference. A typed child workspace that contradicts the bound-Lead
  // workspace must FAIL CLOSED in a normal closed child operation; a match must
  // pass; an unobservable workspace on either side is an explicit
  // environment-ceiling warning that never blocks an otherwise proven child.
  // Repository mismatch and an observable task-label mismatch are also run
  // through the integrated path (closing prior direct-helper-only coverage).
  const ext = await freshExtension();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-recon-ws-"));
  await writeSettings(dir, validDoc);
  const repo = await gitRepoFixture();
  const previous = process.cwd();
  process.chdir(repo.dir);
  const harness = async (script) => {
    const bin = await mkdtemp(join(tmpdir(), "ppo-recon-ws-bin-"));
    await writeFile(join(bin, "paseo"), script, { mode: 0o755 });
    const fake = fakePi({
      activeTools: ["read", "bash", "mcp", "mcp_script"],
      env: { PI_PASEO_ORCHESTRATION_ROLE: "lead", PI_PASEO_ORCHESTRATION_PEER_ALIAS: "ppo-peer", PASEO_AGENT_ID: "lead-9", PASEO_LEAD_AGENT_ID: "", PI_CODING_AGENT_DIR: dir, PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles, PATH: `${bin}:${process.env.PATH ?? ""}` },
    });
    fake.pi.setActiveTools = (tools) => { fake.holder.activeTools = [...tools]; };
    fake.pi.getActiveTools = () => [...fake.holder.activeTools];
    ext.default(fake.pi);
    const registry = fake.ctx.modelRegistry;
    fake.ctx.model = registry.find("anthropic", "claude-sonnet-4-5");
    fake.ctx.thinkingLevel = "medium";
    fake.ctx.modelRegistry = { ...registry };
    await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);
    await fake.handlers.get("before_agent_start")(
      { prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: ["read", "bash", "mcp", "mcp_script"] } },
      fake.ctx,
    );
    return { fake, bin };
  };
  const op = { server: "paseo", tool: "get_agent_status", args: { agentId: "agent-42" } };
  try {
    // typed child workspace vs bound-Lead workspace MISMATCH fails closed.
    const mismatchScript = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  if [ "$2" = "lead-9" ]; then printf '{"Id":"lead-9","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}","WorkspaceId":"wks-lead"}' ; else printf '{"Id":"agent-42","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}","ParentAgentId":"lead-9","WorkspaceId":"wks-child"}' ; fi\n  exit 0\nfi\nexit 1\n`;
    {
      const { fake, bin } = await harness(mismatchScript);
      try {
        const blocked = await fake.handlers.get("tool_call")({ toolName: "mcp", input: op }, fake.ctx);
        assert.equal(blocked.block, true);
        assert.match(blocked.reason, /workspace .* does not match the expected workspace/);
      } finally { await rm(bin, { recursive: true, force: true }); }
    }
    // MATCHING typed child == bound-Lead workspace passes (no workspace warning).
    const matchScript = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  printf '{"Id":"%s","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}","ParentAgentId":"lead-9","WorkspaceId":"wks-same"}' "$2"\n  exit 0\nfi\nexit 1\n`;
    {
      const { fake, bin } = await harness(matchScript);
      try {
        const res = await fake.handlers.get("tool_call")({ toolName: "mcp", input: op }, fake.ctx);
        assert.equal(res, undefined, `matching typed workspace must pass (got ${JSON.stringify(res)})`);
        // Both sides expose workspace → no environment-ceiling workspace warning.
        assert.equal(fake.notifications.some(([msg]) => /typed workspace/.test(msg) && /not observable/.test(msg)), false, "matching typed workspace must not warn as unobservable");
      } finally { await rm(bin, { recursive: true, force: true }); }
    }
    // Workspace unavailable on the Lead side only → explicit warning, no block.
    const leadMissingWsScript = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  if [ "$2" = "lead-9" ]; then printf '{"Id":"lead-9","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}"}' ; else printf '{"Id":"agent-42","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}","ParentAgentId":"lead-9","WorkspaceId":"wks-child"}' ; fi\n  exit 0\nfi\nexit 1\n`;
    {
      const { fake, bin } = await harness(leadMissingWsScript);
      try {
        const res = await fake.handlers.get("tool_call")({ toolName: "mcp", input: op }, fake.ctx);
        assert.equal(res, undefined, "workspace unavailable on the bound-Lead side must not block");
        assert.equal(fake.notifications.some(([msg]) => /expected typed workspace .* not observable from the bound Lead/.test(msg)), true, "must warn the bound-Lead workspace ceiling");
      } finally { await rm(bin, { recursive: true, force: true }); }
    }
    // REPOSITORY MISMATCH fails closed through the integrated path.
    const wrongRepoScript = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  printf '{"Id":"%s","Provider":"ppo-peer","Status":"running","Cwd":"/other/repo","ParentAgentId":"lead-9"}' "$2"\n  exit 0\nfi\nexit 1\n`;
    {
      const { fake, bin } = await harness(wrongRepoScript);
      try {
        const blocked = await fake.handlers.get("tool_call")({ toolName: "mcp", input: op }, fake.ctx);
        assert.equal(blocked.block, true);
        assert.match(blocked.reason, /outside the expected repository/);
      } finally { await rm(bin, { recursive: true, force: true }); }
    }
    // OBSERVABLE TASK-LABEL MISMATCH (child task != bound-Lead task) blocks.
    const labelMismatchScript = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  if [ "$2" = "lead-9" ]; then printf '{"Id":"lead-9","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}","Labels":{"pi-paseo-orchestration.task-key":"task-A"}}' ; else printf '{"Id":"agent-42","Provider":"ppo-peer","Status":"running","Cwd":"${repo.dir}","ParentAgentId":"lead-9","Labels":{"pi-paseo-orchestration.task-key":"task-B"}}' ; fi\n  exit 0\nfi\nexit 1\n`;
    {
      const { fake, bin } = await harness(labelMismatchScript);
      try {
        const blocked = await fake.handlers.get("tool_call")({ toolName: "mcp", input: op }, fake.ctx);
        assert.equal(blocked.block, true);
        assert.match(blocked.reason, /task label .* does not match the bound Lead task/);
      } finally { await rm(bin, { recursive: true, force: true }); }
    }
  } finally {
    process.chdir(previous);
    await rm(profiles, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
  }
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
    assert.deepEqual(fakeNoMcp.holder.sentMessages, [[{
      customType: "pi-paseo-orchestration-blocked",
      content: "pi-paseo-orchestration blocked: outer mcp tool is not active for the lead role",
      display: true,
      details: { reason: "outer mcp tool is not active for the lead role" },
    }, undefined]]);

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

// ─── Slice 3: effective tools and scope validation ────────────────────────────

const {
  validateScope,
  effectiveTools,
} = extension;

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "ppo-test",
  GIT_AUTHOR_EMAIL: "ppo-test@example.com",
  GIT_COMMITTER_NAME: "ppo-test",
  GIT_COMMITTER_EMAIL: "ppo-test@example.com",
};
const git = (args, cwd) => execFile("git", ["-c", "commit.gpgsign=false", ...args], { cwd, env: gitEnv });

// Real hermetic git repository with a committed base. A valid canonical
// Workspace Protocol is committed at the root by default (withProtocol: false
// omits it for missing/malformed-protocol fixtures).
const validMeta = {
  status: "active",
  version: 1,
  last_reviewed: "2025-06-01",
  project_id: "ppo-fixture",
  repository_root: ".",
};

const coreSections = [
  ["decision matrix", "The Human decides product, priority, irreversible trade-off, external-effect, authority, protocol, subjective, and material cost/risk questions; every other role treats those as must-ask boundaries. Supervisor owns observation and authoring; Lead owns framing, routing, and verdicts; Peer owns assigned work."],
  ["task classes and routing", "Lead self-work is allowed. Ordinary local reversible work routes to one Peer for the exact assignment; tiny/bounded work routes directly. Cross-module/lifecycle work routes to one Engineer Peer with an isolated checkout. Architecture-sensitive work routes to an Architect disposition and independent review."],
  ["ownership and isolation", "One writer per moving scope; concurrent writers use disjoint scopes and isolated checkouts; ownership returns by explicit handback; the Lead does not take over an owned scope."],
  ["candidate, verification, review, and acceptance", "Every class produces one git Stable Candidate; verification is exact commands with recorded evidence; review triggers follow risk class; acceptance is a direct Human message only."],
  ["reopen, dependency, and blocked handling", "REOPEN_REQUEST names the failed premise; DEPENDENCY_REQUEST names the owner and requirement; BLOCKED reports bounded attempts; requests are decisions, not candidate acceptance."],
  ["evolution", "Revisions increment version and refresh last_reviewed with Human confirmation; material changes stop and re-evaluate running work."],
];

const coreBody = (sections = coreSections) =>
  `# Workspace Protocol\n\n${sections.map(([h, b]) => `## ${h}\n\n${b}`).join("\n\n")}\n`;

const metaLines = (over = {}) =>
  Object.entries({ ...validMeta, ...over })
    .map(([k, v]) => (v === undefined ? null : `${k}: ${v}`))
    .filter((line) => line !== null)
    .join("\n");

const protocolText = (over = {}, body = coreBody()) => `---\n${metaLines(over)}\n---\n\n${body}`;

const validProtocol = protocolText();

async function gitRepoFixture({ withProtocol = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ppo-repo-"));
  await git(["init"], dir);
  await mkdir(join(dir, "src"), { recursive: true });
  await writeFile(join(dir, "src", "main.go"), "package main\n");
  await writeFile(join(dir, "README.md"), "readme\n");
  if (withProtocol) {
    await mkdir(join(dir, ".orchestration"), { recursive: true });
    await writeFile(join(dir, ".orchestration", "workspace-protocol.md"), validProtocol, "utf8");
  }
  await git(["add", "-A"], dir);
  await git(["commit", "-m", "base"], dir);
  const { stdout } = await git(["rev-parse", "HEAD"], dir);
  return { dir, base: stdout.trim() };
}

// Governed (supervisor|lead|peer) process wired on a fresh extension instance.
async function governedFixture(ext, { role = "peer", activeTools = ["read", "bash"] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ppo-env-"));
  await mkdir(join(dir, "pi-paseo-orchestration"), { recursive: true });
  await writeSettings(dir, validDoc);
  const profiles = await profileDirFixture();
  const fake = fakePi({
    activeTools,
    env: {
      PI_PASEO_ORCHESTRATION_ROLE: role,
      PASEO_AGENT_ID: "agent-7",
      PI_CODING_AGENT_DIR: dir,
      PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles,
    },
  });
  ext.default(fake.pi);
  await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);
  return { dir, profiles, fake };
}

const inputText = (fake, text, source = "interactive") =>
  fake.handlers.get("input")({ text, source }, fake.ctx);

test("wiring: runtime model and thinking observations are required and exact", async () => {
  const cases = [
    ["missing model", (ctx) => { ctx.model = undefined; }, /runtime model selection/],
    ["missing thinking", (ctx) => { ctx.thinkingLevel = undefined; }, /runtime thinking level/],
    ["mismatched model", (ctx) => { ctx.model = { provider: "anthropic", id: "wrong" }; }, /runtime model drifted/],
    ["mismatched thinking", (ctx) => { ctx.thinkingLevel = "high"; }, /runtime thinking level drifted/],
  ];
  for (const [label, mutate, reason] of cases) {
    const ext = await freshExtension();
    const env = await governedFixture(ext, { role: "peer" });
    try {
      mutate(env.fake.ctx);
      const before = await env.fake.handlers.get("before_agent_start")(
        { prompt: "hi", systemPrompt: "base" }, env.fake.ctx,
      );
      assert.equal(before, undefined, `${label} must not start ordinary model work`);
      const blocked = await env.fake.handlers.get("tool_call")({ toolName: "read", input: {} }, env.fake.ctx);
      assert.equal(blocked.block, true, `${label} must block tool calls`);
      assert.match(blocked.reason, reason, `${label} must report the exact runtime blocker`);
    } finally {
      await rm(env.dir, { recursive: true, force: true });
      await rm(env.profiles, { recursive: true, force: true });
    }
  }
});

test("wiring: an attempted tool re-enablement is healed and still gated per call", async () => {
  const ext = await freshExtension();
  const env = await governedFixture(ext, { role: "peer", activeTools: ["read", "bash"] });
  try {
    await env.fake.handlers.get("before_agent_start")({ prompt: "hi", systemPrompt: "base" }, env.fake.ctx);
    // A co-extension (or loader) re-adds a tool outside the peer ceiling.
    env.fake.holder.activeTools.push("write");
    const blocked = await env.fake.handlers.get("tool_call")({ toolName: "write", input: { path: "/x" } }, env.fake.ctx);
    assert.equal(blocked.block, true);
    assert.match(blocked.reason, /write is not permitted for the peer role/);
    // The drift is healed, not fatal: the ceiling is re-applied on the next call.
    assert.deepEqual(env.fake.holder.activeTools, ["read", "bash"]);
    const passed = await env.fake.handlers.get("tool_call")({ toolName: "read", input: {} }, env.fake.ctx);
    assert.equal(passed, undefined);
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
  }
});

test("command: doctor heals tool drift introduced after governed activation", async () => {
  const ext = await freshExtension();
  const env = await governedCommandFixture(ext, { role: "peer", activeTools: ["read", "bash"] });
  try {
    env.fake.holder.activeTools.push("complete_goal", "list_add");
    const result = await env.fake.commands.get("ppo:doctor").handler("", env.fake.ctx);
    assert.equal(result.ok, true);
    assert.deepEqual(env.fake.holder.activeTools, ["read", "bash"]);
    assert.equal(result.report.checks.find((check) => check.code === "TOOL_POLICY").status, "PASS");
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
  }
});

test("doctor: missing baseline is blocked and never inferred from active tools", async () => {
  const ext = await freshExtension();
  const dir = await mkdtemp(join(tmpdir(), "ppo-doctor-no-baseline-"));
  try {
    await writeSettings(dir, validDoc);
    const fake = fakePi({
      activeTools: ["read", "bash"],
      env: { PI_CODING_AGENT_DIR: dir, PI_PASEO_ORCHESTRATION_ROLE: "peer", PASEO_AGENT_ID: "agent-7" },
    });
    const report = await ext.buildDoctorReport({ ctx: fake.ctx, pi: fake.pi, now: "2026-01-01T00:00:00.000Z", reportId: "doctor-no-baseline" });
    assert.deepEqual(report.policy.session_baseline, []);
    assert.equal(report.checks.find((check) => check.code === "TOOL_POLICY").status, "BLOCKED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("doctor: runtime drift is reported without latching the doctor mutation", async () => {
  const ext = await freshExtension();
  const env = await governedFixture(ext, { role: "peer" });
  try {
    env.fake.ctx.model = { provider: "openai", id: "wrong" };
    const report = await ext.buildDoctorReport({ ctx: env.fake.ctx, pi: env.fake.pi, now: "2026-01-01T00:00:00.000Z", reportId: "doctor-runtime-drift" });
    assert.equal(report.activation, "blocked");
    assert.equal(report.checks.find((check) => check.code === "ROLE_SETTINGS").status, "BLOCKED");
    assert.equal(report.overall_status, "BLOCKED");

    env.fake.ctx.model = { provider: "openai", id: "gpt-5" };
    const before = await env.fake.handlers.get("before_agent_start")({ prompt: "hi", systemPrompt: "base" }, env.fake.ctx);
    assert.match(before.systemPrompt, /role="peer"/);
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
  }
});




test("validateScope: canonical scopes pass; absolute/traversal/glob/ambiguous/symlink/new-outside-existing reject; exclusions must lie inside", async () => {
  const repo = await gitRepoFixture();
  const outside = await mkdtemp(join(tmpdir(), "ppo-outside-"));
  try {
    await symlink(outside, join(repo.dir, "linkdir"));
    await symlink(join(repo.dir, "README.md"), join(repo.dir, "linkfile"));
    await mkdir(join(repo.dir, "src", "sub"), { recursive: true });
    await writeFile(join(repo.dir, "src", "sub", "deep.go"), "x\n");

    for (const scope of ["src", "src/main.go", "newdir", "src/newfile.go", "src/sub/deep.go"]) {
      const check = await validateScope(repo.dir, scope, []);
      assert.equal(check.ok, true, `${scope} must pass`);
      assert.equal(check.scope, scope);
    }

    const bad = [
      ["absolute", "/tmp/x"],
      ["home", "~/src"],
      ["traversal", "../src"],
      ["traversal mid", "src/../x"],
      ["glob", "src/*"],
      ["glob char", "src/?"],
      ["glob brace", "src/{a,b}"],
      ["trailing slash", "src/"],
      ["double slash", "src//x"],
      ["dot segment", "./src"],
      ["dot mid", "src/./x"],
      ["backslash", "src\\x"],
      ["symlink component", "linkdir/x"],
      ["symlink scope", "linkfile"],
      ["new under new", "newdir/deep"],
    ];
    for (const [label, scope] of bad) {
      const check = await validateScope(repo.dir, scope, []);
      assert.equal(check.ok, false, `${label} (${scope}) must be rejected`);
    }

    assert.equal((await validateScope(repo.dir, "src", ["src/main.go"])).ok, true);
    assert.equal((await validateScope(repo.dir, "src", ["src/main.go", "src/sub"])).ok, true);
    assert.equal((await validateScope(repo.dir, "src", ["README.md"])).ok, false, "exclusion outside scope must fail");
    assert.equal((await validateScope(repo.dir, "src", ["src/../README.md"])).ok, false, "traversing exclusion must fail");
  } finally {
    await rm(repo.dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});










// ─── Slice 4: Workspace Protocol ───────────────────────────────────────────────

const { protocolPath, validateProtocol, readAndValidateProtocol, getProtocolPin } = extension;

test("protocolPath: canonical repository-root location", () => {
  assert.equal(protocolPath("/repo"), join("/repo", ".orchestration", "workspace-protocol.md"));
});

test("validateProtocol: valid protocol passes with metadata and canonical digest", () => {
  const check = validateProtocol(validProtocol);
  assert.equal(check.ok, true);
  assert.deepEqual(check.meta, validMeta);
  assert.equal(check.digest, digestOf(validProtocol));
  assert.equal(check.digest, createHash("sha256").update(Buffer.from(validProtocol, "utf8")).digest("hex"));

  // Quoted canonical values are accepted, but extra metadata is outside the closed schema.
  assert.equal(validateProtocol(protocolText({ project_id: '"ppo-fixture"' })).ok, true);
  assert.equal(validateProtocol(protocolText({ title: "Repo protocol" })).ok, false);
});

test("validateProtocol: metadata is closed — malformed, duplicate, missing, or mistyped values fail", () => {
  const cases = [
    ["empty", "", /nonempty/],
    ["whitespace", "   \n  ", /nonempty/],
    ["no frontmatter", "# Plain markdown\n\n## Decision matrix\n", /frontmatter/],
    ["leading blank line", "\n---\nstatus: active\nversion: 1\n---\n", /frontmatter/],
    ["unclosed frontmatter", "---\nstatus: active\nversion: 1\n", /closing/],
    ["bad line", "---\nstatus active\nversion: 1\n---\n", /malformed frontmatter line/],
    ["empty key", "---\n: active\nversion: 1\n---\n", /malformed frontmatter line/],
    ["duplicate version", "---\nstatus: active\nversion: 1\nversion: 2\n---\n", /duplicate metadata key "version"/],
    ["duplicate extra key", "---\nstatus: active\nversion: 1\nlast_reviewed: 2025-06-01\nproject_id: p\nrepository_root: .\ntitle: a\ntitle: b\n---\n", /duplicate metadata key "title"/],
    ["version zero", protocolText({ version: 0 }), /positive integer/],
    ["version negative", protocolText({ version: -1 }), /positive integer/],
    ["version float", protocolText({ version: 1.5 }), /positive integer/],
    ["version text", protocolText({ version: "one" }), /positive integer/],
    ["missing version", protocolText({ version: undefined }), /version is missing/],
    ["missing status", protocolText({ status: undefined }), /status is missing/],
    ["empty status", protocolText({ status: "" }), /status must be a nonempty/],
    ["missing last_reviewed", protocolText({ last_reviewed: undefined }), /last_reviewed is missing/],
    ["bad date month", protocolText({ last_reviewed: "2025-13-01" }), /YYYY-MM-DD/],
    ["bad date day", protocolText({ last_reviewed: "2025-02-30" }), /YYYY-MM-DD/],
    ["non-date", protocolText({ last_reviewed: "yesterday" }), /YYYY-MM-DD/],
    ["missing project_id", protocolText({ project_id: undefined }), /project_id is missing/],
    ["empty project_id", protocolText({ project_id: " " }), /project_id must be a nonempty/],
    ["missing repository_root", protocolText({ repository_root: undefined }), /repository_root is missing/],
    ["wrong repository_root", protocolText({ repository_root: "src" }), /repository_root must be "."/],
  ];
  for (const [label, text, re] of cases) {
    const check = validateProtocol(text);
    assert.equal(check.ok, false, `${label} must fail`);
    assert.match(check.error, re, label);
  }
});

test("validateProtocol: every required core section is enforced; optional sections and model routing grant nothing", () => {
  assert.equal(validateProtocol(protocolText()).ok, true);

  for (const [heading] of coreSections) {
    const body = coreBody(coreSections.filter(([h]) => h !== heading));
    const check = validateProtocol(protocolText({}, body));
    assert.equal(check.ok, false, `missing core section ${heading} must fail`);
    assert.match(check.error, new RegExp(`missing required core section "${heading}"`));
  }

  // The decision matrix must include must-ask boundaries.
  const bodyNoMustAsk = coreBody(
    coreSections.map(([h, b]) => (h === "decision matrix" ? [h, b.replace(/must-ask/, "role-owned")] : [h, b])),
  );
  const noMustAsk = validateProtocol(protocolText({}, bodyNoMustAsk));
  assert.equal(noMustAsk.ok, false);
  assert.match(noMustAsk.error, /must-ask boundaries/);

  // Optional sections may be absent; model/effort routing is outside the closed schema.
  const withOptionals = `${coreBody()}\n\n## Project criticality\n\nHigh.\n\n## Review and council\n\nA council appears only for genuinely independent decisions.\n\n## Anti-patterns\n\nNo ceremony for tiny work.\n\n## Supervisor hints\n\nObserve, do not implement.`;
  assert.equal(validateProtocol(protocolText({}, withOptionals)).ok, true, "closed optional sections must validate");
  assert.equal(validateProtocol(`${withOptionals}\n\n## Model routing\n\nReserved for a later version.`).ok, false, "model routing must be rejected");

  const emptyCore = coreBody(coreSections.map(([heading, body]) => [heading, heading === "ownership and isolation" ? "" : body]));
  const empty = validateProtocol(protocolText({}, emptyCore));
  assert.equal(empty.ok, false);
  assert.match(empty.error, /must be nonempty/);
});

test("readAndValidateProtocol: missing and empty files fail closed; valid file returns digest and metadata", async () => {
  const repo = await gitRepoFixture();
  const bare = await gitRepoFixture({ withProtocol: false });
  try {
    const read = await readAndValidateProtocol(repo.dir);
    assert.equal(read.ok, true);
    assert.equal(read.protocol.path, protocolPath(repo.dir));
    assert.equal(read.protocol.repoRoot, repo.dir);
    assert.equal(read.protocol.digest, digestOf(validProtocol));
    assert.deepEqual(read.protocol.meta, validMeta);

    const missing = await readAndValidateProtocol(bare.dir);
    assert.equal(missing.ok, false);
    assert.match(missing.error, /missing/);

    await mkdir(join(bare.dir, ".orchestration"), { recursive: true });
    await writeFile(protocolPath(bare.dir), "");
    const emptyFile = await readAndValidateProtocol(bare.dir);
    assert.equal(emptyFile.ok, false);
    assert.match(emptyFile.error, /nonempty/);

    await writeFile(protocolPath(bare.dir), "   \n");
    const whitespace = await readAndValidateProtocol(bare.dir);
    assert.equal(whitespace.ok, false);
    assert.match(whitespace.error, /nonempty/);

    await writeFile(protocolPath(bare.dir), "---\nstatus: active\nversion: 1\nlast_reviewed: 2025-06-01\nproject_id: p\nrepository_root: .\n---\n\n## Decision matrix\n\nMust-ask boundaries are Human-owned.\n");
    const incomplete = await readAndValidateProtocol(bare.dir);
    assert.equal(incomplete.ok, false);
    assert.match(incomplete.error, /missing required core section/);
  } finally {
    await rm(repo.dir, { recursive: true, force: true });
    await rm(bare.dir, { recursive: true, force: true });
  }
});

test("wiring: a valid protocol is pinned at session_start and re-verified at every gate", async () => {
  const repo = await gitRepoFixture();
  const previous = process.cwd();
  process.chdir(repo.dir);
  const ext = await freshExtension();
  const env = await governedFixture(ext, { role: "lead", activeTools: ["read", "bash", "mcp"] });
  try {
    assert.deepEqual(ext.getProtocolPin(), {
      repoRoot: repo.dir,
      version: 1,
      projectId: "ppo-fixture",
      digest: digestOf(validProtocol),
      allowsLeadTiny: true,
    });

    // Pin survives repeated reads: input, before_agent_start, and tool_call
    // all re-read and re-validate without complaint.
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(await inputText(env.fake, "continue"), { action: "continue" });
    }
    const before = await env.fake.handlers.get("before_agent_start")(
      { prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: ["read", "bash", "mcp"] } },
      env.fake.ctx,
    );
    assert.match(before.systemPrompt, /# lead profile/);
    const readCall = await env.fake.handlers.get("tool_call")({ toolName: "read", input: { path: join(repo.dir, "README.md") } }, env.fake.ctx);
    assert.equal(readCall, undefined);
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
    process.chdir(previous);
  }
});

test("wiring: protocol byte drift blocks permanently and restoring the bytes does not clear it", async () => {
  const repo = await gitRepoFixture();
  const previous = process.cwd();
  process.chdir(repo.dir);
  const ext = await freshExtension();
  const env = await governedFixture(ext, { role: "lead", activeTools: ["read", "bash", "mcp"] });
  try {
    const p = protocolPath(repo.dir);
    await writeFile(p, validProtocol + "\n# late edit\n", "utf8");
    const blocked = await inputText(env.fake, "hi");
    assert.deepEqual(blocked, { action: "handled" });
    assert.equal(env.fake.notifications.some(([msg]) => /drifted/.test(msg)), true);

    const before = await env.fake.handlers.get("before_agent_start")(
      { prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: ["read", "bash", "mcp"] } },
      env.fake.ctx,
    );
    assert.equal(before, undefined);

    // Restoring the exact pinned bytes does NOT clear the in-process block.
    await writeFile(p, validProtocol, "utf8");
    assert.deepEqual(await inputText(env.fake, "hi"), { action: "handled" });
    const call = await env.fake.handlers.get("tool_call")({ toolName: "read", input: {} }, env.fake.ctx);
    assert.equal(call.block, true);
    assert.match(call.reason, /blocked/);
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
    process.chdir(previous);
  }
});

test("wiring: protocol project identity mismatch blocks permanently with the exact reason", async () => {
  const repo = await gitRepoFixture();
  const previous = process.cwd();
  process.chdir(repo.dir);
  const ext = await freshExtension();
  const env = await governedFixture(ext, { role: "lead", activeTools: ["read", "bash", "mcp"] });
  try {
    await writeFile(protocolPath(repo.dir), protocolText({ project_id: "other-project" }), "utf8");
    const blocked = await inputText(env.fake, "hi");
    assert.deepEqual(blocked, { action: "handled" });
    assert.equal(env.fake.notifications.some(([msg]) => /project identity changed/.test(msg)), true);
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
    process.chdir(previous);
  }
});

test("wiring: a lead without a valid protocol pin is blocked at input and before_agent_start", async () => {
  const previous = process.cwd();
  const bare = await gitRepoFixture({ withProtocol: false });
  process.chdir(bare.dir);
  const ext = await freshExtension();
  const env = await governedFixture(ext, { role: "lead", activeTools: ["read", "bash", "mcp"] });
  try {
    assert.equal(ext.getProtocolPin(), null);
    const input = await inputText(env.fake, "hi");
    assert.deepEqual(input, { action: "handled" });
    assert.equal(env.fake.notifications.some(([msg]) => /protocol file is missing/.test(msg)), true);
    const before = await env.fake.handlers.get("before_agent_start")(
      { prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: ["read", "bash", "mcp"] } },
      env.fake.ctx,
    );
    assert.equal(before, undefined);
    const call = await env.fake.handlers.get("tool_call")({ toolName: "read", input: {} }, env.fake.ctx);
    assert.equal(call.block, true);
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
    await rm(bare.dir, { recursive: true, force: true });
    process.chdir(previous);
  }

  // Malformed protocol state also blocks with the exact reason.
  const malformed = await gitRepoFixture({ withProtocol: false });
  await mkdir(join(malformed.dir, ".orchestration"), { recursive: true });
  await writeFile(protocolPath(malformed.dir), "not a protocol", "utf8");
  process.chdir(malformed.dir);
  const ext2 = await freshExtension();
  const env2 = await governedFixture(ext2, { role: "lead", activeTools: ["read", "bash", "mcp"] });
  try {
    assert.deepEqual(await inputText(env2.fake, "hi"), { action: "handled" });
    assert.equal(env2.fake.notifications.some(([msg]) => /frontmatter/.test(msg)), true);
  } finally {
    await rm(env2.dir, { recursive: true, force: true });
    await rm(env2.profiles, { recursive: true, force: true });
    await rm(malformed.dir, { recursive: true, force: true });
    process.chdir(previous);
  }
});

test("wiring: peer read/grep/ls/find of the protocol or .orchestration is blocked; other reads pass", async () => {
  const repo = await gitRepoFixture();
  const previous = process.cwd();
  process.chdir(repo.dir);
  const ext = await freshExtension();
  const env = await governedFixture(ext, { activeTools: ["read", "bash", "write", "edit"] });
  try {
    const protoAbs = protocolPath(repo.dir);

    // Absolute and repo-relative targets both resolve to the protocol.
    for (const path of [protoAbs, ".orchestration/workspace-protocol.md"]) {
      const blocked = await env.fake.handlers.get("tool_call")({ toolName: "read", input: { path } }, env.fake.ctx);
      assert.equal(blocked.block, true, `read ${path} must be blocked`);
      assert.match(blocked.reason, /governance violation/);
    }

    // The .orchestration directory itself is off-limits for ls/grep/find too.
    const lsDir = await env.fake.handlers.get("tool_call")({ toolName: "ls", input: { path: join(repo.dir, ".orchestration") } }, env.fake.ctx);
    assert.equal(lsDir.block, true);
    const grepProto = await env.fake.handlers.get("tool_call")({ toolName: "grep", input: { pattern: "version", path: join(repo.dir, ".orchestration") } }, env.fake.ctx);
    assert.equal(grepProto.block, true);
    const findProto = await env.fake.handlers.get("tool_call")({ toolName: "find", input: { pattern: "**", path: ".orchestration" } }, env.fake.ctx);
    assert.equal(findProto.block, true);

    // Other reads pass.
    const readOk = await env.fake.handlers.get("tool_call")({ toolName: "read", input: { path: join(repo.dir, "README.md") } }, env.fake.ctx);
    assert.equal(readOk, undefined);
    const readSrc = await env.fake.handlers.get("tool_call")({ toolName: "read", input: { path: "src/main.go" } }, env.fake.ctx);
    assert.equal(readSrc, undefined);

    // A Peer with local edit authority still may not read the protocol; the
    // peer read gate is role-based, not authority-state based.
    const grantedRead = await env.fake.handlers.get("tool_call")({ toolName: "read", input: { path: protoAbs } }, env.fake.ctx);
    assert.equal(grantedRead.block, true);
    // Ordinary local reversible write outside the protocol path is allowed by
    // the Peer role with no authority grant.
    const grantedWrite = await env.fake.handlers.get("tool_call")({ toolName: "write", input: { path: join(repo.dir, "src", "x.go") } }, env.fake.ctx);
    assert.equal(grantedWrite, undefined, "local write is allowed without any authority grant");
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
    process.chdir(previous);
  }
});

test("checkToolCall: the peer read gate resolves protocol targets and passes everything else", () => {
  const peerPolicy = { role: "peer", allowed: ["read", "grep", "ls", "find", "bash"], repoRoot: "/repo" };
  assert.equal(extension.checkToolCall("read", { path: "/repo/.orchestration/workspace-protocol.md" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("read", { path: ".orchestration/workspace-protocol.md" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("read", { path: ".orchestration/" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("grep", { pattern: "x", path: "/repo/.orchestration" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("ls", { path: "/repo/.orchestration" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("find", { pattern: "**", path: ".orchestration" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("read", { path: "/repo/README.md" }, peerPolicy), undefined);
  assert.equal(extension.checkToolCall("read", { path: "/repo/.orchestration.md" }, peerPolicy), undefined, "similar names are not the protocol");
  assert.equal(extension.checkToolCall("read", { path: "src/main.go" }, peerPolicy), undefined);
  // Unresolvable target without a repository root fails closed.
  assert.equal(extension.checkToolCall("read", { path: "/repo/.orchestration/x" }, { role: "peer", allowed: ["read"] }).block, true);
  // Supervisor is not gated.
  assert.equal(extension.checkToolCall("read", { path: "/repo/.orchestration/workspace-protocol.md" }, { role: "supervisor", allowed: ["read"], repoRoot: "/repo" }), undefined);
});

test("wiring: supervisor never pins and may read the protocol; passive is unaffected", async () => {
  const repo = await gitRepoFixture();
  const previous = process.cwd();
  process.chdir(repo.dir);
  const ext = await freshExtension();
  const env = await governedFixture(ext, { role: "supervisor", activeTools: ["read", "bash", "mcp"] });
  try {
    assert.equal(ext.getProtocolPin(), null, "supervisor never pins the protocol");
    assert.deepEqual(await inputText(env.fake, "observe"), { action: "continue" });
    const read = await env.fake.handlers.get("tool_call")({ toolName: "read", input: { path: protocolPath(repo.dir) } }, env.fake.ctx);
    assert.equal(read, undefined, "supervisor may read the protocol");

    // Passive process: no latch, no gate, no pin.
    const ext2 = await freshExtension();
    const fake2 = fakePi({ env: { PI_CODING_AGENT_DIR: join(tmpdir(), "ppo-passive-none") } });
    ext2.default(fake2.pi);
    await fake2.handlers.get("session_start")({ reason: "startup" }, fake2.ctx);
    assert.equal(ext2.getProtocolPin(), null);
    const passiveRead = await fake2.handlers.get("tool_call")({ toolName: "read", input: { path: protocolPath(repo.dir) } }, fake2.ctx);
    assert.equal(passiveRead, undefined);
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
    process.chdir(previous);
  }
});




// ─── Slice 5: Peer Reports & Lead–Peer orchestration ───────────────────────────

const {
  REPORT_BEGIN,
  REPORT_END,
  REPORT_KINDS,
  parseReport,
  correlateReport,
  createInspectionLimit,
} = extension;

const reportText = (obj) => `${REPORT_BEGIN}\n${JSON.stringify(obj, null, 2)}\n${REPORT_END}`;

const reportBase = {
  version: 1,
  report_id: "report-1",
  peer_agent_id: "peer-1",
  parent_lead_agent_id: "lead-7",
  task_id: "task-42",
  assignment_id: "a-1",
  summary: "A bounded report with inspectable evidence.",
  evidence: ["read src/main.go: module boundary confirmed"],
};

const progressReport = (over = {}) => ({
  ...reportBase,
  kind: "PROGRESS",
  payload: { completed: ["Investigation complete"], next: ["Await the write grant"], risks: ["No write authority"] },
  ...over,
});

const handoffReport = (over = {}) => ({
  ...reportBase,
  kind: "HANDOFF",
  summary: "Feature implemented and verified.",
  payload: {
    artifacts: ["src/feature.go"],
    candidate_ref: `git:v1:${"a".repeat(40)}:${"b".repeat(40)}`,
    verification: [{ command: "npm test -- --run", result: "PASS", output: "passed" }],
    residual_risks: [],
    unfinished_dependencies: [],
  },
  ...over,
});

const reopenReport = (over = {}) => ({
  ...reportBase,
  kind: "REOPEN_REQUEST",
  payload: {
    failed_premise: "The assumed API contract no longer exists in main.",
    impact: "The assigned change cannot be implemented as framed.",
    options: ["Re-frame the assignment against the new contract", "Abandon the task"],
    requested_decision: "Which option should the assignment follow?",
  },
  ...over,
});

const dependencyReport = (over = {}) => ({
  ...reportBase,
  kind: "DEPENDENCY_REQUEST",
  payload: {
    needed: "A product decision on the output format.",
    needed_from: "Human",
    impact: "The format choice changes the entire diff.",
    human_decision_required: true,
  },
  ...over,
});

const blockedReport = (over = {}) => ({
  ...reportBase,
  kind: "BLOCKED",
  payload: {
    blocker: "No current-run edit grant.",
    impact: "The assigned outcome cannot be produced read-only.",
    unblock_condition: "A direct Human grant for scope src/.",
    bounded_attempts: ["Confirmed the write tools are absent"],
    can_continue_elsewhere: false,
  },
  ...over,
});

test("parseReport: every closed kind validates as a strict v1 document", () => {
  assert.deepEqual(REPORT_KINDS, ["PROGRESS", "HANDOFF", "REOPEN_REQUEST", "DEPENDENCY_REQUEST", "BLOCKED"]);
  for (const [kind, report] of [["PROGRESS", progressReport()], ["HANDOFF", handoffReport()], ["REOPEN_REQUEST", reopenReport()], ["DEPENDENCY_REQUEST", dependencyReport()], ["BLOCKED", blockedReport()]]) {
    const parsed = parseReport(reportText(report));
    assert.equal(parsed.ok, true, `${kind} must validate`);
    assert.equal(parsed.report.kind, kind);
    assert.equal(parsed.report.report_id, "report-1");
    assert.equal(parsed.report.peer_agent_id, "peer-1");
    assert.equal(parsed.report.parent_lead_agent_id, "lead-7");
  }
  assert.equal(parseReport(reportText(progressReport({ supersedes_report_id: "report-0" }))).ok, true);
  assert.equal(parseReport(reportText(handoffReport({ payload: { ...handoffReport().payload, candidate_ref: null } }))).ok, true);
  assert.deepEqual(parseReport("just a response"), { ok: true, report: null });
  assert.deepEqual(parseReport(""), { ok: true, report: null });
});

test("parseReport: unknown, duplicate, malformed, mistyped, misplaced data rejects", () => {
  const valid = reportText(progressReport());
  const cases = [
    ["unknown kind", reportText(progressReport({ kind: "DONE" })), /kind must be one of/],
    ["unknown version", reportText(progressReport({ version: 2 })), /version must be exactly 1/],
    ["unknown field", reportText(progressReport({ magic: true })), /unknown field "magic"/],
    ["duplicate field", `${REPORT_BEGIN}\n{"version":1,"kind":"PROGRESS","kind":"BLOCKED","report_id":"r","peer_agent_id":"p","parent_lead_agent_id":"l","task_id":"t","assignment_id":"a","summary":"x","evidence":["y"],"payload":{}}\n${REPORT_END}`, /duplicate field "kind"/],
    ["malformed", `${REPORT_BEGIN}\n{"version": 1, broken\n${REPORT_END}`, /not valid JSON/],
    ["array body", `${REPORT_BEGIN}\n[1, 2]\n${REPORT_END}`, /single JSON object/],
    ["missing report id", reportText(progressReport({ report_id: "" })), /report_id must be a nonempty string/],
    ["numeric peer id", reportText(progressReport({ peer_agent_id: 7 })), /peer_agent_id must be a nonempty string/],
    ["missing parent id", reportText(progressReport({ parent_lead_agent_id: " " })), /parent_lead_agent_id must be a nonempty string/],
    ["missing task id", reportText(progressReport({ task_id: "" })), /task_id must be a nonempty string/],
    ["numeric summary", reportText(progressReport({ summary: 5 })), /summary must be a nonempty string/],
    ["empty evidence", reportText(progressReport({ evidence: [] })), /evidence must be a nonempty array/],
    ["empty supersedes", reportText(progressReport({ supersedes_report_id: "" })), /supersedes_report_id must be a nonempty string/],
    ["misplaced", `Here is my work.\n${valid}`, /must be the first nonempty content/],
    ["duplicate report", `${valid}\n${valid}`, /duplicate peer report/],
    ["unclosed", `${REPORT_BEGIN}\n${JSON.stringify(progressReport())}`, /no closing marker/],
  ];
  for (const [label, text, re] of cases) {
    const parsed = parseReport(text);
    assert.equal(parsed.ok, false, `${label} must fail`);
    assert.match(parsed.error, re, label);
  }
});

test("parseReport: payload is typed and closed per kind", () => {
  const cases = [
    ["string payload", reportText(progressReport({ payload: "x" })), /payload must be a single object/],
    ["unknown payload field", reportText(progressReport({ payload: { completed: ["x"], next: ["y"], risks: ["z"], extra: 1 } })), /unknown field "extra"/],
    ["empty progress", reportText(progressReport({ payload: { completed: [], next: ["y"], risks: ["z"] } })), /completed must contain at least 1/],
    ["handoff invalid candidate", reportText(handoffReport({ payload: { ...handoffReport().payload, candidate_ref: "x" } })), /candidate_ref|candidate reference/i],
    ["handoff empty artifacts", reportText(handoffReport({ payload: { ...handoffReport().payload, artifacts: [] } })), /artifacts must contain at least 1/],
    ["handoff invalid verification", reportText(handoffReport({ payload: { ...handoffReport().payload, verification: [{ command: "x", result: "PASS", output: "" }] } })), /output must be a nonempty string/],
    ["reopen missing premise", reportText(reopenReport({ payload: { impact: "i", options: ["o"], requested_decision: "d" } })), /failed_premise is missing/],
    ["dependency string boolean", reportText(dependencyReport({ payload: { ...dependencyReport().payload, human_decision_required: "yes" } })), /human_decision_required must be a boolean/],
    ["blocked empty attempts", reportText(blockedReport({ payload: { ...blockedReport().payload, bounded_attempts: [] } })), /bounded_attempts must contain at least 1/],
    ["blocked string boolean", reportText(blockedReport({ payload: { ...blockedReport().payload, can_continue_elsewhere: "maybe" } })), /can_continue_elsewhere must be a boolean/],
  ];
  for (const [label, text, re] of cases) {
    const parsed = parseReport(text);
    assert.equal(parsed.ok, false, `${label} must fail`);
    assert.match(parsed.error, re, label);
  }
});

test("correlateReport: exact child/parent/task/assignment correlation; any mismatch or missing fact fails closed", () => {
  const known = { peerId: "peer-1", parentId: "lead-7", taskId: "task-42", assignmentId: "a-1" };
  assert.deepEqual(correlateReport(progressReport(), known), { ok: true });

  // Stale/mismatched identities all fail closed.
  for (const [label, over] of [
    ["stale child", { peer_agent_id: "peer-2" }],
    ["wrong parent", { parent_lead_agent_id: "lead-8" }],
    ["other task", { task_id: "task-43" }],
    ["other assignment", { assignment_id: "a-2" }],
  ]) {
    assert.equal(correlateReport(progressReport(over), known).ok, false, `${label} must fail`);
  }

  // Missing known facts fail closed (the Lead must hold every identity it minted).
  for (const key of ["peerId", "parentId", "taskId", "assignmentId"]) {
    const partial = { ...known, [key]: "" };
    assert.equal(correlateReport(progressReport(), partial).ok, false, `missing known ${key} must fail`);
  }
  assert.equal(correlateReport(progressReport(), null).ok, false);
  assert.equal(correlateReport(null, known).ok, false);

  // Report ids and candidate-required handoffs fail closed.
  assert.equal(correlateReport(progressReport({ report_id: "" }), known).ok, false);
  assert.equal(correlateReport(handoffReport({ payload: { ...handoffReport().payload, candidate_ref: null } }), { ...known, candidateRequired: true }).ok, false);
});

test("createInspectionLimit: at most one bounded inspection; evidence resets; exceeding fails closed", () => {
  const limit = createInspectionLimit();
  assert.deepEqual(limit.requestInspection(), { ok: true, remaining: 0 });
  assert.equal(limit.requestInspection().ok, false, "second inspection without evidence fails closed");
  assert.match(limit.requestInspection().error, /inspection budget exhausted/);
  limit.recordEvidence();
  assert.deepEqual(limit.requestInspection(), { ok: true, remaining: 0 }, "evidence resets the budget");
  assert.equal(limit.requestInspection().ok, false);
  assert.throws(() => createInspectionLimit(0), /positive integer/);
  assert.throws(() => createInspectionLimit("1"), /positive integer/);
});

test("wiring: peer agent_end accepts only a correlated terminal Peer Report", async () => {
  const ext = await freshExtension();
  const env = await governedFixture(ext, { role: "peer", activeTools: ["read", "bash"] });
  try {
    const report = progressReport();
    await env.fake.handlers.get("agent_end")({ messages: [{ role: "assistant", content: reportText(report) }] }, { ...env.fake.ctx, peerReportContext: { peerId: "peer-1", parentId: "lead-7", taskId: "task-42", assignmentId: "a-1" } });
    assert.deepEqual(ext.getPeerReport(), report);
    await env.fake.handlers.get("agent_end")({ messages: [{ role: "assistant", content: reportText({ ...report, peer_agent_id: "wrong-peer" }) }] }, { ...env.fake.ctx, peerReportContext: { peerId: "peer-1", parentId: "lead-7", taskId: "task-42", assignmentId: "a-1" } });
    assert.equal(ext.getPeerReport(), null);
  } finally {
    await rm(env.dir, { recursive: true, force: true });
    await rm(env.profiles, { recursive: true, force: true });
  }
});

// Governed process wired for slash-command flows: fake ui with input support
// and an observable idle state.
async function governedCommandFixture(ext, { role = "lead", activeTools = ["read", "bash", "write", "edit"] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-"));
  await mkdir(join(dir, "pi-paseo-orchestration"), { recursive: true });
  await writeSettings(dir, validDoc);
  const profiles = await profileDirFixture();
  const fake = fakePi({
    activeTools,
    env: {
      PI_PASEO_ORCHESTRATION_ROLE: role,
      PASEO_AGENT_ID: "agent-7",
      PI_CODING_AGENT_DIR: dir,
      PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles,
    },
    ui: {
      input: async () => undefined,
      select: async () => null,
      confirm: async () => false,
    },
    ctx: { isIdle: () => true },
  });
  ext.default(fake.pi);
  await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);
  return { dir, profiles, fake };
}





// ─── Slice 6: Stable Candidate, review, verdict, Local Acceptance ─────────────

const {
  CANDIDATE_EVIDENCE_BEGIN,
  CANDIDATE_EVIDENCE_END,
  REVIEW_BEGIN,
  REVIEW_END,
  VERDICT_BEGIN,
  VERDICT_END,
  ACCEPTANCE_BEGIN,
  ACCEPTANCE_END,
  parseCandidateRef,
  checkCandidateEligibility,
  parseCandidateEvidence,
  parseReview,
  reviewValidForCandidate,
  parseVerdict,
  verdictStatus,
  parseAcceptance,
  validateAcceptance,
  observePaseoCurrentAgent,
  reconcilePeerChild,
  verifyPartnerBinding,
  reconcileLeadEventRecipient,
  bindExactPartner,
  buildEventEnvelope,
  validateEventEnvelope,
  eventDedupe,
  getInspectionParentAgentId,
} = extension;

const blockText = (begin, end, doc) => `${begin}\n${JSON.stringify(doc, null, 2)}\n${end}`;
const candidateRefOf = (base, candidate) => `git:v1:${base}:${candidate}`;

async function commitCandidate(repo, path = "src/feature.go", content = "feature\n", message = "candidate") {
  await writeFile(join(repo.dir, path), content);
  await git(["add", "-A"], repo.dir);
  await git(["commit", "-m", message], repo.dir);
  return (await git(["rev-parse", "HEAD"], repo.dir)).stdout.trim();
}

// Acceptance/candidate evidence validation binds workflow/ownership facts (the
// exact candidate base, task/agent ids, the Peer assignment and parent
// identity, and the assignment scope) as artifact checks - not capability
// credentials and not runtime-captured authority.

const candidateAuthority = (repo, grantedBase, over = {}) => ({
  taskId: "task-1",
  agentId: "peer-1",
  base: grantedBase,
  scope: "src",
  exclusions: [],
  taskRevision: "revision-1",
  assignmentId: "assignment-1",
  workspaceId: "workspace-1",
  parentId: "lead-1",
  reviewRequired: true,
  ...over,
});

const protocolPinFor = (repo) => ({
  repoRoot: repo.dir,
  version: 1,
  projectId: validMeta.project_id,
  digest: digestOf(validProtocol),
});

async function candidateEvidenceDoc(repo, candidate, over = {}) {
  const ref = candidateRefOf(repo.base, candidate);
  const diff = (await git([
    "diff", "--binary", "--full-index", "--no-color", "--no-ext-diff",
    repo.base, candidate, "--",
  ], repo.dir)).stdout.trim();
  const changedPaths = (await git([
    "diff", "--name-only", "--no-renames", repo.base, candidate, "--",
  ], repo.dir)).stdout.trim().split("\n").filter(Boolean).sort();
  return {
    version: 1,
    evidence_id: "candidate-evidence-1",
    project_id: validMeta.project_id,
    task_id: "task-1",
    task_revision: "revision-1",
    assignment_id: "assignment-1",
    writer_id: "peer-1",
    parent_id: "lead-1",
    repository_root: repo.dir,
    workspace_id: "workspace-1",
    workspace_protocol_digest: digestOf(validProtocol),
    candidate_ref: ref,
    objective_relevance: {
      result: "PASS",
      rationale: "The candidate implements the bounded objective under src/.",
      evidence_refs: ["diff-1"],
    },
    cumulative_diff: {
      evidence_id: "diff-1",
      base_oid: repo.base,
      candidate_oid: candidate,
      diff,
    },
    changed_paths: changedPaths,
    scope: {
      writable_scope: "src",
      exclusions: [],
      current_result: "PASS",
      cumulative_result: "PASS",
      evidence_refs: ["scope-current-1", "scope-cumulative-1"],
    },
    verification: [{
      evidence_id: "verification-1",
      command: "npm test",
      result: "PASS",
      output: "59 tests passed",
    }],
    post_commit: {
      head_oid: candidate,
      verification_evidence_ids: ["verification-1"],
    },
    clean: {
      evidence_id: "clean-1",
      command: "git status --porcelain=v1 --untracked-files=all",
      result: "PASS",
      output: "",
    },
    residual_risks: [],
    unfinished_dependencies: [],
    ...over,
  };
}

const reviewDoc = (candidateRef, over = {}) => ({
  version: 1,
  review_result_id: "review-1",
  reviewer_id: "reviewer-1",
  reviewer_assignment_id: "review-assignment-1",
  candidate_ref: candidateRef,
  mandate: "NEUTRAL_FALSIFICATION",
  commands: [{ command: "git show --stat", result: "PASS", output_ref: "review-command-1" }],
  evidence: ["review-command-1"],
  coverage: ["candidate identity", "cumulative diff", "verification evidence"],
  gaps: [],
  outcome: "APPROVE",
  findings: [],
  ...over,
});

const verdictDoc = (repo, candidate, over = {}) => {
  const candidateRef = candidateRefOf(repo.base, candidate);
  return {
    version: 1,
    verdict_id: "verdict-1",
    project_id: validMeta.project_id,
    task_id: "task-1",
    task_revision: "revision-1",
    assignment_id: "assignment-1",
    repository_root: repo.dir,
    workspace_id: "workspace-1",
    workspace_protocol_digest: digestOf(validProtocol),
    candidate_ref: candidateRef,
    origin: { kind: "PEER_HANDOFF", evidence_id: "candidate-evidence-1" },
    scope_result: "PASS",
    scope_evidence: ["diff-1", "scope-current-1", "scope-cumulative-1"],
    verification: [{ command: "npm test", result: "PASS", output_ref: "verification-1" }],
    review: {
      required: true,
      review_result_id: "review-1",
      candidate_ref: candidateRef,
      outcome: "APPROVE",
      open_findings: [],
    },
    unfinished_dependencies: [],
    residual_risks: [],
    human_decisions: [],
    verdict: "READY",
    rationale: "Every technical gate passes for the exact candidate.",
    ...over,
  };
};

const acceptanceDoc = (candidateRef, verdictId = "verdict-1") => ({
  version: 1,
  decision: "LOCAL_ACCEPT",
  candidate_ref: candidateRef,
  project_verdict_id: verdictId,
});

async function validAcceptanceChain(repo, candidate) {
  const authority = candidateAuthority(repo, repo.base);
  const evidenceDocument = await candidateEvidenceDoc(repo, candidate);
  const reviewDocument = reviewDoc(evidenceDocument.candidate_ref);
  const verdictDocument = verdictDoc(repo, candidate);
  const acceptanceDocument = acceptanceDoc(evidenceDocument.candidate_ref);
  const evidence = parseCandidateEvidence(
    blockText(CANDIDATE_EVIDENCE_BEGIN, CANDIDATE_EVIDENCE_END, evidenceDocument),
    authority,
  );
  const review = parseReview(blockText(REVIEW_BEGIN, REVIEW_END, reviewDocument));
  const verdict = parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, verdictDocument));
  const acceptance = parseAcceptance(
    blockText(ACCEPTANCE_BEGIN, ACCEPTANCE_END, acceptanceDocument),
    "interactive",
  );
  assert.equal(evidence.ok, true);
  assert.equal(review.ok, true);
  assert.equal(verdict.ok, true);
  assert.equal(acceptance.ok, true);
  return {
    acceptance: acceptance.acceptance,
    verdict: verdict.verdict,
    review: review.review,
    evidence: evidence.evidence,
    authority,
    repoRoot: repo.dir,
    protocolPin: protocolPinFor(repo),
    documents: { acceptanceDocument, verdictDocument, reviewDocument, evidenceDocument },
  };
}

test("parseCandidateRef: only exact v1 full object-id identity parses", () => {
  const sha1 = candidateRefOf("a".repeat(40), "b".repeat(40));
  assert.deepEqual(parseCandidateRef(sha1), {
    ok: true,
    candidate: { ref: sha1, taskBaseOid: "a".repeat(40), candidateOid: "b".repeat(40) },
  });
  assert.equal(parseCandidateRef(candidateRefOf("a".repeat(64), "b".repeat(64))).ok, true);

  for (const [label, value] of [
    ["branch", "main"],
    ["tag", "v1.2.3"],
    ["HEAD", "HEAD"],
    ["symbolic candidate", `git:v1:${"a".repeat(40)}:HEAD`],
    ["abbreviated base", `git:v1:abcdef1:${"b".repeat(40)}`],
    ["abbreviated candidate", `git:v1:${"a".repeat(40)}:abcdef1`],
    ["uppercase", candidateRefOf("A".repeat(40), "b".repeat(40))],
    ["mixed object formats", candidateRefOf("a".repeat(40), "b".repeat(64))],
    ["leading prose", `candidate ${sha1}`],
    ["trailing prose", `${sha1} is ready`],
    ["leading whitespace", ` ${sha1}`],
    ["missing version", `git:${"a".repeat(40)}:${"b".repeat(40)}`],
    ["wrong version", `git:v2:${"a".repeat(40)}:${"b".repeat(40)}`],
    ["non-string", null],
  ]) {
    const check = parseCandidateRef(value);
    assert.equal(check.ok, false, `${label} must fail`);
    assert.equal(typeof check.error, "string", `${label} must have an exact reason`);
  }
});

test("checkCandidateEligibility: real Git identity, parent, linearity, scope, HEAD, and clean state are rechecked", async () => {
  const repo = await gitRepoFixture();
  const outOfScopeRepo = await gitRepoFixture();
  const mergeRepo = await gitRepoFixture();
  try {
    const first = await commitCandidate(repo);
    assert.deepEqual(await checkCandidateEligibility({
      candidateRef: candidateRefOf(repo.base, first), repoRoot: repo.dir,
      grantedBase: repo.base, scope: "src", exclusions: [],
    }), { ok: true });

    const correction = await commitCandidate(repo, "src/correction.go", "correction\n", "correction");
    assert.deepEqual(await checkCandidateEligibility({
      candidateRef: candidateRefOf(repo.base, correction), repoRoot: repo.dir,
      grantedBase: first, scope: "src", exclusions: [],
    }), { ok: true }, "a correction keeps the original task base and parents the preceding candidate");

    await writeFile(join(repo.dir, ".git", "info", "exclude"), "ignored.tmp\n");
    await writeFile(join(repo.dir, "ignored.tmp"), "cache\n");
    assert.deepEqual(await checkCandidateEligibility({
      candidateRef: candidateRefOf(repo.base, correction), repoRoot: repo.dir,
      grantedBase: first, scope: "src", exclusions: [],
    }), { ok: true }, "ignored files are not candidate residue");
    await rm(join(repo.dir, "ignored.tmp"));

    const wrongBase = await checkCandidateEligibility({
      candidateRef: candidateRefOf(repo.base, correction), repoRoot: repo.dir,
      grantedBase: repo.base, scope: "src", exclusions: [],
    });
    assert.equal(wrongBase.ok, false);
    assert.match(wrongBase.error, /parent.*granted candidate base/);

    const missingBase = await checkCandidateEligibility({
      candidateRef: candidateRefOf("f".repeat(40), correction), repoRoot: repo.dir,
      grantedBase: first, scope: "src", exclusions: [],
    });
    assert.equal(missingBase.ok, false);
    assert.match(missingBase.error, /task base.*retrievable/);

    const missingCandidate = await checkCandidateEligibility({
      candidateRef: candidateRefOf(repo.base, "f".repeat(40)), repoRoot: repo.dir,
      grantedBase: first, scope: "src", exclusions: [],
    });
    assert.equal(missingCandidate.ok, false);
    assert.match(missingCandidate.error, /candidate.*retrievable/);

    assert.equal((await checkCandidateEligibility({
      candidateRef: `git:v1:${repo.base.slice(0, 8)}:${correction.slice(0, 8)}`,
      repoRoot: repo.dir, grantedBase: first, scope: "src", exclusions: [],
    })).ok, false, "abbreviated ids fail before Git lookup");

    await writeFile(join(repo.dir, "src", "residue.tmp"), "dirty\n");
    const dirty = await checkCandidateEligibility({
      candidateRef: candidateRefOf(repo.base, correction), repoRoot: repo.dir,
      grantedBase: first, scope: "src", exclusions: [],
    });
    assert.equal(dirty.ok, false);
    assert.match(dirty.error, /not clean/);
    await rm(join(repo.dir, "src", "residue.tmp"));

    await git(["checkout", "--detach", repo.base], repo.dir);
    const moved = await checkCandidateEligibility({
      candidateRef: candidateRefOf(repo.base, correction), repoRoot: repo.dir,
      grantedBase: first, scope: "src", exclusions: [],
    });
    assert.equal(moved.ok, false);
    assert.match(moved.error, /HEAD.*candidate/);

    const outside = await commitCandidate(outOfScopeRepo, "README.md", "changed\n", "outside");
    const outOfScope = await checkCandidateEligibility({
      candidateRef: candidateRefOf(outOfScopeRepo.base, outside), repoRoot: outOfScopeRepo.dir,
      grantedBase: outOfScopeRepo.base, scope: "src", exclusions: [],
    });
    assert.equal(outOfScope.ok, false);
    assert.match(outOfScope.error, /README\.md.*outside the granted scope/);

    const mainBranch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], mergeRepo.dir)).stdout.trim();
    await git(["checkout", "-b", "candidate-side"], mergeRepo.dir);
    await commitCandidate(mergeRepo, "src/side.go", "side\n", "side");
    await git(["checkout", mainBranch], mergeRepo.dir);
    const mainParent = await commitCandidate(mergeRepo, "src/main-change.go", "main\n", "main change");
    await git(["merge", "--no-ff", "candidate-side", "-m", "merge candidate"], mergeRepo.dir);
    const merge = (await git(["rev-parse", "HEAD"], mergeRepo.dir)).stdout.trim();
    const merged = await checkCandidateEligibility({
      candidateRef: candidateRefOf(mergeRepo.base, merge), repoRoot: mergeRepo.dir,
      grantedBase: mainParent, scope: "src", exclusions: [],
    });
    assert.equal(merged.ok, false);
    assert.match(merged.error, /single-parent/);
  } finally {
    await rm(repo.dir, { recursive: true, force: true });
    await rm(outOfScopeRepo.dir, { recursive: true, force: true });
    await rm(mergeRepo.dir, { recursive: true, force: true });
  }
});

test("parseCandidateEvidence: closed candidate-bound evidence rejects malformed, duplicate, mistyped, unknown, and out-of-scope data", async () => {
  const repo = await gitRepoFixture();
  try {
    const candidate = await commitCandidate(repo);
    const authority = candidateAuthority(repo, repo.base);
    const doc = await candidateEvidenceDoc(repo, candidate);
    const valid = parseCandidateEvidence(
      blockText(CANDIDATE_EVIDENCE_BEGIN, CANDIDATE_EVIDENCE_END, doc), authority,
    );
    assert.equal(valid.ok, true);
    assert.equal(valid.evidence.candidate_ref, candidateRefOf(repo.base, candidate));
    assert.deepEqual(valid.evidence.changed_paths, ["src/feature.go"]);

    const duplicateBody = JSON.stringify(doc, null, 2).replace(
      '  "changed_paths": [',
      '  "changed_paths": [],\n  "changed_paths": [',
    );
    const cases = [
      ["malformed", `${CANDIDATE_EVIDENCE_BEGIN}\n{"version":1,broken\n${CANDIDATE_EVIDENCE_END}`],
      ["duplicate", `${CANDIDATE_EVIDENCE_BEGIN}\n${duplicateBody}\n${CANDIDATE_EVIDENCE_END}`],
      ["unknown", blockText(CANDIDATE_EVIDENCE_BEGIN, CANDIDATE_EVIDENCE_END, { ...doc, surprise: true })],
      ["missing objective relevance", blockText(CANDIDATE_EVIDENCE_BEGIN, CANDIDATE_EVIDENCE_END, (() => { const { objective_relevance, ...withoutObjectiveRelevance } = doc; return withoutObjectiveRelevance; })())],
      ["mistyped", blockText(CANDIDATE_EVIDENCE_BEGIN, CANDIDATE_EVIDENCE_END, { ...doc, changed_paths: "src/feature.go" })],
      ["out of scope", blockText(CANDIDATE_EVIDENCE_BEGIN, CANDIDATE_EVIDENCE_END, { ...doc, changed_paths: ["README.md"] })],
      ["scope mismatch", blockText(CANDIDATE_EVIDENCE_BEGIN, CANDIDATE_EVIDENCE_END, { ...doc, scope: { ...doc.scope, writable_scope: "." } })],
      ["unknown marker", '<pi-paseo-orchestration evidence="v2">\n{}\n</pi-paseo-orchestration>'],
    ];
    for (const [label, text] of cases) {
      const parsed = parseCandidateEvidence(text, authority);
      assert.equal(parsed.ok, false, `${label} must fail`);
      assert.equal(typeof parsed.error, "string");
    }
  } finally {
    await rm(repo.dir, { recursive: true, force: true });
  }
});

test("parseReview: neutral exact binding, finding enums, correction classifications, and staleness are closed", () => {
  const candidate = candidateRefOf("a".repeat(40), "b".repeat(40));
  const approve = parseReview(blockText(REVIEW_BEGIN, REVIEW_END, reviewDoc(candidate)));
  assert.equal(approve.ok, true);
  assert.equal(reviewValidForCandidate(approve.review, candidate), true);
  assert.equal(reviewValidForCandidate(approve.review, candidateRefOf("a".repeat(40), "c".repeat(40))), false);

  const finding = {
    finding_id: "F-1",
    severity: "BLOCKER",
    statement: "The candidate skips the required check.",
    impact: "Acceptance could bless an invalid result.",
    evidence: ["review-command-1: missing branch"],
    scope: "src/feature.go",
  };
  assert.equal(parseReview(blockText(REVIEW_BEGIN, REVIEW_END, reviewDoc(candidate, {
    outcome: "FINDINGS", findings: [finding],
  }))).ok, true);
  assert.equal(parseReview(blockText(REVIEW_BEGIN, REVIEW_END, reviewDoc(candidate, {
    correction_of: "review-0",
    correction_classifications: [{ finding_id: "F-0", classification: "resolved", evidence: "fixed in candidate B" }],
  }))).ok, true);

  const cases = [
    ["non-neutral mandate", reviewDoc(candidate, { mandate: "PLEASE_APPROVE" })],
    ["bad severity", reviewDoc(candidate, { outcome: "FINDINGS", findings: [{ ...finding, severity: "MAJOR" }] })],
    ["approve with finding", reviewDoc(candidate, { findings: [finding] })],
    ["findings without finding", reviewDoc(candidate, { outcome: "FINDINGS" })],
    ["classification on initial review", reviewDoc(candidate, { correction_classifications: [{ finding_id: "F-0", classification: "open", evidence: "still fails" }] })],
    ["correction without classifications", reviewDoc(candidate, { correction_of: "review-0" })],
    ["bad correction classification", reviewDoc(candidate, { correction_of: "review-0", correction_classifications: [{ finding_id: "F-0", classification: "STILL_OPEN", evidence: "x" }] })],
    ["unknown field", reviewDoc(candidate, { preferred_verdict: "READY" })],
    ["missing reviewer", reviewDoc(candidate, { reviewer_id: "" })],
    ["invalid candidate", reviewDoc("main")],
  ];
  for (const [label, doc] of cases) {
    assert.equal(parseReview(blockText(REVIEW_BEGIN, REVIEW_END, doc)).ok, false, `${label} must fail`);
  }

  const duplicate = `${REVIEW_BEGIN}\n{"version":1,"review_result_id":"r","review_result_id":"mutated"}\n${REVIEW_END}`;
  assert.match(parseReview(duplicate).error, /duplicate field/);
});

test("parseVerdict and verdictStatus: NOT_READY then NEEDS_HUMAN then READY precedence is exact", async () => {
  const repo = await gitRepoFixture();
  try {
    const candidate = await commitCandidate(repo);
    const ready = verdictDoc(repo, candidate);
    assert.equal(verdictStatus(ready), "READY");
    assert.equal(parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, ready)).ok, true);

    const unresolved = [{ decision_id: "H-1", status: "UNRESOLVED", evidence_ref: "human-question-1" }];
    const needsHuman = { ...ready, human_decisions: unresolved, verdict: "NEEDS_HUMAN" };
    assert.equal(verdictStatus(needsHuman), "NEEDS_HUMAN");
    assert.equal(parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, needsHuman)).ok, true);

    const technicalFailure = {
      ...ready,
      scope_result: "FAIL",
      human_decisions: unresolved,
      verdict: "NOT_READY",
    };
    assert.equal(verdictStatus(technicalFailure), "NOT_READY", "technical failure beats unresolved Human work");
    assert.equal(parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, technicalFailure)).ok, true);
    assert.equal(parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, {
      ...technicalFailure, verdict: "NEEDS_HUMAN",
    })).ok, false, "a lower-precedence declaration fails closed");

    const staleCandidate = candidateRefOf(repo.base, "f".repeat(40));
    const staleReview = { ...ready, review: { ...ready.review, candidate_ref: staleCandidate } };
    assert.equal(verdictStatus(staleReview), "NOT_READY");
    assert.equal(parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, staleReview)).ok, false);

    const openFinding = {
      ...ready,
      review: { ...ready.review, outcome: "FINDINGS", open_findings: ["F-1"] },
    };
    assert.equal(verdictStatus(openFinding), "NOT_READY");
    assert.equal(parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, openFinding)).ok, false);

    const missingEvidence = { ...ready, scope_evidence: [], verdict: "NOT_READY" };
    assert.equal(verdictStatus(missingEvidence), "NOT_READY");
    assert.equal(parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, missingEvidence)).ok, true);

    assert.equal(parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, { ...ready, unknown: true })).ok, false);
  } finally {
    await rm(repo.dir, { recursive: true, force: true });
  }
});

test("parseAcceptance: only one direct Human LOCAL_ACCEPT block parses and it is never an authority envelope", () => {
  assert.equal(CANDIDATE_EVIDENCE_BEGIN, '<pi-paseo-orchestration evidence="v1">');
  assert.equal(REVIEW_BEGIN, '<pi-paseo-orchestration review="v1">');
  assert.equal(VERDICT_BEGIN, '<pi-paseo-orchestration verdict="v1">');
  assert.equal(ACCEPTANCE_BEGIN, '<pi-paseo-orchestration acceptance="v1">');
  const candidate = candidateRefOf("a".repeat(40), "b".repeat(40));
  const valid = blockText(ACCEPTANCE_BEGIN, ACCEPTANCE_END, acceptanceDoc(candidate));
  assert.equal(parseAcceptance(valid, "interactive").ok, true);
  assert.equal(parseAcceptance(valid, "extension").ok, false, "an extension relay is not the direct Human route");
  assert.equal(parseAcceptance(valid).ok, false, "an unproven route fails closed");
  assert.equal(valid.includes("<pi-paseo-orchestration authority="), false, "acceptance is a document, never an authority envelope");

  const duplicateBody = '{"version":1,"decision":"LOCAL_ACCEPT","decision":"LOCAL_ACCEPT","candidate_ref":"' + candidate + '","project_verdict_id":"verdict-1"}';
  const cases = [
    ["misplaced", `Example only:\n${valid}`],
    ["duplicate block", `${valid}\n${valid}`],
    ["duplicate close", `${valid}\n${ACCEPTANCE_END}`],
    ["duplicate field", `${ACCEPTANCE_BEGIN}\n${duplicateBody}\n${ACCEPTANCE_END}`],
    ["malformed", `${ACCEPTANCE_BEGIN}\n{"version":1,broken\n${ACCEPTANCE_END}`],
    ["wrong decision", blockText(ACCEPTANCE_BEGIN, ACCEPTANCE_END, { ...acceptanceDoc(candidate), decision: "APPROVE" })],
    ["unknown field", blockText(ACCEPTANCE_BEGIN, ACCEPTANCE_END, { ...acceptanceDoc(candidate), comment: "looks good" })],
    ["invalid candidate", blockText(ACCEPTANCE_BEGIN, ACCEPTANCE_END, acceptanceDoc("HEAD"))],
    ["unknown version marker", '<pi-paseo-orchestration acceptance="v2">\n{}\n</pi-paseo-orchestration>'],
  ];
  for (const [label, text] of cases) {
    assert.equal(parseAcceptance(text, "interactive").ok, false, `${label} must fail`);
  }
});

test("validateAcceptance: a complete exact chain passes; every broken identity, evidence, review, decision, route, or Git fact fails", async () => {
  const repo = await gitRepoFixture();
  try {
    const candidate = await commitCandidate(repo);
    const chain = await validAcceptanceChain(repo, candidate);
    const refsBefore = (await git(["show-ref"], repo.dir)).stdout;
    const headBefore = (await git(["rev-parse", "HEAD"], repo.dir)).stdout;
    assert.deepEqual(await validateAcceptance(chain), { ok: true });
    assert.equal((await git(["show-ref"], repo.dir)).stdout, refsBefore, "acceptance creates no ref/tag/note");
    assert.equal((await git(["rev-parse", "HEAD"], repo.dir)).stdout, headBefore, "acceptance creates no commit");

    const noReviewVerdict = parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, {
      ...chain.documents.verdictDocument,
      review: {
        required: false,
        review_result_id: null,
        candidate_ref: null,
        outcome: "NOT_REQUIRED",
        open_findings: [],
      },
    }));
    assert.equal(noReviewVerdict.ok, true);
    assert.deepEqual(await validateAcceptance({
      ...chain,
      authority: { ...chain.authority, reviewRequired: false },
      review: null,
      verdict: noReviewVerdict.verdict,
    }), { ok: true }, "review is conditional on the protocol/class fact");

    const staleCandidate = candidateRefOf(repo.base, "f".repeat(40));
    const staleVerdictDocument = {
      ...chain.documents.verdictDocument,
      candidate_ref: staleCandidate,
      review: { ...chain.documents.verdictDocument.review, candidate_ref: staleCandidate },
    };
    const staleVerdict = parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, staleVerdictDocument));
    assert.equal(staleVerdict.ok, true);
    assert.equal((await validateAcceptance({ ...chain, verdict: staleVerdict.verdict })).ok, false, "stale verdict");

    const mismatchedAcceptance = parseAcceptance(blockText(
      ACCEPTANCE_BEGIN, ACCEPTANCE_END, acceptanceDoc(staleCandidate),
    ), "interactive");
    assert.equal(mismatchedAcceptance.ok, true);
    assert.equal((await validateAcceptance({ ...chain, acceptance: mismatchedAcceptance.acceptance })).ok, false, "mismatched acceptance candidate");

    const mismatchedVerdictId = parseAcceptance(blockText(
      ACCEPTANCE_BEGIN, ACCEPTANCE_END,
      acceptanceDoc(chain.documents.evidenceDocument.candidate_ref, "verdict-2"),
    ), "interactive");
    assert.equal(mismatchedVerdictId.ok, true);
    assert.equal((await validateAcceptance({ ...chain, acceptance: mismatchedVerdictId.acceptance })).ok, false, "mismatched immutable verdict id");

    assert.equal((await validateAcceptance({ ...chain, review: null })).ok, false, "required review missing");
    assert.equal((await validateAcceptance({ ...chain, evidence: null })).ok, false, "candidate evidence missing");
    assert.equal((await validateAcceptance({
      ...chain,
      evidence: {
        ...chain.evidence,
        cumulative_diff: { ...chain.evidence.cumulative_diff, diff: `${chain.evidence.cumulative_diff.diff}\ntampered` },
      },
    })).ok, false, "candidate evidence must match the exact Git diff");
    assert.equal((await validateAcceptance({
      ...chain,
      protocolPin: { ...chain.protocolPin, digest: "f".repeat(64) },
    })).ok, false, "protocol pin drift");

    const staleReview = parseReview(blockText(REVIEW_BEGIN, REVIEW_END, reviewDoc(staleCandidate)));
    assert.equal(staleReview.ok, true);
    assert.equal((await validateAcceptance({ ...chain, review: staleReview.review })).ok, false, "stale review");

    const selfReview = parseReview(blockText(REVIEW_BEGIN, REVIEW_END, reviewDoc(
      chain.documents.evidenceDocument.candidate_ref,
      { reviewer_id: "peer-1" },
    )));
    assert.equal(selfReview.ok, true);
    assert.equal((await validateAcceptance({ ...chain, review: selfReview.review })).ok, false, "writer cannot review itself");

    const needsHumanDocument = {
      ...chain.documents.verdictDocument,
      human_decisions: [{ decision_id: "H-1", status: "UNRESOLVED", evidence_ref: "human-question-1" }],
      verdict: "NEEDS_HUMAN",
    };
    const needsHuman = parseVerdict(blockText(VERDICT_BEGIN, VERDICT_END, needsHumanDocument));
    assert.equal(needsHuman.ok, true);
    assert.equal((await validateAcceptance({ ...chain, verdict: needsHuman.verdict })).ok, false, "unresolved Human decision");

    const relayed = parseAcceptance(blockText(
      ACCEPTANCE_BEGIN, ACCEPTANCE_END, chain.documents.acceptanceDocument,
    ), "extension");
    assert.equal(relayed.ok, false);
    assert.equal((await validateAcceptance({ ...chain, acceptance: null })).ok, false, "relayed acceptance never reaches the gate");

    await writeFile(join(repo.dir, "src", "dirty.tmp"), "dirty\n");
    const dirty = await validateAcceptance(chain);
    assert.equal(dirty.ok, false);
    assert.match(dirty.error, /not clean/);
    await rm(join(repo.dir, "src", "dirty.tmp"));

    await git(["checkout", "--detach", repo.base], repo.dir);
    const moved = await validateAcceptance(chain);
    assert.equal(moved.ok, false);
    assert.match(moved.error, /HEAD.*candidate/);
  } finally {
    await rm(repo.dir, { recursive: true, force: true });
  }
});

test("status, passing tests, HANDOFF, Reviewer APPROVE, and READY verdict are each non-accepting signals", async () => {
  const repo = await gitRepoFixture();
  try {
    const candidate = await commitCandidate(repo);
    const chain = await validAcceptanceChain(repo, candidate);
    const signals = [
      ["lifecycle", { lifecycle_status: "finished" }],
      ["tests", { tests: "PASS" }],
      ["handoff", handoffReport({ payload: { ...handoffReport().payload, candidate: candidateRefOf(repo.base, candidate) } })],
      ["review approve", chain.review],
      ["ready verdict", chain.verdict],
      ["prose", "LOCAL_ACCEPT: everything looks good"],
    ];
    for (const [label, signal] of signals) {
      const result = await validateAcceptance({ ...chain, acceptance: signal });
      assert.equal(result.ok, false, `${label} alone must never accept`);
    }
    assert.equal((await validateAcceptance({ ...chain, acceptance: null })).ok, false);
    assert.deepEqual(await validateAcceptance(chain), { ok: true }, "only the direct parsed Human block crosses the boundary");
  } finally {
    await rm(repo.dir, { recursive: true, force: true });
  }
});

// ─── Slice 7: Supervisor Notebook and observation-only Doctor ──────────────────

function notebookEntryFixture(manifest, projectId, repoRoot, over = {}) {
  const now = "2026-01-02T03:04:05.000Z";
  const selected = over.selected ?? "selected bounded fact";
  const entry = {
    contract: extension.NOTEBOOK_ENTRY_CONTRACT,
    schema_version: "v1",
    entry_id: over.entry_id ?? "entry-1",
    notebook_id: manifest.notebook_id,
    protocol_project_id: projectId,
    recorded_at: now,
    observed_at: now,
    writer: { supervisor_agent_id: "supervisor-1", pi_session_id: "session-1" },
    context: {
      paseo_project_id: "paseo-project-1",
      repository_root: repoRoot,
      paseo_workspace_id: "workspace-1",
      lead_agent_id: "absent",
      binding_source: "manifest",
      protocol_pin: null,
    },
    observation: over.observation ?? "Lead waited after an external failure.",
    evidence: [{
      item_id: "evidence-1",
      observed_at: now,
      kind: "session-observation",
      source: "paseo:current-agent",
      selected,
      source_digest: null,
      retained_digest: digestOf(selected).replace(/^/, "sha256:"),
      redaction_notes: [],
      truncated: false,
    }],
    suspected_mechanism: { hypothesis: "The prerequisite was not checked.", uncertainty: "Need a fresh live observation.", confidence: "medium" },
    impact: "Attention was spent without changing the prerequisite.",
    question: "What current fact should be checked before another wait?",
    recommendation: "Re-observe the external prerequisite once.",
    escalation: { needed: false, owner: "none", reason: "No owner decision is required yet.", relay_target: null },
    history: { relation: "original", references: [], reason: "First observation." },
    sensitivity: { redactions: [], contains_secret: false },
    entry_digest: "",
  };
  Object.assign(entry, over);
  delete entry.entry_digest;
  entry.entry_digest = `sha256:${digestOf(extension.canonicalNotebookJson(entry))}`;
  return entry;
}

async function notebookFixture() {
  const config = await mkdtemp(join(tmpdir(), "ppo-notebook-config-"));
  const repo = await gitRepoFixture();
  const projectId = "Human project / exact ID";
  const env = { PI_CODING_AGENT_DIR: config };
  const initialized = await extension.initializeNotebook({
    env, projectId, paseoProjectId: "paseo-project-1", repositoryRoot: repo.dir,
    supervisorAgentId: "supervisor-1", piSessionId: "session-1", createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(initialized.ok, true, initialized.error);
  return { config, repo, env, projectId, initialized };
}

test("Notebook init discovers the current Paseo workspace from a Human session", async () => {
  const config = await mkdtemp(join(tmpdir(), "ppo-human-notebook-config-"));
  const repo = await gitRepoFixture();
  const bin = await fakePaseoBin({ workspaceCwd: repo.dir });
  const ext = await freshExtension();
  try {
    const fake = fakePi({
      env: { PI_CODING_AGENT_DIR: config, PATH: bin },
      ui: { input: async () => "ppo-fixture", confirm: async () => true }
    });
    fake.ctx.cwd = repo.dir;
    ext.default(fake.pi);
    await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);
    const result = await fake.commands.get("ppo:notebook-init").handler("", fake.ctx);
    assert.equal(result.ok, true, result.error);
    const manifest = JSON.parse(await readFile(result.paths.manifestPath, "utf8"));
    assert.equal(manifest.created_by.supervisor_agent_id, "human");
    assert.equal(manifest.paseo_project_id_at_creation, "paseo-project-1");
  } finally {
    await rm(config, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("Notebook: exact project key, create-once manifest, immutable append, idempotency, conflict, and staging cleanup", async () => {
  const fixture = await notebookFixture();
  try {
    const { config, repo, env, projectId, initialized } = fixture;
    assert.equal(extension.deriveNotebookProjectKey(projectId), digestOf(projectId));
    assert.match(initialized.paths.manifestPath, new RegExp(`supervisor-notebooks/v1/projects/${digestOf(projectId)}/manifest\\.json$`));
    const manifestBytes = await readFile(initialized.paths.manifestPath);
    const reinit = await extension.initializeNotebook({
      env, projectId, paseoProjectId: "paseo-project-1", repositoryRoot: repo.dir,
      supervisorAgentId: "supervisor-1", piSessionId: "session-2", createdAt: "2026-01-03T00:00:00.000Z",
    });
    assert.equal(reinit.ok, false);
    assert.match(reinit.error, /create-once|already exists/);
    assert.deepEqual(await readFile(initialized.paths.manifestPath), manifestBytes, "re-init cannot mutate manifest bytes");

    const entry = notebookEntryFixture(initialized.manifest, projectId, repo.dir);
    const context = entry.context;
    const first = await extension.appendNotebookEntry({ env, projectId, entry, context });
    assert.equal(first.ok, true, first.error);
    const entryPath = join(initialized.paths.entriesRoot, "entry-1.json");
    const entryBytes = await readFile(entryPath);
    assert.deepEqual(await readdir(initialized.paths.stagingRoot), [], "private staging has no residue after publish");

    const duplicate = await extension.appendNotebookEntry({ env, projectId, entry, context });
    assert.deepEqual({ ok: duplicate.ok, status: duplicate.status }, { ok: true, status: "idempotent" });
    assert.deepEqual(await readFile(entryPath), entryBytes, "idempotency preserves exact bytes");

    const conflictEntry = notebookEntryFixture(initialized.manifest, projectId, repo.dir, { observation: "different bytes" });
    const conflict = await extension.appendNotebookEntry({ env, projectId, entry: conflictEntry, context });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.status, "conflict");
    assert.deepEqual(await readFile(entryPath), entryBytes, "same ID conflict cannot replace the existing entry");

    const repoReadme = await readFile(join(repo.dir, "README.md"));
    const snapshot = await extension.snapshotNotebook({ env, projectId });
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.snapshot.valid_causal_projection.length, 1);
    assert.deepEqual(await readFile(join(repo.dir, "README.md")), repoReadme, "Notebook never writes the project");
  } finally {
    await rm(fixture.config, { recursive: true, force: true });
    await rm(fixture.repo.dir, { recursive: true, force: true });
  }
});

test("Notebook: corrupt entries remain in the physical digest but are excluded; malformed manifest blocks writes", async () => {
  const fixture = await notebookFixture();
  try {
    const { config, repo, env, projectId, initialized } = fixture;
    await writeFile(join(initialized.paths.entriesRoot, "corrupt.json"), "{broken", "utf8");
    const entry = notebookEntryFixture(initialized.manifest, projectId, repo.dir);
    const appended = await extension.appendNotebookEntry({ env, projectId, entry, context: entry.context });
    assert.equal(appended.ok, true, appended.error);
    const snapshot = await extension.snapshotNotebook({ env, projectId });
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.snapshot.invalid_entries.some((item) => item.filename === "corrupt.json"), true);
    assert.equal(snapshot.snapshot.physical_entries.some((item) => item.filename === "corrupt.json"), true);
    assert.equal(snapshot.snapshot.valid_causal_projection.length, 1);

    const manifestBytes = await readFile(initialized.paths.manifestPath);
    await writeFile(initialized.paths.manifestPath, Buffer.from("{}"));
    const blocked = await extension.appendNotebookEntry({
      env, projectId, entry: notebookEntryFixture(initialized.manifest, projectId, repo.dir, { entry_id: "entry-2" }),
      context: entry.context,
    });
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /manifest|canonical|contract|invalid/i);
    assert.equal(await readFile(initialized.paths.manifestPath, "utf8"), "{}", "corrupt manifest is never repaired");
    await writeFile(initialized.paths.manifestPath, manifestBytes);
  } finally {
    await rm(fixture.config, { recursive: true, force: true });
    await rm(fixture.repo.dir, { recursive: true, force: true });
  }
});

test("Notebook: distinct IDs publish concurrently and path/symlink violations fail closed", async () => {
  const fixture = await notebookFixture();
  try {
    const { config, repo, env, projectId, initialized } = fixture;
    const entries = ["entry-a", "entry-b", "entry-c"].map((entry_id) => notebookEntryFixture(initialized.manifest, projectId, repo.dir, { entry_id }));
    const results = await Promise.all(entries.map((entry) => extension.appendNotebookEntry({ env, projectId, entry, context: entry.context })));
    assert.deepEqual(results.map((result) => result.ok), [true, true, true]);
    assert.deepEqual((await readdir(initialized.paths.entriesRoot)).filter((name) => name.endsWith(".json")).sort(), ["entry-a.json", "entry-b.json", "entry-c.json", "corrupt.json"].filter((name) => name !== "corrupt.json").sort());
    const traversal = await extension.appendNotebookEntry({
      env, projectId, entry: notebookEntryFixture(initialized.manifest, projectId, repo.dir, { entry_id: "../escape" }), context: entries[0].context,
    });
    assert.equal(traversal.ok, false);
    assert.match(traversal.error, /filename|component|entry_id/);
  } finally {
    await rm(fixture.config, { recursive: true, force: true });
    await rm(fixture.repo.dir, { recursive: true, force: true });
  }
});

test("Doctor: passive warning/report parsing, no output channel probe, and governed adapter fail-closed status", async () => {
  const repo = await gitRepoFixture();
  const config = await mkdtemp(join(tmpdir(), "ppo-doctor-config-"));
  try {
    const passive = await extension.buildDoctorReport({
      ctx: { cwd: repo.dir, env: {} },
      pi: { getActiveTools: () => ["read", "bash"], setActiveTools() {}, setModel() {}, setThinkingLevel() {} },
      now: "2026-01-01T00:00:00.000Z", reportId: "doctor-passive",
    });
    assert.equal(passive.overall_status, "WARN");
    assert.equal(passive.checks.find((check) => check.code === "ADAPTER_OBSERVER").status, "WARN");
    assert.match(passive.checks.find((check) => check.code === "ADAPTER_OBSERVER").observed, /no Paseo agent identity to observe/);
    const block = extension.formatDoctorReport(passive);
    assert.equal(extension.parseDoctorReport(block).ok, true);
    assert.deepEqual(passive.checks.map((check) => check.code), [...passive.checks].map((check) => check.code).sort());

    let cwdReads = 0;
    const unavailable = await extension.runDoctor("", {
      outputMode: "json",
      get cwd() { cwdReads += 1; return repo.dir; },
    }, { getActiveTools() { throw new Error("doctor must not probe print mode"); } });
    assert.deepEqual(unavailable, { ok: false, error: "OUTPUT_CHANNEL_UNAVAILABLE" });
    assert.equal(cwdReads, 0);

    const ext = await freshExtension();
    const profiles = await profileDirFixture();
    const settingsDir = await mkdtemp(join(tmpdir(), "ppo-doctor-governed-"));
    const fake = fakePi({
      activeTools: ["read", "bash", "mcp"],
      env: { PI_CODING_AGENT_DIR: settingsDir, PI_PASEO_ORCHESTRATION_ROLE: "supervisor", PASEO_AGENT_ID: "supervisor-1", PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles, PATH: "/nonexistent-ppo-path" },
    });
    await writeSettings(settingsDir, validDoc);
    fake.ctx.cwd = repo.dir;
    ext.default(fake.pi);
    await fake.handlers.get("session_start")({}, fake.ctx);
    const governed = await ext.buildDoctorReport({ ctx: fake.ctx, pi: fake.pi, now: "2026-01-01T00:00:00.000Z", reportId: "doctor-supervisor" });
    assert.equal(governed.checks.find((check) => check.code === "ADAPTER_OBSERVER").status, "BLOCKED");
    assert.match(governed.checks.find((check) => check.code === "ADAPTER_OBSERVER").observed, /paseo inspect failed/);
    assert.equal(governed.overall_status, "BLOCKED");
    await writeSettings(settingsDir, { ...validDoc, roles: { ...validDoc.roles, supervisor: { ...validDoc.roles.supervisor, thinking: "low" } } });
    const drifted = await ext.buildDoctorReport({ ctx: fake.ctx, pi: fake.pi, now: "2026-01-01T00:00:00.000Z", reportId: "doctor-drift" });
    assert.equal(drifted.checks.find((check) => check.code === "ROLE_SETTINGS").status, "BLOCKED");
    await rm(settingsDir, { recursive: true, force: true });
    await rm(profiles, { recursive: true, force: true });
  } finally {
    await rm(config, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
  }
});

test("Notebook: project binding drift stops writes; Human-confirmed move appends a rebind entry", async () => {
  const fixture = await notebookFixture();
  try {
    const { config, repo, env, projectId, initialized } = fixture;
    const entry = notebookEntryFixture(initialized.manifest, projectId, repo.dir);

    // Same binding appends normally.
    const same = await extension.appendNotebookEntry({ env, projectId, entry, context: entry.context });
    assert.equal(same.ok, true, same.error);

    // Live binding differs from the manifest locators → move_or_copy, write stops.
    const movedContext = { ...entry.context, repository_root: "/elsewhere/repo" };
    const second = notebookEntryFixture(initialized.manifest, projectId, "/elsewhere/repo", { entry_id: "entry-2" });
    const blocked = await extension.appendNotebookEntry({ env, projectId, entry: second, context: movedContext });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.classification, "move_or_copy");

    // Human-confirmed move (allowRebind) appends a rebind entry, preserving prior bytes.
    const rebound = await extension.appendNotebookEntry({ env, projectId, entry: second, context: movedContext, allowRebind: true });
    assert.equal(rebound.ok, true, rebound.error);
    const reboundEntry = JSON.parse(await readFile(join(initialized.paths.entriesRoot, "entry-2.json"), "utf8"));
    assert.equal(reboundEntry.history.relation, "rebind");
    assert.equal(reboundEntry.context.binding_source, "entry-2");
    assert.deepEqual(JSON.parse(await readFile(join(initialized.paths.entriesRoot, "entry-1.json"), "utf8")), entry, "move never mutates prior entries");
  } finally {
    await rm(fixture.config, { recursive: true, force: true });
    await rm(fixture.repo.dir, { recursive: true, force: true });
  }
});

test("Doctor: a full run mutates nothing — config and repository trees are byte-identical", async () => {
  const config = await mkdtemp(join(tmpdir(), "ppo-doctor-nomut-"));
  const repo = await gitRepoFixture();
  try {
    await mkdir(join(config, "pi-paseo-orchestration"), { recursive: true });
    await writeSettings(config, validDoc);
    const fake = fakePi({ env: { PI_PASEO_ORCHESTRATION_ROLE: "lead", PASEO_AGENT_ID: "agent-7", PI_CODING_AGENT_DIR: config } });
    fake.ctx.cwd = repo.dir;
    const ext = await freshExtension();
    ext.default(fake.pi);
    const command = fake.commands.get("ppo:doctor");
    const before = async (dir) => {
      const map = new Map();
      const walk = async (base, rel) => {
        for (const name of await readdir(join(base, rel))) {
          const full = join(base, rel, name);
          const st = await stat(full);
          map.set(join(rel, name), st.isDirectory() ? "dir" : (await readFile(full)).toString("hex"));
        }
      };
      await walk(dir, "");
      for (const name of await readdir(dir)) {
        const full = join(dir, name);
        if ((await stat(full)).isDirectory()) await walk(dir, name);
      }
      return [...map.entries()].sort();
    };
    const configBefore = await before(config);
    const repoBefore = await before(repo.dir);
    const result = await command.handler("", fake.ctx);
    assert.equal(result.ok, true, result.error);
    assert.deepEqual(await before(config), configBefore, "doctor must not write the Pi config");
    assert.deepEqual(await before(repo.dir), repoBefore, "doctor must not write the repository");
  } finally {
    await rm(config, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
  }
});

test("Doctor: secret-shaped values are redacted from the report", async () => {
  const config = await mkdtemp(join(tmpdir(), "ppo-doctor-redact-"));
  try {
    const fake = fakePi({ env: { PI_PASEO_ORCHESTRATION_ROLE: "peer token=super-secret-value", PI_CODING_AGENT_DIR: config } });
    const ext = await freshExtension();
    const report = await ext.buildDoctorReport({ ctx: fake.ctx, pi: fake.pi, now: "2026-01-01T00:00:00.000Z", reportId: "doctor-redact" });
    const block = ext.formatDoctorReport(report);
    assert.equal(report.checks.find((check) => check.code === "ROLE_ACTIVATION").status, "BLOCKED");
    assert.equal(block.includes("super-secret-value"), false, "raw secret must never appear");
    assert.equal(block.includes("[REDACTED]"), true);
  } finally {
    await rm(config, { recursive: true, force: true });
  }
});

// ─── Slice 8: package verification and release gate ───────────────────────────

const { resolvePackageResources, releaseGate } = extension;

// Copy the dev root (without Git/session internals) into a fresh directory so
// resource resolution can be proven from a relocated package root.
const copyPackageRoot = async (target) => {
  for (const entry of await readdir(root)) {
    if ([".git", ".scratch", ".pi-glla", ".pi-subagents", "node_modules"].includes(entry)) continue;
    await cp(join(root, entry), join(target, entry), { recursive: true, force: true });
  }
};

// Sorted [relative path, "dir"|hex bytes] recursive tree; .git is excluded and
// Git mutation is asserted separately through porcelain/log state.
const treeBytes = async (base) => {
  const map = new Map();
  const walk = async (rel) => {
    for (const name of await readdir(join(base, rel))) {
      if (rel === "" && name === ".git") continue;
      const full = join(base, rel, name);
      const st = await stat(full);
      const key = join(rel, name);
      if (st.isDirectory()) { map.set(key, "dir"); await walk(key); }
      else map.set(key, (await readFile(full)).toString("hex"));
    }
  };
  await walk("");
  return [...map.entries()].sort();
};

const gitSnapshot = async (dir) => {
  const head = await git(["rev-parse", "HEAD"], dir);
  const status = await git(["status", "--porcelain=v1", "--untracked-files=all"], dir);
  const log = await git(["log", "--oneline", "--all"], dir);
  return [head.stdout, status.stdout, log.stdout].join("\n");
};

test("package resources resolve from canonical loaded-module provenance: real root, copied root, and unrelated cwd", async () => {
  const moduleUrl = pathToFileURL(join(root, manifest.pi.extensions[0]));
  const resolved = await resolvePackageResources(moduleUrl);
  assert.equal(resolved.ok, true, resolved.error);
  const realRoot = await realpath(root);
  assert.equal(resolved.resources.package_root, realRoot);
  assert.equal(resolved.resources.extension, join(realRoot, manifest.pi.extensions[0]));
  assert.equal(resolved.resources.skill, join(realRoot, manifest.pi.skills[0]));
  assert.equal(resolved.resources.guide, join(realRoot, "skills/workspace-protocol/AUTHORING-GUIDE.md"));
  assert.equal(resolved.resources.orchestration_skill, join(realRoot, manifest.pi.skills[1]));
  assert.deepEqual(Object.keys(resolved.resources.profiles).sort(), ["lead", "peer", "supervisor"]);
  for (const [role, rel] of [["supervisor", "profiles/supervisor.md"], ["lead", "profiles/lead.md"], ["peer", "profiles/peer.md"]]) {
    assert.equal(resolved.resources.profiles[role], join(realRoot, rel));
  }

  const copy = await mkdtemp(join(tmpdir(), "ppo-pkgcopy-"));
  const elsewhere = await mkdtemp(join(tmpdir(), "ppo-elsewhere-"));
  const previousCwd = process.cwd();
  try {
    await copyPackageRoot(copy);
    const copied = await resolvePackageResources(pathToFileURL(join(copy, manifest.pi.extensions[0])));
    assert.equal(copied.ok, true, copied.error);
    assert.notEqual(copied.resources.package_root, realRoot);
    assert.equal(copied.resources.guide, join(copied.resources.package_root, "skills/workspace-protocol/AUTHORING-GUIDE.md"));
    assert.equal(copied.resources.orchestration_skill, join(copied.resources.package_root, manifest.pi.skills[1]));
    assert.deepEqual(copied.resources.profiles, {
      supervisor: join(copied.resources.package_root, "profiles/supervisor.md"),
      lead: join(copied.resources.package_root, "profiles/lead.md"),
      peer: join(copied.resources.package_root, "profiles/peer.md"),
    });

    // Unrelated cwd: the function must not consult cwd/repo-root/config-root.
    process.chdir(elsewhere);
    const fromElsewhere = await resolvePackageResources(pathToFileURL(join(copy, manifest.pi.extensions[0])));
    assert.equal(fromElsewhere.ok, true, fromElsewhere.error);
    assert.deepEqual(fromElsewhere.resources, copied.resources);
  } finally {
    process.chdir(previousCwd);
    await rm(copy, { recursive: true, force: true });
    await rm(elsewhere, { recursive: true, force: true });
  }
});

test("package resources fail closed on missing, empty, non-regular, symlink-escaped, and manifest violations", async () => {
  const makeCopy = async () => {
    const copy = await mkdtemp(join(tmpdir(), "ppo-pkgadv-"));
    await copyPackageRoot(copy);
    return copy;
  };
  const urlOf = (copy) => pathToFileURL(join(copy, manifest.pi.extensions[0]));
  const writeManifest = async (copy, over) => {
    const doc = JSON.parse(await readFile(join(copy, "package.json"), "utf8"));
    Object.assign(doc, over);
    await writeFile(join(copy, "package.json"), JSON.stringify(doc), "utf8");
  };

  const cases = [];
  const missing = await makeCopy();
  cases.push([missing, async () => rm(join(missing, "profiles", "peer.md")), /peer\.md must exist/]);

  const missingGuide = await makeCopy();
  cases.push([missingGuide, async () => rm(join(missingGuide, "skills/workspace-protocol/AUTHORING-GUIDE.md")), /guide must exist/]);

  const emptyGuide = await makeCopy();
  cases.push([emptyGuide, async () => writeFile(join(emptyGuide, "skills/workspace-protocol/AUTHORING-GUIDE.md"), "", "utf8"), /guide must be nonempty/]);

  const nonRegularGuide = await makeCopy();
  cases.push([nonRegularGuide, async () => { const file = join(nonRegularGuide, "skills/workspace-protocol/AUTHORING-GUIDE.md"); await rm(file); await mkdir(file); }, /guide must be a regular file/]);

  const symlinkGuide = await makeCopy();
  const outsideGuide = join(tmpdir(), `ppo-guide-outside-${Math.random().toString(36).slice(2)}.md`);
  await writeFile(outsideGuide, "outside guide\n", "utf8");
  cases.push([symlinkGuide, async () => { await rm(join(symlinkGuide, "skills/workspace-protocol/AUTHORING-GUIDE.md")); await symlink(outsideGuide, join(symlinkGuide, "skills/workspace-protocol/AUTHORING-GUIDE.md")); }, /guide must be a direct descendant without symlink escape/]);

  const empty = await makeCopy();
  cases.push([empty, async () => writeFile(join(empty, manifest.pi.skills[0]), "", "utf8"), /skill must be nonempty/]);

  const nonRegular = await makeCopy();
  cases.push([nonRegular, async () => { const file = join(nonRegular, manifest.pi.extensions[0]); await rm(file); await mkdir(file); }, /extension must be a regular file/]);

  const symlinkEscape = await makeCopy();
  const outside = join(tmpdir(), `ppo-outside-${Math.random().toString(36).slice(2)}.md`);
  await writeFile(outside, "outside secret\n", "utf8");
  cases.push([symlinkEscape, async () => { await rm(join(symlinkEscape, "profiles", "lead.md")); await symlink(outside, join(symlinkEscape, "profiles", "lead.md")); }, /lead\.md must be a direct descendant without symlink escape/]);

  const twoExtensions = await makeCopy();
  cases.push([twoExtensions, async () => writeManifest(twoExtensions, { pi: { ...JSON.parse(await readFile(join(twoExtensions, "package.json"), "utf8")).pi, extensions: ["./extensions/a.ts", "./extensions/b.ts"] } }), /exactly one extension/]);

  const noSkill = await makeCopy();
  cases.push([noSkill, async () => writeManifest(noSkill, { pi: { ...JSON.parse(await readFile(join(noSkill, "package.json"), "utf8")).pi, skills: [] } }), /exactly two skills/]);

  const adapterDep = await makeCopy();
  cases.push([adapterDep, () => writeManifest(adapterDep, { dependencies: { "pi-mcp-adapter": "2.22.0" } }), /adapter dependency/]);

  const installScript = await makeCopy();
  cases.push([installScript, () => writeManifest(installScript, { scripts: { install: "echo pwned" } }), /install lifecycle scripts/]);

  const extraSurface = await makeCopy();
  cases.push([extraSurface, async () => writeManifest(extraSurface, { pi: { ...JSON.parse(await readFile(join(extraSurface, "package.json"), "utf8")).pi, prompts: ["./prompts/x.md"] } }), /unsupported pi surfaces/]);

  const traversal = await makeCopy();
  cases.push([traversal, async () => writeManifest(traversal, { pi: { ...JSON.parse(await readFile(join(traversal, "package.json"), "utf8")).pi, extensions: ["../outside.ts"] } }), /direct descendant of the package root/]);

  const absolutePath = await makeCopy();
  cases.push([absolutePath, async () => writeManifest(absolutePath, { pi: { ...JSON.parse(await readFile(join(absolutePath, "package.json"), "utf8")).pi, extensions: [outside] } }), /absolute path/]);

  const wrongModule = await makeCopy();
  cases.push([wrongModule, async () => writeFile(join(wrongModule, "extensions", "other.ts"), "export default () => {};\n", "utf8"), pathToFileURL(join(wrongModule, "extensions", "other.ts")), /not the manifest-declared extension/]);

  try {
    for (const [copy, mutate, ...rest] of cases) {
      const [url, expected] = rest.length === 1 ? [null, rest[0]] : rest;
      await mutate();
      const result = await resolvePackageResources(url ?? urlOf(copy));
      assert.equal(result.ok, false, `${copy} must fail`);
      assert.match(result.error, expected, `${copy} error must match ${expected}`);
    }

    // Non-file provenance and data-URL modules fail closed without cwd fallback.
    const dataUrl = await resolvePackageResources("data:text/javascript;base64,ZXhwb3J0IGRlZmF1bHQgKCkgPT4ge307");
    assert.equal(dataUrl.ok, false);
    assert.match(dataUrl.error, /canonical file URL/);
    const fresh = await freshExtension();
    const noArg = await fresh.resolvePackageResources();
    assert.equal(noArg.ok, false);
    assert.match(noArg.error, /canonical file URL/);
  } finally {
    for (const [copy] of cases) await rm(copy, { recursive: true, force: true });
    await rm(outside, { force: true });
    await rm(outsideGuide, { force: true });
  }
});

const allReleaseFacts = () => ({
  install_pinned: true,
  relocation: true,
  doctor_tui_rpc_equivalence: true,
  settings_exact: true,
  notebook_primitives: true,
  hermetic_tests: true,
  release_smoke: true,
  mutation_boundaries: true,
  capabilities: { pi_api: true, paseo_live: true, adapter_current_agent_observer: true },
});

test("releaseGate passes only when every required fact is exactly proven", () => {
  assert.deepEqual(releaseGate(allReleaseFacts()), { ok: true });
});

test("releaseGate fails closed on every missing fact, the absent adapter observer, and unknown or non-boolean values", () => {
  const empty = releaseGate({});
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.blockers.map((blocker) => blocker.fact), [
    "capabilities", "doctor_tui_rpc_equivalence", "hermetic_tests", "install_pinned",
    "mutation_boundaries", "notebook_primitives", "release_smoke", "relocation", "settings_exact",
  ]);
  assert.equal(empty.blockers.every((blocker) => blocker.status === "missing"), true);
  assert.equal(empty.blockers.every((blocker) => typeof blocker.owner === "string" && blocker.owner !== ""), true);

  // The public current-agent observer is a REQUIRED capability: when the facts
  // say it is absent the gate must list it as a blocker (the adapter is not
  // implemented by this slice).
  const withoutAdapter = releaseGate({ ...allReleaseFacts(), capabilities: { ...allReleaseFacts().capabilities, adapter_current_agent_observer: false } });
  assert.equal(withoutAdapter.ok, false);
  assert.deepEqual(withoutAdapter.blockers.map((blocker) => blocker.fact), ["capabilities.adapter_current_agent_observer"]);
  const adapterBlocker = withoutAdapter.blockers[0];
  assert.equal(adapterBlocker.status, "failed");
  assert.equal(adapterBlocker.observed, false);
  assert.equal(adapterBlocker.owner, "operator");
  assert.match(adapterBlocker.condition, /current-agent observer/);
  assert.match(adapterBlocker.action, /rerun the release smoke on the exact npm package candidate/);

  // Unknown and non-boolean facts fail closed.
  const unproven = releaseGate({ ...allReleaseFacts(), install_pinned: "pending" });
  assert.equal(unproven.ok, false);
  assert.equal(unproven.blockers.some((blocker) => blocker.fact === "install_pinned" && blocker.status === "unknown" && blocker.observed === "pending"), true);
  const unknownFact = releaseGate({ ...allReleaseFacts(), mystery_fact: true });
  assert.equal(unknownFact.blockers.some((blocker) => blocker.fact === "mystery_fact" && blocker.status === "unknown"), true);
  const unknownCapability = releaseGate({ ...allReleaseFacts(), capabilities: { ...allReleaseFacts().capabilities, magic_observer: true } });
  assert.equal(unknownCapability.blockers.some((blocker) => blocker.fact === "capabilities.magic_observer" && blocker.status === "unknown"), true);

  for (const bad of [null, undefined, [], "facts"]) {
    const result = releaseGate(bad);
    assert.equal(result.ok, false);
    assert.deepEqual(result.blockers.map((blocker) => blocker.fact), ["facts"]);
  }

  // Deterministic: repeated evaluations are byte-identical and sorted.
  assert.deepEqual(releaseGate({}), releaseGate({}));
  const adapterFacts = { ...allReleaseFacts(), capabilities: { ...allReleaseFacts().capabilities, adapter_current_agent_observer: false } };
  assert.deepEqual(releaseGate(adapterFacts), releaseGate(adapterFacts));
});

test("release smoke script exists, is node-stdlib-only, runs, and reports the absent adapter as the release blocker", async () => {
  assert.equal(manifest.scripts["release:smoke"], "node test/release-smoke.mjs");
  const smokeSource = await readFile(join(root, "test", "release-smoke.mjs"), "utf8");
  for (const match of smokeSource.matchAll(/from\s+"([^"]+)"/g)) {
    assert.match(match[1], /^node:/, `smoke script must use node builtins only (${match[1]})`);
  }

  let code = 0;
  let stdout = "";
  try {
    const result = await execFile("node", ["test/release-smoke.mjs"], { cwd: root, timeout: 120000 });
    stdout = result.stdout;
  } catch (err) {
    code = err.code ?? 1;
    stdout = err.stdout ?? "";
  }
  assert.notEqual(code, 0, "the smoke must exit non-zero while the observer capability is absent");
  assert.equal(code, 1);
  assert.match(stdout, /RELEASE BLOCKER/);
  assert.match(stdout, /release observer probe proves current-agent observation or reports the exact blocker/);
  assert.match(stdout, /candidate npm tarball installs in a fresh root/);
  assert.match(stdout, /relocation: resource set and digests are identical from the npm install/);
});

test("mutation boundary: settings command, notebook init+append, and doctor touch only the expected config surfaces", async () => {
  const config = await mkdtemp(join(tmpdir(), "ppo-mut-"));
  const repo = await gitRepoFixture();
  const profiles = await profileDirFixture();
  const ext = await freshExtension();
  try {
    await writeSettings(config, validDoc);
    const selectQueue = ["anthropic", "claude-sonnet-4-5", "high", "anthropic", "claude-sonnet-4-5", "medium", "openai", "gpt-5", "off"];
    const fake = fakePi({
      activeTools: ["read", "bash", "mcp"],
      env: {
        PI_CODING_AGENT_DIR: config,
        PI_PASEO_ORCHESTRATION_ROLE: "supervisor",
        PASEO_AGENT_ID: "agent-7",
        PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles,
        PASEO_PROJECT_ID: "paseo-project-1",
        PASEO_WORKSPACE_ID: "workspace-1",
        PASEO_LEAD_AGENT_ID: "absent",
      },
      ui: {
        select: async () => selectQueue.shift() ?? null,
        confirm: async () => true,
        input: async () => "ppo-fixture",
      },
    });
    fake.ctx.cwd = repo.dir;
    ext.default(fake.pi);
    await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);

    // Snapshot everything the exercise must not mutate.
    const packageTree = await treeBytes(root);
    const packageGit = await gitSnapshot(root);
    const repoTree = await treeBytes(repo.dir);
    const repoGit = await gitSnapshot(repo.dir);

    // Full exercise through the real registered handlers.
    await fake.commands.get("ppo:settings").handler("", fake.ctx);
    const initResult = await fake.commands.get("ppo:notebook-init").handler("", fake.ctx);
    assert.equal(initResult.ok, true, initResult.error);
    const manifest = JSON.parse(await readFile(initResult.paths.manifestPath, "utf8"));
    const entry = notebookEntryFixture(manifest, "ppo-fixture", repo.dir);
    const appendResult = await fake.tools.get("supervisor_notebook_append").execute(
      "call-ppo-fixture", { project_id: "ppo-fixture", entry }, undefined, undefined, fake.ctx,
    );
    assert.equal(appendResult.content?.[0]?.text.includes("Notebook entry"), true, appendResult.content?.[0]?.text);
    const doctorResult = await fake.commands.get("ppo:doctor").handler("", { ...fake.ctx, rpc: true });
    assert.equal(doctorResult.ok, true, doctorResult.error);

    // No project, package, Git, or Paseo mutation.
    assert.deepEqual(await treeBytes(repo.dir), repoTree, "project files must be byte-identical");
    assert.equal(await gitSnapshot(repo.dir), repoGit, "project Git state must be unchanged");
    assert.deepEqual(await treeBytes(root), packageTree, "package files must be byte-identical");
    assert.equal(await gitSnapshot(root), packageGit, "package Git state must be unchanged");
    assert.equal("paseo" in fake.pi, false, "the fake pi has no Paseo surface to mutate");
    assert.equal("observeCurrentAgent" in fake.ctx, false);

    // The config root contains EXACTLY the expected files and nothing else.
    const key = ext.deriveNotebookProjectKey("ppo-fixture");
    const expectedFiles = [
      join("pi-paseo-orchestration", "settings.json"),
      join("pi-paseo-orchestration", "supervisor-notebooks", "v1", "projects", key, "manifest.json"),
      join("pi-paseo-orchestration", "supervisor-notebooks", "v1", "projects", key, "entries", "entry-1.json"),
    ].sort();
    const actualFiles = (await treeBytes(config)).filter(([, value]) => value !== "dir").map(([rel]) => rel).sort();
    assert.deepEqual(actualFiles, expectedFiles, "config root must contain exactly the settings document and the notebook manifest+entry");
    assert.deepEqual(JSON.parse(await readFile(join(config, "pi-paseo-orchestration", "settings.json"), "utf8")), validDoc);
    assert.deepEqual(await readdir(join(config, "pi-paseo-orchestration", "supervisor-notebooks", "v1", ".staging")), [], "private staging must have no residue");
  } finally {
    await rm(config, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
    await rm(profiles, { recursive: true, force: true });
  }
});

// ─── Slice 7b: Paseo CLI current-agent observer ────────────────────────────────

// Fake `paseo` executable: `inspect <id> --json` returns the current live
// agent tuple with the fixed identity "agent-42", so requesting any other id
// is an identity mismatch; `--version` prints a version. The fail variant
// exits 1 like a daemon-down CLI.
async function fakePaseoBin({ fail = false, workspaceCwd = null, rootAgent = false, provider = "pi", labels = null, workspaceId = null, idEcho = false } = {}) {
  const bin = await mkdtemp(join(tmpdir(), "ppo-paseo-bin-"));
  const workspace = JSON.stringify([{ workspaceId: "workspace-1", project: "paseo-project-1", cwd: workspaceCwd }]);
  const parentLiteral = rootAgent ? '"ParentAgentId":""' : '"ParentAgentId":"lead-9"';
  const workspaceLiteral = workspaceId === null ? "" : `,"WorkspaceId":${JSON.stringify(String(workspaceId))}`;
  const labelsLiteral = labels === null ? "" : `,"Labels":${JSON.stringify(labels)}`;
  // The inspect payload is a literal JSON object. idEcho substitutes the
  // requested agent id via a printf %s so a lead self-observation (reconcile)
  // resolves to a matching identity instead of failing the observer check.
  const idField = idEcho ? '"Id":"%s"' : '"Id":"agent-42"';
  const trailingArg = idEcho ? ' "$2"' : "";
  const script = fail
    ? `#!/bin/sh\necho "daemon unreachable" >&2\nexit 1\n`
    : `#!/bin/sh\nif [ "$1" = "--version" ] || [ "$1" = "-v" ]; then echo "0.3.1-test"; exit 0; fi\nif [ "$1" = "workspace" ] && [ "$2" = "ls" ]; then printf '%s' '${workspace}'; exit 0; fi\nif [ "$1" = "inspect" ]; then\n  [ -z "$2" ] && { echo "agent id required" >&2; exit 2; }\n  printf '{${idField},"Provider":"${provider}","Model":"claude-sonnet-4-5","Thinking":"medium","Status":"running","Cwd":"/tmp/repo",${parentLiteral}${workspaceLiteral}${labelsLiteral}}'${trailingArg}\n  exit 0\nfi\necho "unknown command" >&2\nexit 1\n`;
  await writeFile(join(bin, "paseo"), script, { mode: 0o755 });
  return bin;
}

test("observePaseoCurrentAgent: maps the exact agent tuple from the installed CLI", async () => {
  const bin = await fakePaseoBin();
  try {
    const env = { ...process.env, PATH: bin };
    const ok = await extension.observePaseoCurrentAgent("agent-42", { env });
    assert.equal(ok.ok, true, ok.error);
    assert.equal(ok.observation.agent_id, "agent-42");
    assert.equal(ok.observation.provider, "pi");
    assert.equal(ok.observation.status, "running");
    assert.equal(ok.observation.cwd, "/tmp/repo");
    assert.equal(ok.observation.parent_agent_id, "lead-9");
    assert.equal(ok.observation.runtimeInfo.model, "claude-sonnet-4-5");
    assert.equal(ok.observation.runtimeInfo.thinkingOptionId, "medium");
    assert.equal(ok.observation.source, "paseo-cli");
  } finally {
    await rm(bin, { recursive: true, force: true });
  }
});

test("observePaseoCurrentAgent: blank identity, identity mismatch, and CLI failure fail closed", async () => {
  const bin = await fakePaseoBin();
  const failBin = await fakePaseoBin({ fail: true });
  try {
    assert.equal((await extension.observePaseoCurrentAgent("", { env: { PATH: bin } })).ok, false);

    const mismatch = await extension.observePaseoCurrentAgent("agent-1", { env: { PATH: bin } });
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.error, /instead of the requested agent/);

    const down = await extension.observePaseoCurrentAgent("agent-2", { env: { PATH: failBin } });
    assert.equal(down.ok, false);
    assert.match(down.error, /paseo inspect failed/);
  } finally {
    await rm(bin, { recursive: true, force: true });
    await rm(failBin, { recursive: true, force: true });
  }
});

test("Doctor: paseo CLI observer proves identity/model/thinking; attestation stays an explicit WARN", async () => {
  const bin = await fakePaseoBin();
  const repo = await gitRepoFixture();
  const config = await mkdtemp(join(tmpdir(), "ppo-doctor-cli-"));
  const profiles = await profileDirFixture();
  try {
    await writeSettings(config, validDoc);
    const ext = await freshExtension();
    const fake = fakePi({
      activeTools: ["read", "bash", "mcp"],
      env: { PI_CODING_AGENT_DIR: config, PI_PASEO_ORCHESTRATION_ROLE: "supervisor", PASEO_AGENT_ID: "agent-42", PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles, PATH: bin },
    });
    fake.ctx.cwd = repo.dir;
    ext.default(fake.pi);
    await fake.handlers.get("session_start")({}, fake.ctx);
    const report = await ext.buildDoctorReport({
      ctx: fake.ctx, pi: fake.pi,
      now: "2026-01-01T00:00:00.000Z", reportId: "doctor-cli",
    });
    const observer = report.checks.find((check) => check.code === "ADAPTER_OBSERVER");
    assert.equal(observer.status, "PASS");
    assert.match(observer.observed, /proved identity, model, thinking, parent, and cwd/);
    const attestation = report.checks.find((check) => check.code === "OBSERVER_ATTESTATION");
    assert.equal(attestation.status, "WARN");
    assert.match(attestation.observed, /workspace_binding, mcp_configuration_attestation/);
    // v0.2: governed Supervisor work fails closed (BLOCKED) when mandatory live
    // evidence (attested workspace binding, root parentage) is absent; the CLI
    // observer proves identity/model/thinking but an unattested binding is an
    // explicit environment ceiling, never a readiness claim.
    assert.equal(report.overall_status, "BLOCKED", "governed Supervisor with unattested binding fails closed (environment ceiling)");
    assert.equal(extension.parseDoctorReport(extension.formatDoctorReport(report)).ok, true);
  } finally {
    await rm(bin, { recursive: true, force: true });
    await rm(repo.dir, { recursive: true, force: true });
    await rm(config, { recursive: true, force: true });
    await rm(profiles, { recursive: true, force: true });
  }
});

test("thinkingLevelsFor matches Pi Shift+Tab availability", () => {
  assert.deepEqual(extension.thinkingLevelsFor(undefined), ["off"]);
  assert.deepEqual(extension.thinkingLevelsFor({ reasoning: false }), ["off"]);
  assert.deepEqual(
    extension.thinkingLevelsFor({ reasoning: true, thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: "high", max: "max" } }),
    ["high", "max"],
  );
  assert.deepEqual(extension.thinkingLevelsFor({ reasoning: true, thinkingLevelMap: {} }), ["off", "minimal", "low", "medium", "high"]);
});

test("settings command: Back re-prompts the previous field; a wrong pick is recoverable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-back-"));
  try {
    // Wrong provider for supervisor, then Esc (undefined) back to fix it.
    const queue2 = [
      "Role models", "openai", undefined, "anthropic", "claude-sonnet-4-5", "high", // supervisor
      "anthropic", "claude-sonnet-4-5", "medium", // lead
      "Use one model for all routes", "openai", "gpt-5", "off", "Finish",
    ];
    const fake = fakePi({ ui: { select: async () => queue2.shift() ?? null, confirm: async () => true } });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, "pi-paseo-orchestration", "settings.json"), "utf8")),
      validDoc,
    );
    assert.equal(fake.notifications.some(([, level]) => level === "error"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings confirmation renders multiline content as scrollable lines", async () => {
  let rendered;
  const confirmed = await extension.confirmSettings({ ui: { custom: async (factory) => new Promise((resolve) => {
    const component = factory({ requestRender() {} }, {}, { matches: (data, action) => data === "cancel" && action === "tui.select.cancel" }, resolve);
    rendered = component.render(80);
    component.handleInput("cancel");
  }) } }, "Confirm", "path\n\n{\n  key: value\n}");
  assert.equal(confirmed, false);
  assert.equal(rendered.includes("showing lines 1-5 of 5"), true);
  assert.equal(rendered.includes("  key: value"), true);
});

test("Peer route table configures all built-in routes in one custom screen and honors Pi keybindings", async () => {
  let rendered;
  let selectCalls = 0;
  const actions = { "kitty-down": "tui.select.down", "kitty-right": "tui.editor.cursorRight", "kitty-enter": "tui.select.confirm" };
  const result = await extension.pickPeerRouteSelections({ ui: {
    select: async () => { selectCalls += 1; return null; },
    custom: async (factory) => new Promise((resolve) => {
      const component = factory({ requestRender() {} }, {}, { matches: (data, action) => actions[data] === action }, resolve);
      rendered = component.render(200).join("\n");
      component.handleInput("kitty-down");
      component.handleInput("kitty-right");
      component.handleInput("kitty-enter");
    }),
  } }, baseModels(), ["anthropic", "openai"]);
  assert.equal(selectCalls, 0);
  for (const route of Object.keys(extension.DEFAULT_PEER_ROUTES)) assert.match(rendered, new RegExp(route));
  assert.deepEqual(result.map(({ route }) => route), Object.keys(extension.DEFAULT_PEER_ROUTES));
  assert.equal(result[0].provider, "anthropic");
  assert.equal(result[1].provider, "openai", "down/right must edit the second row through Pi keybindings");
});

test("Peer route table preloads saved model and thinking selections", async () => {
  let rendered;
  const initial = {
    fast: peerRoute("saved", { provider: "openai", model: "gpt-5", thinking: "high" }),
  };
  const result = await extension.pickPeerRouteSelections({ ui: { custom: async (factory) => new Promise((resolve) => {
    const component = factory({ requestRender() {} }, {}, { matches: (data, action) => data === "enter" && action === "tui.select.confirm" }, resolve);
    rendered = component.render(200).join("\n");
    component.handleInput("enter");
  }) } }, baseModels(), ["anthropic", "openai"], initial);
  assert.match(rendered, /fast\s+\[openai\]\s+gpt-5\s+high/);
  assert.deepEqual(result.find(({ route }) => route === "fast"), { route: "fast", provider: "openai", model: "gpt-5", thinking: "high" });
});

test("settings command: thinking picker offers only the selected model's supported levels", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-levels-"));
  try {
    const selectCalls = [];
    const models = [
      { provider: "opencode", id: "deepseek-v4-flash", reasoning: true, thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" } },
      { provider: "anthropic", id: "claude-sonnet-4-5", reasoning: true },
    ];
    const queue = [
      "Role models", "opencode", "deepseek-v4-flash", "max", // supervisor
      "anthropic", "claude-sonnet-4-5", "high", // lead
      "Configure each route individually",
      ...Array.from({ length: 6 }, () => ["opencode", "deepseek-v4-flash", "xhigh"]).flat(), "Finish",
    ];
    const fake = fakePi({
      ui: {
        select: async (title, options) => { selectCalls.push([title, [...options]]); return queue.shift() ?? null; },
        confirm: async () => true,
      },
      ctx: { modelRegistry: { getAvailable: () => models, find: (p, id) => models.find((m) => m.provider === p && m.id === id) } },
    });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });
    const thinkingCalls = selectCalls.filter(([title]) => /Thinking level/.test(title));
    assert.deepEqual(thinkingCalls.map(([, options]) => options), [
      ["minimal", "low", "medium", "high", "xhigh", "max"],
      ["off", "minimal", "low", "medium", "high"],
      ...Array.from({ length: 6 }, () => ["minimal", "low", "medium", "high", "xhigh", "max"]),
    ]);
    const doc = JSON.parse(await readFile(join(dir, "pi-paseo-orchestration", "settings.json"), "utf8"));
    assert.equal(doc.roles.supervisor.thinking, "max");
    assert.equal(doc.roles.lead.thinking, "high");
    assert.equal(doc.peer_routes.fast.thinking, "xhigh");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("settings command: Esc mid-flow goes back instead of cancelling; Esc at the first field cancels", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ppo-cmd-esc-"));
  try {
    // Esc (undefined) at the model step of supervisor → back to provider, redo.
    const queue = [
      "Role models", "anthropic", undefined, "anthropic", "claude-sonnet-4-5", "high",
      "anthropic", "claude-sonnet-4-5", "medium",
      "Use one model for all routes", "openai", "gpt-5", "off", "Finish",
    ];
    const fake = fakePi({ ui: { select: async () => queue.shift() ?? null, confirm: async () => true } });
    await runSettingsWith(fake, { ...process.env, PI_CODING_AGENT_DIR: dir });
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, "pi-paseo-orchestration", "settings.json"), "utf8")),
      validDoc,
      "Esc mid-flow must re-prompt, not cancel",
    );
    assert.equal(fake.notifications.some(([, level]) => level === "error"), false);

    // Esc at the very first field cancels and preserves prior bytes.
    const prior = { ...validDoc, peer_routes: { ...validDoc.peer_routes, fast: { ...validDoc.peer_routes.fast, thinking: "low" } } };
    await writeSettings(dir, prior);
    const fakeCancel = fakePi({ ui: { select: async () => null, confirm: async () => true } });
    await runSettingsWith(fakeCancel, { ...process.env, PI_CODING_AGENT_DIR: dir });
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, "pi-paseo-orchestration", "settings.json"), "utf8")),
      prior,
      "Esc at the first field must cancel and preserve prior bytes",
    );
    assert.equal(fakeCancel.notifications.some(([msg]) => /Cancelled/.test(msg)), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ─── v0.2 follow-up behaviors ────────────────────────────────────────────────

test("wiring: fresh governed activation defers topology observation to first input", async () => {
  const ext = await freshExtension();
  const repo = await gitRepoFixture();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-deferred-topology-"));
  const failBin = await fakePaseoBin({ fail: true });
  const previous = process.cwd();
  process.chdir(repo.dir);
  try {
    await writeSettings(dir, validDoc);
    let observations = 0;
    const fake = fakePi({
      activeTools: ["read", "bash", "mcp"],
      env: {
        PI_PASEO_ORCHESTRATION_ROLE: "lead",
        PI_PASEO_ORCHESTRATION_PEER_ALIAS: "ppo-peer",
        PASEO_AGENT_ID: "agent-7",
        PI_CODING_AGENT_DIR: dir,
        PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles,
        PATH: failBin,
      },
      ctx: { observeParentAgentId: async () => ++observations === 1 ? undefined : null },
    });
    ext.default(fake.pi);

    await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);
    assert.equal(observations, 1);
    assert.deepEqual(await fake.handlers.get("input")({ text: "hi" }, fake.ctx), { action: "continue" });
    assert.equal(observations, 2);
    assert.deepEqual(fake.holder.sentMessages, []);
    const before = await fake.handlers.get("before_agent_start")({ systemPrompt: "base" }, fake.ctx);
    assert.match(before.systemPrompt, /<pi-paseo-orchestration role="lead"/);
  } finally {
    process.chdir(previous);
    await rm(repo.dir, { recursive: true, force: true });
    await rm(profiles, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
    await rm(failBin, { recursive: true, force: true });
  }
});

test("activate: live root/child topology fails closed during governed activation", async () => {
  const ext = await freshExtension();
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-topo-"));
  try {
    await writeSettings(dir, validDoc);
    const base = {
      env: { PI_PASEO_ORCHESTRATION_ROLE: "lead", PASEO_AGENT_ID: "agent-7" },
      dir, profileDir: profiles, models: baseModels(),
      setModel: async () => true, setThinkingLevel: () => {}, getThinkingLevel: () => "medium",
    };
    const nonRoot = await ext.activate({ ...base, observedParentAgentId: "parent-1" });
    assert.equal(nonRoot.ok, false);
    assert.match(nonRoot.error, /must be a root agent/);
    const rootLead = await ext.activate({ ...base, observedParentAgentId: null });
    assert.equal(rootLead.ok, true);
    const sup = await ext.activate({ ...base, env: { ...base.env, PI_PASEO_ORCHESTRATION_ROLE: "supervisor" }, observedParentAgentId: "p" });
    assert.equal(sup.ok, false);
    const peerEnv = { ...base.env, PI_PASEO_ORCHESTRATION_ROLE: "peer" };
    const peerNoParent = await ext.activate({ ...base, env: peerEnv, observedParentAgentId: null, currentModel: baseModels()[1], currentThinking: "off", getThinkingLevel: () => "off" });
    assert.equal(peerNoParent.ok, false);
    assert.match(peerNoParent.error, /must have a live Paseo parent/);
    const peerWrong = await ext.activate({ ...base, env: peerEnv, observedParentAgentId: "parent-2", expectedParentAgentId: "lead-9", currentModel: baseModels()[1], currentThinking: "off", getThinkingLevel: () => "off" });
    assert.equal(peerWrong.ok, false);
    assert.match(peerWrong.error, /does not match the bound Lead/);
    const peerOk = await ext.activate({ ...base, env: peerEnv, observedParentAgentId: "lead-9", expectedParentAgentId: "lead-9", currentModel: baseModels()[1], currentThinking: "off", getThinkingLevel: () => "off" });
    assert.equal(peerOk.ok, true);
  } finally {
    await rm(profiles, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
});

test("reconcilePeerChild: ownership requires live parent, configured provider, and repo; labels/workspace reconcile only when independently observed", async () => {
  // Configured Peer provider `ppo-peer` with a task label on the child AND the
  // bound Lead so the cooperative task comparison resolves and agrees.
  const matchingLabels = { "pi-paseo-orchestration.task-key": "task-1" };
  const okBin = await fakePaseoBin({ provider: "ppo-peer", idEcho: true, labels: matchingLabels });
  const base = { leadAgentId: "lead-9", env: { ...process.env, PATH: okBin }, expectedRepoRoot: "/tmp/repo", expectedProvider: "ppo-peer" };
  try {
    const ok = await reconcilePeerChild("agent-42", base);
    assert.equal(ok.ok, true, ok.error);
    // No caller echo: caller-supplied task/assignment never becomes a bound value.
    assert.equal("taskId" in (ok.bound ?? {}), false);
    assert.equal("assignmentId" in (ok.bound ?? {}), false);
    // Typed workspace is not observable through the fake CLI seam → explicit
    // environment-ceiling warning, not a silent PASS and not a deadlock.
    assert.equal(ok.warnings.some((w) => /typed workspace identity.*not observable/.test(w)), true);
    assert.equal(ok.warnings.some((w) => /task-key/.test(w)), false, "agreed task-key must not warn");
    // Missing provider is a mandatory-fact failure (derived from config, not caller).
    assert.equal((await reconcilePeerChild("agent-42", { ...base, expectedProvider: "" })).ok, false);
    // Wrong parent fails closed.
    const wrongLead = await reconcilePeerChild("agent-42", { ...base, leadAgentId: "lead-other" });
    assert.equal(wrongLead.ok, false);
    assert.match(wrongLead.error, /does not equal the current Lead/);
    // Configured provider mismatch fails closed.
    const wrongProvider = await reconcilePeerChild("agent-42", { ...base, expectedProvider: "openai" });
    assert.equal(wrongProvider.ok, false);
    assert.match(wrongProvider.error, /does not match the configured Peer provider/);
    // Repository mismatch fails closed.
    const wrongRepo = await reconcilePeerChild("agent-42", { ...base, expectedRepoRoot: "/other/repo" });
    assert.equal(wrongRepo.ok, false);
  } finally {
    await rm(okBin, { recursive: true, force: true });
  }

  // Missing optional correlation/workspace facts warn but never deadlock.
  const legacyBin = await fakePaseoBin({ provider: "ppo-peer", idEcho: true });
  try {
    const legacy = await reconcilePeerChild("agent-42", { leadAgentId: "lead-9", env: { ...process.env, PATH: legacyBin }, expectedRepoRoot: "/tmp/repo", expectedProvider: "ppo-peer" });
    assert.equal(legacy.ok, true, legacy.error);
    assert.equal(legacy.warnings.some((w) => /no cooperative.*task-key/.test(w)), true, "missing legacy child task label must warn");
    assert.equal(legacy.warnings.some((w) => /typed workspace identity.*not observable/.test(w)), true);
  } finally {
    await rm(legacyBin, { recursive: true, force: true });
  }

  // Supplied typed workspace mismatch blocks; no caller value is treated as validation.
  const wsBin = await fakePaseoBin({ provider: "ppo-peer", idEcho: true, workspaceId: "wks-real" });
  try {
    const wsMismatch = await reconcilePeerChild("agent-42", {
      leadAgentId: "lead-9", env: { ...process.env, PATH: wsBin }, expectedRepoRoot: "/tmp/repo", expectedProvider: "ppo-peer", expectedWorkspaceId: "wks-expected",
    });
    assert.equal(wsMismatch.ok, false);
    assert.match(wsMismatch.error, /workspace .* does not match the expected workspace/);
    const wsMatch = await reconcilePeerChild("agent-42", {
      leadAgentId: "lead-9", env: { ...process.env, PATH: wsBin }, expectedRepoRoot: "/tmp/repo", expectedProvider: "ppo-peer", expectedWorkspaceId: "wks-real",
    });
    assert.equal(wsMatch.ok, true, wsMatch.error);
    assert.equal(wsMatch.warnings.some((w) => /typed workspace identity.*not observable/.test(w)), false, "supplied observed workspace must not be warned as unobservable");
  } finally {
    await rm(wsBin, { recursive: true, force: true });
  }

  // Observable child task label contradicts the independently observed bound
  // Lead task → blocks. Requires idEcho so the lead self-observation resolves.
  const childOther = { "pi-paseo-orchestration.task-key": "task-B" };
  const leadTaskA = { "pi-paseo-orchestration.task-key": "task-A" };
  const mismatchBin = await fakePaseoBin({ provider: "ppo-peer", idEcho: true, labels: childOther });
  try {
    // With a shared fake, both child and lead report `task-B` (identical), so
    // craft a lead-specific fake that reports `task-A` for the lead id and
    // `task-B` for any other id.
    const scriptOver = `#!/bin/sh\nif [ "$1" = "inspect" ]; then\n  if [ "$2" = "lead-9" ]; then printf '{"Id":"%s","Provider":"ppo-peer","Model":"claude-sonnet-4-5","Thinking":"medium","Status":"running","Cwd":"/tmp/repo","ParentAgentId":"lead-9","Labels":${JSON.stringify(leadTaskA)}}' "$2"; else printf '{"Id":"%s","Provider":"ppo-peer","Model":"claude-sonnet-4-5","Thinking":"medium","Status":"running","Cwd":"/tmp/repo","ParentAgentId":"lead-9","Labels":${JSON.stringify(childOther)}}' "$2"; fi\n  exit 0\nfi\necho "unknown command" >&2\nexit 1\n`;
    const leadMismatchBin = await mkdtemp(join(tmpdir(), "ppo-recon-labelbin-"));
    await writeFile(join(leadMismatchBin, "paseo"), scriptOver, { mode: 0o755 });
    try {
      const mismatch = await reconcilePeerChild("agent-X", {
        leadAgentId: "lead-9", env: { ...process.env, PATH: leadMismatchBin }, expectedRepoRoot: "/tmp/repo", expectedProvider: "ppo-peer",
      });
      assert.equal(mismatch.ok, false);
      assert.match(mismatch.error, /task label .* does not match the bound Lead task/);
    } finally {
      await rm(leadMismatchBin, { recursive: true, force: true });
    }
  } finally {
    await rm(mismatchBin, { recursive: true, force: true });
  }
});

test("verifyPartnerBinding: root role/provider/repository partner binds only after live inspection", async () => {
  const bin = await fakePaseoBin({ rootAgent: true });
  try {
    const env = { ...process.env, PATH: bin };
    const base = { claimedId: "agent-42", kind: "supervisor", selfId: "another-agent", env, expectedRole: "supervisor", expectedProvider: "pi", expectedRepoRoot: "/tmp/repo", expectedWorkspaceId: "workspace-1", taskId: "task-1" };
    const ok = await verifyPartnerBinding(base);
    assert.equal(ok.ok, true, ok.error);
    // Missing mandatory role/task/repo blocks.
    assert.equal((await verifyPartnerBinding({ ...base, expectedRole: "" })).ok, false);
    assert.equal((await verifyPartnerBinding({ ...base, taskId: "" })).ok, false);
    assert.equal((await verifyPartnerBinding({ ...base, expectedRepoRoot: "" })).ok, false);
    // Wrong expected role blocks.
    assert.equal((await verifyPartnerBinding({ ...base, expectedRole: "lead" })).ok, false);
    // Repository mismatch blocks.
    assert.equal((await verifyPartnerBinding({ ...base, expectedRepoRoot: "/other/repo" })).ok, false);
  } finally {
    await rm(bin, { recursive: true, force: true });
  }
});

test("reconcileLeadEventRecipient permits root Supervisor milestones and root observer completion only", async () => {
  bindExactPartner({ supervisorId: "sup-1" });
  const supervisorBin = await fakePaseoBin({ rootAgent: true, provider: "ppo-supervisor", idEcho: true });
  const observerBin = await fakePaseoBin({ rootAgent: true, provider: "pi", idEcho: true });
  const base = { version: 1, event_id: "event-1", task_id: "task-1", sender_agent_id: "lead-1", repository_root: "/tmp/repo", payload: {} };
  try {
    const sup = await reconcileLeadEventRecipient("sup-1", { ...base, kind: "CANDIDATE_READY", recipient_agent_id: "sup-1" }, { leadAgentId: "lead-1", repoRoot: "/tmp/repo", env: { ...process.env, PATH: supervisorBin } });
    assert.equal(sup.ok, true, sup.error);
    assert.equal(sup.recipientKind, "supervisor");
    const observer = await reconcileLeadEventRecipient("human-1", { ...base, kind: "LEAD_FINISHED", recipient_agent_id: "human-1" }, { leadAgentId: "lead-1", repoRoot: "/tmp/repo", env: { ...process.env, PATH: observerBin } });
    assert.equal(observer.ok, true, observer.error);
    assert.equal(observer.recipientKind, "observer");
    const early = await reconcileLeadEventRecipient("human-1", { ...base, kind: "LEAD_STARTED", recipient_agent_id: "human-1" }, { leadAgentId: "lead-1", repoRoot: "/tmp/repo", env: { ...process.env, PATH: observerBin } });
    assert.equal(early.ok, false);
    assert.match(early.error, /only LEAD_FINISHED/);
    const forged = await reconcileLeadEventRecipient("sup-1", { ...base, kind: "LEAD_FINISHED", sender_agent_id: "other-lead", recipient_agent_id: "sup-1" }, { leadAgentId: "lead-1", repoRoot: "/tmp/repo", env: { ...process.env, PATH: supervisorBin } });
    assert.equal(forged.ok, false);
  } finally {
    await rm(supervisorBin, { recursive: true, force: true });
    await rm(observerBin, { recursive: true, force: true });
  }
});

// Provenance capture was removed in the resolved Human model: ordinary local
// reversible work needs no runtime-captured authority, spec marker, digest,
// or grant. The following tests assert the removal and the direct allowance.
test("resolved model: no hidden authority state or getters remain", () => {
  assert.equal(typeof extension.getAuthority, "undefined");
  assert.equal(typeof extension.getAuthorityReason, "undefined");
});
test("resolved model: local write/edit and local commit pass for implementation roles without any authority state", () => {
  const peerPolicy = { role: "peer", allowed: ["read", "bash", "write", "edit"] };
  const leadPolicy = { role: "lead", allowed: ["read", "bash", "write", "edit", "mcp"] };
  assert.equal(extension.checkToolCall("write", { path: "src/x.go" }, peerPolicy), undefined);
  assert.equal(extension.checkToolCall("edit", { path: "src/x.go" }, peerPolicy), undefined);
  assert.equal(extension.checkToolCall("bash", { command: "git commit -m x" }, peerPolicy), undefined);
  assert.equal(extension.checkToolCall("bash", { command: "git commit -m x" }, leadPolicy), undefined);
  // The observation-only Supervisor still cannot write/edit.
  assert.equal(extension.checkToolCall("write", { path: "x" }, { role: "supervisor", allowed: ["read", "bash", "write", "edit", "mcp"] }).block, true);
  // Hard Human-only boundaries remain: publish, merge, and amend stay blocked.
  assert.equal(extension.checkToolCall("bash", { command: "git push" }, peerPolicy).block, true);
  assert.equal(extension.checkToolCall("bash", { command: "git commit --amend" }, peerPolicy).block, true);
});
test("resolved model: effectiveTools grants write/edit to implementation roles only", () => {
  const base = ["read", "bash", "write", "edit", "mcp"];
  assert.deepEqual(extension.effectiveTools(base, "lead"), ["read", "bash", "write", "edit", "mcp"]);
  const peerTool = extension.effectiveTools(base, "peer");
  assert.equal(peerTool.includes("edit"), true);
  const supTool = extension.effectiveTools(base, "supervisor");
  assert.equal(supTool.includes("edit"), false);
  assert.equal(supTool.includes("write"), false);
});

test("wiring: per-role MCP call contract is injected into the agent prompt (DOGFOOD-015)", async () => {
  const profiles = await profileDirFixture();
  const dir = await mkdtemp(join(tmpdir(), "ppo-contract-"));
  await writeSettings(dir, validDoc);
  const envBase = (role) => ({
    PI_PASEO_ORCHESTRATION_ROLE: role,
    PI_PASEO_ORCHESTRATION_PEER_ALIAS: "ppo-peer",
    PASEO_AGENT_ID: role === "peer" ? "peer-7" : "agent-7",
    PASEO_LEAD_AGENT_ID: "",
    PI_CODING_AGENT_DIR: dir,
    PI_PASEO_ORCHESTRATION_PROFILES_DIR: profiles,
  });
  const activeTools = ["read", "bash", "mcp"];

  for (const role of ["lead", "supervisor"]) {
    const ext = await freshExtension();
    const fake = fakePi({ activeTools, env: envBase(role) });
    fake.pi.setActiveTools = (tools) => { fake.holder.activeTools = [...tools]; };
    fake.pi.getActiveTools = () => [...fake.holder.activeTools];
    ext.default(fake.pi);
    const registry = fake.ctx.modelRegistry;
    fake.ctx.model = registry.find("anthropic", "claude-sonnet-4-5");
    fake.ctx.thinkingLevel = role === "lead" ? "medium" : "high";
    fake.ctx.modelRegistry = { ...registry };
    await fake.handlers.get("session_start")({ reason: "startup" }, fake.ctx);
    const before = await fake.handlers.get("before_agent_start")(
      { prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: activeTools } },
      fake.ctx,
    );
    assert.match(before.systemPrompt, /## Paseo calls/);
    assert.match(before.systemPrompt, /\{"server":"paseo","tool":"<operation>","args":\{\.\.\.\}\}/);
    assert.match(before.systemPrompt, /`get_agent_status` with `\{"agentId":"<full Paseo agent ID>"\}`/);
    assert.match(before.systemPrompt, /A call is ready when its envelope matches one row exactly/);
    assert.match(before.systemPrompt, /short IDs are display-only/);
    assert.doesNotMatch(before.systemPrompt, /paseo_get_agent_status|"agent_id"\s*:|prefixed/);
    if (role === "supervisor") {
      assert.doesNotMatch(before.systemPrompt, /send_agent_prompt|list_workspaces|list_providers/);
      assert.doesNotMatch(before.systemPrompt, /## Peer creation/);
    } else {
      assert.match(before.systemPrompt, /`list_workspaces` with `\{\}`/);
      assert.match(before.systemPrompt, /`list_providers` with `\{\}`/);
      assert.match(before.systemPrompt, /`send_agent_prompt` with `\{"agentId":"<full Paseo agent ID>","prompt":"<nonempty prompt>"\}`/);
      assert.match(before.systemPrompt, /## Peer creation/);
    }
  }

  // Peer must not receive any MCP contract (no outer mcp tool).
  const extPeer = await freshExtension();
  const fakePeer = fakePi({ activeTools: ["read", "bash"], env: envBase("peer") });
  fakePeer.pi.setActiveTools = (tools) => { fakePeer.holder.activeTools = [...tools]; };
  fakePeer.pi.getActiveTools = () => [...fakePeer.holder.activeTools];
  extPeer.default(fakePeer.pi);
  const regPeer = fakePeer.ctx.modelRegistry;
  fakePeer.ctx.model = regPeer.find("openai", "gpt-5");
  fakePeer.ctx.thinkingLevel = "off";
  fakePeer.ctx.modelRegistry = { ...regPeer };
  await fakePeer.handlers.get("session_start")({ reason: "startup" }, fakePeer.ctx);
  const beforePeer = await fakePeer.handlers.get("before_agent_start")(
    { prompt: "hi", systemPrompt: "base", systemPromptOptions: { selectedTools: ["read", "bash"] } },
    fakePeer.ctx,
  );
  assert.doesNotMatch(beforePeer.systemPrompt, /## Paseo calls/);
  await rm(profiles, { recursive: true, force: true });
  await rm(dir, { recursive: true, force: true });
});
