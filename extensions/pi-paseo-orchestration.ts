import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROLES = ["supervisor", "lead", "peer"];
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export function configDir(env = process.env, home = homedir()) {
  return env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
}

export function settingsPath(dir) {
  return join(dir, "pi-paseo-orchestration", "settings.json");
}

// Closed v1 document: exactly { version: 1, roles: { supervisor, lead, peer } },
// each role exactly { provider, model, thinking } with thinking from the closed set.
export function validateSettings(doc) {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, error: "settings must be an object" };
  }
  if (doc.version !== 1) return { ok: false, error: "settings.version must be 1" };
  const roles = doc.roles;
  if (roles === null || typeof roles !== "object" || Array.isArray(roles)) {
    return { ok: false, error: "settings.roles must be an object" };
  }
  const keys = Object.keys(roles).sort();
  if (keys.join(",") !== "lead,peer,supervisor") {
    return { ok: false, error: `settings.roles must contain exactly supervisor, lead, peer (got: ${keys.join(", ") || "none"})` };
  }
  for (const role of ROLES) {
    const entry = roles[role];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: `settings.roles.${role} must be an object` };
    }
    const fields = Object.keys(entry).sort();
    if (fields.join(",") !== "model,provider,thinking") {
      return { ok: false, error: `settings.roles.${role} must contain exactly provider, model, thinking` };
    }
    if (typeof entry.provider !== "string" || entry.provider.trim() === "") {
      return { ok: false, error: `settings.roles.${role}.provider must be a nonempty string` };
    }
    if (typeof entry.model !== "string" || entry.model.trim() === "") {
      return { ok: false, error: `settings.roles.${role}.model must be a nonempty string` };
    }
    if (!THINKING_LEVELS.includes(entry.thinking)) {
      return { ok: false, error: `settings.roles.${role}.thinking must be one of ${THINKING_LEVELS.join("|")}` };
    }
  }
  return { ok: true };
}

export async function readSettings(dir) {
  const path = settingsPath(dir);
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`settings read failed: ${err.message}`);
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error(`settings.json is not valid JSON; refusing to overwrite it`);
  }
  const check = validateSettings(doc);
  if (!check.ok) throw new Error(`settings.json invalid (${check.error}); refusing to overwrite it`);
  return doc;
}

export async function writeSettings(dir, doc) {
  const check = validateSettings(doc);
  if (!check.ok) throw new Error(`refusing to write invalid settings: ${check.error}`);
  const target = settingsPath(dir);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw new Error(`settings write failed: ${err.message}`);
  }
}

export const ROLE_ENV = "PI_PASEO_ORCHESTRATION_ROLE";
export const PROFILES_ENV = "PI_PASEO_ORCHESTRATION_PROFILES_DIR";
export const AGENT_ENV = "PASEO_AGENT_ID";

// Closed role ceilings: Peer is read+Bash; Supervisor and Lead add the outer
// mcp tool (whose inner targets are validated separately). write/edit are never
// in a ceiling — they come only from a current-run authority grant (later slice).
// mcp_script is in no ceiling.
export const CEILINGS = {
  supervisor: ["read", "bash", "mcp"],
  lead: ["read", "bash", "mcp"],
  peer: ["read", "bash"],
};

// Validated outer-MCP inner targets: server name → closed tool set. Empty until
// the adapter's public observer contract is verified; empty means deny all.
export const MCP_TARGETS = {};

// Cooperative, recognizable-only publication detection. Not a sandbox: aliases,
// scripts, and child programs can bypass it. The git pattern also catches global
// flag forms (`git --no-pager commit`) by scanning the command line for the
// blocked subcommand after any `git` invocation.
const GIT_BLOCKED = [
  /\bgit\b[^\n;&|]*\b(?:commit|push|merge)\b/, // local commits need a current-run grant; push/merge never allowed
  /\bgh\s+pr\b/,
  /\b(?:vercel|netlify|flyctl?|railway|supabase|render|amplify)\s+deploy\b/,
];

const PROFILE_MARKER = (role, digest) =>
  `<pi-paseo-orchestration role="${role}" profile="sha256:${digest.slice(0, 12)}">`;

export function parseRole(env) {
  const raw = env[ROLE_ENV];
  if (raw === undefined || raw === null || raw === "") return { ok: true, role: null };
  if (CEILINGS[raw]) return { ok: true, role: raw };
  return { ok: false, error: `${ROLE_ENV} must be exactly supervisor, lead, or peer (got ${JSON.stringify(raw)})` };
}

