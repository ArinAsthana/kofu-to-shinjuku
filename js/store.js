// Local-first storage: one state object in IndexedDB, photos in their own store.
// Every record has an id and `u` (last-updated ms). Deletes are tombstones ({del:true})
// so sync between devices never resurrects or loses records.

import { APP_ID, SCHEMA_VERSION, DEFAULT_REWARDS, HABITS, DATES } from "./data.js";

export const RECORD_STORES = [
  "habitLog", "xpEvents", "rewardHistory", "exercises", "areaState",
  "workouts", "runs", "bodyweight", "physique", "meals", "savedMeals",
];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function fresh() {
  const s = { app: APP_ID, schemaVersion: SCHEMA_VERSION, settings: freshSettings(), readiness: null };
  RECORD_STORES.forEach(k => (s[k] = []));
  return s;
}
function freshSettings() {
  return {
    u: 0,
    dates: { ...DATES },
    rewardChance: 0.18,
    rewardPool: DEFAULT_REWARDS.slice(),
    food: { kcalTarget: null, proteinTarget: null },
    habitTargets: Object.fromEntries(HABITS.map(h => [h.id, h.target]).concat([["outreach", 5]])),
    lastExportAt: null,
  };
}

/* ---------- IndexedDB ---------- */
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open("kts", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("kv"); r.result.createObjectStore("photos"); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  });
}
const kvGet = k => tx("kv", "readonly", s => s.get(k));
const kvPut = (k, v) => tx("kv", "readwrite", s => s.put(v, k));
const kvDel = k => tx("kv", "readwrite", s => s.delete(k));
const kvKeys = () => tx("kv", "readonly", s => s.getAllKeys());

export const photos = {
  put: (id, blob) => tx("photos", "readwrite", s => s.put(blob, id)),
  get: id => tx("photos", "readonly", s => s.get(id)),
  del: id => tx("photos", "readwrite", s => s.delete(id)),
};

/* ---------- state ---------- */
export let S = fresh();
const listeners = [];
export const onSave = fn => listeners.push(fn);

export async function load() {
  let saved = null;
  try { saved = await kvGet("state"); } catch (e) { console.error(e); }
  if (saved) {
    if ((saved.schemaVersion || 0) < SCHEMA_VERSION) await snapshot("pre-migration");
    S = migrate(saved);
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  return S;
}

let timer = null;
export function save(opts = {}) {
  S.settings.u = S.settings.u || 0;
  clearTimeout(timer);
  timer = setTimeout(() => kvPut("state", S).catch(e => console.error("save failed", e)), 150);
  if (!opts.quiet) listeners.forEach(fn => fn());
}
export async function flush() { clearTimeout(timer); await kvPut("state", S); }
export function replaceState(next) { S = next; }

// Keeps the last 5 copies of the state before risky operations (migration, import).
export async function snapshot(reason) {
  const cur = await kvGet("state");
  if (!cur) return;
  await kvPut("snap-" + Date.now() + "-" + reason, cur);
  const snaps = (await kvKeys()).filter(k => String(k).startsWith("snap-")).sort();
  for (const k of snaps.slice(0, Math.max(0, snaps.length - 5))) await kvDel(k);
}

/* ---------- migrations ---------- */
// MIGRATIONS[n] upgrades a state at schemaVersion n to n+1. Never remove one.
const MIGRATIONS = {};
export function migrate(s) {
  let v = s.schemaVersion || 1;
  while (v < SCHEMA_VERSION) { s = MIGRATIONS[v](s); v++; s.schemaVersion = v; }
  const base = fresh();
  for (const k of RECORD_STORES) if (!Array.isArray(s[k])) s[k] = [];
  s.settings = Object.assign(base.settings, s.settings || {});
  s.settings.food = Object.assign(base.settings.food, s.settings.food || {});
  s.settings.habitTargets = Object.assign(base.settings.habitTargets, s.settings.habitTargets || {});
  s.settings.dates = Object.assign(base.settings.dates, s.settings.dates || {});
  s.app = APP_ID;
  return s;
}

/* ---------- record helpers ---------- */
export const live = k => S[k].filter(r => !r.del);
export function put(k, rec) {
  rec.u = Date.now();
  if (!rec.id) rec.id = uid();
  const i = S[k].findIndex(r => r.id === rec.id);
  if (i >= 0) S[k][i] = rec; else S[k].push(rec);
  return rec;
}
export function remove(k, id) {
  const i = S[k].findIndex(r => r.id === id);
  if (i >= 0) S[k][i] = { id, u: Date.now(), del: true };
}
export function touchSettings() { S.settings.u = Date.now(); }

/* ---------- merge (sync and import) ---------- */
export function mergeRecords(a = [], b = []) {
  const m = new Map();
  for (const r of a) m.set(r.id, r);
  for (const r of b) { const cur = m.get(r.id); if (!cur || (r.u || 0) > (cur.u || 0)) m.set(r.id, r); }
  return [...m.values()];
}
export function mergeState(local, incoming) {
  const out = { ...local };
  for (const k of RECORD_STORES) out[k] = mergeRecords(local[k], incoming[k]);
  out.settings = (incoming.settings && (incoming.settings.u || 0) > (local.settings.u || 0)) ? incoming.settings : local.settings;
  if (incoming.readiness && !local.readiness) out.readiness = incoming.readiness;
  return out;
}

/* ---------- export / import ---------- */
export function exportObject() {
  const o = { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: localIso(new Date()), settings: S.settings, readiness: S.readiness };
  for (const k of RECORD_STORES) o[k] = live(k);
  return o;
}
export function validateImport(o) {
  if (!o || typeof o !== "object") return "That file isn't JSON from this app.";
  if (o.app !== APP_ID) return o.v === 1 && o.jp ? "That's an old planner backup. Planner import arrives in v2." : "That file isn't an export from this app.";
  if (!o.schemaVersion || o.schemaVersion > SCHEMA_VERSION) return "That export is from a newer version of the app. Update first.";
  return null;
}
export async function importMerge(o) {
  await flush();
  await snapshot("pre-import");
  const inc = migrate(JSON.parse(JSON.stringify(o)));
  S = migrate(mergeState(S, inc));
  await flush();
}

export function localIso(d) {
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? "+" : "-", p = n => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + sign + p(off / 60) + ":" + p(off % 60);
}
