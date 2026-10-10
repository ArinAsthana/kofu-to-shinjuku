// Small hand-drawn SVG charts. Colors come from CSS variables (--mag, --ind, ...), so they follow the theme.

const f = n => Math.round(n * 10) / 10;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const col = c => `var(--${c})`;

// stats: [[label, 0..100, color]]
export function radar(stats) {
  const cx = 160, cy = 132, R = 92, n = stats.length;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [f(cx + r * Math.cos(a)), f(cy + r * Math.sin(a))]; };
  const ring = v => `<polygon class="g" points="${stats.map((_, i) => pt(i, R * v).join(",")).join(" ")}"/>`;
  return `<svg class="viz" viewBox="0 0 320 264" role="img" aria-label="Stat radar">
    ${[0.25, 0.5, 0.75, 1].map(ring).join("")}
    ${stats.map((s, i) => { const [x, y] = pt(i, R), [lx, ly] = pt(i, R + 18); return `<line class="g" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/><text x="${lx}" y="${ly + 4}" text-anchor="middle">${esc(s[0])} ${Math.round(s[1])}</text>`; }).join("")}
    <polygon points="${stats.map((s, i) => pt(i, R * Math.max(0.03, s[1] / 100)).join(",")).join(" ")}" style="fill:var(--mag);fill-opacity:.28;stroke:var(--mag);stroke-width:2"/>
    ${stats.map((s, i) => { const [x, y] = pt(i, R * Math.max(0.03, s[1] / 100)); return `<circle cx="${x}" cy="${y}" r="3.5" style="fill:${col(s[2])}"/>`; }).join("")}
  </svg>`;
}

// series: [{d:[values|null], c:"mag", w, dash, dots}], opts {min,max,ticks,labels:[[i,text]], goal, unit}
export function lines(series, o) {
  const W = 320, L = 36, Rr = 312, T = 10, B = 128, n = Math.max(2, series[0].d.length);
  const X = i => f(L + (Rr - L) * i / (n - 1)), Y = v => f(B - (B - T) * (v - o.min) / (o.max - o.min || 1));
  let s = `<svg class="viz" viewBox="0 0 ${W} 148" role="img" aria-label="${esc(o.label || "chart")}">`;
  for (const v of o.ticks) s += `<line class="g dash" x1="${L}" x2="${Rr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${esc(o.fmt ? o.fmt(v) : v)}</text>`;
  for (const [i, t] of o.labels || []) s += `<text x="${X(i)}" y="${B + 16}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(t)}</text>`;
  if (o.goal != null) s += `<line x1="${L}" x2="${Rr}" y1="${Y(o.goal)}" y2="${Y(o.goal)}" style="stroke:var(--lime);stroke-width:1.5;stroke-dasharray:6 4"/>`;
  for (const se of series) {
    // Break the line at gaps (null) so missing weeks aren't drawn as data.
    let seg = [], segs = [];
    se.d.forEach((v, i) => { if (v == null) { if (seg.length) segs.push(seg); seg = []; } else seg.push([X(i), Y(v)]); });
    if (seg.length) segs.push(seg);
    const st = `fill:none;stroke:${col(se.c)};stroke-width:${se.w || 2};${se.dash ? "stroke-dasharray:" + se.dash : ""}`;
    for (const g of segs) if (g.length > 1) s += `<polyline points="${g.map(p => p.join(",")).join(" ")}" style="${st}" stroke-linejoin="round"/>`;
    if (se.dots !== false) se.d.forEach((v, i) => { if (v != null) s += `<circle cx="${X(i)}" cy="${Y(v)}" r="${se.r || 2.8}" style="fill:${col(se.c)}"/>`; });
  }
  return s + `</svg>`;
}

// skills: from skillInfo(); draws one column per branch, five tiers each, lit by tier.
export function tree(skills) {
  const W = 340, top = 40, gap = 72, n = skills.length, cw = (W - 20) / n;
  let s = `<svg class="viz" viewBox="0 0 ${W} ${top + gap * 5 + 26}" role="img" aria-label="Skill tree">`;
  const rx = W / 2;
  s += `<circle cx="${rx}" cy="14" r="8" style="fill:var(--fg)"/>`;
  skills.forEach((sk, k) => {
    const x = f(10 + cw * k + cw / 2), c = col(sk.c);
    const ys = sk.tiers.map((_, i) => top + 34 + i * gap);
    s += `<line x1="${rx}" y1="14" x2="${x}" y2="${ys[0]}" style="stroke:${c};stroke-width:1.5;opacity:${sk.tier ? .9 : .35}"/>`;
    sk.tiers.forEach((t, i) => {
      const y = ys[i], lit = i < sk.tier, cur = i === sk.tier;
      if (i) s += `<line x1="${x}" y1="${ys[i - 1] + 12}" x2="${x}" y2="${y - 12}" style="stroke:${lit ? c : "var(--dim)"};stroke-width:${lit ? 2 : 1.2};${lit ? "" : "stroke-dasharray:3 4"}"/>`;
      s += `<circle cx="${x}" cy="${y}" r="12" style="fill:${lit ? c : "var(--bg)"};stroke:${c};stroke-width:2;opacity:${lit || cur ? 1 : .45}"/>`;
      if (cur && sk.toNext > 0) {
        const a = -Math.PI / 2 + 2 * Math.PI * Math.min(.999, sk.toNext), ex = f(x + 12 * Math.cos(a)), ey = f(y + 12 * Math.sin(a));
        s += `<path d="M${x} ${y} L${x} ${y - 12} A12 12 0 ${sk.toNext > .5 ? 1 : 0} 1 ${ex} ${ey} Z" style="fill:${c}"/>`;
      }
      // Alternate label above/below between neighbouring columns so long names never collide.
      const ly = k % 2 ? y - 18 : y + 25;
      s += `<text x="${x}" y="${ly}" text-anchor="middle" class="${lit ? "on" : ""}" style="font-size:9px">${esc(t.length > 14 ? t.slice(0, 13) + "…" : t)}</text>`;
    });
    s += `<text x="${x}" y="${top - 6}" text-anchor="middle" class="h" style="fill:${c}">${esc(sk.short)}</text>`;
  });
  return s + `</svg>`;
}

// domains: 4 x {name, c, level 0..1}; points: [{x,y,label,lit}]
export function venn(domains, points) {
  const pos = [[130, 112], [210, 112], [130, 188], [210, 188]], lab = [[-48, -92], [48, -92], [-48, 104], [48, 104]];
  let s = `<svg class="viz" viewBox="0 0 340 304" role="img" aria-label="Skill overlap map">`;
  domains.forEach((d, i) => {
    const [x, y] = pos[i];
    s += `<circle cx="${x}" cy="${y}" r="80" style="fill:${col(d.c)};fill-opacity:${f(.06 + .22 * d.level)};stroke:${col(d.c)};stroke-width:1.5"/>`;
    s += `<text x="${x + lab[i][0]}" y="${y + lab[i][1]}" text-anchor="middle" class="h" style="fill:${col(d.c)}">${esc(d.name.toUpperCase())}</text>`;
  });
  for (const p of points) s += `<circle cx="${p.x}" cy="${p.y}" r="${p.big ? 6 : 4}" style="fill:${p.lit ? "var(--fg)" : "var(--dim)"}"/><text x="${p.x}" y="${p.y + (p.dy || -9)}" text-anchor="middle" class="${p.lit ? "on" : ""}">${esc(p.label)}</text>`;
  return s + `</svg>`;
}
