import { lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, relative } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
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
// in a ceiling — they come only from a current-run Task Authority Envelope
// grant. mcp_script is in no ceiling.
export const CEILINGS = {
  supervisor: ["read", "bash", "mcp"],
  lead: ["read", "bash", "mcp"],
  peer: ["read", "bash"],
};

// Validated outer-MCP inner targets: server name → closed tool set. Empty until
// the adapter's public observer contract is verified; empty means deny all.
export const MCP_TARGETS = {};

// Read-family tools whose targets are checked against the protocol path by the
// peer read gate inside checkToolCall.
const PROTOCOL_READ_TOOLS = ["read", "grep", "ls", "find"];

// Cooperative, recognizable-only command detection. Not a sandbox: aliases,
// scripts, and child programs can bypass it. The git patterns also catch global
// flag forms (`git --no-pager commit`) by scanning the command line for the
// subcommand after any `git` invocation.
const GIT_COMMIT = /\bgit\b[^\n;&|]*\bcommit\b/; // commits need a current-run local_commit grant
const GIT_AMEND = /\bgit\b[^\n;&|]*\bcommit\b[^\n;&|]*--amend\b/; // amend is forbidden even with a grant
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
  const err = (error) => ({ ok: false, error });
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return err("authority envelope body must be a single JSON object");
  }
  if (obj.version !== 1) {
    return err(`authority envelope version must be exactly 1 (got ${JSON.stringify(obj.version)})`);
  }
  const kind = obj.grant_kind;
  if (!Object.prototype.hasOwnProperty.call(GRANT_KIND_ROLE, kind)) {
    return err(`grant_kind must be one of peer|lead_tiny|supervisor_recovery (got ${JSON.stringify(kind)})`);
  }
  if (obj.role !== GRANT_KIND_ROLE[kind]) {
    return err(`grant_kind ${kind} requires role ${GRANT_KIND_ROLE[kind]} (got ${JSON.stringify(obj.role)})`);
  }
  if (obj.issuer !== "human") {
    return err(`issuer must be exactly "human" (got ${JSON.stringify(obj.issuer)})`);
  }
  for (const field of ["agent_id", "task_id"]) {
    if (typeof obj[field] !== "string" || obj[field].trim() === "") {
      return err(`${field} must be a nonempty string`);
    }
  }
  if (typeof obj.objective !== "string" || obj.objective.trim() === "") {
    return err("objective must be a nonempty string");
  }
  if (obj.objective.length > OBJECTIVE_MAX) {
    return err(`objective exceeds the ${OBJECTIVE_MAX}-character bound`);
  }

  if (kind === "supervisor_recovery") {
    const fields = ["version", "grant_kind", "role", "issuer", "agent_id", "task_id", "objective", "provider", "workspace_id", "handoff_id"];
    const extra = Object.keys(obj).find((k) => !fields.includes(k));
    if (extra !== undefined) return err(`unknown field ${JSON.stringify(extra)} in supervisor_recovery envelope`);
    for (const field of ["provider", "workspace_id", "handoff_id"]) {
      if (typeof obj[field] !== "string" || obj[field].trim() === "") {
        return err(`${field} must be a nonempty string`);
      }
    }
    return { ok: true, envelope: { ...obj, capabilities: [] } };
  }

  const fields = ["version", "grant_kind", "role", "issuer", "agent_id", "task_id", "objective", "capabilities", "scope", "exclusions", "base"];
  if (kind === "lead_tiny") fields.push("protocol_digest");
  const extra = Object.keys(obj).find((k) => !fields.includes(k));
  if (extra !== undefined) return err(`unknown field ${JSON.stringify(extra)} in ${kind} envelope`);

  if (!Array.isArray(obj.capabilities) || obj.capabilities.length === 0) {
    return err("capabilities must be a nonempty array");
  }
  if (new Set(obj.capabilities).size !== obj.capabilities.length) {
    return err("capabilities must not repeat");
  }
  for (const cap of obj.capabilities) {
    if (typeof cap !== "string" || !CAPABILITY_NAMES.includes(cap)) {
      return err(`unknown capability ${JSON.stringify(cap)}`);
    }
  }
  if (typeof obj.scope !== "string" || obj.scope === "") {
    return err("scope must be a nonempty repository-relative string");
  }
  let exclusions = [];
  if (obj.exclusions !== undefined) {
    if (!Array.isArray(obj.exclusions)) return err("exclusions must be an array");
    for (const e of obj.exclusions) {
      if (typeof e !== "string" || e === "") return err("each exclusion must be a nonempty string");
    }
    exclusions = obj.exclusions;
  }
  const commitGranted = obj.capabilities.includes("local_commit");
  if (commitGranted) {
    if (typeof obj.base !== "string" || !FULL_SHA.test(obj.base)) {
      return err("base must be a full git commit SHA when local_commit is granted");
    }
  } else if (obj.base !== undefined) {
    return err("base is only valid when local_commit is granted");
  }
  if (kind === "lead_tiny" && (typeof obj.protocol_digest !== "string" || !SHA256_HEX.test(obj.protocol_digest))) {
    return err("protocol_digest must be a full sha256 hex digest");
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

function isPathInScope(rel, scope, exclusions) {
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
  if (!scopeCheck.ok) return scopeCheck;
  const canonical = [];
  for (const exclusion of exclusions) {
    const check = await checkScopePath(repoRoot, exclusion, `exclusion ${JSON.stringify(exclusion)}`);
    if (!check.ok) return check;
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
  const ceiling = CEILINGS[role] ?? [];
  const extra = [];
  if (authority?.envelope?.capabilities?.includes("edit")) extra.push("write", "edit");
  return baseline.filter((tool) => ceiling.includes(tool) || extra.includes(tool));
}

function gitOut(repoRoot, args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: repoRoot, timeout: 15000 }, (err, stdout) => {
      resolve(err ? null : stdout.trim());
    });
  });
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
  if (!GIT_COMMIT.test(command ?? "")) return undefined;
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

