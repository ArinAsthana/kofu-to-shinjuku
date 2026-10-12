// Backgrounds: a blurred photo you pick, or Glass mode (the back camera, dark and blurred, so the phone looks see-through).
// Per phone (localStorage + the photos store); nothing here syncs. Glass mode always switches itself off.

import { photos } from "./store.js";

const K = "kts-bg";
export function cfg() { try { return { photo: false, mins: 10, ...JSON.parse(localStorage.getItem(K)) }; } catch (e) { return { photo: false, mins: 10 }; } }
export function setCfg(patch) { const c = { ...cfg(), ...patch }; try { localStorage.setItem(K, JSON.stringify(c)); } catch (e) {} return c; }

let stream = null, offTimer = null, endsAt = 0, bat = null, onStop = null;
export const live = () => !!stream;
export const minsLeft = () => stream ? Math.max(0, Math.ceil((endsAt - Date.now()) / 60000)) : 0;
const el = s => document.querySelector("#bg " + s);

export async function applyPhoto() {
  const img = el("img"); if (!img) return;
  const b = cfg().photo ? await photos.get("bg").catch(() => null) : null;
  if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
  if (b) { img.dataset.url = URL.createObjectURL(b); img.src = img.dataset.url; } else img.removeAttribute("src");
  document.body.classList.toggle("has-bg", !!b || !!stream);
}
export async function setPhoto(blob) { await photos.put("bg", blob); setCfg({ photo: true }); return applyPhoto(); }
export async function clearPhoto() { await photos.del("bg").catch(() => {}); setCfg({ photo: false }); return applyPhoto(); }

const lowBattery = b => b && !b.charging && b.level < 0.2;
function onBattery() { if (lowBattery(bat)) stopGlass("Glass mode off: battery under 20%"); }

// Returns "" on success, or why it couldn't start.
export async function startGlass(stopped) {
  if (stream) return "";
  onStop = stopped;
  try { bat = navigator.getBattery ? await navigator.getBattery() : null; } catch (e) { bat = null; }
  if (lowBattery(bat)) return "Battery under 20%. Glass mode stays off.";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "This browser can't use the camera.";
  try {
    // Low resolution on purpose: the blur hides detail anyway, and it keeps battery and heat down.
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 20, max: 24 } } });
  } catch (e) { stream = null; return e && e.name === "NotAllowedError" ? "Camera permission was refused." : "No camera available."; }
  const v = el("video"); v.srcObject = stream; v.play().catch(() => {});
  document.body.classList.add("has-bg", "glass-live");
  const mins = Math.max(1, cfg().mins || 10); endsAt = Date.now() + mins * 60000;
  clearTimeout(offTimer); offTimer = setTimeout(() => stopGlass(`Glass mode off after ${mins} min`), mins * 60000);
  if (bat) bat.addEventListener("levelchange", onBattery);
  return "";
}
export function stopGlass(why) {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop()); stream = null; clearTimeout(offTimer);
  if (bat) bat.removeEventListener("levelchange", onBattery);
  const v = el("video"); if (v) v.srcObject = null;
  document.body.classList.remove("glass-live");
  applyPhoto();
  if (onStop) onStop(why || "");
}
// Leaving the app ends Glass mode; the camera never runs in the background.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") stopGlass("Glass mode off"); });
