---
name: mermaid-api
description: Validate and render Mermaid diagrams to SVG, PNG, PDF or ASCII text through the hosted Mermaid API, with curl. Use when checking Mermaid syntax, turning diagram code into an image file, generating or repairing a diagram with Mermaid AI, listing projects and diagrams, creating, fetching, updating or sharing stored Mermaid Chart diagrams, or setting up a Mermaid API key.
---

# Mermaid API

Mermaid API validates and renders Mermaid diagrams over HTTP, and asks Mermaid
AI to generate or repair diagram code. It is in beta: fields, limits and the
latest Mermaid version can change, so tell the user not to build a production
dependency on it.

Every call below is plain `curl` from the shell. Start every command with this
preamble; shell variables do not carry over between your commands. It sets the
base URL (`MERMAID_API_URL` overrides production) and the key header, explained
under Key:

```bash
api=${MERMAID_API_URL:-https://api.mermaid.ai}
if [ -n "$MERMAID_API_KEY" ]; then auth=(-H "Authorization: Bearer $MERMAID_API_KEY"); else auth=(-H @"$HOME/.config/mermaid-api/credentials"); fi
```

## Key

The key stays out of sight: it reaches curl only through shell expansion, so
its value never appears in the chat, a command line or the project. Treat
`$MERMAID_API_KEY` and the credentials file as write-only: never print, `cat`,
`echo` or read them.

Resolve it in this order, and send it as the matching header:

1. `MERMAID_API_KEY` set:
   `-H "Authorization: Bearer $MERMAID_API_KEY"`.
2. Otherwise `~/.config/mermaid-api/credentials`, which holds the whole header
   line: `-H @"$HOME/.config/mermaid-api/credentials"` (`@~/…` does not
   expand).

### Setup

When neither resolves
(`[ -n "$MERMAID_API_KEY" ] || [ -s ~/.config/mermaid-api/credentials ]`
fails), curl exits 26 because the credentials file is missing, or a call answers
`ERR_KEY_MISSING`:

1. Send the user to `$api/console` to create a key. It is shown once.
2. Give them this to run **in their own terminal**, not through you. It prompts
   for the key without echoing it, in bash or zsh, and writes the file with mode
   0600:

   ```bash
   mkdir -p ~/.config/mermaid-api && (umask 077; printf 'Mermaid API key: '; read -rs k && printf 'Authorization: Bearer %s\n' "$k" > ~/.config/mermaid-api/credentials; echo)
   ```

3. When they say it is done, confirm with `GET /v1/balance`, which is free.
   Setup is done when it answers 200.

## Endpoints

Costs are in API credits, charged to the key owner's balance.

| Endpoint                                | Use it to                                                                      | Cost |
| --------------------------------------- | ------------------------------------------------------------------------------ | ---- |
| `POST /v1/validate`                     | Check diagram code; on invalid code it gives the parser's line and column      | 1    |
| `POST /v1/render`                       | Turn diagram code into SVG, PNG, PDF or ASCII text                             | 5    |
| `POST /v1/generate`                     | Ask Mermaid AI for diagram code from a prompt                                  | 25   |
| `POST /v1/repair`                       | Ask Mermaid AI to fix invalid code; valid code comes back at a validate cost   | 25   |
| `POST /v2/generate`                     | Generate one or several diagrams, optionally rendered; see Generate and repair | 25   |
| `GET /v1/projects`                      | List reachable Mermaid Chart projects                                          | 0    |
| `GET /v1/projects/{projectID}/diagrams` | List a project's diagrams, without code                                        | 0    |
| `GET /v1/diagrams/{diagramID}`          | Fetch stored code, version and edit URL                                        | 0    |
| `POST /v1/diagrams`                     | Create a new stored diagram                                                    | 1    |
| `PUT /v1/diagrams/{diagramID}`          | Update an intended diagram's code or title                                     | 1    |
| `POST /v1/diagrams/{diagramID}/share`   | Mint an invitation link when asked to share                                    | 1    |
| `GET /v1/balance`                       | See what remains and what every endpoint costs                                 | 0    |

Request fields, options, response shapes and error meanings live in the API,
not here. Fetch them, without a key, when you need them:

- `GET /v1/llms.txt`: the index of the documents below.
- `GET /v1/openapi.json`: every schema, plus a guide in `info.description`
  (config rules, Mermaid versions, limits, examples).
- `GET /v1/errors.json`: every error code, its status and what to do.

## Sending diagram code

Build the JSON body with `jq -Rs`, which escapes the code exactly, and pipe it
to `curl --data @-`:

- Code in a file the user has: read it in place.
  `jq -Rs '{code: .}' docs/arch.mmd`
- Code only in the conversation or a markdown fence: a quoted heredoc.

```bash
jq -Rs '{code: .}' <<'MERMAID' | curl -sS "$api/v1/validate" "${auth[@]}" -H 'Content-Type: application/json' --data @-
flowchart TD
  A[Start] --> B[Done]
MERMAID
```

Add other fields in the same filter: `jq -Rs '{code: ., format: "png"}'`.

Without `jq`: `tmp=$(mktemp)`, write the JSON body to `$tmp` with your file
tool, send it with `--data @"$tmp"`, then `rm -f "$tmp"`.

