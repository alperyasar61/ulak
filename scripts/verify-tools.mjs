#!/usr/bin/env node
// Verifies that every file under tools/ still matches tools/tools-manifest.json.
// Usage: node scripts/verify-tools.mjs
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolsRoot = path.join(repoRoot, "tools");
const manifestPath = path.join(toolsRoot, "tools-manifest.json");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));

const problems = [];
const seen = new Set();

for (const file of await walk(toolsRoot)) {
  if (path.resolve(file) === manifestPath) continue;
  if (file.toLowerCase().endsWith(".md")) continue;
  const rel = path.relative(toolsRoot, file).split(path.sep).join("/");
  seen.add(rel);
  const entry = expected.get(rel);
  if (!entry) {
    problems.push(`unexpected file: ${rel}`);
    continue;
  }
  const content = await readFile(file);
  if (content.length !== entry.size) {
    problems.push(`size mismatch: ${rel} (expected ${entry.size}, found ${content.length})`);
    continue;
  }
  const digest = createHash("sha256").update(content).digest("hex");
  if (digest !== entry.sha256) {
    problems.push(`sha256 mismatch: ${rel}`);
  }
}

for (const rel of expected.keys()) {
  if (!seen.has(rel)) problems.push(`missing file: ${rel}`);
}

if (problems.length > 0) {
  console.error(`tools/ verification failed (${problems.length} problem(s)):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`tools/ verification passed: ${manifest.fileCount} files match tools-manifest.json`);
