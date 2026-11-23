'use strict';

/* ================================================================== */
/* Utilidades                                                          */
/* ================================================================== */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl';

const ICONS = {
  plus: '<path d="M5 12h14M12 5v14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  sliders: '<path d="M20 7h-9M14 17H4M17 17h3M7 7H4"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  shuffle: '<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.97a4 4 0 0 0 3.3-1.7l5.45-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.97a4 4 0 0 1 3.3 1.7l.5.8"/><path d="M22 18h-6.04a4 4 0 0 1-3.3-1.8l-.5-.8"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6M14 11v6"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  imagePlus: '<path d="M16 5h6M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/><circle cx="9" cy="9" r="2"/>',
  imageUp: '<path d="M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.81.01L6 21"/><path d="m14 19.5 3-3 3 3"/><path d="M17 22v-5.5"/><circle cx="9" cy="9" r="2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  imageOff: '<path d="M2 2l20 20"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><path d="M13.5 13.5 6 21"/><path d="M18 12l3 3"/><path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.05-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/>',
  type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"/><path d="m2 2 20 20"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  images: '<path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>',
  forward: '<polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/>',
  volume: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>',
  volumeOff: '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="m22 9-6 6M16 9l6 6"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  minus: '<path d="M5 12h14"/>',
  bot: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  wave: '<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  maximize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a2 2 0 0 1 2.8 0l5.6 5.6a2 2 0 0 1 0 2.8L13 21"/><path d="M22 21H7M5 11l9 9"/>',
};

function svg(name, cls = '') {
  return `<svg class="svg ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
const tip = (t) => `data-tip="${esc(t)}" aria-label="${esc(t)}"`;

const moneyFmt2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyFmt3 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 3 });
const brlFmt2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brlFmt3 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 3 });

// Os valores do Atlas são em dólar. Nas Configurações dá para ver em reais ('brl') ou nos dois ('both':
// dólar e, entre parênteses e com menos destaque, reais). Sem cotação disponível, fica em dólar.
function currencyMode() {
  const m = S.config.currency;
  return (m === 'brl' || m === 'both') && S.config.fx && S.config.fx.rate > 0 ? m : 'usd';
}
// fine: valores pequenos (custo de uma geração) ganham a terceira casa
function formatMoney(v, fine, html) {
  if (v == null || !Number.isFinite(v)) return '—';
  const usd = (fine ? moneyFmt3 : moneyFmt2).format(v);
  const mode = currencyMode();
  if (mode === 'usd') return usd;
  const r = v * S.config.fx.rate;
  const brl = (fine && r < 0.095 ? brlFmt3 : brlFmt2).format(r);
  if (mode === 'brl') return brl;
  return html ? `${usd} <small class="brl">(${brl})</small>` : `${usd} (${brl})`;
}
const money = (v) => formatMoney(v, false, false);
const cost = (v) => formatMoney(v, true, false);
// as versões HTML diminuem o destaque do valor em reais quando os dois aparecem
const moneyHTML = (v) => formatMoney(v, false, true);
const costHTML = (v) => formatMoney(v, true, true);

/* ---------- estimativa de custo antes de gerar ---------- */

// O servidor pergunta ao Atlas quanto o pedido custaria (isso não gera nem cobra nada). Enquanto a resposta
// não chega, o botão mostra "calculando"; se o Atlas não souber dizer, vale a conta pela tabela, com ≈.
const EST = { sig: '', timer: null, seq: 0, quote: null, loading: false, tries: 0 };

function askEstimate(url, body, wait = 450) {
  const sig = JSON.stringify([url, S.config.hasKey, body]);
  if (sig === EST.sig) return;
  EST.sig = sig;
  clearTimeout(EST.timer);
  EST.seq++;
  EST.quote = null;
  EST.tries = 0;
  EST.loading = !!body && S.config.hasKey;
  if (!EST.loading) return;
  const run = (delay) => {
    EST.timer = setTimeout(async () => {
      const seq = ++EST.seq;
      let r = null;
      try { r = await api(url, { method: 'POST', body }); } catch { /* fica na conta pela tabela */ }
      if (seq !== EST.seq) return;
      EST.quote = r ? r.items || null : null;
      // o Atlas precisa de um arquivo que ainda está subindo: o servidor já começou o envio, pergunta de novo
      if (r && r.pending && EST.tries < 10) { EST.tries++; run(2500); } else EST.loading = false;
      renderGo();
    }, delay);
  };
  run(wait);
}

// keys: modelos que vão gerar; tableTotal: a conta pela tabela, usada se a cotação falhar
function paintEstimate(keys, tableTotal, reason, verb = 'Gerar') {
  const q = EST.quote;
  const quoted = !!q && keys.length > 0 && keys.every((k) => q.some((x) => x.key === k && x.price != null));
  let total = tableTotal; let exact = false; let cap = false; // cap: é o teto, com a duração por conta do modelo
  if (quoted) { total = 0; exact = true; for (const k of keys) { const x = q.find((y) => y.key === k); total += x.price; if (!x.exact) exact = false; if (x.max) cap = true; } }
  const el = $('#go-est');
  const waiting = EST.loading && !quoted;
  if (!keys.length || !(total > 0)) el.textContent = '';
  else if (waiting) el.innerHTML = '<span class="mini-spin"></span>';
  else el.innerHTML = `${cap ? 'até ' : exact ? '' : '≈ '}${costHTML(total)}`;
  const how = waiting ? ', calculando o custo…' : total > 0 ? `, custo ${exact ? 'calculado pelo Atlas Cloud' : cap ? 'máximo (com a duração automática, o Atlas Cloud cota a mais longa que o modelo pode gerar)' : quoted ? 'estimado pelo Atlas Cloud' : 'estimado pela tabela (o cobrado pode ser maior)'}: ${cost(total)}` : '';
  $('#go').dataset.tip = reason || `${verb} (${MOD} + Enter)${how}`;
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayLabel(key) {
  const today = dayKey(Date.now());
  const yest = dayKey(Date.now() - 864e5);
  if (key === today) return 'Hoje';
  if (key === yest) return 'Ontem';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  const s = new Intl.DateTimeFormat('pt-BR', opts).format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const hhmm = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const elapsed = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`; };

async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  if (raw) opts.body = raw;
  let res;
  try { res = await fetch(path, opts); } catch { throw new Error('O app local não está respondendo. Ele ainda está aberto?'); }
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}

/* ================================================================== */
/* Estado                                                              */
/* ================================================================== */

const RATIOS = ['auto', '1:1', '4:5', '3:4', '2:3', '9:16', '16:9', '3:2', '4:3', '21:9'];
const TIERS = ['1K', '2K', '4K'];
const COUNTS = [1, 2, 3, 4];
const STORE_KEY = 'gerador.composer.v1';
const TAB_KEY = 'gerador.tab';

const S = {
  tab: 'image', // aba aberta: 'image', 'video' ou 'audio'
  config: { hasKey: false, enabled: [], enabledVideo: [], enabledAudio: [], dataDir: '' },
  // aba de áudio (a lógica dela fica em audio.js)
  afamilies: [],
  afam: new Map(),
  acatalogLoaded: false,
  acatalogError: null,
  a: { prompt: '', mode: 'speech', lyrics: '', voices: {}, speed: 1, lang: 'auto', instrumental: false, duration: 30, sfxDuration: 5, loop: false, input: null, families: [] },
  families: [],
  fam: new Map(),
  catalogLoaded: false,
  catalogError: null,
  // aba de vídeos (a lógica dela fica em video.js)
  vfamilies: [],
  vfam: new Map(),
  vcatalogLoaded: false,
  vcatalogError: null,
  // refs: referências do modo Referência (imagens e vídeos); editRefs: imagens de apoio do modo Editar
  v: { prompt: '', mode: 'text', start: null, end: null, refs: [], editRefs: [], video: null, families: [], ratio: 'auto', res: '720p', dur: 5, audio: true },
  vquote: null,
  batches: new Map(),
  library: [], // biblioteca de referências: imagens que o usuário guardou para usar sempre
  q: '', // busca do histórico
  balance: { value: null },
  balanceLoading: false,
  c: { prompt: '', refs: [], families: [], ratio: '1:1', tier: 0, count: 1 },
  uploads: new Set(),
  dayEls: new Map(),
  batchEls: new Map(),
  openPrompts: new Set(),
};

function loadComposer() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved) Object.assign(S.c, saved, { refs: (saved.refs || []).filter((r) => r && r.id && !r.uploading) });
  } catch { /* ignora */ }
  loadVideo();
  loadAudio();
  try { const t = localStorage.getItem(TAB_KEY); if (t === 'video' || t === 'audio') S.tab = t; } catch { /* ignora */ }
}

// Imagens, vídeos e áudios dividem a mesma tela: cada aba tem seu painel e sua linha do tempo
const kindOf = (b) => b.kind || 'image';
// busca do histórico: procura no prompt, na letra, no nome do modelo e no texto transcrito
const matchesSearch = (b) => !S.q || `${b.prompt || ''} ${b.lyrics || ''} ${b.items.map((i) => `${i.familyName} ${i.text || ''}`).join(' ')}`.toLowerCase().includes(S.q);
const visible = (b) => kindOf(b) === S.tab && matchesSearch(b);
function clearSearch() {
  if (!S.q) return;
  S.q = '';
  $('#tl-search').value = '';
  renderTimeline();
}
const cur = () => (S.tab === 'video' ? S.v : S.tab === 'audio' ? S.a : S.c); // estado do painel da aba aberta
const saveCur = () => (S.tab === 'video' ? saveVideo() : S.tab === 'audio' ? saveAudio() : saveComposer());

function switchTab(tab) {
  if (tab === S.tab) return;
  S.tab = tab;
  try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignora */ }
  if (LB.open) LB.close();
  closePop();
  renderComposer();
  renderTimeline();
  if (SET.open) renderModelList();
  $('#stream').scrollTo({ top: 0 });
}

function renderTabs() {
  $('#tabs').innerHTML = [['image', 'Imagens', 'image'], ['video', 'Vídeos', 'film'], ['audio', 'Áudio', 'music']]
    .map(([k, label, icon]) => `<button class="${S.tab === k ? 'on' : ''}" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-v="${k}">${svg(icon, 's16')}<span>${label}</span></button>`).join('');
}
let saveTimer;
function saveComposer() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { prompt, families, ratio, tier, count } = S.c;
    const refs = S.c.refs.filter((r) => !r.uploading).map(({ id, url, w, h }) => ({ id, url, w, h }));
    localStorage.setItem(STORE_KEY, JSON.stringify({ prompt, refs, families, ratio, tier, count }));
  }, 200);
}

/* ================================================================== */
/* Modelos: variantes e compatibilidade                                */
/* ================================================================== */

function pickVariant(f, hasRefs) {
  if (!f) return null;
  const t = f.variants.t2i;
  const e = f.variants.edit;
  const ct = t && (t.caps || { usable: true, acceptsImages: false, requiresImages: false });
  const ce = e && (e.caps || { usable: true, acceptsImages: true, requiresImages: true });
  if (hasRefs) {
    if (e && ce.usable && ce.acceptsImages) return e;
    if (t && ct.usable && ct.acceptsImages) return t;
    return null;
  }
  if (t && ct.usable && !ct.requiresImages) return t;
  if (e && ce.usable && !ce.requiresImages) return e;
  return null;
}
const famPrice = (f) => (f.variants.t2i?.price ?? f.variants.edit?.price ?? null);
const enabledFamilies = () => S.config.enabled.map((k) => S.fam.get(k)).filter(Boolean);

