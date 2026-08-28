/**
 * マキモノ公開API の薄いクライアント。
 * 依存パッケージゼロ = npx の初回起動が速く、サプライチェーンも増やさない。
 */
export const BASE = process.env.MAKIMONO_BASE || "https://makimono-md.vercel.app";
export const VERSION = "0.1.0";

async function call(path, { ua, method = "GET", body, timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "User-Agent": ua,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

// 語の分割に使う区切り。全角スペースと日本語の読点・句点も含める。
const TERM_SEPARATORS = /[\s　\-_/,、。]+/;

// 落としても検索意図が変わらない語。1文字語はこれとは別に落とす。
const STOPWORDS = new Set([
  "the", "a", "an", "for", "to", "of", "and", "or",
  "で", "を", "に", "は", "が", "の", "する", "して",
]);

const MAX_FALLBACK_TERMS = 5;

/** クエリを検索語に割る。フォールバックすべきでなければ空配列を返す。 */
export function splitTerms(query) {
  const terms = String(query ?? "")
    .split(TERM_SEPARATORS)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t.toLowerCase()));
  const uniq = [...new Set(terms)];
  return uniq.length >= 2 ? uniq.slice(0, MAX_FALLBACK_TERMS) : [];
}

async function searchOnce(query, { freeOnly, limit, ua }) {
  const params = new URLSearchParams({ q: query ?? "", limit: String(limit) });
  if (freeOnly) params.set("free_only", "true");
  const { status, text } = await call(`/api/v1/search?${params}`, { ua });
  if (status !== 200) throw new Error(`search failed: ${status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/**
 * 本番APIはトークン分割をしないため、"Gmail auto-triage" のような複数語クエリが
 * 0件になる。エージェントは自然な複数語で聞いてくるので、ここで吸収しないと
 * 「該当なし=ゼロから設計」に倒れてこのツールの意味が無くなる。
 *
 * 1語ずつ並列に引き直し、ヒットした語数が多い順にマージして返す。
 */
export async function search(query, { freeOnly = false, limit = 5, ua } = {}) {
  const first = await searchOnce(query, { freeOnly, limit, ua });
  if (Array.isArray(first.results) && first.results.length > 0) return first;

  const terms = splitTerms(query);
  if (terms.length === 0) return first;

  const settled = await Promise.allSettled(
    terms.map((t) => searchOnce(t, { freeOnly, limit, ua })),
  );

  // slug ごとに「何語でヒットしたか」と「各語の中での最良順位」を集計する。
  const merged = new Map();
  let base = null;
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    if (base === null) base = outcome.value;
    const results = Array.isArray(outcome.value.results) ? outcome.value.results : [];
    results.forEach((item, index) => {
      const key = item?.slug;
      if (!key) return;
      const hit = merged.get(key);
      if (hit) {
        hit.hits += 1;
        hit.rank = Math.min(hit.rank, index);
      } else {
        merged.set(key, { item, hits: 1, rank: index });
      }
    });
  }
  if (base === null) return first;

  const results = [...merged.values()]
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank)
    .slice(0, limit)
    .map((entry) => entry.item);

  return { ...base, count: results.length, results, fallback: true, terms };
}

export async function getRaw(slug, { ua } = {}) {
  const { status, text } = await call(`/api/v1/files/${encodeURIComponent(slug)}/raw`, { ua });
  if (status === 404) throw new Error(`そのslugの巻物は見つかりませんでした: ${slug}`);
  if (status === 402) return { paid: true, preview: text };
  if (status !== 200) throw new Error(`raw failed: ${status}`);
  return { paid: false, body: text };
}

export async function report(slug, savedTokens, { model, ua } = {}) {
  const { status, text } = await call("/api/v1/report", {
    ua,
    method: "POST",
    body: { slug, savedTokens, ...(model ? { model } : {}) },
  });
  if (status !== 200) throw new Error(`report failed: ${status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}
