import { link, lstat, mkdir, open, readFile, readdir, readlink, realpath, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const ROLES = ["supervisor", "lead", "peer"];
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export const DEFAULT_PEER_ROUTES = {
  fast: "Low-cost, low-latency bounded triage and simple read-only work.",
  general: "Balanced default for mixed repository work.",
  reasoning: "Deep analysis for ambiguous or high-complexity problems.",
  coding: "Implementation, debugging, and verification.",
  architecture: "Architecture, migration, lifecycle, and hard-to-reverse decisions.",
  reviewer: "Independent review of correctness, security, regressions, and maintainability.",
};
const REQUIRED_PEER_ROUTES = ["fast", "general", "reasoning", "coding", "architecture"];
const ROUTE_ID = /^[a-z][a-z0-9_-]{0,31}$/;

export function configDir(env = process.env, home = homedir()) {
  return env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent");
}

export function settingsPath(dir) {
  return join(dir, "pi-paseo-orchestration", "settings.json");
}

/** @returns {Array<[string, any]>} */
function objectEntries(value) {
  return Object.entries(value);
}

function validateModelSelection(entry, label, { description = false } = {}) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return { ok: false, error: `${label} must be an object` };
  }
  const expected = description ? "description,model,provider,thinking" : "model,provider,thinking";
  if (Object.keys(entry).sort().join(",") !== expected) {
    return { ok: false, error: `${label} must contain exactly ${description ? "description, " : ""}provider, model, thinking` };
  }
  if (description && (typeof entry.description !== "string" || entry.description.trim() === "" || entry.description.length > 240)) {
    return { ok: false, error: `${label}.description must be a nonempty string of at most 240 characters` };
  }
  if (typeof entry.provider !== "string" || entry.provider.trim() === "") return { ok: false, error: `${label}.provider must be a nonempty string` };
  if (typeof entry.model !== "string" || entry.model.trim() === "") return { ok: false, error: `${label}.model must be a nonempty string` };
  if (!THINKING_LEVELS.includes(entry.thinking)) return { ok: false, error: `${label}.thinking must be one of ${THINKING_LEVELS.join("|")}` };
  return { ok: true };
}

// Closed v2 document: fixed Supervisor/Lead selections plus Human-owned Peer
// model routes. The original five routes remain required for v2 compatibility;
// settings newly written by the wizard also include reviewer.
export function validateSettings(doc) {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, error: "settings must be an object" };
  if (doc.version !== 2) return { ok: false, error: "settings.version must be 2" };
  if (Object.keys(doc).sort().join(",") !== "peer_routes,roles,version") return { ok: false, error: "settings must contain exactly version, roles, peer_routes" };
  const roles = doc.roles;
  if (roles === null || typeof roles !== "object" || Array.isArray(roles) || Object.keys(roles).sort().join(",") !== "lead,supervisor") {
    return { ok: false, error: "settings.roles must contain exactly supervisor and lead" };
  }
  for (const role of ["supervisor", "lead"]) {
    const check = validateModelSelection(roles[role], `settings.roles.${role}`);
    if (!check.ok) return check;
  }
  const routes = doc.peer_routes;
  if (routes === null || typeof routes !== "object" || Array.isArray(routes)) return { ok: false, error: "settings.peer_routes must be an object" };
  for (const route of REQUIRED_PEER_ROUTES) {
    if (!Object.prototype.hasOwnProperty.call(routes, route)) return { ok: false, error: `settings.peer_routes.${route} is required` };
  }
  for (const [route, entry] of Object.entries(routes)) {
    if (!ROUTE_ID.test(route)) return { ok: false, error: `Peer route ID ${JSON.stringify(route)} is invalid` };
    const check = validateModelSelection(entry, `settings.peer_routes.${route}`, { description: true });
    if (!check.ok) return check;
  }
  return { ok: true };
}

function migrateSettingsV1(doc) {
  if (doc?.version !== 1 || doc === null || typeof doc !== "object" || Array.isArray(doc)) return null;
  const roles = doc.roles;
  if (roles === null || typeof roles !== "object" || Array.isArray(roles) || Object.keys(roles).sort().join(",") !== "lead,peer,supervisor") return null;
  for (const role of ROLES) {
    if (!validateModelSelection(roles[role], `settings.roles.${role}`).ok) return null;
  }
  return {
    version: 2,
    roles: { supervisor: structuredClone(roles.supervisor), lead: structuredClone(roles.lead) },
    peer_routes: Object.fromEntries(Object.entries(DEFAULT_PEER_ROUTES).map(([route, description]) => [route, { description, ...structuredClone(roles.peer) }])),
  };
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
  const migrated = migrateSettingsV1(doc);
  if (migrated !== null) return migrated;
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
export const PEER_ALIAS_ENV = "PI_PASEO_ORCHESTRATION_PEER_ALIAS";
export const SUPERVISOR_ALIAS_ENV = "PI_PASEO_ORCHESTRATION_SUPERVISOR_ALIAS";
export const LEAD_ALIAS_ENV = "PI_PASEO_ORCHESTRATION_LEAD_ALIAS";
export const AGENT_ENV = "PASEO_AGENT_ID";

// Closed role ceilings: Peer is read+Bash; Supervisor and Lead add the outer
// mcp tool (whose inner targets are validated separately). write/edit are never
// in a ceiling — they come only from a current-run Task Authority Envelope
// grant. mcp_script is in no ceiling.
export const CEILINGS = {
  supervisor: ["read", "bash", "mcp"],
  lead: ["read", "bash", "mcp"],
  peer: ["read", "bash"],
};

// Validated outer-MCP inner targets. Lead lifecycle calls are restricted to
// exact child IDs minted in this process; Paseo remains the control plane.
export const MCP_TARGETS = {
  supervisor: { paseo: new Set(["paseo_create_agent", "paseo_list_agents", "paseo_get_agent_status", "paseo_get_agent_activity"]) },
  lead: { paseo: new Set(["paseo_list_workspaces", "paseo_list_providers", "paseo_list_agents", "paseo_create_agent", "paseo_send_agent_prompt", "paseo_get_agent_status", "paseo_get_agent_activity", "paseo_cancel_agent", "paseo_archive_agent"]) },
  peer: {},
};

const PASEO_CHILD_TOOLS = new Set(["paseo_send_agent_prompt", "paseo_get_agent_status", "paseo_get_agent_activity", "paseo_cancel_agent", "paseo_archive_agent"]);
const createdPeerIds = new Set();

// Read-family tools whose targets are checked against the protocol path by the
// peer read gate inside checkToolCall.
const PROTOCOL_READ_TOOLS = ["read", "grep", "ls", "find"];

// Cooperative, recognizable-only command detection. Not a sandbox: aliases,
// scripts, and child programs can bypass it. The git patterns also catch global
// flag forms (`git --no-pager commit`) by scanning the command line for the
// subcommand after any `git` invocation.
const GIT_COMMIT = /\bgit\b[^\n;&|]*\bcommit\b/; // commits need a current-run local_commit grant
const GIT_COMMIT_INVOCATION = /\bgit\b[^\n;&|]*\bcommit\b/g;
const GIT_AMEND = /\bgit\b[^\n;&|]*\bcommit\b[^\n;&|]*--amend\b/; // amend is forbidden even with a grant

function recognizableCommitCount(command) {
  return String(command ?? "").replace(/\r?\n/g, ";").match(GIT_COMMIT_INVOCATION)?.length ?? 0;
}
const PUBLICATION = [
  /\bgit\b[^\n;&|]*\b(?:push|merge)\b/, // push/merge never allowed
  /\bgh\s+pr\b/,
  /\b(?:vercel|netlify|flyctl?|railway|supabase|render|amplify)\s+deploy\b/,
];

// Task Authority Envelope: one canonical v1 JSON object between exact markers,
// accepted only as the first nonempty content of a submitted Human message.
export const ENVELOPE_BEGIN = '<pi-paseo-orchestration authority="v1">';
export const ENVELOPE_END = "</pi-paseo-orchestration>";
const OBJECTIVE_MAX = 2000;
const CAPABILITY_NAMES = ["edit", "local_commit"];
const GRANT_KIND_ROLE = { peer: "peer", lead_tiny: "lead", supervisor_recovery: "lead" };
const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

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
    if (!check.ok) return { ok: false, error: check.error };
    return { ok: true, dir: override, source: "override" };
  }
  if (!bundledDir) return { ok: false, error: "no profile source (bundled profiles unavailable)" };
  const check = await validateProfileDir(bundledDir);
  if (!check.ok) return { ok: false, error: check.error };
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
export async function activate({ env, dir, profileDir, models, setModel, setThinkingLevel, getThinkingLevel, currentModel, currentThinking }) {
  const roleCheck = parseRole(env);
  if (!roleCheck.ok) return { ok: false, error: roleCheck.error };
  if (roleCheck.role === null) return { ok: true, latch: null };

  const agentId = (env[AGENT_ENV] ?? "").trim();
  if (agentId === "") return { ok: false, error: `${AGENT_ENV} must be nonblank for a governed ${roleCheck.role} process` };

  let settings;
  try {
    settings = await readSettings(dir);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (settings === null) return { ok: false, error: `settings document is missing; run /ppo:settings first` };

  const source = await validateProfileDir(profileDir);
  if (!source.ok) return { ok: false, error: source.error };

  let profileText;
  const profileDigests = {};
  try {
    for (const role of ROLES) {
      profileDigests[role] = profileDigest(await readProfile(profileDir, role));
    }
    profileText = await readProfile(profileDir, roleCheck.role);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  // Supervisor and Lead have one fixed selection. A Peer must already be
  // launched with one exact Human-configured route; match the observed runtime
  // tuple rather than silently replacing an unapproved requested model.
  let selectedRoute = null;
  let sel = settings.roles[roleCheck.role];
  if (roleCheck.role === "peer") {
    let matchedSelection = null;
    for (const [routeId, route] of objectEntries(settings.peer_routes)) {
      /** @type {any} */ const candidate = route;
      if (currentModel?.provider === Reflect.get(Object(candidate), "provider")
          && currentModel?.id === Reflect.get(Object(candidate), "model")
          && currentThinking === Reflect.get(Object(candidate), "thinking")) {
        selectedRoute = routeId;
        matchedSelection = candidate;
        break;
      }
    }
    if (matchedSelection === null) return { ok: false, error: "Peer runtime model/thinking is not an allowed Human-configured route" };
    sel = matchedSelection;
  }
  const model = await findModel(models, sel.provider, sel.model);
  if (!model) return { ok: false, error: `model ${sel.provider}/${sel.model} is not in the current model registry` };
  if (typeof setModel !== "function") return { ok: false, error: "model selection API is unavailable" };
  let applied = false;
  try {
    applied = await setModel(model);
  } catch {
    applied = false;
  }
  if (!applied) return { ok: false, error: `model ${sel.provider}/${sel.model} is unavailable or unauthenticated` };

  if (typeof setThinkingLevel !== "function") return { ok: false, error: "thinking level API is unavailable" };
  try {
    setThinkingLevel(sel.thinking);
  } catch {
    return { ok: false, error: `thinking level ${sel.thinking} is unavailable or clamped to ${String(null)}` };
  }
  // setThinkingLevel returns void in the Pi API; the effective level must be
  // read back. Unobservable or clamped states block (fail closed).
  if (typeof getThinkingLevel !== "function") {
    return { ok: false, error: "thinking level observation API is unavailable" };
  }
  let effective;
  try {
    effective = getThinkingLevel();
  } catch {
    effective = null;
  }
  if (effective !== sel.thinking) {
    return { ok: false, error: `thinking level ${sel.thinking} is unavailable or clamped to ${String(effective)}` };
  }

  const latch = {
    role: roleCheck.role,
    agentId,
    settings: structuredClone(settings),
    profileDir,
    profileOverride: env[PROFILES_ENV] ?? null,
    profileText,
    profileDigest: profileDigest(profileText),
    profileDigests,
    peerProviderAlias: env[PEER_ALIAS_ENV] ?? null,
    selectedModel: { provider: sel.provider, id: sel.model },
    selectedThinking: sel.thinking,
    selectedPeerRoute: selectedRoute,
  };
  return { ok: true, latch };
}

function verifyRuntimeSelection(latch, ctx) {
  if (!isRecord(ctx) || !isRecord(ctx.model)
      || typeof ctx.model.provider !== "string" || ctx.model.provider.trim() === ""
      || typeof ctx.model.id !== "string" || ctx.model.id.trim() === "") {
    return { ok: false, error: "runtime model selection is missing or unobservable" };
  }
  if (ctx.model.provider !== latch.selectedModel?.provider || ctx.model.id !== latch.selectedModel?.id) {
    return { ok: false, error: "runtime model drifted from the latched role setting" };
  }
  if (typeof ctx.thinkingLevel !== "string" || ctx.thinkingLevel.trim() === "") {
    return { ok: false, error: "runtime thinking level is missing or unobservable" };
  }
  if (ctx.thinkingLevel !== latch.selectedThinking) {
    return { ok: false, error: "runtime thinking level drifted from the latched role setting" };
  }
  return { ok: true };
}

export async function verifyLatch(latch, env, dir, ctx = {}, { runtime = true } = {}) {
  if (parseRole(env).role !== latch.role) return { ok: false, error: "role environment drifted" };
  if ((env[AGENT_ENV] ?? "").trim() !== latch.agentId) return { ok: false, error: "Paseo agent identity drifted" };
  if ((env[PROFILES_ENV] ?? null) !== latch.profileOverride) return { ok: false, error: "profile source drifted" };
  if ((env[PEER_ALIAS_ENV] ?? null) !== latch.peerProviderAlias) return { ok: false, error: "Peer provider alias drifted" };
  let current;
  try {
    current = await readSettings(dir);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (current === null || JSON.stringify(current) !== JSON.stringify(latch.settings)) {
    return { ok: false, error: "role settings document drifted" };
  }
  try {
    for (const role of ROLES) {
      const digest = profileDigest(await readProfile(latch.profileDir, role));
      if (digest !== latch.profileDigests?.[role]) return { ok: false, error: `role profile ${role}.md content drifted` };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (runtime) {
    const runtimeCheck = verifyRuntimeSelection(latch, ctx);
    if (!runtimeCheck.ok) return runtimeCheck;
  }
  return { ok: true };
}

export function intersectTools(baseline, role) {
  const ceiling = CEILINGS[role] ?? [];
  return baseline.filter((tool) => ceiling.includes(tool));
}

// One shared policy decision for run shaping and call-time gating (one
// mechanism, not scattered checks). policy = { role, allowed, mcpTargets }.
function closedKeys(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function validProviderAlias(value) {
  return typeof value === "string" && value !== "" && value === value.trim() && !value.includes("/");
}

function createAgentPolicyPrompt(activeLatch, authority) {
  const envelope = authority?.envelope ?? null;
  if (activeLatch.role === "lead") {
    if (!validProviderAlias(activeLatch.peerProviderAlias)) {
      return `Paseo paseo_create_agent is blocked until ${PEER_ALIAS_ENV} names the Human-configured Peer provider alias.`;
    }
    const routes = objectEntries(activeLatch.settings.peer_routes).map(([id, route]) => {
      /** @type {any} */ const candidate = route;
      return `- ${id}: ${Reflect.get(Object(candidate), "description")} => provider ${activeLatch.peerProviderAlias}/${Reflect.get(Object(candidate), "provider")}/${Reflect.get(Object(candidate), "model")}; settings {\"thinkingOptionId\":${JSON.stringify(Reflect.get(Object(candidate), "thinking"))}}`;
    });
    return [
      "Paseo paseo_create_agent policy (closed v2): choose one Human-configured model route for this assignment:",
      ...routes,
      "- initialPrompt must bind the chosen route exactly once as \"model_route\":\"<route-id>\"",
      "- omit workspaceId and labels (the child inherits this exact workspace and Paseo supplies parentage)",
      `- initialPrompt must bind \"parent_lead_agent_id\" to ${activeLatch.agentId}`,
      "- notifyOnFinish must be true; title and initialPrompt must be nonempty",
    ].join("\n");
  }
  if (activeLatch.role === "supervisor" && envelope?.grant_kind === "supervisor_recovery") {
    const selection = activeLatch.settings.roles.lead;
    return [
      "Paseo recovery paseo_create_agent policy (closed v1):",
      `- provider must be ${envelope.provider}/${selection.provider}/${selection.model}`,
      `- workspaceId must be ${envelope.workspace_id}`,
      `- labels must be exactly {\"pi-paseo-orchestration.handoff-id\":${JSON.stringify(envelope.handoff_id)}}`,
      `- settings must be exactly {\"thinkingOptionId\":${JSON.stringify(selection.thinking)}}`,
      "- notifyOnFinish must be true; initialPrompt must contain the exact recovery objective, handoff ID, and require Human /ppo:doctor evidence before handoff",
    ].join("\n");
  }
  return "Paseo create_agent is unavailable for this run.";
}

function validateCreateAgentArgs(args, policy) {
  const block = (reason) => ({ block: true, reason });
  let selection = policy.role === "supervisor" ? policy.roleSettings?.lead : null;
  let selectedRoute = null;
  if (policy.role === "lead") {
    if (!isRecord(policy.peerRoutes)) return block("Peer model routes are unavailable");
    const bindings = typeof args?.initialPrompt === "string" ? [...args.initialPrompt.matchAll(/\"model_route\"\s*:\s*\"([^\"]*)\"/g)] : [];
    if (bindings.length !== 1 || !Object.prototype.hasOwnProperty.call(policy.peerRoutes, bindings[0][1])) {
      return block("Peer create_agent prompt must bind exactly one configured model_route");
    }
    selectedRoute = bindings[0][1];
    selection = policy.peerRoutes[selectedRoute];
  }
  if (!isRecord(selection)
      || typeof selection.provider !== "string" || selection.provider === ""
      || typeof selection.model !== "string" || selection.model === ""
      || typeof selection.thinking !== "string" || selection.thinking === "") {
    return block("create_agent target role settings are unavailable");
  }

  const recovery = policy.role === "supervisor" ? policy.envelope : null;
  const alias = policy.role === "supervisor" ? recovery?.provider : policy.peerProviderAlias;
  if (!validProviderAlias(alias)) {
    return block(`create_agent ${policy.role === "lead" ? PEER_ALIAS_ENV : "recovery provider alias"} is unavailable or invalid`);
  }
  if (policy.role === "supervisor" && recovery?.grant_kind !== "supervisor_recovery") {
    return block("Supervisor create_agent requires a current-run supervisor_recovery grant");
  }

  const supervisor = policy.role === "supervisor";
  const required = ["title", "provider", "settings", "initialPrompt", "notifyOnFinish"];
  if (supervisor) required.push("workspaceId", "labels");
  if (!closedKeys(args, required)) return block("create_agent arguments are not the closed role-specific shape");
  if (typeof args.title !== "string" || args.title.trim() === "" || args.title !== args.title.trim() || args.title.length > 60) {
    return block("create_agent title must be a trimmed nonempty string of at most 60 characters");
  }
  const expectedProvider = `${alias}/${selection.provider}/${selection.model}`;
  if (args.provider !== expectedProvider) return block(`create_agent provider must be exactly ${expectedProvider}`);
  if (!closedKeys(args.settings, ["thinkingOptionId"]) || args.settings.thinkingOptionId !== selection.thinking) {
    return block(`create_agent thinking must be exactly ${selection.thinking}`);
  }
  if (typeof args.initialPrompt !== "string" || args.initialPrompt.trim() === "") {
    return block("create_agent initialPrompt must be a nonempty string");
  }
  if (!supervisor) {
    const parentBindings = [...args.initialPrompt.matchAll(/"parent_lead_agent_id"\s*:\s*"([^"]*)"/g)];
    if (typeof policy.currentAgentId !== "string" || policy.currentAgentId === ""
        || parentBindings.length !== 1 || parentBindings[0][1] !== policy.currentAgentId) {
      return block("Peer create_agent prompt must bind parent_lead_agent_id exactly once to the current Lead");
    }
  }
  if (args.notifyOnFinish !== true) return block("create_agent must request the native finish notification");

  if (supervisor) {
    if (args.workspaceId !== recovery.workspace_id) return block("recovery create_agent workspace does not match the current grant");
    if (!closedKeys(args.labels, ["pi-paseo-orchestration.handoff-id"])
        || args.labels["pi-paseo-orchestration.handoff-id"] !== recovery.handoff_id) {
      return block("recovery create_agent handoff does not match the current grant");
    }
    if (!args.initialPrompt.includes(recovery.objective)
        || !args.initialPrompt.includes(recovery.handoff_id)
        || !args.initialPrompt.includes("/ppo:doctor")) {
      return block("recovery create_agent prompt must bind the objective and handoff and require doctor");
    }
  }
  return undefined;
}

export function checkToolCall(toolName, input, policy) {
  const block = (reason) => ({ block: true, reason });
  const allowed = policy.allowed instanceof Set ? policy.allowed : new Set(policy.allowed);
  if (toolName === "mcp_script") {
    return block("mcp_script is unavailable to every governed role");
  }
  // Peer read gate: the repository-wide Workspace Protocol is Lead governance
  // material. Reading the full protocol is a governance violation for the peer
  // role — assignment-relevant constraints arrive via the prompt, not the
  // file. The gate is role-based, so a current-run edit grant never unlocks
  // protocol reads, and protocol presence never bypasses this check.
  if (policy.role === "peer" && PROTOCOL_READ_TOOLS.includes(toolName)) {
    const target = input?.path ?? input?.file_path ?? null;
    if (typeof target === "string" && target !== "") {
      if (policy.repoRoot == null) {
        return block("peer read target cannot be checked without a repository root");
      }
      const rel = targetToRepoRelative(policy.repoRoot, target);
      if (rel !== null && (rel === ".orchestration" || rel.startsWith(".orchestration/"))) {
        return block("reading the workspace protocol is a governance violation for the peer role");
      }
    }
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
      if (input.server === "paseo" && input.tool === "paseo_create_agent") {
      return validateCreateAgentArgs(input.args, policy);
    }
    if (input.server === "paseo" && PASEO_CHILD_TOOLS.has(input.tool)) {
      if (policy.role === "supervisor" && (input.tool === "paseo_get_agent_status" || input.tool === "paseo_get_agent_activity")) {
        if (!closedKeys(input.args, ["agentId"])) return block(`${input.tool} arguments must contain exactly agentId`);
        return undefined;
      }
      if (policy.role !== "lead") return block(`${input.tool} is restricted to the Lead role`);
      if (!closedKeys(input.args, ["agentId"], input.tool === "paseo_send_agent_prompt" ? ["prompt", "background", "notifyOnFinish"] : [])) {
        return block(`${input.tool} arguments are not the closed child-specific shape`);
      }
      if (!policy.createdPeerIds?.has(input.args.agentId)) return block(`${input.tool} target is not a Peer created by this Lead process`);
      if (input.tool === "paseo_send_agent_prompt" && (typeof input.args.prompt !== "string" || input.args.prompt.trim() === "")) {
        return block("paseo_send_agent_prompt prompt must be nonempty");
      }
    }
    if (input.server === "paseo" && input.tool === "paseo_list_agents") {
      if (!["supervisor", "lead"].includes(policy.role) || !closedKeys(input.args ?? {}, [], ["includeArchived", "cwd", "sinceHours", "statuses", "limit"])) {
        return block("paseo_list_agents is restricted to bounded Supervisor observation or Lead duplicate/ownership checks");
      }
      return undefined;
    }
    if (input.server === "paseo" && (input.tool === "paseo_list_workspaces" || input.tool === "paseo_list_providers")) {
      if (policy.role !== "lead" || !closedKeys(input.args ?? {}, [])) {
        return block(`${input.tool} is restricted to argument-free Lead discovery`);
      }
      return undefined;
    }
    return undefined;
  }
  if (toolName === "bash") {
    if (typeof input?.command !== "string") return block("bash call without a command string");
    for (const pattern of PUBLICATION) {
      if (pattern.test(input.command)) return block("publication route is always blocked");
    }
    if (GIT_AMEND.test(input.command)) return block("git commit --amend is forbidden");
    if (GIT_COMMIT.test(input.command) && !policy.envelope?.capabilities?.includes("local_commit")) {
      return block("git commit requires a current-run local_commit grant");
    }
    return undefined;
  }
  if (toolName === "write" || toolName === "edit") {
    if (!policy.envelope) return block(`${toolName} requires a current-run edit grant`);
    if (policy.repoRoot == null) return block(`${toolName} target cannot be checked without a repository root`);
    const target = input?.path ?? input?.file_path;
    const rel = targetToRepoRelative(policy.repoRoot, target);
    if (rel === null || !isPathInScope(rel, policy.envelope.scope, policy.envelope.exclusions)) {
      return block(`${toolName} target ${JSON.stringify(target)} is outside the granted scope`);
    }
    return undefined;
  }
  return undefined;
}

// ─── Task Authority Envelope ─────────────────────────────────────────────────

// Raw duplicate-key scan: JSON.parse silently keeps the last duplicate, but the
// closed schema must reject duplicate fields. Keys are compared decoded (via
// JSON.parse of the raw key token) so escape variants (`"\u0061"` vs `"a"`)
// cannot slip through.
function findDuplicateKey(jsonText) {
  const stack = [];
  let i = 0;
  const n = jsonText.length;
  while (i < n) {
    const c = jsonText[i];
    if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (jsonText[i] === "\\") {
          i += 2;
          continue;
        }
        if (jsonText[i] === '"') break;
        i++;
      }
      let j = i + 1;
      while (j < n && /\s/.test(jsonText[j])) j++;
      if (jsonText[j] === ":") {
        const top = stack[stack.length - 1];
        if (top !== undefined && top !== null) {
          let key;
          try {
            key = JSON.parse(jsonText.slice(start, i + 1));
          } catch {
            key = jsonText.slice(start + 1, i);
          }
          if (top.has(key)) return key;
          top.set(key, true);
        }
      }
      i = j; // resume just past the string (and any whitespace)
      continue;
    }
    if (c === "{") stack.push(new Map());
    else if (c === "}") stack.pop();
    else if (c === "[") stack.push(null);
    else if (c === "]") stack.pop();
    i++;
  }
  return null;
}

// Closed v1 schema per grant kind. Unknown version/kind/field, duplicate field,
// mistyped, conflicting (e.g. base without local_commit), and role-mismatched
// data all fail closed with an explicit reason.
function validateEnvelopeShape(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, error: "authority envelope body must be a single JSON object" };
  }
  if (obj.version !== 1) {
    return { ok: false, error: `authority envelope version must be exactly 1 (got ${JSON.stringify(obj.version)})` };
  }
  const kind = obj.grant_kind;
  if (!Object.prototype.hasOwnProperty.call(GRANT_KIND_ROLE, kind)) {
    return { ok: false, error: `grant_kind must be one of peer|lead_tiny|supervisor_recovery (got ${JSON.stringify(kind)})` };
  }
  if (obj.role !== GRANT_KIND_ROLE[kind]) {
    return { ok: false, error: `grant_kind ${kind} requires role ${GRANT_KIND_ROLE[kind]} (got ${JSON.stringify(obj.role)})` };
  }
  if (obj.issuer !== "human") {
    return { ok: false, error: `issuer must be exactly "human" (got ${JSON.stringify(obj.issuer)})` };
  }
  for (const field of ["agent_id", "task_id"]) {
    if (typeof obj[field] !== "string" || obj[field].trim() === "") {
      return { ok: false, error: `${field} must be a nonempty string` };
    }
  }
  if (typeof obj.objective !== "string" || obj.objective.trim() === "") {
    return { ok: false, error: "objective must be a nonempty string" };
  }
  if (obj.objective.length > OBJECTIVE_MAX) {
    return { ok: false, error: `objective exceeds the ${OBJECTIVE_MAX}-character bound` };
  }

  if (kind === "supervisor_recovery") {
    const fields = ["version", "grant_kind", "role", "issuer", "agent_id", "task_id", "objective", "provider", "workspace_id", "handoff_id"];
    const extra = Object.keys(obj).find((k) => !fields.includes(k));
    if (extra !== undefined) return { ok: false, error: `unknown field ${JSON.stringify(extra)} in supervisor_recovery envelope` };
    for (const field of ["provider", "workspace_id", "handoff_id"]) {
      if (typeof obj[field] !== "string" || obj[field].trim() === "") {
        return { ok: false, error: `${field} must be a nonempty string` };
      }
    }
    return { ok: true, envelope: { ...obj, capabilities: [] } };
  }

  const fields = ["version", "grant_kind", "role", "issuer", "agent_id", "task_id", "objective", "capabilities", "scope", "exclusions", "base"];
  if (kind === "lead_tiny") fields.push("protocol_digest");
  const extra = Object.keys(obj).find((k) => !fields.includes(k));
  if (extra !== undefined) return { ok: false, error: `unknown field ${JSON.stringify(extra)} in ${kind} envelope` };

  if (!Array.isArray(obj.capabilities) || obj.capabilities.length === 0) {
    return { ok: false, error: "capabilities must be a nonempty array" };
  }
  if (new Set(obj.capabilities).size !== obj.capabilities.length) {
    return { ok: false, error: "capabilities must not repeat" };
  }
  for (const cap of obj.capabilities) {
    if (typeof cap !== "string" || !CAPABILITY_NAMES.includes(cap)) {
      return { ok: false, error: `unknown capability ${JSON.stringify(cap)}` };
    }
  }
  if (typeof obj.scope !== "string" || obj.scope === "") {
    return { ok: false, error: "scope must be a nonempty repository-relative string" };
  }
  let exclusions = [];
  if (obj.exclusions !== undefined) {
    if (!Array.isArray(obj.exclusions)) return { ok: false, error: "exclusions must be an array" };
    for (const e of obj.exclusions) {
      if (typeof e !== "string" || e === "") return { ok: false, error: "each exclusion must be a nonempty string" };
    }
    exclusions = obj.exclusions;
  }
  const commitGranted = obj.capabilities.includes("local_commit");
  if (commitGranted) {
    if (typeof obj.base !== "string" || !FULL_SHA.test(obj.base)) {
      return { ok: false, error: "base must be a full git commit SHA when local_commit is granted" };
    }
  } else if (obj.base !== undefined) {
    return { ok: false, error: "base is only valid when local_commit is granted" };
  }
  if (kind === "lead_tiny" && (typeof obj.protocol_digest !== "string" || !SHA256_HEX.test(obj.protocol_digest))) {
    return { ok: false, error: "protocol_digest must be a full sha256 hex digest" };
  }
  return { ok: true, envelope: { ...obj, exclusions } };
}

// Parses the authority envelope from a submitted message. Returns
// { ok: true, envelope: null } when no envelope is present, { ok: true,
// envelope } for a schema-valid envelope, or { ok: false, error } when an
// envelope attempt exists but is misplaced, duplicated, malformed, quoted, or
// otherwise invalid — nothing is granted in that case.
export function parseEnvelope(text) {
  if (typeof text !== "string") return { ok: true, envelope: null };
  const stripped = text.trimStart();
  if (!stripped.includes(ENVELOPE_BEGIN)) {
    if (stripped.includes("<pi-paseo-orchestration")) {
      return { ok: false, error: "unrecognized authority envelope marker (unknown marker version or malformed)" };
    }
    return { ok: true, envelope: null };
  }
  if (!stripped.startsWith(ENVELOPE_BEGIN)) {
    return { ok: false, error: "authority envelope must be the first nonempty content of the message" };
  }
  // A second begin marker anywhere (even in trailing prose) is a duplicate.
  if (stripped.indexOf(ENVELOPE_BEGIN, 1) !== -1) {
    return { ok: false, error: "duplicate authority envelope in one message" };
  }
  const endAt = stripped.indexOf(ENVELOPE_END, ENVELOPE_BEGIN.length);
  if (endAt === -1) {
    return { ok: false, error: "authority envelope has no closing marker" };
  }
  const body = stripped.slice(ENVELOPE_BEGIN.length, endAt);
  const dup = findDuplicateKey(body);
  if (dup !== null) {
    return { ok: false, error: `duplicate field ${JSON.stringify(dup)} in authority envelope` };
  }
  let obj;
  try {
    obj = JSON.parse(body);
  } catch {
    return { ok: false, error: "authority envelope body is not valid JSON" };
  }
  return validateEnvelopeShape(obj);
}

export function isPathInScope(rel, scope, exclusions) {
  const within = rel === scope || rel.startsWith(scope + "/");
  if (!within) return false;
  return !(exclusions ?? []).some((e) => rel === e || rel.startsWith(e + "/"));
}

// Converts a write/edit target (absolute or repo-relative) to a canonical
// repo-relative path, or null when it is outside the repository or ambiguous.
function targetToRepoRelative(repoRoot, target) {
  if (typeof target !== "string" || target.trim() === "") return null;
  let rel = target;
  if (isAbsolute(target) || /^[A-Za-z]:[\\/]/.test(target)) {
    rel = relative(repoRoot, target);
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  }
  rel = posix.normalize(rel);
  if (rel === "." || rel === ".." || rel.startsWith("../")) return null;
  return rel;
}

// One granted scope path: nonempty, repository-relative, no absolute/home
// path, no backslashes, no empty/dot/traversal segments, no glob characters,
// no symlink components, and at most a new final component inside an existing
// real directory ("new files outside an existing real directory" are rejected).
async function checkScopePath(repoRoot, p, label) {
  if (typeof p !== "string" || p === "") return { ok: false, error: `${label} must be a nonempty string` };
  if (p !== p.trim()) return { ok: false, error: `${label} must not have leading or trailing whitespace` };
  if (isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("~")) {
    return { ok: false, error: `${label} must be repository-relative, not an absolute or home path` };
  }
  if (p.includes("\\")) return { ok: false, error: `${label} must use forward-slash repository-relative paths` };
  const segments = p.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      return { ok: false, error: `${label} has an empty or ambiguous segment (no ".", trailing "/", or "//")` };
    }
    if (segment === "..") return { ok: false, error: `${label} must not traverse outside the repository` };
    if (/[*?[\]{}]/.test(segment)) return { ok: false, error: `${label} must not contain glob characters` };
  }
  for (let i = 1; i <= segments.length; i++) {
    const current = join(repoRoot, ...segments.slice(0, i));
    let st;
    try {
      st = await lstat(current);
    } catch {
      if (i < segments.length) {
        return { ok: false, error: `${label} names a new file outside an existing real directory` };
      }
      return { ok: true, canonical: p }; // new final component inside an existing real directory
    }
    if (st.isSymbolicLink()) return { ok: false, error: `${label} contains a symlink component` };
    if (!st.isDirectory()) {
      if (i < segments.length) return { ok: false, error: `${label} descends through a non-directory` };
      if (!st.isFile()) return { ok: false, error: `${label} must be a directory or a regular file` };
    }
  }
  return { ok: true, canonical: p };
}

// Normalized repository-relative writable scope plus in-scope exclusions,
// checked at envelope activation against the real repository filesystem.
export async function validateScope(repoRoot, scope, exclusions = []) {
  const scopeCheck = await checkScopePath(repoRoot, scope, "scope");
  if (!scopeCheck.ok) return { ok: false, error: scopeCheck.error };
  const canonical = [];
  for (const exclusion of exclusions) {
    const check = await checkScopePath(repoRoot, exclusion, `exclusion ${JSON.stringify(exclusion)}`);
    if (!check.ok) return { ok: false, error: check.error };
    if (!isPathInScope(exclusion, scope, [])) {
      return { ok: false, error: `exclusion ${JSON.stringify(exclusion)} must lie within scope ${JSON.stringify(scope)}` };
    }
    canonical.push(exclusion);
  }
  return { ok: true, scope, exclusions: canonical };
}

// One shared effective-policy computation: baseline ∩ (role ceiling ∪
// current-run envelope capabilities). The envelope's `edit` capability maps to
// the write and edit tools; `local_commit` gates git commit through bash
// instead of adding a tool. Tools outside the baseline are never re-enabled.
export function effectiveTools(baseline, role, authority = null) {
  if (!Array.isArray(baseline)) return [];
  const ceiling = CEILINGS[role] ?? [];
  const extra = authority?.envelope?.capabilities?.includes("edit") ? ["write", "edit"] : [];
  return baseline.filter((tool) => ceiling.includes(tool) || extra.includes(tool));
}

function gitOut(repoRoot, args, trim = true) {
  return execFileAsync("git", args, {
    cwd: repoRoot,
    timeout: 15000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).then(({ stdout }) => (trim ? stdout.trim() : stdout)).catch(() => null);
}

function findRepoRoot(cwd = process.cwd()) {
  return gitOut(cwd, ["rev-parse", "--show-toplevel"]).then((root) => (root === "" ? null : root));
}

async function gitChangedPaths(repoRoot) {
  const [unstaged, staged, untracked] = await Promise.all([
    gitOut(repoRoot, ["diff", "--name-only", "HEAD"]),
    gitOut(repoRoot, ["diff", "--cached", "--name-only", "HEAD"]),
    gitOut(repoRoot, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  if (unstaged === null || staged === null || untracked === null) return null;
  const paths = new Set();
  for (const list of [unstaged, staged, untracked]) {
    for (const line of list.split("\n")) {
      const p = line.trim();
      if (p !== "") paths.add(p);
    }
  }
  return [...paths];
}

// Call-time gate for recognizable `git commit` under a local_commit grant:
// HEAD must still equal the granted candidate base and the current/cumulative
// diff (staged, unstaged, and untracked paths) must stay within the granted
// scope. Cooperative like the rest of the guardrail — aliases, scripts, and
// child programs can bypass it.
export async function checkCommitGate(command, authority) {
  const { envelope, repoRoot, scope, exclusions } = authority;
  if (!envelope.capabilities.includes("local_commit")) {
    return { block: true, reason: "git commit requires a current-run local_commit grant" };
  }
  const commitCount = recognizableCommitCount(command);
  if (commitCount === 0) return undefined;
  if (commitCount > 1) {
    return { block: true, reason: "git commit blocked: one candidate-producing run may contain exactly one git commit" };
  }
  const head = await gitOut(repoRoot, ["rev-parse", "HEAD"]);
  if (head !== envelope.base) {
    return { block: true, reason: "git commit blocked: current HEAD does not equal the granted candidate base" };
  }
  const changed = await gitChangedPaths(repoRoot);
  if (changed === null) {
    return { block: true, reason: "git commit blocked: cannot inspect the current diff" };
  }
  for (const p of changed) {
    if (!isPathInScope(p, scope, exclusions)) {
      return { block: true, reason: `git commit blocked: ${p} is outside the granted scope` };
    }
  }
  return undefined;
}

// ─── Peer Report ─────────────────────────────────────────────────────────────

// One strict v1 Peer Report, parsed as the first nonempty content of a Peer
// run's final response. A report is validated as a document only: it NEVER
// grants authority, NEVER changes the envelope/authority state, and NEVER
// accepts anything (8.16). Emission, transport, and consumption are Peer/Lead
// conduct — the extension validates the format and the correlation facts and
// implements no mailbox, queue, retry, or notification arming.
export const REPORT_BEGIN = '<pi-paseo-orchestration report="v1">';
export const REPORT_END = "</pi-paseo-orchestration>";
export const REPORT_KINDS = ["PROGRESS", "HANDOFF", "REOPEN_REQUEST", "DEPENDENCY_REQUEST", "BLOCKED"];

// Closed common block: report version/kind, Peer agent ID, exact parent Lead
// agent ID, task/assignment IDs, nonempty summary + evidence, typed payload
// per kind, and optional superseded report ID. Unknown, duplicate, malformed,
// mistyped, misplaced, or mismatched data rejects the report.
const REPORT_FIELDS = [
  "version", "kind", "report_id", "peer_agent_id", "parent_lead_agent_id",
  "task_id", "assignment_id", "summary", "evidence", "payload", "supersedes_report_id",
];

const REPORT_PAYLOAD = {
  PROGRESS: { completed: { type: "strings", min: 1 }, next: { type: "strings", min: 1 }, risks: { type: "strings", min: 1 } },
  HANDOFF: { artifacts: { type: "strings", min: 1 }, candidate_ref: { type: "candidate" }, verification: { type: "verification", min: 1 }, residual_risks: { type: "strings" }, unfinished_dependencies: { type: "strings" } },
  REOPEN_REQUEST: { failed_premise: { type: "string" }, impact: { type: "string" }, options: { type: "strings", min: 1 }, requested_decision: { type: "string" } },
  DEPENDENCY_REQUEST: { needed: { type: "string" }, needed_from: { type: "string" }, impact: { type: "string" }, human_decision_required: { type: "boolean" } },
  BLOCKED: { blocker: { type: "string" }, impact: { type: "string" }, unblock_condition: { type: "string" }, bounded_attempts: { type: "strings", min: 1 }, can_continue_elsewhere: { type: "boolean" } },
};

function checkReportPayload(payload, kind) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, error: `payload must be a single object for kind ${kind}` };
  const schema =
    kind === "PROGRESS" ? REPORT_PAYLOAD.PROGRESS
    : kind === "HANDOFF" ? REPORT_PAYLOAD.HANDOFF
    : kind === "REOPEN_REQUEST" ? REPORT_PAYLOAD.REOPEN_REQUEST
    : kind === "DEPENDENCY_REQUEST" ? REPORT_PAYLOAD.DEPENDENCY_REQUEST
    : kind === "BLOCKED" ? REPORT_PAYLOAD.BLOCKED
    : undefined;
  for (const field of Object.keys(payload)) {
    if (!Object.prototype.hasOwnProperty.call(schema, field)) return { ok: false, error: `unknown field ${JSON.stringify(field)} in ${kind} payload` };
  }
  for (const [field, rule] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return { ok: false, error: `payload.${field} is missing for kind ${kind}` };
    const value = payload[field];
    if (rule.type === "string") {
      if (typeof value !== "string" || value.trim() === "") return { ok: false, error: `payload.${field} must be a nonempty string` };
    } else if (rule.type === "boolean") {
      if (typeof value !== "boolean") return { ok: false, error: `payload.${field} must be a boolean` };
    } else if (rule.type === "candidate") {
      if (value !== null && (typeof value !== "string" || value.trim() === "")) return { ok: false, error: `payload.${field} must be a candidate reference string or null` };
      if (typeof value === "string" && !parseCandidateRef(value).ok) return { ok: false, error: `payload.${field} must be a valid Stable Candidate reference` };
    } else if (rule.type === "strings") {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) return { ok: false, error: `payload.${field} must be an array of nonempty strings` };
      if ("min" in rule && value.length < rule.min) return { ok: false, error: `payload.${field} must contain at least ${rule.min} item(s)` };
    } else if (rule.type === "verification") {
      if (!Array.isArray(value) || value.length < ("min" in rule ? rule.min : 0)) return { ok: false, error: `payload.${field} must be a nonempty verification array` };
      for (const [index, item] of value.entries()) {
        const closed = checkClosedObject(item, ["command", "result", "output"], `payload.${field}[${index}]`);
        if (!closed.ok) return { ok: false, error: closed.error };
        for (const key of ["command", "output"]) {
          const check = checkNonemptyString(item[key], `payload.${field}[${index}].${key}`);
          if (!check.ok) return { ok: false, error: check.error };
        }
        if (!COMMAND_RESULTS.includes(item.result)) return { ok: false, error: `payload.${field}[${index}].result must be PASS|FAIL|NOT_RUN` };
      }
    }
  }
  return { ok: true };
}

function validateReportShape(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, error: "peer report body must be a single JSON object" };
  }
  if (obj.version !== 1) {
    return { ok: false, error: `peer report version must be exactly 1 (got ${JSON.stringify(obj.version)})` };
  }
  if (!REPORT_KINDS.includes(obj.kind)) {
    return { ok: false, error: `kind must be one of ${REPORT_KINDS.join("|")} (got ${JSON.stringify(obj.kind)})` };
  }
  const extra = Object.keys(obj).find((k) => !REPORT_FIELDS.includes(k));
  if (extra !== undefined) return { ok: false, error: `unknown field ${JSON.stringify(extra)} in peer report` };
  for (const field of ["report_id", "peer_agent_id", "parent_lead_agent_id", "task_id", "assignment_id"]) {
    if (typeof obj[field] !== "string" || obj[field].trim() === "") return { ok: false, error: `${field} must be a nonempty string` };
  }
  if (typeof obj.summary !== "string" || obj.summary.trim() === "") return { ok: false, error: "summary must be a nonempty string" };
  if (!Array.isArray(obj.evidence) || obj.evidence.length === 0 || obj.evidence.some((item) => typeof item !== "string" || item.trim() === "")) {
    return { ok: false, error: "evidence must be a nonempty array of nonempty strings" };
  }
  if (obj.supersedes_report_id !== undefined && (typeof obj.supersedes_report_id !== "string" || obj.supersedes_report_id.trim() === "")) {
    return { ok: false, error: "supersedes_report_id must be a nonempty string when present" };
  }
  const payload = checkReportPayload(obj.payload, obj.kind);
  if (!payload.ok) return { ok: false, error: payload.error };
  return { ok: true, report: { ...obj } };
}

// Parses the strict v1 Peer Report from a Peer run's final response. Returns
// { ok: true, report: null } when no report is present, { ok: true, report }
// for a schema-valid report, or { ok: false, error } when a report attempt
// exists but is misplaced, duplicated, malformed, or invalid — nothing is
// accepted in that case. Validation never touches authority state.
export function parseReport(text) {
  if (typeof text !== "string") return { ok: true, report: null };
  const stripped = text.trimStart();
  if (!stripped.includes(REPORT_BEGIN)) {
    if (stripped.includes("<pi-paseo-orchestration")) {
      return { ok: false, error: "unrecognized peer report marker (unknown marker version or malformed)" };
    }
    return { ok: true, report: null };
  }
  if (!stripped.startsWith(REPORT_BEGIN)) {
    return { ok: false, error: "peer report must be the first nonempty content of the response" };
  }
  if (stripped.indexOf(REPORT_BEGIN, 1) !== -1) {
    return { ok: false, error: "duplicate peer report in one response" };
  }
  const endAt = stripped.indexOf(REPORT_END, REPORT_BEGIN.length);
  if (endAt === -1) {
    return { ok: false, error: "peer report has no closing marker" };
  }
  const body = stripped.slice(REPORT_BEGIN.length, endAt);
  const dup = findDuplicateKey(body);
  if (dup !== null) {
    return { ok: false, error: `duplicate field ${JSON.stringify(dup)} in peer report` };
  }
  let obj;
  try {
    obj = JSON.parse(body);
  } catch {
    return { ok: false, error: "peer report body is not valid JSON" };
  }
  return validateReportShape(obj);
}

// Correlation facts for the Lead: a validated report against the latched
// identities the Lead minted and bound. Pure function over the report + known
// IDs — lifecycle, arrival path, or prose can never repair correlation, and a
// missing fact fails closed.
export function correlateReport(report, known) {
  if (report === null || typeof report !== "object" || Array.isArray(report)) {
    return { ok: false, error: "correlation requires a validated peer report object" };
  }
  if (known === null || typeof known !== "object" || Array.isArray(known)) {
    return { ok: false, error: "correlation requires the known child/parent/task/assignment identities" };
  }
  if (typeof report.report_id !== "string" || report.report_id.trim() === "") return { ok: false, error: "report_id must be a nonempty string" };
  const pairs = [
    ["peerId", "peer_agent_id", "child peer agent"],
    ["parentId", "parent_lead_agent_id", "parent lead agent"],
    ["taskId", "task_id", "task"],
    ["assignmentId", "assignment_id", "assignment"],
  ];
  for (const [knownKey, field, label] of pairs) {
    const knownValue = known[knownKey];
    if (typeof knownValue !== "string" || knownValue.trim() === "") {
      return { ok: false, error: `the known ${label} id is missing; correlation fails closed` };
    }
    if (typeof report[field] !== "string" || report[field].trim() === "") {
      return { ok: false, error: `${field} must be a nonempty string` };
    }
    if (report[field] !== knownValue) {
      return { ok: false, error: `report ${field} ${JSON.stringify(report[field])} does not match the known ${label} id ${JSON.stringify(knownValue)}` };
    }
  }
  if (known.candidateRequired === true && report.kind === "HANDOFF" && report.payload.candidate_ref === null) {
    return { ok: false, error: "candidate-required HANDOFF must contain a Stable Candidate reference" };
  }
  if (known.reportVersion !== undefined && report.version !== known.reportVersion) {
    return { ok: false, error: "report version does not match the pinned assignment report version" };
  }
  return { ok: true };
}

// Spec: "at most one bounded inspection" after missing or ambiguous evidence.
// Recording evidence resets the budget; exceeding it fails closed. The Lead
// profile names the rule; this helper is its canonical encoding.
export function createInspectionLimit(max = 1) {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`inspection limit must be a positive integer (got ${String(max)})`);
  }
  let inspections = 0;
  return {
    recordEvidence() {
      inspections = 0;
    },
    requestInspection() {
      if (inspections >= max) {
        return { ok: false, error: `inspection budget exhausted: at most ${max} bounded inspection(s) without new evidence` };
      }
      inspections += 1;
      return { ok: true, remaining: max - inspections };
    },
  };
}