async function validateProfileDir(dir) {
  if (!isAbsolute(dir)) return { ok: false, error: "profile directory must be an absolute path" };
  let realDir;
  try {
    realDir = await realpath(dir);
    if (!(await stat(realDir)).isDirectory()) return { ok: false, error: "profile directory is not a directory" };
  } catch {
    return { ok: false, error: "profile directory is not readable" };
  }
  for (const role of ROLES) {
    const file = join(dir, `${role}.md`);
    try {
      const real = await realpath(file);
      if (real !== join(realDir, `${role}.md`)) return { ok: false, error: `profile ${role}.md must be a direct descendant without symlink escape` };
      if (!(await stat(real)).isFile()) return { ok: false, error: `profile ${role}.md must be a regular file` };
      if ((await readFile(real, "utf8")).trim() === "") return { ok: false, error: `profile ${role}.md must be nonempty` };
    } catch {
      return { ok: false, error: `profile ${role}.md must be readable` };
    }
  }
  return { ok: true, dir };
}

export async function resolveProfileSource(env, bundledDir) {
  const override = env[PROFILES_ENV];
  if (override !== undefined && override !== null && override !== "") {
    const check = await validateProfileDir(override);
    if (!check.ok) return check;
    return { ok: true, dir: override, source: "override" };
  }
  if (!bundledDir) return { ok: false, error: "no profile source (bundled profiles unavailable)" };
  const check = await validateProfileDir(bundledDir);
  if (!check.ok) return check;
  return { ok: true, dir: bundledDir, source: "bundled" };
}

export async function readProfile(dir, role) {
  const path = join(dir, `${role}.md`);
  const text = await readFile(path, "utf8");
  if (text.trim() === "") throw new Error(`profile ${role}.md must be nonempty`);
  return text;
}

