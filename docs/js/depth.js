/**
 * Shared UI helpers: depth-adjusted premiums (depth.json), premium history (history.json)
 * sparklines + chart dialog, and mobile card labels.
 * Values are rendered only if present in the JSON; otherwise UNKNOWN / NO ROUTE with the reason.
 */
import { fetchSnapshot } from './data-source.js';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (v) => (isNum(v) ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}%` : 'UNKNOWN');
const utc = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'UNKNOWN');

async function loadJson(name) {
  try {
    const { data } = await fetchSnapshot(name);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: String(e.message || e) };
  }
}

let cache = null;
export function loadDepthAndHistory() {
  if (!cache) cache = Promise.all([loadJson('depth.json'), loadJson('history.json')]).then(([d, h]) => ({ depth: d, history: h }));
  return cache;
}
export function reloadDepthAndHistory() {
  cache = null;
  return loadDepthAndHistory();
}

export function findDepth(depth, group, symbol) {
  return depth?.data?.tokens?.find((t) => t.group === group && t.symbol === symbol) || null;
}

function legHtml(l) {
  if (!l) return '<span class="unknown">UNKNOWN</span>';
  if (l.status === 'NO ROUTE') return `<span class="unknown">NO ROUTE</span>`;
  if (l.status !== 'OK') return `<span class="unknown" title="${esc(l.error || '')}">UNKNOWN</span>`;
  const cls = l.premium_vs_ref >= 0.1 ? 'rich' : l.premium_vs_ref <= -0.1 ? 'cheap' : '';
  return `<span class="${cls}">${pct(l.premium_vs_ref)}</span><span class="sub"> · $${l.effective_price.toFixed(2)} · impact ${pct(l.price_impact_vs_jupiter_price)}</span>`;
}

/** Cell for "at $1k / at $10k" buy & sell premiums vs reference. */
export function depthCell(entry, depth) {
  if (!entry) return `<span class="unknown">UNKNOWN</span><br><span class="sub err">${esc(depth?.error || 'token not in depth snapshot')}</span>`;
  const L = entry.legs || {};
  const errs = Object.values(L).filter((l) => l.status !== 'OK' && l.error).map((l) => `${l.side} $${l.usd / 1000}k: ${l.error}`);
  return `<div class="depth">
    <div><b>at $1k</b> buy ${legHtml(L.buy_1000)}</div>
    <div><b>at $1k</b> sell ${legHtml(L.sell_1000)}</div>
    <div><b>at $10k</b> buy ${legHtml(L.buy_10000)}</div>
    <div><b>at $10k</b> sell ${legHtml(L.sell_10000)}</div>
    ${errs.length ? `<span class="sub err">${esc(errs.join('; '))}</span><br>` : ''}
    <span class="sub">Jupiter quotes fetched ${esc(utc(L.buy_1000?.fetched_at || depth?.data?.fetched_at))}</span>
  </div>`;
}

/** Series for one symbol; only real points (null values are gaps, not interpolated). */
export function seriesFor(history, group, symbol) {
  const pts = (history?.data?.points || [])
    .map((p) => ({ t: new Date(p.t).getTime(), ...(p[group]?.[symbol] || {}) }))
    .filter((p) => isNum(p.p) || isNum(p.b10k) || isNum(p.s10k));
  return pts;
}

function pathFor(pts, key, x, y) {
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (!isNum(p[key])) {
      pen = false; // gap: do not connect across missing values
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[key]).toFixed(1)}`;
    pen = true;
  }
  return d;
}