// ─── Stable Candidate, review, verdict, and Local Acceptance ────────────────

// These are document and Git-fact seams only. They keep no candidate registry,
// acceptance state, refs, notes, or other persistence and are not wired into
// Peer input parsing. The caller supplies the current repository and authority
// facts each time, so HEAD/worktree drift naturally fails revalidation.
export const CANDIDATE_EVIDENCE_BEGIN = '<pi-paseo-orchestration evidence="v1">';
export const CANDIDATE_EVIDENCE_END = "</pi-paseo-orchestration>";
export const REVIEW_BEGIN = '<pi-paseo-orchestration review="v1">';
export const REVIEW_END = "</pi-paseo-orchestration>";
export const VERDICT_BEGIN = '<pi-paseo-orchestration verdict="v1">';
export const VERDICT_END = "</pi-paseo-orchestration>";
export const ACCEPTANCE_BEGIN = '<pi-paseo-orchestration acceptance="v1">';
export const ACCEPTANCE_END = "</pi-paseo-orchestration>";

const DIRECT_ACCEPTANCE = Symbol("direct Human acceptance route");
const COMMAND_RESULTS = ["PASS", "FAIL", "NOT_RUN"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkClosedObject(value, fields, label) {
  if (!isRecord(value)) return { ok: false, error: `${label} must be a single object` };
  const extra = Object.keys(value).find((field) => !fields.includes(field));
  if (extra !== undefined) return { ok: false, error: `unknown field ${JSON.stringify(extra)} in ${label}` };
  return { ok: true };
}

function checkNonemptyString(value, label) {
  return typeof value === "string" && value.trim() !== ""
    ? { ok: true }
    : { ok: false, error: `${label} must be a nonempty string` };
}

function checkStringList(value, label, { min = 0, unique = false } = {}) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    return { ok: false, error: `${label} must be an array of nonempty strings` };
  }
  if (value.length < min) return { ok: false, error: `${label} must contain at least ${min} item(s)` };
  if (unique && new Set(value).size !== value.length) return { ok: false, error: `${label} must not repeat values` };
  return { ok: true };
}

function sameList(left, right) {
  // Order-insensitive set comparison: the active tool set is a shared runtime
  // resource, so ordering or unrelated additions by co-extensions must not
  // look like policy drift.
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  const set = new Set(right);
  return left.every((item) => set.has(item));
}

// Shared strict marker parser for the four Slice 6 documents. Like authority and
// report parsing, the marker must be first, duplicate JSON keys are rejected
// before JSON.parse, and any unknown pi-paseo marker fails closed.
function parseV1Block(text, begin, label, resultKey, validate) {
  if (typeof text !== "string") return { ok: true, [resultKey]: null };
  const stripped = text.trimStart();
  if (!stripped.includes(begin)) {
    if (stripped.includes("<pi-paseo-orchestration")) {
      return { ok: false, error: `unrecognized ${label} marker (unknown marker version or malformed)` };
    }
    return { ok: true, [resultKey]: null };
  }
  if (!stripped.startsWith(begin)) {
    return { ok: false, error: `${label} must be the first nonempty content of the message` };
  }
  if (stripped.indexOf(begin, begin.length) !== -1) {
    return { ok: false, error: `duplicate ${label} in one message` };
  }
  const endMarker = "</pi-paseo-orchestration>";
  const endAt = stripped.indexOf(endMarker, begin.length);
  if (endAt === -1) return { ok: false, error: `${label} has no closing marker` };
  const trailing = stripped.slice(endAt + endMarker.length);
  if (trailing.includes("<pi-paseo-orchestration") || trailing.includes(endMarker)) {
    return { ok: false, error: `duplicate or mixed pi-paseo document marker after ${label}` };
  }
  const body = stripped.slice(begin.length, endAt);
  const duplicate = findDuplicateKey(body);
  if (duplicate !== null) return { ok: false, error: `duplicate field ${JSON.stringify(duplicate)} in ${label}` };
  let object;
  try {
    object = JSON.parse(body);
  } catch {
    return { ok: false, error: `${label} body is not valid JSON` };
  }
  return validate(object);
}

// Stable Candidate identity is only the exact, lower-case, full-OID v1 form.
// Retrieval is deliberately separate: an identity can parse while its objects
// have since been garbage-collected or belong to another repository.
export function parseCandidateRef(ref) {
  const match = typeof ref === "string"
    ? /^git:v1:([0-9a-f]{40}|[0-9a-f]{64}):([0-9a-f]{40}|[0-9a-f]{64})$/.exec(ref)
    : null;
  if (match === null) {
    return { ok: false, error: "candidate reference must be exactly git:v1:<task-base-full-oid>:<candidate-full-oid>" };
  }
  if (match[1].length !== match[2].length) {
    return { ok: false, error: "candidate reference task base and candidate must use the same full object-id length" };
  }
  return {
    ok: true,
    candidate: { ref, taskBaseOid: match[1], candidateOid: match[2] },
  };
}

async function exactCommit(repoRoot, oid, label) {
  const resolved = await gitOut(repoRoot, ["rev-parse", "--verify", `${oid}^{commit}`]);
  if (resolved !== oid) return { ok: false, error: `${label} ${oid} is not a retrievable full commit object` };
  return { ok: true };
}

async function committedPaths(repoRoot, from, to) {
  const output = await gitOut(repoRoot, [
    "diff", "--name-only", "--no-renames", "-z", from, to, "--",
  ], false);
  if (output === null) return null;
  return output.split("\0").filter((path) => path !== "").sort();
}

async function candidateGitFacts({ candidateRef, repoRoot, grantedBase, scope, exclusions = [] }) {
  const parsed = parseCandidateRef(candidateRef);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { taskBaseOid, candidateOid } = parsed.candidate;
  if (typeof repoRoot !== "string" || repoRoot.trim() === "") {
    return { ok: false, error: "candidate eligibility requires an exact repository root" };
  }
  const observedRoot = await findRepoRoot(repoRoot);
  if (observedRoot === null) return { ok: false, error: "candidate repository is not a retrievable Git worktree" };
  if (observedRoot !== repoRoot) return { ok: false, error: "repoRoot is not the exact Git repository root" };
  if (typeof grantedBase !== "string" || !FULL_SHA.test(grantedBase) || grantedBase.length !== candidateOid.length) {
    return { ok: false, error: "granted candidate base must be a full Git commit oid in the repository object format" };
  }
  const scopeCheck = await validateScope(repoRoot, scope, exclusions);
  if (!scopeCheck.ok) return { ok: false, error: `candidate scope is invalid: ${scopeCheck.error}` };

  for (const [oid, label] of [
    [taskBaseOid, "task base"],
    [candidateOid, "candidate"],
    [grantedBase, "granted candidate base"],
  ]) {
    const check = await exactCommit(repoRoot, oid, label);
    if (!check.ok) return { ok: false, error: check.error };
  }

  const parentLine = await gitOut(repoRoot, ["rev-list", "--parents", "-n", "1", candidateOid]);
  if (parentLine === null) return { ok: false, error: "candidate parentage is not retrievable" };
  const parentParts = parentLine.split(/\s+/);
  if (parentParts.length !== 2) return { ok: false, error: "candidate must be a single-parent commit" };
  if (parentParts[1] !== grantedBase) {
    return { ok: false, error: "candidate parent does not equal the granted candidate base" };
  }
  const runCommitCount = await gitOut(repoRoot, ["rev-list", "--count", `${grantedBase}..${candidateOid}`]);
  if (runCommitCount !== "1") {
    return { ok: false, error: "candidate-producing run must create exactly one commit" };
  }

  if (await gitOut(repoRoot, ["merge-base", "--is-ancestor", taskBaseOid, candidateOid]) === null) {
    return { ok: false, error: "candidate is not a descendant of the referenced task base" };
  }
  const lineage = await gitOut(repoRoot, ["rev-list", "--parents", candidateOid, `^${taskBaseOid}`]);
  if (lineage === null) return { ok: false, error: "candidate ancestry is not retrievable" };
  if (lineage.split("\n").filter(Boolean).some((line) => line.trim().split(/\s+/).length !== 2)) {
    return { ok: false, error: "candidate history from task base is not linear" };
  }

  const head = await gitOut(repoRoot, ["rev-parse", "--verify", "HEAD"]);
  if (head !== candidateOid) return { ok: false, error: "current HEAD does not equal the candidate oid" };
  const status = await gitOut(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"], false);
  if (status === null) return { ok: false, error: "candidate worktree cleanliness is not observable" };
  if (status !== "") return { ok: false, error: "candidate worktree is not clean (staged, unstaged, or untracked residue exists)" };

  const [currentPaths, cumulativePaths] = await Promise.all([
    committedPaths(repoRoot, grantedBase, candidateOid),
    committedPaths(repoRoot, taskBaseOid, candidateOid),
  ]);
  if (currentPaths === null || cumulativePaths === null) {
    return { ok: false, error: "candidate changed paths are not retrievable" };
  }
  if (cumulativePaths.length === 0) return { ok: false, error: "candidate cumulative diff has no changed paths" };
  for (const path of [...new Set([...currentPaths, ...cumulativePaths])]) {
    if (!isPathInScope(path, scope, exclusions)) {
      return { ok: false, error: `candidate changed path ${JSON.stringify(path)} is outside the granted scope` };
    }
  }
  const diff = await gitOut(repoRoot, [
    "diff", "--binary", "--full-index", "--no-color", "--no-ext-diff",
    taskBaseOid, candidateOid, "--",
  ]);
  if (diff === null) return { ok: false, error: "candidate cumulative diff is not retrievable" };
  return { ok: true, candidate: parsed.candidate, currentPaths, cumulativePaths, diff };
}

export async function checkCandidateEligibility(facts) {
  const check = await candidateGitFacts(facts ?? {});
  return check.ok ? { ok: true } : { ok: false, error: check.error };
}

const EVIDENCE_FIELDS = [
  "version", "evidence_id", "project_id", "task_id", "task_revision",
  "assignment_id", "writer_id", "parent_id", "repository_root", "workspace_id",
  "workspace_protocol_digest", "candidate_ref", "cumulative_diff",
  "changed_paths", "scope", "objective_relevance", "verification", "post_commit", "clean",
  "residual_risks", "unfinished_dependencies",
];

function authorityScope(authority) {
  const grant = authority?.envelope ?? authority;
  const scope = authority?.scope ?? grant?.scope;
  const exclusions = authority?.exclusions ?? grant?.exclusions ?? [];
  if (typeof scope !== "string" || scope === "" || !Array.isArray(exclusions)) {
    return { ok: false, error: "candidate evidence validation requires the granted scope and exclusions" };
  }
  return { ok: true, scope, exclusions };
}

function validateCandidateEvidenceShape(object, authority) {
  const closed = checkClosedObject(object, EVIDENCE_FIELDS, "candidate evidence");
  if (!closed.ok) return { ok: false, error: closed.error };
  if (object.version !== 1) return { ok: false, error: "candidate evidence version must be exactly 1" };
  for (const field of [
    "evidence_id", "project_id", "task_id", "task_revision", "writer_id",
    "repository_root", "workspace_id",
  ]) {
    const check = checkNonemptyString(object[field], field);
    if (!check.ok) return { ok: false, error: check.error };
  }
  for (const field of ["assignment_id", "parent_id"]) {
    if (object[field] !== null) {
      const check = checkNonemptyString(object[field], field);
      if (!check.ok) return { ok: false, error: check.error };
    }
  }
  if ((object.assignment_id === null) !== (object.parent_id === null)) {
    return { ok: false, error: "assignment_id and parent_id must both be nonempty strings or both be null for Lead tiny" };
  }
  if (typeof object.workspace_protocol_digest !== "string" || !SHA256_HEX.test(object.workspace_protocol_digest)) {
    return { ok: false, error: "workspace_protocol_digest must be a full sha256 hex digest" };
  }
  const candidate = parseCandidateRef(object.candidate_ref);
  if (!candidate.ok) return { ok: false, error: `candidate evidence ${candidate.error}` };

  let check = checkClosedObject(object.cumulative_diff,
    ["evidence_id", "base_oid", "candidate_oid", "diff"], "candidate evidence cumulative_diff");
  if (!check.ok) return { ok: false, error: check.error };
  check = checkNonemptyString(object.cumulative_diff.evidence_id, "cumulative_diff.evidence_id");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.cumulative_diff.base_oid !== candidate.candidate.taskBaseOid
      || object.cumulative_diff.candidate_oid !== candidate.candidate.candidateOid) {
    return { ok: false, error: "cumulative_diff object ids must match candidate_ref" };
  }
  check = checkNonemptyString(object.cumulative_diff.diff, "cumulative_diff.diff");
  if (!check.ok) return { ok: false, error: check.error };

  check = checkStringList(object.changed_paths, "changed_paths", { min: 1, unique: true });
  if (!check.ok) return { ok: false, error: check.error };
  if (!sameList(object.changed_paths, [...object.changed_paths].sort())) {
    return { ok: false, error: "changed_paths must be sorted canonically" };
  }
  const granted = authorityScope(authority);
  if (!granted.ok) return { ok: false, error: granted.error };
  for (const path of object.changed_paths) {
    if (path.includes("\\") || isAbsolute(path) || posix.normalize(path) !== path
        || path === "." || path === ".." || path.startsWith("../")) {
      return { ok: false, error: `changed path ${JSON.stringify(path)} must be canonical and repository-relative` };
    }
    if (!isPathInScope(path, granted.scope, granted.exclusions)) {
      return { ok: false, error: `changed path ${JSON.stringify(path)} is outside the granted scope` };
    }
  }

  check = checkClosedObject(object.scope, [
    "writable_scope", "exclusions", "current_result", "cumulative_result", "evidence_refs",
  ], "candidate evidence scope");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.scope.writable_scope !== granted.scope || !sameList(object.scope.exclusions, granted.exclusions)) {
    return { ok: false, error: "candidate evidence scope and exclusions do not match the granted scope" };
  }
  for (const field of ["current_result", "cumulative_result"]) {
    if (!["PASS", "FAIL"].includes(object.scope[field])) {
      return { ok: false, error: `scope.${field} must be PASS or FAIL` };
    }
  }
  check = checkStringList(object.scope.evidence_refs, "scope.evidence_refs", { min: 1, unique: true });
  if (!check.ok) return { ok: false, error: check.error };

  check = checkClosedObject(object.objective_relevance,
    ["result", "rationale", "evidence_refs"], "candidate evidence objective_relevance");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.objective_relevance.result !== "PASS") {
    return { ok: false, error: "objective_relevance.result must be PASS" };
  }
  check = checkNonemptyString(object.objective_relevance.rationale, "objective_relevance.rationale");
  if (!check.ok) return { ok: false, error: check.error };
  check = checkStringList(object.objective_relevance.evidence_refs,
    "objective_relevance.evidence_refs", { min: 1, unique: true });
  if (!check.ok) return { ok: false, error: check.error };

  if (!Array.isArray(object.verification) || object.verification.length === 0) {
    return { ok: false, error: "verification must be a nonempty array" };
  }
  const verificationIds = [];
  for (const [index, item] of object.verification.entries()) {
    check = checkClosedObject(item, ["evidence_id", "command", "result", "output"], `verification[${index}]`);
    if (!check.ok) return { ok: false, error: check.error };
    for (const field of ["evidence_id", "command"]) {
      check = checkNonemptyString(item[field], `verification[${index}].${field}`);
      if (!check.ok) return { ok: false, error: check.error };
    }
    if (!COMMAND_RESULTS.includes(item.result)) {
      return { ok: false, error: `verification[${index}].result must be PASS|FAIL|NOT_RUN` };
    }
    if (typeof item.output !== "string") return { ok: false, error: `verification[${index}].output must be a string` };
    verificationIds.push(item.evidence_id);
  }
  if (new Set(verificationIds).size !== verificationIds.length) {
    return { ok: false, error: "verification evidence_id values must not repeat" };
  }

  check = checkClosedObject(object.post_commit,
    ["head_oid", "verification_evidence_ids"], "candidate evidence post_commit");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.post_commit.head_oid !== candidate.candidate.candidateOid) {
    return { ok: false, error: "post_commit.head_oid must equal the candidate oid" };
  }
  check = checkStringList(object.post_commit.verification_evidence_ids,
    "post_commit.verification_evidence_ids", { min: 1, unique: true });
  if (!check.ok) return { ok: false, error: check.error };
  if (!sameList(object.post_commit.verification_evidence_ids, verificationIds)) {
    return { ok: false, error: "post_commit must bind every verification evidence id in order" };
  }

  check = checkClosedObject(object.clean,
    ["evidence_id", "command", "result", "output"], "candidate evidence clean");
  if (!check.ok) return { ok: false, error: check.error };
  check = checkNonemptyString(object.clean.evidence_id, "clean.evidence_id");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.clean.command !== "git status --porcelain=v1 --untracked-files=all") {
    return { ok: false, error: "clean.command must be exactly git status --porcelain=v1 --untracked-files=all" };
  }
  if (!["PASS", "FAIL"].includes(object.clean.result)) {
    return { ok: false, error: "clean.result must be PASS or FAIL" };
  }
  if (typeof object.clean.output !== "string") return { ok: false, error: "clean.output must be a string" };
  for (const field of ["residual_risks", "unfinished_dependencies"]) {
    check = checkStringList(object[field], field);
    if (!check.ok) return { ok: false, error: check.error };
  }
  return { ok: true, evidence: object };
}

