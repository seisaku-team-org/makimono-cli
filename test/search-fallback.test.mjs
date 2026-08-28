/**
 * 複数語クエリのフォールバック検証。
 *
 * 本番APIは q のトークン分割をしないため "Gmail auto-triage" が0件になる。
 * ネットワークに依存する結合テストと、ダミーサーバーでの単体テストを分けている。
 */
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, test } from "node:test";

const ORIGINAL_BASE = process.env.MAKIMONO_BASE;

/** src/api.mjs は BASE を読み込み時に確定するので、毎回 import し直す。 */
async function loadApi() {
  return import(`../src/api.mjs?t=${Math.random()}`);
}

describe("splitTerms", async () => {
  const { splitTerms } = await loadApi();

  test("複数語は分割される", () => {
    assert.deepEqual(splitTerms("Gmail auto-triage"), ["Gmail", "auto", "triage"]);
  });

  test("全角スペースと日本語の助詞を落とす", () => {
    assert.deepEqual(splitTerms("GAS　定期実行 を 自動化"), ["GAS", "定期実行", "自動化"]);
  });

  test("単語だけならフォールバックしない(空配列)", () => {
    assert.deepEqual(splitTerms("gmail"), []);
    assert.deepEqual(splitTerms("  gmail  "), []);
  });

  test("1文字語とストップワードは落ちる", () => {
    assert.deepEqual(splitTerms("a b the gmail"), []);
  });

  test("語数は5つまでに制限される", () => {
    assert.equal(splitTerms("one two three four five six seven").length, 5);
  });
});

describe("search フォールバック (ダミーサーバー)", () => {
  let server;
  let calls;

  before(async () => {
    calls = [];
    // 語ごとに違う結果を返す。多語ヒットの順位付けと重複排除を検証するため
    // "alpha" と "beta" の両方に shared を含めている。
    const byTerm = {
      alpha: ["only-alpha", "shared"],
      beta: ["shared", "only-beta"],
    };
    server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://localhost");
      const q = url.searchParams.get("q") ?? "";
      calls.push(q);
      const slugs = byTerm[q] ?? [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        _ai_note: "keep me",
        count: slugs.length,
        results: slugs.map((slug) => ({ slug, title: slug })),
      }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.MAKIMONO_BASE = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (ORIGINAL_BASE === undefined) delete process.env.MAKIMONO_BASE;
    else process.env.MAKIMONO_BASE = ORIGINAL_BASE;
    await new Promise((resolve) => server.close(resolve));
  });

  test("0件のときだけ語ごとに引き直す", async () => {
    const { search } = await loadApi();
    calls.length = 0;
    const out = await search("alpha beta");
    assert.equal(out.fallback, true);
    assert.deepEqual(out.terms, ["alpha", "beta"]);
    // 全体クエリ1回 + 語2回。語の検索は並列なので到着順は保証されない。
    assert.equal(calls.length, 3);
    assert.equal(calls[0], "alpha beta");
    assert.deepEqual([...calls.slice(1)].sort(), ["alpha", "beta"]);
  });

  test("重複排除し、ヒット語数が多いものを上位にする", async () => {
    const { search } = await loadApi();
    const out = await search("alpha beta");
    assert.deepEqual(out.results.map((r) => r.slug), ["shared", "only-alpha", "only-beta"]);
    assert.equal(out.count, 3);
  });

  test("既存フィールドを消さない", async () => {
    const { search } = await loadApi();
    const out = await search("alpha beta");
    assert.equal(out.ok, true);
    assert.equal(out._ai_note, "keep me");
  });

  test("1語目でヒットしたらフォールバックしない", async () => {
    const { search } = await loadApi();
    calls.length = 0;
    const out = await search("alpha");
    assert.equal(out.fallback, undefined);
    assert.deepEqual(calls, ["alpha"]);
  });

  test("limit を超えない", async () => {
    const { search } = await loadApi();
    const out = await search("alpha beta", { limit: 2 });
    assert.equal(out.results.length, 2);
  });

  test("語が全部空振りでも例外にせず0件で返す", async () => {
    const { search } = await loadApi();
    const out = await search("zzz9 qqq8");
    assert.equal(out.results.length, 0);
  });
});

describe("search フォールバック (本番API結合)", () => {
  test("README記載の 'Gmail auto-triage' が1件以上返る", async () => {
    const { search } = await loadApi();
    const out = await search("Gmail auto-triage");
    assert.ok(out.results.length > 0, "0件だとエージェントがゼロから設計してしまう");
  });

  test("README記載の 'GAS 定期実行' が1件以上返る", async () => {
    const { search } = await loadApi();
    const out = await search("GAS 定期実行");
    assert.ok(out.results.length > 0);
  });

  test("単語クエリはフォールバックせずに返る", async () => {
    const { search } = await loadApi();
    const out = await search("gmail");
    assert.ok(out.results.length > 0);
    assert.equal(out.fallback, undefined);
  });
});
