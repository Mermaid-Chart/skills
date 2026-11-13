// Drift check: every /v1 path SKILL.md names must exist in the API's OpenAPI
// document, and every cost it states must equal the operation's x-cost.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const COST_ROW =
  /^\|\s*`(GET|POST|PUT|PATCH|DELETE) (\/v1\/[^`\s]+)`\s*\|.*\|\s*(\d+)\s*\|\s*$/;
const MENTION = /(?:\b(GET|POST|PUT|PATCH|DELETE) )?(\/v1\/[\w./-]*[\w-])/g;

/** The endpoints the skill names, in order, with the cost its table states. */
export function namedEndpoints(md) {
  const found = new Map();
  for (const line of md.split("\n")) {
    const row = line.match(COST_ROW);
    if (row) {
      const [, method, path, cost] = row;
      found.set(`${method} ${path}`, { method, path, cost: Number(cost) });
    }
    for (const [, method, path] of line.matchAll(MENTION)) {
      const key = method ? `${method} ${path}` : path;
      if (!found.has(key)) found.set(key, { method, path });
    }
  }
  return [...found.values()];
}

/** Every way the skill disagrees with the OpenAPI document; empty when none. */
export function findDrift(md, openapi) {
  const endpoints = namedEndpoints(md);
  const problems = [];
  if (!endpoints.some((e) => e.cost !== undefined)) {
    problems.push("no endpoint costs found in the skill");
  }
  const missing = new Set();
  for (const { method, path, cost } of endpoints) {
    const label = method ? `${method} ${path}` : path;
    const item = openapi.paths?.[path];
    if (!item) {
      if (!missing.has(path)) problems.push(`${path}: not in the API`);
      missing.add(path);
      continue;
    }
    if (!method) continue;
    const op = item[method.toLowerCase()];
    if (!op) {
      problems.push(`${label}: the API has no ${method} on this path`);
      continue;
    }
    if (cost === undefined) continue;
    const apiCost = op["x-cost"];
    if (apiCost === undefined) {
      problems.push(
        `${label}: the skill says cost ${cost}, the API states none`,
      );
    } else if (apiCost !== cost) {
      problems.push(
        `${label}: the skill says cost ${cost}, the API says ${apiCost}`,
      );
    }
  }
  return problems;
}

async function main() {
  const base = process.env.MERMAID_API_URL ?? "https://api.mermaid.ai";
  const url = `${base}/v1/openapi.json`;
  const skillPath = new URL("../skills/mermaid-api/SKILL.md", import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const problems = findDrift(
    await readFile(skillPath, "utf8"),
    await res.json(),
  );
  if (problems.length) {
    console.error(`SKILL.md has drifted from ${url}:`);
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }
  console.log(`No drift against ${url}.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
