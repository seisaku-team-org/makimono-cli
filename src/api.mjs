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

export async function search(query, { freeOnly = false, limit = 5, ua } = {}) {
  const params = new URLSearchParams({ q: query ?? "", limit: String(limit) });
  if (freeOnly) params.set("free_only", "true");
  const { status, text } = await call(`/api/v1/search?${params}`, { ua });
  if (status !== 200) throw new Error(`search failed: ${status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
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