export function parseCandidateEvidence(text, authority) {
  return parseV1Block(
    text, CANDIDATE_EVIDENCE_BEGIN, "candidate evidence", "evidence",
    (object) => validateCandidateEvidenceShape(object, authority),
  );
}

const REVIEW_FIELDS = [
  "version", "review_result_id", "reviewer_id", "reviewer_assignment_id",
  "candidate_ref", "mandate", "commands", "evidence", "coverage", "gaps",
  "outcome", "findings", "correction_of", "correction_classifications",
];

function validateReviewShape(object) {
  let check = checkClosedObject(object, REVIEW_FIELDS, "review");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.version !== 1) return { ok: false, error: "review version must be exactly 1" };
  for (const field of ["review_result_id", "reviewer_id", "reviewer_assignment_id"]) {
    check = checkNonemptyString(object[field], field);
    if (!check.ok) return { ok: false, error: check.error };
  }
  const candidate = parseCandidateRef(object.candidate_ref);
  if (!candidate.ok) return { ok: false, error: `review ${candidate.error}` };
  if (object.mandate !== "NEUTRAL_FALSIFICATION") {
    return { ok: false, error: "review mandate must be exactly NEUTRAL_FALSIFICATION" };
  }
  if (!Array.isArray(object.commands) || object.commands.length === 0) {
    return { ok: false, error: "review commands must be a nonempty array" };
  }
  for (const [index, command] of object.commands.entries()) {
    check = checkClosedObject(command, ["command", "result", "output_ref"], `review commands[${index}]`);
    if (!check.ok) return { ok: false, error: check.error };
    for (const field of ["command", "output_ref"]) {
      check = checkNonemptyString(command[field], `review commands[${index}].${field}`);
      if (!check.ok) return { ok: false, error: check.error };
    }
    if (!COMMAND_RESULTS.includes(command.result)) {
      return { ok: false, error: `review commands[${index}].result must be PASS|FAIL|NOT_RUN` };
    }
  }
  const mins = { evidence: 1, coverage: 1, gaps: 0 };
  for (const [field, min] of Object.entries(mins)) {
    check = checkStringList(object[field], field, { min });
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (!["APPROVE", "FINDINGS"].includes(object.outcome)) {
    return { ok: false, error: "review outcome must be exactly APPROVE or FINDINGS" };
  }
  if (!Array.isArray(object.findings)) return { ok: false, error: "review findings must be an array" };
  const findingIds = [];
  for (const [index, finding] of object.findings.entries()) {
    check = checkClosedObject(finding,
      ["finding_id", "severity", "statement", "impact", "evidence", "scope"], `finding[${index}]`);
    if (!check.ok) return { ok: false, error: check.error };
    for (const field of ["finding_id", "statement", "impact", "scope"]) {
      check = checkNonemptyString(finding[field], `finding[${index}].${field}`);
      if (!check.ok) return { ok: false, error: check.error };
    }
    if (!["BLOCKER", "NON_BLOCKING"].includes(finding.severity)) {
      return { ok: false, error: `finding[${index}].severity must be BLOCKER or NON_BLOCKING` };
    }
    check = checkStringList(finding.evidence, `finding[${index}].evidence`, { min: 1 });
    if (!check.ok) return { ok: false, error: check.error };
    findingIds.push(finding.finding_id);
  }
  if (new Set(findingIds).size !== findingIds.length) {
    return { ok: false, error: "finding_id values must be stable and unique within a review" };
  }
  if (object.outcome === "APPROVE" && object.findings.length !== 0) {
    return { ok: false, error: "APPROVE requires an empty findings array" };
  }
  if (object.outcome === "FINDINGS" && object.findings.length === 0) {
    return { ok: false, error: "FINDINGS requires at least one finding" };
  }

  const correction = Object.prototype.hasOwnProperty.call(object, "correction_of");
  const classifications = Object.prototype.hasOwnProperty.call(object, "correction_classifications");
  if (correction !== classifications) {
    return { ok: false, error: "correction reviews require both correction_of and correction_classifications" };
  }
  if (correction) {
    check = checkNonemptyString(object.correction_of, "correction_of");
    if (!check.ok) return { ok: false, error: check.error };
    if (!Array.isArray(object.correction_classifications) || object.correction_classifications.length === 0) {
      return { ok: false, error: "correction_classifications must be a nonempty array on a correction review" };
    }
    const classified = [];
    for (const [index, classification] of object.correction_classifications.entries()) {
      check = checkClosedObject(classification,
        ["finding_id", "classification", "evidence"], `correction_classifications[${index}]`);
      if (!check.ok) return { ok: false, error: check.error };
      for (const field of ["finding_id", "evidence"]) {
        check = checkNonemptyString(classification[field], `correction_classifications[${index}].${field}`);
        if (!check.ok) return { ok: false, error: check.error };
      }
      if (!["resolved", "open", "obsolete"].includes(classification.classification)) {
        return { ok: false, error: `correction_classifications[${index}].classification must be resolved|open|obsolete` };
      }
      classified.push(classification.finding_id);
    }
    if (new Set(classified).size !== classified.length) {
      return { ok: false, error: "correction classification finding ids must not repeat" };
    }
  }
  return { ok: true, review: object };
}

export function parseReview(text) {
  return parseV1Block(text, REVIEW_BEGIN, "review", "review", validateReviewShape);
}

export function reviewValidForCandidate(review, candidateId) {
  return validateReviewShape(review).ok
    && parseCandidateRef(candidateId).ok
    && review.candidate_ref === candidateId;
}

const VERDICT_FIELDS = [
  "version", "verdict_id", "project_id", "task_id", "task_revision",
  "assignment_id", "repository_root", "workspace_id", "workspace_protocol_digest",
  "candidate_ref", "origin", "scope_result", "scope_evidence", "verification",
  "review", "unfinished_dependencies", "residual_risks", "human_decisions",
  "verdict", "rationale",
];

// Computes rather than trusts the declared enum. Missing/failed technical
// evidence always wins; only an otherwise-ready document can need a Human;
// READY is the remainder. The enum itself is never acceptance.
export function verdictStatus(document) {
  if (!isRecord(document)) return "NOT_READY";
  const candidate = parseCandidateRef(document.candidate_ref);
  const review = document.review;
  const technicalFailure = !candidate.ok
    || !isRecord(document.origin)
    || checkNonemptyString(document.origin.evidence_id, "origin.evidence_id").ok === false
    || document.scope_result !== "PASS"
    || !Array.isArray(document.scope_evidence)
    || document.scope_evidence.length === 0
    || document.scope_evidence.some((item) => typeof item !== "string" || item.trim() === "")
    || !Array.isArray(document.verification)
    || document.verification.length === 0
    || document.verification.some((item) => !isRecord(item)
      || checkNonemptyString(item.command, "verification.command").ok === false
      || item.result !== "PASS"
      || checkNonemptyString(item.output_ref, "verification.output_ref").ok === false)
    || !Array.isArray(document.unfinished_dependencies)
    || document.unfinished_dependencies.length !== 0
    || !isRecord(review)
    || (review?.required === true
      ? checkNonemptyString(review.review_result_id, "review_result_id").ok === false
        || review.candidate_ref !== document.candidate_ref
        || review.outcome !== "APPROVE"
        || !Array.isArray(review.open_findings)
        || review.open_findings.length !== 0
      : review?.required !== false
        || review.review_result_id !== null
        || review.candidate_ref !== null
        || review.outcome !== "NOT_REQUIRED"
        || !Array.isArray(review.open_findings)
        || review.open_findings.length !== 0);
  if (technicalFailure) return "NOT_READY";
  if (!Array.isArray(document.human_decisions)
      || document.human_decisions.some((decision) => !isRecord(decision)
        || !["RESOLVED", "UNRESOLVED"].includes(decision.status))) {
    return "NOT_READY";
  }
  if (document.human_decisions.some((decision) => decision.status === "UNRESOLVED")) return "NEEDS_HUMAN";
  return "READY";
}

function validateVerdictShape(object) {
  let check = checkClosedObject(object, VERDICT_FIELDS, "verdict");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.version !== 1) return { ok: false, error: "verdict version must be exactly 1" };
  for (const field of [
    "verdict_id", "project_id", "task_id", "task_revision", "repository_root",
    "workspace_id", "rationale",
  ]) {
    check = checkNonemptyString(object[field], field);
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (object.assignment_id !== null) {
    check = checkNonemptyString(object.assignment_id, "assignment_id");
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (typeof object.workspace_protocol_digest !== "string" || !SHA256_HEX.test(object.workspace_protocol_digest)) {
    return { ok: false, error: "workspace_protocol_digest must be a full sha256 hex digest" };
  }
  const candidate = parseCandidateRef(object.candidate_ref);
  if (!candidate.ok) return { ok: false, error: `verdict ${candidate.error}` };

  check = checkClosedObject(object.origin, ["kind", "evidence_id"], "verdict origin");
  if (!check.ok) return { ok: false, error: check.error };
  if (!["PEER_HANDOFF", "LEAD_TINY"].includes(object.origin.kind)) {
    return { ok: false, error: "origin.kind must be PEER_HANDOFF or LEAD_TINY" };
  }
  check = checkNonemptyString(object.origin.evidence_id, "origin.evidence_id");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.origin.kind === "PEER_HANDOFF" && object.assignment_id === null) {
    return { ok: false, error: "PEER_HANDOFF verdict requires a non-null assignment_id" };
  }
  if (object.origin.kind === "LEAD_TINY" && object.assignment_id !== null) {
    return { ok: false, error: "LEAD_TINY verdict requires assignment_id null" };
  }
  if (!["PASS", "FAIL"].includes(object.scope_result)) {
    return { ok: false, error: "scope_result must be PASS or FAIL" };
  }
  check = checkStringList(object.scope_evidence, "scope_evidence", { unique: true });
  if (!check.ok) return { ok: false, error: check.error };

  if (!Array.isArray(object.verification)) return { ok: false, error: "verdict verification must be an array" };
  for (const [index, item] of object.verification.entries()) {
    check = checkClosedObject(item, ["command", "result", "output_ref"], `verdict verification[${index}]`);
    if (!check.ok) return { ok: false, error: check.error };
    for (const field of ["command", "output_ref"]) {
      check = checkNonemptyString(item[field], `verdict verification[${index}].${field}`);
      if (!check.ok) return { ok: false, error: check.error };
    }
    if (!COMMAND_RESULTS.includes(item.result)) {
      return { ok: false, error: `verdict verification[${index}].result must be PASS|FAIL|NOT_RUN` };
    }
  }

  check = checkClosedObject(object.review,
    ["required", "review_result_id", "candidate_ref", "outcome", "open_findings"], "verdict review");
  if (!check.ok) return { ok: false, error: check.error };
  if (typeof object.review.required !== "boolean") return { ok: false, error: "review.required must be a boolean" };
  check = checkStringList(object.review.open_findings, "review.open_findings", { unique: true });
  if (!check.ok) return { ok: false, error: check.error };
  if (object.review.required) {
    check = checkNonemptyString(object.review.review_result_id, "review.review_result_id");
    if (!check.ok) return { ok: false, error: check.error };
    const reviewCandidate = parseCandidateRef(object.review.candidate_ref);
    if (!reviewCandidate.ok) return { ok: false, error: `verdict review ${reviewCandidate.error}` };
    if (!["APPROVE", "FINDINGS"].includes(object.review.outcome)) {
      return { ok: false, error: "required review outcome must be APPROVE or FINDINGS" };
    }
  } else if (object.review.review_result_id !== null || object.review.candidate_ref !== null
      || object.review.outcome !== "NOT_REQUIRED" || object.review.open_findings.length !== 0) {
    return { ok: false, error: "non-required review must be exactly null/null/NOT_REQUIRED with no open findings" };
  }

  for (const field of ["unfinished_dependencies", "residual_risks"]) {
    check = checkStringList(object[field], field);
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (!Array.isArray(object.human_decisions)) return { ok: false, error: "human_decisions must be an array" };
  const decisionIds = [];
  for (const [index, decision] of object.human_decisions.entries()) {
    check = checkClosedObject(decision,
      ["decision_id", "status", "evidence_ref"], `human_decisions[${index}]`);
    if (!check.ok) return { ok: false, error: check.error };
    for (const field of ["decision_id", "evidence_ref"]) {
      check = checkNonemptyString(decision[field], `human_decisions[${index}].${field}`);
      if (!check.ok) return { ok: false, error: check.error };
    }
    if (!["RESOLVED", "UNRESOLVED"].includes(decision.status)) {
      return { ok: false, error: `human_decisions[${index}].status must be RESOLVED or UNRESOLVED` };
    }
    decisionIds.push(decision.decision_id);
  }
  if (new Set(decisionIds).size !== decisionIds.length) {
    return { ok: false, error: "human decision ids must not repeat" };
  }
  if (!["NOT_READY", "NEEDS_HUMAN", "READY"].includes(object.verdict)) {
    return { ok: false, error: "verdict must be NOT_READY|NEEDS_HUMAN|READY" };
  }
  const computed = verdictStatus(object);
  if (object.verdict !== computed) {
    return { ok: false, error: `declared verdict ${object.verdict} violates precedence; computed verdict is ${computed}` };
  }
  return { ok: true, verdict: object };
}

export function parseVerdict(text) {
  return parseV1Block(text, VERDICT_BEGIN, "verdict", "verdict", validateVerdictShape);
}

function validateAcceptanceShape(object) {
  let check = checkClosedObject(object,
    ["version", "decision", "candidate_ref", "project_verdict_id"], "local acceptance");
  if (!check.ok) return { ok: false, error: check.error };
  if (object.version !== 1) return { ok: false, error: "local acceptance version must be exactly 1" };
  if (object.decision !== "LOCAL_ACCEPT") {
    return { ok: false, error: "local acceptance decision must be exactly LOCAL_ACCEPT" };
  }
  const candidate = parseCandidateRef(object.candidate_ref);
  if (!candidate.ok) return { ok: false, error: `local acceptance ${candidate.error}` };
  check = checkNonemptyString(object.project_verdict_id, "project_verdict_id");
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, acceptance: object };
}

// `source` is mandatory: only Pi's direct interactive Human route is accepted.
// A private non-enumerable mark lets full revalidation require this parser
// without adding a route field to the closed acceptance document.
export function parseAcceptance(text, source) {
  const parsed = parseV1Block(
    text, ACCEPTANCE_BEGIN, "local acceptance", "acceptance", validateAcceptanceShape,
  );
  if (!parsed.ok || parsed.acceptance === null) return parsed;
  if (source !== "interactive") {
    return { ok: false, error: "local acceptance requires the direct Human interactive route" };
  }
  Object.defineProperty(parsed.acceptance, DIRECT_ACCEPTANCE, { value: true });
  return parsed;
}

function acceptanceAuthority(authority) {
  if (!isRecord(authority) || !isRecord(authority.envelope)) {
    return { ok: false, error: "acceptance requires the validated candidate authority" };
  }
  const envelope = validateEnvelopeShape(authority.envelope);
  if (!envelope.ok) return { ok: false, error: `candidate authority invalid: ${envelope.error}` };
  const grant = envelope.envelope;
  if (!["peer", "lead_tiny"].includes(grant.grant_kind)) {
    return { ok: false, error: "acceptance authority must be a peer or lead_tiny candidate grant" };
  }
  if (!grant.capabilities.includes("local_commit")) {
    return { ok: false, error: "candidate authority must include local_commit" };
  }
  for (const [field, value] of [
    ["taskRevision", authority.taskRevision],
    ["workspaceId", authority.workspaceId],
  ]) {
    const check = checkNonemptyString(value, `authority.${field}`);
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (typeof authority.reviewRequired !== "boolean") {
    return { ok: false, error: "authority.reviewRequired must be a boolean" };
  }
  if (grant.grant_kind === "peer") {
    for (const field of ["assignmentId", "parentId"]) {
      const check = checkNonemptyString(authority[field], `authority.${field}`);
      if (!check.ok) return { ok: false, error: check.error };
    }
  } else if (authority.assignmentId !== null || authority.parentId !== null) {
    return { ok: false, error: "lead_tiny authority requires null assignmentId and parentId" };
  }
  for (const [field, value] of [["task_id", grant.task_id], ["agent_id", grant.agent_id]]) {
    const check = checkNonemptyString(value, `authority envelope ${field}`);
    if (!check.ok) return { ok: false, error: check.error };
  }
  const scope = authorityScope(authority);
  if (!scope.ok) return { ok: false, error: scope.error };
  return { ok: true, grant, scope: scope.scope, exclusions: scope.exclusions };
}

function mismatch(label, actual, expected) {
  return actual === expected
    ? null
    : { ok: false, error: `${label} ${JSON.stringify(actual)} does not match ${JSON.stringify(expected)}` };
}

// The sole acceptance gate. It revalidates all closed documents, the pinned
// protocol, exact context and evidence references, then current Git objects,
// HEAD, cumulative/current scope, canonical diff, and porcelain cleanliness.
// Success is only {ok:true}; there is deliberately no write or stored state.
export async function validateAcceptance(options = {}) {
  const acceptance = options["acceptance"];
  const verdict = options["verdict"];
  const review = options["review"];
  const evidence = options["evidence"];
  const authority = options["authority"];
  const repoRoot = options["repoRoot"];
  const protocolPin = options["protocolPin"];
  if (!isRecord(acceptance) || acceptance[DIRECT_ACCEPTANCE] !== true) {
    return { ok: false, error: "acceptance must be a valid block parsed from the direct Human interactive route" };
  }
  let check = validateAcceptanceShape(acceptance);
  if (!check.ok) return { ok: false, error: check.error };
  const auth = acceptanceAuthority(authority);
  if (!auth.ok) return { ok: false, error: auth.error };
  const evidenceCheck = validateCandidateEvidenceShape(evidence, authority);
  if (!evidenceCheck.ok) return { ok: false, error: `candidate evidence invalid: ${evidenceCheck.error}` };
  const verdictCheck = validateVerdictShape(verdict);
  if (!verdictCheck.ok) return { ok: false, error: `verdict invalid: ${verdictCheck.error}` };

  if (typeof repoRoot !== "string" || repoRoot.trim() === "") {
    return { ok: false, error: "acceptance requires the exact repository root" };
  }
  if (!isRecord(protocolPin) || protocolPin.repoRoot !== repoRoot
      || typeof protocolPin.projectId !== "string" || protocolPin.projectId.trim() === ""
      || typeof protocolPin.version !== "number"
      || typeof protocolPin.digest !== "string" || !SHA256_HEX.test(protocolPin.digest)) {
    return { ok: false, error: "acceptance requires a complete exact Workspace Protocol pin" };
  }
  const currentProtocol = await readAndValidateProtocol(repoRoot);
  if (!currentProtocol.ok) return { ok: false, error: `workspace protocol revalidation failed: ${currentProtocol.error}` };
  if (currentProtocol.protocol.digest !== protocolPin.digest
      || currentProtocol.protocol.meta.project_id !== protocolPin.projectId
      || currentProtocol.protocol.meta.version !== protocolPin.version) {
    return { ok: false, error: "current Workspace Protocol does not match the acceptance protocol pin" };
  }

  const expectedContext = [
    ["candidate evidence project_id", evidence.project_id, protocolPin.projectId],
    ["verdict project_id", verdict.project_id, protocolPin.projectId],
    ["candidate evidence task_id", evidence.task_id, auth.grant.task_id],
    ["verdict task_id", verdict.task_id, auth.grant.task_id],
    ["candidate evidence task_revision", evidence.task_revision, authority.taskRevision],
    ["verdict task_revision", verdict.task_revision, authority.taskRevision],
    ["candidate evidence assignment_id", evidence.assignment_id, authority.assignmentId],
    ["verdict assignment_id", verdict.assignment_id, authority.assignmentId],
    ["candidate evidence repository_root", evidence.repository_root, repoRoot],
    ["verdict repository_root", verdict.repository_root, repoRoot],
    ["candidate evidence workspace_id", evidence.workspace_id, authority.workspaceId],
    ["verdict workspace_id", verdict.workspace_id, authority.workspaceId],
    ["candidate evidence protocol digest", evidence.workspace_protocol_digest, protocolPin.digest],
    ["verdict protocol digest", verdict.workspace_protocol_digest, protocolPin.digest],
    ["candidate evidence writer_id", evidence.writer_id, auth.grant.agent_id],
    ["candidate evidence parent_id", evidence.parent_id, authority.parentId],
  ];
  for (const [label, actual, expected] of expectedContext) {
    const failed = mismatch(label, actual, expected);
    if (failed) return { ok: false, error: failed.error };
  }

  if (acceptance.candidate_ref !== evidence.candidate_ref
      || verdict.candidate_ref !== evidence.candidate_ref) {
    return { ok: false, error: "acceptance, evidence, and verdict must bind the exact same candidate" };
  }
  if (acceptance.project_verdict_id !== verdict.verdict_id) {
    return { ok: false, error: "local acceptance project_verdict_id does not match the immutable verdict id" };
  }
  if (verdict.origin.evidence_id !== evidence.evidence_id) {
    return { ok: false, error: "verdict origin does not reference the candidate evidence id" };
  }
  const expectedOrigin = auth.grant.grant_kind === "peer" ? "PEER_HANDOFF" : "LEAD_TINY";
  if (verdict.origin.kind !== expectedOrigin) {
    return { ok: false, error: `verdict origin must be ${expectedOrigin} for this authority` };
  }
  if (verdict.verdict !== "READY" || verdictStatus(verdict) !== "READY") {
    return { ok: false, error: "Local Acceptance requires a READY verdict after precedence revalidation" };
  }

  if (evidence.scope.current_result !== "PASS" || evidence.scope.cumulative_result !== "PASS") {
    return { ok: false, error: "candidate evidence current and cumulative scope results must both PASS" };
  }
  if (evidence.verification.some((item) => item.result !== "PASS")) {
    return { ok: false, error: "every candidate verification result must PASS" };
  }
  if (evidence.clean.result !== "PASS" || evidence.clean.output !== "") {
    return { ok: false, error: "candidate evidence clean check must PASS with empty porcelain output" };
  }
  if (evidence.unfinished_dependencies.length !== 0) {
    return { ok: false, error: "candidate evidence has unfinished dependencies" };
  }
  if (!sameList(verdict.unfinished_dependencies, evidence.unfinished_dependencies)
      || !sameList(verdict.residual_risks, evidence.residual_risks)) {
    return { ok: false, error: "verdict dependencies and residual risks must match candidate evidence" };
  }

  const scopeRefs = [evidence.cumulative_diff.evidence_id, ...evidence.scope.evidence_refs].sort();
  if (!sameList([...verdict.scope_evidence].sort(), scopeRefs)) {
    return { ok: false, error: "verdict scope evidence references do not exactly bind candidate evidence" };
  }
  if (verdict.verification.length !== evidence.verification.length) {
    return { ok: false, error: "verdict verification references do not cover every candidate verification" };
  }
  for (const item of verdict.verification) {
    const source = evidence.verification.find((entry) => entry.evidence_id === item.output_ref);
    if (!source || source.command !== item.command || source.result !== item.result) {
      return { ok: false, error: `verdict verification reference ${JSON.stringify(item.output_ref)} does not bind matching candidate evidence` };
    }
  }

  if (verdict.review.required !== authority.reviewRequired) {
    return { ok: false, error: "verdict review requirement does not match the protocol/class authority fact" };
  }
  if (authority.reviewRequired) {
    const reviewCheck = validateReviewShape(review);
    if (!reviewCheck.ok) return { ok: false, error: `required review invalid: ${reviewCheck.error}` };
    if (!reviewValidForCandidate(review, evidence.candidate_ref)) {
      return { ok: false, error: "required review is stale for the current candidate" };
    }
    if (review.reviewer_id === evidence.writer_id
        || review.reviewer_assignment_id === authority.assignmentId) {
      return { ok: false, error: "required review is not independent from the candidate writer/assignment" };
    }
    if (review.correction_classifications?.some((item) => item.classification === "open")) {
      return { ok: false, error: "required correction review still has an open finding" };
    }
    if (verdict.review.review_result_id !== review.review_result_id
        || verdict.review.candidate_ref !== review.candidate_ref
        || verdict.review.outcome !== review.outcome
        || !sameList(verdict.review.open_findings, review.findings.map((finding) => finding.finding_id))) {
      return { ok: false, error: "verdict review state does not exactly bind the required review" };
    }
  } else if (review !== null && review !== undefined) {
    return { ok: false, error: "no review document is valid when the protocol/class says review is not required" };
  }

  const facts = await candidateGitFacts({
    candidateRef: evidence.candidate_ref,
    repoRoot,
    grantedBase: auth.grant.base,
    scope: auth.scope,
    exclusions: auth.exclusions,
  });
  if (!facts.ok) return { ok: false, error: facts.error };
  if (!sameList(evidence.changed_paths, facts.cumulativePaths)) {
    return { ok: false, error: "candidate evidence changed_paths do not match the current cumulative Git diff" };
  }
  if (evidence.cumulative_diff.diff !== facts.diff) {
    return { ok: false, error: "candidate evidence cumulative_diff does not match the exact Git objects" };
  }
  return { ok: true };
}

// ─── Workspace Protocol ──────────────────────────────────────────────────────

// One canonical repository-wide protocol at the repository root; v0.1 has no
// overlays. This slice is read/validate/pin/guard only: workflow consumption
// of the protocol (classification, routing) is a later slice. The protocol can
// narrow workflow, but it cannot grant a Capability or override the Role
// Profile / Task Authority Envelope — the pin is advisory-only for authority
// and checkToolCall never consults it.

// Required core section headings, normalized (lowercase, whitespace-collapsed).
// Optional sections are limited to the closed set below; their presence grants
// no capability.
const REQUIRED_CORE_SECTIONS = [
  "decision matrix",
  "task classes and routing",
  "ownership and isolation",
  "candidate, verification, review, and acceptance",
  "reopen, dependency, and blocked handling",
  "evolution",
];
const OPTIONAL_PROTOCOL_SECTIONS = new Set([
  "project criticality",
  "review and council rules",
  "review and council",
  "anti-patterns",
  "supervisor hints",
]);

export function protocolPath(repoRoot) {
  return join(repoRoot, ".orchestration", "workspace-protocol.md");
}

// Line-based YAML frontmatter subset — no parser framework: the protocol is
// markdown with a small `key: value` header, so a closed line reader is
// enough. Rejects missing, malformed, duplicate, and non-canonical metadata
// with the exact reason.
function parseFrontmatter(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines[0] !== "---") {
    return { ok: false, error: "protocol must start with a --- frontmatter block" };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { ok: false, error: "protocol frontmatter has no closing --- line" };
  const meta = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) {
      return { ok: false, error: `malformed frontmatter line ${i + 1}: expected "key: value"` };
    }
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    if (key === "") return { ok: false, error: `malformed frontmatter line ${i + 1}: empty key` };
    if (Object.prototype.hasOwnProperty.call(meta, key)) {
      return { ok: false, error: `duplicate metadata key ${JSON.stringify(key)}` };
    }
    const quoted =
      raw.length >= 2 &&
      ((raw[0] === '"' && raw[raw.length - 1] === '"') || (raw[0] === "'" && raw[raw.length - 1] === "'"));
    meta[key] = quoted ? raw.slice(1, -1) : raw;
  }
  const required = ["status", "version", "last_reviewed", "project_id", "repository_root"];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(meta, key)) {
      return { ok: false, error: `metadata ${key} is missing` };
    }
  }
  const extra = Object.keys(meta).find((key) => !required.includes(key));
  if (extra !== undefined) return { ok: false, error: `unknown metadata key ${JSON.stringify(extra)}` };
  if (meta["status"] === "") return { ok: false, error: "metadata status must be a nonempty string" };
  if (!/^\d+$/.test(meta["version"]) || !Number.isSafeInteger(Number(meta["version"])) || Number(meta["version"]) < 1) {
    return { ok: false, error: "metadata version must be a positive integer" };
  }
  // Real calendar check: Date.parse rolls over (2025-02-30 → Mar 2), so the
  // parsed components must round-trip exactly.
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(meta["last_reviewed"]);
  const dateValid =
    dateMatch !== null &&
    (() => {
      const date = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
      return (
        date.getUTCFullYear() === Number(dateMatch[1]) &&
        date.getUTCMonth() === Number(dateMatch[2]) - 1 &&
        date.getUTCDate() === Number(dateMatch[3])
      );
    })();
  if (!dateValid) {
    return { ok: false, error: "metadata last_reviewed must be a YYYY-MM-DD date" };
  }
  if (meta["project_id"] === "") return { ok: false, error: "metadata project_id must be a nonempty string" };
  if (meta["repository_root"] !== ".") {
    return { ok: false, error: 'metadata repository_root must be "." (repository-root applicability)' };
  }
  return { ok: true, meta, bodyStart: end + 1 };
}

function normalizedHeading(line) {
  const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
  return match === null ? null : match[1].toLowerCase().replace(/\s+/g, " ").trim();
}