// ─── Workspace Protocol ──────────────────────────────────────────────────────

// One canonical repository-wide protocol at the repository root; v0.1 has no
// overlays. This slice is read/validate/pin/guard only: workflow consumption
// of the protocol (classification, routing) is a later slice. The protocol can
// narrow workflow, but it cannot grant a Capability or override the Role
// Profile / Task Authority Envelope — the pin is advisory-only for authority
// and checkToolCall never consults it.

// Required core section headings, normalized (lowercase, whitespace-collapsed).
// Optional sections (criticality, review/council rules, anti-patterns,
// Supervisor hints — and even model/effort routing) may be absent; their
// presence grants nothing.
const REQUIRED_CORE_SECTIONS = [
  "decision matrix",
  "task classes and routing",
  "ownership and isolation",
  "candidate, verification, review, and acceptance",
  "reopen, dependency, and blocked handling",
  "evolution",
];

export function protocolPath(repoRoot) {
  return join(repoRoot, ".orchestration", "workspace-protocol.md");
}

// Line-based YAML frontmatter subset — no parser framework: the protocol is
// markdown with a small `key: value` header, so a closed line reader is
// enough. Rejects missing/malformed/duplicate metadata with the exact reason;
// extra non-canonical keys are tolerated (the five canonical keys are still
// required and individually validated).
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
  if (meta.status === "") return { ok: false, error: "metadata status must be a nonempty string" };
  if (!/^\d+$/.test(meta.version) || !Number.isSafeInteger(Number(meta.version)) || Number(meta.version) < 1) {
    return { ok: false, error: "metadata version must be a positive integer" };
  }
  // Real calendar check: Date.parse rolls over (2025-02-30 → Mar 2), so the
  // parsed components must round-trip exactly.
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(meta.last_reviewed);
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
  if (meta.project_id === "") return { ok: false, error: "metadata project_id must be a nonempty string" };
  if (meta.repository_root !== ".") {
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
  }
  const matrix = (bodies.get("decision matrix") ?? []).join("\n");
  if (!/must-ask|must_ask/i.test(matrix)) {
    return { ok: false, error: "the decision matrix core section must include must-ask boundaries" };
  }
  return { ok: true };
}

