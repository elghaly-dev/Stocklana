/**
 * PreStocks tab — reads docs/data/prestocks.json (written by scripts/fetch-prestocks.mjs
 * via GitHub Actions). Nothing here invents a value: missing data renders UNKNOWN + reason.
 */
const tbody = document.getElementById('ps-rows');
const statusEl = document.getElementById('ps-status');
const metaEl = document.getElementById('ps-meta');
const summaryEl = document.getElementById('ps-summary');
const btn = document.getElementById('ps-refresh');
const depthMetaEl = document.getElementById('ps-depth-meta');
import { fetchSnapshot } from './data-source.js';
import { loadDepthAndHistory, reloadDepthAndHistory, findDepth, depthCell, sparkCell, wireCharts, historySummary, labelCells } from './depth.js';
wireCharts(tbody, async () => (await loadDepthAndHistory()).history);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// external_url comes verbatim from the PreStocks API; esc() only escapes HTML entities, not
// URL schemes, so validate http(s) before ever putting it in an href (blocks javascript: etc.).
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? esc(u) : null);
const unknown = (reason) => `<span class="unknown">UNKNOWN</span>${reason ? `<br><span class="sub err">${esc(reason)}</span>` : ''}`;
const usd = (v) => (isNum(v) ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null);
const bn = (v) => (isNum(v) ? `$${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}B` : null);
const pct = (v, d = 2) => (isNum(v) ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%` : null);
const time = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'UNKNOWN');

function age(iso) {
  if (!iso) return 'UNKNOWN';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function checkCell(c, fmt) {
  if (!c) return unknown('check missing from snapshot');
  const at = `<br><span class="sub">fetched ${esc(time(c.fetched_at))}</span>`;
  if (c.status === 'MATCH') return `<span class="match">MATCH</span><br><span class="sub">${fmt(c)}</span>${at}`;
  if (c.status === 'DIFF') return `<span class="diff">DIFF</span><br><span class="sub">${fmt(c)}</span>${at}`;
  return unknown(c.error || c.status) + at;
}

function render(data, dh) {
  const tokens = data.tokens || [];
  tbody.innerHTML = '';
  if (!tokens.length) {
    tbody.innerHTML = `<tr><td colspan="10">${unknown(data.last_attempt?.error || 'snapshot has no tokens')}</td></tr>`;
  }
  const counts = { jup: {}, sup: {}, mint: {} };
  const inc = (o, k) => (o[k] = (o[k] || 0) + 1);

  for (const t of tokens) {
    const p = t.prestocks || {};
    const at = `<br><span class="sub">fetched ${esc(time(p.fetched_at))}</span>`;
    const premCls = t.premium_flag === 'RICH vs mark' ? 'rich' : t.premium_flag === 'CHEAP vs mark' ? 'cheap' : '';
    const prem = isNum(t.premium)
      ? `<span class="${premCls}">${pct(t.premium)}</span>${t.premium_flag && t.premium_flag !== 'UNKNOWN' ? `<br><span class="${premCls}">${esc(t.premium_flag)}</span>` : ''}`
      : unknown('tokenPrice or markPrice missing');
    const val =
      isNum(p.impliedValuation) && isNum(p.markValuation)
        ? `${bn(p.impliedValuation)} vs ${bn(p.markValuation)}`
        : unknown('valuation missing');
    const jup = t.checks?.jupiter_price;
    const sup = t.checks?.supply;
    const mint = t.checks?.mint_exists;
    inc(counts.jup, jup?.status || 'UNKNOWN');
    inc(counts.sup, sup?.status || 'UNKNOWN');
    inc(counts.mint, mint?.status || 'UNKNOWN');

    const href = safeUrl(t.external_url);
    const nameLink = href ? `<a class="sub" href="${href}" rel="noopener">${esc(t.name ?? '')}</a>` : `<span class="sub">${esc(t.name ?? '')}</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(t.symbol ?? 'UNKNOWN')}</strong><br>
        ${nameLink}<br>
        <span class="mono">${esc(t.mint ?? 'UNKNOWN')}</span></td>
      <td class="num">${usd(p.tokenPrice) ?? unknown('tokenPrice missing')}${at}</td>
      <td class="num">${usd(p.markPrice) ?? unknown('markPrice missing')}${at}</td>
      <td class="num">${prem}${at}</td>
      <td class="num">${depthCell(findDepth(dh.depth, 'prestocks', t.symbol), dh.depth)}</td>
      <td>${sparkCell(dh.history, 'prestocks', t.symbol)}</td>
      <td class="num">${val}${at}</td>
      <td class="num">${checkCell(jup, (c) => `PreStocks ${usd(c.prestocks)} · Jupiter ${usd(c.jupiter)} (${pct(c.diff)})`)}</td>
      <td class="num">${checkCell(sup, (c) => `PreStocks ${c.prestocks?.toLocaleString('en-US')} · on-chain ${c.onchain?.toLocaleString('en-US')}`)}</td>
      <td>${
        mint?.status === 'EXISTS'
          ? `<span class="match">EXISTS</span><br><span class="sub">fetched ${esc(time(mint.fetched_at))}</span>`
          : unknown(mint?.error || mint?.status || 'check missing')
      }</td>`;
    tbody.appendChild(tr);
  }

  const fmtCounts = (o) => Object.entries(o).map(([k, v]) => `${v} ${k}`).join(', ') || 'UNKNOWN';
  metaEl.innerHTML =
    `Snapshot fetched ${esc(time(data.fetched_at))} — <strong>data age ${esc(age(data.fetched_at))}</strong>` +
    (data.last_attempt && !data.last_attempt.ok
      ? ` · <span class="err">last refresh attempt ${esc(time(data.last_attempt.at))} failed: ${esc(data.last_attempt.error)} (showing previous snapshot)</span>`
      : '');
  labelCells(tbody.closest('table'));
  depthMetaEl.textContent = `Depth quotes snapshot fetched ${time(dh.depth?.data?.fetched_at)} (age ${age(dh.depth?.data?.fetched_at)})${dh.depth?.error ? ` — UNKNOWN: ${dh.depth.error}` : ''} · ${historySummary(dh.history)}`;
  summaryEl.textContent = `On-chain checks — Jupiter price: ${fmtCounts(counts.jup)} · Supply: ${fmtCounts(counts.sup)} · Mint account: ${fmtCounts(counts.mint)}.`;
}

async function load() {
  statusEl.textContent = 'Loading snapshot…';
  btn.disabled = true;
  try {
    const { data, fallback } = await fetchSnapshot('prestocks.json');
    render(data, await reloadDepthAndHistory());
    statusEl.textContent = fallback ? 'The data branch could not be read, so this is the copy bundled with the site. Check the ages below.' : '';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="10">${unknown(`could not load prestocks.json: ${e.message || e}`)}</td></tr>`;
    metaEl.textContent = '';
    statusEl.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

btn.addEventListener('click', load);
load();
