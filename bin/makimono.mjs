#!/usr/bin/env node
/**
 * マキモノ CLI。
 *   makimono search "<依頼文>"      巻物を検索
 *   makimono get <slug>             本文(Markdown)を標準出力へ
 *   makimono report <slug> <tokens> 節約実績を報告
 *   makimono init                   このプロジェクトの .mcp.json に MCP サーバーを登録
 *   makimono mcp                    MCP サーバーとして起動 (stdio)
 */
import fs from "node:fs";
import path from "node:path";
import { search, getRaw, report, VERSION, BASE } from "../src/api.mjs";

const UA = `makimono-cli/${VERSION}`;
const [cmd, ...rest] = process.argv.slice(2);

function usage() {
  console.log(`マキモノ CLI v${VERSION}  (${BASE})

  makimono search "<依頼文やキーワード>" [--free] [--limit N] [--json]
  makimono get <slug> [-o <file>]
  makimono report <slug> <savedTokens> [--model <name>]
  makimono init            このプロジェクトの .mcp.json に MCP サーバーを登録する
  makimono mcp             MCP サーバーとして起動 (stdio。通常は AI 側から呼ばれる)
`);
}

const flag = (name) => rest.includes(name);
const opt = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const positional = rest.filter((a, i) => !a.startsWith("-") && !["-o", "--limit", "--model"].includes(rest[i - 1]));

async function main() {
  if (cmd === "mcp") {
    const { start } = await import("../src/mcp.mjs");
    return start();
  }

  if (cmd === "search") {
    const q = positional.join(" ");
    if (!q) return usage();
    const data = await search(q, { freeOnly: flag("--free"), limit: Number(opt("--limit")) || 5, ua: UA });
    if (flag("--json")) return console.log(JSON.stringify(data, null, 2));
    const results = data.results ?? [];
    if (!results.length) return console.log("該当なし。ゼロから設計してください。");
    for (const r of results) {
      console.log(`${r.slug}\t${r.title}\t${r.is_free || r.price === 0 ? "無料" : "¥" + r.price}\t${BASE}/md/${r.slug}`);
    }
    console.log(`\n本文を読む: makimono get <slug>`);
    return;
  }

  if (cmd === "get") {
    const slug = positional[0];
    if (!slug) return usage();
    const res = await getRaw(slug, { ua: UA });
    const text = res.paid ? res.preview : res.body;
    const out = opt("-o");
    if (out) {
      fs.writeFileSync(out, text, "utf8");
      console.error(`書き出しました: ${out}`);
    } else {
      process.stdout.write(text);
    }
    if (res.paid) process.exitCode = 2;
    return;
  }

  if (cmd === "report") {
    const [slug, tokens] = positional;
    if (!slug || !tokens) return usage();
    const data = await report(slug, Number(tokens), { model: opt("--model"), ua: UA });
    console.log(data.message ?? "報告しました");
    return;
  }

  if (cmd === "init") {
    const file = path.resolve(process.cwd(), ".mcp.json");
    let conf = { mcpServers: {} };
    if (fs.existsSync(file)) {
      try {
        conf = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        console.error(`.mcp.json が壊れているため中止しました: ${file}`);
        process.exitCode = 1;
        return;
      }
      // 既存の設定を壊さない
      fs.copyFileSync(file, `${file}.bak`);
    }
    conf.mcpServers ??= {};
    if (conf.mcpServers.makimono) {
      console.log("すでに登録済みです。変更はありません。");
      return;
    }
    conf.mcpServers.makimono = { command: "npx", args: ["-y", "makimono-mcp"] };
    fs.writeFileSync(file, JSON.stringify(conf, null, 2) + "\n", "utf8");
    console.log(`登録しました: ${file}\n次に AI クライアント(Claude Code / Cursor 等)を開き直せば有効になります。`);
    return;
  }

  usage();
}

main().catch((e) => {
  console.error(`エラー: ${e.message}`);
  process.exitCode = 1;
});