// Validates protocol text: nonempty, frontmatter metadata, required core
// sections. Returns { ok: true, meta, digest } or { ok: false, error }; digest
// is the canonical sha256 of the raw bytes (utf8 of the text).
export function validateProtocol(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, error: "workspace protocol must be nonempty" };
  }
  const frontmatter = parseFrontmatter(text);
  if (!frontmatter.ok) return frontmatter;
  const sections = checkCoreSections(text, frontmatter.bodyStart);
  if (!sections.ok) return sections;
  return {
    ok: true,
    meta: {
      status: frontmatter.meta.status,
      version: Number(frontmatter.meta.version),
      last_reviewed: frontmatter.meta.last_reviewed,
      project_id: frontmatter.meta.project_id,
      repository_root: frontmatter.meta.repository_root,
    },
    digest: createHash("sha256").update(text).digest("hex"),
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
  if (!check.ok) return check;
  return { ok: true, protocol: { repoRoot, path, digest, meta: check.meta } };
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
    if (!read.ok) return read;
    protocolPin = {
      repoRoot,
      version: read.protocol.meta.version,
      projectId: read.protocol.meta.project_id,
      digest: read.protocol.digest,
    };
    return { ok: true };
  }
  const read = await readAndValidateProtocol(repoRoot);
  if (!read.ok) return read;
  if (read.protocol.meta.project_id !== protocolPin.projectId) {
    return { ok: false, error: "workspace protocol project identity changed from the pinned project_id; a fresh process is required" };
  }
  if (read.protocol.meta.version !== protocolPin.version) {
    return { ok: false, error: "workspace protocol version changed from the pinned version; a fresh process is required" };
  }
  if (read.protocol.digest !== protocolPin.digest) {
    return { ok: false, error: "workspace protocol bytes drifted from the pinned digest; a fresh process is required" };
  }
  return { ok: true };
}