// Required core sections per the spec; a missing section fails closed with its
// exact normalized name. The decision matrix must include must-ask boundaries.
function checkCoreSections(text, bodyStart) {
  const lines = String(text).split(/\r?\n/);
  const bodies = new Map();
  let current = null;
  for (let i = bodyStart; i < lines.length; i++) {
    const heading = normalizedHeading(lines[i]);
    if (heading !== null) {
      if (/^#\s+/.test(lines[i])) continue;
      if (bodies.has(heading)) {
        return { ok: false, error: `duplicate protocol section ${JSON.stringify(heading)}` };
      }
      current = heading;
      bodies.set(heading, []);
    } else if (current !== null) {
      bodies.get(current).push(lines[i]);
    }
  }
  for (const required of REQUIRED_CORE_SECTIONS) {
    if (!bodies.has(required)) {
      return { ok: false, error: `missing required core section "${required}"` };
    }
    if (bodies.get(required).join("\n").trim() === "") {
      return { ok: false, error: `required protocol section "${required}" must be nonempty` };
    }
  }
  for (const heading of bodies.keys()) {
    if (heading === "workspace protocol" || REQUIRED_CORE_SECTIONS.includes(heading) || OPTIONAL_PROTOCOL_SECTIONS.has(heading)) continue;
    return { ok: false, error: `unknown protocol section ${JSON.stringify(heading)}` };
  }
  const matrix = (bodies.get("decision matrix") ?? []).join("\n");
  if (!/must-ask|must_ask/i.test(matrix)) {
    return { ok: false, error: "the decision matrix core section must include must-ask boundaries" };
  }
  const routing = (bodies.get("task classes and routing") ?? []).join("\n");
  if (!/(?:tiny\/bounded|cross-module\/lifecycle|architecture-sensitive)/i.test(routing)) {
    return { ok: false, error: "task classes and routing must name tiny/bounded, cross-module/lifecycle, and architecture-sensitive classes" };
  }
  return { ok: true, allowsLeadTiny: /lead self-work\s+(?:is\s+)?(?:allowed|permitted)/i.test(routing) };
}

// Validates protocol text: nonempty, frontmatter metadata, required core
// sections. Returns { ok: true, meta, digest } or { ok: false, error }; digest
// is the canonical sha256 of the raw bytes (utf8 of the text).
export function validateProtocol(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, error: "workspace protocol must be nonempty" };
  }
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter.ok) return { ok: false, error: frontmatter.error };
  const sections = checkCoreSections(text, frontmatter.bodyStart);
  if (!sections.ok) return { ok: false, error: sections.error };
  return {
    ok: true,
    meta: {
      status: frontmatter.meta["status"],
      version: Number(frontmatter.meta["version"]),
      last_reviewed: frontmatter.meta["last_reviewed"],
      project_id: frontmatter.meta["project_id"],
      repository_root: frontmatter.meta["repository_root"],
    },
    digest: createHash("sha256").update(text).digest("hex"),
    allowsLeadTiny: sections.allowsLeadTiny,
  };
}

// Reads and validates the canonical protocol file. The digest is computed over
// the raw file bytes; missing, empty, malformed, and core-incomplete files
// fail closed with the exact reason.
export async function readAndValidateProtocol(repoRoot) {
  const path = protocolPath(repoRoot);
  let buffer;
  try {
    buffer = await readFile(path);
  } catch (err) {
    if (err.code === "ENOENT") {
      return { ok: false, error: `workspace protocol file is missing at ${path}` };
    }
    return { ok: false, error: `workspace protocol read failed: ${err.message}` };
  }
  if (buffer.length === 0) {
    return { ok: false, error: "workspace protocol file must be nonempty" };
  }
  const digest = createHash("sha256").update(buffer).digest("hex");
  const check = validateProtocol(buffer.toString("utf8"));
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, protocol: { repoRoot, path, digest, meta: check.meta, allowsLeadTiny: check.allowsLeadTiny } };
}

// Protocol pin (process-latched like the role latch): the Lead pins
// { repoRoot, version, projectId, digest } on first successful read+validate,
// and every later gate (input / before_agent_start / tool_call) re-reads,
// re-validates, and compares. Drift or identity mismatch blocks permanently;
// the pin is per repoRoot and re-pins when the resolved root changes. Peer and
// Supervisor roles never pin: the protocol is advisory-only for authority, so
// authority checks never consult it.
async function ensureProtocolPin() {
  if (latch === null || latch.role !== "lead") return { ok: true };
  const repoRoot = await findRepoRoot();
  if (repoRoot === null) {
    return { ok: false, error: "no git repository root is observable for workspace protocol pinning" };
  }
  if (protocolPin === null || protocolPin.repoRoot !== repoRoot) {
    const read = await readAndValidateProtocol(repoRoot);
    if (!read.ok) return { ok: false, error: read.error };
    protocolPin = {
      repoRoot,
      version: read.protocol.meta.version,
      projectId: read.protocol.meta.project_id,
      digest: read.protocol.digest,
      allowsLeadTiny: read.protocol.allowsLeadTiny,
    };
    return { ok: true };
  }
  const read = await readAndValidateProtocol(repoRoot);
  if (!read.ok) return { ok: false, error: read.error };
  if (read.protocol.meta.project_id !== protocolPin.projectId) {
    return { ok: false, error: "workspace protocol project identity changed from the pinned project_id; a fresh process is required" };
  }
  if (read.protocol.meta.version !== protocolPin.version) {
    return { ok: false, error: "workspace protocol version changed from the pinned version; a fresh process is required" };
  }
  if (read.protocol.digest !== protocolPin.digest) {
    return { ok: false, error: "workspace protocol bytes drifted from the pinned digest; a fresh process is required" };
  }
  if (read.protocol.allowsLeadTiny !== protocolPin.allowsLeadTiny) {
    return { ok: false, error: "workspace protocol Lead self-work allowance drifted; a fresh process is required" };
  }
  return { ok: true };
}

// Route binding: the direct Human task message is the only authority route
// for Peer grants. tiny Lead and Supervisor recovery grants are issued only
// by their idle governed slash-command flows (route "command"); an envelope of
// those kinds pasted into a direct message has no route and grants nothing.
// supervisor_recovery binds a supervisor process but targets a Lead, so its
// role check applies on the command route only; on the direct route every
// non-peer kind is rejected by the route check below regardless of process.
async function activateEnvelope(envelope, route = "direct") {
  if (envelope.grant_kind === "supervisor_recovery") {
    if (route === "command" && latch.role !== "supervisor") {
      return { ok: false, error: "supervisor_recovery requires a supervisor process" };
    }
  } else if (envelope.role !== latch.role) {
    return { ok: false, error: `envelope role ${JSON.stringify(envelope.role)} does not match the ${latch.role} process` };
  }
  if (envelope.agent_id !== latch.agentId) {
    return { ok: false, error: `envelope agent_id ${JSON.stringify(envelope.agent_id)} does not match the latched Paseo agent ${JSON.stringify(latch.agentId)}` };
  }
  // lead_tiny binds the currently pinned protocol digest; a mismatch fails
  // closed whether the envelope arrived by command or by direct message.
  if (envelope.grant_kind === "lead_tiny") {
    if (protocolPin === null) {
      return { ok: false, error: "lead_tiny requires a pinned workspace protocol digest" };
    }
    if (envelope.protocol_digest !== protocolPin.digest) {
      return { ok: false, error: "protocol_digest does not match the pinned workspace protocol digest" };
    }
    if (!protocolPin.allowsLeadTiny) {
      return { ok: false, error: "workspace protocol does not allow Lead tiny self-work" };
    }
  }
  if (envelope.grant_kind !== "peer") {
    if (route !== "command") {
      return { ok: false, error: `grant_kind ${envelope.grant_kind} has no route in this slice for direct messages: it is issued only by its idle slash-command flow after Human confirmation` };
    }
  }
  if (envelope.grant_kind === "supervisor_recovery") {
    // Recovery grants carry no edit/commit capability and no writable scope.
    return { ok: true, authority: { envelope, repoRoot: null, scope: null, exclusions: [] } };
  }
  const repoRoot = await findRepoRoot();
  if (repoRoot === null) {
    return { ok: false, error: "no git repository root is observable for scope validation" };
  }
  const check = await validateScope(repoRoot, envelope.scope, envelope.exclusions);
  if (!check.ok) return { ok: false, error: check.error };
  return { ok: true, authority: { envelope, repoRoot, scope: check.scope, exclusions: check.exclusions } };
}

/**
 * Supervisor Notebook
 *
 * This is deliberately a small append-only file store.  The manifest and
 * entries are evidence, not a control plane: none of the helpers below touch
 * a repository, Paseo state, authority, or lifecycle state.
 */
export const NOTEBOOK_CONTRACT = "pi-paseo-supervisor-notebook";
export const NOTEBOOK_ENTRY_CONTRACT = "pi-paseo-supervisor-notebook-entry";
export const NOTEBOOK_CONTRACT_VERSION = "v1";
export const NOTEBOOK_STORAGE_VERSION = "v1";
export const NOTEBOOK_INIT_COMMAND = "ppo:notebook-init";
export const NOTEBOOK_APPEND_TOOL = "supervisor_notebook_append";

const NOTEBOOK_MANIFEST_FIELDS = [
  "contract", "contract_version", "manifest_schema", "notebook_id",
  "protocol_project_id", "paseo_project_id_at_creation",
  "repository_root_at_creation", "project_key", "created_at", "created_by",
  "creation_route", "manifest_digest",
];
const NOTEBOOK_CREATED_BY_FIELDS = ["supervisor_agent_id", "pi_session_id"];
const NOTEBOOK_ENTRY_FIELDS = [
  "contract", "schema_version", "entry_id", "notebook_id", "protocol_project_id",
  "recorded_at", "observed_at", "writer", "context", "observation", "evidence",
  "suspected_mechanism", "impact", "question", "recommendation", "escalation",
  "history", "sensitivity", "entry_digest",
];
const NOTEBOOK_WRITER_FIELDS = ["supervisor_agent_id", "pi_session_id"];
const NOTEBOOK_CONTEXT_FIELDS = [
  "paseo_project_id", "repository_root", "paseo_workspace_id", "lead_agent_id",
  "binding_source", "protocol_pin",
];
const NOTEBOOK_PROTOCOL_PIN_FIELDS = ["version", "digest"];
const NOTEBOOK_MECHANISM_FIELDS = ["hypothesis", "uncertainty", "confidence"];
const NOTEBOOK_ESCALATION_FIELDS = ["needed", "owner", "reason", "relay_target"];
const NOTEBOOK_HISTORY_FIELDS = ["relation", "references", "reason"];
const NOTEBOOK_REFERENCE_FIELDS = ["entry_id", "entry_digest"];
const NOTEBOOK_SENSITIVITY_FIELDS = ["redactions", "contains_secret"];
const NOTEBOOK_EVIDENCE_FIELDS = [
  "item_id", "observed_at", "kind", "source", "selected", "source_digest",
  "retained_digest", "redaction_notes", "truncated",
];
const NOTEBOOK_MAX_ID = 128;
const NOTEBOOK_MAX_PROJECT_ID = 512;
const NOTEBOOK_MAX_TEXT = 4000;
const NOTEBOOK_MAX_SOURCE = 512;
const NOTEBOOK_MAX_EVIDENCE = 64;
const NOTEBOOK_MAX_REDACTION_NOTES = 32;
const NOTEBOOK_DIGEST = /^sha256:[0-9a-f]{64}$/;
const NOTEBOOK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const NOTEBOOK_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function notebookStorageRoot(configRoot) {
  return join(configRoot, "pi-paseo-orchestration", "supervisor-notebooks", NOTEBOOK_STORAGE_VERSION);
}

export function deriveNotebookProjectKey(projectId) {
  if (typeof projectId !== "string" || projectId.length === 0 || projectId.length > NOTEBOOK_MAX_PROJECT_ID || projectId.includes("\0")) {
    throw new Error("protocol project_id must be a nonempty bounded UTF-8 string without NUL");
  }
  return createHash("sha256").update(Buffer.from(projectId, "utf8")).digest("hex").toLowerCase();
}

function notebookPaths(configRoot, projectId) {
  const root = notebookStorageRoot(configRoot);
  const key = deriveNotebookProjectKey(projectId);
  const projectRoot = join(root, "projects", key);
  return {
    configRoot,
    storageRoot: root,
    projectsRoot: join(root, "projects"),
    projectRoot,
    manifestPath: join(projectRoot, "manifest.json"),
    entriesRoot: join(projectRoot, "entries"),
    stagingRoot: join(root, ".staging"),
    projectKey: key,
  };
}

function canonicalNotebookValue(value) {
  if (Array.isArray(value)) return value.map(canonicalNotebookValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalNotebookValue(value[key])]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("canonical JSON cannot contain a non-finite number");
  if (value === undefined) throw new Error("canonical JSON cannot contain undefined");
  return value;
}

export function canonicalNotebookJson(value) {
  const text = JSON.stringify(canonicalNotebookValue(value));
  if (typeof text !== "string") throw new Error("canonical JSON value is not serializable");
  return text;
}

function notebookBytes(value) {
  return Buffer.from(`${canonicalNotebookJson(value)}\n`, "utf8");
}

function notebookDigest(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return `sha256:${createHash("sha256").update(Buffer.from(canonicalNotebookJson(copy), "utf8")).digest("hex")}`;
}

function rawDigest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function notebookClosed(value, fields, label) {
  if (!isRecord(value)) return { ok: false, error: `${label} must be a single object` };
  const extra = Object.keys(value).find((field) => !fields.includes(field));
  if (extra !== undefined) return { ok: false, error: `unknown field ${JSON.stringify(extra)} in ${label}` };
  return { ok: true };
}

function notebookText(value, label, max = NOTEBOOK_MAX_TEXT) {
  if (typeof value !== "string" || value.trim() === "") return { ok: false, error: `${label} must be a nonempty string` };
  if (value.length > max) return { ok: false, error: `${label} exceeds the ${max}-character bound` };
  if (value.includes("\0")) return { ok: false, error: `${label} must not contain NUL` };
  return { ok: true };
}

function notebookId(value, label) {
  if (typeof value !== "string" || !NOTEBOOK_ID.test(value) || value === "." || value === "..") {
    return { ok: false, error: `${label} must be one safe filename component` };
  }
  return { ok: true };
}

function notebookDigestField(value, label) {
  return NOTEBOOK_DIGEST.test(value)
    ? { ok: true }
    : { ok: false, error: `${label} must be a sha256:<64 lowercase hex> digest` };
}

function notebookTimestamp(value, label) {
  if (typeof value !== "string" || !NOTEBOOK_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    return { ok: false, error: `${label} must be an RFC3339 UTC timestamp with milliseconds` };
  }
  return { ok: true };
}

function notebookPathLocator(value, label, { allowUnknown = false } = {}) {
  if (allowUnknown && value === "unknown") return { ok: true };
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) {
    return { ok: false, error: `${label} must be a nonempty path locator` };
  }
  if (!isAbsolute(value)) return { ok: false, error: `${label} must be an absolute canonical path` };
  if (posix.normalize(value) !== value || (value.length > 1 && value.endsWith("/"))) {
    return { ok: false, error: `${label} must be canonical without traversal or normalization aliases` };
  }
  return { ok: true };
}

