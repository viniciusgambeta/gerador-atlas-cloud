// Cliente mínimo da API do Atlas Cloud (sem dependências)

const API = process.env.ATLAS_API_BASE || 'https://api.atlascloud.ai/api/v1';
const PUB = process.env.ATLAS_PUBLIC_BASE || 'https://api.atlascloud.ai/public/v1';

class AtlasError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const TERMINAL_FAIL = new Set(['failed', 'canceled', 'cancelled', 'error', 'timeout']);

function friendly(status, raw) {
  if (status === 401 || status === 403) return 'API key inválida ou sem permissão. Confira em Configurações.';
  if (status === 402) return 'Saldo insuficiente no Atlas Cloud.';
  if (status === 429) return 'Muitas requisições ao mesmo tempo. Tente de novo em instantes.';
  return raw || `Erro ${status} no Atlas Cloud.`;
}

async function request(url, { method = 'GET', key, json, form, timeout = 30000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(t);
    const msg = e.name === 'AbortError' ? 'O Atlas Cloud demorou demais para responder.' : 'Sem conexão com o Atlas Cloud.';
    throw new AtlasError(msg, 0);
  }
  clearTimeout(t);
  const text = await res.text().catch(() => '');
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  if (!res.ok) {
    // Falhas de tarefa às vezes chegam como HTTP 5xx com o status real no corpo
    const task = data && typeof data === 'object' ? (data.data && typeof data.data === 'object' ? data.data : data) : null;
    if (task && typeof task.status === 'string' && TERMINAL_FAIL.has(task.status.toLowerCase())) return data;
    const raw = (data && typeof data === 'object' && (data.msg || data.message || data.error)) || '';
    throw new AtlasError(friendly(res.status, typeof raw === 'string' ? raw : JSON.stringify(raw)), res.status, data);
  }
  return data;
}

async function listModels() {
  const res = await request(`${API}/models`, { timeout: 30000 });
  return Array.isArray(res?.data) ? res.data : [];
}

async function fetchSchema(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new AtlasError(`Schema indisponível (${res.status})`, res.status);
  return res.json();
}

async function balance(key) {
  const res = await request(`${PUB}/balance`, { key, timeout: 15000 });
  const av = res?.available ?? res?.data?.available;
  const value = Number(typeof av === 'object' ? av?.value : av);
  const currency = (typeof av === 'object' && av?.currency) || 'usd';
  if (!Number.isFinite(value)) throw new AtlasError('Resposta de saldo inesperada.', 0, res);
  return { value, currency: String(currency).toLowerCase() };
}

async function upload(key, buffer, filename, mime) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), filename);
  const res = await request(`${API}/model/uploadMedia`, { method: 'POST', key, form, timeout: 300000 });
  const url = res?.data?.download_url || res?.data?.url;
  if (!url) throw new AtlasError('Upload da referência falhou.', 0, res);
  return url;
}

async function submit(key, body, kind = 'image') {
  const route = kind === 'video' ? 'generateVideo' : kind === 'audio' ? 'generateAudio' : 'generateImage';
  const res = await request(`${API}/model/${route}`, { method: 'POST', key, json: body, timeout: 60000 });
  const d = res?.data || {};
  if (d.status && TERMINAL_FAIL.has(String(d.status).toLowerCase())) {
    throw new AtlasError(errorText(d.error) || 'A geração falhou.', 0, res);
  }
  if (!d.id) throw new AtlasError('O Atlas Cloud não devolveu um ID de geração.', 0, res);
  return d;
}

// Parte dos modelos de vídeo documenta a consulta em /model/result em vez de /model/prediction
const useResult = new Set();
async function prediction(key, id) {
  const get = (name) => request(`${API}/model/${name}/${encodeURIComponent(id)}`, { key, timeout: 30000 });
  let res;
  if (useResult.has(id)) res = await get('result');
  else {
    try { res = await get('prediction'); } catch (e) {
      if (e.status !== 404) throw e;
      res = await get('result');
      useResult.add(id);
    }
  }
  return res?.data || {};
}

// Preço que o Atlas cobraria por esta requisição. Não cria tarefa nem desconta do saldo.
async function calculate(key, body) {
  const res = await request(`${API}/model/calculate`, { method: 'POST', key, json: body, timeout: 12000 });
  const d = res?.data || {};
  const price = Number(d.price);
  if (!Number.isFinite(price) || price <= 0) throw new AtlasError('Resposta de preço inesperada.', 0, res);
  return { price, estimated: d.estimated === true };
}

function errorText(e) {
  if (!e) return '';
  if (typeof e === 'string') return e;
  return e.message || e.msg || JSON.stringify(e);
}

// Normaliza a lista de saídas (URLs, data URIs ou objetos)
function outputsOf(d) {
  let outs = d.outputs ?? d.output ?? [];
  if (!Array.isArray(outs)) outs = [outs];
  return outs
    .map((o) => {
      if (typeof o === 'string') return o;
      if (o && typeof o === 'object') return o.url || o.video || o.video_url || o.image || o.image_url || Object.values(o).find((v) => typeof v === 'string' && /^(https?:|data:)/.test(v));
      return null;
    })
    .filter((o) => typeof o === 'string' && /^(https?:|data:|\/\/)/.test(o));
}

// Saída em texto (transcrição): vem como texto puro dentro de outputs, em vez de um endereço
function textOf(d) {
  let outs = d.outputs ?? d.output ?? [];
  if (!Array.isArray(outs)) outs = [outs];
  const parts = outs
    .map((o) => (typeof o === 'string' ? o : o && typeof o === 'object' ? o.text || o.transcript || '' : ''))
    .filter((s) => typeof s === 'string' && s.trim() && !/^(https?:|data:|\/\/)/.test(s.trim()));
  const extra = d.stt_result && typeof d.stt_result.text === 'string' ? d.stt_result.text : '';
  return parts.join('\n').trim() || extra.trim();
}

module.exports = { AtlasError, TERMINAL_FAIL, listModels, fetchSchema, balance, upload, submit, prediction, calculate, outputsOf, textOf, errorText };
