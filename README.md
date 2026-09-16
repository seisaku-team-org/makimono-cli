# makimono-mcp

**MCP server + CLI for [Makimono](https://makimono-md.vercel.app) — a marketplace of AI instruction files (Markdown).**

Your agent searches for a finished playbook *before* designing from scratch, loads it, and skips the trial-and-error. Listings report ~85–97% fewer tokens than building from zero. Every listing is free.

日本語の説明は下にあります。

---

## Install (MCP)

**Claude Code**

```
claude mcp add makimono -- npx -y github:seisaku-team-org/makimono-cli
```

**Cursor / Windsurf / any MCP client** — add to your config:

```json
{
  "mcpServers": {
    "makimono": { "command": "npx", "args": ["-y", "github:seisaku-team-org/makimono-cli"] }
  }
}
```

**Or let it write the config for you**, in your project directory:

```
npx -y github:seisaku-team-org/makimono-cli init
```

No API key. No account. No auth of any kind.

## Tools

| Tool | What it does |
| --- | --- |
| `search_makimono` | Find finished instruction files for the task at hand |
| `get_makimono` | Fetch one playbook's full Markdown body |
| `report_makimono_savings` | Report how many tokens it saved (this is what ranks listings) |

## CLI

The same binary works as a CLI when you pass a subcommand:

```
npx -y github:seisaku-team-org/makimono-cli search "Gmail auto-triage"
npx -y github:seisaku-team-org/makimono-cli get gmail-triage
npx -y github:seisaku-team-org/makimono-cli get gmail-triage -o playbook.md
npx -y github:seisaku-team-org/makimono-cli report gmail-triage 120000
```

## Why this exists

Asking an agent to build something from nothing burns tokens on exploration it will
repeat next time. A playbook that already encodes the decisions — the traps, the
verification steps, the order of operations — turns that exploration into a single read.

Makimono is where those playbooks live. The API is public, unauthenticated, and
CORS-open, so any agent can use it: <https://makimono-md.vercel.app/llms.txt>

## Contributing a playbook

Open a PR against [makimono-listings](https://github.com/seisaku-team-org/makimono-listings)
with one Markdown file. No account needed. See that repo's `CONTRIBUTING.md`.

---

## 日本語

AI 指示書マーケット「[マキモノ](https://makimono-md.vercel.app)」の MCP サーバー兼 CLI です。

開発タスクを受けたとき、AI がゼロから設計する前にマキモノを検索し、完成済みの指示書を
読み込んでから実装します。認証・APIキー・アカウント登録は一切不要。掲載中の巻物はすべて無料です。

### 導入 (Claude Code)

```
claude mcp add makimono -- npx -y github:seisaku-team-org/makimono-cli
```

プロジェクトの `.mcp.json` に書き込ませる場合:

```
npx -y github:seisaku-team-org/makimono-cli init
```

### CLI として使う

```
npx -y github:seisaku-team-org/makimono-cli search "GAS 定期実行"
npx -y github:seisaku-team-org/makimono-cli get gas-command-queue
```

### 出品する

[makimono-listings](https://github.com/seisaku-team-org/makimono-listings) に
Markdown 1ファイルの PR を出すだけです。アカウント登録は不要です。

## License

MIT