export function validateNotebookManifest(manifest, options = {}) {
  const rawText = options["rawText"];
  let check = notebookClosed(manifest, NOTEBOOK_MANIFEST_FIELDS, "notebook manifest");
  if (!check.ok) return { ok: false, error: check.error };
  for (const [field, expected] of [
    ["contract", NOTEBOOK_CONTRACT], ["contract_version", NOTEBOOK_CONTRACT_VERSION], ["manifest_schema", NOTEBOOK_CONTRACT_VERSION],
  ]) {
    if (manifest[field] !== expected) return { ok: false, error: `manifest.${field} must be exactly ${JSON.stringify(expected)}` };
  }
  for (const field of ["notebook_id"]) {
    check = notebookId(manifest[field], `manifest.${field}`);
    if (!check.ok) return { ok: false, error: check.error };
  }
  check = notebookText(manifest.protocol_project_id, "manifest.protocol_project_id", NOTEBOOK_MAX_PROJECT_ID);
  if (!check.ok) return { ok: false, error: check.error };
  try {
    if (deriveNotebookProjectKey(manifest.protocol_project_id) !== manifest.project_key) {
      return { ok: false, error: "manifest.project_key does not equal lowercase sha256(protocol_project_id UTF-8 bytes)" };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  check = notebookPathLocator(manifest.repository_root_at_creation, "manifest.repository_root_at_creation");
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookText(manifest.paseo_project_id_at_creation, "manifest.paseo_project_id_at_creation", 512);
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookTimestamp(manifest.created_at, "manifest.created_at");
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookClosed(manifest.created_by, NOTEBOOK_CREATED_BY_FIELDS, "manifest.created_by");
  if (!check.ok) return { ok: false, error: check.error };
  for (const field of NOTEBOOK_CREATED_BY_FIELDS) {
    check = notebookText(manifest.created_by[field], `manifest.created_by.${field}`, 512);
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (manifest.creation_route !== "human_confirmed") {
    return { ok: false, error: "manifest.creation_route must be exactly human_confirmed" };
  }
  check = notebookDigestField(manifest.manifest_digest, "manifest.manifest_digest");
  if (!check.ok) return { ok: false, error: check.error };
  if (manifest.manifest_digest !== notebookDigest(manifest, "manifest_digest")) {
    return { ok: false, error: "manifest.manifest_digest does not match canonical manifest bytes" };
  }
  if (rawText !== undefined) {
    let expected;
    try { expected = notebookBytes(manifest).toString("utf8"); } catch (err) { return { ok: false, error: err.message }; }
    if (rawText !== expected && rawText !== expected.slice(0, -1)) return { ok: false, error: "notebook manifest bytes are not canonical JSON" };
  }
  return { ok: true, manifest };
}

export function parseNotebookManifest(text) {
  if (typeof text !== "string") return { ok: false, error: "notebook manifest must be a string" };
  const duplicate = findDuplicateKey(text);
  if (duplicate !== null) return { ok: false, error: `notebook manifest contains duplicate field ${JSON.stringify(duplicate)}` };
  let manifest;
  try { manifest = JSON.parse(text); } catch { return { ok: false, error: "notebook manifest is not valid JSON" }; }
  const check = validateNotebookManifest(manifest, { rawText: text });
  return check.ok ? { ok: true, manifest } : check;
}

function validateNotebookEvidenceItem(item, index) {
  let check = notebookClosed(item, NOTEBOOK_EVIDENCE_FIELDS, `notebook evidence[${index}]`);
  if (!check.ok) return { ok: false, error: check.error };
  for (const field of ["item_id", "kind", "source", "selected", "retained_digest"]) {
    check = notebookText(item[field], `notebook evidence[${index}].${field}`, field === "source" ? NOTEBOOK_MAX_SOURCE : NOTEBOOK_MAX_TEXT);
    if (!check.ok) return { ok: false, error: check.error };
  }
  check = notebookTimestamp(item.observed_at, `notebook evidence[${index}].observed_at`);
  if (!check.ok) return { ok: false, error: check.error };
  if (item.source_digest !== null) {
    check = notebookDigestField(item.source_digest, `notebook evidence[${index}].source_digest`);
    if (!check.ok) return { ok: false, error: check.error };
  }
  check = notebookDigestField(item.retained_digest, `notebook evidence[${index}].retained_digest`);
  if (!check.ok) return { ok: false, error: check.error };
  if (item.retained_digest !== rawDigest(Buffer.from(item.selected, "utf8"))) {
    return { ok: false, error: `notebook evidence[${index}].retained_digest does not match the retained redacted representation` };
  }
  if (!Array.isArray(item.redaction_notes) || item.redaction_notes.length > NOTEBOOK_MAX_REDACTION_NOTES
      || item.redaction_notes.some((note) => typeof note !== "string" || note.trim() === "" || note.length > 512)) {
    return { ok: false, error: `notebook evidence[${index}].redaction_notes must be a bounded array of nonempty strings` };
  }
  if (typeof item.truncated !== "boolean") return { ok: false, error: `notebook evidence[${index}].truncated must be a boolean` };
  return { ok: true };
}

function validateNotebookContext(context) {
  let check = notebookClosed(context, NOTEBOOK_CONTEXT_FIELDS, "notebook entry context");
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookText(context.paseo_project_id, "context.paseo_project_id", 512);
  if (!check.ok || context.paseo_project_id === "unknown") return { ok: false, error: "context.paseo_project_id must be an exact current Paseo project identity" };
  check = notebookPathLocator(context.repository_root, "context.repository_root");
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookText(context.paseo_workspace_id, "context.paseo_workspace_id", 512);
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookText(context.lead_agent_id, "context.lead_agent_id", 512);
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookId(context.binding_source, "context.binding_source");
  if (!check.ok && context.binding_source !== "manifest") return check;
  if (context.protocol_pin !== null) {
    check = notebookClosed(context.protocol_pin, NOTEBOOK_PROTOCOL_PIN_FIELDS, "context.protocol_pin");
    if (!check.ok) return { ok: false, error: check.error };
    if (!Number.isSafeInteger(context.protocol_pin.version) || context.protocol_pin.version < 1) {
      return { ok: false, error: "context.protocol_pin.version must be a positive integer" };
    }
    check = notebookDigestField(context.protocol_pin.digest, "context.protocol_pin.digest");
    if (!check.ok) return { ok: false, error: check.error };
  }
  return { ok: true };
}

export function validateNotebookEntry(entry, options = {}) {
  const manifest = options["manifest"];
  const rawText = options["rawText"];
  let check = notebookClosed(entry, NOTEBOOK_ENTRY_FIELDS, "notebook entry");
  if (!check.ok) return { ok: false, error: check.error };
  if (entry.contract !== NOTEBOOK_ENTRY_CONTRACT || entry.schema_version !== NOTEBOOK_CONTRACT_VERSION) {
    return { ok: false, error: "notebook entry contract and schema_version must be exactly v1" };
  }
  check = notebookId(entry.entry_id, "entry.entry_id");
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookId(entry.notebook_id, "entry.notebook_id");
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookText(entry.protocol_project_id, "entry.protocol_project_id", NOTEBOOK_MAX_PROJECT_ID);
  if (!check.ok) return { ok: false, error: check.error };
  for (const field of ["recorded_at", "observed_at"]) {
    check = notebookTimestamp(entry[field], `entry.${field}`);
    if (!check.ok) return { ok: false, error: check.error };
  }
  check = notebookClosed(entry.writer, NOTEBOOK_WRITER_FIELDS, "notebook entry writer");
  if (!check.ok) return { ok: false, error: check.error };
  for (const field of NOTEBOOK_WRITER_FIELDS) {
    check = notebookText(entry.writer[field], `entry.writer.${field}`, 512);
    if (!check.ok) return { ok: false, error: check.error };
  }
  check = validateNotebookContext(entry.context);
  if (!check.ok) return { ok: false, error: check.error };
  for (const field of ["observation", "impact", "question", "recommendation"]) {
    check = notebookText(entry[field], `entry.${field}`);
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0 || entry.evidence.length > NOTEBOOK_MAX_EVIDENCE) {
    return { ok: false, error: `entry.evidence must contain 1-${NOTEBOOK_MAX_EVIDENCE} items` };
  }
  for (const [index, item] of entry.evidence.entries()) {
    check = validateNotebookEvidenceItem(item, index);
    if (!check.ok) return { ok: false, error: check.error };
  }
  check = notebookClosed(entry.suspected_mechanism, NOTEBOOK_MECHANISM_FIELDS, "notebook suspected_mechanism");
  if (!check.ok) return { ok: false, error: check.error };
  for (const field of ["hypothesis", "uncertainty"]) {
    check = notebookText(entry.suspected_mechanism[field], `suspected_mechanism.${field}`);
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (!["low", "medium", "high"].includes(entry.suspected_mechanism.confidence)) {
    return { ok: false, error: "suspected_mechanism.confidence must be low|medium|high" };
  }
  check = notebookClosed(entry.escalation, NOTEBOOK_ESCALATION_FIELDS, "notebook escalation");
  if (!check.ok) return { ok: false, error: check.error };
  if (typeof entry.escalation.needed !== "boolean") return { ok: false, error: "escalation.needed must be a boolean" };
  if (!["lead", "human", "none"].includes(entry.escalation.owner)) return { ok: false, error: "escalation.owner must be lead|human|none" };
  check = notebookText(entry.escalation.reason, "escalation.reason");
  if (!check.ok) return { ok: false, error: check.error };
  if (entry.escalation.relay_target !== null) {
    check = notebookText(entry.escalation.relay_target, "escalation.relay_target", 512);
    if (!check.ok) return { ok: false, error: check.error };
  }
  check = notebookClosed(entry.history, NOTEBOOK_HISTORY_FIELDS, "notebook history");
  if (!check.ok) return { ok: false, error: check.error };
  if (!["original", "correction", "supersession", "rebind"].includes(entry.history.relation)) {
    return { ok: false, error: "history.relation must be original|correction|supersession|rebind" };
  }
  if (!Array.isArray(entry.history.references) || entry.history.references.length > NOTEBOOK_MAX_EVIDENCE) {
    return { ok: false, error: "history.references must be a bounded array" };
  }
  for (const [index, reference] of entry.history.references.entries()) {
    check = notebookClosed(reference, NOTEBOOK_REFERENCE_FIELDS, `history.references[${index}]`);
    if (!check.ok) return { ok: false, error: check.error };
    check = notebookId(reference.entry_id, `history.references[${index}].entry_id`);
    if (!check.ok) return { ok: false, error: check.error };
    check = notebookDigestField(reference.entry_digest, `history.references[${index}].entry_digest`);
    if (!check.ok) return { ok: false, error: check.error };
  }
  if (["correction", "supersession"].includes(entry.history.relation) && entry.history.references.length === 0) {
    return { ok: false, error: `history.${entry.history.relation} requires a prior entry reference` };
  }
  check = notebookText(entry.history.reason, "history.reason");
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookClosed(entry.sensitivity, NOTEBOOK_SENSITIVITY_FIELDS, "notebook sensitivity");
  if (!check.ok) return { ok: false, error: check.error };
  if (!Array.isArray(entry.sensitivity.redactions) || entry.sensitivity.redactions.length > NOTEBOOK_MAX_REDACTION_NOTES
      || entry.sensitivity.redactions.some((item) => typeof item !== "string" || item.trim() === "" || item.length > 512)) {
    return { ok: false, error: "sensitivity.redactions must be a bounded array of nonempty strings" };
  }
  if (entry.sensitivity.contains_secret !== false) return { ok: false, error: "sensitivity.contains_secret must be exactly false" };
  check = notebookDigestField(entry.entry_digest, "entry.entry_digest");
  if (!check.ok) return { ok: false, error: check.error };
  if (manifest !== undefined) {
    if (!manifest || entry.notebook_id !== manifest.notebook_id) return { ok: false, error: "entry.notebook_id does not match the manifest" };
    if (entry.protocol_project_id !== manifest.protocol_project_id) return { ok: false, error: "entry.protocol_project_id does not match the manifest" };
  }
  if (entry.entry_digest !== notebookDigest(entry, "entry_digest")) {
    return { ok: false, error: "entry.entry_digest does not match canonical entry bytes" };
  }
  if (rawText !== undefined) {
    const expected = notebookBytes(entry).toString("utf8");
    if (rawText !== expected && rawText !== expected.slice(0, -1)) return { ok: false, error: "notebook entry bytes are not canonical JSON" };
  }
  return { ok: true, entry };
}

export function parseNotebookEntry(text, options = {}) {
  const manifest = options["manifest"];
  if (typeof text !== "string") return { ok: false, error: "notebook entry must be a string" };
  const duplicate = findDuplicateKey(text);
  if (duplicate !== null) return { ok: false, error: `notebook entry contains duplicate field ${JSON.stringify(duplicate)}` };
  let entry;
  try { entry = JSON.parse(text); } catch { return { ok: false, error: "notebook entry is not valid JSON" }; }
  const check = validateNotebookEntry(entry, { manifest, rawText: text });
  return check.ok ? { ok: true, entry } : check;
}

function safeNotebookComponentPath(root, target, label) {
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return { ok: false, error: `${label} escapes the Pi config root` };
  return { ok: true };
}

async function canonicalConfigRoot(raw, create = false) {
  const candidate = isAbsolute(raw) ? raw : join(process.cwd(), raw);
  try {
    const real = await realpath(candidate);
    if (!(await stat(real)).isDirectory()) return { ok: false, error: "effective Pi config directory is not a directory" };
    return { ok: true, path: real };
  } catch (err) {
    if (err.code !== "ENOENT" || !create) return { ok: false, error: "effective Pi config directory is not readable" };
    try {
      await mkdir(candidate, { recursive: true, mode: 0o700 });
      const real = await realpath(candidate);
      return { ok: true, path: real };
    } catch (createErr) {
      return { ok: false, error: `effective Pi config directory cannot be created: ${createErr.message}` };
    }
  }
}

async function assertNoSymlinkComponents(root, target, label, { allowMissing = false } = {}) {
  const containment = safeNotebookComponentPath(root, target, label);
  if (!containment.ok) return { ok: false, error: containment.error };
  const rel = relative(root, target);
  let current = root;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    let entry;
    try { entry = await lstat(current); } catch (err) {
      if (err.code === "ENOENT" && allowMissing) return { ok: true };
      return { ok: false, error: `${label} is not readable` };
    }
    if (entry.isSymbolicLink()) return { ok: false, error: `${label} contains a symlink component` };
  }
  return { ok: true };
}

async function makePrivateDirectory(path, root, label) {
  const safe = await assertNoSymlinkComponents(root, path, label, { allowMissing: true });
  if (!safe.ok) return { ok: false, error: safe.error };
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
  } catch (err) {
    return { ok: false, error: `${label} cannot be created: ${err.message}` };
  }
  return assertNoSymlinkComponents(root, path, label);
}

async function prepareNotebookPaths(env, projectId, create = false) {
  let root = await canonicalConfigRoot(configDir(env), create);
  if (!root.ok) return { ok: false, error: root.error };
  let paths;
  try { paths = notebookPaths(root.path, projectId); } catch (err) { return { ok: false, error: err.message }; }
  if (create) {
    for (const [path, label] of [[paths.storageRoot, "notebook storage root"], [paths.projectsRoot, "notebook projects root"], [paths.projectRoot, "notebook project directory"], [paths.entriesRoot, "notebook entries directory"], [paths.stagingRoot, "notebook staging directory"]]) {
      const made = await makePrivateDirectory(path, root.path, label);
      if (!made.ok) return { ok: false, error: made.error };
    }
  } else {
    for (const [path, label] of [[paths.storageRoot, "notebook storage root"], [paths.projectsRoot, "notebook projects root"], [paths.projectRoot, "notebook project directory"], [paths.entriesRoot, "notebook entries directory"]]) {
      const check = await assertNoSymlinkComponents(root.path, path, label);
      if (!check.ok) return { ok: false, error: check.error };
    }
  }
  return { ok: true, root: root.path, paths };
}

async function parseNotebookJson(bytes, label) {
  const text = bytes.toString("utf8");
  const duplicate = findDuplicateKey(text);
  if (duplicate !== null) return { ok: false, error: `${label} contains duplicate field ${JSON.stringify(duplicate)}` };
  try { return { ok: true, value: JSON.parse(text), text }; }
  catch { return { ok: false, error: `${label} is not valid JSON` }; }
}

async function readManifestForPaths(prepared) {
  const safe = await assertNoSymlinkComponents(prepared.root, prepared.paths.manifestPath, "notebook manifest path");
  if (!safe.ok) return { ok: false, error: safe.error };
  let bytes;
  try { bytes = await readFile(prepared.paths.manifestPath); }
  catch (err) {
    if (err.code === "ENOENT") return { ok: false, error: "notebook manifest is missing" };
    return { ok: false, error: `notebook manifest read failed: ${err.message}` };
  }
  const parsed = await parseNotebookJson(bytes, "notebook manifest");
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const check = validateNotebookManifest(parsed.value, { rawText: parsed.text });
  if (!check.ok) return { ok: false, error: check.error };
  if (parsed.value.project_key !== prepared.paths.projectKey) return { ok: false, error: "manifest project_key does not match its derived notebook directory" };
  return { ok: true, manifest: parsed.value, bytes, rawDigest: rawDigest(bytes) };
}

async function readValidNotebookEntries(prepared, manifest) {
  let names;
  try { names = await readdir(prepared.paths.entriesRoot); }
  catch (err) { return { ok: false, error: `notebook entries directory read failed: ${err.message}` }; }
  const files = [];
  const valid = [];
  const invalid = [];
  for (const name of names.sort()) {
    const path = join(prepared.paths.entriesRoot, name);
    let st;
    try { st = await lstat(path); } catch (err) { return { ok: false, error: `notebook entry ${name} cannot be inspected: ${err.message}` }; }
    if (!st.isFile()) return { ok: false, error: `notebook entry ${name} is not a regular direct-child file` };
    const bytes = await readFile(path);
    const digest = rawDigest(bytes);
    files.push({ filename: name, raw_digest: digest });
    const parsed = await parseNotebookJson(bytes, `notebook entry ${name}`);
    let check = parsed.ok ? validateNotebookEntry(parsed.value, { manifest, rawText: parsed.text }) : { ok: false, error: parsed.error };
    if (check.ok) {
      if (name !== `${check.entry.entry_id}.json`) check = { ok: false, error: "entry filename does not match entry_id" };
    }
    if (check.ok) valid.push(check.entry);
    else invalid.push({ filename: name, raw_digest: digest, error: check.error });
  }
  return { ok: true, files, valid, invalid };
}

async function syncNotebookDirectory(path) {
  let handle;
  let failure = null;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (err) {
    failure = new Error(`directory durability sync failed for ${path}: ${err.message}`);
  }
  if (handle !== undefined) {
    try {
      await handle.close();
    } catch (err) {
      failure ??= new Error(`directory durability close failed for ${path}: ${err.message}`);
    }
  }
  if (failure !== null) throw failure;
}

// One package-private publication primitive: complete private staging, fsync,
// atomic hard-link to an absent final name, parent fsync, staging cleanup.
export async function publishNotebookCreateOnly({ storageRoot, finalParent, finalName, bytes }) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  const safeParent = await assertNoSymlinkComponents(storageRoot, finalParent, "notebook final parent");
  if (!safeParent.ok) return { ok: false, error: safeParent.error };
  if (dirname(join(finalParent, finalName)) !== finalParent || finalName.includes("/") || finalName.includes("\\") || finalName === "." || finalName === "..") {
    return { ok: false, error: "notebook final name must be a direct child of the exact final parent" };
  }
  const stagingRoot = join(storageRoot, ".staging");
  const safeStage = await assertNoSymlinkComponents(storageRoot, stagingRoot, "notebook staging root");
  if (!safeStage.ok) return { ok: false, error: safeStage.error };
  const finalPath = join(finalParent, finalName);
  let before = null;
  let inspectError = null;
  try {
    before = await lstat(finalPath);
  } catch (err) {
    if (err.code !== "ENOENT") inspectError = err;
  }
  if (inspectError) return { ok: false, error: `notebook final path cannot be inspected: ${inspectError.message}` };
  if (before && before.isSymbolicLink()) return { ok: false, error: "notebook final path must not be a symlink" };
  if (before && !before.isFile()) return { ok: false, error: "notebook final path is not a regular file" };
  if (before) {
    const existing = await readFile(finalPath);
    const incomingDigest = rawDigest(bytes);
    const existingDigest = rawDigest(existing);
    if (existingDigest === incomingDigest) {
      try { await syncNotebookDirectory(finalParent); } catch (err) { return { ok: false, error: err.message }; }
      return { ok: true, status: "idempotent", path: finalPath, digest: existingDigest };
    }
    return { ok: false, status: "conflict", error: "notebook final path already contains different bytes", path: finalPath, existing_digest: existingDigest, incoming_digest: incomingDigest };
  }

  const stagePath = join(stagingRoot, `.stage-${randomUUID()}`);
  let handle;
  let stageCreated = false;
  let result;
  let cleanupError = null;
  try {
    handle = await open(stagePath, "wx", 0o600);
    stageCreated = true;
    let offset = 0;
    while (offset < bytes.length) {
      const written = await handle.write(bytes, offset, bytes.length - offset);
      if (!written.bytesWritten) throw new Error("staging write made no progress");
      offset += written.bytesWritten;
    }
    await handle.sync();
    await handle.close();
    handle = null;
    const finalSafe = await assertNoSymlinkComponents(storageRoot, finalParent, "notebook final parent");
    if (!finalSafe.ok) {
      result = finalSafe;
    } else {
      try {
        await link(stagePath, finalPath);
        await syncNotebookDirectory(finalParent);
        result = { ok: true, status: "created", path: finalPath, digest: rawDigest(bytes) };
      } catch (err) {
        if (err.code === "EEXIST") {
          const existing = await readFile(finalPath);
          const incomingDigest = rawDigest(bytes);
          const existingDigest = rawDigest(existing);
          result = existingDigest === incomingDigest
            ? { ok: true, status: "idempotent", path: finalPath, digest: existingDigest }
            : { ok: false, status: "conflict", error: "notebook final path already contains different bytes", path: finalPath, existing_digest: existingDigest, incoming_digest: incomingDigest };
        } else if (["EXDEV", "EOPNOTSUPP", "ENOTSUP", "EPERM"].includes(err.code)) {
          result = { ok: false, error: `no-replace notebook publication is unsupported: ${err.message}` };
        } else {
          result = { ok: false, error: `notebook publication link failed: ${err.message}` };
        }
      }
    }
  } catch (err) {
    result = { ok: false, error: `notebook publication failed: ${err.message}` };
  } finally {
    try { await handle?.close(); } catch (err) { cleanupError ??= `staging handle close failed: ${err.message}`; }
    // A linked inode is already durable evidence; only the private staging name
    // is cleaned. Cleanup failures are surfaced rather than silently accepted.
    try {
      await unlink(stagePath);
    } catch (err) {
      if (err.code !== "ENOENT" || stageCreated) cleanupError ??= `staging cleanup failed: ${err.message}`;
    }
    try { await syncNotebookDirectory(stagingRoot); }
    catch (err) { cleanupError ??= err.message; }
  }
  if (cleanupError !== null) return { ok: false, error: cleanupError };
  return result ?? { ok: false, error: "notebook publication produced no result" };
}

async function findNotebookIdElsewhere(prepared, notebookId) {
  let names;
  try { names = await readdir(prepared.paths.projectsRoot); }
  catch (err) { return { ok: false, error: `notebook projects directory read failed: ${err.message}` }; }
  for (const name of names) {
    if (name === prepared.paths.projectKey) continue;
    if (!NOTEBOOK_ID.test(name)) continue;
    const candidateRoot = join(prepared.paths.projectsRoot, name);
    const candidateSafety = await assertNoSymlinkComponents(prepared.root, candidateRoot, "notebook project scan path");
    if (!candidateSafety.ok) return { ok: false, error: candidateSafety.error };
    const candidate = { ...prepared, paths: notebookPaths(prepared.root, "x") };
    candidate.paths.projectRoot = candidateRoot;
    candidate.paths.manifestPath = join(candidate.paths.projectRoot, "manifest.json");
    let bytes;
    try { bytes = await readFile(candidate.paths.manifestPath); } catch (err) { if (err.code === "ENOENT") continue; return { ok: false, error: `notebook manifest scan failed: ${err.message}` }; }
    const parsed = await parseNotebookJson(bytes, "notebook manifest");
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const check = validateNotebookManifest(parsed.value, { rawText: parsed.text });
    if (!check.ok) return { ok: false, error: `another notebook is malformed: ${check.error}` };
    if (parsed.value.notebook_id === notebookId) return { ok: false, error: "notebook_id already exists under another project key" };
  }
  return { ok: true };
}

async function canonicalLocator(value, label, allowUnknown = true) {
  if (allowUnknown && value === "unknown") return { ok: true, value };
  if (typeof value !== "string" || value.trim() === "") return { ok: false, error: `${label} must be nonempty` };
  const candidate = isAbsolute(value) ? value : join(process.cwd(), value);
  try {
    const real = await realpath(candidate);
    if (!(await stat(real)).isDirectory()) return { ok: false, error: `${label} must name a directory` };
    return { ok: true, value: real };
  } catch (err) {
    return { ok: false, error: `${label} is not readable: ${err.message}` };
  }
}

export async function initializeNotebook(options = {}) {
  const env = options["env"] ?? process.env;
  const projectId = options["projectId"];
  const protocolProjectId = options["protocolProjectId"];
  const paseoProjectId = options["paseoProjectId"];
  const repositoryRoot = options["repositoryRoot"] ?? "unknown";
  const supervisorAgentId = options["supervisorAgentId"];
  const piSessionId = options["piSessionId"];
  const createdAt = options["createdAt"] ?? new Date().toISOString();
  const humanProjectId = projectId ?? protocolProjectId;
  if (typeof humanProjectId !== "string" || humanProjectId.length === 0) return { ok: false, error: "protocol project_id is required" };
  const paseo = typeof paseoProjectId === "string" && paseoProjectId.trim() !== "" && paseoProjectId !== "unknown" ? paseoProjectId : null;
  if (paseo === null) return { ok: false, error: "paseo_project_id_at_creation is required" };
  const agent = notebookText(supervisorAgentId, "supervisor_agent_id", 512);
  if (!agent.ok) return { ok: false, error: agent.error };
  const session = notebookText(piSessionId, "pi_session_id", 512);
  if (!session.ok) return { ok: false, error: session.error };
  const repo = await canonicalLocator(repositoryRoot, "repository_root_at_creation", true);
  if (!repo.ok) return { ok: false, error: repo.error };
  const prepared = await prepareNotebookPaths(env, humanProjectId, true);
  if (!prepared.ok) return { ok: false, error: prepared.error };
  let notebookId;
  try { notebookId = `nb-${randomUUID()}`; } catch (err) { return { ok: false, error: `notebook identity generation failed: ${err.message}` }; }
  const duplicate = await findNotebookIdElsewhere(prepared, notebookId);
  if (!duplicate.ok) return { ok: false, error: duplicate.error };
  let existing;
  try { existing = await lstat(prepared.paths.manifestPath); } catch (err) { if (err.code !== "ENOENT") return { ok: false, error: `notebook manifest cannot be inspected: ${err.message}` }; }
  if (existing) return { ok: false, error: "notebook manifest already exists; initialization is create-once" };
  const manifest = {
    contract: NOTEBOOK_CONTRACT,
    contract_version: NOTEBOOK_CONTRACT_VERSION,
    manifest_schema: NOTEBOOK_CONTRACT_VERSION,
    notebook_id: notebookId,
    protocol_project_id: humanProjectId,
    paseo_project_id_at_creation: paseo,
    repository_root_at_creation: repo.value,
    project_key: prepared.paths.projectKey,
    created_at: createdAt,
    created_by: { supervisor_agent_id: supervisorAgentId, pi_session_id: piSessionId },
    creation_route: "human_confirmed",
    manifest_digest: "",
  };
  manifest.manifest_digest = notebookDigest(manifest, "manifest_digest");
  const check = validateNotebookManifest(manifest);
  if (!check.ok) return { ok: false, error: check.error };
  const published = await publishNotebookCreateOnly({
    storageRoot: prepared.paths.storageRoot,
    finalParent: prepared.paths.projectRoot,
    finalName: "manifest.json",
    bytes: notebookBytes(manifest),
  });
  if (!published.ok) return { ok: false, error: published.error };
  if (published.status !== "created") return { ok: false, error: "notebook manifest already exists; initialization is create-once" };
  return { ok: true, manifest, paths: prepared.paths, status: "created" };
}

async function loadNotebook(prepared) {
  const manifest = await readManifestForPaths(prepared);
  if (!manifest.ok) return { ok: false, error: manifest.error };
  const entries = await readValidNotebookEntries(prepared, manifest.manifest);
  if (!entries.ok) return { ok: false, error: entries.error };
  return { ok: true, manifest: manifest.manifest, bytes: manifest.bytes, rawDigest: manifest.rawDigest, entries: { files: entries.files, valid: entries.valid, invalid: entries.invalid } };
}

function contextForNotebook(options = {}) {
  const context = options["context"] ?? {};
  return {
    paseo_project_id: context["paseo_project_id"] ?? context["paseoProjectId"] ?? options["paseoProjectId"] ?? "unknown",
    repository_root: context["repository_root"] ?? context["repositoryRoot"] ?? options["repositoryRoot"] ?? "unknown",
    paseo_workspace_id: context["paseo_workspace_id"] ?? context["paseoWorkspaceId"] ?? options["paseoWorkspaceId"] ?? "unknown",
    lead_agent_id: context["lead_agent_id"] ?? context["leadAgentId"] ?? options["leadAgentId"] ?? "unknown",
    binding_source: context["binding_source"] ?? context["bindingSource"] ?? options["bindingSource"] ?? "manifest",
    protocol_pin: context["protocol_pin"] ?? context["protocolPin"] ?? options["protocolPin"] ?? null,
  };
}

function currentNotebookBinding(loaded) {
  let binding = {
    paseo_project_id: loaded.manifest.paseo_project_id_at_creation,
    repository_root: loaded.manifest.repository_root_at_creation,
    source: "manifest",
  };
  for (const entry of loaded.entries.valid.sort((a, b) => a.entry_id.localeCompare(b.entry_id))) {
    if (entry.history.relation === "rebind" && entry.context.binding_source === entry.entry_id) {
      binding = { paseo_project_id: entry.context.paseo_project_id, repository_root: entry.context.repository_root, source: entry.entry_id };
    }
  }
  return binding;
}

export function classifyNotebookBinding(manifestOrLoaded, context) {
  const loaded = manifestOrLoaded?.manifest ? manifestOrLoaded : { manifest: manifestOrLoaded, entries: { valid: [] } };
  if (!loaded.manifest) return { ok: false, classification: "invalid", error: "notebook manifest is required" };
  const binding = currentNotebookBinding(loaded);
  const actual = contextForNotebook({ context });
  const sameProject = actual.paseo_project_id === binding.paseo_project_id;
  const sameRepository = actual.repository_root === binding.repository_root;
  if (sameProject && sameRepository) return { ok: true, classification: "same", binding_source: binding.source, context: actual };
  return {
    ok: false,
    classification: "move_or_copy",
    error: "notebook project membership or repository locator changed; Human must classify move versus copy",
    binding,
    context: actual,
  };
}

function normalizeNotebookEvidence(item, index) {
  const value = structuredClone(item);
  if (value.selected === undefined) value.selected = value.selected_facts ?? value.excerpt;
  if (value.source === undefined) value.source = value.source_locator;
  if (value.redaction_notes === undefined) value.redaction_notes = value.redactions ?? [];
  if (value.source_digest === undefined) value.source_digest = null;
  if (value.truncated === undefined) value.truncated = false;
  if (value.retained_digest === undefined && typeof value.selected === "string") value.retained_digest = rawDigest(Buffer.from(value.selected, "utf8"));
  return value;
}

function redactNotebookText(text, path, redactions) {
  if (typeof text !== "string") return text;
  let result = text;
  const secretPattern = /((?:password|passwd|secret|token|credential|api[_-]?key|private[_-]?key|authorization)\s*[:=]\s*)([^\s,;]+)/gi;
  result = result.replace(secretPattern, (_whole, prefix) => {
    redactions.push(`${path}:secret`);
    return `${prefix}[REDACTED]`;
  });
  if (result.length > NOTEBOOK_MAX_TEXT) {
    redactions.push(`${path}:truncated`);
    result = `${result.slice(0, NOTEBOOK_MAX_TEXT - 32)}…[TRUNCATED]`;
  }
  return result;
}

function redactNotebookEntry(entry) {
  const value = structuredClone(entry);
  const redactions = Array.isArray(value.sensitivity?.redactions) ? [...value.sensitivity.redactions] : [];
  for (const field of ["observation", "impact", "question", "recommendation", "history"]) {
    if (field === "history") {
      if (typeof value.history?.reason === "string") value.history.reason = redactNotebookText(value.history.reason, "history.reason", redactions);
    } else if (typeof value[field] === "string") value[field] = redactNotebookText(value[field], field, redactions);
  }
  if (value.suspected_mechanism) {
    for (const field of ["hypothesis", "uncertainty"]) value.suspected_mechanism[field] = redactNotebookText(value.suspected_mechanism[field], `suspected_mechanism.${field}`, redactions);
  }
  if (value.escalation?.reason) value.escalation.reason = redactNotebookText(value.escalation.reason, "escalation.reason", redactions);
  for (const [index, item] of (value.evidence ?? []).entries()) {
    if (typeof item.selected === "string") item.selected = redactNotebookText(item.selected, `evidence[${index}].selected`, redactions);
    if (Array.isArray(item.redaction_notes)) item.redaction_notes = item.redaction_notes.map((note) => redactNotebookText(note, `evidence[${index}].redaction_notes`, redactions));
    if (item.selected !== undefined) item.retained_digest = rawDigest(Buffer.from(item.selected, "utf8"));
  }
  if (value.sensitivity?.contains_secret === true) throw new Error("notebook entry declares contains_secret=true; redact it before appending");
  if (value.sensitivity) value.sensitivity = { ...value.sensitivity, redactions: [...new Set(redactions)], contains_secret: false };
  return value;
}

export async function appendNotebookEntry(options = {}) {
  const env = options["env"] ?? process.env;
  const projectId = options["projectId"];
  const protocolProjectId = options["protocolProjectId"];
  const entry = options["entry"];
  const context = options["context"];
  const allowRebind = options["allowRebind"] ?? false;
  const supervisorAgentId = options["supervisorAgentId"];
  const piSessionId = options["piSessionId"];
  const humanProjectId = projectId ?? protocolProjectId ?? entry?.protocol_project_id;
  if (typeof humanProjectId !== "string" || humanProjectId.length === 0) return { ok: false, error: "protocol project_id is required" };
  const prepared = await prepareNotebookPaths(env, humanProjectId, false);
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const loaded = await loadNotebook(prepared);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const binding = classifyNotebookBinding(loaded, context);
  if (!binding.ok && !allowRebind) return { ok: false, error: binding.error, classification: binding.classification, binding: binding.binding, context: binding.context };
  let candidate;
  try { candidate = redactNotebookEntry(structuredClone(entry)); } catch (err) { return { ok: false, error: err.message }; }
  if (!isRecord(candidate)) return { ok: false, error: "notebook append entry must be an object" };
  if (context !== undefined) {
    const actual = contextForNotebook({ context });
    for (const field of ["paseo_project_id", "repository_root", "paseo_workspace_id", "lead_agent_id"]) {
      if (candidate.context?.[field] !== actual[field]) return { ok: false, error: `entry.context.${field} does not match the current live Notebook binding` };
    }
  }
  if (binding.ok) {
    candidate.context = { ...candidate.context, binding_source: binding.binding_source };
  } else {
    candidate.context = { ...candidate.context, binding_source: candidate.entry_id };
    candidate.history = { ...candidate.history, relation: "rebind", reason: `Human-confirmed move: ${candidate.history?.reason ?? "rebind current project locator"}` };
  }
  candidate.notebook_id = loaded.manifest.notebook_id;
  candidate.protocol_project_id = loaded.manifest.protocol_project_id;
  // The binding-source/history normalization above changes bytes (rebind path),
  // so the canonical digest is recomputed over the exact published entry — the
  // entry as written is always self-consistent; prior entries are never touched.
  candidate.entry_digest = notebookDigest(candidate, "entry_digest");
  const check = validateNotebookEntry(candidate, { manifest: loaded.manifest });
  if (!check.ok) return { ok: false, error: check.error };
  if (supervisorAgentId !== undefined && candidate.writer.supervisor_agent_id !== supervisorAgentId) {
    return { ok: false, error: "entry.writer.supervisor_agent_id does not match the current Supervisor identity" };
  }
  if (piSessionId !== undefined && candidate.writer.pi_session_id !== piSessionId) {
    return { ok: false, error: "entry.writer.pi_session_id does not match the current Pi session identity" };
  }
  for (const reference of candidate.history.references) {
    if (["correction", "supersession"].includes(candidate.history.relation)) {
      const prior = loaded.entries.valid.find((item) => item.entry_id === reference.entry_id);
      if (!prior || prior.entry_digest !== reference.entry_digest) {
        return { ok: false, error: `history reference ${reference.entry_id} does not match a preserved prior entry digest` };
      }
    }
  }
  const published = await publishNotebookCreateOnly({
    storageRoot: prepared.paths.storageRoot,
    finalParent: prepared.paths.entriesRoot,
    finalName: `${candidate.entry_id}.json`,
    bytes: notebookBytes(candidate),
  });
  if (!published.ok) return { ok: false, error: published.error, status: published.status, path: published.path, existing_digest: published.existing_digest, incoming_digest: published.incoming_digest };
  return { ok: true, status: published.status, entry: candidate, paths: prepared.paths };
}

export async function snapshotNotebook(options = {}) {
  const env = options["env"] ?? process.env;
  const projectId = options["projectId"];
  const protocolProjectId = options["protocolProjectId"];
  const humanProjectId = projectId ?? protocolProjectId;
  if (typeof humanProjectId !== "string" || humanProjectId.length === 0) return { ok: false, error: "protocol project_id is required" };
  const prepared = await prepareNotebookPaths(env, humanProjectId, false);
  if (!prepared.ok) return { ok: false, error: prepared.error };
  const loaded = await loadNotebook(prepared);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const physical = loaded.entries.files.sort((a, b) => a.filename.localeCompare(b.filename));
  const snapshotDigest = `sha256:${createHash("sha256").update(canonicalNotebookJson({ manifest_digest: loaded.rawDigest, entries: physical })).digest("hex")}`;
  const projection = loaded.entries.valid.sort((a, b) => a.entry_id.localeCompare(b.entry_id));
  return {
    ok: true,
    snapshot: {
      manifest_digest: loaded.rawDigest,
      manifest_canonical_digest: loaded.manifest.manifest_digest,
      physical_entries: physical,
      snapshot_digest: snapshotDigest,
      valid_causal_projection: projection,
      invalid_entries: loaded.entries.invalid,
    },
  };
}

async function notebookContextFromPi(ctx, env) {
  const cwd = ctx?.cwd ?? process.cwd();
  const repoRoot = await findRepoRoot(cwd);
  const paseoProjectId = ctx?.paseoProjectId ?? ctx?.paseo_project_id ?? ctx?.workspace?.projectId ?? env.PASEO_PROJECT_ID ?? "unknown";
  const workspaceId = ctx?.workspaceId ?? ctx?.paseoWorkspaceId ?? ctx?.paseo_workspace_id ?? env.PASEO_WORKSPACE_ID ?? "unknown";
  const leadId = ctx?.leadAgentId ?? ctx?.lead_agent_id ?? env.PASEO_LEAD_AGENT_ID ?? "unknown";
  let protocolPinValue = null;
  if (repoRoot) {
    const protocol = await readAndValidateProtocol(repoRoot);
    if (protocol.ok) protocolPinValue = { version: protocol.protocol.meta.version, digest: `sha256:${protocol.protocol.digest}` };
  }
  return {
    paseoProjectId, workspaceId, leadId, repositoryRoot: repoRoot ?? "unknown", protocolPin: protocolPinValue,
    piSessionId: ctx?.sessionId ?? ctx?.piSessionId ?? ctx?.session?.id ?? "unknown",
  };
}

async function runNotebookInit(_args, ctx) {
  const notify = (message, level) => ctx.ui?.notify?.(message, level);
  const env = envOf(ctx);
  const role = parseRole(env).role;
  if (role !== null && role !== "supervisor") { notify("pi-paseo-orchestration: notebook-init is available only to a Human session or active supervisor process", "error"); return { ok: false, error: "Human session or supervisor role required" }; }
  if (role === "supervisor") {
    if (latch === null || latch.role !== "supervisor") { notify("pi-paseo-orchestration: notebook-init is available only to an active supervisor process", "error"); return { ok: false, error: "supervisor role required" }; }
    if (blockedReason !== null) { notify(`pi-paseo-orchestration blocked: ${blockedReason}`, "error"); return { ok: false, error: blockedReason }; }
    if (!(await verifyOrBlock(ctx, configDir(env), null, { runtime: false }))) return { ok: false, error: blockedReason };
  }
  const ui = ctx.ui ?? {};
  if (typeof ui.input !== "function" || typeof ui.confirm !== "function") {
    const error = "interactive input is unavailable; notebook initialization did not write";
    notify(error, "error");
    return { ok: false, error };
  }
  const projectId = await ui.input("Protocol project_id for the Supervisor Notebook:", "");
  if (!projectId) { notify("Cancelled; no notebook manifest written.", "info"); return { ok: false, error: "cancelled" }; }
  const facts = await notebookContextFromPi(ctx, envOf(ctx));
  if (facts.repositoryRoot !== "unknown") {
    const protocol = await readAndValidateProtocol(facts.repositoryRoot);
    if (!protocol.ok) { notify(`Notebook initialization blocked: ${protocol.error}`, "error"); return { ok: false, error: protocol.error }; }
    if (protocol.protocol.meta.project_id !== projectId) {
      const error = "notebook project_id must exactly match the repository Workspace Protocol project_id";
      notify(error, "error");
      return { ok: false, error };
    }
  }
  const draft = { protocol_project_id: projectId, paseo_project_id_at_creation: facts.paseoProjectId, repository_root_at_creation: facts.repositoryRoot, supervisor_agent_id: latch?.agentId ?? "human", pi_session_id: facts.piSessionId };
  const confirmed = await ui.confirm("Create this immutable Supervisor Notebook manifest?", JSON.stringify(draft, null, 2));
  if (!confirmed) { notify("Not written; notebook manifest unchanged.", "info"); return { ok: false, error: "cancelled" }; }
  const result = await initializeNotebook({
    env: envOf(ctx), projectId, paseoProjectId: facts.paseoProjectId, repositoryRoot: facts.repositoryRoot,
    supervisorAgentId: latch?.agentId ?? "human", piSessionId: facts.piSessionId,
  });
  notify(result.ok ? `Supervisor Notebook initialized at ${result.paths.manifestPath}` : `Notebook initialization failed: ${result.error}`, result.ok ? "info" : "error");
  return result;
}

async function runNotebookAppend(args, ctx) {
  const notify = (message, level) => ctx.ui?.notify?.(message, level);
  if (latch === null || latch.role !== "supervisor") { const error = "supervisor role required"; notify(error, "error"); return { ok: false, error }; }
  if (blockedReason !== null) { notify(`pi-paseo-orchestration blocked: ${blockedReason}`, "error"); return { ok: false, error: blockedReason }; }
  if (!(await verifyOrBlock(ctx, configDir(envOf(ctx)), null, { runtime: false }))) return { ok: false, error: blockedReason };
  let input = args;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { const error = "notebook-append arguments must be a JSON object"; notify(error, "error"); return { ok: false, error }; }
  }
  if (!isRecord(input) || Object.keys(input).some((key) => ["path", "file_path", "filesystem_path"].includes(key))) {
    const error = "notebook-append accepts contract fields only and no filesystem path";
    notify(error, "error");
    return { ok: false, error };
  }
  const facts = await notebookContextFromPi(ctx, envOf(ctx));
  const projectId = input.project_id ?? input.protocol_project_id;
  const suppliedEntry = input.entry ?? Object.fromEntries(Object.entries(input).filter(([key]) => key !== "project_id"));
  const liveContext = {
    paseo_project_id: facts.paseoProjectId, repository_root: facts.repositoryRoot,
    paseo_workspace_id: facts.workspaceId, lead_agent_id: facts.leadId, protocol_pin: facts.protocolPin,
  };
  const entry = { ...suppliedEntry, writer: { ...suppliedEntry.writer, supervisor_agent_id: latch.agentId, pi_session_id: facts.piSessionId }, context: { ...suppliedEntry.context, ...liveContext } };
  const result = await appendNotebookEntry({
    env: envOf(ctx), projectId, entry, supervisorAgentId: latch.agentId, piSessionId: facts.piSessionId,
    context: liveContext,
  });
  if (!result.ok && result.classification === "move_or_copy") {
    const moved = typeof ctx.ui?.confirm === "function" && await ctx.ui.confirm(
      "Notebook binding changed. Is this a Human-confirmed project move (not a copy)?",
      JSON.stringify({ previous: result.binding, current: result.context }, null, 2),
    );
    if (!moved) {
      const error = "Notebook write stopped: classify as copy and create a new project identity and notebook";
      notify(error, "error");
      return { ok: false, error, classification: "copy" };
    }
    const reboundEntry = { ...entry, context: { ...entry.context, binding_source: entry.entry_id } };
    const rebound = await appendNotebookEntry({
      env: envOf(ctx), projectId, entry: reboundEntry, supervisorAgentId: latch.agentId, piSessionId: facts.piSessionId,
      context: { ...liveContext, binding_source: entry.entry_id }, allowRebind: true,
    });
    notify(rebound.ok ? "Notebook rebind evidence appended; prior bytes remain immutable." : `Notebook rebind failed: ${rebound.error}`, rebound.ok ? "info" : "error");
    return rebound;
  }
  notify(result.ok ? `Notebook entry ${result.status}.` : `Notebook append failed: ${result.error}`, result.ok ? "info" : "error");
  return result;
}

// ─── Doctor ──────────────────────────────────────────────────────────────────

export const DOCTOR_REPORT_BEGIN = '<pi-paseo-orchestration doctor="v1">';
export const DOCTOR_REPORT_END = "</pi-paseo-orchestration>";
const DOCTOR_STATUSES = ["PASS", "WARN", "BLOCKED"];
const DOCTOR_STATUS_RANK = { PASS: 0, WARN: 1, BLOCKED: 2 };
const DOCTOR_CHECK_CODES = [
  "CONTEXT_CWD", "GIT_REPOSITORY", "GIT_WORKTREE", "PI_CAPABILITIES", "PACKAGE_PROVENANCE",
  "PASEO_IDENTITY", "ADAPTER_OBSERVER", "OBSERVER_ATTESTATION", "ROLE_ACTIVATION", "ROLE_SETTINGS", "ROLE_PROFILE",
  "WORKSPACE_PROTOCOL", "TOOL_POLICY", "AUTHORITY_STATE",
];

function doctorRemediation(status, owner, action) {
  if (status === "PASS") return { owner: null, action: null, commands: [], rerun_required: false };
  return { owner: owner ?? "human", action: action ?? "Re-observe the reported fact and rerun doctor.", commands: [], rerun_required: true };
}

function doctorCheck(code, subject, status, expected, observed, evidence = [], remediation = {}) {
  const owner = remediation["owner"] ?? (status === "BLOCKED" ? "operator" : "human");
  return {
    code, subject, applicable: remediation["applicable"] !== false, required: remediation["required"] !== false,
    status, expected: redactDoctorText(expected), observed: redactDoctorText(observed),
    evidence: evidence.map((item) => ({
      kind: item.kind ?? "memory", source: redactDoctorText(item.source ?? "doctor"),
      digest: typeof item.digest === "string" && SHA256_HEX.test(item.digest) ? `sha256:${item.digest}` : (item.digest ?? null),
      exit_code: item.exit_code ?? null,
      output: item.output === null || item.output === undefined ? null : redactDoctorText(item.output, 500),
    })),
    remediation: doctorRemediation(status, owner, remediation["action"]),
  };
}

