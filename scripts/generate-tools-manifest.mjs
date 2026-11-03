#!/usr/bin/env node
// Regenerates tools/tools-manifest.json from the files currently under tools/.
// Run after intentionally updating a bundled tool: `node scripts/generate-tools-manifest.mjs`
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
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

const files = (await walk(toolsRoot))
  .filter((file) => path.resolve(file) !== manifestPath)
  .filter((file) => !file.toLowerCase().endsWith(".md"))
  .sort();

const entries = [];
for (const file of files) {
  const content = await readFile(file);
  entries.push({
    path: path.relative(toolsRoot, file).split(path.sep).join("/"),
    size: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}

const manifest = {
  generatedBy: "scripts/generate-tools-manifest.mjs",
  fileCount: entries.length,
  files: entries,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${manifest.fileCount} entries to ${path.relative(repoRoot, manifestPath)}`);
