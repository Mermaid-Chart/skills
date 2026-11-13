# Mermaid skills

Agent skills for [Mermaid](https://mermaid.ai) diagrams, in the
[Agent Skills](https://agentskills.io) format, for coding agents with a shell:
Claude Code, Codex, Cursor and others. macOS, Linux and WSL.

| Skill                                        | What it does                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`mermaid-api`](skills/mermaid-api/SKILL.md) | Validate and render diagrams, and generate or repair them with Mermaid AI, through Mermaid API. Beta. |

## Install

Any of the three.

**npx**, for any agent the [skills CLI](https://github.com/vercel-labs/skills)
knows:

```bash
npx skills add Mermaid-Chart/skills
```

**Claude Code plugin marketplace**, in Claude Code:

```text
/plugin marketplace add Mermaid-Chart/skills
/plugin install mermaid-api@mermaid
```

**By hand**: copy `skills/mermaid-api` into your agent's skills folder:
`~/.claude/skills/` for Claude Code, `~/.agents/skills/` for Codex, Cursor and
other agents that read the shared location. Use the project's `.claude/skills/`
or `.agents/skills/` to install for one project only.

## Mermaid API key

The skill walks you through this the first time: create a key in the
[console](https://api.mermaid.ai/console), then run this in your own terminal.
It prompts for the key without echoing it and saves it, readable only by you,
outside any project:

```bash
mkdir -p ~/.config/mermaid-api && (umask 077; printf 'Mermaid API key: '; read -rs k && printf 'Authorization: Bearer %s\n' "$k" > ~/.config/mermaid-api/credentials; echo)
```

`MERMAID_API_KEY` in the environment takes precedence over the file.
`MERMAID_API_URL` points the skill at another Mermaid API deployment.

## Development

`npm test` runs the drift check's tests; `npm run drift` checks
`skills/mermaid-api/SKILL.md` against the production `/v1/openapi.json`: every
path it names must exist, and every cost it states must equal the operation's
`x-cost`. The [Drift](.github/workflows/drift.yml) workflow runs both daily and
on every change. [`docs/spec.md`](docs/spec.md) records what the skill is for
and the decisions behind it.