function redactDoctorText(value, max = 300) {
  if (typeof value !== "string") return value;
  let result = value.replace(/((?:password|passwd|secret|token|credential|api[_-]?key|authorization)\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]");
  if (result.length > max) result = `${result.slice(0, Math.max(0, max - 30))}…[TRUNCATED sha256:${createHash("sha256").update(value).digest("hex")}]`;
  return result;
}

function doctorNow(value) {
  return value instanceof Date ? value.toISOString() : (typeof value === "string" ? value : new Date().toISOString());
}

function doctorMode(ctx) {
  const output = ctx?.outputMode ?? ctx?.mode;
  if (output === "print" || output === "json" || output === "stdout" || ctx?.json === true || ctx?.print === true) return null;
  if (ctx?.rpc === true || (ctx?.rpc && typeof ctx.rpc === "object") || ctx?.mode === "rpc" || ctx?.outputMode === "rpc" || ctx?.ui?.mode === "rpc") return "rpc";
  if (ctx?.ui && typeof ctx.ui.notify === "function") return "tui";
  return null;
}

export function doctorOutputMode(ctx) {
  const mode = doctorMode(ctx);
  return mode ?? "OUTPUT_CHANNEL_UNAVAILABLE";
}

function doctorPackageSource() {
  const url = import.meta.url;
  const fileSource = url.startsWith("file:") ? fileURLToPath(url) : "data-url";
  return {
    scope: url.startsWith("file:") ? "project" : "temporary",
    origin: "package",
    source: fileSource,
    digest: `sha256:${createHash("sha256").update(url).digest("hex")}`,
  };
}

function validatePaseoObservation(observation, agentId) {
  if (!isRecord(observation)) return { ok: false, error: "observer result must be an object" };
  if (agentId === "" || observation.agent_id !== agentId) return { ok: false, error: "observer agent_id does not match the current Paseo agent" };
  for (const [field, value] of [["daemon_id", observation.daemon_id ?? observation.daemon?.id], ["status", observation.status], ["cwd", observation.cwd ?? observation.agent_cwd], ["provider", observation.provider]]) {
    if (typeof value !== "string" || value.trim() === "") return { ok: false, error: `observer ${field} is missing` };
  }
  if (observation.provider !== "pi") return { ok: false, error: "observer provider must be pi" };
  const workspace = isRecord(observation.workspace) ? observation.workspace : {};
  const workspaceId = observation.workspace_id ?? workspace.id;
  const projectId = observation.project_id ?? workspace.project_id;
  if (typeof workspaceId !== "string" || workspaceId.trim() === "") return { ok: false, error: "observer typed workspace_id is missing" };
  if (typeof projectId !== "string" || projectId.trim() === "") return { ok: false, error: "observer workspace project_id is missing" };
  if (observation.workspace_typed !== true && workspace.typed !== true) return { ok: false, error: "observer typed workspace binding is not attested" };
  if (!Object.prototype.hasOwnProperty.call(observation, "parent_id") && !Object.prototype.hasOwnProperty.call(observation, "parent")) return { ok: false, error: "observer parentage is missing" };
  const parent = isRecord(observation.parent) ? observation.parent : {};
  const parentId = Object.prototype.hasOwnProperty.call(observation, "parent_id") ? observation.parent_id : (parent.id ?? null);
  if (parentId !== null && typeof parentId !== "string") return { ok: false, error: "observer parent_id is malformed" };
  if (parentId !== null && observation.parent_resolvable !== true && parent.resolvable !== true) return { ok: false, error: "observer parent resolvability is not attested" };
  const runtime = observation.runtimeInfo ?? observation.runtime_info;
  if (!isRecord(runtime)) return { ok: false, error: "observer runtimeInfo is missing" };
  const model = runtime.model;
  if (!(typeof model === "string" && model.trim() !== "") && !(isRecord(model) && typeof model.id === "string" && model.id.trim() !== "")) return { ok: false, error: "observer runtimeInfo.model is missing" };
  if (typeof runtime.thinkingOptionId !== "string" || runtime.thinkingOptionId.trim() === "") return { ok: false, error: "observer runtimeInfo.thinkingOptionId is missing" };
  if (observation.mcp_configuration_attested !== true && observation.mcpConfigurationAttested !== true) return { ok: false, error: "observer MCP configuration attestation is missing" };
  return { ok: true };
}

async function doctorPaseoObservation(ctx, env, role) {
  const agentId = (env[AGENT_ENV] ?? "").trim();
  const observer = ctx?.observeCurrentAgent
    ?? ctx?.paseoObserver?.observeCurrentAgent
    ?? ctx?.paseo?.observeCurrentAgent;
  if (typeof observer === "function") {
    let observation;
    try {
      // One bounded read-only observation. There is intentionally no retry or
      // alternate target when this capability is unavailable.
      const result = Promise.resolve(observer({ agent_id: agentId }));
      observation = await Promise.race([
        result,
        new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 1500)),
      ]);
    } catch (err) {
      return { status: role === "lead" || role === "supervisor" ? "BLOCKED" : "WARN", reason: `adapter observer unavailable: ${err.message}`, observation: null, agentId };
    }
    if (!observation || observation.__timeout) {
      return { status: role === "lead" || role === "supervisor" ? "BLOCKED" : "WARN", reason: "adapter observer timed out", observation: null, agentId };
    }
    const shape = validatePaseoObservation(observation, agentId);
    if (!shape.ok) {
      return { status: role === "lead" || role === "supervisor" ? "BLOCKED" : "WARN", reason: shape.error, observation, agentId };
    }
    return { status: "PASS", reason: "public current-agent observer returned the complete current-agent tuple", observation, agentId };
  }
  // No adapter-provided observer is loaded (pi-mcp-adapter v2.23.0 has no
  // Paseo integration). Fall back to the independently installed Paseo CLI —
  // read-only, fixed agent identity, provenance-checkable. This proves
  // identity/model/thinking/parent/cwd; workspace binding and MCP-config
  // attestation are not observable through the CLI and are reported
  // separately by OBSERVER_ATTESTATION (never claimed as proven).
  if (agentId === "") {
    return { status: role === "lead" || role === "supervisor" ? "BLOCKED" : "WARN", reason: "no Paseo agent identity to observe", observation: null, agentId };
  }
  const observed = await observePaseoCurrentAgent(agentId, { env });
  if (!observed.ok) {
    return { status: role === "lead" || role === "supervisor" ? "BLOCKED" : "WARN", reason: observed.error, observation: null, agentId };
  }
  const runtime = observed.observation.runtimeInfo;
  if (typeof runtime.model !== "string" || runtime.model === "" || typeof runtime.thinkingOptionId !== "string" || runtime.thinkingOptionId === "") {
    return { status: role === "lead" || role === "supervisor" ? "BLOCKED" : "WARN", reason: "paseo CLI observer cannot prove model/thinking for the current agent", observation: observed.observation, agentId };
  }
  return { status: "PASS", reason: "paseo CLI current-agent observation proved identity, model, thinking, parent, and cwd", observation: observed.observation, agentId };
}

// Reads the exact current-agent tuple through the installed Paseo CLI
// (`paseo inspect <id> --json`). One bounded read-only call, fixed identity,
// no retry, no alternate target, no mutation.
export async function observePaseoCurrentAgent(agentId, { env = process.env, timeoutMs = 15000 } = {}) {
  const id = (agentId ?? "").trim();
  if (id === "") return { ok: false, error: "no Paseo agent identity to observe" };
  const output = await execFileAsync("paseo", ["inspect", id, "--json"], { env, timeout: timeoutMs })
    .then(({ stdout }) => ({ stdout: stdout.trim(), error: null }))
    .catch((err) => ({ stdout: "", error: `paseo inspect failed: ${err.message}` }));
  if (output.error) return { ok: false, error: output.error };
  if (output.stdout === "") return { ok: false, error: "paseo inspect returned no output" };
  let raw;
  try {
    raw = JSON.parse(output.stdout);
  } catch {
    return { ok: false, error: "paseo inspect returned non-JSON output" };
  }
  if (!isRecord(raw)) return { ok: false, error: "paseo inspect returned a non-object payload" };
  if (raw.Id !== id) return { ok: false, error: `paseo inspect returned identity ${JSON.stringify(raw.Id)} instead of the requested agent ${JSON.stringify(id)}` };
  const observation = {
    agent_id: raw.Id,
    provider: typeof raw.Provider === "string" ? raw.Provider : null,
    status: typeof raw.Status === "string" ? raw.Status : null,
    cwd: typeof raw.Cwd === "string" ? raw.Cwd : null,
    parent_agent_id: typeof raw.ParentAgentId === "string" && raw.ParentAgentId !== "" ? raw.ParentAgentId : null,
    runtimeInfo: {
      model: typeof raw.Model === "string" ? raw.Model : null,
      thinkingOptionId: typeof raw.Thinking === "string" ? raw.Thinking : null,
    },
    workspace_id: null,
    mcp_configuration_attested: false,
    source: "paseo-cli",
  };
  return { ok: true, observation };
}

function doctorActivation(roleCheck) {
  if (!roleCheck.ok) return "blocked";
  if (roleCheck.role === null) return "ungoverned";
  if (blockedReason !== null) return "blocked";
  return "governed";
}

function doctorPiCapabilities(pi) {
  const required = ["getActiveTools", "setActiveTools", "setModel", "setThinkingLevel", "getThinkingLevel"];
  const missing = required.filter((name) => typeof pi?.[name] !== "function");
  return { missing, observed: required.filter((name) => typeof pi?.[name] === "function") };
}

function doctorAuthorityState() {
  if (currentAuthority !== null) return "valid";
  if (authorityReason !== null) return "rejected";
  return "none";
}

function doctorEffectiveToolReport(pi, role) {
  const observed = readActiveTools(pi);
  const actual = observed.ok ? observed.tools : [];
  const base = baseline ?? [];
  const authority = currentAuthority;
  const expected = role ? effectiveTools(base, role, authority) : [];
  const requested = authority?.envelope?.capabilities ?? [];
  const names = [...new Set([...base, ...CEILINGS[role] ?? [], "mcp_script", "write", "edit"])].sort();
  const effective = names.map((name) => {
    const active = actual.includes(name);
    const allowed = expected.includes(name);
    return {
      name,
      source: base.includes(name) ? "session_baseline" : "role_ceiling_or_authority",
      state: active ? "active" : (base.includes(name) || allowed ? "inactive" : "unavailable"),
      reason: active ? (allowed ? "effective_policy" : "policy_drift") : (base.includes(name) ? "human_disabled_or_not_applied" : "outside_role_ceiling"),
    };
  });
  return { actual, base, expected, requested, effective };
}

export async function buildDoctorReport(options = {}) {
  const ctx = options["ctx"] ?? {};
  const pi = options["pi"] ?? {};
  const now = options["now"];
  const reportId = options["reportId"];
  const startedAt = doctorNow(now);
  const env = envOf(ctx);
  const roleCheck = parseRole(env);
  const role = roleCheck.ok ? roleCheck.role : null;
  let activation = doctorActivation(roleCheck);
  const cwdValue = typeof ctx.cwd === "string" && ctx.cwd !== "" ? ctx.cwd : null;
  let cwd = null;
  if (cwdValue !== null) {
    try { cwd = await realpath(cwdValue); } catch { cwd = null; }
  }
  let repoRoot = null;
  if (cwd !== null) {
    const found = await findRepoRoot(cwd);
    if (found !== null) { try { repoRoot = await realpath(found); } catch { repoRoot = found; } }
  }
  const statusOutput = repoRoot === null ? null : await gitOut(repoRoot, ["status", "--porcelain=v1", "--untracked-files=all"], false);
  const head = repoRoot === null ? null : await gitOut(repoRoot, ["rev-parse", "HEAD"]);
  const branch = repoRoot === null ? null : await gitOut(repoRoot, ["branch", "--show-current"]);
  const statusLines = statusOutput === null ? [] : statusOutput.split(/\r?\n/).filter(Boolean);
  const untracked = statusLines.filter((line) => line.startsWith("??")).length;
  const staged = statusLines.filter((line) => !line.startsWith("??") && line[0] !== " ").length;
  const unstaged = statusLines.filter((line) => !line.startsWith("??") && line[1] !== " ").length;
  const dirty = statusLines.length;
  const cwdCheckStatus = cwd === null ? (role ? "BLOCKED" : "WARN") : "PASS";
  const repoStatus = repoRoot === null ? (role ? "BLOCKED" : "WARN") : "PASS";
  const checks = [];
  checks.push(doctorCheck("CONTEXT_CWD", "current Pi cwd", cwdCheckStatus, "ctx.cwd resolves to a readable canonical directory", cwd ?? "unavailable", [{ kind: "memory", source: "ctx.cwd", output: cwd }], { owner: "operator", action: "Start doctor with the current readable Pi cwd." }));
  checks.push(doctorCheck("GIT_REPOSITORY", "containing Git repository", repoStatus, "one canonical Git repository root contains cwd", repoRoot ?? "not found", [{ kind: "command", source: "git rev-parse --show-toplevel", output: repoRoot }], { owner: "operator", action: "Open the intended Git repository and rerun doctor." }));
  checks.push(doctorCheck("GIT_WORKTREE", "Git clean and dirty counts", repoRoot === null ? (role ? "BLOCKED" : "WARN") : "PASS", "read-only Git status is observable", repoRoot === null ? "unavailable" : JSON.stringify({ head, branch, staged, unstaged, untracked, dirty }), [{ kind: "command", source: "git status --porcelain=v1 --untracked-files=all", output: repoRoot === null ? null : JSON.stringify({ head, branch, staged, unstaged, untracked, dirty }) }], { owner: "human", action: "Review reported dirty files manually; doctor does not clean or stash them." }));

  const piFacts = doctorPiCapabilities(pi);
  checks.push(doctorCheck("PI_CAPABILITIES", "Pi read-only API and hook surface", piFacts.missing.length === 0 ? "PASS" : (role ? "BLOCKED" : "WARN"), "required Pi APIs are present", piFacts.missing.length === 0 ? "all required APIs present" : `missing ${piFacts.missing.join(", ")}`, [{ kind: "api", source: "Pi extension API", output: piFacts.observed.join(", ") }], { owner: "operator", action: "Use a Pi process exposing the required extension APIs." }));
  const packageSource = doctorPackageSource();
  const packageStatus = packageSource.scope === "temporary" ? "WARN" : "PASS";
  checks.push(doctorCheck("PACKAGE_PROVENANCE", "loaded extension provenance", packageStatus, "one canonical package source is observable", packageSource.source, [{ kind: "api", source: "import.meta.url", digest: packageSource.digest, output: packageSource.source }], { owner: "operator", action: "Load the reviewed package source once and rerun doctor." }));

  const paseo = await doctorPaseoObservation(ctx, env, role);
  const paseoIdentityStatus = role && (env[AGENT_ENV] ?? "").trim() === "" ? "BLOCKED"
    : role ? (paseo.status === "PASS" && paseo.observation?.agent_id === (env[AGENT_ENV] ?? "").trim() ? "PASS" : "BLOCKED") : "WARN";
  checks.push(doctorCheck("PASEO_IDENTITY", "Paseo current-agent identity", paseoIdentityStatus, role ? "PASEO_AGENT_ID is nonempty" : "identity is not required for passive mode", (env[AGENT_ENV] ?? "").trim() || "absent", [{ kind: "env", source: AGENT_ENV, output: (env[AGENT_ENV] ?? "").trim() ? "present" : "absent" }], { owner: "operator", action: "Set the exact Paseo agent identity before governed work." }));
  const observerOwner = role === "supervisor" ? "supervisor" : role === "lead" ? "lead" : "operator";
  checks.push(doctorCheck("ADAPTER_OBSERVER", "public current-agent observation capability", paseo.status, "the already-loaded adapter or Paseo CLI proves exact current-agent observation", paseo.reason, [{ kind: "api", source: paseo.observation?.source ?? "public current-agent observer", output: paseo.observation ? "verified" : "unavailable" }], { owner: observerOwner, action: paseo.status === "BLOCKED" ? "Start the Paseo daemon and verify the exact agent identity, then rerun doctor." : "Use a configured observer when governed live facts are needed." }));
  // Workspace binding and MCP-configuration attestation are required
  // observations that neither the installed pi-mcp-adapter (no Paseo
  // integration) nor the Paseo CLI currently proves. Capability-first: never
  // claimed as proven, surfaced as an explicit WARN with the exact pieces.
  const unverified = [];
  if (!paseo.observation?.workspace_id) unverified.push("workspace_binding");
  if (paseo.observation?.mcp_configuration_attested !== true) unverified.push("mcp_configuration_attestation");
  const attestationStatus = unverified.length === 0 ? "PASS" : "WARN";
  checks.push(doctorCheck("OBSERVER_ATTESTATION", "workspace binding and MCP-configuration attestation", attestationStatus, "the observation proves the typed workspace binding and MCP-configuration attestation", unverified.length === 0 ? "all attested" : `unverified: ${unverified.join(", ")}`, [{ kind: "api", source: "current observation tuple", output: unverified.length === 0 ? "attested" : unverified.join(", ") }], { owner: "operator", action: "Provide an observer that proves the typed workspace binding and MCP-configuration attestation, or accept the WARN as the environment ceiling.", applicable: role !== null, required: role !== null }));

  if (!roleCheck.ok) {
    checks.push(doctorCheck("ROLE_ACTIVATION", "role activation", "BLOCKED", "PI_PASEO_ORCHESTRATION_ROLE is supervisor|lead|peer or empty", roleCheck.error, [{ kind: "env", source: ROLE_ENV, output: redactDoctorText(env[ROLE_ENV] ?? "absent") }], { owner: "human", action: "Correct the role environment and start a fresh process." }));
  } else if (role === null) {
    checks.push(doctorCheck("ROLE_ACTIVATION", "role activation", "WARN", "an explicit governed role is optional", "UNGOVERNED", [{ kind: "env", source: ROLE_ENV, output: "absent" }], { owner: "human", action: "Set an explicit role only when governed orchestration is intended." }));
  } else if (latch === null) {
    checks.push(doctorCheck("ROLE_ACTIVATION", "role activation snapshot", "BLOCKED", "first successful activation snapshot is latched", "governed role has no activation snapshot", [], { owner: "operator", action: "Start a fresh governed Pi process and rerun doctor." }));
  } else {
    checks.push(doctorCheck("ROLE_ACTIVATION", "role activation snapshot", blockedReason ? "BLOCKED" : "PASS", "latched role and Paseo identity remain current", blockedReason ?? `${latch.role}/${latch.agentId}`, [{ kind: "memory", source: "process activation latch", output: `${latch.role}/${latch.agentId}` }], { owner: "operator", action: "Start a fresh process after correcting activation drift." }));
  }

  let settingsStatus = "PASS";
  let settingsObserved = "not applicable";
  let profileStatus = "PASS";
  let profileObserved = "not applicable";
  let latchVerification = null;
  if (role !== null) {
    if (latch === null) {
      settingsStatus = profileStatus = "BLOCKED";
      settingsObserved = profileObserved = "activation snapshot unavailable";
    } else {
      latchVerification = await verifyLatch(latch, env, configDir(env), ctx);
      try {
        const currentSettings = await readSettings(configDir(env));
        settingsObserved = currentSettings === null ? "missing" : (JSON.stringify(currentSettings) === JSON.stringify(latch.settings) ? "matches activation snapshot" : "drifted");
        if (settingsObserved !== "matches activation snapshot") settingsStatus = "BLOCKED";
      } catch (err) { settingsStatus = "BLOCKED"; settingsObserved = err.message; }
      try {
        const currentProfile = await readProfile(latch.profileDir, latch.role);
        profileObserved = profileDigest(currentProfile) === latch.profileDigest ? "matches activation snapshot" : "drifted";
        if (profileObserved !== "matches activation snapshot") profileStatus = "BLOCKED";
      } catch (err) { profileStatus = "BLOCKED"; profileObserved = err.message; }
      if (!latchVerification.ok) {
        activation = "blocked";
        if (/profile/.test(latchVerification.error)) profileStatus = "BLOCKED";
        if (/settings|runtime model|thinking level/.test(latchVerification.error)) {
          settingsStatus = "BLOCKED";
          settingsObserved = latchVerification.error;
        }
        const activationCheck = checks.find((check) => check.code === "ROLE_ACTIVATION");
        if (activationCheck) { activationCheck.status = "BLOCKED"; activationCheck.observed = latchVerification.error; }
      }
    }
  }
  checks.push(doctorCheck("ROLE_SETTINGS", "role model settings snapshot", settingsStatus, role ? "current settings equal the latched closed document" : "not applicable in passive mode", settingsObserved, [{ kind: "file", source: settingsPath(configDir(env)), output: role ? settingsObserved : null }], { owner: "human", action: "Restore the latched settings or start a fresh process; do not hot-switch a governed role.", applicable: role !== null, required: role !== null }));
  checks.push(doctorCheck("ROLE_PROFILE", "selected Role Profile snapshot", profileStatus, role ? "selected profile bytes equal the latched digest" : "not applicable in passive mode", profileObserved, [{ kind: "file", source: role ? latch?.profileDir ?? "unavailable" : "not applicable", digest: role ? latch?.profileDigest ? `sha256:${latch.profileDigest}` : null : null, output: role ? profileObserved : null }], { owner: "human", action: "Restore the selected profile or start a fresh process; doctor does not fall back.", applicable: role !== null, required: role !== null }));

  let protocol = null;
  if (repoRoot !== null) protocol = await readAndValidateProtocol(repoRoot);
  const protocolRequired = role !== null;
  let protocolStatus;
  let protocolObserved;
  if (protocol === null) { protocolStatus = protocolRequired ? "BLOCKED" : "WARN"; protocolObserved = "repository root unavailable"; }
  else if (!protocol.ok) { protocolStatus = protocolRequired ? "BLOCKED" : "WARN"; protocolObserved = protocol.error; }
  else {
    protocolObserved = JSON.stringify({ project_id: protocol.protocol.meta.project_id, version: protocol.protocol.meta.version, digest: protocol.protocol.digest });
    protocolStatus = "PASS";
    if (role === "lead" && protocolPin !== null && (protocol.protocol.digest !== protocolPin.digest || protocol.protocol.meta.version !== protocolPin.version || protocol.protocol.meta.project_id !== protocolPin.projectId)) {
      protocolStatus = "BLOCKED";
      protocolObserved = `pinned protocol drift: ${protocolObserved}`;
    }
  }
  checks.push(doctorCheck("WORKSPACE_PROTOCOL", "repository-root Workspace Protocol", protocolStatus, protocolRequired ? "strict protocol is valid and matches any current Lead pin" : "current protocol is informative in passive mode", protocolObserved, [{ kind: "file", source: repoRoot ? protocolPath(repoRoot) : "unavailable", digest: protocol?.ok ? protocol.protocol.digest : null, output: protocolObserved }], { owner: "lead", action: "Re-read the exact repository-root protocol, resolve drift with the Human, and rerun doctor.", applicable: repoRoot !== null, required: protocolRequired }));

  const toolReport = doctorEffectiveToolReport(pi, role);
  const missingCore = role ? requireBaselineTools(baseline, role) : { ok: true };
  const expectedActiveTools = baseline === null ? null : (lastAppliedTools ?? baseline);
  const toolDrift = role ? expectedActiveTools === null || !sameList(toolReport.actual, expectedActiveTools) : false;
  const toolStatus = !missingCore.ok || toolDrift || toolReport.actual.includes("mcp_script") ? (role ? "BLOCKED" : "WARN") : "PASS";
  checks.push(doctorCheck("TOOL_POLICY", "baseline, ceiling, authority, and effective tools", toolStatus, role ? "actual tools equal baseline ∩ role policy ∩ current authority" : "passive mode does not shape tools", JSON.stringify({ baseline: toolReport.base, ceiling: CEILINGS[role] ?? [], requested: toolReport.requested, effective: toolReport.actual }), [{ kind: "memory", source: "Pi active-tool API", output: JSON.stringify(toolReport.effective) }], { owner: "human", action: "Restore the Human-selected baseline and rerun the governed process; doctor never re-enables tools.", applicable: role !== null, required: role !== null }));
  const authorityState = doctorAuthorityState();
  const authorityStatus = blockedReason !== null ? "BLOCKED" : authorityState === "rejected" ? "WARN" : "PASS";
  checks.push(doctorCheck("AUTHORITY_STATE", "current-run Task Authority Envelope", authorityStatus, "doctor reports internal authority only; no authority is minted", authorityState, [{ kind: "memory", source: "extension authority state", output: currentAuthority ? JSON.stringify({ grant_kind: currentAuthority.envelope.grant_kind, task_id: currentAuthority.envelope.task_id, capabilities: currentAuthority.envelope.capabilities }) : authorityReason ?? "none" }], { owner: "human", action: "Submit a fresh direct Human grant only if the current run actually needs exceptional capability." }));

  checks.sort((left, right) => left.code.localeCompare(right.code));
  const overall = checks.reduce((worst, check) => DOCTOR_STATUS_RANK[check.status] > DOCTOR_STATUS_RANK[worst] ? check.status : worst, role === null ? "WARN" : "PASS");
  const paseoObservation = paseo.observation;
  const target = {
    cwd,
    repository_root: repoRoot,
    pi_session_id: ctx.sessionId ?? ctx.piSessionId ?? ctx.session?.id ?? null,
    paseo_agent_id: (env[AGENT_ENV] ?? "").trim() || null,
    workspace_id: paseoObservation?.workspace_id ?? paseoObservation?.workspace?.id ?? ctx.workspaceId ?? ctx.paseoWorkspaceId ?? null,
    paseo_project_id: paseoObservation?.project_id ?? paseoObservation?.workspace?.project_id ?? ctx.paseoProjectId ?? ctx.paseo_project_id ?? null,
    protocol_project_id: protocol?.ok ? protocol.protocol.meta.project_id : null,
    role,
  };
  const authorityEnvelope = currentAuthority?.envelope;
  const actualToolPolicy = {
    session_baseline: [...toolReport.base], role_ceiling: [...(CEILINGS[role] ?? [])], authority_state: authorityState,
    requested_capabilities: [...toolReport.requested],
    effective_tools: toolReport.effective,
  };
  const report = {
    report_id: reportId ?? `doctor-${randomUUID()}`,
    started_at: startedAt,
    finished_at: doctorNow(now),
    doctor: { contract_version: "v1", package_version: "unknown", source: packageSource },
    overall_status: overall,
    activation,
    target,
    compatibility: [
      { component: "adapter", version: null, strategy: "capability", required_capabilities: ["public-current-agent-observer"], missing_capabilities: paseo.status === "PASS" ? [] : ["public-current-agent-observer"], floor: null, status: paseo.status },
      { component: "paseo-client", version: null, strategy: "capability", required_capabilities: ["current-agent-observer"], missing_capabilities: paseo.status === "PASS" ? [] : ["current-agent-observer"], floor: null, status: paseo.status },
      { component: "paseo-daemon", version: null, strategy: "capability", required_capabilities: ["current-agent-observer"], missing_capabilities: paseo.status === "PASS" ? [] : ["current-agent-observer"], floor: null, status: paseo.status },
      { component: "pi", version: null, strategy: "capability", required_capabilities: piFacts.observed, missing_capabilities: piFacts.missing, floor: null, status: piFacts.missing.length === 0 ? "PASS" : (role ? "BLOCKED" : "WARN") },
    ],
    checks,
    policy: actualToolPolicy,
    mutations: { attempted: false, performed: false },
    limitations: [
      "not acceptance or authority",
      "not a sandbox, authentication, authorization, or security guarantee",
      "not current task/lifecycle truth; notebook evidence is historical only",
      "Human/profile/protocol semantics are not cryptographically proven",
    ],
  };
  // Keep the authority variable intentionally local to the observation block;
  // it is not included in raw prompt form and does not alter current authority.
  void authorityEnvelope;
  if (paseo.status === "PASS") {
    const finalPaseo = await doctorPaseoObservation(ctx, env, role);
    if (finalPaseo.status !== "PASS" || canonicalNotebookJson(finalPaseo.observation) !== canonicalNotebookJson(paseo.observation)) {
      checks.push(doctorCheck("OBSERVATION_DRIFT", "critical Paseo identity recheck", "BLOCKED", "the bounded observation remained identical through output", finalPaseo.reason, [{ kind: "api", source: "public current-agent observer", output: finalPaseo.status }], { owner: "operator", action: "Start a fresh governed process and rerun doctor." }));
      checks.sort((left, right) => left.code.localeCompare(right.code));
      report.checks = checks;
      report.overall_status = "BLOCKED";
    }
  }
  return report;
}

export function formatDoctorReport(report) {
  return `${DOCTOR_REPORT_BEGIN}\n${canonicalNotebookJson(report)}\n${DOCTOR_REPORT_END}`;
}

export function formatDoctorTable(report) {
  const lines = [
    `Doctor ${report.overall_status} | target=${report.target.cwd ?? "unavailable"} | repo=${report.target.repository_root ?? "unavailable"}`,
    "STATUS | CODE | OBSERVED | REMEDIATION",
  ];
  for (const check of report.checks) {
    lines.push(`${check.status} | ${check.code} | ${check.observed} | ${check.remediation.action ?? "none"}`);
  }
  lines.push(`authority=${report.policy.authority_state} tools=${report.policy.effective_tools.filter((tool) => tool.state === "active").map((tool) => tool.name).join(",") || "none"}`);
  lines.push(`limitations=${report.limitations.join("; ")}`);
  return lines.join("\n");
}

function validateDoctorNullableString(value, label) {
  return value === null || (typeof value === "string" && value.trim() !== "")
    ? { ok: true }
    : { ok: false, error: `${label} must be null or a nonempty string` };
}

function validateDoctorStringArray(value, label) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim() !== "")
    ? { ok: true }
    : { ok: false, error: `${label} must be an array of nonempty strings` };
}

function validateDoctorEvidence(item) {
  if (!isRecord(item)) return { ok: false, error: "doctor evidence must be an object" };
  const fields = ["kind", "source", "digest", "exit_code", "output"];
  const closed = notebookClosed(item, fields, "doctor evidence");
  if (!closed.ok) return { ok: false, error: closed.error };
  if (typeof item.kind !== "string" || item.kind.trim() === "") return { ok: false, error: "doctor evidence.kind must be nonempty" };
  if (typeof item.source !== "string" || item.source.trim() === "") return { ok: false, error: "doctor evidence.source must be nonempty" };
  if (item.digest !== null && !NOTEBOOK_DIGEST.test(item.digest)) return { ok: false, error: "doctor evidence.digest must be null or sha256 digest" };
  if (item.exit_code !== null && !Number.isInteger(item.exit_code)) return { ok: false, error: "doctor evidence.exit_code must be null or an integer" };
  if (item.output !== null && typeof item.output !== "string") return { ok: false, error: "doctor evidence.output must be null or a string" };
  return { ok: true };
}

