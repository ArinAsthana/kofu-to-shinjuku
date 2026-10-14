// Backgrounds: a blurred photo you pick, plus the Glass look sliders. Per phone (localStorage + the photos store); nothing here syncs.

import { photos } from "./store.js";

const K = "kts-bg";
// blur px · dim = brightness (0–1) · zoom = scale on top of the tightest fit · y = vertical crop (0 = show the top) · full = hide system bars
export const DEFAULTS = { photo: false, mins: 10, blur: 6, dim: 0.5, zoom: 1, y: 30, full: true, cam: "" };
export function cfg() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(K)) }; } catch (e) { return { ...DEFAULTS }; } }
export function setCfg(patch) { const c = { ...cfg(), ...patch }; try { localStorage.setItem(K, JSON.stringify(c)); } catch (e) {} tune(c); return c; }

const el = s => document.querySelector("#bg " + s);

// Look settings as CSS variables, so sliders update the picture live.
export function tune(c = cfg()) {
  const bg = document.querySelector("#bg"); if (!bg) return;
  bg.style.setProperty("--bgblur", c.blur + "px");
  bg.style.setProperty("--bgdim", c.dim);
  bg.style.setProperty("--bgscale", c.zoom);
  bg.style.setProperty("--bgy", c.y + "%");
}

// Glass look (per phone): hue shift of the background in degrees, glass transparency in %, frost (blur) in px, grain in %.
const LK = "kts-look";
export const LOOK = { hue: 0, clear: 91, frost: 28, grain: 40 };
// Film grain as SVG noise; k scales how strongly the specks show (1 = the default look).
const grainUri = k => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .36 0 0 0 0 .29 0 0 0 0 .21 ${(.55 * k).toFixed(3)} 0 0 0 ${(-.18 * k).toFixed(3)}'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
export function look() { try { return { ...LOOK, ...JSON.parse(localStorage.getItem(LK)) }; } catch (e) { return { ...LOOK }; } }
export function setLook(patch) { const l = patch ? { ...look(), ...patch } : { ...LOOK }; try { localStorage.setItem(LK, JSON.stringify(l)); } catch (e) {} applyLook(l); return l; }
export function applyLook(l = look()) {
  const r = document.documentElement.style;
  r.setProperty("--hue", l.hue + "deg"); r.setProperty("--glass-a", (1 - l.clear / 100).toFixed(2)); r.setProperty("--frost", l.frost + "px");
  r.setProperty("--grain", l.grain > 0 ? grainUri(l.grain / 40) : "none");
}

export async function applyPhoto() {
  applyLook();
  tune();
  const img = el("img"); if (!img) return;
  const b = cfg().photo ? await photos.get("bg").catch(() => null) : null;
  if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
  if (b) { img.dataset.url = URL.createObjectURL(b); img.src = img.dataset.url; } else img.removeAttribute("src");
  document.body.classList.toggle("has-bg", !!b);
}
export async function setPhoto(blob) { await photos.put("bg", blob); setCfg({ photo: true }); return applyPhoto(); }
export async function clearPhoto() { await photos.del("bg").catch(() => {}); setCfg({ photo: false }); return applyPhoto(); }
