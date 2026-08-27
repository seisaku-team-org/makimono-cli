import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, "..", "bin", "makimono-mcp.mjs");

/** MCPサーバーを起動して JSON-RPC を順に送り、id付きの応答だけを集める */
function rpc(messages, { timeout = 40000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timeout. received: " + JSON.stringify(out)));
    }, timeout);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) out.push(JSON.parse(line));
      }
      const wanted = messages.filter((m) => m.id !== undefined).length;
      if (out.length >= wanted) {
        clearTimeout(timer);
        child.stdin.end();
        child.kill();
        resolve(out);
      }
    });
    child.on("error", reject);
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
  });
}

test("initialize / tools/list が MCP の形で返る", async () => {
  const out = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  const init = out.find((m) => m.id === 1);
  assert.equal(init.result.serverInfo.name, "makimono");
  assert.ok(init.result.capabilities.tools);

  const list = out.find((m) => m.id === 2);
  const names = list.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["get_makimono", "report_makimono_savings", "search_makimono"]);
  for (const t of list.result.tools) {
    assert.equal(t.inputSchema.type, "object", `${t.name} の inputSchema`);
    assert.ok(Array.isArray(t.inputSchema.required));
  }
});

test("notifications には応答しない / 未知メソッドは -32601", async () => {
  const out = await rpc([
    { jsonrpc: "2.0", method: "notifications/cancelled" },
    { jsonrpc: "2.0", id: 9, method: "no/such/method" },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 9);
  assert.equal(out[0].error.code, -32601);
});

test("tools/call search_makimono が本番APIから結果を返す", async () => {
  const out = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_makimono", arguments: { query: "GAS 自動化", limit: 3 } } },
  ]);
  const res = out.find((m) => m.id === 3).result;
  assert.ok(!res.isError, JSON.stringify(res));
  assert.match(res.content[0].text, /slug:/);
});

test("tools/call get_makimono が本文を返す", async () => {
  const out = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_makimono", arguments: { slug: "gas-command-queue" } } },
  ]);
  const res = out.find((m) => m.id === 4).result;
  assert.ok(!res.isError, JSON.stringify(res));
  assert.ok(res.content[0].text.length > 500, "本文が短すぎる");
});

test("存在しない slug はエラー結果として返る (プロトコルは壊さない)", async () => {
  const out = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } },
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_makimono", arguments: { slug: "no-such-slug-xyz" } } },
  ]);
  const res = out.find((m) => m.id === 5).result;
  assert.equal(res.isError, true);
});
