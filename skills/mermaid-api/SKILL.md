---
name: mermaid-api
description: Validate and render Mermaid diagrams to SVG, PNG, PDF or ASCII text through the hosted Mermaid API, with curl. Use when checking Mermaid syntax, turning diagram code into an image file, generating or repairing a diagram with Mermaid AI, or setting up a Mermaid API key.
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

| Endpoint            | Use it to                                                                    | Cost |
| ------------------- | ---------------------------------------------------------------------------- | ---- |
| `POST /v1/validate` | Check diagram code; on invalid code it gives the parser's line and column    | 1    |
| `POST /v1/render`   | Turn diagram code into SVG, PNG, PDF or ASCII text                           | 5    |
| `POST /v1/generate` | Ask Mermaid AI for diagram code from a prompt                                | 25   |
| `POST /v1/repair`   | Ask Mermaid AI to fix invalid code; valid code comes back at a validate cost | 25   |
| `GET /v1/balance`   | See what remains and what every endpoint costs                               | 0    |

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
