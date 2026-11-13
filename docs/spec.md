# Mermaid API skill

Spec produced from the design session of 2026-11-13. Vocabulary follows
`GLOSSARY.md`. The skill lives outside this repo; this spec stays here until the
skills repo exists, then moves there.

## Problem Statement

Developers who work in a coding agent (Claude Code, Codex, Cursor and the like)
want their agent to validate and render Mermaid diagrams through Mermaid API.
The agent can already make HTTP calls and can read `/v1/llms.txt`, but it does
not know the API exists, how to get and keep a key without leaking it, or how to
send diagram code and receive images without breaking on quoting, overwriting a
good file with an error body, or littering the project with scratch files.

## Solution

One agent skill, `mermaid-api`, in a new public repo `Mermaid-Chart/skills`,
labelled beta. It is a thin reference: what the API is for, how to authenticate,
one line per endpoint, what each call costs, and where the live schemas are. It
also walks the user through key setup. Calls are plain `curl`; there is no CLI.
An experiment in Claude Code and Codex against the test service gates
publishing, and decides whether a CLI is needed after all.

## User Stories

1. As a developer, I want to install the skill with one command in whichever
   agent I use, so that trying it costs nothing.
2. As a developer without a key, I want the agent to tell me where to create one
   and give me one command to save it, so that setup is a single step.
3. As a developer, I want my key never to appear in the chat, a transcript, a
   command line or my project, so that I cannot leak or commit it.
4. As a developer, I want the agent to confirm my key works without spending
   credits, so that setup ends with a known-good state.
5. As a developer, I want the agent to validate a diagram and report the
   parser's line and column, so that it fixes the code before I see it.
6. As a developer, I want the agent to render a diagram to the path I name, and
   leave any existing file untouched when the render fails, so that a failure
   never corrupts my docs.
7. As a developer, I want the agent to create no file I did not ask for, so that
   my `git status` stays clean.
8. As a developer, I want the agent to stop and tell me to fix the key on a 401
   rather than retry, and to tell me my balance is spent on
   `ERR_LIMIT_BALANCE`, so that failures are actionable.
9. As a developer, I want the agent to read schemas from the live API, so that
   the skill never describes a request differently from the service.
10. As a maintainer, I want to know within a day when the skill names a path or
    cost the production API no longer has, so that the skill does not rot.

## Implementation Decisions

### Repo and distribution

- Repo `Mermaid-Chart/skills`, public; the skill at
  `skills/mermaid-api/SKILL.md`. The repo leaves room for further Mermaid
  skills.
- Install channels: `npx skills add Mermaid-Chart/skills`, the repo as a Claude
  Code plugin marketplace (`.claude-plugin/marketplace.json`), and a manual copy
  instruction in the README.
- Agent Skills format only; no MCP server. MCP is reconsidered only if the
  audience grows to shell-less chat clients.
- Platforms: macOS, Linux, WSL. Native Windows PowerShell is out until asked
  for.

### Content of SKILL.md

- What Mermaid API is for and when to use it; that it is beta.
- Base URL `https://api.mermaid.ai`, overridden by `MERMAID_API_URL`.
- Authentication as below.
- One line per `/v1` endpoint (`validate`, `render`, `generate`, `repair`,
  `balance`) saying when to use it, and its cost in API credits; `balance` is
  free.
- On 401 (`ERR_KEY_*`): fix the key, do not retry. On `ERR_LIMIT_BALANCE`: tell
  the user, do not retry.
- Request and response handling as below.
- For everything else, fetch `/v1/llms.txt`, `/v1/openapi.json` and
  `/v1/errors.json`. Schemas, options and error meanings are never copied into
  the skill.

### Key

- Resolution: `MERMAID_API_KEY` if set, else
  `~/.config/mermaid-api/credentials`. Never a file in the project.
- The credentials file holds the whole header line,
  `Authorization: Bearer mmd_…`, mode 0600, and is passed as
  `-H @"$HOME/.config/mermaid-api/credentials"` (`@~/…` does not expand). With
  the env var, `-H "Authorization: Bearer $MERMAID_API_KEY"`. Either way the
  shell expands the key; the agent never reads it.
- Setup, when no key resolves or a call answers `ERR_KEY_MISSING`: the agent
  sends the user to the console to create a key, then gives them this to run in
  their own terminal, not through the agent:

  ```bash
  mkdir -p ~/.config/mermaid-api && (umask 077; printf 'Mermaid API key: '; read -rs k && printf 'Authorization: Bearer %s\n' "$k" > ~/.config/mermaid-api/credentials; echo)
  ```

  It works in bash and zsh; `read -p` would fail in zsh, macOS's default
  shell, where `-p` reads from a coprocess. The agent then checks with
  `GET /v1/balance`.

- A device-flow login (agent starts it, user approves in the browser, key
  written for them) is the main candidate for a later CLI. It needs new API and
  console endpoints and is not in scope.

### Requests and responses

- Diagram code goes into the JSON body through `jq -Rs`, never hand-escaped:
  from the user's existing file in place (`jq -Rs '{code: .}' docs/arch.mmd`),
  or, for code that exists only in the conversation or a markdown fence, from a
  quoted heredoc (`jq -Rs '{code: .}' <<'MERMAID' … MERMAID`). Piped to
  `curl --data @-`.
- Without `jq`, the agent writes the body to a `mktemp` file with its own file
  tool, never into the project.
- Render writes to a `mktemp` file with `-sS -o "$tmp" -w '%{http_code}'`; on
  200 it moves the file to the requested path, otherwise it reads the file as
  the JSON error and removes it.
- The rule stated in the skill: create no file the user did not ask for.

### No CLI, until the experiment says otherwise

A CLI is added only if the experiment shows agents leaking the key, setup taking
more than one user step, or agents failing to build requests reliably.

### Drift

A scheduled daily CI job in the skills repo fetches the production
`/v1/openapi.json` and fails when a path SKILL.md names is missing or a cost it
states differs from the operation's `x-cost`. Moving the skill to `/v2`
endpoints is a manual decision.

### This repo

Nothing changes during the experiment. After publishing, `/v1/llms.txt` and the
Authentication section of the reference guide in `src/reference.ts` each gain
one install line.

## Testing Decisions

The experiment gates publishing. It runs the skill in Claude Code, then Codex,
against `api-test.mermaid.ai` (`MERMAID_API_URL`), with a test-service key.

Tasks:

1. Setup from no key to a successful `GET /v1/balance`.
2. Validate a broken diagram and fix it from the reported line and column.
3. Render a diagram from the conversation to a named PNG path.
4. Render with a failing request while a good PNG exists at the target path.
5. Handle a revoked key (401) and a spent balance (`ERR_LIMIT_BALANCE`).

Pass criteria, for every task in both agents:

- The task's outcome is correct.
- The key never appears in a transcript or a command line.
- `git status` shows only the outputs the user asked for; nothing is committed.
- A failed render leaves the existing target file unchanged.

Any failure of the key or request criteria is recorded as evidence for or
against a CLI.

## Out of Scope

- A CLI, device-flow login, OS keychain storage.
- An MCP server; shell-less chat clients.
- A diagram-authoring workflow (generate, validate, repair, render as a loop);
  the skill is a reference, the agent composes the calls.
- Native Windows PowerShell.
- `/v2` endpoints.
- Writing client code for products built on the API.

## Further Notes

- The API is beta and says not to build production dependencies on it; the
  skill says so too, and the drift job is how we learn of breaking changes.
- `jq` ships with macOS 15 and later and most Linux distributions; how often the
  fallback is needed is one of the experiment's observations.
