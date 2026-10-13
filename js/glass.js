// Backgrounds: a blurred photo you pick, or Glass mode (the back camera, darkened and lightly blurred, so the phone
// looks see-through). Per phone (localStorage + the photos store); nothing here syncs. Glass mode always switches itself off.

import { photos } from "./store.js";

const K = "kts-bg";
// blur px · dim = brightness (0–1) · zoom = scale on top of the tightest fit · y = vertical crop (0 = show the top) · full = hide system bars
export const DEFAULTS = { photo: false, mins: 10, blur: 6, dim: 0.5, zoom: 1, y: 30, full: true, cam: "" };
export function cfg() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(K)) }; } catch (e) { return { ...DEFAULTS }; } }
export function setCfg(patch) { const c = { ...cfg(), ...patch }; try { localStorage.setItem(K, JSON.stringify(c)); } catch (e) {} tune(c); return c; }

let cams = [], stream = null, offTimer = null, endsAt = 0, bat = null, onStop = null, wentFull = false, sampler = null;
export const live = () => !!stream;
export const minsLeft = () => stream ? Math.max(0, Math.ceil((endsAt - Date.now()) / 60000)) : 0;
const el = s => document.querySelector("#bg " + s);

// Look settings as CSS variables, so sliders update the picture live.
export function tune(c = cfg()) {
  const bg = document.querySelector("#bg"); if (!bg) return;
  bg.style.setProperty("--bgblur", c.blur + "px");
  bg.style.setProperty("--bgdim", c.dim);
  bg.style.setProperty("--bgscale", c.zoom);
  bg.style.setProperty("--bgy", c.y + "%");
}

// Glass look (per phone): hue shift of the background in degrees, glass transparency in %, frost (blur) in px.
const LK = "kts-look";
export const LOOK = { hue: 0, clear: 91, frost: 28 };
export function look() { try { return { ...LOOK, ...JSON.parse(localStorage.getItem(LK)) }; } catch (e) { return { ...LOOK }; } }
export function setLook(patch) { const l = patch ? { ...look(), ...patch } : { ...LOOK }; try { localStorage.setItem(LK, JSON.stringify(l)); } catch (e) {} applyLook(l); return l; }
export function applyLook(l = look()) {
  const r = document.documentElement.style;
  r.setProperty("--hue", l.hue + "deg"); r.setProperty("--glass-a", (1 - l.clear / 100).toFixed(2)); r.setProperty("--frost", l.frost + "px");
}

export async function applyPhoto() {
  applyLook();
  tune();
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

// The status bar takes the colour of the top of the picture, so it blends in when full screen isn't on.
// The status bar colour (index.html), overridden while Glass mode runs.
const metas = () => document.querySelectorAll('meta[name="theme-color"]');
const meta = () => ({ setAttribute: (k, v) => metas().forEach(m => { if (!m.dataset.orig) m.dataset.orig = m.content; m.setAttribute(k, v === "reset" ? m.dataset.orig : v); }) });
function sample() {
  const v = el("video"); if (!v || !v.videoWidth) return;
  const c = sample.c || (sample.c = document.createElement("canvas")); c.width = 8; c.height = 8;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(v, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 1).data, k = cfg().dim; let r = 0, g = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  const hx = n => Math.round(n / 8 * k).toString(16).padStart(2, "0");
  meta()?.setAttribute("content", "#" + hx(r) + hx(g) + hx(b));
}

// The back lenses, as the browser lists them once camera permission is granted.
async function listCams() {
  try { cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput" && !/front|user|selfie/i.test(d.label)); } catch (e) { cams = []; }
}
const camId = () => { try { return stream.getVideoTracks()[0].getSettings().deviceId || ""; } catch (e) { return ""; } };
async function open(id) {
  const video = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } };
  let s;
  if (id) { try { s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...video, deviceId: { exact: id } } }); } catch (e) { s = null; } }
  if (!s) s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...video, facingMode: { ideal: "environment" } } });
  // Widest view the lens offers, where the phone supports camera zoom.
  try { const t = s.getVideoTracks()[0], caps = t.getCapabilities ? t.getCapabilities() : {}; if (caps.zoom) await t.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] }); } catch (e) {}
  return s;
}
async function swap(id) {
  stream.getTracks().forEach(t => t.stop());
  stream = await open(id);
  const v = el("video"); if (v && v.srcObject) { v.srcObject = stream; v.play().catch(() => {}); }
}
// Lens picker: "Back 2 of 3". Only after Glass mode has run once (labels need permission).
export const lens = () => { const i = cams.findIndex(d => d.deviceId === camId()); return { n: cams.length, i: i < 0 ? 0 : i }; };
export async function nextLens() {
  if (!stream || cams.length < 2) return;
  const { i } = lens(), next = cams[(i + 1) % cams.length];
  try { await swap(next.deviceId); setCfg({ cam: next.deviceId }); } catch (e) { stopGlass("That lens couldn't start"); }
}

// Returns "" on success, or why it couldn't start. Call straight from a tap: full screen needs the tap.
export async function startGlass(stopped) {
  if (stream) return "";
  onStop = stopped;
  const c = cfg();
  // Full screen hides Android's status and navigation bars, which otherwise stay solid and break the see-through look.
  wentFull = false;
  if (c.full && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen({ navigationUI: "hide" }).then(() => { wentFull = true; }).catch(() => {});
  }
  try { bat = navigator.getBattery ? await navigator.getBattery() : null; } catch (e) { bat = null; }
  if (lowBattery(bat)) { exitFull(); return "Battery under 20%. Glass mode stays off."; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { exitFull(); return "This browser can't use the camera."; }
  try { stream = await open(c.cam); }
  catch (e) { stream = null; exitFull(); return e && e.name === "NotAllowedError" ? "Camera permission was refused." : "No camera available."; }
  await listCams();
  // First run: prefer a lens labelled ultra-wide, if the phone names it.
  if (!c.cam) { const w = cams.find(d => /ultra|wide|0\.[56]/i.test(d.label)); if (w && w.deviceId !== camId()) { try { await swap(w.deviceId); } catch (e) { try { stream = await open(""); } catch (e2) { stream = null; exitFull(); return "No camera available."; } } } }
  const v = el("video"); v.srcObject = stream; v.play().catch(() => {});
  document.body.classList.add("has-bg", "glass-live");
  const mins = Math.max(1, c.mins || 10); endsAt = Date.now() + mins * 60000;
  clearTimeout(offTimer); offTimer = setTimeout(() => stopGlass(`Glass mode off after ${mins} min`), mins * 60000);
  if (bat) bat.addEventListener("levelchange", onBattery);
  clearInterval(sampler); sampler = setInterval(sample, 700);
  return "";
}
function exitFull() { if (wentFull && document.fullscreenElement) document.exitFullscreen().catch(() => {}); wentFull = false; }
export function stopGlass(why) {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop()); stream = null; clearTimeout(offTimer); clearInterval(sampler);
  if (bat) bat.removeEventListener("levelchange", onBattery);
  const v = el("video"); if (v) v.srcObject = null;
  document.body.classList.remove("glass-live");
  meta().setAttribute("content", "reset");
  exitFull();
  applyPhoto();
  if (onStop) onStop(why || "");
}
// Leaving the app ends Glass mode; the camera never runs in the background.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") stopGlass("Glass mode off"); });
