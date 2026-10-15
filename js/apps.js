// v6.2: the Applications tracker (the Job-Readiness Plan's own table).
// applications store: {id, firm, track, role, channel, deadline, status, contact, next, nextDate, created}
// A deadline or next step within 7 days is a Raid on Home. Each step up the pipeline pays XP once.

import { live, put, remove } from "./store.js";
import * as E from "./engine.js";

export const STATUSES = ["To apply", "Applied", "Web test", "Interview 1", "Interview 2", "Final", "Offer", "Rejected"];
export const TRACKS = ["Strategy consulting", "SAP FI/CO", "Murex/Calypso", "Other"];
export const CHANNELS = ["careerforum.net", "Company site", "Referral", "OB/OG", "Agency", "Job board"];
export const RAID_DAYS = 7, XP_STEP = 15, XP_OFFER = 150;

export const closed = a => a.status === "Offer" || a.status === "Rejected";
export const all = () => live("applications").slice().sort((a, b) => (when(a) || "9999").localeCompare(when(b) || "9999") || (b.created || 0) - (a.created || 0));
// The date that matters next: the next step if set, else the deadline while not yet applied.
export function when(a) {
  if (closed(a)) return null;
  return a.nextDate || (a.status === "To apply" ? a.deadline : null) || null;
}
// Applications due within 7 days, as Raids: {a, date, what, days}.
export function raids(t = E.today()) {
  const out = [];
  for (const a of live("applications")) {
    if (closed(a)) continue;
    if (a.nextDate) { const d = E.daysBetween(t, a.nextDate); if (d <= RAID_DAYS && d >= -2) out.push({ a, date: a.nextDate, what: a.next || "Next step", days: d }); }
    if (a.deadline && a.status === "To apply") { const d = E.daysBetween(t, a.deadline); if (d <= RAID_DAYS && d >= 0 && a.deadline !== a.nextDate) out.push({ a, date: a.deadline, what: "Deadline", days: d }); }
  }
  return out.sort((x, y) => x.days - y.days);
}
export function save(f, id) {
  const old = id && live("applications").find(a => a.id === id);
  const rec = put("applications", { ...(old || { created: Date.now() }), ...f, ...(old ? { id: old.id } : {}) });
  return { rec, xp: old && old.status !== rec.status ? reward(rec) : !old && rec.status !== "To apply" ? reward(rec) : 0 };
}
// XP for reaching a status, once per application and status. Rejected pays nothing.
function reward(a) {
  const i = STATUSES.indexOf(a.status); if (i < 1 || a.status === "Rejected") return 0;
  let xp = 0;
  for (let j = 1; j <= i; j++) { // reaching Interview 1 straight from To apply pays the skipped steps too
    const ref = `app:${a.id}:${j}`; if (live("xpEvents").some(e => e.ref === ref)) continue;
    const x = STATUSES[j] === "Offer" ? XP_OFFER : XP_STEP; xp += x;
    put("xpEvents", { ts: Date.now(), type: "app", xp: x, ref, label: `${a.firm}: ${STATUSES[j]}` });
  }
  return xp;
}
// One step along the pipeline (never into Rejected).
export function advance(id) {
  const a = live("applications").find(x => x.id === id); if (!a || closed(a)) return null;
  const i = STATUSES.indexOf(a.status);
  return save({ status: STATUSES[Math.min(i + 1, STATUSES.indexOf("Offer"))], next: "", nextDate: "" }, id);
}
export const del = id => remove("applications", id);