export function parseDoctorReport(text) {
  if (typeof text !== "string") return { ok: false, error: "doctor report must be a string" };
  const stripped = text.trim();
  if (!stripped.startsWith(`${DOCTOR_REPORT_BEGIN}\n`) || !stripped.endsWith(`\n${DOCTOR_REPORT_END}`)) return { ok: false, error: "doctor report markers are malformed" };
  const body = stripped.slice(DOCTOR_REPORT_BEGIN.length + 1, -DOCTOR_REPORT_END.length - 1);
  const duplicate = findDuplicateKey(body);
  if (duplicate !== null) return { ok: false, error: `duplicate field ${JSON.stringify(duplicate)} in doctor report` };
  let report;
  try { report = JSON.parse(body); } catch { return { ok: false, error: "doctor report body is not valid JSON" }; }
  const fields = ["report_id", "started_at", "finished_at", "doctor", "overall_status", "activation", "target", "compatibility", "checks", "policy", "mutations", "limitations"];
  let check = notebookClosed(report, fields, "doctor report");
  if (!check.ok) return { ok: false, error: check.error };
  check = notebookId(report.report_id, "doctor report.report_id"); if (!check.ok) return { ok: false, error: check.error };
  for (const field of ["started_at", "finished_at"]) { check = notebookTimestamp(report[field], `doctor report.${field}`); if (!check.ok) return { ok: false, error: check.error }; }
  if (!DOCTOR_STATUSES.includes(report.overall_status)) return { ok: false, error: "doctor report.overall_status is invalid" };
  if (!["governed", "ungoverned", "blocked"].includes(report.activation)) return { ok: false, error: "doctor report.activation is invalid" };
  check = notebookClosed(report.doctor, ["contract_version", "package_version", "source"], "doctor report.doctor"); if (!check.ok) return { ok: false, error: check.error };
  if (report.doctor.contract_version !== "v1" || typeof report.doctor.package_version !== "string") return { ok: false, error: "doctor report doctor metadata is malformed" };
  check = notebookClosed(report.doctor.source, ["scope", "origin", "source", "digest"], "doctor report source"); if (!check.ok) return { ok: false, error: check.error };
  for (const field of ["scope", "origin", "source"]) { check = notebookText(report.doctor.source[field], `doctor report source.${field}`, 2000); if (!check.ok) return { ok: false, error: check.error }; }
  check = notebookDigestField(report.doctor.source.digest, "doctor report source.digest"); if (!check.ok) return { ok: false, error: check.error };
  check = notebookClosed(report.target, ["cwd", "repository_root", "pi_session_id", "paseo_agent_id", "workspace_id", "paseo_project_id", "protocol_project_id", "role"], "doctor report target"); if (!check.ok) return { ok: false, error: check.error };
  for (const field of ["cwd", "repository_root", "pi_session_id", "paseo_agent_id", "workspace_id", "paseo_project_id", "protocol_project_id"]) { check = validateDoctorNullableString(report.target[field], `doctor report target.${field}`); if (!check.ok) return { ok: false, error: check.error }; }
  if (report.target.role !== null && !ROLES.includes(report.target.role)) return { ok: false, error: "doctor report target.role is invalid" };
  if (!Array.isArray(report.compatibility) || !Array.isArray(report.checks) || !Array.isArray(report.limitations)) return { ok: false, error: "doctor report arrays are malformed" };
  let previous = "";
  for (const component of report.compatibility) {
    check = notebookClosed(component, ["component", "version", "strategy", "required_capabilities", "missing_capabilities", "floor", "status"], "doctor compatibility"); if (!check.ok) return { ok: false, error: check.error };
    if (typeof component.component !== "string" || component.component <= previous) return { ok: false, error: "doctor compatibility must be deterministically ordered" };
    previous = component.component;
    if (!DOCTOR_STATUSES.includes(component.status) || !["capability", "floor"].includes(component.strategy)
        || !Array.isArray(component.required_capabilities) || !Array.isArray(component.missing_capabilities)
        || !component.required_capabilities.every((item) => typeof item === "string")
        || !component.missing_capabilities.every((item) => typeof item === "string")) return { ok: false, error: "doctor compatibility item is malformed" };
    check = validateDoctorNullableString(component.version, "doctor compatibility.version"); if (!check.ok) return { ok: false, error: check.error };
    check = validateDoctorNullableString(component.floor, "doctor compatibility.floor"); if (!check.ok) return { ok: false, error: check.error };
  }
  const codes = new Set();
  let previousCode = "";
  for (const item of report.checks) {
    check = notebookClosed(item, ["code", "subject", "applicable", "required", "status", "expected", "observed", "evidence", "remediation"], "doctor check"); if (!check.ok) return { ok: false, error: check.error };
    if (codes.has(item.code)) return { ok: false, error: "doctor check codes must be unique" };
    codes.add(item.code);
    if (typeof item.code !== "string" || item.code.trim() === "" || item.code <= previousCode) return { ok: false, error: "doctor checks must be deterministically ordered" };
    previousCode = item.code;
    if (DOCTOR_STATUSES.includes(item.status) === false || typeof item.applicable !== "boolean" || typeof item.required !== "boolean" || !Array.isArray(item.evidence)) return { ok: false, error: "doctor check is malformed" };
    for (const field of ["subject", "expected", "observed"]) { check = notebookText(item[field], `doctor check.${field}`, 4000); if (!check.ok) return { ok: false, error: check.error }; }
    for (const evidence of item.evidence) { check = validateDoctorEvidence(evidence); if (!check.ok) return { ok: false, error: check.error }; }
    check = notebookClosed(item.remediation, ["owner", "action", "commands", "rerun_required"], "doctor remediation"); if (!check.ok) return { ok: false, error: check.error };
    if (item.remediation.owner !== null && !["human", "operator", "lead", "supervisor"].includes(item.remediation.owner)) return { ok: false, error: "doctor remediation.owner is invalid" };
    check = validateDoctorNullableString(item.remediation.action, "doctor remediation.action"); if (!check.ok) return { ok: false, error: check.error };
    if (!Array.isArray(item.remediation.commands) || typeof item.remediation.rerun_required !== "boolean") return { ok: false, error: "doctor remediation is malformed" };
    for (const command of item.remediation.commands) {
      check = notebookClosed(command, ["command", "mutates"], "doctor remediation command"); if (!check.ok) return { ok: false, error: check.error };
      if (typeof command.command !== "string" || typeof command.mutates !== "boolean") return { ok: false, error: "doctor remediation command is malformed" };
    }
  }
  check = notebookClosed(report.policy, ["session_baseline", "role_ceiling", "authority_state", "requested_capabilities", "effective_tools"], "doctor policy"); if (!check.ok) return { ok: false, error: check.error };
  for (const field of ["session_baseline", "role_ceiling", "requested_capabilities"]) { check = validateDoctorStringArray(report.policy[field], `doctor policy.${field}`); if (!check.ok) return { ok: false, error: check.error }; }
  if (!["none", "valid", "rejected", "stale_inactive"].includes(report.policy.authority_state)) return { ok: false, error: "doctor policy authority_state is invalid" };
  if (!Array.isArray(report.policy.effective_tools)) return { ok: false, error: "doctor policy.effective_tools must be an array" };
  for (const tool of report.policy.effective_tools) {
    check = notebookClosed(tool, ["name", "source", "state", "reason"], "doctor policy tool"); if (!check.ok) return { ok: false, error: check.error };
    if (typeof tool.name !== "string" || typeof tool.source !== "string" || !["active", "inactive", "unavailable"].includes(tool.state) || typeof tool.reason !== "string") return { ok: false, error: "doctor policy tool is malformed" };
  }
  check = notebookClosed(report.mutations, ["attempted", "performed"], "doctor mutations"); if (!check.ok) return { ok: false, error: check.error };
  if (report.mutations.attempted !== false || report.mutations.performed !== false) return { ok: false, error: "doctor report must assert no mutation" };
  if (report.limitations.some((item) => typeof item !== "string" || item.trim() === "")) return { ok: false, error: "doctor limitations must be nonempty strings" };
  return { ok: true, report };
}

export async function runDoctor(args, ctx, pi) {
  const hasAlternateTarget = (typeof args === "string" && args.trim() !== "")
    || (isRecord(args) && Object.keys(args).length > 0);
  if (hasAlternateTarget) return { ok: false, error: "doctor does not accept an alternate target" };
  const mode = doctorMode(ctx);
  const notify = ctx?.ui?.notify ?? ctx?.rpc?.notify ?? ctx?.emit;
  if (mode === null || typeof notify !== "function") {
    const error = "OUTPUT_CHANNEL_UNAVAILABLE";
    if (typeof notify === "function" && ctx.outputMode !== "print" && ctx.outputMode !== "json") notify(error, "error");
    return { ok: false, error };
  }
  if (latch !== null) {
    const tools = await ensureToolPolicy(pi);
    if (!tools.ok) return { ok: false, error: "error" in tools ? tools.error : "active-tool policy cannot be re-applied" };
  }
  const report = await buildDoctorReport({ ctx, pi });
  const block = formatDoctorReport(report);
  const table = formatDoctorTable(report);
  // Both outputs are ephemeral command-channel messages; nothing is written to
  // transcript/session state by this extension.
  notify(block, "info");
  notify(table, "info");
  return { ok: true, mode, report, block, table };
}

// ─── Slash-command authority routes ──────────────────────────────────────────

// Both routes are idle-only: they run only when the process is latched to the
// right role, is not blocked, and has no agent run in flight. Each collects
// the grant fields, shows the complete draft, requires explicit Human
// confirmation, and stores the envelope as a pending authority that the next
// input event activates through the same activateEnvelope path as every other
// grant. Cancel, incomplete, or invalid drafts preserve and store nothing.
function processIsIdle(ctx) {
  if (typeof ctx.isIdle === "function") return ctx.isIdle();
  return false; // idle is not observable → fail closed
}

async function runLeadTiny(_args, ctx) {
  const notify = (message, level) => ctx.ui?.notify?.(message, level);
  if (latch === null || latch.role !== "lead") {
    notify("pi-paseo-orchestration: lead-tiny is available only to an active lead process", "error");
    return;
  }
  if (blockedReason !== null) {
    notify(`pi-paseo-orchestration blocked: ${blockedReason}`, "error");
    return;
  }
  if (!processIsIdle(ctx)) {
    notify("pi-paseo-orchestration: lead-tiny requires an idle process; wait for the current run to settle", "error");
    return;
  }
  const env = envOf(ctx);
  if (!(await verifyOrBlock(ctx, configDir(env)))) return;
  const pin = await ensureProtocolPin();
  if (!pin.ok) {
    blockWith(ctx, pin.error);
    return;
  }
  const ui = ctx.ui ?? {};
  if (typeof ui.input !== "function" || typeof ui.select !== "function" || typeof ui.confirm !== "function") {
    notify("pi-paseo-orchestration: interactive input is unavailable in this mode; no pending authority stored", "error");
    return;
  }
  const cancelled = () => {
    notify("Cancelled; no pending authority stored.", "info");
    return null;
  };
  const taskId = await ui.input("Task ID for the tiny Lead grant:", "");
  if (!taskId) return cancelled();
  const objective = await ui.input("Bounded objective for the tiny Lead run:", "");
  if (!objective) return cancelled();
  const capabilityChoice = await ui.select("Capabilities for this run:", ["edit", "local_commit", "edit,local_commit"]);
  if (!capabilityChoice) return cancelled();
  const capabilities = capabilityChoice.split(",");
  const scope = await ui.input("Repository-relative writable scope:", "");
  if (!scope) return cancelled();
  const exclusionsRaw = await ui.input("In-scope exclusions (comma-separated; optional):", "");
  if (exclusionsRaw === undefined) return cancelled();
  const exclusions = exclusionsRaw.split(",").map((s) => s.trim()).filter((s) => s !== "");
  let base;
  if (capabilities.includes("local_commit")) {
    const head = await gitOut(protocolPin.repoRoot, ["rev-parse", "HEAD"]);
    if (head === null) {
      notify("Cannot resolve a full HEAD commit as the candidate base; no pending authority stored.", "error");
      return;
    }
    base = head;
  }
  const draft = {
    version: 1,
    grant_kind: "lead_tiny",
    role: "lead",
    issuer: "human",
    agent_id: latch.agentId,
    task_id: taskId,
    objective,
    capabilities,
    scope,
    exclusions,
    protocol_digest: protocolPin.digest,
    ...(base !== undefined ? { base } : {}),
  };
  const check = validateEnvelopeShape(draft);
  if (!check.ok) {
    notify(`Invalid grant draft (${check.error}); no pending authority stored.`, "error");
    return;
  }
  const scopeCheck = await validateScope(protocolPin.repoRoot, check.envelope.scope, check.envelope.exclusions);
  if (!scopeCheck.ok) {
    notify(`Invalid grant scope (${scopeCheck.error}); no pending authority stored.`, "error");
    return;
  }
  const confirmed = await ui.confirm("Store this grant as a pending authority for the next run?", JSON.stringify(check.envelope, null, 2));
  if (!confirmed) {
    notify("Not stored; no pending authority.", "info");
    return;
  }
  pendingAuthority = check.envelope;
  notify("Pending authority stored; it activates on the next input event.", "info");
}

async function runSupervisorRecovery(_args, ctx) {
  const notify = (message, level) => ctx.ui?.notify?.(message, level);
  if (latch === null || latch.role !== "supervisor") {
    notify("pi-paseo-orchestration: supervisor-recovery is available only to an active supervisor process", "error");
    return;
  }
  if (blockedReason !== null) {
    notify(`pi-paseo-orchestration blocked: ${blockedReason}`, "error");
    return;
  }
  if (!processIsIdle(ctx)) {
    notify("pi-paseo-orchestration: supervisor-recovery requires an idle process; wait for the current run to settle", "error");
    return;
  }
  if (!(await verifyOrBlock(ctx, configDir(envOf(ctx))))) return;
  const ui = ctx.ui ?? {};
  if (typeof ui.input !== "function" || typeof ui.select !== "function" || typeof ui.confirm !== "function") {
    notify("pi-paseo-orchestration: interactive input is unavailable in this mode; no pending authority stored", "error");
    return;
  }
  const cancelled = () => {
    notify("Cancelled; no pending authority stored.", "info");
    return null;
  };
  const taskId = await ui.input("Task ID for the recovery grant:", "");
  if (!taskId) return cancelled();
  const objective = await ui.input("Bounded objective for the replacement Lead:", "");
  if (!objective) return cancelled();
  const provider = await ui.input("Human-attested Paseo provider alias for the replacement Lead:", "");
  if (!provider) return cancelled();
  const workspaceId = await ui.input("Paseo workspace ID for the replacement Lead:", "");
  if (!workspaceId) return cancelled();
  const handoffId = await ui.input("Handoff ID:", "");
  if (!handoffId) return cancelled();
  const draft = {
    version: 1,
    grant_kind: "supervisor_recovery",
    role: "lead",
    issuer: "human",
    agent_id: latch.agentId,
    task_id: taskId,
    objective,
    provider,
    workspace_id: workspaceId,
    handoff_id: handoffId,
  };
  const check = validateEnvelopeShape(draft);
  if (!check.ok) {
    notify(`Invalid grant draft (${check.error}); no pending authority stored.`, "error");
    return;
  }
  const confirmed = await ui.confirm("Store this recovery grant as a pending authority for the next run?", JSON.stringify(check.envelope, null, 2));
  if (!confirmed) {
    notify("Not stored; no pending authority.", "info");
    return;
  }
  pendingAuthority = check.envelope;
  notify("Pending authority stored; it activates on the next input event.", "info");
}

// Thinking levels the closed settings document may store. The picker filters
// these per selected model via Model.thinkingLevelMap (null marks unsupported);
// without a map the full closed set is offered and activation fails closed if
// the runtime clamps.
export function thinkingLevelsFor(model) {
  if (!model?.reasoning) return ["off"];
  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level];
    if (mapped === null) return false;
    return level !== "xhigh" && level !== "max" || mapped !== undefined;
  });
}

// ctx.ui.custom exposes raw terminal input but this local package cannot resolve
// pi-tui from its source directory. These are the standard sequences needed by
// the small settings controls; tests without custom UI retain the built-in
// select fallback.
function key(data, name, keybindings) {
  const action = {
    up: "tui.select.up",
    down: "tui.select.down",
    left: "tui.editor.cursorLeft",
    right: "tui.editor.cursorRight",
    tab: "tui.input.tab",
    enter: "tui.select.confirm",
    escape: "tui.select.cancel",
    ctrlC: "tui.select.cancel",
  }[name];
  if (typeof keybindings?.matches === "function" && keybindings.matches(data, action)) return true;
  return ({ up: "\u001b[A", down: "\u001b[B", right: "\u001b[C", left: "\u001b[D", tab: "\t", enter: "\r", escape: "\u001b", ctrlC: "\u0003" })[name] === data
    || (name === "enter" && data === "\n");
}

async function selectWizard(ctx, title, options, initial = null) {
  if (typeof ctx.ui?.custom !== "function") return { fallback: true };
  let index = Math.max(0, options.indexOf(initial));
  const value = await ctx.ui.custom((tui, _theme, keybindings, done) => ({
    render: (width) => {
      const lines = [title, ""];
      options.forEach((option, i) => lines.push(`${i === index ? "→ " : "  "}${option}`));
      lines.push("", "↑↓ navigate · enter select · esc back (esc at the start cancels)");
      return lines.map((line) => line.slice(0, width));
    },
    invalidate: () => {},
    handleInput: (data) => {
      if (key(data, "up", keybindings)) { index = (index - 1 + options.length) % options.length; tui.requestRender(); }
      else if (key(data, "down", keybindings)) { index = (index + 1) % options.length; tui.requestRender(); }
      else if (key(data, "enter", keybindings)) done(options[index]);
      else if (key(data, "escape", keybindings) || key(data, "ctrlC", keybindings)) done(null);
    },
  }));
  return { value };
}

export async function confirmSettings(ctx, title, body) {
  if (typeof ctx.ui?.custom !== "function") return ctx.ui.confirm(title, body);
  const lines = body.split("\n");
  let offset = 0;
  const pageSize = 14;
  return ctx.ui.custom((tui, _theme, keybindings, done) => ({
    render: (width) => [
      title,
      `showing lines ${offset + 1}-${Math.min(offset + pageSize, lines.length)} of ${lines.length}`,
      "",
      ...lines.slice(offset, offset + pageSize),
      "",
      "↑↓ scroll · enter confirm · esc cancel",
    ].map((line) => line.slice(0, width)),
    invalidate: () => {},
    handleInput: (data) => {
      if (key(data, "up", keybindings)) { offset = Math.max(0, offset - 1); tui.requestRender(); }
      else if (key(data, "down", keybindings)) { offset = Math.min(Math.max(0, lines.length - pageSize), offset + 1); tui.requestRender(); }
      else if (key(data, "enter", keybindings)) done(true);
      else if (key(data, "escape", keybindings) || key(data, "ctrlC", keybindings)) done(false);
    },
  }));
}

async function pickModelSelection(ctx, models, providers, label, cancelAtStart = false, includeThinking = true, initial = null, restart = false) {
  const known = models.some((entry) => entry.provider === initial?.provider && entry.id === initial?.model);
  let provider = known && !restart ? initial.provider : null;
  let model = provider ? initial.model : null;
  while (true) {
    if (provider === null) {
      const providerOptions = providers;
      const res = await selectWizard(ctx, `Provider for ${label}:`, providerOptions, known ? initial.provider : null);
      const choice = res.fallback ? await ctx.ui.select(`Provider for ${label}:`, providerOptions) : res.value;
      if (choice === null || choice === undefined) return cancelAtStart ? null : { back: true };
      provider = choice;
    }
    if (model === null) {
      const ids = models.filter((entry) => entry.provider === provider).map((entry) => entry.id).sort();
      const res = await selectWizard(ctx, `Model for ${label}:`, ids, provider === initial?.provider ? initial.model : null);
      const choice = res.fallback ? await ctx.ui.select(`Model for ${label}:`, ids) : res.value;
      if (choice === null || choice === undefined) { provider = null; continue; }
      model = choice;
    }
    const modelEntry = models.find((entry) => entry.provider === provider && entry.id === model);
    if (!includeThinking) return { provider, model };
    const levels = thinkingLevelsFor(modelEntry);
    const res = await selectWizard(ctx, `Thinking level for ${label}:`, levels, initial?.thinking);
    const thinking = res.fallback ? await ctx.ui.select(`Thinking level for ${label}:`, levels) : res.value;
    if (thinking === null || thinking === undefined) { model = null; continue; }
    return { provider, model, thinking };
  }
}

export async function pickPeerRouteSelections(ctx, models, providers, initialRoutes = {}) {
  const routeNames = [...new Set([...Object.keys(DEFAULT_PEER_ROUTES), ...Object.keys(initialRoutes)])];
  if (typeof ctx.ui?.custom !== "function") {
    const result = [];
    for (const route of routeNames) {
      const selection = await pickModelSelection(ctx, models, providers, `Peer route ${route}`, false, true, initialRoutes[route]);
      if (selection?.back) return null;
      result.push({ route, ...selection });
    }
    return result;
  }
  const rows = routeNames.map((route) => {
    const initial = initialRoutes[route];
    const known = models.some((entry) => entry.provider === initial?.provider && entry.id === initial?.model);
    const provider = known ? initial.provider : providers[0];
    const model = known ? initial.model : models.filter((entry) => entry.provider === provider).map((entry) => entry.id).sort()[0];
    const levels = thinkingLevelsFor(models.find((entry) => entry.provider === provider && entry.id === model));
    return { route, provider, model, thinking: levels.includes(initial?.thinking) ? initial.thinking : levels[0] };
  });
  const fields = ["provider", "model", "thinking"];
  let rowIndex = 0;
  let fieldIndex = 0;
  const values = (row, field) => field === "provider"
    ? providers
    : field === "model"
      ? models.filter((entry) => entry.provider === row.provider).map((entry) => entry.id).sort()
      : thinkingLevelsFor(models.find((entry) => entry.provider === row.provider && entry.id === row.model));
  return ctx.ui.custom((tui, _theme, keybindings, done) => ({
    render: (width) => {
      const lines = ["Peer route models", "↑↓ route · tab field · ←→ value · enter apply all · esc back", ""];
      for (const [i, row] of rows.entries()) {
        const cells = fields.map((field, j) => j === fieldIndex && i === rowIndex ? `[${row[field]}]` : row[field]);
        lines.push(`${i === rowIndex ? "→ " : "  "}${row.route.padEnd(13)} ${cells.join("  ")}`);
      }
      return lines.map((line) => line.slice(0, width));
    },
    invalidate: () => {},
    handleInput: (data) => {
      if (key(data, "up", keybindings)) rowIndex = (rowIndex - 1 + rows.length) % rows.length;
      else if (key(data, "down", keybindings)) rowIndex = (rowIndex + 1) % rows.length;
      else if (key(data, "tab", keybindings)) fieldIndex = (fieldIndex + 1) % fields.length;
      else if (key(data, "left", keybindings) || key(data, "right", keybindings)) {
        const row = rows[rowIndex];
        const field = fields[fieldIndex];
        const options = values(row, field);
        const step = key(data, "left", keybindings) ? -1 : 1;
        row[field] = options[(options.indexOf(row[field]) + step + options.length) % options.length];
        if (field === "provider") row.model = values(row, "model")[0];
        if (field !== "thinking") row.thinking = values(row, "thinking")[0];
      } else if (key(data, "enter", keybindings)) { done(rows); return; }
      else if (key(data, "escape", keybindings) || key(data, "ctrlC", keybindings)) { done(null); return; }
      tui.requestRender();
    },
  }));
}

export function paseoConfigPath(env = process.env, home = homedir()) {
  return join(env.PASEO_HOME || join(home, ".paseo"), "config.json");
}

export async function installPaseoProfiles(env = process.env) {
  const target = paseoConfigPath(env);
  let config;
  try {
    config = JSON.parse(await readFile(target, "utf8"));
  } catch (err) {
    throw new Error(`Paseo config read failed at ${target}: ${err.message}`);
  }
  if (!isRecord(config)) throw new Error("Paseo config must be a JSON object");
  const providers = isRecord(config.agents?.providers) ? config.agents.providers : {};
  const next = {
    ...config,
    agents: {
      ...(isRecord(config.agents) ? config.agents : {}),
      providers: {
        ...providers,
        "ppo-supervisor": { extends: "pi", label: "PPO Supervisor", enabled: true, env: { PI_PASEO_ORCHESTRATION_ROLE: "supervisor" } },
        "ppo-lead": { extends: "pi", label: "PPO Lead", enabled: true, env: { PI_PASEO_ORCHESTRATION_ROLE: "lead", PI_PASEO_ORCHESTRATION_PEER_ALIAS: "ppo-peer" } },
        "ppo-peer": { extends: "pi", label: "PPO Peer", enabled: true, env: { PI_PASEO_ORCHESTRATION_ROLE: "peer" } },
      },
    },
  };
  const tmp = `${target}.tmp`;
  try {
    await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await rename(tmp, target);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw new Error(`Paseo config write failed: ${err.message}`);
  }
  return target;
}

async function runSettings(_args, ctx) {
  const notify = (message, level) => ctx.ui?.notify?.(message, level);
  const env = ctx.env ?? process.env;
  const action = await ctx.ui.select("PPO settings:", ["Paseo profiles", "Role models"]);
  if (action === null || action === undefined) { notify("Cancelled; settings unchanged.", "info"); return; }
  if (action === "Paseo profiles") {
    const confirmed = await ctx.ui.confirm("Install or update PPO Paseo profiles?", "Only agents.providers.ppo-supervisor, ppo-lead, and ppo-peer will be replaced.");
    if (!confirmed) { notify("Not written; Paseo config unchanged.", "info"); return; }
    try {
      const path = await installPaseoProfiles(env);
      notify(`PPO Paseo profiles written to ${path}. Restart Paseo before creating new agents.`, "info");
    } catch (err) { notify(err.message, "error"); }
    return;
  }

  const dir = configDir(env);
  let prior;
  try { prior = await readSettings(dir); } catch (err) { notify(err.message, "error"); return; }
  const models = ctx.modelRegistry?.getAvailable?.() ?? [];
  const providers = [...new Set(models.map((entry) => entry.provider))].sort();
  if (providers.length === 0) { notify("No models available in the current model registry; settings unchanged.", "error"); return; }
  const cancelNote = prior ? "Cancelled; settings unchanged." : "Cancelled; no settings written.";

  let roles;
  let peerRoutes;
  if (prior) {
    roles = structuredClone(prior.roles);
    peerRoutes = structuredClone(prior.peer_routes);
    if (!peerRoutes.reviewer) peerRoutes.reviewer = { ...structuredClone(peerRoutes.general ?? peerRoutes.fast), description: DEFAULT_PEER_ROUTES.reviewer };
    const target = await ctx.ui.select("Edit saved model settings:", ["Configure all settings", "Supervisor", "Lead", "Peer routes", "Add custom route", "Review without changes"]);
    if (target === null || target === undefined) { notify(cancelNote, "info"); return; }
    if (target === "Configure all settings") {
      roles = {};
      for (const role of ["supervisor", "lead"]) {
        const selection = await pickModelSelection(ctx, models, providers, role, role === "supervisor", true, prior.roles[role], true);
        if (!selection || selection.back) { notify(cancelNote, "info"); return; }
        roles[role] = selection;
      }
      const peerMode = await ctx.ui.select("Peer routes:", ["Use one model for all built-in routes", "Edit routes in one table"]);
      if (peerMode === null || peerMode === undefined) { notify(cancelNote, "info"); return; }
      if (peerMode === "Use one model for all built-in routes") {
        const selection = await pickModelSelection(ctx, models, providers, "all built-in Peer routes", true, true, peerRoutes.fast, true);
        if (!selection || selection.back) { notify(cancelNote, "info"); return; }
        for (const [route, description] of Object.entries(DEFAULT_PEER_ROUTES)) peerRoutes[route] = { description, ...selection };
      } else {
        const selections = await pickPeerRouteSelections(ctx, models, providers, peerRoutes);
        if (!selections) { notify(cancelNote, "info"); return; }
        for (const { route, provider, model, thinking } of selections) peerRoutes[route] = { description: peerRoutes[route]?.description ?? DEFAULT_PEER_ROUTES[route], provider, model, thinking };
      }
    } else if (target === "Supervisor" || target === "Lead") {
      const role = target.toLowerCase();
      const selection = await pickModelSelection(ctx, models, providers, role, true, true, roles[role], true);
      if (!selection || selection.back) { notify(cancelNote, "info"); return; }
      roles[role] = selection;
    } else if (target === "Peer routes") {
      const peerMode = await ctx.ui.select("Peer routes:", ["Use one model for all built-in routes", "Edit routes in one table"]);
      if (peerMode === null || peerMode === undefined) { notify(cancelNote, "info"); return; }
      if (peerMode === "Use one model for all built-in routes") {
        const selection = await pickModelSelection(ctx, models, providers, "all built-in Peer routes", true, true, peerRoutes.fast, true);
        if (!selection || selection.back) { notify(cancelNote, "info"); return; }
        for (const [route, description] of Object.entries(DEFAULT_PEER_ROUTES)) peerRoutes[route] = { description, ...selection };
      } else {
        const selections = await pickPeerRouteSelections(ctx, models, providers, peerRoutes);
        if (!selections) { notify(cancelNote, "info"); return; }
        for (const { route, provider, model, thinking } of selections) {
          peerRoutes[route] = { description: peerRoutes[route]?.description ?? DEFAULT_PEER_ROUTES[route], provider, model, thinking };
        }
      }
    } else if (target === "Add custom route") {
      const route = (await ctx.ui.input("Custom route ID (lowercase letters, numbers, _ or -):"))?.trim();
      if (!ROUTE_ID.test(route ?? "") || Object.prototype.hasOwnProperty.call(peerRoutes, route)) { notify("Custom route ID is invalid or already used.", "error"); return; }
      const description = (await ctx.ui.input(`Description for ${route}:`))?.trim();
      if (!description || description.length > 240) { notify("Description must be 1-240 characters.", "error"); return; }
      const selection = await pickModelSelection(ctx, models, providers, `Peer route ${route}`, true);
      if (!selection || selection.back) { notify(cancelNote, "info"); return; }
      peerRoutes[route] = { description, ...selection };
    }
  } else {
    roles = {};
    for (const role of ["supervisor", "lead"]) {
      const selection = await pickModelSelection(ctx, models, providers, role, role === "supervisor");
      if (!selection || selection.back) { notify(cancelNote, "info"); return; }
      roles[role] = selection;
    }
    peerRoutes = {};
    const peerMode = await ctx.ui.select("Peer routes:", ["Use one model for all routes", "Configure each route individually"]);
    if (peerMode === null || peerMode === undefined) { notify(cancelNote, "info"); return; }
    if (peerMode === "Use one model for all routes") {
      const selection = await pickModelSelection(ctx, models, providers, "all default Peer routes");
      if (!selection || selection.back) { notify(cancelNote, "info"); return; }
      for (const [route, description] of Object.entries(DEFAULT_PEER_ROUTES)) peerRoutes[route] = { description, ...selection };
    } else {
      const selections = await pickPeerRouteSelections(ctx, models, providers);
      if (!selections) { notify(cancelNote, "info"); return; }
      for (const { route, provider, model, thinking } of selections) peerRoutes[route] = { description: DEFAULT_PEER_ROUTES[route], provider, model, thinking };
    }
    while (true) {
      const next = await ctx.ui.select("Custom Peer routes:", ["Finish", "Add custom route"]);
      if (next === null || next === undefined) { notify(cancelNote, "info"); return; }
      if (next === "Finish") break;
      const route = (await ctx.ui.input("Custom route ID (lowercase letters, numbers, _ or -):"))?.trim();
      if (!ROUTE_ID.test(route ?? "") || Object.prototype.hasOwnProperty.call(peerRoutes, route)) { notify("Custom route ID is invalid or already used.", "error"); continue; }
      const description = (await ctx.ui.input(`Description for ${route}:`))?.trim();
      if (!description || description.length > 240) { notify("Description must be 1-240 characters.", "error"); continue; }
      const selection = await pickModelSelection(ctx, models, providers, `Peer route ${route}`);
      if (selection?.back) continue;
      peerRoutes[route] = { description, ...selection };
    }
  }

  const doc = { version: 2, roles, peer_routes: peerRoutes };
  const path = settingsPath(dir);
  const confirmed = await confirmSettings(ctx, "Apply PPO model-routing document?", `${path}\n\n${JSON.stringify(doc, null, 2)}`);
  if (!confirmed) { notify(`Not written; settings unchanged. Path: ${path}`, "info"); return; }
  try {
    await writeSettings(dir, doc);
    notify(`Success: PPO model routes written to ${path}. Start fresh governed agents to apply them.`, "info");
  } catch (err) { notify(`Failed to write PPO model routes at ${path}: ${err.message}`, "error"); }
}

// Process-latched governed state. Once set, blockedReason never clears in this
// process: drift or missing prerequisites require a fresh Paseo process.
let latch = null;
let blockedReason = null;
let baseline = null;
// The last tool set applied by this extension. It distinguishes intentional
// policy transitions between runs from an external active-tool drift.
let lastAppliedTools = null;
// Protocol pin: { repoRoot, version, projectId, digest } for the Lead role,
// process-latched like the role latch. Advisory-only for authority.
let protocolPin = null;
// Current-run authority record: { envelope, repoRoot, scope, exclusions } or
// null when the run carries no valid grant. Replaced on every input event.
let currentAuthority = null;
// Last validated terminal Peer Report / acceptance are process-local evidence only;
// no mailbox, registry, or durable workflow state is created.
let lastPeerReport = null;
let lastAcceptance = null;
// Last explicit no-authority reason (diagnostics; doctor reads it later).
let authorityReason = null;