function svgChart(pts, w, h, { axes = false } = {}) {
  const vals = pts.flatMap((p) => [p.p, p.b10k, p.s10k]).filter(isNum);
  if (!vals.length) return '';
  let lo = Math.min(...vals, 0);
  let hi = Math.max(...vals, 0);
  if (hi - lo < 1e-4) {
    hi += 0.001;
    lo -= 0.001;
  }
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const pad = axes ? 36 : 2;
  const x = (t) => (t1 === t0 ? w / 2 : pad + ((t - t0) / (t1 - t0)) * (w - pad - 4));
  const y = (v) => 4 + (1 - (v - lo) / (hi - lo)) * (h - 8 - (axes ? 14 : 0));
  const dots = (key, cls) =>
    pts.filter((p) => isNum(p[key])).map((p) => `<circle class="${cls}" cx="${x(p.t).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="${axes ? 2.5 : 1.5}"/>`).join('');
  const zero = `<line class="zero" x1="${pad}" x2="${w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
  const lab = axes
    ? `<text x="0" y="${y(hi) + 4}" class="axis">${pct(hi)}</text><text x="0" y="${y(lo)}" class="axis">${pct(lo)}</text>
       <text x="${pad}" y="${h - 1}" class="axis">${esc(utc(new Date(t0).toISOString()))}</text>
       <text x="${w - 4}" y="${h - 1}" class="axis" text-anchor="end">${esc(utc(new Date(t1).toISOString()))}</text>`
    : '';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${zero}
    <path class="l-p" d="${pathFor(pts, 'p', x, y)}"/><path class="l-b" d="${pathFor(pts, 'b10k', x, y)}"/><path class="l-s" d="${pathFor(pts, 's10k', x, y)}"/>
    ${dots('p', 'd-p')}${axes ? dots('b10k', 'd-b') + dots('s10k', 'd-s') : ''}${lab}</svg>`;
}

/** Sparkline button (tap opens the larger chart). */
export function sparkCell(history, group, symbol) {
  if (!history?.data) return `<span class="unknown">UNKNOWN</span><br><span class="sub err">${esc(history?.error || 'no history')}</span>`;
  const pts = seriesFor(history, group, symbol);
  if (!pts.length) return '<span class="sub">no history points yet</span>';
  return `<button type="button" class="spark" data-group="${esc(group)}" data-symbol="${esc(symbol)}" aria-label="Premium history chart for ${esc(symbol)}">
    ${svgChart(pts, 110, 32)}<span class="sub">${pts.length} pt${pts.length === 1 ? '' : 's'}</span></button>`;
}

let dialog;
export function wireCharts(root, getHistory) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'chart-dialog';
    document.body.appendChild(dialog);
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('.close')) dialog.close();
    });
  }
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button.spark');
    if (!b) return;
    const history = await getHistory();
    const pts = seriesFor(history, b.dataset.group, b.dataset.symbol);
    const first = pts[0]?.t;
    const last = pts[pts.length - 1]?.t;
    const w = Math.min(640, window.innerWidth - 48);
    dialog.innerHTML = `<div class="dlg"><button type="button" class="close" aria-label="Close">×</button>
      <h3>${esc(b.dataset.symbol)} — premium history</h3>
      <p class="sub">${pts.length} real point(s), ${first ? esc(utc(new Date(first).toISOString())) : '—'} → ${last ? esc(utc(new Date(last).toISOString())) : '—'}. One point per snapshot run; gaps are not interpolated.</p>
      ${svgChart(pts, w, 220, { axes: true })}
      <p class="legend"><span class="k-p">■ headline premium</span> <span class="k-b">■ buy at $10k</span> <span class="k-s">■ sell at $10k</span></p>
      <p class="sub">Reference: ${b.dataset.group === 'prestocks' ? 'PreStocks mark price (as published by the PreStocks API)' : 'Pyth Equity.US price'}. Indicative quotes, not executable, not arbitrage.</p></div>`;
    dialog.showModal();
  });
}

export function historySummary(history) {
  const pts = history?.data?.points || [];
  if (!pts.length) return `History: ${history?.error ? `UNKNOWN (${history.error})` : '0 points'}`;
  return `History: ${pts.length} point(s), ${utc(pts[0].t)} → ${utc(pts[pts.length - 1].t)} (capped at ${history.data.cap_days || 14} days, real snapshots only).`;
}

/** Copy header labels into data-label on each cell (used by the mobile card layout). */
export function labelCells(table) {
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.childNodes[0]?.textContent?.trim() || th.textContent.trim());
  for (const tr of table.querySelectorAll('tbody tr')) {
    [...tr.children].forEach((td, i) => {
      if (!heads[i] || td.colSpan !== 1) return;
      td.dataset.label = heads[i];
      // wrap content so the mobile grid has exactly two items: label (::before) + value block
      if (!(td.childNodes.length === 1 && td.firstElementChild?.classList.contains('cell'))) {
        const wrap = document.createElement('div');
        wrap.className = 'cell';
        while (td.firstChild) wrap.appendChild(td.firstChild);
        td.appendChild(wrap);
      }
    });
  }
}
