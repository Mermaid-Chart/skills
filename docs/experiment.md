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
