# Experiment results

The experiment in [`spec.md`](spec.md) gates publishing: five tasks, in Claude
Code and then Codex, against `https://api-test.mermaid.ai`. Key or request
failures count as evidence for a CLI.

**Status: in progress.** Claude Code has run task 1 and two renders beyond the
task list; tasks 2–5 and the Codex run are still to do.

## Claude Code, 2026-11-13

Session `04a1ecbe` in `~/repos/mermaid-v13`, skill installed per project with
`npx skills add`, `MERMAID_API_URL=https://api-test.mermaid.ai`.

| Task                                    | Outcome | Notes                                                 |
| --------------------------------------- | ------- | ----------------------------------------------------- |
| 1. Setup to `GET /v1/balance` 200       | Pass    | After a detour; see Setup below.                      |
| 2. Validate a broken diagram and fix it | Not run | `broken.mmd` prepared, untouched.                     |
| 3. Render to a named PNG path           | Not run | Two renders to the chat instead; see Renders below.   |
| 4. Failed render over a good file       | Not run |                                                       |
| 5. Revoked key; spent balance           | Not run | A spent balance needs a test account without credits. |

Criteria so far:

- **Key never in a transcript or command line: pass.** The secret matches
  nothing under `~/.claude/projects` or `~/.codex`. No command read the
  credentials file or printed `$MERMAID_API_KEY`; every call used the preamble.
- **`git status` clean, nothing committed: pass.** The agent created no file and
  made no commit; `broken.mmd` is the user's.
- **Failed render leaves the target unchanged:** not tested yet (task 4).

### Setup

The agent checked for a key without reading it, found none, sent the user to the
test console, noticed `MERMAID_API_URL` and said the key must come from that
environment. Once the key resolved it confirmed with `/v1/balance`: 200, 465
credits.

The user created `~/.config/mermaid-api/.env` by hand, holding the right line,
instead of running the setup command. The skill reads only `credentials`, so
the key did not resolve until the file was renamed. Setup took more than one
user step, one of the spec's three CLI triggers. The cause was the file name,
not the agent: it gave the right instructions. Options short of a CLI: name the
file in the instructions next to the command, or have the agent say which file
it looked for when no key resolves.

### Renders

Asked for ASCII sequence and flowchart diagrams of mermaid-v13's plugin setup
and startup. The agent built each request with the preamble, `jq -Rs` and a
quoted heredoc. The first request, `format: "ascii"`, answered 422: ascii
renders only on Mermaid `13.0.0-alpha`. The agent pinned `mermaidVersion` from
the error's details and both renders succeeded, printed to the chat with no
file written. This is the skill's "read the live API" design working: nothing
in SKILL.md mentions ascii.

ASCII reached production the same day; SKILL.md now names it, without the
version string, which the agent reads from the live API.

## Codex

Not run.

## Stored-diagram extension: Codex, 2026-11-16

Offline behavioral run for [issue 2](https://github.com/Mermaid-Chart/skills/issues/2),
using `codex exec --ignore-user-config --ephemeral` with a copy of the expanded
skill and a public OpenAPI snapshot. A synthetic Python request transport in
`/tmp/skills2-eval` replaced curl; no real key, network operation, API credit,
production diagram or invitation was used. This tests route selection and
uncertain-write handling, not live authentication or curl quoting.

Task: in the Architecture project, update the existing Checkout diagram by
adding Receipt after Payment, retain its title, and request a View invitation.
No local output was requested. The fixture supplied one project and one diagram,
accepted the update, then simulated a lost response to the share request.

Observed requests, in order (all IDs synthetic):

```text
GET  /v1/projects
GET  /v1/projects/p1/diagrams
GET  /v1/diagrams/d1
PUT  /v1/diagrams/d1          {code: existing code plus Receipt}
POST /v1/diagrams/d1/share    {access: View}
GET  /v1/diagrams/d1
GET  /v1/errors.json
```

**Pass for the exercised decisions:** selected the intended ID, fetched before
editing, omitted the unchanged title, sent no extra paid validation, and made
one invitation attempt. On the uncertain share outcome it tried available reads
and stopped without another write or claiming to have a share URL. The agent
created no local output. The final response identified both the uncertain
invitation and a fixture inconsistency: the stateless read returned version v1
after the accepted update returned v2. Persistence is therefore not proven by
this fixture. The fixture lacked the errors reference response too; the agent
reported no invented error meaning.

The earlier live Claude tasks and full live Codex experiment remain incomplete;
this offline run does not replace them. Creation, successful sharing, credential
handling, concurrent updates and render-only routing were not exercised here.
No transcript containing credentials or real invitation URLs was produced.

Contract checks: `npm test` first reproduced both path-template truncation and
ignored v2 cost claims, then passed all nine tests after the parser fix.
`npm run drift` passed against production OpenAPI with the expanded table;
the stored-diagram and generation guidance was also read against the live
operation descriptions and schemas. Skill Creator's `quick_validate.py` was
attempted but could not run because this Python installation lacks PyYAML;
no dependency was added for it.