export function getAuthority() {
  if (currentAuthority === null) return null;
  return { envelope: { ...currentAuthority.envelope }, repoRoot: currentAuthority.repoRoot };
}

export function getAuthorityReason() {
  return authorityReason;
}

export function getPeerReport() {
  return lastPeerReport === null ? null : structuredClone(lastPeerReport);
}

export function getLastAcceptance() {
  return lastAcceptance === null ? null : structuredClone(lastAcceptance);
}

// Pending authority from a confirmed idle slash-command (lead_tiny /
// supervisor_recovery): stored by the command handler, consumed by the next
// input event (one-shot), and cleared by any new/resumed/forked session.
let pendingAuthority = null;

export function getPendingAuthority() {
  return pendingAuthority === null ? null : { ...pendingAuthority };
}

export function getProtocolPin() {
  return protocolPin === null ? null : { ...protocolPin };
}

// ─── Slice 8: package verification and release gate ────────────────────────────

// Canonical package resources: the manifest-declared extension and skill,
// the skill's required companion guide, and the three private profiles.
// Everything resolves from loaded-module/package provenance (the module URL
// argument, defaulting to import.meta.url)
// — never from cwd, repository root, Pi config root, Paseo workspace, or
// parent-directory search. Expected resources must be regular, readable,
// nonempty, direct descendants without symlink escape (the realpath-
// containment pattern from validateProfileDir).
const BUNDLED_PROFILE_FILES = ["supervisor.md", "lead.md", "peer.md"];
const BUNDLED_SKILL_GUIDE_FILE = "AUTHORING-GUIDE.md";
const MANIFEST_DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const MANIFEST_INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];

export async function resolvePackageResources(moduleUrl = import.meta.url) {
  let url;
  try {
    url = new URL(moduleUrl);
  } catch {
    return { ok: false, error: "package module URL is not a valid URL" };
  }
  if (url.protocol !== "file:") {
    return { ok: false, error: "package module must load from a canonical file URL (loaded-module provenance is unavailable)" };
  }
  const modulePath = fileURLToPath(url);
  let realRoot;
  try {
    realRoot = await realpath(join(dirname(modulePath), ".."));
    if (!(await stat(realRoot)).isDirectory()) return { ok: false, error: "package root is not a directory" };
  } catch {
    return { ok: false, error: "package root is not readable" };
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(realRoot, "package.json"), "utf8"));
  } catch (err) {
    return { ok: false, error: `package manifest is not readable JSON: ${err.message}` };
  }
  if (!isRecord(manifest) || !isRecord(manifest.pi)) return { ok: false, error: "package manifest has no pi declaration" };
  const extraSurfaces = Object.keys(manifest.pi).filter((key) => key !== "extensions" && key !== "skills");
  if (extraSurfaces.length > 0) {
    return { ok: false, error: `package manifest declares unsupported pi surfaces: ${extraSurfaces.join(", ")}` };
  }
  if (!Array.isArray(manifest.pi.extensions) || manifest.pi.extensions.length !== 1
      || typeof manifest.pi.extensions[0] !== "string" || manifest.pi.extensions[0] === "") {
    return { ok: false, error: "package manifest must declare exactly one extension" };
  }
  if (!Array.isArray(manifest.pi.skills) || manifest.pi.skills.length !== 2
      || manifest.pi.skills.some((skill) => typeof skill !== "string" || skill === "")) {
    return { ok: false, error: "package manifest must declare exactly two skills" };
  }
  for (const field of MANIFEST_DEPENDENCY_FIELDS) {
    const deps = manifest[field];
    if (deps === undefined || deps === null) continue;
    if (!isRecord(deps)) return { ok: false, error: `package manifest ${field} must be an object` };
    if (Object.prototype.hasOwnProperty.call(deps, "pi-mcp-adapter")) {
      return { ok: false, error: "package manifest must not declare an adapter dependency" };
    }
  }
  if (isRecord(manifest.scripts)) {
    const install = MANIFEST_INSTALL_SCRIPTS.filter((name) => typeof manifest.scripts[name] === "string");
    if (install.length > 0) {
      return { ok: false, error: `package manifest must not declare install lifecycle scripts (${install.join(", ")})` };
    }
  }

  const declared = [
    ["extension", manifest.pi.extensions[0]],
    ["skill", manifest.pi.skills[0]],
    ["guide", join(dirname(manifest.pi.skills[0]), BUNDLED_SKILL_GUIDE_FILE)],
    ["orchestration skill", manifest.pi.skills[1]],
    ...BUNDLED_PROFILE_FILES.map((file) => [`profile ${file}`, join("profiles", file)]),
  ];
  const resources = { package_root: realRoot, profiles: {}, extension: null, skill: null, guide: null, orchestration_skill: null };
  for (const [label, rel] of declared) {
    if (isAbsolute(rel)) return { ok: false, error: `${label} must be a direct descendant of the package root (absolute path)` };
    const full = join(realRoot, rel);
    const relPath = relative(realRoot, full);
    if (relPath === "" || relPath === ".." || relPath.startsWith(`..${sep}`)) {
      return { ok: false, error: `${label} must be a direct descendant of the package root (${rel})` };
    }
    let real;
    try {
      real = await realpath(full);
    } catch (err) {
      return { ok: false, error: err.code === "ENOENT" ? `${label} must exist (${rel})` : `${label} must be readable (${rel})` };
    }
    if (real !== join(realRoot, rel)) {
      return { ok: false, error: `${label} must be a direct descendant without symlink escape (${rel})` };
    }
    if (!(await stat(real)).isFile()) return { ok: false, error: `${label} must be a regular file (${rel})` };
    if ((await readFile(real, "utf8")).trim() === "") return { ok: false, error: `${label} must be nonempty (${rel})` };
    if (label === "extension" || label === "skill" || label === "guide") resources[label] = real;
    else if (label === "orchestration skill") resources.orchestration_skill = real;
    else resources.profiles[label.slice("profile ".length).replace(/\.md$/, "")] = real;
  }
  // The loaded module must be the manifest-declared extension.
  try {
    if ((await realpath(modulePath)) !== resources.extension) {
      return { ok: false, error: "loaded module is not the manifest-declared extension" };
    }
  } catch {
    return { ok: false, error: "loaded module is not readable" };
  }
  return { ok: true, resources };
}

// Release gate: a pure fail-closed function over release facts. Every required
// fact must be exactly proven; missing, failed, or unknown values become
// concrete blockers naming the responsible party. The public current-agent
// observer is a REQUIRED capability: this package does not implement or vendor
// the adapter, so while pi-mcp-adapter does not expose it the gate must list it
// as a blocker. There is no fallback.
const RELEASE_FACTS = [
  { fact: "install_pinned", condition: "fresh pinned npm-version install proven (configured npm source, installed name/version/integrity, and extension digest)", owner: "operator", action: "Install npm:pi-paseo-orchestration@<exact-version> with Pi and verify the installed package identity, registry integrity, and loaded extension digest in a fresh process." },
  { fact: "relocation", condition: "package resources resolve identically from a fresh npm-tarball install", owner: "operator", action: "Pack and install the candidate npm tarball in a fresh root, then verify every declared resource resolves with identical bytes." },
  { fact: "doctor_tui_rpc_equivalence", condition: "doctor produces equivalent non-persistent TUI and RPC output", owner: "maintainer", action: "Run doctor in TUI and RPC modes and confirm the canonical reports match." },
  { fact: "settings_exact", condition: "model-routing settings apply exactly (fixed Supervisor/Lead selections and an allowed Peer route)", owner: "maintainer", action: "Confirm one complete settings document applies fixed role selections and the exact chosen Peer route." },
  { fact: "notebook_primitives", condition: "Notebook publication primitives pass concurrency, crash, durability, and containment tests", owner: "maintainer", action: "Run the Notebook publication tests and fix any fail-closed violation." },
  { fact: "hermetic_tests", condition: "hermetic package tests pass", owner: "maintainer", action: "Run npm test and fix every failure." },
  { fact: "release_smoke", condition: "release smoke passes on the exact npm package candidate", owner: "maintainer", action: "Run npm run release:smoke on the exact npm package candidate and resolve its printed blocker." },
  { fact: "mutation_boundaries", condition: "mutation-boundary tests prove settings and Notebook writes stay inside their exact surfaces", owner: "maintainer", action: "Run the mutation-boundary tests and confirm no project, package, Git, or Paseo mutation." },
];

const RELEASE_CAPABILITIES = [
  { capability: "pi_api", condition: "required Pi extension APIs (getActiveTools, setActiveTools, setModel, setThinkingLevel, getThinkingLevel) are present", owner: "operator", action: "Use a Pi process exposing the required extension APIs." },
  { capability: "paseo_live", condition: "live Paseo daemon/client identity, cwd, and typed workspace binding are observable", owner: "operator", action: "Start the Paseo daemon and client and rerun doctor until live facts are PASS." },
  { capability: "adapter_current_agent_observer", condition: "the public current-agent observer (adapter-provided or the independently installed Paseo CLI) proves exact current-agent identity, model, thinking, parent, and cwd", owner: "operator", action: "Start the Paseo daemon, verify the exact agent identity through the installed observer, and rerun the release smoke on the exact npm package candidate." },
];

function releaseFactState(value) {
  if (value === true) return "proven";
  if (value === false) return "failed";
  return "unknown"; // null, undefined, and non-boolean values are unproven
}

export function releaseGate(facts) {
  if (!isRecord(facts)) {
    return {
      ok: false,
      blockers: [{ fact: "facts", condition: "release facts must be a single object with every required fact proven", status: "missing", observed: facts === null || facts === undefined ? null : typeof facts, owner: "maintainer", action: "Pass one facts object with every required fact exactly proven." }],
    };
  }
  const blockers = [];
  const knownFacts = new Set(RELEASE_FACTS.map((spec) => spec.fact));
  for (const key of Object.keys(facts)) {
    if (key !== "capabilities" && !knownFacts.has(key)) {
      blockers.push({ fact: key, condition: "unknown release fact", status: "unknown", observed: facts[key], owner: "maintainer", action: "Remove or prove the unrecognized release fact." });
    }
  }
  for (const spec of RELEASE_FACTS) {
    const present = Object.prototype.hasOwnProperty.call(facts, spec.fact);
    const value = facts[spec.fact];
    const state = !present || value === undefined || value === null ? "missing" : releaseFactState(value);
    if (state !== "proven") {
      blockers.push({ fact: spec.fact, condition: spec.condition, status: state, observed: present && value !== undefined && value !== null ? value : null, owner: spec.owner, action: spec.action });
    }
  }
  const caps = facts.capabilities;
  if (!isRecord(caps)) {
    blockers.push({ fact: "capabilities", condition: "all required Pi/Paseo/adapter capabilities are proven", status: "missing", observed: caps === undefined || caps === null ? null : typeof caps, owner: "operator", action: "Prove each required capability; the adapter current-agent observer is mandatory." });
  } else {
    const knownCaps = new Set(RELEASE_CAPABILITIES.map((spec) => spec.capability));
    for (const key of Object.keys(caps)) {
      if (!knownCaps.has(key)) {
        blockers.push({ fact: `capabilities.${key}`, condition: "unknown release capability", status: "unknown", observed: caps[key], owner: "operator", action: "Remove or prove the unrecognized release capability." });
      }
    }
    for (const spec of RELEASE_CAPABILITIES) {
      const present = Object.prototype.hasOwnProperty.call(caps, spec.capability);
      const value = caps[spec.capability];
      const state = !present || value === undefined || value === null ? "missing" : releaseFactState(value);
      if (state !== "proven") {
        blockers.push({ fact: `capabilities.${spec.capability}`, condition: spec.condition, status: state, observed: present && value !== undefined && value !== null ? value : null, owner: spec.owner, action: spec.action });
      }
    }
  }
  blockers.sort((left, right) => (left.fact < right.fact ? -1 : left.fact > right.fact ? 1 : 0));
  return blockers.length === 0 ? { ok: true } : { ok: false, blockers };
}

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

function readActiveTools(pi) {
  if (typeof pi?.getActiveTools !== "function") return { ok: false, error: "active tools are not observable" };
  let actual;
  try {
    actual = pi.getActiveTools();
  } catch {
    return { ok: false, error: "active tools are not observable" };
  }
  if (!Array.isArray(actual) || actual.some((tool) => typeof tool !== "string" || tool === "")) {
    return { ok: false, error: "active tools are not an array of tool names" };
  }
  return { ok: true, tools: [...actual] };
}

// Cooperative active-tool policy: the active tool set is shared with other
// extensions and tool loaders, so a drift from the latched policy is healed by
// re-applying the ceiling rather than hard-blocking the session. The ceiling
// itself is still enforced per call in checkToolCall; this function only keeps
// the prompt surface in line with the policy.
async function ensureToolPolicy(pi) {
  if (baseline === null) return { ok: false, error: "active-tool baseline is not observable" };
  const observed = readActiveTools(pi);
  if (!observed.ok) return observed;
  const expected = lastAppliedTools ?? baseline;
  if (sameList(observed.tools, expected)) return { ok: true };
  const allowed = effectiveTools(baseline, latch?.role ?? null, currentAuthority);
  if (typeof pi.setActiveTools !== "function") return { ok: false, error: "active-tool policy cannot be re-applied" };
  try {
    pi.setActiveTools(allowed);
  } catch {
    return { ok: false, error: "active-tool policy cannot be re-applied" };
  }
  const applied = readActiveTools(pi);
  if (!applied.ok || !sameList(applied.tools, allowed)) {
    return { ok: false, error: "active tools drifted while re-applying the session policy" };
  }
  lastAppliedTools = [...allowed];
  return { ok: true };
}

async function verifyOrBlock(ctx, dir, pi = null, { runtime = true } = {}) {
  const check = await verifyLatch(latch, envOf(ctx), dir, ctx, { runtime });
  if (!check.ok) {
    blockedReason = check.error;
    ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${check.error}`, "error");
    return false;
  }
  if (pi !== null) {
    const tools = await ensureToolPolicy(pi);
    if (tools.ok !== true) {
      const error = "error" in tools ? tools.error : "active tools are not observable";
      blockedReason = error;
      ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${error}`, "error");
      return false;
    }
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

function createdAgentIdFromResult(event) {
  const direct = event?.details?.structuredContent?.agentId ?? event?.details?.agentId;
  if (typeof direct === "string" && direct.trim() !== "") return direct;
  const blocks = Array.isArray(event?.content) ? event.content : [];
  for (const block of blocks) {
    const text = typeof block === "string" ? block : block?.text;
    if (typeof text !== "string") continue;
    const match = /"agentId"\s*:\s*"([^"]+)"/.exec(text);
    if (match) return match[1];
  }
  return null;
}

function registerCommand(pi, name, definition) {
  pi.registerCommand(`ppo:${name}`, definition);
}

function bootstrapPrompt(task, cwd, settings, env) {
  const supervisorAlias = env[SUPERVISOR_ALIAS_ENV] || "ppo-supervisor";
  const leadAlias = env[LEAD_ALIAS_ENV] || "ppo-lead";
  if (!validProviderAlias(supervisorAlias) || !validProviderAlias(leadAlias)) throw new Error("PPO Supervisor/Lead aliases must be nonblank names without slashes");
  return [
    "Load the ppo-orchestrate skill and execute its Bootstrap coordinator workflow.",
    "PPO_BOOTSTRAP_V1",
    JSON.stringify({ version: 1, task_key: createHash("sha256").update(`${cwd}\0${task}`).digest("hex"), cwd, task, supervisor_alias: supervisorAlias, lead_alias: leadAlias, supervisor: settings.roles.supervisor, lead: settings.roles.lead }),
    "Create the governed Lead and Supervisor now. Do not implement the task in this coordinator session.",
  ].join("\n");
}

export async function runBootstrap(args, ctx, pi) {
  const task = String(args ?? "").trim();
  if (task === "" || task.length > OBJECTIVE_MAX) {
    ctx.ui?.notify?.(`Usage: /ppo:bootstrap <task> (1-${OBJECTIVE_MAX} characters)`, "warning");
    return { ok: false, error: "task must be nonempty and bounded" };
  }
  if (!processIsIdle(ctx)) {
    ctx.ui?.notify?.("pi-paseo-orchestration: bootstrap requires an idle process", "error");
    return { ok: false, error: "process is busy" };
  }
  const role = parseRole(envOf(ctx));
  if (!role.ok || role.role !== null || latch !== null || blockedReason !== null) {
    ctx.ui?.notify?.("pi-paseo-orchestration: bootstrap must run from a healthy ungoverned coordinator process", "error");
    return { ok: false, error: "governed or blocked process cannot bootstrap" };
  }
  const tools = readActiveTools(pi);
  if (!tools.ok || !tools.tools.includes("mcp")) {
    ctx.ui?.notify?.("pi-paseo-orchestration: bootstrap requires the active outer mcp tool", "error");
    return { ok: false, error: "outer mcp tool is unavailable" };
  }
  let settings;
  try { settings = await readSettings(configDir(envOf(ctx))); } catch (err) {
    ctx.ui?.notify?.(`pi-paseo-orchestration: ${err.message}`, "error");
    return { ok: false, error: err.message };
  }
  if (settings === null) {
    ctx.ui?.notify?.("pi-paseo-orchestration: run /ppo:settings before bootstrap", "error");
    return { ok: false, error: "settings are missing" };
  }
  const repoRoot = await findRepoRoot(ctx.cwd);
  if (repoRoot === null) {
    ctx.ui?.notify?.("pi-paseo-orchestration: bootstrap requires a Git repository", "error");
    return { ok: false, error: "repository is unavailable" };
  }
  const protocol = await readAndValidateProtocol(repoRoot);
  if (!protocol.ok) {
    ctx.ui?.notify?.(`pi-paseo-orchestration: ${protocol.error}`, "error");
    return { ok: false, error: protocol.error };
  }
  let prompt;
  try { prompt = bootstrapPrompt(task, repoRoot, settings, envOf(ctx)); } catch (err) {
    ctx.ui?.notify?.(`pi-paseo-orchestration: ${err.message}`, "error");
    return { ok: false, error: err.message };
  }
  if (typeof pi.sendUserMessage !== "function") {
    ctx.ui?.notify?.("pi-paseo-orchestration: Pi sendUserMessage API is unavailable", "error");
    return { ok: false, error: "sendUserMessage API is unavailable" };
  }
  pi.sendUserMessage(prompt);
  return { ok: true };
}

export default function (pi) {
  registerCommand(pi, "bootstrap", {
    description: "Create a governed Supervisor and Lead for one task in the current Paseo workspace",
    handler: (args, ctx) => runBootstrap(args, ctx, pi),
  });
  registerCommand(pi, "settings", {
    description: "Choose the exact provider, model, and thinking level for Supervisor, Lead, and Peer roles",
    handler: runSettings,
  });
  registerCommand(pi, "lead-tiny", {
    description: "Store a Human-confirmed tiny Lead edit/local-commit grant as a pending authority (idle lead process only)",
    handler: runLeadTiny,
  });
  registerCommand(pi, "supervisor-recovery", {
    description: "Store a Human-confirmed Supervisor recovery grant binding provider, workspace, and handoff (idle supervisor process only)",
    handler: runSupervisorRecovery,
  });
  registerCommand(pi, NOTEBOOK_INIT_COMMAND.replace("ppo:", ""), {
    description: "Create a Human-confirmed immutable Supervisor Notebook manifest (Supervisor only)",
    handler: runNotebookInit,
  });
  registerCommand(pi, "doctor", {
    description: "Report bounded observation-only readiness for the current Pi/Paseo context",
    handler: (args, ctx) => runDoctor(args, ctx, pi),
  });
  if (typeof pi.registerTool === "function") {
    // Current Pi API: one definition object (name, label, description,
    // parameters, execute). The old (name, definition) two-argument form is
    // gone — it yields a tool whose .name is undefined and corrupts the
    // provider payload.
    pi.registerTool({
      name: NOTEBOOK_APPEND_TOOL,
      label: "Supervisor Notebook Append",
      description: "Supervisor-only typed append of one immutable causal Notebook entry; no filesystem path is accepted",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["project_id", "entry"],
        properties: {
          project_id: { type: "string" },
          entry: {
            type: "object",
            additionalProperties: false,
            properties: Object.fromEntries(NOTEBOOK_ENTRY_FIELDS.filter((field) => field !== "entry_digest").map((field) => [field, {}])),
          },
        },
      },
      isEnabled: () => latch?.role === "supervisor" && blockedReason === null,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => {
        const result = await runNotebookAppend(params, ctx ?? {});
        // Execute failure must throw (Pi reports the error); returning a result
        // object with ok:false here would be surfaced as a successful tool
        // call whose content is ignored.
        if (result.ok !== true) {
          const error = new Error("error" in result && typeof result.error === "string" ? result.error : "notebook append failed");
          throw error;
        }
        return { content: [{ type: "text", text: "status" in result ? `Notebook entry ${result.status}.` : "Notebook entry appended." }], details: {} };
      },
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    currentAuthority = null; // new/resumed/forked sessions inherit no authority
    pendingAuthority = null; // ...and clear any pending slash-command authority
    createdPeerIds.clear();
    lastPeerReport = null;
    lastAcceptance = null;
    authorityReason = null;
    baseline = null;
    lastAppliedTools = null;
    const env = envOf(ctx);
    const dir = configDir(env);
    const roleCheck = parseRole(env);
    if (!roleCheck.ok) {
      blockWith(ctx, roleCheck.error);
      return;
    }
    if (roleCheck.role === null) return; // passive / ungoverned

    // Capture the Human-selected active surface once, before this extension
    // applies any run policy. A missing observation is never replaced by the
    // current post-policy active set.
    const observed = readActiveTools(pi);
    baseline = observed.ok ? observed.tools : null;

    if (latch !== null) {
      const tools = requireBaselineTools(baseline, latch.role);
      if (!tools.ok) {
        blockWith(ctx, tools.error);
        return;
      }
      if (!(await verifyOrBlock(ctx, dir, pi))) return;
      if (latch.role === "lead") {
        const pin = await ensureProtocolPin();
        if (!pin.ok) blockWith(ctx, pin.error);
      }
      return;
    }

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
      getThinkingLevel: pi.getThinkingLevel,
      currentModel: ctx.model,
      currentThinking: ctx.thinkingLevel,
    });
    if (!result.ok) {
      blockWith(ctx, result.error);
      return;
    }
    latch = result.latch;
    const tools = requireBaselineTools(baseline, latch.role);
    if (!tools.ok) {
      blockWith(ctx, tools.error);
      return;
    }
    if (latch.role === "lead") {
      const pin = await ensureProtocolPin();
      if (!pin.ok) blockWith(ctx, pin.error);
    }
  });

  pi.on("input", async (event, ctx) => {
    if (latch === null && blockedReason === null) return { action: "continue" };
    if (blockedReason !== null) {
      ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${blockedReason}`, "error");
      return { action: "handled" };
    }
    if (!(await verifyOrBlock(ctx, configDir(envOf(ctx)), pi))) return { action: "handled" };
    // Governed orchestration requires a valid pinned protocol for the Lead:
    // re-read and re-validate at every gate; drift blocks permanently.
    if (latch.role === "lead") {
      const pin = await ensureProtocolPin();
      if (!pin.ok) {
        blockWith(ctx, pin.error);
        return { action: "handled" };
      }
    }
    const acceptance = parseAcceptance(event.text ?? "", event.source);
    if (acceptance.ok && acceptance.acceptance !== null) {
      const chain = ctx.acceptanceChain;
      if (!chain || typeof chain !== "object") {
        authorityReason = "local acceptance evidence chain is unavailable";
        ctx.ui?.notify?.(`pi-paseo-orchestration: local acceptance blocked (${authorityReason})`, "error");
        return { action: "handled" };
      }
      const checked = await validateAcceptance({ ...chain, acceptance: acceptance.acceptance });
      if (!checked.ok) {
        authorityReason = checked.error;
        ctx.ui?.notify?.(`pi-paseo-orchestration: local acceptance blocked (${checked.error})`, "error");
        return { action: "handled" };
      }
      lastAcceptance = acceptance.acceptance;
      ctx.ui?.notify?.("pi-paseo-orchestration: LOCAL_ACCEPT validated for the exact candidate", "info");
      return { action: "handled" };
    }
    if (!acceptance.ok && String(event.text ?? "").includes(ACCEPTANCE_BEGIN)) {
      authorityReason = acceptance.error;
      ctx.ui?.notify?.(`pi-paseo-orchestration: local acceptance blocked (${acceptance.error})`, "error");
      return { action: "handled" };
    }

    // Authority lifetime: every run (input) replaces the internal current-run
    // authority record — including replacement with NO authority when the
    // message carries no valid envelope. A Human-confirmed slash-command grant
    // (lead_tiny / supervisor_recovery) is stored as a pending authority and
    // activates here on the NEXT input event through the same activation path
    // as every other grant; the pending slot is one-shot (this run consumes it
    // whether activation succeeds or fails). Direct messages can never
    // activate those kinds — the route is bound at issuance. New/resumed/
    // forked sessions inherit nothing.
    currentAuthority = null;
    authorityReason = null;
    if (pendingAuthority !== null) {
      const pending = pendingAuthority;
      pendingAuthority = null;
      if (event.source === "extension") {
        authorityReason = "authority envelope route must be a direct Human message, not an extension relay";
        ctx.ui?.notify?.(`pi-paseo-orchestration: no authority granted (${authorityReason})`, "error");
      } else {
        const activated = await activateEnvelope(pending, "command");
        if (!activated.ok) {
          authorityReason = activated.error;
          ctx.ui?.notify?.(`pi-paseo-orchestration: no authority granted (${activated.error})`, "error");
        } else {
          currentAuthority = activated.authority;
        }
      }
    } else if (event.source === "extension") {
      authorityReason = "authority envelope route must be a direct Human message, not an extension relay";
      ctx.ui?.notify?.(`pi-paseo-orchestration: no authority granted (${authorityReason})`, "error");
    } else {
      const parsed = parseEnvelope(event.text ?? "");
      if (!parsed.ok) {
        authorityReason = parsed.error;
        ctx.ui?.notify?.(`pi-paseo-orchestration: no authority granted (${parsed.error})`, "error");
      } else if (parsed.envelope !== null) {
        const activated = await activateEnvelope(parsed.envelope, "direct");
        if (!activated.ok) {
          authorityReason = activated.error;
          ctx.ui?.notify?.(`pi-paseo-orchestration: no authority granted (${activated.error})`, "error");
        } else {
          currentAuthority = activated.authority;
        }
      }
    }
    return { action: "continue" };
  });

  pi.on("tool_result", (event) => {
    if (latch?.role !== "lead" || event?.toolName !== "mcp"
        || event?.input?.server !== "paseo" || event?.input?.tool !== "paseo_create_agent"
        || event?.isError === true) return undefined;
    const childId = createdAgentIdFromResult(event);
    if (childId !== null) createdPeerIds.add(childId);
    return undefined;
  });

  pi.on("agent_end", async (event, ctx) => {
    if (latch?.role !== "peer") return undefined;
    const messages = Array.isArray(event?.messages) ? event.messages : [];
    let text = "";
    for (const message of [...messages].reverse()) {
      if (message?.role && message.role !== "assistant") continue;
      const content = message?.content ?? message?.text;
      if (typeof content === "string") { text = content; break; }
      if (Array.isArray(content)) {
        const parts = content.map((item) => typeof item === "string" ? item : item?.text ?? "").filter(Boolean);
        if (parts.length > 0) { text = parts.join("\n"); break; }
      }
    }
    const parsed = parseReport(text);
    if (!parsed.ok || parsed.report === null) {
      lastPeerReport = null;
      ctx.ui?.notify?.(`pi-paseo-orchestration: Peer run ended without a valid terminal report (${parsed.error ?? "missing report"})`, "error");
      return undefined;
    }
    const known = ctx.peerReportContext;
    if (known !== undefined) {
      const correlated = correlateReport(parsed.report, known);
      if (!correlated.ok) {
        lastPeerReport = null;
        ctx.ui?.notify?.(`pi-paseo-orchestration: Peer report rejected (${correlated.error})`, "error");
        return undefined;
      }
    }
    lastPeerReport = parsed.report;
    return undefined;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (latch === null) return undefined;
    if (blockedReason !== null) {
      ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${blockedReason}`, "error");
      return undefined;
    }
    if (!(await verifyOrBlock(ctx, configDir(envOf(ctx)), pi))) return undefined;
    if (latch.role === "lead") {
      const pin = await ensureProtocolPin();
      if (!pin.ok) {
        blockWith(ctx, pin.error);
        return undefined;
      }
    }
    const tools = requireBaselineTools(baseline, latch.role);
    if (!tools.ok) {
      blockWith(ctx, tools.error);
      return undefined;
    }
    const allowed = effectiveTools(baseline, latch.role, currentAuthority);
    if (typeof pi.setActiveTools !== "function") {
      blockWith(ctx, "active-tool policy cannot be applied");
      return undefined;
    }
    try {
      pi.setActiveTools(allowed);
    } catch {
      blockWith(ctx, "active-tool policy cannot be applied");
      return undefined;
    }
    const applied = readActiveTools(pi);
    if (!applied.ok || !sameList(applied.tools, allowed)) {
      blockWith(ctx, "active tools drifted while applying the session policy");
      return undefined;
    }
    lastAppliedTools = [...allowed];
    return {
      systemPrompt: `${event.systemPrompt}\n\n${PROFILE_MARKER(latch.role, latch.profileDigest)}\n${latch.profileText}\n\n${createAgentPolicyPrompt(latch, currentAuthority)}\n</pi-paseo-orchestration>`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (latch === null) return undefined;
    if (blockedReason !== null) {
      return { block: true, reason: `pi-paseo-orchestration blocked: ${blockedReason}` };
    }
    if (!(await verifyOrBlock(ctx, configDir(envOf(ctx)), pi))) {
      return { block: true, reason: `pi-paseo-orchestration blocked: ${blockedReason}` };
    }
    if (latch.role === "lead") {
      const pin = await ensureProtocolPin();
      if (!pin.ok) {
        blockWith(ctx, pin.error);
        return { block: true, reason: `pi-paseo-orchestration blocked: ${pin.error}` };
      }
    }
    // Resolve the repository root for the peer read gate when no envelope
    // carries one; the gate needs a root to resolve read targets.
    let repoRoot = currentAuthority?.repoRoot ?? null;
    if (repoRoot === null && latch.role === "peer" && PROTOCOL_READ_TOOLS.includes(event.toolName)) {
      repoRoot = await findRepoRoot();
    }
    const allowed = new Set(effectiveTools(baseline ?? [], latch.role, currentAuthority));
    const decision = checkToolCall(event.toolName, event.input, {
      role: latch.role,
      allowed,
      mcpTargets: MCP_TARGETS[latch.role] ?? {},
      roleSettings: latch.settings.roles,
      peerRoutes: latch.settings.peer_routes,
      peerProviderAlias: latch.peerProviderAlias,
      currentAgentId: latch.agentId,
      envelope: currentAuthority?.envelope ?? null,
      repoRoot,
      createdPeerIds,
    });
    if (decision?.block) {
      ctx.ui?.notify?.(`Blocked ${event.toolName}: ${decision.reason}`, "error");
      return decision;
    }
    // The commit gate is the async continuation of the same bash check: the
    // static layer admits `git commit` only under a local_commit grant, and
    // this layer re-checks HEAD and diff scope against the granted base.
    if (event.toolName === "bash" && currentAuthority !== null && GIT_COMMIT.test(event.input?.command ?? "")) {
      const gate = await checkCommitGate(event.input?.command ?? "", currentAuthority);
      if (gate?.block) {
        ctx.ui?.notify?.(`Blocked ${event.toolName}: ${gate.reason}`, "error");
        return gate;
      }
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
