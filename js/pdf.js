// v13: a tiny PDF writer for the CV (A4, Helvetica, text and rules only). No library, and it works in the APK,
// where the WebView has no print dialog. Text is WinAnsi: characters outside it are dropped (the CV is English).
// model: {name, contact, sections:[{title, items:[{text, head?, para?}]}]}. Returns the PDF as an ASCII string.

const W = 595.28, H = 841.89, ML = 54, MR = 54, MT = 56, MB = 56;
// Helvetica and Helvetica-Bold advance widths (1/1000 em) for ASCII 32-126.
const REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const SPECIAL = { "·": [0xb7, 278], "–": [0x96, 556], "—": [0x97, 1000], "•": [0x95, 350], "‘": [0x91, 222], "’": [0x92, 222], "“": [0x93, 333], "”": [0x94, 333], "€": [0x80, 556], "¥": [0xa5, 556], "é": [0xe9, 556], "è": [0xe8, 556], "ü": [0xfc, 556], "ö": [0xf6, 556], "×": [0xd7, 584] };
const code = ch => { const c = ch.charCodeAt(0); return c >= 32 && c < 127 ? c : SPECIAL[ch] ? SPECIAL[ch][0] : null; };
const width = (s, bold, size) => [...s].reduce((a, ch) => { const c = ch.charCodeAt(0); return a + (c >= 32 && c < 127 ? (bold ? BOLD : REG)[c - 32] : SPECIAL[ch] ? SPECIAL[ch][1] : 0); }, 0) * size / 1000;
const clean = s => [...String(s || "").replace(/→/g, "to").replace(/\s+/g, " ")].filter(ch => code(ch) != null).join("").trim();
const lit = s => "(" + [...s].map(ch => { const c = code(ch); return ch === "(" || ch === ")" || ch === "\\" ? "\\" + ch : c < 127 ? ch : "\\" + c.toString(8).padStart(3, "0"); }).join("") + ")";

function wrap(text, bold, size, max) {
  const out = []; let cur = "";
  for (const w of text.split(" ")) {
    const t = cur ? cur + " " + w : w;
    if (width(t, bold, size) <= max || !cur) cur = t; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

export function cvPdf(m) {
  const pages = []; let ops = [], y = H - MT;
  const newPage = () => { pages.push(ops); ops = []; y = H - MT; };
  const need = h => { if (y - h < MB) newPage(); };
  const text = (s, x, size, bold, grey = 0) => ops.push(`BT ${grey ? `${grey} g ` : ""}/${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${lit(s)} Tj ET${grey ? " 0 g" : ""}`);
  const full = W - ML - MR;

  y -= 20; text(clean(m.name), ML, 20, true);
  if (m.contact) { y -= 15; text(clean(m.contact), ML, 9.5, false, 0.3); }
  y -= 6;
  for (const sec of m.sections) {
    need(40); y -= 18; text(clean(sec.title).toUpperCase(), ML, 10.5, true);
    y -= 4; ops.push(`0.5 w ${ML} ${y.toFixed(2)} m ${(W - MR).toFixed(2)} ${y.toFixed(2)} l S`); y -= 2;
    for (const it of sec.items) {
      const s = clean(it.text); if (!s) continue;
      const bullet = !it.para && !it.head, x = bullet ? ML + 11 : ML, size = 10, lead = 13.5;
      const L = wrap(s, !!it.head, size, full - (x - ML));
      L.forEach((ln, i) => { need(lead); y -= lead; if (bullet && i === 0) text("•", ML + 2, size, false); text(ln, x, size, !!it.head); });
      if (it.head) y -= 1;
    }
  }
  pages.push(ops);

  // Objects: 1 catalog, 2 pages, 3 F1, 4 F2, then a page and its content stream for each page.
  const objs = [], kids = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  pages.forEach((p, i) => {
    const po = 5 + i * 2, co = po + 1, body = p.join("\n");
    kids.push(`${po} 0 R`);
    objs[po] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${co} 0 R >>`;
    objs[co] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let out = "%PDF-1.4\n"; const off = [];
  for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Producer (The Arin) >> >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
