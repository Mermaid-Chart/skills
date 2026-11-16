import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { findDrift, namedEndpoints } from "./drift.mjs";

const openapi = {
  paths: {
    "/v1/validate": { post: { "x-cost": 1 } },
    "/v1/render": { post: { "x-cost": 5 } },
    "/v1/balance": { get: { "x-cost": 0 } },
    "/v1/errors.json": { get: {} },
  },
};

const skill = (...lines) =>
  [
    "| Endpoint | Use it to | Cost |",
    "| --- | --- | --- |",
    "| `POST /v1/validate` | Check code | 1 |",
    "| `GET /v1/balance` | See what remains | 0 |",
    ...lines,
  ].join("\n");

test("a skill that matches the API has no drift", () => {
  assert.deepEqual(
    findDrift(
      skill("See `/v1/errors.json`.", 'curl "$api/v1/render"'),
      openapi,
    ),
    [],
  );
});

test("a named path the API lacks is drift", () => {
  assert.deepEqual(findDrift(skill("Fetch `/v1/llms.txt`."), openapi), [
    "/v1/llms.txt: not in the API",
  ]);
});

test("a method the path lacks is drift", () => {
  assert.deepEqual(findDrift(skill("Call `GET /v1/render`."), openapi), [
    "GET /v1/render: the API has no GET on this path",
  ]);
});

test("a cost that differs from x-cost is drift", () => {
  assert.deepEqual(
    findDrift(skill("| `POST /v1/render` | Render | 3 |"), openapi),
    ["POST /v1/render: the skill says cost 3, the API says 5"],
  );
});

test("a costed endpoint whose operation has no x-cost is drift", () => {
  assert.deepEqual(
    findDrift(skill("| `GET /v1/errors.json` | Errors | 0 |"), openapi),
    ["GET /v1/errors.json: the skill says cost 0, the API states none"],
  );
});

test("a skill with no cost table is drift, so a broken parse cannot pass", () => {
  assert.deepEqual(findDrift("No table here, see `/v1/render`.", openapi), [
    "no endpoint costs found in the skill",
  ]);
});

test("parameterized routes remain complete in tables and prose", () => {
  const contract = {
    paths: {
      ...openapi.paths,
      "/v1/diagrams/{diagramID}": { get: { "x-cost": 0 } },
      "/v1/projects/{projectID}/diagrams": { get: { "x-cost": 0 } },
      "/v1/diagrams/{diagramID}/share": { post: { "x-cost": 1 } },
    },
  };
  assert.deepEqual(
    findDrift(
      skill(
        "| `GET /v1/diagrams/{diagramID}` | Read | 0 |",
        "Call `GET /v1/projects/{projectID}/diagrams`.",
        "| `POST /v1/diagrams/{diagramID}/share` | Share | 1 |",
      ),
      contract,
    ),
    [],
  );
  assert.deepEqual(
    findDrift(skill("Call `DELETE /v1/diagrams/{diagramID}`."), contract),
    ["DELETE /v1/diagrams/{diagramID}: the API has no DELETE on this path"],
  );
});

test("v2 endpoint costs and unknown routes are checked", () => {
  const contract = {
    paths: {
      ...openapi.paths,
      "/v2/generate": { post: { "x-cost": 25 } },
    },
  };
  assert.deepEqual(
    findDrift(skill("| `POST /v2/generate` | Generate | 25 |"), contract),
    [],
  );
  assert.deepEqual(
    findDrift(skill("| `POST /v2/generate` | Generate | 999 |"), contract),
    ["POST /v2/generate: the skill says cost 999, the API says 25"],
  );
  assert.deepEqual(findDrift(skill("Call `POST /v2/repair`."), contract), [
    "/v2/repair: not in the API",
  ]);
});

test("the real skill names its supported endpoints with costs", async () => {
  const md = await readFile(
    new URL("../skills/mermaid-api/SKILL.md", import.meta.url),
    "utf8",
  );
  const costed = namedEndpoints(md)
    .filter((e) => e.cost !== undefined)
    .map((e) => `${e.method} ${e.path}`)
    .sort();
  assert.deepEqual(costed, [
    "GET /v1/balance",
    "GET /v1/diagrams/{diagramID}",
    "GET /v1/projects",
    "GET /v1/projects/{projectID}/diagrams",
    "POST /v1/diagrams",
    "POST /v1/diagrams/{diagramID}/share",
    "POST /v1/generate",
    "POST /v1/render",
    "POST /v1/repair",
    "POST /v1/validate",
    "POST /v2/generate",
    "PUT /v1/diagrams/{diagramID}",
  ]);
});
