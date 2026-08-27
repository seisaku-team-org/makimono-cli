#!/usr/bin/env node
/**
 * 引数なし  → MCP サーバー (stdio) として起動。AIクライアントから呼ばれる通常の使い方。
 * 引数あり  → CLI として動作 (search / get / report / init)。
 * 1つの bin で両対応にしてあるので、利用者は npx を1つ覚えるだけで済む。
 */
const CLI_COMMANDS = new Set(["search", "get", "report", "init", "help", "--help", "-h", "--version", "-v"]);
const first = process.argv[2];

if (first && CLI_COMMANDS.has(first)) {
  await import("./makimono.mjs");
} else if (first && first !== "mcp") {
  console.error(`不明なコマンド: ${first}\n使い方: makimono-mcp [search|get|report|init]  (引数なしで MCP サーバーとして起動)`);
  process.exitCode = 1;
} else {
  const { start } = await import("../src/mcp.mjs");
  start();
}