// Route binding: the direct Human task message is the only authority route in
// this slice. tiny Lead and Supervisor recovery grant kinds are parsed and
// schema-validated above, but their idle governed slash-command flows do not
// exist yet (later slice) — route absent means grant nothing.
async function activateEnvelope(envelope) {
  if (envelope.role !== latch.role) {
    return { ok: false, error: `envelope role ${JSON.stringify(envelope.role)} does not match the ${latch.role} process` };
  }
  if (envelope.agent_id !== latch.agentId) {
    return { ok: false, error: `envelope agent_id ${JSON.stringify(envelope.agent_id)} does not match the latched Paseo agent ${JSON.stringify(latch.agentId)}` };
  }
  // lead_tiny binds the currently pinned protocol digest; a mismatch fails
  // closed even though the idle slash-command route does not exist yet.
  if (envelope.grant_kind === "lead_tiny") {
    if (protocolPin === null) {
      return { ok: false, error: "lead_tiny requires a pinned workspace protocol digest" };
    }
    if (envelope.protocol_digest !== protocolPin.digest) {
      return { ok: false, error: "protocol_digest does not match the pinned workspace protocol digest" };
    }
  }
  if (envelope.grant_kind !== "peer") {
    return { ok: false, error: `grant_kind ${envelope.grant_kind} has no route in this slice: its idle slash-command flow does not exist yet, so it grants nothing` };
  }
  const repoRoot = await findRepoRoot();
  if (repoRoot === null) {
    return { ok: false, error: "no git repository root is observable for scope validation" };
  }
  const check = await validateScope(repoRoot, envelope.scope, envelope.exclusions);
  if (!check.ok) return check;
  return { ok: true, authority: { envelope, repoRoot, scope: check.scope, exclusions: check.exclusions } };
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
// Protocol pin: { repoRoot, version, projectId, digest } for the Lead role,
// process-latched like the role latch. Advisory-only for authority.
let protocolPin = null;
// Current-run authority record: { envelope, repoRoot, scope, exclusions } or
// null when the run carries no valid grant. Replaced on every input event.
let currentAuthority = null;
// Last explicit no-authority reason (diagnostics; doctor reads it later).
let authorityReason = null;

export function getAuthority() {
  if (currentAuthority === null) return null;
  return { envelope: { ...currentAuthority.envelope }, repoRoot: currentAuthority.repoRoot };
}

export function getAuthorityReason() {
  return authorityReason;
}

export function getProtocolPin() {
  return protocolPin === null ? null : { ...protocolPin };
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
    currentAuthority = null; // new/resumed/forked sessions inherit no authority
    authorityReason = null;
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
      if (!tools.ok) {
        blockWith(ctx, tools.error);
        return;
      }
      if (latch.role === "lead") {
        const pin = await ensureProtocolPin();
        if (!pin.ok) blockWith(ctx, pin.error);
      }
    }
  });

  pi.on("input", async (event, ctx) => {
    if (latch === null && blockedReason === null) return { action: "continue" };
    if (blockedReason !== null) {
      ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${blockedReason}`, "error");
      return { action: "handled" };
    }
    if (!(await verifyOrBlock(ctx, configDir(envOf(ctx))))) return { action: "handled" };
    // Governed orchestration requires a valid pinned protocol for the Lead:
    // re-read and re-validate at every gate; drift blocks permanently.
    if (latch.role === "lead") {
      const pin = await ensureProtocolPin();
      if (!pin.ok) {
        blockWith(ctx, pin.error);
        return { action: "handled" };
      }
    }
    // Authority lifetime: every run (input) replaces the internal current-run
    // authority record — including replacement with NO authority when the
    // message carries no valid envelope. Only the direct Human task-message
    // route (Peer grants) exists in this slice; tiny Lead and Supervisor
    // recovery grant kinds parse and validate, but their idle slash-command
    // routes do not exist yet, so route absence keeps them from ever
    // activating here. New/resumed/forked sessions inherit nothing.
    currentAuthority = null;
    authorityReason = null;
    if (event.source === "extension") {
      authorityReason = "authority envelope route must be a direct Human message, not an extension relay";
      ctx.ui?.notify?.(`pi-paseo-orchestration: no authority granted (${authorityReason})`, "error");
    } else {
      const parsed = parseEnvelope(event.text ?? "");
      if (!parsed.ok) {
        authorityReason = parsed.error;
        ctx.ui?.notify?.(`pi-paseo-orchestration: no authority granted (${parsed.error})`, "error");
      } else if (parsed.envelope !== null) {
        const activated = await activateEnvelope(parsed.envelope);
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

  pi.on("before_agent_start", async (event, ctx) => {
    if (latch === null) return undefined;
    if (blockedReason !== null) {
      ctx.ui?.notify?.(`pi-paseo-orchestration blocked: ${blockedReason}`, "error");
      return undefined;
    }
    if (!(await verifyOrBlock(ctx, configDir(envOf(ctx))))) return undefined;
    if (latch.role === "lead") {
      const pin = await ensureProtocolPin();
      if (!pin.ok) {
        blockWith(ctx, pin.error);
        return undefined;
      }
    }
    if (baseline === null) baseline = event.systemPromptOptions?.selectedTools ?? [];
    const tools = requireBaselineTools(baseline, latch.role);
    if (!tools.ok) {
      blockWith(ctx, tools.error);
      return undefined;
    }
    const allowed = effectiveTools(baseline, latch.role, currentAuthority);
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
      mcpTargets: MCP_TARGETS,
      envelope: currentAuthority?.envelope ?? null,
      repoRoot,
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
