import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {unstable_dev} from "wrangler";
import {sample} from "../lib/show.js";

const config = "dist/server/wrangler.json";
const migrationDir = "dist/.openai/drizzle";
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const manifest = await readJson(".openai/hosting.json");
assert.deepEqual(await readJson("dist/.openai/hosting.json"), manifest, "Packaged hosting manifest differs from source");
assert.equal(manifest.d1, "DB", "The project API requires the DB binding");
if (process.env.EXPECTED_SITES_PROJECT_ID) {
  assert.equal(manifest.project_id, process.env.EXPECTED_SITES_PROJECT_ID, "Unexpected Sites project ID");
}
const wrangler = await readJson(config);
assert.equal(wrangler.main, "index.js", "Expected the built Sites worker at dist/server/index.js");
assert.ok(wrangler.d1_databases?.some(db => db.binding === "DB"), "Built worker lacks the DB binding");
const journal = await readJson(`${migrationDir}/meta/_journal.json`);
assert.deepEqual(journal, await readJson("drizzle/meta/_journal.json"), "Packaged migration journal differs from source");
const migrations = journal.entries.map(entry => entry.tag + ".sql");
const sqlFiles = async dir => (await readdir(dir)).filter(name => name.endsWith(".sql")).sort();
assert.deepEqual(await sqlFiles("drizzle"), [...migrations].sort(), "Source migrations and journal disagree");
assert.deepEqual(await sqlFiles(migrationDir), [...migrations].sort(), "Packaged migrations and journal disagree");
assert.equal(migrations[0], "0000_clear_flatman.sql", "Expected the original deployed database migration");

const state = await mkdtemp(join(tmpdir(), "lampey-sites-check-"));
const legacy = {version: 1, name: "Existing show", fixtures: [], devices: [], networks: []};
const legacyId = "existing-show";
function executeD1(...args) {
  execFileSync(process.execPath, ["./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB",
    "--local", "--config", config, "--persist-to", state, ...args], {stdio: "inherit", windowsHide: true});
}

let worker;
try {
  for (const [i, name] of migrations.entries()) {
    const path = join(migrationDir, name);
    assert.deepEqual(await readFile(path), await readFile(join("drizzle", name)), "Packaged SQL differs: " + name);
    executeD1("--file", path);
    if (i === 0) {
      // Seed the original schema before later migrations run, as on an existing Site.
      executeD1("--command", `INSERT INTO designs (id,name,body,revision,updated) VALUES ('${legacyId}','Existing show','${JSON.stringify(legacy)}',7,1)`);
    }
  }
  worker = await unstable_dev("dist/server/index.js", {
    config, local: true, ip: "127.0.0.1", port: 0, inspectorPort: 0, persistTo: state,
    experimental: {watch: false, disableExperimentalWarning: true, disableDevRegistry: true}
  });
  async function request(path, init, expected = 200) {
    const response = await worker.fetch(path, {...init, signal: AbortSignal.timeout(15000)});
    assert.equal(response.status, expected, `${init?.method || "GET"} ${path} returned ${response.status}`);
    return response;
  }
  const html = await (await request("/")).text();
  const script = html.match(/<script\b[^>]*\bsrc="(\/_next\/[^"]+\.js)(?:\?[^"]*)?"/)?.[1];
  assert.ok(script, "Planner HTML lacks a client entry script");
  const javascript = await request(script);
  assert.match(javascript.headers.get("Content-Type") || "", /javascript/);
  assert.ok((await javascript.arrayBuffer()).byteLength > 0, "Empty client script");
  const model = Buffer.from(await (await request("/property.glb")).arrayBuffer());
  assert.equal(model.toString("ascii", 0, 4), "glTF", "The model URL did not serve a GLB");
  assert.deepEqual(model, await readFile("public/property.glb"), "Served model differs from source");

  const read = async id => (await request("/api/projects?id=" + id)).json();
  const save = async (id, revision, design, expected = 200) => (await request("/api/projects", {
    method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({id, revision, design})
  }, expected)).json();
  const old = await read(legacyId);
  assert.equal(old.revision, 7);
  assert.equal(old.design.name, legacy.name);
  const edit = {...old.design, name: "Updated existing show"};
  assert.equal((await save(legacyId, old.revision, edit)).revision, 8);
  await save(legacyId, old.revision, legacy, 409);
  assert.equal((await read(legacyId)).design.name, edit.name);
  const design = sample();
  assert.equal((await save("new-show", 0, design)).revision, 1);
  const saved = await read("new-show");
  assert.deepEqual(saved.design.fixtures.map(f => f.id), design.fixtures.map(f => f.id));
  const projects = await (await request("/api/projects")).json();
  assert.ok(projects.some(row => row.id === legacyId) && projects.some(row => row.id === "new-show"));
  console.log("Sites worker served the planner, client script and model, upgraded a legacy design, and saved a new show.");
} finally {
  try { await worker?.stop(); }
  finally { await rm(state, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); }
}
