import { getStore } from "@netlify/blobs";

const STORE = "spell-formal";
const KEY = "all";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function cleanRecord(record) {
  if (!record || typeof record !== "object") return null;
  const text = String(record.text || "").replace(/\u0000/g, "").trim();
  if (!text) return null;
  return {
    text: text.slice(0, 8000),
    num: String(record.num || "").slice(0, 16),
    zh: String(record.zh || "").slice(0, 80),
    en: String(record.en || "").slice(0, 160),
    updated: new Date().toISOString()
  };
}

function cleanKey(key) {
  const value = String(key || "");
  if (!value || value.length > 500 || /[\u0000-\u001f]/.test(value)) return "";
  return value;
}

async function updateAll(mutate) {
  const store = getStore({ name: STORE, consistency: "strong" });
  for (let i = 0; i < 6; i++) {
    const got = await store.getWithMetadata(KEY, { type: "json", consistency: "strong" });
    const current = got && got.data && typeof got.data === "object" ? got.data : {};
    mutate(current);
    if (got && got.etag) {
      const result = await store.setJSON(KEY, current, { onlyIfMatch: got.etag });
      if (result && result.modified) return current;
      continue;
    }
    const created = await store.setJSON(KEY, current, { onlyIfNew: true });
    if (!created || created.modified !== false) return current;
  }
  throw new Error("busy");
}

export default async (req) => {
  if (req.method === "GET") {
    const store = getStore({ name: STORE, consistency: "strong" });
    const settings = (await store.get(KEY, { type: "json", consistency: "strong" })) || {};
    return json({ ok: true, settings });
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "不是有效的內容" }, 400);
    }
    const key = cleanKey(body && body.key);
    if (!key) return json({ ok: false, error: "沒有這條法術" }, 400);
    const record = cleanRecord(body && body.record);
    try {
      const settings = await updateAll(current => {
        if (record) current[key] = record;
        else delete current[key];
      });
      return json({ ok: true, settings });
    } catch {
      return json({ ok: false, error: "沒寫上，請再存一次" }, 503);
    }
  }

  return json({ ok: false, error: "不支援這個動作" }, 405);
};
