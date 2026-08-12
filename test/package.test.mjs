import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

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

test("extension loads and registers only the harmless status command", async () => {
  const source = await readFile(join(root, manifest.pi.extensions[0]), "utf8");
  const extension = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const commands = new Map();

  extension.default({
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
  });

  assert.deepEqual([...commands.keys()], ["pi-paseo-orchestration"]);

  const notifications = [];
  await commands.get("pi-paseo-orchestration").handler("", {
    ui: { notify: (...args) => notifications.push(args) },
  });
  assert.deepEqual(notifications, [[
    "Pi Paseo Orchestration skeleton loaded; v0.1 orchestration is not implemented.",
    "info",
  ]]);
});