export function profileDigest(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function findModel(models, provider, id) {
  if (!models) return undefined;
  return Array.isArray(models)
    ? models.find((m) => m.provider === provider && m.id === id)
    : models.find(provider, id);
}

// First successful activation latches role, agent identity, settings snapshot,
// profile source, and profile digest. Everything later is drift-checked against
// this latch; a fresh Paseo process is required to change the role.
export async function activate({ env, dir, profileDir, models, setModel, setThinkingLevel }) {
  const roleCheck = parseRole(env);
  if (!roleCheck.ok) return roleCheck;
  if (roleCheck.role === null) return { ok: true, latch: null };

  const agentId = (env[AGENT_ENV] ?? "").trim();
  if (agentId === "") return { ok: false, error: `${AGENT_ENV} must be nonblank for a governed ${roleCheck.role} process` };

  let settings;
  try {
    settings = await readSettings(dir);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (settings === null) return { ok: false, error: `settings document is missing; run /pi-paseo-orchestration:settings first` };

  const source = await validateProfileDir(profileDir);
  if (!source.ok) return source;

  let profileText;
  try {
    profileText = await readProfile(profileDir, roleCheck.role);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  // Apply the snapshotted role selection through Pi's model APIs before any
  // ordinary model work; unavailable, unauthenticated, or clamped states block.
  const sel = settings.roles[roleCheck.role];
  const model = await findModel(models, sel.provider, sel.model);
  if (!model) return { ok: false, error: `model ${sel.provider}/${sel.model} is not in the current model registry` };
  if (typeof setModel === "function") {
    let applied = false;
    try {
      applied = await setModel(model);
    } catch {
      applied = false;
    }
    if (!applied) return { ok: false, error: `model ${sel.provider}/${sel.model} is unavailable or unauthenticated` };
  }
  if (typeof setThinkingLevel === "function") {
    let effective;
    try {
      effective = await setThinkingLevel(sel.thinking);
    } catch {
      effective = null;
    }
    if (effective !== sel.thinking) {
      return { ok: false, error: `thinking level ${sel.thinking} is unavailable or clamped to ${String(effective)}` };
    }
  }

  const latch = {
    role: roleCheck.role,
    agentId,
    settings: structuredClone(settings),
    profileDir,
    profileText,
    profileDigest: profileDigest(profileText),
  };
  return { ok: true, latch };
}

export async function verifyLatch(latch, env, dir) {
  if (parseRole(env).role !== latch.role) return { ok: false, error: "role environment drifted" };
  if ((env[AGENT_ENV] ?? "").trim() !== latch.agentId) return { ok: false, error: "Paseo agent identity drifted" };
  let current;
  try {
    current = await readSettings(dir);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (current === null || JSON.stringify(current) !== JSON.stringify(latch.settings)) {
    return { ok: false, error: "role settings document drifted" };
  }
  let text;
  try {
    text = await readProfile(latch.profileDir, latch.role);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (profileDigest(text) !== latch.profileDigest) return { ok: false, error: "role profile content drifted" };
  return { ok: true };
}

export function intersectTools(baseline, role) {
  const ceiling = CEILINGS[role] ?? [];
  return baseline.filter((tool) => ceiling.includes(tool));
}

// One shared policy decision for run shaping and call-time gating (one
// mechanism, not scattered checks). policy = { role, allowed, mcpTargets }.
export function checkToolCall(toolName, input, policy) {
  const block = (reason) => ({ block: true, reason });
  const allowed = policy.allowed instanceof Set ? policy.allowed : new Set(policy.allowed);
  if (toolName === "mcp_script") {
    return block("mcp_script is unavailable to every governed role");
  }
  if (!allowed.has(toolName)) {
    return block(`${toolName} is not permitted for the ${policy.role} role`);
  }
  if (toolName === "mcp") {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return block("outer mcp call must carry an object input");
    }
    const map = policy.mcpTargets ?? {};
    const targets = Object.prototype.hasOwnProperty.call(map, input.server) ? map[input.server] : undefined;
    if (!targets || !targets.has(input.tool)) {
      return block(`outer mcp target ${JSON.stringify(input.server)}/${JSON.stringify(input.tool)} is not validated`);
    }
    if (input.args !== undefined && (input.args === null || typeof input.args !== "object" || Array.isArray(input.args))) {
      return block("outer mcp args must be an object");
    }
    return undefined;
  }
  if (toolName === "bash") {
    if (typeof input?.command !== "string") return block("bash call without a command string");
    for (const pattern of GIT_BLOCKED) {
      if (pattern.test(input.command)) return block("publication/commit route is always blocked without an explicit grant");
    }
    return undefined;
  }
  return undefined;
}

async function runSettings(_args, ctx) {
  const notify = (message, level) => ctx.ui?.notify?.(message, level);
  const env = ctx.env ?? process.env;
  const dir = configDir(env);

  let prior;
  try {
    prior = await readSettings(dir);
  } catch (err) {
    notify(err.message, "error");
    return;
  }

  const models = ctx.modelRegistry?.getAvailable?.() ?? [];
  const providers = [...new Set(models.map((m) => m.provider))].sort();
  if (providers.length === 0) {
    notify("No models available in the current model registry; settings unchanged.", "error");
    return;
  }

  const roles = {};
  for (const role of ROLES) {
    const provider = await ctx.ui.select(`Provider for ${role}:`, providers);
    if (!provider) {
      notify(prior ? "Cancelled; settings unchanged." : "Cancelled; no settings written.", "info");
      return;
    }
    const ids = models.filter((m) => m.provider === provider).map((m) => m.id).sort();
    const model = await ctx.ui.select(`Model for ${role}:`, ids);
    if (!model) {
      notify("Cancelled; settings unchanged.", "info");
      return;
    }
    const thinking = await ctx.ui.select(`Thinking level for ${role}:`, THINKING_LEVELS);
    if (!thinking) {
      notify("Cancelled; settings unchanged.", "info");
      return;
    }
    roles[role] = { provider, model, thinking };
  }

  const doc = { version: 1, roles };
  const confirmed = await ctx.ui.confirm("Apply this role-settings document?", JSON.stringify(doc, null, 2));
  if (!confirmed) {
    notify("Not written; settings unchanged.", "info");
    return;
  }

  try {
    await writeSettings(dir, doc);
    notify(`Role settings written to ${settingsPath(dir)}`, "info");
  } catch (err) {
    notify(err.message, "error");
  }
}

// Process-latched governed state. Once set, blockedReason never clears in this
// process: drift or missing prerequisites require a fresh Paseo process.
let latch = null;
let blockedReason = null;
let baseline = null;

const bundledDir = (() => {
  try {
    const url = new URL("../profiles/", import.meta.url);
    return url.protocol === "file:" ? fileURLToPath(url) : null;
  } catch {
    return null;
  }
})();

function envOf(ctx) {
  return ctx?.env ?? process.env;
}

async function verifyOrBlock(ctx, dir) {
  const check = await verifyLatch(latch, envOf(ctx), dir);
  if (!check.ok) {
    blockedReason = check.error;
    ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${check.error}`, "error");
    return false;
  }
  return true;
}

// Spec: governed activation requires the read tool, and Supervisor/Lead also
// require an active outer mcp tool. Not observable = fail closed.
function requireBaselineTools(baseline, role) {
  if (baseline === null) return { ok: false, error: "active-tool baseline is not observable" };
  if (!baseline.includes("read")) return { ok: false, error: "read tool is not active in the session" };
  if (role !== "peer" && !baseline.includes("mcp")) {
    return { ok: false, error: `outer mcp tool is not active for the ${role} role` };
  }
  return { ok: true };
}

function blockWith(ctx, reason) {
  blockedReason = reason;
  ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${reason}`, "error");
}

export default function (pi) {
  pi.registerCommand("pi-paseo-orchestration:settings", {
    description: "Choose the exact provider, model, and thinking level for Supervisor, Lead, and Peer roles",
    handler: runSettings,
  });

  pi.on("session_start", async (_event, ctx) => {
    const env = envOf(ctx);
    const dir = configDir(env);
    if (latch !== null) {
      await verifyOrBlock(ctx, dir);
      return;
    }
    const roleCheck = parseRole(env);
    if (!roleCheck.ok) {
      blockWith(ctx, roleCheck.error);
      return;
    }
    if (roleCheck.role === null) return; // passive / ungoverned
    const source = await resolveProfileSource(env, bundledDir);
    if (!source.ok) {
      blockWith(ctx, source.error);
      return;
    }
    const result = await activate({
      env,
      dir,
      profileDir: source.dir,
      models: ctx.modelRegistry,
      setModel: pi.setModel,
      setThinkingLevel: pi.setThinkingLevel,
    });
    if (!result.ok) {
      blockWith(ctx, result.error);
      return;
    }
    latch = result.latch;
    if (latch !== null && typeof pi.getActiveTools === "function") {
      try {
        baseline = pi.getActiveTools();
      } catch {
        baseline = null;
      }
      const tools = requireBaselineTools(baseline, latch.role);
      if (!tools.ok) blockWith(ctx, tools.error);
    }
  });

  pi.on("input", async (event, ctx) => {
    if (latch === null && blockedReason === null) return { action: "continue" };
    if (blockedReason !== null) {
      ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${blockedReason}`, "error");
      return { action: "handled" };
    }
    if (!(await verifyOrBlock(ctx, configDir(envOf(ctx))))) return { action: "handled" };
    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (latch === null) return undefined;
    if (blockedReason !== null) {
      ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${blockedReason}`, "error");
      return undefined;
    }
    if (!(await verifyOrBlock(ctx, configDir(envOf(ctx))))) return undefined;
    if (baseline === null) baseline = event.systemPromptOptions?.selectedTools ?? [];
    const tools = requireBaselineTools(baseline, latch.role);
    if (!tools.ok) {
      blockWith(ctx, tools.error);
      return undefined;
    }
    const allowed = intersectTools(baseline, latch.role);
    if (typeof pi.setActiveTools === "function") pi.setActiveTools(allowed);
    return {
      systemPrompt: `${event.systemPrompt}\n\n${PROFILE_MARKER(latch.role, latch.profileDigest)}\n${latch.profileText}\n</pi-paseo-orchestration>`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (latch === null) return undefined;
    if (blockedReason !== null) {
      return { block: true, reason: `pi-paseo-orchestration blocked: ${blockedReason}` };
    }
    if (!(await verifyOrBlock(ctx, configDir(envOf(ctx))))) {
      return { block: true, reason: `pi-paseo-orchestration blocked: ${blockedReason}` };
    }
    const allowed = new Set(intersectTools(baseline ?? [], latch.role));
    const decision = checkToolCall(event.toolName, event.input, {
      role: latch.role,
      allowed,
      mcpTargets: MCP_TARGETS,
    });
    if (decision?.block) {
      ctx.ui?.notify?.(`Blocked ${event.toolName}: ${decision.reason}`, "error");
      return decision;
    }
    return undefined;
  });

  // Governed processes keep Pi-native lifecycle for the Paseo control plane.
  for (const name of ["session_before_switch", "session_before_fork"]) {
    pi.on(name, (_event, ctx) => {
      if (latch === null) return undefined;
      ctx.ui?.notify?.("pi-paseo-orchestration: use Paseo lifecycle operations in governed processes", "info");
      return { cancel: true };
    });
  }
}