// Ícone do provider: favicon oficial do site da empresa, depois o avatar do catálogo, depois a inicial
const PROVIDER_DOMAINS = {
  google: 'google.com', openai: 'openai.com', bytedance: 'bytedance.com', xai: 'x.ai',
  'black-forest-labs': 'bfl.ai', bfl: 'bfl.ai', alibaba: 'alibabacloud.com', qwen: 'qwen.ai', 'z-image': 'alibabacloud.com',
  ideogram: 'ideogram.ai', recraft: 'recraft.ai', midjourney: 'midjourney.com', stability: 'stability.ai', stabilityai: 'stability.ai',
  tencent: 'tencent.com', kwaivgi: 'klingai.com', kling: 'klingai.com', minimax: 'minimax.io', luma: 'lumalabs.ai',
  runway: 'runwayml.com', leonardo: 'leonardo.ai', hidream: 'hidream.ai', baidu: 'baidu.com', krea: 'krea.ai',
  higgsfield: 'higgsfield.ai', vidu: 'vidu.com', reve: 'reve.com', pixverse: 'pixverse.ai', meituan: 'meituan.com',
  microsoft: 'microsoft.com', meta: 'meta.com', nvidia: 'nvidia.com', amazon: 'aws.amazon.com', adobe: 'adobe.com',
};
// O catálogo devolve o provider cru ("BLACK-FOREST-LABS"); aqui ele vira um nome legível
const PROVIDER_NAMES = {
  google: 'Google', openai: 'OpenAI', bytedance: 'ByteDance', xai: 'xAI', 'black-forest-labs': 'Black Forest Labs', bfl: 'Black Forest Labs',
  alibaba: 'Alibaba', qwen: 'Qwen', ideogram: 'Ideogram', recraft: 'Recraft', midjourney: 'Midjourney', stability: 'Stability AI', stabilityai: 'Stability AI',
  tencent: 'Tencent', kwaivgi: 'Kling', kling: 'Kling', minimax: 'MiniMax', luma: 'Luma', runway: 'Runway', leonardo: 'Leonardo', hidream: 'HiDream',
  baidu: 'Baidu', krea: 'Krea', higgsfield: 'Higgsfield', vidu: 'Vidu', reve: 'Reve', pixverse: 'PixVerse', meituan: 'Meituan',
  microsoft: 'Microsoft', meta: 'Meta', nvidia: 'NVIDIA', amazon: 'Amazon', adobe: 'Adobe', atlascloud: 'Atlas Cloud',
  kuaishou: 'Kling', lightricks: 'LTX', ltx: 'LTX', 'ltx-2.3-quality': 'LTX', heygen: 'HeyGen', veed: 'VEED', byteplus: 'BytePlus',
  'video-rebirth': 'Video Rebirth', 'rebirth-video': 'Video Rebirth', sync: 'Sync', elevenlabs: 'ElevenLabs', suno: 'Suno',
};
function providerName(f) {
  const raw = String(f.provider || f.key.split('/')[0] || 'Outros');
  // o começo do id do modelo ("alibaba/…") é mais confiável que o nome que o catálogo dá ("QWEN")
  const known = PROVIDER_NAMES[String(f.key).split('/')[0].toLowerCase()] || PROVIDER_NAMES[raw.toLowerCase()];
  if (known) return known;
  if (raw !== raw.toUpperCase() && raw !== raw.toLowerCase()) return raw; // já vem com maiúsculas e minúsculas
  return raw.toLowerCase().split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function iconSources(familyKey, avatar) {
  const org = String(familyKey || '').split('/')[0].toLowerCase();
  const dom = PROVIDER_DOMAINS[org];
  const list = [];
  if (dom) list.push(`https://www.google.com/s2/favicons?domain=${dom}&sz=64`);
  if (avatar) list.push(avatar);
  return list;
}
function avatarHTML(familyKey, name, avatar, cls = '') {
  const initial = esc((name || '?').trim().charAt(0).toUpperCase());
  const fb = `<span class="avatar fallback ${cls}">${initial}</span>`;
  const src = iconSources(familyKey, avatar);
  if (!src.length) return fb;
  const rest = src.slice(1).join('|');
  return `<img class="avatar ${cls}" src="${esc(src[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" data-alt="${esc(rest)}" data-fb="${esc(fb)}" onerror="avatarFail(this)">`;
}
window.avatarFail = (img) => {
  const alts = (img.dataset.alt || '').split('|').filter(Boolean);
  if (alts.length) { img.dataset.alt = alts.slice(1).join('|'); img.src = alts[0]; return; }
  img.outerHTML = img.dataset.fb;
};

function ratioGlyph(ratio, max = 15) {
  if (ratio === 'auto' || !ratio) return `<i style="width:${max - 2}px;height:${max - 2}px"></i>`;
  const [a, b] = ratio.split(':').map(Number);
  const r = a / b;
  const w = r >= 1 ? max : Math.round(max * r);
  const h = r >= 1 ? Math.round(max / r) : max;
  return `<i style="width:${w}px;height:${h}px"></i>`;
}
// Nome da proporção a partir das dimensões reais ("4:5", "16:9" ou "1.85:1")
function ratioLabel(w, h) {
  if (!w || !h) return '';
  const r = w / h;
  const named = RATIOS.find((x) => {
    if (x === 'auto') return false;
    const [a, b] = x.split(':').map(Number);
    return Math.abs(a / b - r) / r < 0.012;
  });
  if (named) return named;
  return r >= 1 ? `${+r.toFixed(2)}:1` : `1:${+(1 / r).toFixed(2)}`;
}

/* ================================================================== */
/* Composer                                                            */
/* ================================================================== */

function renderRefs() {
  const box = $('#refs');
  box.classList.toggle('none', !S.c.refs.length);
  box.innerHTML = S.c.refs.map((r, i) => `
    <div class="ref ${r.uploading ? 'uploading' : ''}" draggable="true" data-ref-index="${i}">
      <img src="${esc(r.url)}" alt="">
      <span class="idx num">${i + 1}</span>
      ${libSaveBtn(r)}
      <button class="rm" data-act="rm-ref" data-i="${i}" ${tip('Remover')}>${svg('x', 's14')}</button>
    </div>`).join('') +
    `<button class="ref-add" data-act="add-ref" ${tip('Imagens de referência: clique, arraste ou cole')}>${svg('imagePlus', 's20')}${S.c.refs.length ? '' : '<span>Adicionar referência</span>'}</button>${libOpenBtn('refs')}`;
}

/* ---------- biblioteca de referências ---------- */

// Imagens que o usuário escolheu guardar para usar sempre. Nada entra sozinho: ou ele marca uma referência
// do painel (o marcador sobre a miniatura), ou envia imagens pela seção Biblioteca das Configurações.
const inLibrary = (id) => S.library.some((e) => e.id === id);

// Marcador sobre a miniatura de uma referência: guarda (ou tira) da biblioteca
function libSaveBtn(ref) {
  if (!ref || ref.uploading || (ref.kind && ref.kind !== 'image')) return '';
  const on = inLibrary(ref.id);
  return `<button class="lib ${on ? 'on' : ''}" data-act="lib-toggle" data-id="${esc(ref.id)}" ${tip(on ? 'Está na biblioteca (clique para tirar)' : 'Salvar na biblioteca')}>${svg('bookmark', 's14')}</button>`;
}
// Botão que abre a biblioteca para escolher imagens. slot diz para onde elas vão (nos vídeos há mais de um lugar)
function libOpenBtn(slot, cls = 'ref-add lib-open') {
  return `<button class="${cls}" data-act="lib-open" data-slot="${slot}" ${tip('Escolher da biblioteca')}>${svg('bookmark', 's20')}</button>`;
}

function setLibrary(list) {
  S.library = Array.isArray(list) ? list : [];
  if (S.tab === 'image') renderRefs(); else if (S.tab === 'video') renderVMedia();
  if (popEl && popEl.classList.contains('lib-pop')) renderLibraryPop();
  if (SET.open) renderLibrarySettings();
  if (LIBVIEW.el) renderLibraryView();
}

async function libraryAdd(id, name = '') {
  try { setLibrary((await api('/api/library', { method: 'POST', body: { id, name } })).library); return true; } catch (e) { toast(e.message, 'error'); return false; }
}
async function libraryRemove(id) {
  try { setLibrary((await api(`/api/library/${id}`, { method: 'DELETE' })).library); } catch (e) { toast(e.message, 'error'); }
}

// Envia arquivos direto para a biblioteca (pelas Configurações)
async function libraryUpload(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) { toast('A biblioteca guarda imagens', 'error'); return; }
  let ok = 0;
  for (const file of imgs) {
    try {
      const ref = await api('/api/refs', { method: 'POST', raw: file, headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name || 'imagem.png') } });
      if (await libraryAdd(ref.id, String(file.name || '').replace(/\.[^.]+$/, ''))) ok++;
    } catch (e) { toast(e.message, 'error'); }
  }
  if (ok) toast(ok > 1 ? `${ok} imagens guardadas na biblioteca` : 'Imagem guardada na biblioteca', 'ok');
}

// Painel flutuante com as imagens da biblioteca. Um clique põe a imagem no painel; outro tira.
const LIB = { slot: 'refs', btn: null };
function libraryInUse() {
  if (S.tab === 'video') return vLibraryInUse(LIB.slot);
  return new Set(S.c.refs.map((r) => r.id));
}
function renderLibraryPop() {
  if (!popEl) return;
  const used = libraryInUse();
  // grade em colunas (masonry): cada imagem aparece inteira, na proporção dela
  popEl.innerHTML = `<div class="pop-title">Biblioteca de referências</div>${S.library.length
    ? `<div class="lib-scroll"><div class="lib-grid">${S.library.map((e) => `<div class="lib-item ${used.has(e.id) ? 'on' : ''}" data-act="lib-pick" data-id="${esc(e.id)}" role="button" tabindex="0" aria-pressed="${used.has(e.id)}" ${tip(e.name ? `${e.name}${used.has(e.id) ? ' (em uso)' : ''}` : used.has(e.id) ? 'Em uso: clique para tirar' : 'Usar como referência')}>
        <img src="${esc(e.url)}" alt="" loading="lazy" ${libRatio(e)}><span class="lib-check">${svg('check', 's14')}</span>
        <button class="lib-zoom" data-act="lib-zoom" data-id="${esc(e.id)}" ${tip('Ampliar')}>${svg('maximize', 's14')}</button></div>`).join('')}</div></div>`
    : '<p class="lib-empty">Sua biblioteca está vazia. Para guardar uma imagem, passe o mouse sobre uma referência do painel e clique no marcador, ou envie imagens pelas Configurações.</p>'}
    <div class="lib-foot"><button data-act="lib-manage">${svg('sliders', 's16')}<span>Gerenciar a biblioteca</span></button></div>`;
}
// Reserva o espaço da imagem com a proporção real dela, para a grade não pular enquanto carrega
const libRatio = (e) => (e.w > 0 && e.h > 0 ? `style="aspect-ratio:${e.w} / ${e.h}"` : '');

/* ---------- ampliar uma imagem da biblioteca ---------- */

// pick: aberto a partir do painel de escolha (mostra o botão de usar como referência)
const LIBVIEW = { el: null, id: null, pick: false };

function openLibraryView(id, pick) {
  LIBVIEW.id = id;
  LIBVIEW.pick = !!pick;
  if (!LIBVIEW.el) {
    const el = document.createElement('div');
    el.className = 'lib-view';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Imagem da biblioteca');
    el.addEventListener('mousedown', (e) => { if (e.target === el || e.target.classList.contains('lv-stage')) closeLibraryView(); });
    document.body.appendChild(el);
    LIBVIEW.el = el;
  }
  hideTip();
  renderLibraryView();
}

function closeLibraryView() {
  if (!LIBVIEW.el) return;
  LIBVIEW.el.remove();
  LIBVIEW.el = null;
  hideTip();
}

function renderLibraryView() {
  const el = LIBVIEW.el;
  if (!el) return;
  const i = S.library.findIndex((e) => e.id === LIBVIEW.id);
  if (i < 0) { closeLibraryView(); return; }
  const e = S.library[i];
  const used = LIBVIEW.pick && libraryInUse().has(e.id);
  el.innerHTML = `
    <div class="lv-stage">
      <button class="lv-nav prev" data-act="lib-view-go" data-d="-1" ${i === 0 ? 'disabled' : ''} ${tip('Anterior (←)')}>${svg('chevL', 's20')}</button>
      <img src="${esc(e.url)}" alt="${esc(e.name || 'Imagem da biblioteca')}">
      <button class="lv-nav next" data-act="lib-view-go" data-d="1" ${i >= S.library.length - 1 ? 'disabled' : ''} ${tip('Próxima (→)')}>${svg('chevR', 's20')}</button>
    </div>
    <div class="lv-bar">
      <div class="lv-info"><b>${esc(e.name || 'Imagem da biblioteca')}</b><span class="num">${e.w && e.h ? `${e.w} × ${e.h} px · ${ratioLabel(e.w, e.h)} · ` : ''}${i + 1} de ${S.library.length}</span></div>
      ${LIBVIEW.pick ? `<button class="btn ${used ? 'line' : ''}" data-act="lib-view-use">${svg(used ? 'x' : 'imageUp', 's16')}${used ? 'Tirar das referências' : 'Usar como referência'}</button>` : ''}
      <button class="icon-btn" data-act="lib-view-close" ${tip('Fechar (Esc)')}>${svg('x', 's20')}</button>
    </div>`;
}

function libraryViewGo(d) {
  const i = S.library.findIndex((e) => e.id === LIBVIEW.id) + d;
  if (i < 0 || i >= S.library.length) return;
  LIBVIEW.id = S.library[i].id;
  renderLibraryView();
}

// com a imagem ampliada: Esc fecha e as setas trocam de imagem (antes dos outros atalhos da tela)
document.addEventListener('keydown', (e) => {
  if (!LIBVIEW.el) return;
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeLibraryView(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); libraryViewGo(e.key === 'ArrowLeft' ? -1 : 1); }
}, true);
function openLibrary(btn, slot) {
  closePop();
  LIB.slot = slot || 'refs';
  LIB.btn = btn;
  popEl = document.createElement('div');
  popEl.className = 'pop lib-pop';
  popEl.setAttribute('role', 'dialog');
  popEl.setAttribute('aria-label', 'Biblioteca de referências');
  document.body.appendChild(popEl);
  renderLibraryPop();
  const r = btn.getBoundingClientRect();
  const pw = popEl.offsetWidth; const ph = popEl.offsetHeight;
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  popEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pw - 8))}px`;
  popEl.style.top = `${top}px`;
}
// Usa (ou tira) uma imagem da biblioteca no painel aberto
function libraryUse(id) {
  const e = S.library.find((x) => x.id === id);
  if (!e) return;
  const ref = { id: e.id, url: e.url, w: e.w, h: e.h, kind: 'image', duration: 0 };
  if (S.tab === 'video') {
    vUseLibrary(ref, LIB.slot);
    // nos quadros inicial e final a escolha fecha o painel: a imagem ampliada fecha junto
    if (!popEl) closeLibraryView(); else renderLibraryView();
    return;
  }
  const i = S.c.refs.findIndex((r) => r.id === id);
  if (i >= 0) S.c.refs.splice(i, 1); else S.c.refs.push(ref);
  renderRefs(); renderModels(); renderGo(); saveComposer();
  renderLibraryPop();
  renderLibraryView();
}

// Seção Biblioteca das Configurações: ver, enviar e tirar imagens
function renderLibrarySettings() {
  const box = $('#lib-set');
  if (!box) return;
  $('#lib-count').textContent = S.library.length ? `${S.library.length} ${S.library.length > 1 ? 'imagens' : 'imagem'}` : '';
  box.innerHTML = `<div class="lib-scroll"><div class="lib-grid set"><button class="ref-add" data-act="lib-upload" ${tip('Enviar imagens para a biblioteca')}>${svg('imagePlus', 's20')}</button>${S.library.map((e) => `<div class="lib-thumb" data-act="lib-zoom" data-id="${esc(e.id)}" role="button" tabindex="0" ${tip(e.name ? `${e.name} (clique para ampliar)` : 'Clique para ampliar')}><img src="${esc(e.url)}" alt="" loading="lazy" ${libRatio(e)}><button class="rm" data-act="lib-remove" data-id="${esc(e.id)}" ${tip('Tirar da biblioteca')}>${svg('x', 's14')}</button></div>`).join('')}</div></div>
    ${S.library.length ? '' : '<p class="lib-hint">Guarde aqui as imagens que você usa sempre como referência (um rosto, um produto, um estilo). Depois elas ficam a um clique, no botão de marcador ao lado das referências.</p>'}`;
}

// Um bloco por provider, na ordem em que cada um aparece no painel
function modelGroups(list, chip) {
  const groups = new Map();
  for (const f of list) {
    const p = providerName(f);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(f);
  }
  return [...groups].map(([provider, fams]) => `
    <div class="pgroup">
      <div class="pgroup-head">${avatarHTML(fams[0].key, provider, fams[0].avatar)}<span>${esc(provider)}</span></div>
      <div class="pgroup-chips">${fams.map(chip).join('')}</div>
    </div>`).join('');
}

function renderModels() {
  if (S.tab === 'video') return renderVModels();
  if (S.tab === 'audio') return renderAModels();
  const box = $('#models');
  if (!S.catalogLoaded) { box.innerHTML = '<div class="pgroup-chips"><span class="chip skeleton"></span><span class="chip skeleton"></span><span class="chip skeleton"></span></div>'; return; }
  const list = enabledFamilies();
  if (!list.length) {
    box.innerHTML = S.catalogError
      ? `<div class="models-empty">${svg('alert', 's16')}<span>Não consegui carregar os modelos.</span><button data-act="reload-models">Tentar de novo</button></div>`
      : `<div class="models-empty"><span>Nenhum modelo no painel.</span><button data-act="open-settings">Escolher modelos</button></div>`;
    return;
  }
  const keys = new Set(list.map((f) => f.key));
  S.c.families = S.c.families.filter((k) => keys.has(k));
  const hasRefs = S.c.refs.length > 0;
  const chip = (f) => {
    const on = S.c.families.includes(f.key);
    const v = pickVariant(f, hasRefs);
    const price = v?.price ?? famPrice(f);
    let t = price != null ? `${cost(price)} por imagem` : f.provider;
    if (!v) t = hasRefs ? 'Não aceita imagem de referência' : 'Precisa de imagem de referência';
    else if (hasRefs && v.caps?.maxImages && S.c.refs.length > v.caps.maxImages) t += v.caps.maxImages === 1 ? ', usa só a primeira referência' : `, usa até ${v.caps.maxImages} referências`;
    t += '. Duplo clique deixa só ele';
    return `<button class="chip ${on ? 'on' : ''} ${v ? '' : 'off-compat'}" data-act="toggle-model" data-key="${esc(f.key)}" aria-pressed="${on}" ${tip(t)}>
      <span>${esc(f.name)}</span>${v ? '' : svg('imageOff', 's14 x-ref')}
    </button>`;
  };
  box.innerHTML = modelGroups(list, chip);
}

function ratioButton(r, on, act, label) {
  const text = label || (r === 'auto' ? 'Auto' : r);
  const hint = r === 'auto' ? tip('Automática: o modelo escolhe') : `aria-label="${esc(text)}"`;
  return `<button class="ratio ${r === 'auto' || r === 'free' ? 'auto' : ''} ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-act="${act}" data-v="${esc(r)}" ${hint}><span class="g">${ratioGlyph(/^\d/.test(r) ? r : 'auto', 16)}</span><span class="t num">${esc(text)}</span></button>`;
}

function renderRatios() {
  if (S.tab === 'audio') { $('#ratios').hidden = true; return; }
  if (S.tab === 'video') return renderVRatios();
  $('#ratios').hidden = false;
  $('#ratios').innerHTML = RATIOS.map((r) => ratioButton(r, S.c.ratio === r, 'ratio')).join('');
}

function renderSegs() {
  $('#tiers').innerHTML = TIERS.map((t, i) => `<button class="${S.c.tier === i ? 'on' : ''}" role="radio" aria-checked="${S.c.tier === i}" data-act="tier" data-v="${i}" ${tip(['Rápida e barata', 'Alta resolução', 'Máxima resolução'][i] + ' (o modelo usa a mais próxima que tiver)')}>${t}</button>`).join('');
  const countEl = $('#count');
  const single = S.c.families.length === 1;
  countEl.classList.toggle('hidden', !single);
  countEl.innerHTML = COUNTS.map((n) => `<button class="${S.c.count === n ? 'on' : ''}" role="radio" aria-checked="${S.c.count === n}" data-act="count" data-v="${n}" ${tip(`${n} ${n > 1 ? 'imagens' : 'imagem'}`)}>×${n}</button>`).join('');
}

function runnable() {
  const hasRefs = S.c.refs.length > 0;
  return S.c.families.map((k) => S.fam.get(k)).filter((f) => f && pickVariant(f, hasRefs));
}

function renderGo() {
  if (S.tab === 'video') return renderVGo();
  if (S.tab === 'audio') return renderAGo();
  const btn = $('#go');
  const fams = runnable();
  const hasRefs = S.c.refs.length > 0;
  const n = fams.length === 1 ? S.c.count : 1;
  let est = 0;
  for (const f of fams) est += (pickVariant(f, hasRefs)?.price || 0) * n;
  $('#go-icon').innerHTML = svg('sparkles', 's16');
  let reason = '';
  if (!S.config.hasKey) reason = 'Configure a API key primeiro';
  else if (!S.c.prompt.trim()) reason = 'Escreva um prompt';
  else if (!S.c.families.length) reason = 'Escolha um modelo';
  else if (!fams.length) reason = hasRefs ? 'Os modelos escolhidos não aceitam referência' : 'Os modelos escolhidos precisam de referência';
  btn.disabled = !!reason && S.config.hasKey;
  // o preço muda com a qualidade e a proporção: quem responde é o Atlas, não a tabela
  const keys = fams.map((f) => f.key);
  askEstimate('/api/estimate', keys.length ? { refs: S.c.refs.filter((r) => !r.uploading).map((r) => r.id), families: keys, ratio: S.c.ratio, tier: S.c.tier, count: S.c.count } : null);
  paintEstimate(keys, est, reason);
}

function renderComposer() {
  $('#composer').dataset.tab = S.tab;
  renderTabs();
  const ta = $('#prompt');
  if (ta.value !== cur().prompt) ta.value = cur().prompt;
  ta.placeholder = S.tab === 'video' ? videoPlaceholder() : S.tab === 'audio' ? audioPlaceholder() : 'Descreva a imagem';
  // transcrever não tem texto: o que entra é o arquivo de áudio
  const stt = S.tab === 'audio' && S.a.mode === 'stt';
  $('.prompt-wrap').hidden = stt;
  $('#go-label').textContent = stt ? 'Transcrever' : 'Gerar';
  autosize();
  $('#prompt-clear').innerHTML = svg('x', 's16');
  $('#prompt-clear').classList.toggle('show', !!cur().prompt);
  if (S.tab === 'video') { renderVModes(); renderVMedia(); renderVOpts(); }
  else if (S.tab === 'audio') renderAudioPanel();
  else { renderRefs(); renderSegs(); }
  renderModels();
  renderRatios();
  renderGo();
}

function autosize() {
  const ta = $('#prompt');
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(132, ta.scrollHeight + 2)}px`;
}

/* ---------- referências ---------- */

async function addFiles(files) {
  if (S.tab === 'video') return vAddFiles(files);
  if (S.tab === 'audio') return aAddFiles(files);
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return;
  for (const file of imgs) {
    const temp = { id: `tmp-${Math.random().toString(36).slice(2)}`, url: URL.createObjectURL(file), uploading: true };
    S.c.refs.push(temp);
    const p = (async () => {
      try {
        const ref = await api('/api/refs', { method: 'POST', raw: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'imagem.png') } });
        const i = S.c.refs.indexOf(temp);
        if (S.c.refs.some((r) => r.id === ref.id)) S.c.refs.splice(i, 1);
        else if (i >= 0) S.c.refs[i] = ref;
      } catch (e) {
        S.c.refs = S.c.refs.filter((r) => r !== temp);
        toast(e.message, 'error');
      } finally {
        URL.revokeObjectURL(temp.url);
        renderRefs(); renderModels(); renderGo(); saveComposer();
      }
    })();
    S.uploads.add(p);
    p.finally(() => S.uploads.delete(p));
  }
  renderRefs(); renderModels(); renderGo();
}

async function useAsRef(itemId, index) {
  if (S.tab === 'video') return vUseOutput(itemId, index);
  try {
    const ref = await api('/api/refs/from-output', { method: 'POST', body: { itemId, index } });
    if (!S.c.refs.some((r) => r.id === ref.id)) S.c.refs.push(ref);
    renderRefs(); renderModels(); renderGo(); saveComposer();
    const last = $$('.ref', $('#refs')).find((el) => el.querySelector('img')?.getAttribute('src') === ref.url);
    last?.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
    toast('Adicionada às referências', 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------- gerar ---------- */

async function generate() {
  clearSearch(); // o que vai ser gerado precisa aparecer, mesmo que não combine com a busca
  if (S.tab === 'video') return vGenerate();
  if (S.tab === 'audio') return aGenerate();
  const btn = $('#go');
  if (!S.config.hasKey) return openSettings(true);
  if (btn.disabled) { toast(btn.dataset.tip, 'error'); return; }
  if (S.uploads.size) await Promise.allSettled([...S.uploads]);
  const fams = runnable();
  const skipped = S.c.families.length - fams.length;
  btn.classList.remove('sent'); void btn.offsetWidth; btn.classList.add('sent');
  try {
    const b = await api('/api/generate', {
      method: 'POST',
      body: { prompt: S.c.prompt.trim(), refs: S.c.refs.filter((r) => !r.uploading).map((r) => r.id), families: fams.map((f) => f.key), ratio: S.c.ratio, tier: S.c.tier, count: S.c.count },
    });
    upsertBatch(b);
    $('#stream').scrollTo({ top: 0, behavior: 'smooth' });
    if (skipped) toast(`${skipped} ${skipped > 1 ? 'modelos ficaram' : 'modelo ficou'} de fora por não aceitar as referências`);
  } catch (e) { toast(e.message, 'error'); }
}

/* ================================================================== */
/* Timeline                                                            */
/* ================================================================== */

function renderTimeline() {
  const tl = $('#timeline');
  tl.innerHTML = '';
  S.dayEls.clear();
  S.batchEls.clear();
  const list = [...S.batches.values()].filter(visible).sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length) return renderEmpty();
  for (const b of list) upsertBatch(b, { initial: true });
}

function renderEmpty() {
  if (S.q) {
    $('#timeline').innerHTML = `<div class="empty-state"><h3>Nada encontrado</h3><p>Nenhuma geração desta aba combina com “${esc(S.q)}”.</p></div>`;
    return;
  }
  $('#timeline').innerHTML = `<div class="empty-state"><div class="frames"><i></i><i></i><i></i></div>
    <h3>${S.tab === 'video' ? 'Nenhum vídeo gerado ainda' : S.tab === 'audio' ? 'Nenhum áudio gerado ainda' : 'Nada gerado ainda'}</h3><p>${S.tab === 'audio' ? 'Escreva o texto' : 'Escreva um prompt'}, escolha os modelos e aperte <kbd>${MOD}</kbd> <kbd>Enter</kbd></p></div>`;
}

function ensureDay(key) {
  let sec = S.dayEls.get(key);
  if (sec) return sec;
  $('.empty-state', $('#timeline'))?.remove();
  sec = document.createElement('section');
  sec.className = 'day';
  sec.dataset.day = key;
  sec.innerHTML = `<header class="day-head"><h2>${esc(dayLabel(key))}</h2><span class="stat d-cost num"></span><span class="stat d-count num"></span><span class="spacer"></span>
    <button class="icon-btn wipe" data-act="wipe-day" data-day="${key}" ${tip('Apagar todas as gerações do dia')}>${svg('trash')}</button></header><div class="day-items"></div>`;
  const later = [...S.dayEls.keys()].filter((k) => k < key).sort().reverse()[0];
  const tl = $('#timeline');
  if (later) tl.insertBefore(sec, S.dayEls.get(later)); else tl.appendChild(sec);
  S.dayEls.set(key, sec);
  return sec;
}

function updateDayStats(key) {
  const sec = S.dayEls.get(key);
  if (!sec) return;
  let total = 0; let imgs = 0; let est = false;
  for (const b of S.batches.values()) {
    if (dayKey(b.createdAt) !== key || !visible(b)) continue;
    for (const it of b.items) {
      if (it.status !== 'done') continue;
      imgs += it.outputs.length || (it.text ? 1 : 0); // transcrição: o resultado é um texto
      if (it.cost != null) total += it.cost;
      if (it.costEstimated) est = true;
    }
  }
  $('.d-cost', sec).innerHTML = imgs ? `${est ? '≈ ' : ''}${costHTML(total)}` : '';
  $('.d-cost', sec).dataset.tip = 'Gasto do dia';
  $('.d-count', sec).innerHTML = imgs ? `${svg(S.tab === 'video' ? 'film' : S.tab === 'audio' ? 'music' : 'image', 's14')}${imgs}` : '';
}

function createBatchEl(b) {
  const art = document.createElement('article');
  art.className = 'batch';
  art.dataset.id = b.id;
  art.innerHTML = `
    <div class="b-time num">${hhmm(b.createdAt)}</div>
    <div class="b-body">
      <div class="b-top">
        <button class="b-ptoggle" data-act="toggle-prompt" aria-expanded="false" ${tip('Mostrar o prompt')}>${svg('chevR', 's14')}<span>Prompt</span></button>
        <div class="b-meta"></div>
        <div class="b-actions">
          <button class="icon-btn" data-act="redo" ${tip('Refazer')}>${svg('refresh')}</button>
          <button class="icon-btn" data-act="redo-other" ${tip('Refazer com outro modelo')}>${svg('shuffle')}</button>
          <button class="icon-btn" data-act="reuse" ${tip('Levar para o painel e editar')}>${svg('pencil')}</button>
          <button class="icon-btn" data-act="del-batch" ${tip('Apagar')}>${svg('trash')}</button>
        </div>
      </div>
      <p class="b-prompt"></p>
      <div class="b-grid"></div>
    </div>`;
  art._tiles = new Map();
  art._pendingSeen = new Set();
  return art;
}

const COST_TIP = 'Custo cobrado pelo Atlas Cloud';
const COST_TIP_EST = 'Custo previsto: o Atlas Cloud ainda não informou o valor cobrado';

// Marca as gerações pedidas por um agente de IA (MCP)
function agentMark(b) {
  if (b.via !== 'mcp') return '';
  return `<span class="m" ${tip(`Gerado por um agente de IA${b.agent ? ` (${b.agent})` : ''}`)}>${svg('bot', 's14')}${esc(b.agent || 'Agente')}</span>`;
}

function batchMeta(b) {
  if (b.tool) return toolMeta(b);
  if (b.kind === 'video') return vBatchMeta(b);
  if (b.kind === 'audio') return aBatchMeta(b);
  const fams = [];
  for (const it of b.items) if (!fams.some((f) => f.family === it.family)) fams.push(it);
  const parts = fams.map((it) => `<span class="m">${avatarHTML(it.family, it.familyName, it.avatar)}${esc(it.familyName)}</span>`);
  parts.push(`<span class="m glyph" ${tip('Proporção')}>${ratioGlyph(b.ratio, 13)}${esc(b.ratio === 'auto' ? 'Auto' : b.ratio)}</span>`);
  parts.push(`<span class="m" ${tip('Qualidade')}>${TIERS[b.tier] || '1K'}</span>`);
  if (b.refs?.length) parts.push(`<span class="m refs-mini" ${tip(`${b.refs.length} ${b.refs.length > 1 ? 'referências' : 'referência'}`)}>${b.refs.slice(0, 5).map((r) => `<img src="${esc(r.url)}" alt="">`).join('')}</span>`);
  if (b.via === 'mcp') parts.push(agentMark(b));
  const running = b.items.some((i) => i.status === 'running' || i.status === 'queued');
  const done = b.items.filter((i) => i.status === 'done' && i.cost != null);
  const total = done.reduce((a, i) => a + i.cost, 0);
  const est = done.some((i) => i.costEstimated);
  if (done.length || running) {
    parts.push(`<span class="m cost" ${tip(est ? COST_TIP_EST : COST_TIP)}>${running ? '<span class="mini-spin"></span>' : ''}${done.length ? `${est ? '≈ ' : ''}${costHTML(total)}` : ''}</span>`);
  }
  return parts.join('');
}

function tileRatio(b, it, out) {
  if (out?.w && out?.h) return `${out.w} / ${out.h}`;
  if (b.ratio && b.ratio !== 'auto') return b.ratio.replace(':', ' / ');
  return b.kind === 'video' ? '16 / 9' : '1 / 1';
}

function tileSpecs(b) {
  const multi = new Set(b.items.map((i) => i.family)).size > 1;
  const specs = [];
  for (const it of b.items) {
    const badge = `<span class="badge"><span>${esc(it.familyName)}</span></span>`;
    if (it.status === 'queued' || it.status === 'running') {
      specs.push({
        key: `${it.id}:p`, sig: 'p', item: it,
        make: () => `<div class="tile pending${b.kind === 'audio' ? ' audio' : ''}" style="aspect-ratio:${tileRatio(b, it)}">${badge}<span class="clock" data-start="${it.startedAt || Date.now()}"><span class="mini-spin"></span><span>0s</span></span></div>`,
      });
    } else if (it.status === 'failed') {
      specs.push({
        key: `${it.id}:f`, sig: `f${it.error}`, item: it,
        make: () => `<div class="tile failed${b.kind === 'audio' ? ' audio' : ''}">${svg('alert', 's20')}<p>${esc(it.error || 'A geração falhou.')}</p>
          <div class="row"><button class="retry" data-act="retry" data-item="${it.id}">${svg('refresh', 's14')}Tentar de novo</button>
          <button class="icon-btn" data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash', 's16')}</button></div>
          ${badge}</div>`,
      });
    } else if (b.kind === 'audio') {
      specs.push(...aTileSpecs(b, it));
    } else {
      it.outputs.forEach((out, idx) => {
        const per = it.cost != null ? it.cost / it.outputs.length : null;
        specs.push({
          key: `${it.id}:${idx}`, sig: `d${out.url}`, item: it,
          make: () => (b.kind === 'video' ? vTileHTML(b, it, out, idx, multi ? badge : '', per) : `<div class="tile done" style="aspect-ratio:${tileRatio(b, it, out)}" data-act="open" data-item="${it.id}" data-idx="${idx}" draggable="true" tabindex="0">
            <img src="${esc(out.url)}" alt="" loading="lazy" draggable="false">
            ${multi ? badge : ''}
            ${it.edited ? `<span class="tcost">${svg('crop', 's14')}Editada</span>` : per != null ? `<span class="tcost num">${it.costEstimated ? '≈ ' : ''}${costHTML(per)}</span>` : ''}
            <div class="tools">
              <button data-act="use-ref" data-item="${it.id}" data-idx="${idx}" ${tip('Usar como referência')}>${svg('imageUp')}</button>
              <button data-act="copy-img" data-item="${it.id}" data-idx="${idx}" ${tip('Copiar imagem')}>${svg('copy')}</button>
              <button data-act="download" data-item="${it.id}" data-idx="${idx}" ${tip('Baixar')}>${svg('download')}</button>
              <button data-act="variation" data-item="${it.id}" ${tip('Gerar outra com este modelo')}>${svg('refresh')}</button>
              <button data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash')}</button>
            </div>
          </div>`),
        });
      });
    }
  }
  return specs;
}

function updateBatchEl(art, b, initial) {
  const p = $('.b-prompt', art);
  const text = b.kind === 'audio' ? aPromptText(b) : b.prompt;
  if (p.textContent !== text) p.textContent = text;
  const open = S.openPrompts.has(b.id);
  art.classList.toggle('prompt-open', open);
  const toggle = $('.b-ptoggle', art);
  toggle.setAttribute('aria-expanded', open);
  toggle.hidden = !text; // transcrição não tem prompt
  if (b.kind === 'audio') $('span', toggle).textContent = aMode(b.mode).title || 'Texto';
  $('.b-meta', art).innerHTML = batchMeta(b);
  art.classList.toggle('live', b.items.some((i) => i.status === 'running' || i.status === 'queued'));

  const grid = $('.b-grid', art);
  const specs = tileSpecs(b);
  const keep = new Set();
  let prev = null;
  for (const s of specs) {
    keep.add(s.key);
    let node = art._tiles.get(s.key);
    if (!node || node.dataset.sig !== s.sig) {
      const tmp = document.createElement('div');
      tmp.innerHTML = s.make().trim();
      const fresh = tmp.firstElementChild;
      fresh.dataset.sig = s.sig;
      fresh.dataset.key = s.key;
      if (s.sig.startsWith('d') && !initial && art._pendingSeen.has(s.item.id)) fresh.classList.add('reveal');
      if (node) node.replaceWith(fresh);
      node = fresh;
      art._tiles.set(s.key, node);
    }
    if (s.sig === 'p') art._pendingSeen.add(s.item.id);
    const want = prev ? prev.nextSibling : grid.firstChild;
    if (want !== node) grid.insertBefore(node, want);
    prev = node;
  }
  for (const [k, node] of art._tiles) if (!keep.has(k)) { node.remove(); art._tiles.delete(k); }
}

function upsertBatch(b, { initial = false } = {}) {
  // a resposta do "Gerar" pode chegar depois de um aviso mais novo do servidor (ex.: falha imediata)
  const old = S.batches.get(b.id);
  if (old && (old.rev || 0) > (b.rev || 0)) b = old;
  S.batches.set(b.id, b);
  if (!visible(b)) return; // pertence à outra aba: aparece quando ela for aberta
  const key = dayKey(b.createdAt);
  const sec = ensureDay(key);
  let art = S.batchEls.get(b.id);
  if (!art) {
    art = createBatchEl(b);
    const box = $('.day-items', sec);
    const after = [...box.children].find((el) => (S.batches.get(el.dataset.id)?.createdAt ?? 0) < b.createdAt);
    box.insertBefore(art, after || null);
    S.batchEls.set(b.id, art);
    if (!initial) art.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  updateBatchEl(art, b, initial);
  updateDayStats(key);
  if (LB.open) LB.refresh();
}

function removeBatch(id) {
  const b = S.batches.get(id);
  S.batches.delete(id);
  const art = S.batchEls.get(id);
  if (art) { art.remove(); S.batchEls.delete(id); }
  if (b) {
    const key = dayKey(b.createdAt);
    const sec = S.dayEls.get(key);
    if (sec && !$('.batch', sec)) { sec.remove(); S.dayEls.delete(key); } else updateDayStats(key);
  }
  if (![...S.batches.values()].some(visible) && !$('.empty-state', $('#timeline'))) renderEmpty();
  if (LB.open) LB.refresh();
}

function findItem(itemId) {
  for (const b of S.batches.values()) {
    const it = b.items.find((i) => i.id === itemId);
    if (it) return { b, it };
  }
  return {};
}

setInterval(() => {
  const now = Date.now();
  for (const c of $$('.clock[data-start]')) c.lastElementChild.textContent = elapsed(now - Number(c.dataset.start));
}, 1000);

/* ---------- ações nas imagens ---------- */

async function copyImage(url) {
  try {
    const blob = await (await fetch(url)).blob();
    let png = blob;
    if (blob.type !== 'image/png') {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      png = await new Promise((r) => c.toBlob(r, 'image/png'));
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast('Imagem copiada', 'ok');
  } catch {
    toast('O navegador não deixou copiar a imagem.', 'error');
  }
}

function downloadImage(b, it, idx) {
  const out = it.outputs[idx];
  const ext = (out.url.split('.').pop() || 'png').split('?')[0];
  const slug = b.prompt.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'imagem';
  const a = document.createElement('a');
  a.href = out.url;
  a.download = `${slug}-${it.id.slice(-6)}${it.outputs.length > 1 ? `-${idx + 1}` : ''}.${ext.length <= 4 ? ext : 'png'}`;
  document.body.appendChild(a); a.click(); a.remove();
}

function reuseBatch(b) {
  if (b.kind === 'video') return vReuseBatch(b);
  if (b.kind === 'audio') return aReuseBatch(b);
  const enabled = new Set(S.config.enabled);
  const fams = b.families.filter((k) => enabled.has(k));
  Object.assign(S.c, {
    prompt: b.prompt,
    refs: (b.refs || []).map((r) => ({ ...r })),
    families: fams.length ? fams : S.c.families,
    ratio: RATIOS.includes(b.ratio) ? b.ratio : 'auto',
    tier: b.tier ?? 0,
    count: COUNTS.includes(b.count) ? b.count : 1,
  });
  renderComposer(); saveComposer();
  const ta = $('#prompt');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.classList.remove('flash'); void ta.offsetWidth; ta.classList.add('flash');
}

/* confirmação em dois cliques, sem diálogo */
function armConfirm(btn, run, label) {
  if (btn.classList.contains('armed')) {
    clearTimeout(btn._armT);
    btn.classList.remove('armed');
    if (btn._armHTML) btn.innerHTML = btn._armHTML;
    run();
    return;
  }
  btn._armHTML = btn.innerHTML;
  btn.classList.add('armed');
  btn.innerHTML = `${svg('check', 's16')}${label ? `<span>${esc(label)}</span>` : ''}`;
  hideTip();
  btn._armT = setTimeout(() => { btn.classList.remove('armed'); btn.innerHTML = btn._armHTML; }, 3000);
}

/* ================================================================== */
/* Lightbox                                                            */
/* ================================================================== */

const LB = {
  open: false,
  list: [],
  i: 0,
  el: null,
  build() {
    const out = [];
    const batches = [...S.batches.values()].filter(visible).sort((a, b) => b.createdAt - a.createdAt);
    for (const b of batches) for (const it of b.items) if (it.status === 'done') it.outputs.forEach((o, idx) => out.push({ b, it, idx, o }));
    return out;
  },
  mode: 'view', // 'view' ou 'crop'
  sig: '',
  show(itemId, idx) {
    this.list = this.build();
    this.i = Math.max(0, this.list.findIndex((x) => x.it.id === itemId && x.idx === idx));
    if (!this.list.length) return;
    this.open = true;
    this.mode = 'view';
    this.sig = '';
    this.el = document.createElement('div');
    this.el.className = 'lightbox';
    this.el.dataset.act = 'lb-backdrop';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-modal', 'true');
    this.el.innerHTML = '<div class="lb-card"></div>';
    document.body.appendChild(this.el);
    this.render();
  },
  current() { return this.list[this.i]; },
  refresh() {
    if (!this.open) return;
    const cur = this.list[this.i];
    this.list = this.build();
    if (!this.list.length) return this.close();
    const j = cur ? this.list.findIndex((x) => x.it.id === cur.it.id && x.idx === cur.idx) : -1;
    if (this.mode === 'crop') {
      // não redesenha por cima do editor; só sai dele se a imagem sumiu
      if (j >= 0) { this.i = j; return; }
      CROP.teardown();
    }
    this.i = j >= 0 ? j : Math.min(this.i, this.list.length - 1);
    this.render();
  },
  select(itemId, idx = 0) {
    this.list = this.build();
    const j = this.list.findIndex((x) => x.it.id === itemId && x.idx === idx);
    if (j >= 0) this.i = j;
    this.render();
  },
  render() {
    const x = this.list[this.i];
    if (!x) return this.close();
    const { b, it, idx, o } = x;
    const per = it.cost != null ? it.cost / it.outputs.length : null;
    const params = [it.variantId ? `modelo: ${it.variantId}` : '', ...Object.entries(it.params || {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
    const sig = JSON.stringify([it.id, idx, o.url, this.i, this.list.length, it.cost, it.note, b.prompt]);
    if (sig === this.sig) return; // nada mudou nesta imagem: evita piscar durante outras gerações
    this.sig = sig;
    if (b.kind === 'video') { $('.lb-card', this.el).innerHTML = vCardHTML(this, x); return; }
    const facts = [
      o.w ? ['Tamanho', `${o.w} × ${o.h} px`] : null,
      o.w ? ['Proporção', ratioLabel(o.w, o.h)] : null,
      it.edited ? ['Origem', 'Versão cortada'] : null,
      per != null ? ['Custo', `${it.costEstimated ? '≈ ' : ''}${cost(per)}`] : null,
      ['Criada', `${dayLabel(dayKey(b.createdAt))}, ${hhmm(it.finishedAt || b.createdAt)}`],
    ].filter(Boolean);
    $('.lb-card', this.el).innerHTML = `
      <div class="lb-stage">
        <img src="${esc(o.url)}" alt="">
        <button class="lb-nav prev" data-act="lb-prev" ${this.i === 0 ? 'disabled' : ''} ${tip('Anterior (←)')}>${svg('chevL', 's20')}</button>
        <button class="lb-nav next" data-act="lb-next" ${this.i >= this.list.length - 1 ? 'disabled' : ''} ${tip('Próxima (→)')}>${svg('chevR', 's20')}</button>
      </div>
      <aside class="lb-side">
        <div class="lb-head">
          <span class="lb-model">${avatarHTML(it.family, it.familyName, it.avatar)}<span>${esc(it.familyName)}</span></span>
          ${params ? `<span class="lb-params" data-tip="${esc(params)}" aria-label="Parâmetros enviados">${svg('info', 's16')}</span>` : ''}
          <button class="icon-btn" data-act="lb-close" ${tip('Fechar (Esc)')}>${svg('x', 's20')}</button>
        </div>
        <div class="lb-scroll">
          <div class="lb-label"><span>Prompt</span><button data-act="copy-prompt" data-batch="${b.id}" ${tip('Copiar prompt')}>${svg('copy', 's14')}</button></div>
          <p class="lb-prompt">${esc(b.prompt)}</p>
          <dl class="lb-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join('')}</dl>
          ${it.note ? `<p class="lb-note">${svg('info', 's14')}<span>${esc(it.note)}</span></p>` : ''}
        </div>
        <div class="lb-foot">
          <button class="btn line" data-act="crop-open">${svg('crop', 's16')}Cortar e ajustar</button>
          <div class="crop-buttons even">
            <button class="btn line" data-act="tool" data-tool="upscale" data-item="${it.id}" data-idx="${idx}" ${tip('Gera uma versão maior e mais nítida desta imagem')}>${svg('maximize', 's16')}Aumentar</button>
            <button class="btn line" data-act="tool" data-tool="rembg" data-item="${it.id}" data-idx="${idx}" ${tip('Gera uma versão desta imagem sem o fundo')}>${svg('eraser', 's16')}Tirar fundo</button>
          </div>
          <div class="lb-actions">
            <button class="icon-btn" data-act="use-ref" data-item="${it.id}" data-idx="${idx}" ${tip('Usar como referência')}>${svg('imageUp')}</button>
            <button class="icon-btn" data-act="lib-save-output" data-item="${it.id}" data-idx="${idx}" ${tip('Salvar na biblioteca de referências')}>${svg('bookmark')}</button>
            <button class="icon-btn" data-act="copy-img" data-item="${it.id}" data-idx="${idx}" ${tip('Copiar imagem')}>${svg('copy')}</button>
            <button class="icon-btn" data-act="download" data-item="${it.id}" data-idx="${idx}" ${tip('Baixar')}>${svg('download')}</button>
            <button class="icon-btn" data-act="to-video" data-item="${it.id}" data-idx="${idx}" ${tip('Criar um vídeo a partir desta imagem')}>${svg('film')}</button>
            <button class="icon-btn" data-act="variation" data-item="${it.id}" ${tip('Gerar outra com este modelo')}>${svg('refresh')}</button>
            <button class="icon-btn" data-act="lb-reuse" data-batch="${b.id}" ${tip('Levar para o painel e editar')}>${svg('pencil')}</button>
            <button class="icon-btn" data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash')}</button>
          </div>
          <div class="lb-count num">${this.i + 1} de ${this.list.length}</div>
        </div>
      </aside>`;
  },
  go(d) { const n = this.i + d; if (n < 0 || n >= this.list.length) return; this.i = n; this.render(); },
  close() {
    CROP.teardown();
    this.open = false;
    this.el?.remove();
    this.el = null;
    hideTip();
  },
};

/* ================================================================== */
/* Editor de corte                                                     */
/* ================================================================== */

const CROP_RATIOS = ['1:1', '4:5', '3:4', '2:3', '9:16', '16:9', '3:2', '4:3', '21:9'];
const CROP_MARGIN = 32; // folga entre a moldura e a borda do palco
const CROP_MIN = 56; // menor lado da moldura, em pixels de tela
const CROP_MAX_ZOOM = 8;

// A moldura fica parada no centro do palco e a imagem se move por baixo dela.
// s = pixels de tela por pixel da imagem; tx/ty = deslocamento do centro da imagem em relação ao centro da moldura.
const CROP = {
  on: false, saving: false,
  x: null, src: '', img: null, iw: 0, ih: 0,
  ratio: 'orig', fw: 0, fh: 0, s: 1, tx: 0, ty: 0, base: 1,
  pointers: new Map(), drag: null, ro: null,
  stage: null, imgEl: null, frame: null,

  async open() {
    const x = LB.current();
    if (!x || this.on) return;
    const img = new Image();
    if (!x.o.url.startsWith('/')) img.crossOrigin = 'anonymous';
    img.src = x.o.url;
    try { await img.decode(); } catch { toast('Não consegui abrir essa imagem para edição.', 'error'); return; }
    const now = LB.current();
    if (!LB.open || !now || now.it.id !== x.it.id || now.idx !== x.idx) return; // fechou ou trocou de imagem enquanto carregava
    Object.assign(this, { on: true, saving: false, x, src: x.o.url, img, iw: img.naturalWidth, ih: img.naturalHeight, ratio: 'orig', drag: null });
    this.pointers.clear();
    LB.mode = 'crop';
    LB.sig = '';
    hideTip();
    this.mount();
  },

  mount() {
    const card = $('.lb-card', LB.el);
    card.innerHTML = `
      <div class="lb-stage crop-stage">
        <img class="crop-img" src="${esc(this.src)}" alt="" draggable="false">
        <div class="crop-frame">${['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => `<span class="ch ${d}" data-h="${d}"></span>`).join('')}</div>
      </div>
      <aside class="lb-side">
        <div class="lb-head">
          <span class="lb-model"><span>Cortar e ajustar</span></span>
          <button class="icon-btn" data-act="crop-reset" ${tip('Voltar ao original')}>${svg('undo')}</button>
          <button class="icon-btn" data-act="crop-cancel" ${tip('Cancelar (Esc)')}>${svg('x', 's20')}</button>
        </div>
        <div class="lb-scroll">
          <div class="lb-label"><span>Proporção</span></div>
          <div class="crop-ratios" id="crop-ratios" role="radiogroup" aria-label="Proporção do corte"></div>
          <div class="lb-label"><span>Zoom</span><span class="num" id="crop-zoom-val"></span></div>
          <div class="crop-zoom">
            <button class="icon-btn" data-act="crop-zoom-out" ${tip('Afastar')}>${svg('minus', 's16')}</button>
            <input class="range" id="crop-zoom" type="range" min="0" max="1000" step="1" aria-label="Zoom">
            <button class="icon-btn" data-act="crop-zoom-in" ${tip('Aproximar')}>${svg('plus', 's16')}</button>
          </div>
          <dl class="lb-facts">
            <div><dt>Original</dt><dd class="num">${this.iw} × ${this.ih} px</dd></div>
            <div><dt>Resultado</dt><dd class="num" id="crop-out"></dd></div>
          </dl>
          <p class="crop-hint">Arraste a imagem para reposicionar. Use a roda do mouse ou o controle acima para dar zoom.</p>
        </div>
        <div class="lb-foot">
          <div class="crop-buttons">
            <button class="btn line" data-act="crop-cancel">Cancelar</button>
            <button class="btn" id="crop-save" data-act="crop-save">Salvar versão</button>
          </div>
          <div class="lb-count">A imagem original continua na linha do tempo.</div>
        </div>
      </aside>`;
    this.stage = $('.crop-stage', card);
    this.imgEl = $('.crop-img', card);
    this.frame = $('.crop-frame', card);
    this.stage.addEventListener('pointerdown', (e) => this.down(e));
    this.stage.addEventListener('pointermove', (e) => this.move(e));
    this.stage.addEventListener('pointerup', (e) => this.up(e));
    this.stage.addEventListener('pointercancel', (e) => this.up(e));
    this.stage.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    $('#crop-zoom', card).addEventListener('input', (e) => this.zoomTo(this.scaleAt(Number(e.target.value) / 1000)));
    this.layout(true);
    this.ro = new ResizeObserver(() => { if (this.on) this.layout(false); });
    this.ro.observe(this.stage);
  },

  teardown() {
    if (!this.on) return;
    this.ro?.disconnect();
    Object.assign(this, { on: false, saving: false, ro: null, drag: null, x: null, img: null, stage: null, imgEl: null, frame: null });
    this.pointers.clear();
    LB.mode = 'view';
    LB.sig = '';
  },
  cancel() { this.teardown(); hideTip(); if (LB.open) LB.render(); },

  /* ---------- geometria ---------- */
  avail() {
    const r = this.stage.getBoundingClientRect();
    return { w: Math.max(CROP_MIN, r.width - 2 * CROP_MARGIN), h: Math.max(CROP_MIN, r.height - 2 * CROP_MARGIN) };
  },
  ratioValue() {
    if (this.ratio === 'orig') return this.iw / this.ih;
    if (this.ratio === 'free') return this.fw / this.fh;
    const [a, b] = this.ratio.split(':').map(Number);
    return a / b;
  },
  fitFrame(r) {
    const a = this.avail();
    const fw = Math.min(a.w, a.h * r);
    return { fw, fh: fw / r };
  },
  cover() { return Math.max(this.fw / this.iw, this.fh / this.ih); }, // menor escala em que a imagem preenche a moldura
  maxScale() { return Math.max(this.cover(), this.base * CROP_MAX_ZOOM); },
  scaleAt(v) { const lo = this.cover(); const hi = this.maxScale(); return lo * (hi / lo) ** Math.min(1, Math.max(0, v)); },

  layout(initial) {
    const a = this.avail();
    this.base = Math.min(a.w / this.iw, a.h / this.ih);
    if (initial) {
      Object.assign(this, this.fitFrame(this.iw / this.ih));
      this.s = this.cover(); this.tx = 0; this.ty = 0;
    } else {
      // a janela mudou de tamanho: mantém o mesmo recorte
      const old = this.fw;
      if (this.ratio === 'free') {
        const k = Math.min(1, a.w / this.fw, a.h / this.fh);
        this.fw *= k; this.fh *= k;
      } else Object.assign(this, this.fitFrame(this.ratioValue()));
      const k = this.fw / old;
      this.s *= k; this.tx *= k; this.ty *= k;
    }
    this.clamp();
    this.paint();
    this.paintRatios();
  },

  setRatio(key) {
    if (key === this.ratio) return;
    const z = this.s / this.cover();
    const before = this.s;
    this.ratio = key;
    if (key !== 'free') {
      Object.assign(this, this.fitFrame(this.ratioValue()));
      this.s = this.cover() * z;
      const k = this.s / before;
      this.tx *= k; this.ty *= k;
    }
    this.clamp();
    this.paint();
    this.paintRatios();
  },

  reset() {
    this.ratio = 'orig';
    this.layout(true);
  },

  clamp() {
    const lo = this.cover();
    this.s = Math.min(Math.max(this.s, lo), this.maxScale());
    const mx = Math.max(0, (this.iw * this.s - this.fw) / 2);
    const my = Math.max(0, (this.ih * this.s - this.fh) / 2);
    this.tx = Math.min(mx, Math.max(-mx, this.tx));
    this.ty = Math.min(my, Math.max(-my, this.ty));
  },

  // região da imagem original (em pixels dela) que está dentro da moldura
  rect() {
    const w = Math.min(this.iw, Math.max(1, Math.round(this.fw / this.s)));
    const h = Math.min(this.ih, Math.max(1, Math.round(this.fh / this.s)));
    const x = Math.round(this.iw / 2 - this.tx / this.s - this.fw / this.s / 2);
    const y = Math.round(this.ih / 2 - this.ty / this.s - this.fh / this.s / 2);
    return { x: Math.min(this.iw - w, Math.max(0, x)), y: Math.min(this.ih - h, Math.max(0, y)), w, h };
  },
  unchanged() { const r = this.rect(); return r.w === this.iw && r.h === this.ih; },

  /* ---------- desenho ---------- */
  paint() {
    if (!this.on) return;
    this.imgEl.style.width = `${this.iw * this.s}px`;
    this.imgEl.style.height = `${this.ih * this.s}px`;
    this.imgEl.style.transform = `translate(calc(-50% + ${this.tx}px), calc(-50% + ${this.ty}px))`;
    this.frame.style.width = `${this.fw}px`;
    this.frame.style.height = `${this.fh}px`;
    this.frame.classList.toggle('free', this.ratio === 'free');
    const r = this.rect();
    $('#crop-out').textContent = `${r.w} × ${r.h} px (${ratioLabel(r.w, r.h)})`;
    const lo = this.cover(); const hi = this.maxScale();
    const slider = $('#crop-zoom');
    slider.disabled = hi <= lo * 1.001;
    slider.value = slider.disabled ? 0 : Math.round(1000 * Math.log(this.s / lo) / Math.log(hi / lo));
    $('#crop-zoom-val').textContent = `${Math.round((this.s / lo) * 100)}%`;
    const save = $('#crop-save');
    save.disabled = this.saving || this.unchanged();
    save.innerHTML = this.saving ? '<span class="mini-spin"></span>Salvando…' : 'Salvar versão';
  },
  paintRatios() {
    if (!this.on) return;
    const opt = (key, label, glyph) => `<button class="ratio ${key === 'free' ? 'auto' : ''} ${this.ratio === key ? 'on' : ''} ${/^\d/.test(key) ? '' : 'wide'}" role="radio" aria-checked="${this.ratio === key}" data-act="crop-ratio" data-v="${key}" aria-label="${esc(label)}"><span class="g">${glyph}</span><span class="t num">${esc(label)}</span></button>`;
    const own = this.iw >= this.ih ? `<i style="width:16px;height:${Math.max(4, Math.round(16 * this.ih / this.iw))}px"></i>` : `<i style="width:${Math.max(4, Math.round(16 * this.iw / this.ih))}px;height:16px"></i>`;
    $('#crop-ratios').innerHTML = opt('orig', 'Original', own) + opt('free', 'Livre', ratioGlyph('auto', 16)) + CROP_RATIOS.map((r) => opt(r, r, ratioGlyph(r, 16))).join('');
  },

  /* ---------- zoom e arraste ---------- */
  // px/py: ponto (relativo ao centro da moldura) que fica parado enquanto o zoom muda
  zoomTo(s, px = 0, py = 0) {
    const ns = Math.min(this.maxScale(), Math.max(this.cover(), s));
    const ux = (px - this.tx) / this.s; const uy = (py - this.ty) / this.s;
    this.s = ns; this.tx = px - ux * ns; this.ty = py - uy * ns;
    this.clamp();
    this.paint();
  },
  point(cx, cy) {
    const r = this.stage.getBoundingClientRect();
    return { x: cx - (r.left + r.width / 2), y: cy - (r.top + r.height / 2) };
  },
  wheel(e) {
    e.preventDefault();
    let d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (e.ctrlKey) d *= 4; // gesto de pinça no trackpad
    const p = this.point(e.clientX, e.clientY);
    this.zoomTo(this.s * Math.exp(-d * 0.0016), p.x, p.y);
  },
  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const handle = e.target.closest('.ch');
    this.stage.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (handle && this.ratio === 'free') {
      const p = this.point(e.clientX, e.clientY);
      this.drag = { type: 'handle', dir: handle.dataset.h, ox: this.fw / 2 - Math.abs(p.x), oy: this.fh / 2 - Math.abs(p.y), s: this.s, tx: this.tx, ty: this.ty };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: this.s };
    } else {
      this.drag = { type: 'pan', x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty };
      this.stage.classList.add('grabbing');
    }
  },
  move(e) {
    const d = this.drag;
    if (!d || !this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.type === 'pan') {
      this.tx = d.tx + e.clientX - d.x;
      this.ty = d.ty + e.clientY - d.y;
      this.clamp();
      this.paint();
    } else if (d.type === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const mid = this.point((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.zoomTo(d.s * Math.hypot(a.x - b.x, a.y - b.y) / d.d, mid.x, mid.y);
    } else if (d.type === 'handle') {
      // a moldura cresce ou encolhe a partir do centro
      const p = this.point(e.clientX, e.clientY);
      const a = this.avail();
      if (/[ew]/.test(d.dir)) this.fw = Math.min(a.w, Math.max(CROP_MIN, (Math.abs(p.x) + d.ox) * 2));
      if (/[ns]/.test(d.dir)) this.fh = Math.min(a.h, Math.max(CROP_MIN, (Math.abs(p.y) + d.oy) * 2));
      this.s = d.s; this.tx = d.tx; this.ty = d.ty; // parte sempre do estado inicial, para a imagem não "escorregar"
      this.clamp();
      this.paint();
    }
  },
  up(e) {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size === 1 && this.drag?.type === 'pinch') {
      const [p] = [...this.pointers.values()];
      this.drag = { type: 'pan', x: p.x, y: p.y, tx: this.tx, ty: this.ty };
    } else if (!this.pointers.size) {
      this.drag = null;
      this.stage?.classList.remove('grabbing');
    }
  },
  key(e) {
    if (e.key === 'Escape') { e.preventDefault(); this.cancel(); return; }
    if (e.target.matches?.('input')) return; // o controle de zoom já usa as setas
    const step = e.shiftKey ? 1 : 12;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); this.tx += moves[e.key][0]; this.ty += moves[e.key][1]; this.clamp(); this.paint(); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomTo(this.s * 1.15); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoomTo(this.s / 1.15); }
  },

  /* ---------- salvar ---------- */
  async save() {
    if (this.saving || this.unchanged()) return;
    const { x, img, src } = this;
    const r = this.rect();
    this.saving = true;
    this.paint();
    try {
      const c = document.createElement('canvas');
      c.width = r.w; c.height = r.h;
      c.getContext('2d').drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const type = /\.jpe?g($|\?)/i.test(src) ? 'image/jpeg' : /\.webp($|\?)/i.test(src) ? 'image/webp' : 'image/png';
      const blob = await new Promise((res) => c.toBlob(res, type, 0.95));
      if (!blob) throw new Error('O navegador não conseguiu gerar a imagem cortada.');
      const out = await api(`/api/items/${x.it.id}/edits`, { method: 'POST', raw: blob, headers: { 'Content-Type': blob.type } });
      this.teardown();
      upsertBatch(out.batch);
      if (LB.open) LB.select(out.itemId, 0);
      toast('Versão cortada salva', 'ok');
    } catch (err) {
      this.saving = false;
      this.paint();
      toast(err.name === 'SecurityError' ? 'Não dá para editar essa imagem porque ela não está salva neste computador.' : err.message, 'error');
    }
  },
};

/* ================================================================== */
/* Saldo                                                               */
/* ================================================================== */

function setBalance(b) {
  if (!b) return;
  const prev = S.balance?.value;
  S.balance = b;
  S.balanceLoading = false;
  renderBalance();
  if (prev != null && b.value != null && b.value < prev - 0.0001) {
    const d = document.createElement('span');
    d.className = 'delta num';
    d.textContent = `−${cost(prev - b.value)}`;
    $('#balance').appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }
}

function renderBalance() {
  const el = $('#balance');
  if (!S.config.hasKey) {
    el.className = 'balance connect';
    el.dataset.act = 'open-settings';
    el.innerHTML = `${svg('key', 's16')}<span>Conectar Atlas Cloud</span>`;
    el.dataset.tip = 'Adicione sua API key';
    return;
  }
  el.dataset.act = 'refresh-balance';
  const v = S.balance.value;
  const low = v != null && v < 1;
  el.className = `balance${S.balanceLoading ? ' loading' : ''}${S.balance.error && v == null ? ' warn' : ''}${low ? ' low' : ''}`;
  el.innerHTML = `<span class="dot"></span><span class="val">${v == null ? '—' : moneyHTML(v)}</span>`;
  el.dataset.tip = S.balance.error ? S.balance.error : low ? 'Saldo baixo no Atlas Cloud: recarregue para continuar gerando' : 'Saldo no Atlas Cloud';
  el.setAttribute('aria-label', `Saldo ${v == null ? 'indisponível' : money(v)}`);
}

async function refreshBalance() {
  S.balanceLoading = true; renderBalance();
  try { setBalance(await api('/api/balance?force=1')); } catch (e) { S.balanceLoading = false; renderBalance(); toast(e.message, 'error'); }
}

/* ================================================================== */
/* Configurações                                                       */
/* ================================================================== */

const SET = { open: false, filter: 'all', q: '', el: null, saveT: null };

function openSettings(focusKey = false) {
  if (SET.open) return;
  SET.open = true;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="scrim" data-act="close-settings"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Configurações">
      <div class="drawer-head"><h2>Configurações</h2><button class="icon-btn" data-act="close-settings" ${tip('Fechar (Esc)')}>${svg('x', 's20')}</button></div>
      <div class="drawer-body">
        <div class="field-title"><span>API key do Atlas Cloud</span><a href="https://www.atlascloud.ai/console/api-keys" target="_blank" rel="noopener">Pegar chave ${svg('external', 's14')}</a></div>
        <form class="keybox" id="key-form" autocomplete="off">
          <input class="input" id="key-input" type="password" spellcheck="false" placeholder="${esc(S.config.keyHint || 'Cole sua chave aqui')}">
          <button type="button" class="icon-btn" data-act="toggle-key" ${tip('Mostrar')} style="height:40px;width:40px">${svg('eye')}</button>
          <button type="submit" class="btn">Salvar</button>
        </form>
        <div class="key-status" id="key-status"></div>
        <div class="field-title"><span>Moeda dos valores</span></div>
        <div class="seg currency-seg" id="currency-seg" role="radiogroup" aria-label="Moeda dos valores"></div>
        <div class="key-status" id="fx-status"></div>
        <div class="field-title"><span>Biblioteca de referências</span><span class="lib-count" id="lib-count"></span></div>
        <div class="lib-set" id="lib-set"></div>
        <div class="field-title"><span id="mlist-title">Modelos no painel</span><button class="icon-btn" data-act="reload-models" ${tip('Atualizar catálogo do Atlas Cloud')} style="width:30px;height:30px">${svg('refresh', 's16')}</button></div>
        <div class="model-tools">
          <label class="search">${svg('search', 's16')}<input class="input" id="model-search" placeholder="Buscar" value="${esc(SET.q)}"></label>
          <div class="seg" id="model-filter"></div>
        </div>
        <div class="mlist" id="mlist"></div>
        <div class="data-dir">${svg('folder', 's16')}<code>${esc(S.config.dataDir || '')}</code><button class="icon-btn" data-act="open-folder" ${tip('Abrir a pasta onde ficam os arquivos gerados')} style="width:30px;height:30px">${svg('external', 's14')}</button><button class="icon-btn" data-act="copy-path" ${tip('Copiar caminho')} style="width:30px;height:30px">${svg('copy', 's14')}</button></div>
        <div class="agents" id="agents"></div>
        <div class="quit-row">
          <div><b>${S.config.background ? 'Rodando em segundo plano' : 'Rodando na janela do terminal'}</b>
          <span>${S.config.background ? 'O Gerador continua ligado mesmo com esta aba fechada, e as gerações em andamento terminam normalmente.' : 'Para encerrar, feche a janela do terminal ou use o botão ao lado.'}</span></div>
          <button class="btn line" data-act="quit">${svg('power', 's16')}Encerrar</button>
        </div>
      </div>
    </aside>`;
  document.body.appendChild(wrap);
  SET.el = wrap;
  renderKeyStatus();
  renderCurrency();
  renderLibrarySettings();
  renderModelList();
  renderAgents();
  $('#agents').addEventListener('change', (e) => {
    if (e.target.matches('#mcp-call, #mcp-day')) saveAgents({ maxPerCall: usdInput($('#mcp-call').value), maxPerDay: usdInput($('#mcp-day').value) });
  });
  $('#model-search').addEventListener('input', (e) => { SET.q = e.target.value; renderModelList(); });
  $('#key-form').addEventListener('submit', (e) => { e.preventDefault(); saveKey(); });
  setTimeout(() => (focusKey || !S.config.hasKey ? $('#key-input') : $('#model-search'))?.focus(), 60);
}

function closeSettings() {
  if (!SET.open) return;
  SET.open = false;
  SET.el?.remove();
  SET.el = null;
  hideTip();
}

/* ---------- moeda ---------- */

const rateFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });

function renderCurrency() {
  const box = $('#currency-seg');
  if (!box) return;
  const cur = currencyMode();
  box.innerHTML = [['usd', 'Dólar', 'Como o Atlas Cloud cobra'], ['brl', 'Real', 'Tudo convertido para reais'], ['both', 'Os dois', 'Dólar e, entre parênteses, o valor em reais']]
    .map(([k, label, hint]) => `<button class="${cur === k ? 'on' : ''}" role="radio" aria-checked="${cur === k}" data-act="currency" data-v="${k}" ${tip(hint)}>${label}</button>`).join('');
  const fx = S.config.fx;
  $('#fx-status').textContent = cur === 'usd' || !fx
    ? 'O Atlas Cloud cobra em dólar. Em reais, os valores são convertidos pela cotação do dia.'
    : `Cotação usada: ${rateFmt.format(fx.rate)} por dólar (${fx.source}, ${new Date(fx.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}). É a cotação comercial: ao recarregar o saldo, o cartão ainda cobra IOF e taxas.`;
}

// Redesenha tudo o que mostra dinheiro
function refreshMoney() {
  renderBalance();
  renderComposer();
  renderTimeline();
  if (SET.open) { renderCurrency(); renderModelList(); renderAgents(); renderKeyStatus(); }
}

async function setCurrency(value) {
  try {
    const r = await api('/api/config', { method: 'PUT', body: { currency: value } });
    S.config = { ...S.config, ...r.config };
    if (!r.ok && r.error) toast(r.error, 'error');
  } catch (e) { toast(e.message, 'error'); }
  refreshMoney();
}

/* ---------- agentes de IA (MCP) ---------- */

const usdInput = (s) => { const n = parseFloat(String(s).replace(/[^\d.,]/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };

// A mesma conta do servidor: o que terminou vale o custo real; o que está gerando, a previsão
function agentSpentToday() {
  const today = dayKey(Date.now());
  let sum = 0;
  for (const b of S.batches.values()) {
    if (b.via !== 'mcp' || dayKey(b.createdAt) !== today) continue;
    for (const it of b.items) {
      if (it.edited || it.status === 'failed') continue;
      sum += (it.status === 'done' ? it.cost : it.unitPrice) || 0;
    }
  }
  return sum;
}

function renderAgents() {
  const box = $('#agents');
  if (!box) return;
  const m = S.config.mcp || { enabled: false, maxPerCall: 0, maxPerDay: 0 };
  const cmd = `node "${m.script || 'mcp.js'}"`;
  const url = `${location.origin}/mcp`;
  const num = (v) => (v > 0 ? String(v).replace('.', ',') : '');
  const line = (value) => `<div class="copy-line"><code>${esc(value)}</code><button class="icon-btn" data-act="copy-text" data-text="${esc(value)}" ${tip('Copiar')}>${svg('copy', 's14')}</button></div>`;
  box.innerHTML = `
    <div class="agents-head" data-act="mcp-toggle" role="switch" aria-checked="${!!m.enabled}" tabindex="0">
      <div><b>Agentes de IA (MCP)</b><span>Deixa os agentes de IA deste computador gerarem imagens, vídeos e áudios pelo Gerador, com os modelos ligados acima e o seu saldo.</span></div>
      <span class="switch ${m.enabled ? 'on' : ''}"></span>
    </div>
    ${m.enabled ? `
    <div class="agents-limits">
      <label>Limite por geração<span class="usd">US$<input class="input" id="mcp-call" inputmode="decimal" autocomplete="off" placeholder="sem limite" value="${num(m.maxPerCall)}"></span></label>
      <label>Limite por dia<span class="usd">US$<input class="input" id="mcp-day" inputmode="decimal" autocomplete="off" placeholder="sem limite" value="${num(m.maxPerDay)}"></span></label>
    </div>
    <div class="agents-note" id="agents-note">Hoje os agentes gastaram ${money(agentSpentToday())}. Campo vazio = sem limite.</div>
    <div class="agents-auto">
      <div><b>Conectar ao Claude e ao ChatGPT</b><span>Registra o Gerador no Claude Desktop, no Claude Code, no ChatGPT para desktop (Codex) e no Cursor que estiverem instalados. Guarda uma cópia de cada configuração antes de mexer.</span></div>
      <button class="btn line" data-act="mcp-connect">${svg('bot', 's16')}Conectar agora</button>
    </div>
    <div class="agents-results" id="agents-results">${agentResultsHTML()}</div>
    <details class="agents-conn">
      <summary>Conectar outro agente à mão</summary>
      <span>Registre nele este comando:</span>
      ${line(cmd)}
      <span>Ou, nos agentes que conectam por endereço (HTTP):</span>
      ${line(url)}
    </details>` : ''}`;
}

let agentResults = null; // resultado da última tentativa de conectar
function agentResultsHTML() {
  if (!agentResults) return '';
  return agentResults.map((r) => `<div class="ares ${r.status}">${svg(r.status === 'conectado' || r.status === 'ja' ? 'check' : r.status === 'erro' ? 'alert' : 'minus', 's14')}<span><b>${esc(r.app)}</b>: ${esc(r.label)}${r.detail ? `. ${esc(r.detail)}` : ''}</span></div>`).join('');
}

async function connectAgents(btn) {
  btn.disabled = true;
  try {
    const r = await api('/api/mcp/connect', { method: 'POST', body: {} });
    agentResults = r.results;
    const n = agentResults.filter((x) => x.status === 'conectado').length;
    toast(n ? `Gerador conectado a ${n} ${n > 1 ? 'agentes' : 'agente'}` : 'Nada novo para conectar', n ? 'ok' : '');
  } catch (e) { toast(e.message, 'error'); }
  btn.disabled = false;
  const box = $('#agents-results');
  if (box) box.innerHTML = agentResultsHTML();
}

// rerender: só ao ligar ou desligar. Ao mudar um limite a tela fica como está, para não tirar o foco do campo.
async function saveAgents(patch, rerender = false) {
  S.config.mcp = { ...S.config.mcp, ...patch };
  if (rerender) renderAgents();
  try {
    const r = await api('/api/config', { method: 'PUT', body: { mcp: patch } });
    S.config = { ...S.config, ...r.config };
  } catch (e) { toast(e.message, 'error'); }
}

function renderKeyStatus(msg, kind) {
  const el = $('#key-status');
  if (!el) return;
  if (msg) { el.className = `key-status ${kind || ''}`; el.innerHTML = msg; return; }
  if (!S.config.hasKey) { el.className = 'key-status'; el.textContent = 'Crie uma conta no Atlas Cloud, gere uma API key em "Pegar chave" e cole aqui. Ela fica salva só neste computador.'; return; }
  if (S.balance.error) { el.className = 'key-status err'; el.innerHTML = `${svg('alert', 's14')}${esc(S.balance.error)}`; return; }
  el.className = 'key-status ok';
  el.innerHTML = `${svg('check', 's14')}Conectado${S.balance.value != null ? `, saldo ${money(S.balance.value)}` : ''}`;
}

async function saveKey() {
  const input = $('#key-input');
  const key = input.value.trim();
  if (!key) { input.focus(); return; }
  renderKeyStatus('<span class="mini-spin"></span>Verificando…');
  try {
    const r = await api('/api/config', { method: 'PUT', body: { apiKey: key } });
    S.config = r.config;
    if (r.balance) setBalance(r.balance);
    if (r.ok) {
      input.value = '';
      input.placeholder = S.config.keyHint;
      renderKeyStatus();
      toast('Conectado ao Atlas Cloud', 'ok');
    } else {
      renderKeyStatus(`${svg('alert', 's14')}${esc(r.error || 'Não consegui validar a chave.')}`, 'err');
    }
    renderBalance(); renderGo();
  } catch (e) {
    renderKeyStatus(`${svg('alert', 's14')}${esc(e.message)}`, 'err');
  }
}

function renderModelList() {
  const box = $('#mlist');
  if (!box) return;
  // a lista acompanha a aba aberta: modelos de imagem ou de vídeo
  const video = S.tab === 'video';
  const audio = S.tab === 'audio';
  const all = audio ? S.afamilies : video ? S.vfamilies : S.families;
  const loaded = audio ? S.acatalogLoaded : video ? S.vcatalogLoaded : S.catalogLoaded;
  const on = new Set((audio ? S.config.enabledAudio : video ? S.config.enabledVideo : S.config.enabled) || []);
  $('#mlist-title').textContent = audio ? 'Modelos de áudio no painel' : video ? 'Modelos de vídeo no painel' : 'Modelos de imagem no painel';
  $('#model-filter').innerHTML = `<button class="${SET.filter === 'all' ? 'on' : ''}" data-act="mfilter" data-v="all">Todos</button><button class="${SET.filter === 'on' ? 'on' : ''}" data-act="mfilter" data-v="on">Ativos ${on.size}</button>`;
  if (!loaded) { box.innerHTML = '<div class="key-status"><span class="mini-spin"></span>Carregando catálogo…</div>'; return; }
  if (!all.length) { box.innerHTML = `<div class="key-status err">${svg('alert', 's14')}${esc((audio ? S.acatalogError : video ? S.vcatalogError : S.catalogError) || 'Catálogo vazio.')}</div>`; return; }
  const q = SET.q.trim().toLowerCase();
  let list = all.filter((f) => (SET.filter === 'on' ? on.has(f.key) : true));
  if (q) list = list.filter((f) => `${f.name} ${f.provider} ${providerName(f)} ${f.key}`.toLowerCase().includes(q));
  if (!list.length) { box.innerHTML = '<div class="key-status">Nenhum modelo encontrado.</div>'; return; }
  // agrupa pelo nome exibido: o catálogo usa nomes diferentes para o mesmo provider ("KUAISHOU" e "KWAIVGI")
  list = list.map((f) => ({ f, p: providerName(f) })).sort((a, b) => a.p.localeCompare(b.p) || a.f.name.localeCompare(b.f.name, undefined, { numeric: true }));
  let html = '';
  let group = null;
  for (const { f, p } of list) {
    if (p !== group) { group = p; html += `<div class="mgroup">${esc(p)}</div>`; }
    const row = audio ? aModelRow(f) : video ? vModelRow(f) : imageModelRow(f);
    html += `<div class="mrow ${row.unusable ? 'unusable' : ''}" data-act="toggle-enabled" data-key="${esc(f.key)}" role="switch" aria-checked="${on.has(f.key)}" tabindex="0">
      ${avatarHTML(f.key, f.name, f.avatar)}
      <div class="mname"><b>${esc(f.name)}</b><span>${row.sub}</span></div>
      <span class="switch ${on.has(f.key) ? 'on' : ''}"></span>
    </div>`;
  }
  box.innerHTML = html;
}

function imageModelRow(f) {
  const price = famPrice(f);
  const caps = [f.variants.t2i?.caps, f.variants.edit?.caps].filter(Boolean);
  const unusable = caps.length && caps.every((c) => c.known && !c.usable);
  const kinds = `${f.variants.t2i ? `<span ${tip('Gera a partir de texto')}>${svg('type', 's14')}</span>` : ''}${f.variants.edit || f.variants.t2i?.caps?.acceptsImages ? `<span ${tip('Aceita imagem de referência')}>${svg('image', 's14')}</span>` : ''}`;
  return { unusable, sub: `<span class="kinds">${kinds}</span>${unusable ? 'Pede campos que o app não preenche' : price != null ? `${cost(price)} por imagem` : ''}` };
}

function toggleEnabled(key) {
  const field = S.tab === 'audio' ? 'enabledAudio' : S.tab === 'video' ? 'enabledVideo' : 'enabled';
  const list = [...(S.config[field] || [])];
  const i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1); else list.push(key);
  S.config[field] = list;
  if (i < 0 && !cur().families.length) cur().families = [key];
  renderModelList(); renderModels(); renderSegs(); renderGo();
  if (S.tab === 'audio') renderAOpts();
  saveCur();
  clearTimeout(SET.saveT);
  SET.saveT = setTimeout(async () => {
    try {
      const r = await api('/api/config', { method: 'PUT', body: { [field]: S.config[field] } });
      for (const f of r.families || []) { S.fam.set(f.key, f); const j = S.families.findIndex((x) => x.key === f.key); if (j >= 0) S.families[j] = f; }
      for (const f of r.videoFamilies || []) { S.vfam.set(f.key, f); const j = S.vfamilies.findIndex((x) => x.key === f.key); if (j >= 0) S.vfamilies[j] = f; }
      for (const f of r.audioFamilies || []) { S.afam.set(f.key, f); const j = S.afamilies.findIndex((x) => x.key === f.key); if (j >= 0) S.afamilies[j] = f; }
      renderModels(); renderGo(); renderModelList();
      if (S.tab === 'audio') renderAOpts();
    } catch (e) { toast(e.message, 'error'); }
  }, 350);
}

async function loadModels() {
  try {
    const r = await api('/api/models');
    S.families = r.families || [];
    S.fam = new Map(S.families.map((f) => [f.key, f]));
    if (Array.isArray(r.enabled)) S.config.enabled = r.enabled;
    S.catalogError = !S.families.length ? (r.error || 'Catálogo vazio.') : null;
  } catch (e) {
    S.catalogError = e.message;
  }
  S.catalogLoaded = true;
  if (!S.c.families.length && S.config.enabled.length) S.c.families = [S.config.enabled[0]];
  renderModels(); renderSegs(); renderGo();
  if (SET.open) renderModelList();
}

/* ================================================================== */
/* Popover "outro modelo"                                              */
/* ================================================================== */

let popEl = null;
function closePop() { popEl?.remove(); popEl = null; }
function openRedoOther(btn, b) {
  closePop();
  const video = b.kind === 'video';
  const audio = b.kind === 'audio';
  const hasRefs = b.refs?.length > 0;
  const list = audio ? aEnabled(b.mode) : video ? vEnabled() : enabledFamilies();
  if (!list.length) return openSettings();
  popEl = document.createElement('div');
  popEl.className = 'pop';
  popEl.setAttribute('role', 'menu');
  popEl.innerHTML = list.map((f) => {
    // nos áudios a própria família já traz o preço e se dá para usar
    const v = audio ? (f.caps && !f.caps.usable ? null : { price: null }) : video ? vPick(f, b.mode, vNeedOf(b)) : pickVariant(f, hasRefs);
    return `<button role="menuitem" data-act="pop-redo" data-key="${esc(f.key)}" data-batch="${b.id}" ${v ? '' : 'disabled'}>${avatarHTML(f.key, f.name, f.avatar)}<span>${esc(f.name)}</span><span class="price num">${v?.price != null ? `${cost(v.price)}${video ? '/s' : ''}` : ''}</span></button>`;
  }).join('');
  document.body.appendChild(popEl);
  const r = btn.getBoundingClientRect();
  const pw = popEl.offsetWidth; const ph = popEl.offsetHeight;
  let left = Math.min(r.right - pw, window.innerWidth - pw - 8);
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
  popEl.style.left = `${Math.max(8, left)}px`;
  popEl.style.top = `${Math.max(8, top)}px`;
  popEl.querySelector('button:not([disabled])')?.focus();
}

/* ---------- ferramentas de um clique (aumentar resolução, remover fundo, vídeo falante) ---------- */

const TOOL_LABEL = { upscale: 'Aumentar resolução', rembg: 'Remover fundo', vupscale: 'Aumentar resolução', avatar: 'Vídeo falante', lipsync: 'Sincronizar a boca' };
const TOOL_ICON = { upscale: 'maximize', rembg: 'eraser', vupscale: 'maximize', avatar: 'film', lipsync: 'film' };
let toolCache = null;
async function toolModels(tool) {
  if (!toolCache || Date.now() - toolCache.at > 5 * 60e3) toolCache = { at: Date.now(), data: await api('/api/tools') };
  return (toolCache.data[tool] || []).filter((m) => m.usable);
}

// Mostra os modelos que fazem a ferramenta, com o preço, para o usuário escolher
async function openToolPop(btn, tool, itemId, idx, extra = '') {
  closePop();
  let list;
  try { list = await toolModels(tool); } catch (e) { toast(e.message, 'error'); return; }
  if (!list.length) { toast('O Atlas Cloud não tem um modelo disponível para isso agora', 'error'); return; }
  if (!btn.isConnected) return;
  popEl = document.createElement('div');
  popEl.className = 'pop top';
  popEl.setAttribute('role', 'menu');
  popEl.innerHTML = `<div class="pop-title">${esc(TOOL_LABEL[tool])}: escolha o modelo</div>${list.map((m) => `<button role="menuitem" data-act="pop-tool" data-tool="${tool}" data-model="${esc(m.id)}" data-item="${esc(itemId)}" data-idx="${idx}" data-extra="${esc(extra)}">${avatarHTML(m.id, m.name, m.avatar)}<span>${esc(m.name)}</span><span class="price num">${m.price != null ? `${cost(m.price)}${tool === 'upscale' || tool === 'rembg' ? '' : '/s'}` : ''}</span></button>`).join('')}`;
  document.body.appendChild(popEl);
  const r = btn.getBoundingClientRect();
  const pw = popEl.offsetWidth; const ph = popEl.offsetHeight;
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 6;
  popEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pw - 8))}px`;
  popEl.style.top = `${Math.max(8, top)}px`;
  popEl.querySelector('button')?.focus();
}

async function runTool(tool, model, itemId, idx, extra) {
  try {
    const nb = await api(`/api/items/${itemId}/tool`, { method: 'POST', body: { tool, model, index: idx, extra: extra || undefined } });
    upsertBatch(nb);
    const where = kindOf(nb) === S.tab ? 'no topo da linha do tempo' : `na aba ${kindOf(nb) === 'video' ? 'Vídeos' : 'Imagens'}`;
    toast(`${TOOL_LABEL[tool]}: o resultado aparece ${where}`, 'ok');
    if (!LB.open && kindOf(nb) === S.tab) $('#stream').scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { toast(e.message, 'error'); }
}

// Lote feito por uma ferramenta: mostra o que ela fez em vez de proporção, qualidade e afins
function toolMeta(b) {
  const parts = [`<span class="m">${svg(TOOL_ICON[b.tool] || 'wand', 's14')}${esc(TOOL_LABEL[b.tool] || b.prompt)}</span>`];
  const it = b.items[0];
  if (it) parts.push(`<span class="m">${avatarHTML(it.family, it.familyName, it.avatar)}${esc(it.familyName)}</span>`);
  const thumb = b.toolRefs?.image;
  if (thumb) parts.push(`<span class="m refs-mini" ${tip('Imagem de entrada')}><img src="${esc(thumb.url)}" alt=""></span>`);
  if (b.toolRefs?.audio) parts.push(`<span class="m" ${tip('Áudio de entrada')}>${svg('wave', 's14')}</span>`);
  if (b.via === 'mcp') parts.push(agentMark(b));
  const running = b.items.some((i) => i.status === 'running' || i.status === 'queued');
  const done = b.items.filter((i) => i.status === 'done' && i.cost != null);
  const est = done.some((i) => i.costEstimated);
  if (done.length || running) parts.push(`<span class="m cost" ${tip(est ? COST_TIP_EST : COST_TIP)}>${running ? '<span class="mini-spin"></span>' : ''}${done.length ? `${est ? '≈ ' : ''}${costHTML(done.reduce((a, i) => a + i.cost, 0))}` : ''}</span>`);
  return parts.join('');
}

// Vídeo falante a partir de um áudio: o usuário escolhe a foto (avatar) ou o vídeo (lip-sync)
let toolFileFor = null;
async function toolFilePicked(file) {
  const ctx = toolFileFor;
  toolFileFor = null;
  if (!file || !ctx) return;
  const video = file.type.startsWith('video/');
  if (!video && !file.type.startsWith('image/')) { toast('Escolha uma foto ou um vídeo', 'error'); return; }
  toast('Enviando o arquivo…');
  try {
    const ref = await api('/api/refs', { method: 'POST', raw: file, headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name || 'arquivo') } });
    const btn = document.querySelector(`.tile.audio[data-item="${ctx.itemId}"][data-idx="${ctx.idx}"] [data-act="a-avatar"]`) || $('#go');
    openToolPop(btn, video ? 'lipsync' : 'avatar', ctx.itemId, ctx.idx, ref.id);
  } catch (e) { toast(e.message, 'error'); }
}

/* ================================================================== */
/* Tooltip e toast                                                     */
/* ================================================================== */

let tipEl = null; let tipTarget = null; let tipTimer = null;
function hideTip() { clearTimeout(tipTimer); tipEl?.remove(); tipEl = null; tipTarget = null; }
function showTip(t) {
  const text = t.dataset.tip;
  if (!text || !document.body.contains(t)) return;
  tipEl = document.createElement('div');
  tipEl.className = `tip${text.length > 48 || text.includes('\n') ? ' wrap' : ''}`;
  tipEl.style.whiteSpace = text.includes('\n') ? 'pre-line' : '';
  tipEl.textContent = text;
  document.body.appendChild(tipEl);
  const r = t.getBoundingClientRect();
  const w = tipEl.offsetWidth; const h = tipEl.offsetHeight;
  let top = r.top - h - 8;
  if (top < 6) top = r.bottom + 8;
  const left = Math.min(window.innerWidth - w - 6, Math.max(6, r.left + r.width / 2 - w / 2));
  tipEl.style.top = `${top}px`;
  tipEl.style.left = `${left}px`;
}
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest('[data-tip]');
  if (t === tipTarget) return;
  hideTip();
  if (!t) return;
  tipTarget = t;
  tipTimer = setTimeout(() => showTip(t), 380);
});
document.addEventListener('mousedown', hideTip);
document.addEventListener('scroll', hideTip, true);

function toast(msg, kind = '', action) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  t.innerHTML = `${kind === 'error' ? svg('alert', 's16') : kind === 'ok' ? svg('check', 's16') : ''}<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.run(); t.remove(); };
    t.appendChild(b);
  }
  box.appendChild(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 220); }, kind === 'error' ? 5200 : 2400);
}

/* ================================================================== */
/* Eventos                                                             */
/* ================================================================== */

let lastChip = {};
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  // clicar na imagem ampliada da biblioteca não fecha o painel de escolha que ficou atrás
  if (popEl && !e.target.closest('.pop') && !e.target.closest('.lib-view') && !['redo-other', 'tool', 'lib-open'].includes(t?.dataset.act)) closePop();
  if (!t) return;
  const act = t.dataset.act;
  const art = t.closest('.batch');
  const b = art ? S.batches.get(art.dataset.id) : null;

  switch (act) {
    case 'add-ref': $('#file-input').click(); break;
    case 'rm-ref': S.c.refs.splice(Number(t.dataset.i), 1); renderRefs(); renderModels(); renderGo(); saveComposer(); hideTip(); break;
    case 'tab': switchTab(t.dataset.v); break;
    case 'clear-prompt': cur().prompt = ''; renderComposer(); saveCur(); $('#prompt').focus(); break;
    case 'toggle-model': {
      const k = t.dataset.key;
      const now = performance.now();
      if (lastChip.key === k && now - lastChip.t < 400) { S.c.families = [k]; lastChip = {}; }
      else { S.c.families = S.c.families.includes(k) ? S.c.families.filter((x) => x !== k) : [...S.c.families, k]; lastChip = { key: k, t: now }; }
      renderModels(); renderSegs(); renderGo(); saveComposer();
      break;
    }
    case 'ratio': S.c.ratio = t.dataset.v; renderRatios(); saveComposer(); break;
    case 'tier': S.c.tier = Number(t.dataset.v); renderSegs(); saveComposer(); break;
    case 'count': S.c.count = Number(t.dataset.v); renderSegs(); renderGo(); saveComposer(); break;
    case 'generate': generate(); break;
    case 'open-settings': openSettings(); break;
    case 'close-settings': closeSettings(); break;
    case 'refresh-balance': refreshBalance(); break;
    case 'reload-models':
      S.catalogLoaded = false; S.vcatalogLoaded = false; S.acatalogLoaded = false; renderModels(); renderModelList();
      try { await api('/api/models/refresh', { method: 'POST' }); } catch { /* segue */ }
      await Promise.all([loadModels(), loadVModels(), loadAModels()]);
      break;
    case 'toggle-key': {
      const i = $('#key-input');
      i.type = i.type === 'password' ? 'text' : 'password';
      t.innerHTML = svg(i.type === 'password' ? 'eye' : 'eyeOff');
      break;
    }
    case 'copy-path': navigator.clipboard.writeText(S.config.dataDir || '').then(() => toast('Caminho copiado')); break;
    case 'copy-text': navigator.clipboard.writeText(t.dataset.text || '').then(() => toast('Copiado')); break;
    case 'open-folder': try { await api('/api/open-folder', { method: 'POST', body: {} }); } catch (err) { toast(err.message, 'error'); } break;
    case 'mcp-toggle': saveAgents({ enabled: !S.config.mcp?.enabled }, true); break;
    case 'mcp-connect': connectAgents(t); break;
    case 'currency': setCurrency(t.dataset.v); break;
    case 'lib-open': if (popEl && popEl.classList.contains('lib-pop') && LIB.btn === t) closePop(); else openLibrary(t, t.dataset.slot); break;
    case 'lib-pick': libraryUse(t.dataset.id); break;
    case 'lib-zoom': openLibraryView(t.dataset.id, !!t.closest('.lib-pop')); break;
    case 'lib-view-go': libraryViewGo(Number(t.dataset.d)); break;
    case 'lib-view-use': libraryUse(LIBVIEW.id); break;
    case 'lib-view-close': closeLibraryView(); break;
    case 'lib-toggle': e.stopPropagation(); if (inLibrary(t.dataset.id)) await libraryRemove(t.dataset.id); else if (await libraryAdd(t.dataset.id)) toast('Guardada na biblioteca', 'ok'); break;
    case 'lib-remove': await libraryRemove(t.dataset.id); break;
    case 'lib-upload': $('#lib-file').click(); break;
    case 'lib-manage': closePop(); openSettings(); setTimeout(() => $('#lib-set')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120); break;
    case 'lib-save-output': {
      try {
        const ref = await api('/api/refs/from-output', { method: 'POST', body: { itemId: t.dataset.item, index: Number(t.dataset.idx) || 0 } });
        if (inLibrary(ref.id)) toast('Essa imagem já está na biblioteca');
        else if (await libraryAdd(ref.id)) toast('Guardada na biblioteca de referências', 'ok');
      } catch (err) { toast(err.message, 'error'); }
      break;
    }
    case 'quit': {
      const busy = [...S.batches.values()].some((x) => x.items.some((i) => i.status === 'running' || i.status === 'queued'));
      armConfirm(t, async () => {
        try { await api('/api/quit', { method: 'POST', body: {} }); showStopped(); } catch (err) { toast(err.message, 'error'); }
      }, busy ? 'Há geração em andamento. Encerrar?' : 'Confirmar');
      break;
    }
    case 'reload-page': location.reload(); break;
    case 'mfilter': SET.filter = t.dataset.v; renderModelList(); break;
    case 'toggle-enabled': toggleEnabled(t.dataset.key); break;

    case 'toggle-prompt': {
      const open = !S.openPrompts.has(b.id);
      if (open) S.openPrompts.add(b.id); else S.openPrompts.delete(b.id);
      art.classList.toggle('prompt-open', open);
      t.setAttribute('aria-expanded', open);
      t.dataset.tip = open ? 'Esconder o prompt' : 'Mostrar o prompt';
      hideTip();
      break;
    }
    case 'copy-prompt': {
      const bb = S.batches.get(t.dataset.batch);
      if (bb) navigator.clipboard.writeText(bb.prompt).then(() => toast('Prompt copiado', 'ok'), () => toast('O navegador não deixou copiar.', 'error'));
      break;
    }
    case 'redo':
      try { const nb = await api(`/api/batches/${b.id}/redo`, { method: 'POST', body: {} }); upsertBatch(nb); $('#stream').scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { toast(err.message, 'error'); }
      break;
    case 'redo-other': if (popEl) closePop(); else openRedoOther(t, b); break;
    case 'pop-redo':
      closePop();
      try { const nb = await api(`/api/batches/${t.dataset.batch}/redo`, { method: 'POST', body: { families: [t.dataset.key] } }); upsertBatch(nb); $('#stream').scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { toast(err.message, 'error'); }
      break;
    case 'tool': openToolPop(t, t.dataset.tool, t.dataset.item, Number(t.dataset.idx) || 0); break;
    case 'pop-tool': closePop(); runTool(t.dataset.tool, t.dataset.model, t.dataset.item, Number(t.dataset.idx) || 0, t.dataset.extra); break;
    case 'a-avatar': toolFileFor = { itemId: t.dataset.item, idx: Number(t.dataset.idx) || 0 }; $('#tool-file').click(); break;
    case 'reuse': reuseBatch(b); break;
    case 'lb-reuse': { const bb = S.batches.get(t.dataset.batch); LB.close(); if (bb) reuseBatch(bb); break; }
    case 'del-batch':
      armConfirm(t, async () => { try { await api(`/api/batches/${b.id}`, { method: 'DELETE' }); removeBatch(b.id); } catch (err) { toast(err.message, 'error'); } });
      break;
    case 'wipe-day':
      armConfirm(t, async () => {
        try {
          const kind = S.tab;
          const r = await api(`/api/days/${t.dataset.day}?kind=${kind}`, { method: 'DELETE' });
          for (const [id, bb] of [...S.batches]) if (dayKey(bb.createdAt) === t.dataset.day && kindOf(bb) === kind) removeBatch(id);
          toast(r.removed ? 'Gerações do dia apagadas' : 'Nada para apagar');
        } catch (err) { toast(err.message, 'error'); }
      }, `Apagar ${dayLabel(t.dataset.day).toLowerCase() === 'hoje' ? 'tudo de hoje' : 'o dia todo'}`);
      break;

    case 'open': {
      if (e.target.closest('.tools')) break;
      LB.show(t.dataset.item, Number(t.dataset.idx));
      break;
    }
    case 'use-ref': e.stopPropagation(); useAsRef(t.dataset.item, Number(t.dataset.idx)); break;
    case 'copy-img': { e.stopPropagation(); const { it } = findItem(t.dataset.item); if (it) copyImage(it.outputs[Number(t.dataset.idx)].url); break; }
    case 'download': { e.stopPropagation(); const { b: bb, it } = findItem(t.dataset.item); if (it) downloadImage(bb, it, Number(t.dataset.idx)); break; }
    case 'variation': {
      e.stopPropagation();
      try { const nb = await api(`/api/items/${t.dataset.item}/variation`, { method: 'POST' }); upsertBatch(nb); if (!LB.open) $('#stream').scrollTo({ top: 0, behavior: 'smooth' }); else toast('Gerando outra'); } catch (err) { toast(err.message, 'error'); }
      break;
    }
    case 'retry':
      try { await api(`/api/items/${t.dataset.item}/retry`, { method: 'POST' }); } catch (err) { toast(err.message, 'error'); }
      break;
    case 'del-item':
      e.stopPropagation();
      armConfirm(t, async () => {
        try {
          await api(`/api/items/${t.dataset.item}`, { method: 'DELETE' });
          const { b: bb, it } = findItem(t.dataset.item);
          if (bb) { bb.items = bb.items.filter((i) => i !== it); if (bb.items.length) upsertBatch(bb); else removeBatch(bb.id); }
        } catch (err) { toast(err.message, 'error'); }
      });
      break;
    case 'lb-prev': LB.go(-1); break;
    case 'lb-next': LB.go(1); break;
    case 'lb-close': LB.close(); break;
    case 'lb-backdrop': if (e.target === t && LB.mode !== 'crop') LB.close(); break; // no editor, clicar fora não descarta o corte
    case 'crop-open': CROP.open(); break;
    case 'crop-cancel': CROP.cancel(); break;
    case 'crop-reset': CROP.reset(); break;
    case 'crop-ratio': CROP.setRatio(t.dataset.v); break;
    case 'crop-zoom-in': CROP.zoomTo(CROP.s * 1.2); break;
    case 'crop-zoom-out': CROP.zoomTo(CROP.s / 1.2); break;
    case 'crop-save': CROP.save(); break;
    default: break;
  }
});


document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !SET.open && !LB.open && !TRIM.on) { e.preventDefault(); generate(); return; }
  if (TRIM.on) { TRIM.key(e); return; }
  if (CROP.on) { CROP.key(e); return; }
  if (e.key === 'Escape') {
    if (popEl) return closePop();
    if (LB.open) return LB.close();
    if (SET.open) return closeSettings();
  }
  if (LB.open) {
    if (e.key === 'ArrowLeft') LB.go(-1);
    if (e.key === 'ArrowRight') LB.go(1);
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.tile.done, .mrow, .agents-head, .lib-item, .lib-thumb')) { e.preventDefault(); e.target.click(); }
});

$('#prompt').addEventListener('input', (e) => {
  cur().prompt = e.target.value;
  autosize();
  $('#prompt-clear').classList.toggle('show', !!cur().prompt);
  renderGo();
  saveCur();
});
let searchT;
$('#tl-search').addEventListener('input', (e) => {
  clearTimeout(searchT);
  searchT = setTimeout(() => { S.q = e.target.value.trim().toLowerCase(); renderTimeline(); }, 160);
});
$('#file-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#tool-file').addEventListener('change', (e) => { toolFilePicked(e.target.files[0]); e.target.value = ''; });
$('#lib-file').addEventListener('change', (e) => { libraryUpload(e.target.files); e.target.value = ''; });

document.addEventListener('paste', (e) => {
  if (e.target.closest?.('.drawer')) return;
  const wanted = S.tab === 'video' ? /^(image|video)\// : S.tab === 'audio' ? /^(audio|video)\// : /^image\//;
  const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && wanted.test(i.type)).map((i) => i.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  addFiles(files);
});

/* ---------- arrastar e soltar ---------- */

let dragDepth = 0;
const isExternal = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const isOutput = (e) => [...(e.dataTransfer?.types || [])].includes('application/x-gerador-output');
window.addEventListener('dragenter', (e) => {
  if (!isExternal(e) && !isOutput(e)) return;
  dragDepth++;
  $('#composer').classList.add('dropping');
});
window.addEventListener('dragleave', (e) => {
  if (!isExternal(e) && !isOutput(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#composer').classList.remove('dropping');
});
window.addEventListener('dragover', (e) => { if (isExternal(e) || isOutput(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  dragDepth = 0;
  $('#composer').classList.remove('dropping');
  if (isExternal(e)) { e.preventDefault(); addFiles(e.dataTransfer.files); return; }
  if (isOutput(e)) {
    e.preventDefault();
    if (!e.target.closest('#composer')) return;
    const { itemId, idx } = JSON.parse(e.dataTransfer.getData('application/x-gerador-output'));
    useAsRef(itemId, idx);
  }
});
document.addEventListener('dragstart', (e) => {
  const tile = e.target.closest?.('.tile.done');
  if (tile) {
    e.dataTransfer.setData('application/x-gerador-output', JSON.stringify({ itemId: tile.dataset.item, idx: Number(tile.dataset.idx) }));
    e.dataTransfer.effectAllowed = 'copy';
    const img = tile.querySelector('img');
    if (img) e.dataTransfer.setDragImage(img, 30, 30);
    return;
  }
  const ref = e.target.closest?.('.ref');
  if (ref) { e.dataTransfer.setData('application/x-gerador-ref', ref.dataset.refIndex); e.dataTransfer.effectAllowed = 'move'; }
});
$('#refs').addEventListener('dragover', (e) => {
  if (![...e.dataTransfer.types].includes('application/x-gerador-ref')) return;
  e.preventDefault();
  $$('.ref.drag-over').forEach((x) => x.classList.remove('drag-over'));
  e.target.closest('.ref')?.classList.add('drag-over');
});
$('#refs').addEventListener('drop', (e) => {
  const from = e.dataTransfer.getData('application/x-gerador-ref');
  $$('.ref.drag-over').forEach((x) => x.classList.remove('drag-over'));
  if (from === '') return;
  e.preventDefault(); e.stopPropagation();
  dragDepth = 0; $('#composer').classList.remove('dropping');
  const target = e.target.closest('.ref');
  const to = target ? Number(target.dataset.refIndex) : S.c.refs.length - 1;
  const [moved] = S.c.refs.splice(Number(from), 1);
  S.c.refs.splice(to, 0, moved);
  renderRefs(); saveComposer();
});

/* ================================================================== */
/* Tempo real                                                          */
/* ================================================================== */

let wasDown = false;
function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('batch', (e) => upsertBatch(JSON.parse(e.data)));
  es.addEventListener('batch-removed', (e) => removeBatch(JSON.parse(e.data).id));
  es.addEventListener('balance', (e) => { setBalance(JSON.parse(e.data)); if (SET.open) renderKeyStatus(); });
  es.addEventListener('catalog', () => { loadModels(); loadVModels(); loadAModels(); });
  es.addEventListener('library', (e) => setLibrary(JSON.parse(e.data)));
  es.addEventListener('fx', (e) => { if (S.config.currency && S.config.currency !== 'usd') { S.config.fx = JSON.parse(e.data); refreshMoney(); } });
  es.addEventListener('quit', () => { es.close(); showStopped(); });
  es.onopen = () => { if (wasDown) { wasDown = false; syncState(); } };
  es.onerror = () => { wasDown = true; };
}

// O Gerador foi encerrado (por esta aba ou por outra): avisa em vez de deixar a tela parada sem resposta
function showStopped() {
  if ($('.stopped')) return;
  closeSettings();
  if (LB.open) LB.close();
  const el = document.createElement('div');
  el.className = 'stopped';
  el.innerHTML = `<div class="stopped-card">${svg('power', 's20')}<h3>O Gerador foi encerrado</h3>
    <p>Para usar de novo, abra pelo atalho <b>Gerador</b> na área de trabalho e depois recarregue esta página.</p>
    <button class="btn" data-act="reload-page">Recarregar</button></div>`;
  document.body.appendChild(el);
}

async function syncState() {
  try {
    const st = await api('/api/state');
    S.config = { ...S.config, ...st.config };
    S.batches = new Map(st.batches.map((b) => [b.id, b]));
    setLibrary(st.library);
    renderTimeline();
    setBalance(st.balance);
  } catch { /* tenta de novo no próximo reconectar */ }
}

/* ================================================================== */
/* Início                                                              */
/* ================================================================== */

async function boot() {
  $('#settings-btn').innerHTML = svg('sliders', 's20');
  loadComposer();
  renderComposer();
  renderBalance();
  try {
    const st = await api('/api/state');
    S.config = { enabledVideo: [], enabledAudio: [], ...st.config };
    for (const b of st.batches) S.batches.set(b.id, b);
    setLibrary(st.library);
    renderTimeline();
    if (st.balance) { S.balance = st.balance; }
    renderBalance(); renderGo();
    connectEvents();
    loadModels();
    loadVModels();
    loadAModels();
    if (!S.config.hasKey) openSettings(true);
    else refreshBalance();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// boot() é chamado no fim do index.html, depois que video.js também carregou