The only files you create are the outputs the user asked for. Scratch files go
in `mktemp` and are removed.

## Validate

Validate answers 200 whether the code is valid or not. Read `valid`; when it is
`false`, `error.details.line` and `error.details.column` point at where the
parser stopped. Fix the code there and validate again until `valid` is `true`.

## Render

Render answers the image bytes on 200 and a JSON error otherwise. Write to a
temporary file and move it to the requested path only on 200, so a failure
leaves any existing file at that path untouched:

```bash
tmp=$(mktemp)
status=$(jq -Rs '{code: ., format: "png"}' docs/arch.mmd | curl -sS -o "$tmp" -w '%{http_code}' "$api/v1/render" "${auth[@]}" -H 'Content-Type: application/json' --data @-)
if [ "$status" = 200 ]; then mv "$tmp" docs/arch.png && chmod 644 docs/arch.png; else cat "$tmp"; rm -f "$tmp"; fi
```

With `Accept: application/json`, render answers a JSON envelope with the image
base64-encoded in `content` instead of raw bytes.

For a diagram shown in the chat rather than saved, render `format: "ascii"`: it
answers the diagram as text, so print it and write no file. ASCII is
experimental and renders only on the Mermaid 13 alpha; pin `mermaidVersion` to
the alpha that `/v1/openapi.json` lists. A diagram type it cannot draw as text
is 422 `ERR_RENDER_FORMAT_UNSUPPORTED`, not charged; offer an SVG instead.

## Generate and repair

Use `POST /v2/generate` for a list of diagrams: `diagramCount` defaults to 1,
currently up to 5. Without `render`, it costs 25 credits per valid diagram
delivered, capped at `diagramCount`. Optional `render` adds base64 content or a
per-diagram render error. With `render`, charge only successfully rendered
diagrams: (AI cost + render cost) times the successful count, capped at
`diagramCount`, currently 30 credits each. A diagram whose render failed is
entirely uncharged, including its AI cost, even though its code is returned.
Extra diagrams, discarded diagrams and `valid: false` are uncharged.

Before the call starts, the balance must cover `diagramCount` times the AI
cost plus, when requested, the render cost per diagram: currently 25 each
without rendering or 30 each with rendering. For example, three requested
renders need 90 available credits; two successes and one render failure cost 60. Read the live schema for formats, options and response fields.

Repair with optional rendering uses `POST /v1/repair`. Valid input returns
unchanged without asking Mermaid AI: it costs a validate without rendering,
or a render when successfully rendered. Repaired code with a successful render
costs repair plus render. A failed render makes the entire repair request
uncharged, including any AI work; its code is still returned. The balance must
cover a repair plus the requested render before the call starts, even for
already valid input. Read `valid` and each render result before treating the
request as successful.

## Stored diagrams

These operations require a **personal key**. Organisation keys are refused;
Mermaid Chart applies the personal key owner's existing project and diagram
permissions, including team projects. A personal key can read, overwrite and
share those diagrams; revoke a key you no longer trust with that access.

Choose calls from the user's request:

1. List projects and then a project's diagram metadata to select the intended
   IDs. Fetch the selected diagram for its code and version before editing.
   If names leave the target ambiguous, ask the user to choose.
2. Create only when asked to store a new diagram. Select the requested project;
   omitting `projectID` uses the owner's default project. For edits, update the
   intended diagram ID with only the requested changes. Updates are
   **last-write-wins**, without `If-Match`; fetching a version does not lock it.
3. Share only when asked. `editUrl` opens the diagram in Chart under existing
   permissions; it grants no access. `shareUrl` is a new invitation, defaults
   to **View**, and requires the recipient to log in to Chart. Use Comment or
   Edit only when requested. Each call mints a new invitation valid for 30 days
   that cannot be revoked before use; this is not an anonymous public image URL
   or a promise that granted access ends after 30 days.

A render-only request authorizes rendering, not creation, overwrite or sharing.
An explicit store, edit or share request authorizes that requested write once
the target is clear; do not add another confirmation step by default.

Reads currently cost 0; create, update and share cost 1 on success. Create and
code-bearing updates validate code in the service and refuse invalid code
uncharged; send the requested write directly rather than adding a paid validate
call before every write. Use the same `jq`, credential and temporary-file
patterns above. Request fields and errors remain in live OpenAPI and the error
reference.

After a timeout or uncertain create/share result, stop and reconcile with the
user and available reads before another write. Blind retries can create duplicate
diagrams or invitations. Resolve stored-diagram permission or cap errors from
the live error reference rather than retrying unchanged.

## Errors

Every error body is `{ "error": { "code", "message", "details"? } }`.

- 401 `ERR_KEY_*`: stop; retrying cannot help. Tell the user the code and what
  it means (from `/v1/errors.json`) so they can fix the key, and run setup
  again for `ERR_KEY_MISSING`.
- 402 `ERR_LIMIT_BALANCE`: stop and tell the user their API credit balance is
  spent; `GET /v1/balance` shows when it resets.
- 429 `ERR_LIMIT_BURST`: wait the `retry-after` seconds, then retry once.
- Any other code: look it up in `/v1/errors.json`.

Quote the response's `x-request-id` header when the user reports a problem to
Mermaid.
