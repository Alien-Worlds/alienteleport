'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowList(items, cols) {
  if (!items || !items.length) return '<p class="muted empty">None in scan window</p>';
  const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const body = items
    .map((item) => {
      const tds = cols
        .map((c) => {
          let v = typeof c.get === 'function' ? c.get(item) : item[c.key];
          if (Array.isArray(v)) v = v.join(', ');
          return `<td>${esc(v)}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function healthChip(h) {
  const map = {
    synced: 'ok',
    catching_up: 'warn',
    lagging: 'crit',
    online: 'info',
    stopped: 'crit',
    not_found: 'crit',
    unknown: 'info',
  };
  const cls = map[h] || 'info';
  return `<span class="chip ${cls}">${esc(h)}</span>`;
}

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US');
}

function renderHtml(status) {
  const severity = status.severity || 'info';
  const badgeClass =
    severity === 'ok' ? 'ok' : severity === 'warning' ? 'warn' : severity === 'critical' ? 'crit' : 'info';

  const s = status.summary || {};
  const wax = status.antelope_chain || 'WAX';
  const reasons = (status.reasons || []).filter((r) => r.window !== 'historical');
  const histReasons = (status.reasons || []).filter((r) => r.window === 'historical');
  const actions = status.actions || [];
  const cr = status.chain_readers;
  const logo =
    'https://alienworlds-media-bucket.s3.eu-central-1.amazonaws.com/alienworlds_logo_81750a6c20.webp';
  const histDays = Math.round(
    ((status.thresholds && status.thresholds.historical_age_sec) || 365 * 86400) / 86400
  );

  const unpack = (pack) => {
    if (!pack) return { recent: [], historical: [], recent_count: 0, historical_count: 0 };
    if (Array.isArray(pack)) {
      return { recent: pack, historical: [], recent_count: pack.length, historical_count: 0 };
    }
    return {
      recent: pack.recent || [],
      historical: pack.historical || [],
      recent_count: pack.recent_count != null ? pack.recent_count : (pack.recent || []).length,
      historical_count:
        pack.historical_count != null ? pack.historical_count : (pack.historical || []).length,
    };
  };

  const missT = unpack(
    status.missing_for_this_oracle &&
      (status.missing_for_this_oracle.wax_to_evm || status.missing_for_this_oracle.antelope_to_evm)
  );
  const missR = unpack(
    status.missing_for_this_oracle &&
      (status.missing_for_this_oracle.evm_to_wax || status.missing_for_this_oracle.evm_to_antelope)
  );
  const sysT = unpack(
    status.system_incomplete &&
      (status.system_incomplete.wax_to_evm || status.system_incomplete.antelope_to_evm)
  );
  const sysR = unpack(
    status.system_incomplete &&
      (status.system_incomplete.evm_to_wax || status.system_incomplete.evm_to_antelope)
  );

  const histTotal =
    s.historical_incomplete != null
      ? s.historical_incomplete
      : missT.historical_count +
        missR.historical_count +
        sysT.historical_count +
        sysR.historical_count;

  const actionCards = actions.length
    ? `<div class="action-grid">${actions
        .map(
          (a) => `<div class="action-card">
        <div class="action-title">${esc(a.title)}</div>
        <div class="action-detail">${esc(a.detail)}</div>
        ${a.target ? `<div class="action-target">target · ${esc(a.target)}</div>` : ''}
      </div>`
        )
        .join('')}</div>`
    : '';

  const reasonList = reasons.length
    ? `<ul class="reasons">${reasons
        .map((r) => `<li><span class="reason-code">${esc(r.code)}</span> ${esc(r.message)}</li>`)
        .join('')}</ul>`
    : '';

  const readersRows =
    cr && cr.readers
      ? cr.readers
          .map((r) => {
            const label =
              r.role === 'wax_reader'
                ? `${wax} reader → ${r.pair_network}`
                : `EVM reader · ${r.network || r.name}`;
            return `<tr>
          <td><strong>${esc(r.name)}</strong><div class="sub">${esc(label)}</div></td>
          <td>${healthChip(r.health)}</td>
          <td>${esc(r.process && r.process.status ? r.process.status : '—')}</td>
          <td class="num">${esc(fmtNum(r.cursor_block))}</td>
          <td class="num">${esc(fmtNum(r.chain_head))}</td>
          <td class="num">${esc(r.lag_blocks != null ? fmtNum(r.lag_blocks) : '—')}</td>
        </tr>`;
          })
          .join('')
      : '';

  const waxHead = cr && cr.wax ? cr.wax.head_block : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="refresh" content="60"/>
  <title>TLM Teleport Oracle · Alien Worlds</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Exo+2:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --bg0: #050816; --bg1: #0b1230;
      --panel: rgba(12, 22, 48, 0.82);
      --panel-border: rgba(0, 229, 255, 0.18);
      --text: #e8f4ff; --muted: #8aa0c0;
      --cyan: #00e5ff; --gold: #f5c542; --violet: #7c5cff;
      --ok: #2ee59d; --warn: #f5c542; --crit: #ff5c7a; --info: #5b8cff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; color: var(--text);
      font-family: "Exo 2", system-ui, sans-serif;
      background:
        radial-gradient(1200px 600px at 10% -10%, rgba(124, 92, 255, 0.35), transparent 55%),
        radial-gradient(900px 500px at 90% 0%, rgba(0, 229, 255, 0.18), transparent 50%),
        radial-gradient(800px 400px at 50% 100%, rgba(245, 197, 66, 0.08), transparent 45%),
        linear-gradient(165deg, var(--bg0), var(--bg1) 50%, #07101f);
      line-height: 1.45;
    }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
    header.hero {
      display: flex; flex-wrap: wrap; align-items: center; gap: 1.25rem;
      padding: 1.25rem 1.4rem; border-radius: 16px;
      background: var(--panel); border: 1px solid var(--panel-border);
      backdrop-filter: blur(10px); box-shadow: 0 0 40px rgba(0, 229, 255, 0.06);
    }
    .logo { height: 48px; width: auto; filter: drop-shadow(0 0 12px rgba(0,229,255,.35)); }
    .titles h1 { font-family: Orbitron, sans-serif; font-size: 1.35rem; margin: 0 0 .25rem; letter-spacing: .04em; color: #fff; }
    .titles .sub { color: var(--muted); font-size: .92rem; margin: 0; }
    .titles a { color: var(--cyan); text-decoration: none; }
    .titles a:hover { text-decoration: underline; }
    .badge-row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-left: auto; }
    .badge {
      display: inline-flex; align-items: center; gap: .4rem;
      padding: .4rem .9rem; border-radius: 999px;
      font-family: Orbitron, sans-serif; font-size: .7rem; font-weight: 700;
      letter-spacing: .06em; text-transform: uppercase; border: 1px solid transparent;
    }
    .badge.ok { background: rgba(46,229,157,.15); color: var(--ok); border-color: rgba(46,229,157,.4); }
    .badge.warn { background: rgba(245,197,66,.15); color: var(--warn); border-color: rgba(245,197,66,.45); }
    .badge.crit { background: rgba(255,92,122,.15); color: var(--crit); border-color: rgba(255,92,122,.45); }
    .badge.info { background: rgba(91,140,255,.15); color: var(--info); border-color: rgba(91,140,255,.4); }
    .chip {
      display: inline-block; padding: .15rem .5rem; border-radius: 999px; font-size: .68rem;
      font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    }
    .chip.ok { background: rgba(46,229,157,.15); color: var(--ok); }
    .chip.warn { background: rgba(245,197,66,.15); color: var(--warn); }
    .chip.crit { background: rgba(255,92,122,.15); color: var(--crit); }
    .chip.info { background: rgba(91,140,255,.15); color: var(--info); }

    .action-panel {
      margin-top: 1.25rem; border-radius: 16px; overflow: hidden;
      border: 1px solid rgba(255,92,122,.35);
      background:
        linear-gradient(135deg, rgba(255,92,122,.12), rgba(124,92,255,.1) 40%, rgba(12,22,48,.9));
      box-shadow: 0 0 32px rgba(255,92,122,.08);
    }
    .action-panel.ok {
      border-color: rgba(46,229,157,.35);
      background: linear-gradient(135deg, rgba(46,229,157,.1), rgba(12,22,48,.9));
      box-shadow: 0 0 32px rgba(46,229,157,.06);
    }
    .action-panel.warn {
      border-color: rgba(245,197,66,.35);
      background: linear-gradient(135deg, rgba(245,197,66,.12), rgba(12,22,48,.9));
    }
    .action-panel.info {
      border-color: rgba(91,140,255,.35);
      background: linear-gradient(135deg, rgba(91,140,255,.12), rgba(12,22,48,.9));
    }
    .action-head { padding: 1.15rem 1.35rem 0.85rem; }
    .action-head .eyebrow {
      font-family: Orbitron, sans-serif; font-size: .65rem; letter-spacing: .12em;
      text-transform: uppercase; color: var(--gold); margin: 0 0 .35rem;
    }
    .action-head h2 {
      font-family: Orbitron, sans-serif; font-size: 1.15rem; margin: 0 0 .45rem;
      color: #fff; letter-spacing: .03em;
    }
    .action-head .detail { margin: 0; color: var(--muted); font-size: .95rem; max-width: 52rem; }
    .action-body { padding: 0 1.35rem 1.25rem; }
    .action-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: .75rem; margin-top: .9rem; }
    .action-card {
      background: rgba(5,8,22,.55); border: 1px solid rgba(0,229,255,.18);
      border-radius: 12px; padding: .85rem 1rem;
    }
    .action-title { font-weight: 700; color: var(--cyan); margin-bottom: .3rem; font-size: .95rem; }
    .action-detail { color: var(--muted); font-size: .85rem; }
    .action-target {
      margin-top: .5rem; font-family: ui-monospace, monospace; font-size: .72rem;
      color: var(--gold); opacity: .9;
    }
    .reasons { margin: .85rem 0 0; padding-left: 1.1rem; color: var(--muted); font-size: .88rem; }
    .reason-code {
      display: inline-block; font-family: ui-monospace, monospace; font-size: .72rem;
      color: var(--gold); background: rgba(245,197,66,.1); padding: .05rem .35rem; border-radius: 4px;
      margin-right: .25rem;
    }

    .meta {
      display: flex; flex-wrap: wrap; gap: .35rem .85rem; margin: 1rem 0 0;
      color: var(--muted); font-size: .85rem;
    }
    .meta code {
      font-family: ui-monospace, monospace; font-size: .8em;
      background: rgba(0,229,255,.08); color: var(--cyan);
      padding: .1rem .35rem; border-radius: 4px; border: 1px solid rgba(0,229,255,.15);
    }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .75rem; margin: 1.25rem 0; }
    .card {
      background: var(--panel); border: 1px solid var(--panel-border); border-radius: 12px;
      padding: .9rem 1rem; position: relative; overflow: hidden;
    }
    .card::before {
      content: ""; position: absolute; inset: 0 auto 0 0; width: 3px;
      background: linear-gradient(var(--cyan), var(--violet));
    }
    .card.alert::before { background: linear-gradient(var(--crit), var(--gold)); }
    .card .n { font-family: Orbitron, sans-serif; font-size: 1.55rem; font-weight: 700; color: #fff; }
    .card.alert .n { color: var(--crit); }
    .card .l { font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-top: .2rem; }
    section {
      margin-top: 1.25rem; padding: 1rem 1.15rem 1.15rem; border-radius: 14px;
      background: var(--panel); border: 1px solid var(--panel-border);
    }
    section h3 {
      font-family: Orbitron, sans-serif; font-size: .78rem; margin: 0 0 .75rem;
      color: var(--gold); letter-spacing: .06em; text-transform: uppercase;
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    th, td { text-align: left; padding: .45rem .5rem; border-bottom: 1px solid rgba(255,255,255,.06); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
    td.num { font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; font-size: .8rem; }
    tr:hover td { background: rgba(0,229,255,.04); }
    .sub { color: var(--muted); font-size: .72rem; margin-top: .15rem; }
    .muted { color: var(--muted); }
    .empty { font-style: italic; margin: 0; }
    details.historical {
      margin-top: 1.25rem; border-radius: 14px; border: 1px solid rgba(255,255,255,.1);
      background: rgba(8, 12, 28, 0.65); overflow: hidden;
    }
    details.historical > summary {
      cursor: pointer; list-style: none; padding: 1rem 1.15rem;
      font-family: Orbitron, sans-serif; font-size: .75rem; letter-spacing: .06em;
      text-transform: uppercase; color: var(--muted); user-select: none;
      display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem;
    }
    details.historical > summary::-webkit-details-marker { display: none; }
    details.historical > summary::before {
      content: "▸"; color: var(--gold); font-size: .9rem;
    }
    details.historical[open] > summary::before { content: "▾"; }
    details.historical > summary .count {
      font-family: "Exo 2", sans-serif; font-weight: 600; color: var(--gold);
      background: rgba(245,197,66,.1); border: 1px solid rgba(245,197,66,.25);
      padding: .15rem .55rem; border-radius: 999px; font-size: .75rem; letter-spacing: 0;
      text-transform: none;
    }
    details.historical .hist-body { padding: 0 1.15rem 1.15rem; }
    details.historical .hist-note {
      color: var(--muted); font-size: .85rem; margin: 0 0 1rem; font-family: "Exo 2", sans-serif;
      text-transform: none; letter-spacing: 0; font-weight: 400;
    }
    details.historical h4 {
      font-family: Orbitron, sans-serif; font-size: .68rem; color: var(--muted);
      letter-spacing: .06em; text-transform: uppercase; margin: 1rem 0 .5rem;
    }
    footer {
      margin-top: 1.75rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,.08);
      color: var(--muted); font-size: .78rem; display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center;
    }
    footer a { color: var(--cyan); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    .pulse { width: .55rem; height: .55rem; border-radius: 50%; background: currentColor;
      box-shadow: 0 0 8px currentColor; animation: pulse 1.6s ease infinite; }
    @keyframes pulse { 50% { opacity: .45; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <img class="logo" src="${esc(logo)}" alt="Alien Worlds" width="180" height="48"/>
      <div class="titles">
        <h1>TLM Teleport Oracle</h1>
        <p class="sub">
          ${esc(wax)} ↔ EVM bridge health ·
          <a href="https://teleport.alienworlds.io/" target="_blank" rel="noopener">Teleport</a>
          ·
          <a href="https://alienworlds.io/" target="_blank" rel="noopener">alienworlds.io</a>
        </p>
      </div>
      <div class="badge-row">
        <span class="badge ${badgeClass}"><span class="pulse"></span> ${esc(status.status_label || status.status)}</span>
      </div>
    </header>

    <div class="action-panel ${badgeClass}">
      <div class="action-head">
        <p class="eyebrow">Status · ${esc(wax)} bridge</p>
        <h2>${esc(status.status_label || status.status)}</h2>
        <p class="detail">${esc(status.status_detail || '')}</p>
      </div>
      <div class="action-body">
        ${actionCards}
        ${reasonList}
        <div class="meta">
          <span>antelope <code>${esc(wax)}</code></span>
          <span>oracle <code>${esc(status.oracle_account)}</code></span>
          <span>contract <code>${esc(status.teleport_contract)}</code></span>
          <span>${esc(wax)} head <code>${esc(waxHead != null ? fmtNum(waxHead) : '—')}</code></span>
          <span>code <code>${esc(status.status)}</code></span>
        </div>
      </div>
    </div>

    <div class="cards">
      <div class="card ${(s.missing_signatures || 0) > 0 ? 'alert' : ''}">
        <div class="n">${esc(s.missing_signatures ?? '—')}</div>
        <div class="l">Recent missing ${esc(wax)}→EVM sigs</div>
      </div>
      <div class="card ${(s.missing_approvals || 0) > 0 ? 'alert' : ''}">
        <div class="n">${esc(s.missing_approvals ?? '—')}</div>
        <div class="l">Recent missing EVM→${esc(wax)}</div>
      </div>
      <div class="card ${(s.stuck_after_our_participation || 0) > 0 ? 'alert' : ''}">
        <div class="n">${esc(s.stuck_after_our_participation ?? '—')}</div>
        <div class="l">Recent stuck (we signed)</div>
      </div>
      <div class="card">
        <div class="n">${esc(s.historical_incomplete ?? histTotal ?? '—')}</div>
        <div class="l">Historical (&gt;${esc(histDays)}d)</div>
      </div>
      <div class="card">
        <div class="n">${esc(s.awaiting_user_claim ?? '—')}</div>
        <div class="l">Awaiting user claim</div>
      </div>
    </div>

    <section>
      <h3>Chain readers · live cursors</h3>
      ${
        readersRows
          ? `<div class="table-wrap"><table>
        <thead><tr>
          <th>Process</th><th>Health</th><th>PM2</th><th>Cursor</th><th>Chain head</th><th>Lag</th>
        </tr></thead>
        <tbody>${readersRows}</tbody>
      </table></div>`
          : '<p class="muted empty">Reader snapshot unavailable</p>'
      }
      <p class="meta" style="margin-top:.75rem">
        last scan <code>${esc(status.last_scan_at || '—')}</code>
        ${status.last_scan_duration_ms != null ? `(${esc(status.last_scan_duration_ms)} ms)` : ''}
        · uptime <code>${esc(status.uptime_sec)}s</code>
        ${status.scanning ? '· <strong style="color:var(--cyan)">scanning now…</strong>' : ''}
      </p>
    </section>

    <section>
      <h3>Recent · missing ${esc(wax)} → EVM signatures</h3>
      ${rowList(missT.recent, [
        { key: 'id', label: 'ID' },
        { key: 'chain_name', label: 'EVM' },
        { key: 'quantity', label: 'Qty' },
        { key: 'account', label: 'From' },
        { get: (i) => `${i.signatures}/${i.threshold}`, label: 'Sigs' },
        { key: 'oracles', label: 'Oracles' },
        { key: 'age', label: 'Age' },
      ])}
    </section>

    <section>
      <h3>Recent · missing EVM → ${esc(wax)} approvals</h3>
      ${rowList(missR.recent, [
        { key: 'id', label: 'ID' },
        { key: 'chain_name', label: 'EVM' },
        { key: 'quantity', label: 'Qty' },
        { key: 'to', label: 'To' },
        { get: (i) => `${i.confirmations}/${i.threshold}`, label: 'Conf' },
        { key: 'approvers', label: 'Approvers' },
        { key: 'age', label: 'Age' },
      ])}
    </section>

    <section>
      <h3>Recent · system incomplete ${esc(wax)}→EVM teleports</h3>
      ${rowList(sysT.recent, [
        { key: 'id', label: 'Teleport' },
        { key: 'chain_name', label: 'EVM' },
        { key: 'quantity', label: 'Qty' },
        { get: (i) => `${i.signatures}/${i.threshold}`, label: 'Sigs' },
        { get: (i) => (i.this_oracle_signed ? 'yes' : 'no'), label: 'We signed' },
        { key: 'age', label: 'Age' },
      ])}
    </section>

    <section>
      <h3>Recent · system incomplete EVM→${esc(wax)} receipts</h3>
      ${rowList(sysR.recent, [
        { key: 'id', label: 'Receipt' },
        { key: 'chain_name', label: 'EVM' },
        { key: 'quantity', label: 'Qty' },
        { get: (i) => `${i.confirmations}/${i.threshold}`, label: 'Conf' },
        { get: (i) => (i.this_oracle_approved ? 'yes' : 'no'), label: 'We approved' },
        { key: 'age', label: 'Age' },
      ])}
    </section>

    ${
      histTotal > 0
        ? `<details class="historical">
      <summary>
        Historical incomplete
        <span class="count">${esc(histTotal)} row(s) · &gt; ${esc(histDays)} days</span>
      </summary>
      <div class="hist-body">
        <p class="hist-note">
          These on-chain rows are older than ${esc(histDays)} days and do <strong>not</strong> raise the
          primary status alarm. Expand only if you need to audit legacy stuck teleports/receipts.
        </p>
        ${
          histReasons.length
            ? `<ul class="reasons">${histReasons
                .map(
                  (r) =>
                    `<li><span class="reason-code">${esc(r.code)}</span> ${esc(r.message)}</li>`
                )
                .join('')}</ul>`
            : ''
        }
        <h4>Historical · missing ${esc(wax)}→EVM signatures (${esc(missT.historical_count)})</h4>
        ${rowList(missT.historical, [
          { key: 'id', label: 'ID' },
          { key: 'chain_name', label: 'EVM' },
          { key: 'quantity', label: 'Qty' },
          { key: 'account', label: 'From' },
          { get: (i) => `${i.signatures}/${i.threshold}`, label: 'Sigs' },
          { key: 'age', label: 'Age' },
        ])}
        <h4>Historical · missing EVM→${esc(wax)} approvals (${esc(missR.historical_count)})</h4>
        ${rowList(missR.historical, [
          { key: 'id', label: 'ID' },
          { key: 'chain_name', label: 'EVM' },
          { key: 'quantity', label: 'Qty' },
          { key: 'to', label: 'To' },
          { get: (i) => `${i.confirmations}/${i.threshold}`, label: 'Conf' },
          { key: 'age', label: 'Age' },
        ])}
        <h4>Historical · system incomplete teleports (${esc(sysT.historical_count)})</h4>
        ${rowList(sysT.historical, [
          { key: 'id', label: 'Teleport' },
          { key: 'chain_name', label: 'EVM' },
          { key: 'quantity', label: 'Qty' },
          { get: (i) => `${i.signatures}/${i.threshold}`, label: 'Sigs' },
          { key: 'age', label: 'Age' },
        ])}
        <h4>Historical · system incomplete receipts (${esc(sysR.historical_count)})</h4>
        ${rowList(sysR.historical, [
          { key: 'id', label: 'Receipt' },
          { key: 'chain_name', label: 'EVM' },
          { key: 'quantity', label: 'Qty' },
          { get: (i) => `${i.confirmations}/${i.threshold}`, label: 'Conf' },
          { key: 'age', label: 'Age' },
        ])}
      </div>
    </details>`
        : ''
    }

    <footer>
      <span>Read-only · ${esc(wax)} on-chain data · no private keys</span>
      <a href="/api/status">JSON API</a>
      <a href="/health">Health</a>
      <a href="https://teleport.alienworlds.io/" target="_blank" rel="noopener">Teleport app</a>
      <span>Auto-refresh 60s</span>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderHtml };
