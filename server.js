#!/usr/bin/env node
// Gerador — estúdio local de geração de imagens usando o Atlas Cloud.
// Zero dependências: precisa só do Node.js 18 ou mais novo.

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(`\n  Este app precisa do Node.js 18 ou mais novo (você tem ${process.versions.node}).\n  Baixe em https://nodejs.org\n`);
  process.exit(1);
}

const atlas = require('./lib/atlas');
const mapper = require('./lib/mapper');
const vmapper = require('./lib/vmapper');
const { info: imgInfo, MIME_EXT } = require('./lib/imginfo');
const { info: vidInfo, MIME_EXT: VIDEO_EXT } = require('./lib/vidinfo');
const { info: audInfo, MIME_EXT: AUDIO_EXT, EXTS: AUDIO_EXTS } = require('./lib/audinfo');
const amapper = require('./lib/amapper');
const tools = require('./lib/tools');
const mcp = require('./lib/mcp');
const agentTools = require('./lib/agent');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.GERADOR_DATA || path.join(ROOT, 'data');
const IMAGES = path.join(DATA, 'images');
const VIDEOS = path.join(DATA, 'videos');
const AUDIO = path.join(DATA, 'audio');
const REFS = path.join(DATA, 'refs');
const CACHE = path.join(DATA, 'cache');
const START_PORT = Number(process.env.PORT) || 7777;
const APP_ID = 'gerador-imgs';

for (const d of [DATA, IMAGES, VIDEOS, AUDIO, REFS, CACHE]) fs.mkdirSync(d, { recursive: true });

// Em segundo plano não há janela para mostrar mensagens: elas vão para data/gerador.log
const BACKGROUND = !!process.env.GERADOR_BG;
if (BACKGROUND) {
  const LOG = path.join(DATA, 'gerador.log');
  try { if (fs.statSync(LOG).size > 512 * 1024) fs.renameSync(LOG, `${LOG}.antigo`); } catch { /* ainda não existe */ }
  const write = (kind, args) => {
    const text = args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' ').trim();
    try { fs.appendFileSync(LOG, `[${new Date().toLocaleString('pt-BR')}]${kind} ${text}\n`); } catch { /* sem log */ }
  };
  console.log = (...a) => write('', a);
  console.error = (...a) => write(' ERRO', a);
  process.on('uncaughtException', (e) => { write(' ERRO', [e]); process.exit(1); });
  process.on('unhandledRejection', (e) => write(' ERRO', [e]));
}

/* ------------------------------------------------------------------ */
/* ffmpeg (opcional): usado só para cortar trechos de vídeo            */
/* ------------------------------------------------------------------ */

function run(cmd, args, timeout = 5 * 60e3) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim().split('\n').pop()));
      else resolve(stdout);
    });
  });
}

let ffmpegCheck = null;
let ffmpegOk = false;
function hasFfmpeg() {
  ffmpegCheck ??= run('ffmpeg', ['-version'], 15000).then(() => (ffmpegOk = true), () => (ffmpegOk = false));
  return ffmpegCheck;
}
hasFfmpeg();

/* ------------------------------------------------------------------ */
/* Persistência                                                        */
/* ------------------------------------------------------------------ */

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const writers = new Map();
function writeJSON(file, value, delay = 150) {
  clearTimeout(writers.get(file));
  writers.set(file, setTimeout(() => {
    writers.delete(file);
    const tmp = `${file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
      fs.renameSync(tmp, file);
    } catch (e) { console.error('Falha ao salvar', file, e.message); }
  }, delay));
}
// Só a instância que está servindo o app grava em disco. Uma segunda, aberta com o app já rodando,
// existe apenas para abrir o navegador e não pode sobrescrever o histórico com a cópia dela.
let primary = false;
function flushAll() {
  if (!primary) return;
  for (const [file, t] of writers) { clearTimeout(t); }
  writers.clear();
  try { fs.writeFileSync(path.join(DATA, 'db.json'), JSON.stringify(db, null, 1)); } catch {}
  try { fs.writeFileSync(path.join(DATA, 'config.json'), JSON.stringify(config, null, 1)); } catch {}
}

const CONFIG_FILE = path.join(DATA, 'config.json');
const DB_FILE = path.join(DATA, 'db.json');
const config = Object.assign({ apiKey: '', enabled: null, enabledVideo: null, enabledAudio: null }, readJSON(CONFIG_FILE, {}));
// Agentes de IA (MCP): ligado ou não, e quanto podem gastar por geração e por dia (0 = sem limite)
config.mcp = Object.assign({ enabled: true, maxPerCall: 3, maxPerDay: 15 }, config.mcp);
const db = Object.assign({ batches: [], refs: {} }, readJSON(DB_FILE, {}));
const saveConfig = () => writeJSON(CONFIG_FILE, config);
const saveDb = () => writeJSON(DB_FILE, db);

const uid = (p = '') => p + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ */
/* Eventos em tempo real (SSE)                                         */
/* ------------------------------------------------------------------ */

const clients = new Set();
function emit(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// rev cresce a cada mudança: a tela usa para não trocar um estado novo por uma resposta mais antiga
const emitBatch = (b) => { b.rev = (b.rev || 0) + 1; saveDb(); emit('batch', b); };

/* ------------------------------------------------------------------ */
/* Catálogo de modelos e schemas                                        */
/* ------------------------------------------------------------------ */

const MODELS_CACHE = path.join(CACHE, 'models.json');
const SCHEMAS_CACHE = path.join(CACHE, 'schemas.json');
const MODELS_TTL = 6 * 3600e3;
const SCHEMA_TTL = 24 * 3600e3;

let catalog = readJSON(MODELS_CACHE, { at: 0, models: [] });
let families = mapper.buildFamilies(catalog.models);
let vfamilies = vmapper.buildFamilies(catalog.models);
let afamilies = amapper.buildFamilies(catalog.models);
let catalogError = null;
let catalogPromise = null;
const schemaCache = readJSON(SCHEMAS_CACHE, {}); // url -> { at, schema }
const capsById = {}; // variantId -> caps

function familyByKey(key) { return families.find((f) => f.key === key); }
function vfamilyByKey(key) { return vfamilies.find((f) => f.key === key); }
function afamilyByKey(key) { return afamilies.find((f) => f.key === key); }
// imagens, vídeos e áudios leem o schema de jeitos diferentes
const analyze = (variant, schema) => (variant.tool ? tools.analyze(schema, variant.tool) : variant.audio ? amapper.analyze(schema) : variant.video ? vmapper.analyze(schema, variant.kind) : mapper.analyzeSchema(schema));

function ensureVideoDefaults() {
  if (!Array.isArray(config.enabledVideo) && vfamilies.length) { config.enabledVideo = vmapper.defaultEnabled(vfamilies); saveConfig(); }
  if (!Array.isArray(config.enabledAudio) && afamilies.length) { config.enabledAudio = amapper.defaultEnabled(afamilies); saveConfig(); }
}

async function refreshCatalog(force = false) {
  if (!force && catalog.models.length && Date.now() - catalog.at < MODELS_TTL) return;
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    try {
      const models = await atlas.listModels();
      if (models.length) {
        catalog = { at: Date.now(), models };
        families = mapper.buildFamilies(models);
        vfamilies = vmapper.buildFamilies(models);
        afamilies = amapper.buildFamilies(models);
        writeJSON(MODELS_CACHE, catalog, 0);
        catalogError = null;
        if (!Array.isArray(config.enabled)) { config.enabled = mapper.defaultEnabled(families); saveConfig(); }
        ensureVideoDefaults();
        emit('catalog', { at: catalog.at });
      }
    } catch (e) {
      catalogError = e.message;
    } finally {
      catalogPromise = null;
    }
  })();
  return catalogPromise;
}

async function ensureCatalog() {
  if (!catalog.models.length) await refreshCatalog(true);
  else refreshCatalog(false);
}

const schemaInflight = new Map();
async function capsFor(variant) {
  if (capsById[variant.id]) return capsById[variant.id];
  if (!variant.schema) return (capsById[variant.id] = analyze(variant, null));
  const cached = schemaCache[variant.schema];
  if (cached && Date.now() - cached.at < SCHEMA_TTL) return (capsById[variant.id] = analyze(variant, cached.schema));
  if (!schemaInflight.has(variant.schema)) {
    schemaInflight.set(variant.schema, (async () => {
      try {
        const schema = await atlas.fetchSchema(variant.schema);
        schemaCache[variant.schema] = { at: Date.now(), schema };
        writeJSON(SCHEMAS_CACHE, schemaCache, 1000);
        return schema;
      } catch {
        return cached?.schema || null; // usa o cache vencido se a rede falhar
      } finally {
        schemaInflight.delete(variant.schema);
      }
    })());
  }
  const schema = await schemaInflight.get(variant.schema);
  const caps = analyze(variant, schema);
  if (schema) capsById[variant.id] = caps;
  return caps;
}

async function familyCaps(fam) {
  await Promise.all(Object.values(fam.variants).map((v) => capsFor(v)));
}

function publicCaps(c) {
  if (!c) return null;
  return { known: c.known, usable: c.usable, acceptsImages: c.acceptsImages, requiresImages: c.requiresImages, maxImages: c.maxImages };
}

function familyView(f) {
  const variants = {};
  for (const [k, v] of Object.entries(f.variants)) {
    variants[k] = { id: v.id, price: v.price, caps: publicCaps(capsById[v.id]) };
  }
  return { key: f.key, name: f.name, provider: f.provider, avatar: f.avatar, variants, enabled: (config.enabled || []).includes(f.key) };
}

function vfamilyView(f) {
  const variants = {};
  for (const [k, v] of Object.entries(f.variants)) {
    variants[k] = { id: v.id, price: v.price, caps: vmapper.publicCaps(capsById[v.id]) };
  }
  return { key: f.key, name: f.name, provider: f.provider, avatar: f.avatar, variants, enabled: (config.enabledVideo || []).includes(f.key) };
}

function afamilyView(f) {
  const v = f.variants.main;
  return {
    key: f.key, name: f.name, provider: f.provider, avatar: f.avatar, kind: f.kind,
    price: v.price, unit: v.unit, caps: amapper.publicCaps(capsById[v.id]), enabled: (config.enabledAudio || []).includes(f.key),
  };
}

/* ------------------------------------------------------------------ */
/* Saldo                                                               */
/* ------------------------------------------------------------------ */

let balanceState = { value: null, currency: 'usd', at: 0, error: null };
let balanceTimer = null;
let balancePromise = null;

async function refreshBalance(force = false) {
  if (!config.apiKey) { balanceState = { value: null, currency: 'usd', at: Date.now(), error: null }; return balanceState; }
  if (!force && Date.now() - balanceState.at < 8000) return balanceState;
  if (balancePromise) return balancePromise;
  balancePromise = (async () => {
    try {
      const b = await atlas.balance(config.apiKey);
      balanceState = { ...b, at: Date.now(), error: null };
    } catch (e) {
      balanceState = { ...balanceState, at: Date.now(), error: e.message };
    } finally {
      balancePromise = null;
    }
    emit('balance', balanceState);
    return balanceState;
  })();
  return balancePromise;
}

function scheduleBalance(ms = 1200) {
  clearTimeout(balanceTimer);
  balanceTimer = setTimeout(() => refreshBalance(true), ms);
}
setInterval(() => { if (clients.size) refreshBalance(true); }, 90000);

/* ------------------------------------------------------------------ */
/* Cotação do dólar (para mostrar os valores em reais)                 */
/* ------------------------------------------------------------------ */

// Só é consultada quando o usuário escolhe ver valores em reais. São serviços abertos, sem cadastro;
// o pedido não leva nenhum dado do usuário. Se o primeiro falhar, tenta o seguinte.
const FX_FILE = path.join(CACHE, 'fx.json');
const FX_TTL = 60 * 60e3;
const FX_SOURCES = [
  ['AwesomeAPI', 'https://economia.awesomeapi.com.br/json/last/USD-BRL', (j) => Number(j.USDBRL.bid)],
  ['Frankfurter', 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL', (j) => Number(j.rates.BRL)],
  ['ExchangeRate-API', 'https://open.er-api.com/v6/latest/USD', (j) => Number(j.rates.BRL)],
];
let fx = Object.assign({ rate: null, at: 0, source: '' }, readJSON(FX_FILE, {}));
let fxPromise = null;
const wantsBrl = () => config.currency === 'brl' || config.currency === 'both';

async function refreshFx(force = false) {
  if (!force && fx.rate && Date.now() - fx.at < FX_TTL) return fx;
  fxPromise ??= (async () => {
    for (const [source, url, read] of FX_SOURCES) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const rate = read(await res.json());
        if (!(rate > 0.5 && rate < 100)) continue; // resposta estranha: tenta a próxima fonte
        fx = { rate: Math.round(rate * 10000) / 10000, at: Date.now(), source };
        writeJSON(FX_FILE, fx, 0);
        emit('fx', fx);
        return;
      } catch { /* tenta a próxima fonte */ } finally { clearTimeout(t); }
    }
  })().finally(() => { fxPromise = null; });
  await fxPromise;
  return fx;
}
setInterval(() => { if (wantsBrl() && clients.size) refreshFx(); }, 10 * 60e3);

/* ------------------------------------------------------------------ */
/* Referências                                                         */
/* ------------------------------------------------------------------ */

const REMOTE_TTL = 20 * 60e3;

// Guarda uma imagem, um vídeo ou um áudio enviado pelo usuário para usar como entrada
async function saveRef(buf, filenameHint, mimeHint) {
  const hint = String(mimeHint || '');
  const nameExt = path.extname(filenameHint || '').slice(1).toLowerCase();
  const img = imgInfo(buf);
  // o áudio vem antes do vídeo: um .m4a tem o mesmo contêiner de um .mp4
  const aud = img ? null : audInfo(buf) || (hint.startsWith('audio/') || (!hint.startsWith('video/') && AUDIO_EXTS.has(nameExt)) ? { ext: AUDIO_EXT[hint] || nameExt || 'mp3', mime: hint.startsWith('audio/') ? hint : 'audio/mpeg' } : null);
  const vid = img || aud ? null : vidInfo(buf);
  const meta = img || aud || vid;
  if (!meta && !/^(image|video)\//.test(hint)) throw new Error('Arquivo não parece ser uma imagem, um vídeo nem um áudio.');
  const kind = aud ? 'audio' : vid || (!img && hint.startsWith('video/')) ? 'video' : 'image';
  const ext = meta?.ext || MIME_EXT[hint] || VIDEO_EXT[hint] || nameExt || (kind === 'video' ? 'mp4' : 'png');
  const id = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  const file = `${id}.${ext}`;
  const full = path.join(REFS, file);
  if (!fs.existsSync(full)) await fsp.writeFile(full, buf);
  db.refs[id] = db.refs[id] || { file, mime: meta?.mime || hint || (kind === 'video' ? 'video/mp4' : 'image/png'), w: meta?.w || 0, h: meta?.h || 0, kind, duration: vid?.duration || 0, name: kind === 'audio' ? String(filenameHint || '').slice(0, 80) : undefined };
  saveDb();
  return refView(id);
}

function refView(id) {
  const r = db.refs[id];
  return r ? { id, url: `/media/refs/${r.file}`, w: r.w, h: r.h, kind: r.kind || 'image', duration: r.duration || 0, ...(r.name ? { name: r.name } : {}) } : null;
}

const uploading = new Map(); // id -> envio em andamento (para o mesmo arquivo não subir duas vezes ao mesmo tempo)
async function remoteRef(id) {
  const r = db.refs[id];
  if (!r) throw new Error('Imagem de referência não encontrada.');
  if (r.remote && Date.now() - r.remote.at < REMOTE_TTL) return r.remote.url;
  if (!uploading.has(id)) {
    uploading.set(id, (async () => {
      try {
        const buf = await fsp.readFile(path.join(REFS, r.file));
        const url = await atlas.upload(config.apiKey, buf, r.file, r.mime);
        r.remote = { url, at: Date.now() };
        saveDb();
        return url;
      } finally { uploading.delete(id); }
    })());
  }
  return uploading.get(id);
}

// Endereço no Atlas de uma entrada já enviada (null se ainda não subiu ou se o envio venceu)
function freshUrl(ref) {
  const x = ref && db.refs[ref.id];
  return x && x.remote && Date.now() - x.remote.at < REMOTE_TTL ? x.remote.url : null;
}

// Para quase todos os modelos o preço não depende do arquivo de entrada, então dá para cotar com um
// endereço de mentira. Quando o Atlas precisa do arquivo (ex.: cobra pela duração do vídeo enviado), a
// cotação falha: aí as entradas sobem em segundo plano e a tela pergunta de novo em instantes.
const PLACEHOLDER = 'https://example.com/entrada';
function uploadLater(refs) {
  if (!config.apiKey) return;
  for (const r of refs) if (r && !freshUrl(r)) remoteRef(r.id).catch(() => {});
}

const batchRefUploads = new Map();
function refUrlsFor(batch) {
  if (!batchRefUploads.has(batch.id)) {
    const p = Promise.all(batch.refs.map((r) => remoteRef(r.id)));
    batchRefUploads.set(batch.id, p);
    p.catch(() => {}).finally(() => setTimeout(() => batchRefUploads.delete(batch.id), 60000));
  }
  return batchRefUploads.get(batch.id);
}

/* ------------------------------------------------------------------ */
/* Motor de geração                                                    */
/* ------------------------------------------------------------------ */

let running = 0;
const queue = [];
const MAX_PARALLEL = 8;
function limit(fn) {
  return new Promise((resolve, reject) => {
    const go = () => {
      running++;
      fn().then(resolve, reject).finally(() => { running--; const n = queue.shift(); if (n) n(); });
    };
    if (running < MAX_PARALLEL) go(); else queue.push(go);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findItem(itemId) {
  for (const b of db.batches) {
    const it = b.items.find((i) => i.id === itemId);
    if (it) return { batch: b, item: it };
  }
  return {};
}

function paramsSummary(body, caps) {
  const out = {};
  const skip = new Set(['model', caps.promptField || 'prompt']);
  if (caps.media) { skip.add(caps.media.key); (caps.media.spill || []).forEach((k) => skip.add(k)); }
  for (const [k, v] of Object.entries(body)) {
    if (skip.has(k)) continue;
    if (typeof v === 'object') continue;
    out[k] = v;
  }
  return out;
}

function fail(batch, item, message) {
  item.status = 'failed';
  item.error = message || 'A geração falhou.';
  item.finishedAt = Date.now();
  emitBatch(batch);
}

async function runItem(batch, item) {
  if (batch.tool) return runToolItem(batch, item);
  if (batch.kind === 'video') return runVideoItem(batch, item);
  if (batch.kind === 'audio') return runAudioItem(batch, item);
  if (!config.apiKey) return fail(batch, item, 'Configure sua API key do Atlas Cloud.');
  Object.assign(item, { status: 'running', error: null, startedAt: Date.now(), finishedAt: null, outputs: [], predictionId: null, cost: null });
  emitBatch(batch);
  try {
    await ensureCatalog();
    const fam = familyByKey(item.family);
    if (!fam) throw new Error('Esse modelo não está mais disponível no Atlas Cloud.');
    await familyCaps(fam);
    const hasRefs = batch.refs.length > 0;
    const variant = mapper.pickVariant(fam, capsById, hasRefs);
    if (!variant) throw new Error(hasRefs ? 'Esse modelo não aceita imagens de referência.' : 'Esse modelo precisa de uma imagem de referência.');
    const caps = capsById[variant.id] || mapper.analyzeSchema(null);
    const refUrls = hasRefs ? await refUrlsFor(batch) : [];
    const { body, error } = mapper.buildBody(variant.id, caps, { prompt: batch.prompt, refUrls, ratio: batch.ratio, tier: batch.tier });
    if (error) throw new Error(error);
    item.variantId = variant.id;
    item.params = paramsSummary(body, caps);
    if (hasRefs && caps.maxImages && batch.refs.length > caps.maxImages) item.note = caps.maxImages === 1 ? 'Esse modelo usou só a primeira referência.' : `Esse modelo usou só as ${caps.maxImages} primeiras referências.`;
    // o preço de tabela é o da menor qualidade: a cotação do Atlas considera resolução e qualidade
    const quote = await quoteFor(body, variant.price);
    item.unitPrice = quote.price;
    item.quoteExact = quote.exact;
    item.quoteSource = quote.source;
    const d = await limit(() => atlas.submit(config.apiKey, body));
    item.predictionId = d.id;
    emitBatch(batch);
    await pollUntilDone(batch, item, d);
  } catch (e) {
    fail(batch, item, e.message);
  }
}

/* ---------- vídeos ---------- */

const refOf = (r) => refView(typeof r === 'string' ? r : r?.id);

// Entradas de um lote de vídeo já limpas: só o que o modo usa
//   refs: imagens de referência (modos referência e editar)
//   videos: vídeos de referência (modo referência)
//   video: o vídeo a editar ou estender
function videoInputs(mode, raw = {}) {
  const only = (r, kind) => (r && r.kind === kind ? r : null);
  const list = (items, kind) => (Array.isArray(items) ? items : []).map(refOf).filter((r) => r && r.kind === kind);
  const out = { start: null, end: null, refs: [], videos: [], video: null };
  if (mode === 'image') { out.start = only(refOf(raw.start), 'image'); out.end = only(refOf(raw.end), 'image'); }
  else if (mode === 'ref') { out.refs = list(raw.refs, 'image'); out.videos = list(raw.videos, 'video'); }
  else if (mode === 'edit') { out.video = only(refOf(raw.video), 'video'); out.refs = list(raw.refs, 'image'); }
  else if (mode === 'extend') out.video = only(refOf(raw.video), 'video');
  return out;
}

function missingInput(mode, inputs) {
  if (mode === 'image' && !inputs.start) return 'Adicione a imagem inicial.';
  if (mode === 'ref' && !inputs.refs.length && !inputs.videos.length) return 'Adicione pelo menos uma referência (imagem ou vídeo).';
  if ((mode === 'edit' || mode === 'extend') && !inputs.video) return 'Adicione o vídeo.';
  return null;
}

// O que o lote traz, para escolher a variante do modelo que aceita essa combinação
const needOf = (inputs) => ({ end: !!inputs.end, images: (inputs.refs || []).length, videos: (inputs.videos || []).length });

// Sobe as entradas para o Atlas (uma vez por lote) e devolve as URLs
const batchVideoUploads = new Map();
function videoInputUrls(batch) {
  if (!batchVideoUploads.has(batch.id)) {
    const i = batch.inputs;
    const p = (async () => ({
      start: i.start ? await remoteRef(i.start.id) : null,
      end: i.end ? await remoteRef(i.end.id) : null,
      refs: await Promise.all((i.refs || []).map((r) => remoteRef(r.id))),
      videos: await Promise.all((i.videos || []).map((r) => remoteRef(r.id))),
      video: i.video ? await remoteRef(i.video.id) : null,
    }))();
    batchVideoUploads.set(batch.id, p);
    p.catch(() => {}).finally(() => setTimeout(() => batchVideoUploads.delete(batch.id), 60000));
  }
  return batchVideoUploads.get(batch.id);
}

// Preço por segundo da tabela × duração: só uma estimativa (não considera a resolução)
function tablePrice(variant, seconds) {
  return variant.price != null ? variant.price * Math.max(1, Number(seconds) || 5) : null;
}

// Segundos que entram na conta: na edição vale a duração do vídeo de entrada
function billSeconds(mode, inputs, used, duration) {
  if (used?.duration) return used.duration;
  if (mode === 'edit' && inputs.video?.duration) return inputs.video.duration;
  return duration;
}

const quoteCache = new Map(); // corpo -> { at, quote }
const videoQuote = (variant, body, seconds) => quoteFor(body, tablePrice(variant, seconds));

// Pergunta ao Atlas quanto custaria (não gera nem cobra). Se não der, vale a estimativa da tabela.
// source diz de onde veio o valor: 'atlas' (cotação do pedido inteiro) ou 'table' (preço de tabela, que
// ignora resolução e qualidade e por isso costuma ficar abaixo do cobrado)
async function quoteFor(body, tableValue) {
  const table = { price: tableValue, exact: false, source: 'table' };
  if (!config.apiKey) return table;
  const key = JSON.stringify(body);
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.quote;
  try {
    const q = await atlas.calculate(config.apiKey, body);
    const quote = { price: q.price, exact: !q.estimated, source: 'atlas' };
    quoteCache.set(key, { at: Date.now(), quote });
    if (quoteCache.size > 300) quoteCache.delete(quoteCache.keys().next().value);
    return quote;
  } catch {
    return table;
  }
}

function videoParams(body, caps) {
  const skip = new Set(['model', caps.prompt?.key, caps.start?.key, caps.frames?.key, caps.end?.key, caps.refs?.key, caps.video?.key]);
  const out = {};
  for (const [k, v] of Object.entries(body)) if (!skip.has(k) && typeof v !== 'object') out[k] = v;
  return out;
}

async function runVideoItem(batch, item) {
  if (!config.apiKey) return fail(batch, item, 'Configure sua API key do Atlas Cloud.');
  Object.assign(item, { status: 'running', error: null, startedAt: Date.now(), finishedAt: null, outputs: [], predictionId: null, cost: null });
  emitBatch(batch);
  try {
    await ensureCatalog();
    const fam = vfamilyByKey(item.family);
    if (!fam) throw new Error('Esse modelo não está mais disponível no Atlas Cloud.');
    await familyCaps(fam);
    const need = needOf(batch.inputs);
    const variant = vmapper.pickVariant(fam, capsById, batch.mode, need);
    if (!variant) throw new Error(vmapper.whyNot(batch.mode, need));
    const caps = capsById[variant.id];
    const urls = await videoInputUrls(batch);
    const { body, error, used } = vmapper.buildBody(variant.id, caps, batch.mode, { prompt: batch.prompt, ...urls, ratio: batch.ratio, res: batch.res, duration: batch.duration, audio: batch.audio });
    if (error) throw new Error(error);
    item.variantId = variant.id;
    item.params = videoParams(body, caps);
    // avisa quando o modelo aceita menos referências do que foram enviadas
    const notes = [];
    if (need.images > (used.refs ?? need.images)) notes.push(used.refs === 1 ? 'só a primeira imagem de referência' : `só as ${used.refs} primeiras imagens de referência`);
    if (need.videos > (used.videos ?? need.videos)) notes.push(used.videos === 1 ? 'só o primeiro vídeo de referência' : `só os ${used.videos} primeiros vídeos de referência`);
    if (notes.length) item.note = `Esse modelo usou ${notes.join(' e ')}.`;
    const quote = await videoQuote(variant, body, billSeconds(batch.mode, batch.inputs, used, batch.duration));
    item.unitPrice = quote.price;
    item.quoteExact = quote.exact;
    const d = await limit(() => atlas.submit(config.apiKey, body, 'video'));
    item.predictionId = d.id;
    emitBatch(batch);
    await pollUntilDone(batch, item, d);
  } catch (e) {
    fail(batch, item, e.message);
  }
}

async function finishVideo(batch, item, d) {
  const srcs = atlas.outputsOf(d);
  if (!srcs.length) return fail(batch, item, 'O modelo terminou mas não devolveu vídeo.');
  const day = dayKey(batch.createdAt);
  const dir = path.join(VIDEOS, day);
  await fsp.mkdir(dir, { recursive: true });
  const outputs = [];
  for (const src of srcs) {
    if (outputs.length) break; // alguns modelos devolvem também o último quadro: fica só o vídeo
    try {
      const { buf } = await download(src, 15 * 60e3);
      const meta = vidInfo(buf);
      if (!meta) continue; // não é vídeo
      const file = `${item.id}_0.${meta.ext}`;
      await fsp.writeFile(path.join(dir, file), buf);
      outputs.push({ url: `/media/videos/${day}/${file}`, w: meta.w, h: meta.h, duration: meta.duration, remote: src.startsWith('data:') ? null : src });
    } catch { /* tenta a próxima saída */ }
  }
  if (!outputs.length) {
    // não deu para baixar: mostra direto do Atlas enquanto o link valer
    const src = srcs.find((s) => !s.startsWith('data:'));
    if (!src) return fail(batch, item, 'Não consegui baixar o vídeo gerado.');
    outputs.push({ url: src, w: 0, h: 0, duration: 0, remote: src });
  }
  const settled = applyCost(item, d, item.unitPrice);
  if (!settled && item.quoteExact) item.costEstimated = false; // a cotação exata do Atlas já é o valor cobrado
  item.outputs = outputs;
  item.status = 'done';
  item.finishedAt = Date.now();
  emitBatch(batch);
  scheduleBalance();
  if (!settled) settleCost(batch, item);
}

// Marca as gerações pedidas por um agente (MCP), para a tela mostrar e para somar o gasto do dia
function stampOrigin(batch, via) {
  if (!via) return;
  batch.via = 'mcp';
  if (via.agent) batch.agent = via.agent;
}

function newVideoBatch({ prompt, mode, inputs, familyKeys, ratio, res, duration, audio, via }) {
  const batch = {
    id: uid('b'),
    kind: 'video',
    createdAt: Date.now(),
    prompt,
    mode,
    inputs,
    ratio: ratio || 'auto',
    res: vmapper.resHeight(res) ? String(res) : '720p',
    duration: Math.max(1, Math.min(60, Number(duration) || 5)),
    audio: audio !== false,
    families: familyKeys,
    count: 1,
    items: [],
  };
  for (const key of familyKeys) {
    const fam = vfamilyByKey(key);
    // um agente já chega com o preço cotado: ele entra na soma do dia antes mesmo de a geração começar
    batch.items.push({ id: uid('i'), family: key, familyName: fam?.name || key, avatar: fam?.avatar || '', status: 'queued', outputs: [], unitPrice: via?.prices?.[key] ?? null });
  }
  stampOrigin(batch, via);
  db.batches.push(batch);
  emitBatch(batch);
  for (const item of batch.items) runItem(batch, item);
  return batch;
}

/* ---------- áudio ---------- */

// Pedido de áudio já limpo. modos: speech (fala), music, sfx (efeitos) e stt (transcrição)
function audioRequest(b) {
  const mode = amapper.MODES.includes(b.mode) ? b.mode : 'speech';
  const input = mode === 'stt' ? refOf(b.input) : null;
  const voices = {};
  for (const [k, v] of Object.entries(b.voices && typeof b.voices === 'object' ? b.voices : {})) if (typeof v === 'string') voices[k] = v.slice(0, 160);
  const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : dflt; };
  return {
    mode,
    prompt: mode === 'stt' ? '' : String(b.prompt || '').trim(),
    lyrics: mode === 'music' ? String(b.lyrics || '').trim() : '',
    input: input && input.kind !== 'image' ? input : null,
    voices,
    speed: mode === 'speech' ? num(b.speed, 0.25, 4, 1) : 1,
    lang: ['pt', 'en', 'es'].includes(b.lang) ? b.lang : 'auto',
    instrumental: mode === 'music' && !!b.instrumental,
    duration: mode === 'music' || mode === 'sfx' ? num(b.duration, 1, 600, 0) : 0,
    loop: mode === 'sfx' && !!b.loop,
    keys: (Array.isArray(b.families) ? b.families : []).filter((k) => typeof k === 'string'),
  };
}

function audioMissing(r) {
  if (r.mode === 'stt') return r.input ? null : 'Adicione o áudio para transcrever.';
  return r.prompt ? null : 'Escreva o texto.';
}

// O que o mapeador precisa para montar o pedido de um modelo
const audioInput = (r, key, audioUrl, voiceRefUrl) => ({ text: r.prompt, lyrics: r.lyrics, voice: (r.voices || {})[key], voiceRefUrl, speed: r.speed, lang: r.lang, instrumental: r.instrumental, duration: r.duration, loop: r.loop, audioUrl });

// Voz clonada de um áudio: no pedido ela vem como "ref:<id do arquivo enviado>"
function voiceRefOf(r, key) {
  const v = (r.voices || {})[key];
  const ref = typeof v === 'string' && v.startsWith('ref:') ? refView(v.slice(4)) : null;
  return ref && ref.kind !== 'image' ? ref : null;
}

// Quanto cada modelo cobraria por este pedido. Não gera nem cobra nada.
async function estimateAudio(r) {
  await ensureCatalog();
  const fresh = freshUrl(r.input);
  const voiceRefs = r.keys.map((key) => voiceRefOf(r, key)).filter(Boolean);
  const items = await Promise.all(r.keys.map(async (key) => {
    const fam = afamilyByKey(key);
    if (!fam || fam.kind !== r.mode) return { key, price: null, exact: false, error: 'Esse modelo não faz isso.' };
    const variant = fam.variants.main;
    const caps = await capsFor(variant);
    const vref = voiceRefOf(r, key);
    const built = amapper.buildBody(variant.id, caps, audioInput(r, key, fresh || `${PLACEHOLDER}.mp3`, vref ? freshUrl(vref) || `${PLACEHOLDER}.mp3` : null));
    if (built.error) return { key, price: null, exact: false, error: built.error };
    const table = amapper.tablePrice(variant, { text: r.prompt, seconds: built.used.duration || r.duration });
    const quote = await quoteFor(built.body, table);
    return { key, price: quote.price, exact: quote.exact, source: quote.source, used: built.used };
  }));
  return withPending(items, [r.input, ...voiceRefs].filter(Boolean));
}

async function runAudioItem(batch, item) {
  if (!config.apiKey) return fail(batch, item, 'Configure sua API key do Atlas Cloud.');
  Object.assign(item, { status: 'running', error: null, startedAt: Date.now(), finishedAt: null, outputs: [], text: null, predictionId: null, cost: null, note: undefined });
  emitBatch(batch);
  try {
    await ensureCatalog();
    const fam = afamilyByKey(item.family);
    if (!fam) throw new Error('Esse modelo não está mais disponível no Atlas Cloud.');
    if (fam.kind !== batch.mode) throw new Error('Esse modelo não serve para este tipo de áudio.');
    const variant = fam.variants.main;
    const caps = await capsFor(variant);
    const audioUrl = batch.input ? await remoteRef(batch.input.id) : null;
    const vref = voiceRefOf(batch, item.family);
    const inp = audioInput(batch, item.family, audioUrl, vref ? await remoteRef(vref.id) : null);
    const { body, error, used } = amapper.buildBody(variant.id, caps, inp);
    if (error) throw new Error(error);
    if (vref && !used.voiceRef) throw new Error('Esse modelo não usa um áudio como voz de referência.');
    item.variantId = variant.id;
    item.params = {};
    for (const [k, v] of Object.entries(body)) if (k !== 'model' && typeof v !== 'object' && !(typeof v === 'string' && v.length > 80)) item.params[k] = v;
    const notes = [];
    if (used.voiceRef) item.params.voz = 'clonada de um áudio';
    if (used.cut) notes.push(`O texto passou do limite desse modelo e foi cortado em ${used.cut} caracteres.`);
    if (used.instrumental) notes.push('Sem letra, esse modelo gera só o instrumental.');
    if (notes.length) item.note = notes.join(' ');
    const quote = await quoteFor(body, amapper.tablePrice(variant, { text: inp.text, seconds: used.duration || batch.duration }));
    item.unitPrice = quote.price;
    item.quoteExact = quote.exact;
    const d = await limit(() => atlas.submit(config.apiKey, body, 'audio'));
    item.predictionId = d.id;
    emitBatch(batch);
    await pollUntilDone(batch, item, d);
  } catch (e) {
    fail(batch, item, e.message);
  }
}

async function finishAudio(batch, item, d) {
  const srcs = atlas.outputsOf(d);
  const text = atlas.textOf(d);
  const day = dayKey(batch.createdAt);
  const dir = path.join(AUDIO, day);
  const outputs = [];
  if (srcs.length) await fsp.mkdir(dir, { recursive: true });
  for (const [i, src] of srcs.entries()) {
    try {
      const { buf, mime } = await download(src, 5 * 60e3);
      const meta = audInfo(buf);
      const byName = src.startsWith('data:') ? '' : path.extname(new URL(src.startsWith('//') ? `https:${src}` : src).pathname).slice(1).toLowerCase();
      const ext = meta?.ext || AUDIO_EXT[String(mime || '').split(';')[0]] || byName;
      if (!AUDIO_EXTS.has(ext)) continue; // arquivo de apoio (metadados), não é o áudio
      const file = `${item.id}_${i}.${ext}`;
      await fsp.writeFile(path.join(dir, file), buf);
      outputs.push({ url: `/media/audio/${day}/${file}`, kind: 'audio', remote: src.startsWith('data:') ? null : src });
    } catch {
      if (!src.startsWith('data:')) outputs.push({ url: src, kind: 'audio', remote: src });
    }
  }
  if (!outputs.length && !text) return fail(batch, item, batch.mode === 'stt' ? 'O modelo terminou mas não devolveu o texto.' : 'O modelo terminou mas não devolveu áudio.');
  const settled = applyCost(item, d, item.unitPrice);
  if (!settled && item.quoteExact) item.costEstimated = false;
  item.outputs = outputs;
  if (text) item.text = text;
  item.status = 'done';
  item.finishedAt = Date.now();
  emitBatch(batch);
  scheduleBalance();
  if (!settled) settleCost(batch, item);
}

function newAudioBatch(r, via) {
  const batch = {
    id: uid('b'),
    kind: 'audio',
    createdAt: Date.now(),
    prompt: r.prompt,
    mode: r.mode,
    lyrics: r.lyrics,
    voices: r.voices,
    speed: r.speed,
    lang: r.lang,
    instrumental: r.instrumental,
    duration: r.duration,
    loop: r.loop,
    input: r.input,
    families: r.keys,
    count: 1,
    items: [],
  };
  for (const key of r.keys) {
    const fam = afamilyByKey(key);
    batch.items.push({ id: uid('i'), family: key, familyName: fam?.name || key, avatar: fam?.avatar || '', status: 'queued', outputs: [], unitPrice: via?.prices?.[key] ?? null });
  }
  stampOrigin(batch, via);
  db.batches.push(batch);
  emitBatch(batch);
  for (const item of batch.items) runItem(batch, item);
  return batch;
}

/* ---------- ferramentas (aumentar resolução, remover fundo, vídeo falante…) ---------- */

// Modelos que fazem cada ferramenta, com o preço e se o app consegue usá-los
async function toolList(tool) {
  await ensureCatalog();
  const list = tools.candidates(catalog.models, tool);
  await Promise.race([Promise.allSettled(list.map((v) => capsFor(v))), sleep(9000)]);
  return list.map((v) => ({ id: v.id, name: v.name, avatar: v.avatar, price: v.price, usable: !!capsById[v.id]?.usable }));
}

// refs: { image, video, audio } com as entradas que a ferramenta pede
async function newToolBatch(tool, modelId, refs, via) {
  const def = tools.TOOLS[tool];
  if (!def) throw new Error('Ferramenta desconhecida.');
  for (const kind of def.needs) if (!refs[kind] || refs[kind].kind !== kind) throw new Error(`Falta ${kind === 'image' ? 'a imagem' : kind === 'video' ? 'o vídeo' : 'o áudio'} de entrada.`);
  const list = await toolList(tool);
  const pick = (modelId && list.find((m) => m.id === modelId && m.usable)) || list.find((m) => m.usable);
  if (!pick) throw new Error('O Atlas Cloud não tem um modelo disponível para isso agora.');
  const toolRefs = {};
  for (const kind of def.needs) toolRefs[kind] = refs[kind];
  const batch = { id: uid('b'), createdAt: Date.now(), prompt: def.label, tool, toolRefs, ratio: 'auto', families: [pick.id], count: 1, items: [] };
  if (def.out === 'video') Object.assign(batch, { kind: 'video', mode: 'edit', inputs: { start: toolRefs.image || null, end: null, refs: [], videos: [], video: toolRefs.video || null }, res: '', duration: 0, audio: true });
  else Object.assign(batch, { refs: [toolRefs.image], tier: 0 });
  batch.items.push({ id: uid('i'), family: pick.id, familyName: pick.name, avatar: pick.avatar, status: 'queued', outputs: [], unitPrice: pick.price });
  stampOrigin(batch, via);
  db.batches.push(batch);
  emitBatch(batch);
  runItem(batch, batch.items[0]);
  return batch;
}

async function runToolItem(batch, item) {
  if (!config.apiKey) return fail(batch, item, 'Configure sua API key do Atlas Cloud.');
  Object.assign(item, { status: 'running', error: null, startedAt: Date.now(), finishedAt: null, outputs: [], predictionId: null, cost: null });
  emitBatch(batch);
  try {
    await ensureCatalog();
    const variant = tools.candidates(catalog.models, batch.tool).find((v) => v.id === item.family);
    if (!variant) throw new Error('Esse modelo não está mais disponível no Atlas Cloud.');
    const caps = await capsFor(variant);
    const urls = {};
    for (const [kind, ref] of Object.entries(batch.toolRefs || {})) if (ref) urls[kind] = await remoteRef(ref.id);
    const { body, error } = tools.buildBody(variant.id, caps, urls);
    if (error) throw new Error(error);
    item.variantId = variant.id;
    item.params = {};
    for (const [k, v] of Object.entries(body)) if (k !== 'model' && typeof v !== 'object' && !Object.values(caps.inputs).includes(k)) item.params[k] = v;
    // vídeo costuma ser cobrado por segundo: a tabela é multiplicada pela duração da entrada, quando ela é conhecida
    const video = tools.TOOLS[batch.tool].out === 'video';
    const table = variant.price == null ? null : variant.price * (video ? Math.max(1, batch.toolRefs.video?.duration || 5) : 1);
    const quote = await quoteFor(body, table);
    item.unitPrice = quote.price;
    item.quoteExact = quote.exact;
    const d = await limit(() => atlas.submit(config.apiKey, body, video ? 'video' : 'image'));
    item.predictionId = d.id;
    emitBatch(batch);
    await pollUntilDone(batch, item, d);
  } catch (e) {
    fail(batch, item, e.message);
  }
}

async function pollUntilDone(batch, item, first) {
  let d = first || {};
  let misses = 0;
  const started = Date.now();
  const video = batch.kind === 'video';
  const audio = batch.kind === 'audio';
  const maxMin = video ? 45 : audio ? 20 : 15; // vídeo demora bem mais que imagem
  for (let i = 0; ; i++) {
    const status = String(d.status || '').toLowerCase();
    if (status === 'completed' || status === 'succeeded') return video ? finishVideo(batch, item, d) : audio ? finishAudio(batch, item, d) : finish(batch, item, d);
    if (atlas.TERMINAL_FAIL.has(status)) return fail(batch, item, friendlyFail(atlas.errorText(d.error)));
    if (!db.batches.includes(batch) || !batch.items.includes(item)) return; // apagado no meio
    if (Date.now() - started > maxMin * 60e3) return fail(batch, item, `A geração passou de ${maxMin} minutos e foi abandonada.`);
    await sleep(i < 4 ? 1200 : i < 20 ? 2000 : video ? 5000 : 3500);
    try {
      d = await atlas.prediction(config.apiKey, item.predictionId);
      misses = 0;
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429) return fail(batch, item, e.message);
      if (++misses > 6) return fail(batch, item, e.message);
    }
  }
}

function friendlyFail(msg) {
  if (!msg) return 'A geração falhou.';
  if (/nsfw|safety|content.?polic|moderat|sensitive/i.test(msg)) return `Bloqueado pelo filtro de conteúdo do modelo. (${msg})`;
  return msg;
}

async function download(src, timeout = 120000) {
  if (src.startsWith('data:')) {
    const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    return { buf: Buffer.from(m[3], m[2] ? 'base64' : 'utf8'), mime: m[1] };
  }
  const url = src.startsWith('//') ? `https:${src}` : src;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`download ${res.status}`);
    return { buf: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') };
  } finally { clearTimeout(t); }
}

async function finish(batch, item, d) {
  const srcs = atlas.outputsOf(d);
  if (!srcs.length) return fail(batch, item, 'O modelo terminou mas não devolveu imagem.');
  const day = dayKey(batch.createdAt);
  const dir = path.join(IMAGES, day);
  await fsp.mkdir(dir, { recursive: true });
  const outputs = [];
  for (const [i, src] of srcs.entries()) {
    try {
      const { buf, mime } = await download(src);
      const meta = imgInfo(buf) || {};
      const ext = meta.ext || MIME_EXT[(mime || '').split(';')[0]] || 'png';
      const file = `${item.id}_${i}.${ext}`;
      await fsp.writeFile(path.join(dir, file), buf);
      outputs.push({ url: `/media/images/${day}/${file}`, w: meta.w || 0, h: meta.h || 0, remote: src.startsWith('data:') ? null : src });
    } catch {
      if (!src.startsWith('data:')) outputs.push({ url: src, w: 0, h: 0, remote: src });
    }
  }
  if (!outputs.length) return fail(batch, item, 'Não consegui baixar a imagem gerada.');
  // a cotação do Atlas vale para o pedido inteiro; o preço de tabela é por imagem
  const settled = applyCost(item, d, item.unitPrice == null ? null : item.quoteSource === 'atlas' ? item.unitPrice : item.unitPrice * outputs.length);
  if (!settled && item.quoteExact) item.costEstimated = false; // a cotação exata do Atlas já é o valor cobrado
  if (Array.isArray(d.has_nsfw_contents) && d.has_nsfw_contents.some(Boolean)) item.note = 'O modelo marcou conteúdo sensível.';
  item.outputs = outputs;
  item.status = 'done';
  item.finishedAt = Date.now();
  emitBatch(batch);
  scheduleBalance();
  if (!settled) settleCost(batch, item);
}

/* ---------- custo cobrado ---------- */

// Preço que o Atlas informa numa geração (null enquanto ele ainda não fechou a conta)
function chargedPrice(d) {
  const raw = String(d && d.price != null ? d.price : '').trim();
  const n = Number(raw.replace(/[^0-9.eE-]/g, ''));
  return raw !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

// Registra o custo de um item. Devolve true quando o valor já é o cobrado pelo Atlas; false quando ficou
// a previsão (o Atlas costuma informar o preço alguns segundos depois de entregar o resultado).
function applyCost(item, d, expected) {
  const price = chargedPrice(d);
  // só confia no preço devolvido se ele for coerente com a previsão (evita unidades diferentes)
  if (price != null && (expected == null || (price >= expected / 50 && price <= expected * 50))) {
    item.cost = price;
    item.costEstimated = false;
    return true;
  }
  item.cost = expected ?? null;
  item.costEstimated = true;
  return false;
}

// Volta a consultar a geração até o Atlas informar o preço cobrado, e corrige o custo registrado
async function settleCost(batch, item, waits = [2500, 6000, 15000, 45000, 120000]) {
  for (const ms of waits) {
    await sleep(ms);
    if (!db.batches.includes(batch) || !batch.items.includes(item) || item.status !== 'done' || !item.predictionId || !config.apiKey) return false;
    try {
      const price = chargedPrice(await atlas.prediction(config.apiKey, item.predictionId));
      if (price != null) {
        item.cost = price;
        item.costEstimated = false;
        emitBatch(batch);
        return true;
      }
    } catch (e) {
      if (e.status === 404) return false; // o Atlas não guarda mais essa geração
    }
  }
  return false;
}

// Gerações antigas cujo custo ficou só na previsão: confere de novo com o Atlas, uma vez por dia no máximo
async function repairCosts() {
  if (!config.apiKey) return;
  const now = Date.now();
  const todo = [];
  for (const b of db.batches) {
    for (const it of b.items) {
      if (it.status !== 'done' || !it.costEstimated || !it.predictionId || it.edited) continue;
      if (now - (it.finishedAt || b.createdAt) > 14 * 86400e3 || now - (it.costCheckedAt || 0) < 86400e3) continue;
      todo.push([b, it]);
    }
  }
  let fixed = 0;
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async ([b, it]) => {
      it.costCheckedAt = now;
      if (await settleCost(b, it, [0])) fixed++;
    }));
  }
  if (todo.length) { saveDb(); console.log(`Custos conferidos com o Atlas: ${todo.length} gerações, ${fixed} corrigidas.`); }
}

function newBatch({ prompt, refs, familyKeys, ratio, tier, count, via }) {
  const n = familyKeys.length === 1 ? Math.max(1, Math.min(8, Number(count) || 1)) : 1;
  const batch = {
    id: uid('b'),
    createdAt: Date.now(),
    prompt,
    refs,
    ratio: ratio || 'auto',
    tier: Math.max(0, Math.min(2, Number(tier) || 0)),
    families: familyKeys,
    count: n,
    items: [],
  };
  for (const key of familyKeys) {
    const fam = familyByKey(key);
    for (let i = 0; i < n; i++) {
      batch.items.push({
        id: uid('i'),
        family: key,
        familyName: fam?.name || key,
        avatar: fam?.avatar || '',
        status: 'queued',
        outputs: [],
        unitPrice: fam ? (refs.length ? (fam.variants.edit || fam.variants.t2i) : (fam.variants.t2i || fam.variants.edit))?.price ?? null : null,
      });
    }
  }
  stampOrigin(batch, via);
  db.batches.push(batch);
  emitBatch(batch);
  for (const item of batch.items) runItem(batch, item);
  return batch;
}

async function removeOutputs(item) {
  for (const o of item.outputs || []) {
    const full = localOutputPath(o.url);
    if (full) await fsp.unlink(full).catch(() => {});
  }
}

// Caminho no disco de uma saída salva pelo app (null se ela só existe no Atlas)
function localOutputPath(url) {
  for (const [prefix, base] of [['/media/images/', IMAGES], ['/media/videos/', VIDEOS], ['/media/audio/', AUDIO]]) {
    if (!url.startsWith(prefix)) continue;
    const full = path.normalize(path.join(base, url.slice(prefix.length)));
    return full.startsWith(base) ? full : null;
  }
  return null;
}

// Ao abrir, retoma o que estava gerando quando o app foi fechado
function resume() {
  for (const b of db.batches) {
    for (const it of b.items) {
      if (it.status === 'running' && it.predictionId && config.apiKey) {
        pollUntilDone(b, it, { status: 'processing' }).catch((e) => fail(b, it, e.message));
      } else if (it.status === 'running' || it.status === 'queued') {
        it.status = 'failed';
        it.error = 'Interrompida porque o app foi fechado.';
      }
    }
  }
  saveDb();
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
};

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Arquivo grande demais.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const buf = await readBody(req, 2 * 1024 * 1024);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

async function serveFile(req, res, base, rel, cache = 'no-cache') {
  const full = path.normalize(path.join(base, rel));
  if (!full.startsWith(base)) { res.writeHead(403); return res.end(); }
  try {
    const st = await fsp.stat(full);
    if (!st.isFile()) throw new Error();
    const head = { 'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache, 'Accept-Ranges': 'bytes' };
    // o player de vídeo pede o arquivo aos pedaços (Range) para poder avançar e voltar
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2]) && st.size) {
      const start = range[1] === '' ? Math.max(0, st.size - Number(range[2])) : Number(range[1]);
      const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}` });
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...head, 'Content-Length': st.size });
    fs.createReadStream(full).pipe(res);
  } catch {
    res.writeHead(404); res.end();
  }
}

function maskKey(k) { return k ? `${k.slice(0, 4)}••••${k.slice(-4)}` : ''; }

function stateView() {
  return {
    config: {
      hasKey: !!config.apiKey, keyHint: maskKey(config.apiKey), enabled: config.enabled || [], enabledVideo: config.enabledVideo || [], enabledAudio: config.enabledAudio || [], dataDir: DATA, background: BACKGROUND, ffmpeg: ffmpegOk,
      mcp: { ...config.mcp, script: path.join(ROOT, 'mcp.js') },
      // moeda em que a tela mostra os valores: 'usd' (padrão), 'brl' ou 'both'
      currency: wantsBrl() ? config.currency : 'usd',
      fx: wantsBrl() && fx.rate ? fx : null,
    },
    batches: db.batches,
    balance: balanceState,
  };
}

const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern}$`), fn });

route('GET', '/api/ping', (req, res) => send(res, 200, { app: APP_ID }));

// Encerra o Gerador (o botão das Configurações). Só aceita pedido em JSON, que outro site não consegue mandar.
route('POST', '/api/quit', (req, res) => {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 400, { error: 'Pedido inválido.' });
  send(res, 200, { ok: true });
  emit('quit', {});
  console.log('Encerrado pelo botão das Configurações.');
  setTimeout(() => { flushAll(); process.exit(0); }, 200);
});

// Corta um trecho de um vídeo de entrada e guarda como um novo arquivo. O original continua lá.
route('POST', '/api/refs/([\\w-]+)/trim', async (req, res, url, m) => {
  const src = db.refs[m[1]];
  if (!src || src.kind !== 'video') return send(res, 404, { error: 'Vídeo não encontrado.' });
  const b = await readJsonBody(req);
  const start = Math.max(0, Number(b.start) || 0);
  const end = Number(b.end);
  if (!(end - start >= 0.3)) return send(res, 400, { error: 'O trecho precisa ter pelo menos 0,3 segundo.' });
  if (!(await hasFfmpeg())) return send(res, 400, { error: 'Para cortar vídeos é preciso ter o ffmpeg instalado neste computador.' });
  const tmp = path.join(CACHE, `trecho-${uid()}.mp4`);
  try {
    // recodifica para o corte cair exatamente no ponto escolhido (copiar o fluxo só corta em quadros-chave)
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', start.toFixed(3), '-i', path.join(REFS, src.file), '-t', (end - start).toFixed(3),
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tmp]);
    const ref = await saveRef(await fsp.readFile(tmp), 'trecho.mp4', 'video/mp4');
    send(res, 200, ref);
  } catch (e) {
    send(res, 500, { error: `Não consegui cortar o vídeo. ${e.message || ''}`.trim() });
  } finally {
    fsp.unlink(tmp).catch(() => {});
  }
});
route('GET', '/api/state', (req, res) => send(res, 200, stateView()));

// Conecta o Gerador aos agentes de IA instalados (Claude, ChatGPT/Codex, Cursor): o botão das Configurações
route('POST', '/api/mcp/connect', (req, res) => {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 400, { error: 'Pedido inválido.' });
  const { connectAll, LABEL } = require('./conectar-agentes');
  send(res, 200, { results: connectAll().map((r) => ({ ...r, label: LABEL[r.status] })) });
});

// Abre no explorador de arquivos a pasta onde ficam as gerações
route('POST', '/api/open-folder', (req, res) => {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 400, { error: 'Pedido inválido.' });
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  execFile(cmd, [DATA], { windowsHide: false }, () => {});
  send(res, 200, { ok: true });
});

route('GET', '/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write('retry: 1500\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

route('GET', '/api/models', async (req, res, url) => {
  await ensureCatalog();
  if (!families.length) return send(res, 200, { families: [], enabled: config.enabled || [], error: catalogError || 'Catálogo vazio.' });
  const enabled = new Set(config.enabled || []);
  const toLoad = families.filter((f) => enabled.has(f.key) || url.searchParams.get('caps') === 'all');
  await Promise.race([Promise.allSettled(toLoad.map(familyCaps)), sleep(9000)]);
  send(res, 200, { families: families.map(familyView), enabled: config.enabled || [], at: catalog.at, error: catalogError });
});

route('GET', '/api/video/models', async (req, res, url) => {
  await ensureCatalog();
  ensureVideoDefaults();
  if (!vfamilies.length) return send(res, 200, { families: [], enabled: config.enabledVideo || [], error: catalogError || 'Catálogo vazio.' });
  const enabled = new Set(config.enabledVideo || []);
  const toLoad = vfamilies.filter((f) => enabled.has(f.key) || url.searchParams.get('caps') === 'all');
  await Promise.race([Promise.allSettled(toLoad.map(familyCaps)), sleep(9000)]);
  send(res, 200, { families: vfamilies.map(vfamilyView), enabled: config.enabledVideo || [], at: catalog.at, error: catalogError });
});

route('GET', '/api/audio/models', async (req, res, url) => {
  await ensureCatalog();
  ensureVideoDefaults();
  if (!afamilies.length) return send(res, 200, { families: [], enabled: config.enabledAudio || [], error: catalogError || 'Catálogo vazio.' });
  const enabled = new Set(config.enabledAudio || []);
  const toLoad = afamilies.filter((f) => enabled.has(f.key) || url.searchParams.get('caps') === 'all');
  await Promise.race([Promise.allSettled(toLoad.map(familyCaps)), sleep(9000)]);
  send(res, 200, { families: afamilies.map(afamilyView), enabled: config.enabledAudio || [], at: catalog.at, error: catalogError });
});

route('POST', '/api/audio/generate', async (req, res) => {
  const r = audioRequest(await readJsonBody(req));
  const missing = audioMissing(r);
  if (missing) return send(res, 400, { error: missing });
  if (!r.keys.length) return send(res, 400, { error: 'Escolha pelo menos um modelo.' });
  if (!config.apiKey) return send(res, 400, { error: 'Configure sua API key do Atlas Cloud.' });
  send(res, 200, newAudioBatch(r));
});

route('POST', '/api/audio/estimate', async (req, res) => {
  const items = await estimateAudio(audioRequest(await readJsonBody(req)));
  send(res, 200, { items, pending: !!items.pending });
});

route('POST', '/api/models/refresh', async (req, res) => {
  await refreshCatalog(true);
  for (const k of Object.keys(capsById)) delete capsById[k];
  send(res, 200, { ok: !catalogError, error: catalogError });
});

route('PUT', '/api/config', async (req, res) => {
  const body = await readJsonBody(req);
  const out = { ok: true };
  if (typeof body.apiKey === 'string') {
    config.apiKey = body.apiKey.trim();
    balanceState = { value: null, currency: 'usd', at: 0, error: null };
    if (config.apiKey) {
      const b = await refreshBalance(true);
      out.balance = b;
      if (b.error) { out.ok = false; out.error = b.error; }
    } else emit('balance', balanceState);
  }
  if (Array.isArray(body.enabled)) {
    config.enabled = body.enabled.filter((k) => typeof k === 'string');
    const newly = families.filter((f) => config.enabled.includes(f.key));
    await Promise.race([Promise.allSettled(newly.map(familyCaps)), sleep(8000)]);
    out.families = newly.map(familyView);
  }
  if (Array.isArray(body.enabledVideo)) {
    config.enabledVideo = body.enabledVideo.filter((k) => typeof k === 'string');
    const newly = vfamilies.filter((f) => config.enabledVideo.includes(f.key));
    await Promise.race([Promise.allSettled(newly.map(familyCaps)), sleep(8000)]);
    out.videoFamilies = newly.map(vfamilyView);
  }
  if (Array.isArray(body.enabledAudio)) {
    config.enabledAudio = body.enabledAudio.filter((k) => typeof k === 'string');
    const newly = afamilies.filter((f) => config.enabledAudio.includes(f.key));
    await Promise.race([Promise.allSettled(newly.map(familyCaps)), sleep(8000)]);
    out.audioFamilies = newly.map(afamilyView);
  }
  if (typeof body.currency === 'string') {
    const want = ['brl', 'both'].includes(body.currency) ? body.currency : 'usd';
    if (want !== 'usd') {
      await refreshFx();
      if (!fx.rate) { out.ok = false; out.error = 'Não consegui consultar a cotação do dólar agora. Tente de novo em instantes.'; }
    }
    if (out.ok) config.currency = want;
  }
  if (body.mcp && typeof body.mcp === 'object') {
    const amount =(v, old) => { const n = Number(v); return v === undefined ? old : Number.isFinite(n) && n > 0 ? Math.min(100000, Math.round(n * 100) / 100) : 0; };
    if (typeof body.mcp.enabled === 'boolean') config.mcp.enabled = body.mcp.enabled;
    config.mcp.maxPerCall = amount(body.mcp.maxPerCall, config.mcp.maxPerCall);
    config.mcp.maxPerDay = amount(body.mcp.maxPerDay, config.mcp.maxPerDay);
  }
  saveConfig();
  out.config = stateView().config;
  send(res, 200, out);
});

route('GET', '/api/balance', async (req, res, url) => {
  send(res, 200, await refreshBalance(url.searchParams.get('force') === '1'));
});

route('POST', '/api/refs', async (req, res) => {
  const buf = await readBody(req, 300 * 1024 * 1024); // vídeos de entrada são bem maiores que imagens
  const name = decodeURIComponent(req.headers['x-filename'] || 'imagem.png');
  const ref = await saveRef(buf, name, String(req.headers['content-type'] || '').split(';')[0]);
  send(res, 200, ref);
});

// Transforma uma saída já gerada em entrada (referência) de uma nova geração
async function refFromOutput(itemId, index = 0) {
  const { item } = findItem(itemId);
  const out = item?.outputs?.[index];
  if (!out) return null;
  const local = localOutputPath(out.url);
  const buf = local ? await fsp.readFile(local) : (await download(out.url, 15 * 60e3)).buf;
  // o nome original ajuda a reconhecer o tipo quando o conteúdo sozinho não basta (alguns MP3)
  const ref = await saveRef(buf, path.basename(String(local || out.url).split('?')[0]) || 'saida.png');
  // a URL que o Atlas devolveu pode ser reaproveitada sem novo upload
  if (out.remote && db.refs[ref.id] && !db.refs[ref.id].remote) db.refs[ref.id].remote = { url: out.remote, at: item.finishedAt || Date.now() };
  return ref;
}

route('POST', '/api/refs/from-output', async (req, res) => {
  const { itemId, index = 0 } = await readJsonBody(req);
  const ref = await refFromOutput(itemId, index);
  if (!ref) return send(res, 404, { error: 'Imagem não encontrada.' });
  send(res, 200, ref);
});

function cleanRefs(list) {
  return (Array.isArray(list) ? list : []).map((r) => refView(typeof r === 'string' ? r : r?.id)).filter(Boolean);
}

route('POST', '/api/generate', async (req, res) => {
  const b = await readJsonBody(req);
  const prompt = String(b.prompt || '').trim();
  const keys = (Array.isArray(b.families) ? b.families : []).filter((k) => typeof k === 'string');
  if (!prompt) return send(res, 400, { error: 'Escreva um prompt.' });
  if (!keys.length) return send(res, 400, { error: 'Escolha pelo menos um modelo.' });
  if (!config.apiKey) return send(res, 400, { error: 'Configure sua API key do Atlas Cloud.' });
  const batch = newBatch({ prompt, refs: cleanRefs(b.refs), familyKeys: keys, ratio: b.ratio, tier: b.tier, count: b.count });
  send(res, 200, batch);
});

function videoRequest(b) {
  const prompt = String(b.prompt || '').trim();
  const mode = vmapper.MODES.includes(b.mode) ? b.mode : 'text';
  const inputs = videoInputs(mode, b.inputs);
  const keys = (Array.isArray(b.families) ? b.families : []).filter((k) => typeof k === 'string');
  return { prompt, mode, inputs, keys, ratio: b.ratio, res: b.res, duration: b.duration, audio: b.audio };
}

route('POST', '/api/video/generate', async (req, res) => {
  const r = videoRequest(await readJsonBody(req));
  if (!r.prompt) return send(res, 400, { error: 'Escreva um prompt.' });
  const missing = missingInput(r.mode, r.inputs);
  if (missing) return send(res, 400, { error: missing });
  if (!r.keys.length) return send(res, 400, { error: 'Escolha pelo menos um modelo.' });
  if (!config.apiKey) return send(res, 400, { error: 'Configure sua API key do Atlas Cloud.' });
  send(res, 200, newVideoBatch({ prompt: r.prompt, mode: r.mode, inputs: r.inputs, familyKeys: r.keys, ratio: r.ratio, res: r.res, duration: r.duration, audio: r.audio }));
});

// Quanto cada modelo escolhido custaria com os ajustes atuais. Não gera nem cobra nada.
// r: { mode, inputs, keys, ratio, res, duration, audio }
// A lista devolvida traz também .pending = true quando alguma cotação ainda depende de um arquivo subir
// para o Atlas (o envio já começou em segundo plano; basta perguntar de novo em instantes).
async function estimateVideo(r) {
  await ensureCatalog();
  const need = needOf(r.inputs);
  const inputs = [r.inputs.start, r.inputs.end, ...r.inputs.refs, ...r.inputs.videos, r.inputs.video].filter(Boolean);
  const urls = { start: freshUrl(r.inputs.start), end: freshUrl(r.inputs.end), refs: r.inputs.refs.map(freshUrl), videos: r.inputs.videos.map(freshUrl), video: freshUrl(r.inputs.video) };
  const items = await Promise.all(r.keys.map(async (key) => {
    const fam = vfamilyByKey(key);
    if (!fam) return { key, price: null, exact: false };
    await familyCaps(fam);
    const variant = vmapper.pickVariant(fam, capsById, r.mode, need);
    if (!variant) return { key, price: null, exact: false, error: vmapper.whyNot(r.mode, need) };
    const caps = capsById[variant.id];
    const fill = (list) => list.map((u) => u || PLACEHOLDER);
    // modo referência ainda vazio: conta com uma imagem, só para ter uma ideia do preço
    const empty = r.mode === 'ref' && !need.images && !need.videos;
    // o preço não depende do texto: um prompt fixo evita recalcular a cada tecla
    const built = vmapper.buildBody(variant.id, caps, r.mode, {
      prompt: 'video', ratio: r.ratio, res: r.res, duration: r.duration, audio: r.audio,
      start: urls.start || PLACEHOLDER, end: r.inputs.end ? urls.end || PLACEHOLDER : null,
      refs: empty ? [PLACEHOLDER] : fill(urls.refs), videos: fill(urls.videos), video: urls.video || PLACEHOLDER,
    });
    if (built.error) return { key, price: tablePrice(variant, billSeconds(r.mode, r.inputs, null, r.duration)), exact: false, source: 'table' };
    const seconds = billSeconds(r.mode, r.inputs, built.used, r.duration);
    const quote = await videoQuote(variant, built.body, seconds);
    return { key, price: quote.price, exact: quote.exact, source: quote.source, used: built.used };
  }));
  return withPending(items, inputs);
}

// Sem cotação do Atlas e com entradas que ainda não subiram: sobe agora e marca para perguntar de novo
function withPending(items, inputs) {
  const waiting = inputs.filter((ref) => !freshUrl(ref));
  items.pending = !!config.apiKey && waiting.length > 0 && items.some((x) => x.source === 'table' && !x.error);
  if (items.pending) uploadLater(waiting);
  return items;
}

route('POST', '/api/video/estimate', async (req, res) => {
  const items = await estimateVideo(videoRequest(await readJsonBody(req)));
  send(res, 200, { items, pending: !!items.pending });
});

// Imagens: quanto cada modelo cobraria. O preço de tabela vale para a menor qualidade; a cotação do Atlas
// considera proporção e qualidade, e nos modelos cobrados por token é uma estimativa.
async function estimateImage(b) {
  await ensureCatalog();
  const refs = cleanRefs(b.refs);
  const keys = (Array.isArray(b.families) ? b.families : []).filter((k) => typeof k === 'string');
  const n = keys.length === 1 ? Math.max(1, Math.min(8, Number(b.count) || 1)) : 1;
  const tier = Math.max(0, Math.min(2, Number(b.tier) || 0));
  const items = await Promise.all(keys.map(async (key) => {
    const fam = familyByKey(key);
    if (!fam) return { key, price: null, exact: false };
    await familyCaps(fam);
    const variant = mapper.pickVariant(fam, capsById, refs.length > 0);
    if (!variant) return { key, price: null, exact: false, error: refs.length ? 'Esse modelo não aceita imagens de referência.' : 'Esse modelo precisa de uma imagem de referência.' };
    const caps = capsById[variant.id] || mapper.analyzeSchema(null);
    const built = mapper.buildBody(variant.id, caps, { prompt: 'image', refUrls: refs.map((r) => freshUrl(r) || PLACEHOLDER), ratio: b.ratio || 'auto', tier });
    const table = variant.price != null ? variant.price * n : null;
    if (built.error) return { key, price: table, exact: false, source: 'table' };
    const quote = await quoteFor(built.body, variant.price);
    return { key, price: quote.price != null ? quote.price * n : null, exact: quote.exact, source: quote.source };
  }));
  return withPending(items, refs);
}

route('POST', '/api/estimate', async (req, res) => {
  const items = await estimateImage(await readJsonBody(req));
  send(res, 200, { items, pending: !!items.pending });
});

route('POST', '/api/batches/([\\w-]+)/redo', async (req, res, url, m) => {
  const src = db.batches.find((x) => x.id === m[1]);
  if (!src) return send(res, 404, { error: 'Geração não encontrada.' });
  const b = await readJsonBody(req);
  const keys = Array.isArray(b.families) && b.families.length ? b.families : src.families;
  if (src.tool) return send(res, 200, await newToolBatch(src.tool, keys[0], src.toolRefs || {}));
  if (src.kind === 'audio') return send(res, 200, newAudioBatch(audioRequest({ ...src, families: keys })));
  if (src.kind === 'video') {
    return send(res, 200, newVideoBatch({ prompt: src.prompt, mode: src.mode, inputs: videoInputs(src.mode, src.inputs), familyKeys: keys, ratio: src.ratio, res: src.res, duration: src.duration, audio: src.audio }));
  }
  const count = keys.length === 1 ? (src.families.length === 1 ? src.count : 1) : 1;
  send(res, 200, newBatch({ prompt: src.prompt, refs: src.refs, familyKeys: keys, ratio: src.ratio, tier: src.tier, count }));
});

route('POST', '/api/items/([\\w-]+)/retry', async (req, res, url, m) => {
  const { batch, item } = findItem(m[1]);
  if (!item) return send(res, 404, { error: 'Imagem não encontrada.' });
  if (item.status === 'running' || item.status === 'queued') return send(res, 409, { error: 'Ainda está gerando.' });
  if (item.edited) return send(res, 409, { error: 'Versões editadas não podem ser geradas de novo.' });
  await removeOutputs(item);
  runItem(batch, item);
  send(res, 200, { ok: true });
});

route('POST', '/api/items/([\\w-]+)/variation', async (req, res, url, m) => {
  const { batch, item } = findItem(m[1]);
  if (!item) return send(res, 404, { error: 'Imagem não encontrada.' });
  if (batch.tool) return send(res, 200, await newToolBatch(batch.tool, item.family, batch.toolRefs || {}));
  if (batch.kind === 'audio') return send(res, 200, newAudioBatch(audioRequest({ ...batch, families: [item.family] })));
  if (batch.kind === 'video') {
    return send(res, 200, newVideoBatch({ prompt: batch.prompt, mode: batch.mode, inputs: videoInputs(batch.mode, batch.inputs), familyKeys: [item.family], ratio: batch.ratio, res: batch.res, duration: batch.duration, audio: batch.audio }));
  }
  send(res, 200, newBatch({ prompt: batch.prompt, refs: batch.refs, familyKeys: [item.family], ratio: batch.ratio, tier: batch.tier, count: 1 }));
});

// Modelos disponíveis para cada ferramenta de um clique
route('GET', '/api/tools', async (req, res) => {
  const out = {};
  for (const tool of Object.keys(tools.TOOLS)) out[tool] = await toolList(tool);
  send(res, 200, out);
});

// Roda uma ferramenta sobre um resultado: { tool, model?, index?, extra? }
// extra é o id de um segundo arquivo já enviado (a foto ou o vídeo que vai falar com este áudio)
route('POST', '/api/items/([\\w-]+)/tool', async (req, res, url, m) => {
  const b = await readJsonBody(req);
  const def = tools.TOOLS[b.tool];
  if (!def) return send(res, 400, { error: 'Ferramenta desconhecida.' });
  if (!config.apiKey) return send(res, 400, { error: 'Configure sua API key do Atlas Cloud.' });
  const main = await refFromOutput(m[1], Number(b.index) || 0);
  if (!main) return send(res, 404, { error: 'Resultado não encontrado.' });
  const refs = { [main.kind]: main };
  const extra = b.extra ? refView(String(b.extra)) : null;
  if (extra) refs[extra.kind] = extra;
  try {
    send(res, 200, await newToolBatch(b.tool, b.model, refs));
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

// Salva uma versão editada (cortada) como uma nova imagem, logo depois da original
route('POST', '/api/items/([\\w-]+)/edits', async (req, res, url, m) => {
  const { batch, item } = findItem(m[1]);
  if (!item || item.status !== 'done') return send(res, 404, { error: 'Imagem não encontrada.' });
  if (batch.kind && batch.kind !== 'image') return send(res, 400, { error: 'O corte só funciona com imagens.' });
  const buf = await readBody(req);
  const meta = imgInfo(buf);
  if (!meta || !meta.w || !meta.h) return send(res, 400, { error: 'Arquivo não parece ser uma imagem.' });
  const day = dayKey(batch.createdAt);
  const dir = path.join(IMAGES, day);
  await fsp.mkdir(dir, { recursive: true });
  const id = uid('i');
  const file = `${id}_0.${meta.ext}`;
  await fsp.writeFile(path.join(dir, file), buf);
  const now = Date.now();
  const edit = {
    id,
    family: item.family,
    familyName: item.familyName,
    avatar: item.avatar,
    status: 'done',
    outputs: [{ url: `/media/images/${day}/${file}`, w: meta.w, h: meta.h, remote: null }],
    unitPrice: null,
    cost: null, // não custou nada: não entra no total do dia
    edited: true,
    editedFrom: item.id,
    startedAt: now,
    finishedAt: now,
  };
  batch.items.splice(batch.items.indexOf(item) + 1, 0, edit);
  emitBatch(batch);
  send(res, 200, { batch, itemId: id });
});

route('DELETE', '/api/items/([\\w-]+)', async (req, res, url, m) => {
  const { batch, item } = findItem(m[1]);
  if (!item) return send(res, 404, { error: 'Imagem não encontrada.' });
  await removeOutputs(item);
  batch.items = batch.items.filter((i) => i !== item);
  if (!batch.items.length) {
    db.batches = db.batches.filter((x) => x !== batch);
    saveDb();
    emit('batch-removed', { id: batch.id });
  } else emitBatch(batch);
  send(res, 200, { ok: true });
});

route('DELETE', '/api/batches/([\\w-]+)', async (req, res, url, m) => {
  const batch = db.batches.find((x) => x.id === m[1]);
  if (!batch) return send(res, 404, { error: 'Geração não encontrada.' });
  for (const it of batch.items) await removeOutputs(it);
  db.batches = db.batches.filter((x) => x !== batch);
  saveDb();
  emit('batch-removed', { id: batch.id });
  send(res, 200, { ok: true });
});

route('DELETE', '/api/days/(\\d{4}-\\d{2}-\\d{2})', async (req, res, url, m) => {
  const day = m[1];
  // cada aba apaga só o que é dela: imagens, vídeos ou áudios
  const kind = ['video', 'audio'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'image';
  const mine = (b) => dayKey(b.createdAt) === day && (b.kind || 'image') === kind;
  const gone = db.batches.filter(mine);
  for (const b of gone) for (const it of b.items) await removeOutputs(it);
  db.batches = db.batches.filter((b) => !mine(b));
  await fsp.rm(path.join(kind === 'video' ? VIDEOS : kind === 'audio' ? AUDIO : IMAGES, day), { recursive: true, force: true }).catch(() => {});
  saveDb();
  for (const b of gone) emit('batch-removed', { id: b.id });
  send(res, 200, { ok: true, removed: gone.length });
});

/* ------------------------------------------------------------------ */
/* Agentes de IA (MCP)                                                 */
/* ------------------------------------------------------------------ */

let activePort = START_PORT;

// Quanto os agentes já gastaram hoje: o que terminou vale o custo real; o que está gerando, a previsão
function agentSpentToday() {
  const today = dayKey(Date.now());
  let sum = 0;
  for (const b of db.batches) {
    if (b.via !== 'mcp' || dayKey(b.createdAt) !== today) continue;
    for (const it of b.items) {
      if (it.edited || it.status === 'failed') continue;
      sum += (it.status === 'done' ? it.cost : it.unitPrice) || 0;
    }
  }
  return sum;
}

// Endereço de um arquivo do próprio Gerador (/media/... ou http://localhost:porta/media/...) -> caminho no disco
function ownMedia(src) {
  const m = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d+)(\/media\/.+)$/i.exec(src);
  if (m && Number(m[1]) !== activePort) return null;
  let p = m ? m[2] : src;
  if (!p.startsWith('/media/')) return null;
  try { p = decodeURIComponent(p.split(/[?#]/)[0]); } catch { return null; }
  for (const [prefix, base] of [['/media/images/', IMAGES], ['/media/videos/', VIDEOS], ['/media/audio/', AUDIO], ['/media/refs/', REFS]]) {
    if (!p.startsWith(prefix)) continue;
    const full = path.normalize(path.join(base, p.slice(prefix.length)));
    return full.startsWith(base) ? full : null;
  }
  return null;
}

// Sobe para o Atlas tudo o que um lote de vídeo vai usar (não custa nada e vale por 20 minutos)
async function uploadInputs(i) {
  const all = [i.start, i.end, ...(i.refs || []), ...(i.videos || []), i.video].filter(Boolean);
  await Promise.all(all.map((r) => remoteRef(r.id)));
}

// Miniatura de uma imagem, ou de um quadro do vídeo, para o agente ver o que foi gerado
async function previewOf(file, kind) {
  if (await hasFfmpeg()) {
    const tmp = path.join(CACHE, `previa-${uid()}.jpg`);
    try {
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...(kind === 'video' ? ['-ss', '0.5'] : []), '-i', file, '-frames:v', '1', '-update', '1',
        '-vf', "scale=w='min(1024,iw)':h='min(1024,ih)':force_original_aspect_ratio=decrease", '-q:v', '5', tmp], 60000);
      return { buf: await fsp.readFile(tmp), mime: 'image/jpeg' };
    } catch { /* sem miniatura pelo ffmpeg: tenta o arquivo original */ } finally {
      fsp.unlink(tmp).catch(() => {});
    }
  }
  if (kind !== 'image') return null;
  const mime = TYPES[path.extname(file).toLowerCase()] || '';
  const st = await fsp.stat(file).catch(() => null);
  if (!st || st.size > 1024 * 1024 || !/^image\/(png|jpeg|webp|gif)$/.test(mime)) return null;
  return { buf: await fsp.readFile(file), mime };
}

const agent = agentTools.create({
  settings: () => config.mcp,
  hasKey: () => !!config.apiKey,
  baseUrl: () => `http://localhost:${activePort}`,
  spentToday: agentSpentToday,
  ensureCatalog: async () => { await ensureCatalog(); ensureVideoDefaults(); },
  families: (kind) => (kind === 'video' ? vfamilies : kind === 'audio' ? afamilies : families),
  enabledKeys: (kind) => (kind === 'video' ? config.enabledVideo : kind === 'audio' ? config.enabledAudio : config.enabled) || [],
  publicAudioCaps: amapper.publicCaps,
  audioRequest, estimateAudio, newAudioBatch,
  loadCaps: (fams) => Promise.race([Promise.allSettled(fams.map(familyCaps)), sleep(20000)]),
  caps: (id) => capsById[id],
  pickImage: (fam, hasRefs) => mapper.pickVariant(fam, capsById, hasRefs),
  pickVideo: (fam, mode, need) => vmapper.pickVariant(fam, capsById, mode, need),
  whyNotVideo: vmapper.whyNot,
  publicVideoCaps: vmapper.publicCaps,
  saveRef, refFromOutput, ownMedia, download, localOutputPath, findItem,
  videoInputs, needOf, uploadInputs, estimateVideo, estimateImage,
  newBatch, newVideoBatch,
  batches: () => db.batches,
  balance: () => refreshBalance(true),
  preview: previewOf,
  sleep,
});

const mcpServer = mcp.create({
  info: { name: 'gerador', title: 'Gerador', version: readJSON(path.join(ROOT, 'package.json'), {}).version || '1.0.0' },
  instructions: agentTools.INSTRUCTIONS,
  tools: agentTools.TOOLS,
  call: agent.call,
});

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostOf = (v) => { try { return new URL(String(v).includes('://') ? v : `http://${v}`).hostname; } catch { return ''; } };

// Nome do agente, para aparecer na linha do tempo. Clientes modernos mandam no próprio pedido;
// a ponte stdio (mcp.js) manda no cabeçalho X-Gerador-Agent.
function agentName(req) {
  const name = req.headers['x-gerador-agent'] || String(req.headers['user-agent'] || '').split(/[\s/]/)[0];
  return name && !/^(node|undici|mozilla|python|curl|go-http|axios|okhttp)/i.test(name) ? String(name) : '';
}

async function mcpHttp(req, res) {
  // Só vale pedido feito deste computador: a página de outro site não pode acionar o Gerador
  const origin = req.headers.origin;
  if ((origin && !LOCAL_HOSTS.has(hostOf(origin))) || !LOCAL_HOSTS.has(hostOf(req.headers.host || ''))) {
    return send(res, 403, mcp.rpcError(null, mcp.CODE.INVALID_REQUEST, 'Origin not allowed'));
  }
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
  let msg;
  try { msg = JSON.parse((await readBody(req)).toString('utf8')); } catch { return send(res, 400, mcp.rpcError(null, mcp.CODE.PARSE, 'Parse error')); }
  // o cliente desistiu (fechou a conexão): para de esperar. A geração já pedida continua.
  let gone = false;
  res.on('close', () => { if (!res.writableEnded) gone = true; });
  const out = await mcpServer.handle(msg, { headers: req.headers, agent: agentName(req), aborted: () => gone });
  if (gone) return;
  if (out.body === undefined) { res.writeHead(out.status); return res.end(); }
  send(res, out.status, out.body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/mcp') return await mcpHttp(req, res);
    if (p.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = p.match(r.re);
        if (m) return await r.fn(req, res, url, m);
      }
      return send(res, 404, { error: 'Rota não encontrada.' });
    }
    if (p.startsWith('/media/images/')) return serveFile(req, res, IMAGES, p.slice('/media/images/'.length), 'public, max-age=31536000, immutable');
    if (p.startsWith('/media/videos/')) return serveFile(req, res, VIDEOS, p.slice('/media/videos/'.length), 'public, max-age=31536000, immutable');
    if (p.startsWith('/media/audio/')) return serveFile(req, res, AUDIO, p.slice('/media/audio/'.length), 'public, max-age=31536000, immutable');
    if (p.startsWith('/media/refs/')) return serveFile(req, res, REFS, p.slice('/media/refs/'.length), 'public, max-age=31536000, immutable');
    if (p === '/' || p === '/index.html') return serveFile(req, res, PUBLIC, 'index.html');
    return serveFile(req, res, PUBLIC, p.slice(1));
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: e.message || 'Erro interno.' });
    else res.end();
  }
});

function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, { windowsHide: true }, () => {});
}

async function alreadyRunning(port) {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 700);
    const r = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: ctrl.signal });
    const j = await r.json();
    return j.app === APP_ID;
  } catch { return false; }
}

async function start() {
  if (await alreadyRunning(START_PORT)) {
    console.log(`\n  O Gerador já está aberto em http://localhost:${START_PORT}\n`);
    openBrowser(`http://localhost:${START_PORT}`);
    // sai sozinha depois de abrir o navegador (os temporizadores do app a manteriam viva para sempre)
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  primary = true;
  resume();
  let port = START_PORT;
  const listen = () => server.listen(port, '127.0.0.1');
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && port < START_PORT + 20) { port++; listen(); }
    else { console.error(e.message); process.exit(1); }
  });
  server.on('listening', () => {
    activePort = port;
    const url = `http://localhost:${port}`;
    console.log(BACKGROUND
      ? `Gerador rodando em segundo plano em ${url}. Arquivos em ${DATA}. Para encerrar: Configurações > Encerrar.`
      : `\n  Gerador rodando em ${url}\n  Imagens e vídeos salvos em ${DATA}\n  Para fechar, feche esta janela ou aperte Ctrl+C.\n`);
    openBrowser(url);
  });
  listen();
  refreshCatalog(false);
  if (config.apiKey) refreshBalance(true);
  if (wantsBrl()) refreshFx();
  // confere com o Atlas os custos que ficaram só na previsão (sem pressa: não atrasa a abertura)
  setTimeout(() => repairCosts().catch((e) => console.error('Falha ao conferir custos:', e.message)), 4000);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flushAll(); process.exit(0); });
process.on('exit', flushAll);

start();
