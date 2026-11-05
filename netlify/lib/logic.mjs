import { timingSafeEqual, randomUUID } from "node:crypto";

const TZ = "Africa/Nairobi";
export const blank = () => ({ goal: 50000, cur: "KSh", ff: "", gifts: [], bounties: [], feed: [] });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const wed = (v) => {
  const d = new Date(v + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 4) % 7));
  return d.toLocaleDateString("en-CA");
};
const clean = (s, n) => String(s ?? "").replace(/[<>&"]/g, "").trim().slice(0, n);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const teamOf = (S, name) => (S.gifts.find((x) => same(x.name, name) && x.team) || {}).team || "";

// Put a new member on the smaller team. If the teams are equal, flip a coin.
function assign(S) {
  const mem = {};
  S.gifts.forEach((g) => { if (g.team) mem[g.name.toLowerCase()] = g.team; });
  let ice = 0, fire = 0;
  Object.values(mem).forEach((t) => (t === "Ice" ? ice++ : fire++));
  return ice < fire ? "Ice" : fire < ice ? "Fire" : Math.random() < 0.5 ? "Ice" : "Fire";
}

export function leaderOk(pin, secret) {
  if (!secret || typeof pin !== "string") return false;
  const a = Buffer.from(pin), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Transaction codes are only shown to leaders.
export function view(S, lead) {
  return { ...S, gifts: S.gifts.map((g) => { if (lead) return g; const { code, ...r } = g; return { ...r, hasCode: !!code }; }) };
}

function addFeed(S, list) {
  (Array.isArray(list) ? list : []).slice(0, 8).forEach((t) => {
    const s = clean(t, 160);
    if (s) S.feed.unshift({ t: s, d: today() });
  });
  S.feed = S.feed.slice(0, 40);
}

// Returns an error string, or "" when the change was applied.
export function apply(S, b, extra) {
  switch (b.a) {
    case "gift": {
      const name = clean(b.name, 30), amt = Math.round(+b.amt);
      if (!name) return "Add your name.";
      if (!(amt >= 1 && amt <= 1000000)) return "The amount must be between 1 and 1,000,000.";
      if (S.gifts.length >= 5000) return "Too many entries. Ask a leader to reset.";
      const ex = S.gifts.find((g) => same(g.name, name));
      const nm = ex ? ex.name : name;
      let t = teamOf(S, nm);
      const isNew = !t;
      if (isNew) t = assign(S);
      let date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : today();
      if (isNaN(new Date(date + "T12:00:00"))) date = today();
      S.gifts.push({ id: randomUUID(), name: nm, amt, wk: wed(date), code: clean(b.code, 30), team: t, ok: false });
      Object.assign(extra, { isNew, team: t, name: nm });
      return "";
    }
    case "confirm": {
      const g = S.gifts.find((x) => x.id === b.id);
      if (!g) return "That gift was not found. It may have been removed.";
      if (g.ok === true) return "";
      g.ok = true;
      addFeed(S, b.feed);
      return "";
    }
    case "remove": {
      const i = S.gifts.findIndex((x) => x.id === b.id && x.ok !== true);
      if (i < 0) return "Only waiting gifts can be removed.";
      S.gifts.splice(i, 1);
      return "";
    }
    case "bountyAdd": {
      const t = clean(b.t, 80), pts = Math.round(+b.pts);
      if (!t || !(pts >= 1 && pts <= 1000)) return "Add a title and 1 to 1000 points.";
      S.bounties.push({ id: randomUUID(), t, pts });
      addFeed(S, b.feed);
      return "";
    }
    case "bountyAward": {
      const bo = S.bounties.find((x) => x.id === b.id);
      const n = clean(b.name, 30);
      if (!bo || bo.won || !n) return "That bounty is not open.";
      const ex = S.gifts.find((g) => same(g.name, n));
      bo.won = ex ? ex.name : n;
      addFeed(S, b.feed);
      return "";
    }
    case "settings": {
      if (b.goal !== undefined) { const g = Math.round(+b.goal); if (g >= 1 && g <= 1e9) S.goal = g; }
      if (b.cur !== undefined) S.cur = clean(b.cur, 6) || S.cur;
      if (b.ff !== undefined) S.ff = clean(b.ff, 80);
      return "";
    }
    case "reset":
      S.gifts = []; S.bounties = []; S.feed = [];
      return "";
    default:
      return "Unknown action.";
  }
}

const PRIVATE = new Set(["confirm", "remove", "bountyAdd", "bountyAward", "settings", "reset", "auth"]);
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function handle(req, store, secret) {
  const url = new URL(req.url);
  const lead = leaderOk(req.headers.get("x-pin") || "", secret);
  const KEY = "state";

  if (req.method === "GET" && url.pathname.endsWith("/state")) {
    const r = await store.getWithMetadata(KEY, { type: "json" });
    return json(view(r ? r.data : blank(), lead));
  }
  if (req.method !== "POST" || !url.pathname.endsWith("/act")) return json({ error: "Not found" }, 404);

  let b;
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (PRIVATE.has(b.a) && !lead) {
    return json({ error: secret ? "Wrong PIN" : "The leader PIN has not been set on the server yet" }, 401);
  }
  if (b.a === "auth") return json({ ok: true });

  // Optimistic concurrency: only write if nobody changed the data since we read it.
  for (let i = 0; i < 8; i++) {
    const r = await store.getWithMetadata(KEY, { type: "json" });
    const S = r ? r.data : blank();
    const extra = {};
    const err = apply(S, b, extra);
    if (err) return json({ error: err }, 400);
    const res = await store.setJSON(KEY, S, r ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
    if (!res || res.modified !== false) return json({ state: view(S, lead), ...extra });
    await new Promise((ok) => setTimeout(ok, 60 + Math.random() * 140));
  }
  return json({ error: "Busy right now. Try again." }, 503);
}
