// Modelos 3D do Atlas Cloud: texto → 3D e imagem → 3D (com uma ou várias vistas do mesmo objeto).
// Cada modelo tem um conjunto próprio de opções (textura, PBR, polígonos, formato do arquivo...). Nada
// disso é fixado por modelo: o schema é lido e vira a lista de opções que o painel mostra.

const MODES = ['text', 'image'];
const KINDS = { 'text-to-3d': 'text', 'image-to-3d': 'image', 'multi-image-to-3d': 'multi' };
const KIND_ORDER = ['text', 'image', 'multi'];

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

function is3d(m) {
  const tags = [...(m.categories || []), ...(m.tags || [])].map((t) => String(t).toUpperCase());
  return tags.some((t) => /-TO-3D$/.test(t)) || /-to-3d$/i.test(String(m.model || ''));
}

// "tripo-h3.1/image-to-3d" → família "tripo-h3.1", variante "image". Outros tipos (alinhar malhas) ficam de fora.
function parseVariant(m) {
  const parts = String(m.model || '').split('/');
  const kind = KINDS[parts[parts.length - 1].toLowerCase()];
  if (!kind || parts.length < 2) return null;
  return { kind, family: parts.slice(0, -1).join('/') };
}

function cleanName(n) {
  return String(n || '')
    .replace(/\s*[-–]?\s*(multi[- ]image|text|image)[- ]to[- ]3d\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildFamilies(models) {
  const fams = new Map();
  for (const m of models) {
    if (m.display_console === false || !is3d(m)) continue;
    const v = parseVariant(m);
    if (!v) continue;
    let fam = fams.get(v.family);
    if (!fam) {
      fam = { key: v.family, org: v.family.split('/')[0], provider: m.organization || v.family.split('/')[0], name: '', avatar: m.avatar || '', priority: Number(m.priority) || 0, variants: {} };
      fams.set(v.family, fam);
    }
    // o preço de tabela desses modelos é um valor por crédito, não o preço da geração: quem diz o preço é a cotação
    fam.variants[v.kind] = { id: m.model, d3: true, kind: v.kind, price: null, schema: m.schema || null, displayName: m.displayName || m.model };
    if (!fam.avatar && m.avatar) fam.avatar = m.avatar;
    fam.priority = Math.max(fam.priority, Number(m.priority) || 0);
  }
  for (const fam of fams.values()) {
    const names = KIND_ORDER.map((k) => fam.variants[k]).filter(Boolean).map((x) => cleanName(x.displayName));
    fam.name = names.find((n) => /[a-z]{2}/i.test(n)) || fam.key;
  }
  return [...fams.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// Ligados no primeiro uso: um de cada perfil (texto e imagem, rápido, várias vistas e o mais barato)
const DEFAULT_PICKS = [/^tripo-h3\.1$/, /^tencent\/hunyuan3d-rapid$/, /^meshy-v7\.1$/, /^hi3d\/v2\.1-fast$/, /^meta\/sam-3d-objects$/];

function defaultEnabled(families) {
  const out = [];
  for (const re of DEFAULT_PICKS) {
    const f = families.find((x) => re.test(x.key));
    if (f && !out.includes(f.key)) out.push(f.key);
  }
  for (const f of families) { if (out.length >= 3) break; if (!out.includes(f.key)) out.push(f.key); }
  return out;
}

/* ------------------------------------------------------------------ */
/* Leitura do schema                                                   */
/* ------------------------------------------------------------------ */

function deref(root, s) {
  let x = s;
  for (let i = 0; i < 8 && x && x.$ref; i++) x = String(x.$ref).replace(/^#\//, '').split('/').reduce((o, k) => (o ? o[k] : null), root);
  return x || {};
}

function requestSchema(schema) {
  for (const [p, def] of Object.entries((schema && schema.paths) || {})) {
    if (!def || !def.post || /prediction|result/i.test(p)) continue;
    const content = (def.post.requestBody && def.post.requestBody.content) || {};
    const media = content['application/json'] || Object.values(content)[0];
    if (media && media.schema) return deref(schema, media.schema);
  }
  const input = schema && schema.components && schema.components.schemas && schema.components.schemas.Input;
  return input && input.properties ? input : null;
}

const num = (s) => Number(String(s).replace(/[.,]/g, ''));
// "Up to 800 characters", "Maximum 1024 characters", "Up to 1024 UTF-8 characters"
function maxChars(desc) {
  const m = String(desc || '').match(/(?:up to|maximum|max\.?)\s+(\d[\d.,]*)\s+(?:UTF-8\s+)?characters/i);
  return m ? num(m[1]) : 0;
}

const MAIN_IMAGE = ['image', 'image_url', 'input_image'];
const VIEW_LISTS = ['reference_images', 'images', 'image_urls', 'input_images'];
const FORMAT_KEYS = /^(output_format|target_formats?|file_format|format)$/;
const isImageField = (k, p) => p['x-format'] === 'image' || /(^|_)(image|mask)(_url)?$/.test(k);
const isImageList = (k, p, item) => p.type === 'array' && item.type === 'string' && !item.enum && /images?(_urls?)?$/.test(k);

// O que a descrição diz sobre quando a opção vale: "Requires `should_texture`", "only when `mode` is `full`",
// "ignored when `decimation_mode` is set", "Cannot be combined with `texture_images`"...
function rulesOf(desc, keys) {
  const d = String(desc || '');
  const known = (k) => keys.includes(k);
  const rules = {};
  const needs = [];
  for (const m of d.matchAll(/Requires `(\w+)`/g)) if (known(m[1])) needs.push({ key: m[1] });
  for (const m of d.matchAll(/when `(\w+)` is on\b/g)) if (known(m[1])) needs.push({ key: m[1] });
  for (const m of d.matchAll(/only when `(\w+)` is `([\w-]+)`/g)) if (known(m[1])) needs.push({ key: m[1], value: m[2] });
  if (needs.length) rules.needs = needs;
  const not = [];
  for (const m of d.matchAll(/no effect when `?(\w+)`? is `?([\w-]+)`?/gi)) if (known(m[1])) not.push({ key: m[1], value: m[2] });
  for (const m of d.matchAll(/ignored when `(\w+)` is set/g)) if (known(m[1])) not.push({ key: m[1] });
  if (not.length) rules.not = not;
  const c = d.match(/Cannot be combined with ((?:`\w+`(?:\s*(?:,|or|and)\s*)?)+)/);
  if (c) { const list = [...c[1].matchAll(/`(\w+)`/g)].map((m) => m[1]).filter(known); if (list.length) rules.conflicts = list; }
  return rules;
}

function analyze(schema) {
  const caps = { known: false, usable: true, unfillable: [], prompt: null, image: null, views: null, options: [], format: null, defaults: {} };
  const body = requestSchema(schema);
  if (!body || !body.properties) return caps;
  caps.known = true;
  const required = new Set(body.required || []);
  const props = body.properties;
  const keys = Object.keys(props);
  let bitsKey = null;
  for (const [k, raw] of Object.entries(props)) {
    const p = deref(schema, raw);
    const req = required.has(k);
    const desc = String(p.description || '');
    const item = p.type === 'array' ? deref(schema, p.items) : {};
    const base = { key: k, desc, ...rulesOf(desc, keys) };
    const skip = () => { if (req) { if (p.default !== undefined && p.default !== null) caps.defaults[k] = p.default; else caps.unfillable.push(k); } };
    if (k === 'model') continue;
    if (k === 'prompt' && p.type === 'string') {
      // "Leave empty when you use point_prompts...": sem as outras formas de indicar o objeto, o prompt é o que resta
      caps.prompt = { key: k, required: req, max: maxChars(desc), needed: req || /leave empty when you use/i.test(desc) };
    } else if (MAIN_IMAGE.includes(k) && p.type === 'string' && !caps.image) {
      caps.image = { key: k, required: req };
    } else if (VIEW_LISTS.includes(k) && isImageList(k, p, item) && !caps.views) {
      caps.views = { key: k, max: Number.isFinite(p.maxItems) ? p.maxItems : 4, min: Number.isFinite(p.minItems) ? p.minItems : 1, required: req };
    } else if (/^multi_images?_bit$/.test(k)) {
      bitsKey = k; // quais vistas (frente, costas, esquerda, direita) as imagens preenchem: o app monta sozinho
    } else if (/base64/.test(k) || /only available through the API/i.test(desc)) {
      continue; // saída em base64: só faz sentido para quem chama a API direto
    } else if (p.type === 'array' && item.type === 'object') {
      skip(); // listas de pontos e caixas sobre a imagem: o painel não tem como marcar
    } else if (p.type === 'string' && /mesh/.test(k)) {
      skip(); // pede o endereço de outra malha 3D
    } else if (isImageList(k, p, item)) {
      caps.options.push({ ...base, type: 'images', max: Number.isFinite(p.maxItems) ? p.maxItems : 4 });
    } else if (p.type === 'string' && !p.enum && isImageField(k, p)) {
      caps.options.push({ ...base, type: 'image' });
    } else if (p.type === 'boolean') {
      caps.options.push({ ...base, type: 'bool', def: p.default === true });
    } else if (p.type === 'array' && Array.isArray(item.enum)) {
      const o = { ...base, type: 'multi', values: item.enum, def: Array.isArray(p.default) ? p.default : [], max: Number.isFinite(p.maxItems) ? p.maxItems : item.enum.length, min: Number.isFinite(p.minItems) ? p.minItems : 0 };
      caps.options.push(o);
      if (FORMAT_KEYS.test(k)) caps.format = { key: k, multi: true, values: item.enum, def: o.def };
    } else if (Array.isArray(p.enum) && p.enum.length) {
      const labels = p['x-enum-labels'] && typeof p['x-enum-labels'] === 'object' ? p['x-enum-labels'] : null;
      const o = { ...base, type: 'enum', values: p.enum, def: p.default !== undefined ? p.default : null, numeric: p.type === 'integer' || p.type === 'number', ...(labels ? { labels } : {}) };
      caps.options.push(o);
      if (FORMAT_KEYS.test(k)) caps.format = { key: k, multi: false, values: p.enum, def: o.def };
    } else if ((p.type === 'integer' || p.type === 'number') && Number.isFinite(p.minimum) && Number.isFinite(p.maximum)) {
      caps.options.push({ ...base, type: 'range', min: p.minimum, max: p.maximum, def: p.default !== undefined ? p.default : null, integer: p.type === 'integer' });
    } else if (p.type === 'integer' || p.type === 'number') {
      caps.options.push({ ...base, type: 'number', def: p.default !== undefined ? p.default : null, integer: p.type === 'integer', ...(Number.isFinite(p.minimum) ? { min: p.minimum } : {}), ...(Number.isFinite(p.maximum) ? { max: p.maximum } : {}) });
    } else if (p.type === 'string') {
      caps.options.push({ ...base, type: 'text', max: maxChars(desc) || p.maxLength || 0 });
    } else skip();
  }
  if (bitsKey && caps.views) caps.views.bits = bitsKey;
  // obrigatórios que ficaram como opção e não têm valor padrão precisam ser preenchidos pelo usuário
  for (const o of caps.options) if (required.has(o.key)) o.required = true;
  if (!caps.prompt && !caps.image && !caps.views) caps.unfillable.push('entrada');
  caps.usable = caps.unfillable.length === 0;
  return caps;
}

/* ------------------------------------------------------------------ */
/* Escolha da variante                                                 */
/* ------------------------------------------------------------------ */

const ok = (c) => !!c && c.known && c.usable;
const takesImage = (c) => ok(c) && !!(c.image || c.views);
// Quantas imagens do objeto a variante usa (a principal mais as outras vistas)
const imageRoom = (c) => (!c ? 0 : c.image ? 1 + (c.views ? c.views.max : 0) : c.views ? c.views.max : 0);

// need: { images } = quantas vistas o usuário colocou
function pickVariant(fam, capsById, mode, need = {}) {
  const c = (k) => (fam.variants[k] ? capsById[fam.variants[k].id] : null);
  if (mode === 'text') {
    const v = fam.variants.text;
    return v && ok(c('text')) && c('text').prompt ? v : null;
  }
  if (mode !== 'image') return null;
  const single = takesImage(c('image')) ? fam.variants.image : null;
  const multi = takesImage(c('multi')) ? fam.variants.multi : null;
  // com mais de uma vista, vale a variante que aproveita mais imagens
  if ((need.images || 0) > 1 && multi && imageRoom(c('multi')) > imageRoom(c('image'))) return multi;
  return single || multi;
}

function whyNot(mode) {
  return mode === 'text' ? 'Esse modelo não cria 3D só com texto.' : 'Esse modelo não cria 3D a partir de imagem.';
}

/* ------------------------------------------------------------------ */
/* Corpo da requisição                                                 */
/* ------------------------------------------------------------------ */

const VIEW_SLOTS = ['front', 'back', 'left', 'right'];

// Valor de uma opção já conferido contra o schema (undefined = fica o padrão do modelo)
function cleanOption(o, v, images) {
  if (o.type === 'image') { const u = images[o.key]; return typeof u === 'string' && u ? u : Array.isArray(u) && u[0] ? u[0] : undefined; }
  if (o.type === 'images') { const u = images[o.key]; const list = (Array.isArray(u) ? u : u ? [u] : []).filter(Boolean).slice(0, o.max); return list.length ? list : undefined; }
  if (v === undefined || v === null || v === '') return undefined;
  if (o.type === 'bool') return v === true || v === 'true' ? true : v === false || v === 'false' ? false : undefined;
  if (o.type === 'enum') { const hit = o.values.find((x) => String(x) === String(v)); return hit === undefined ? undefined : hit; }
  if (o.type === 'multi') {
    const list = [...new Set((Array.isArray(v) ? v : [v]).map((x) => o.values.find((y) => String(y).toLowerCase() === String(x).toLowerCase())).filter((x) => x !== undefined))].slice(0, o.max);
    return list.length >= Math.max(1, o.min) ? list : undefined;
  }
  if (o.type === 'range' || o.type === 'number') {
    let n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    if (Number.isFinite(o.min)) n = Math.max(o.min, n);
    if (Number.isFinite(o.max)) n = Math.min(o.max, n);
    return o.integer ? Math.round(n) : n;
  }
  if (o.type === 'text') { const s = String(v).trim(); return s ? (o.max ? s.slice(0, o.max) : s) : undefined; }
  return undefined;
}

// Uma opção só vai no pedido quando as condições dela valem (as mesmas que apagam o controle na tela)
function ruleOff(o, eff) {
  const on = (v) => v !== undefined && v !== null && v !== false && v !== '' && !(Array.isArray(v) && !v.length);
  for (const n of o.needs || []) if (n.value !== undefined ? String(eff[n.key]) !== String(n.value) : !on(eff[n.key])) return n.key;
  for (const n of o.not || []) if (n.value !== undefined ? String(eff[n.key]).toLowerCase() === String(n.value).toLowerCase() : on(eff[n.key])) return n.key;
  return null;
}

// inp: { prompt, images: [{ url, slot }], options: { chave: valor }, optionImages: { chave: url | [urls] } }
//   images: as vistas do objeto, a principal primeiro; slot = 'front' | 'back' | 'left' | 'right'
function buildBody(variantId, caps, mode, inp) {
  if (!caps || !caps.usable) return { error: 'Esse modelo pede campos que o app não preenche.' };
  const body = { model: variantId };
  const used = { images: 0, dropped: [] };
  const prompt = String(inp.prompt || '').trim();
  if (caps.prompt) {
    if (prompt) body[caps.prompt.key] = caps.prompt.max ? prompt.slice(0, caps.prompt.max) : prompt;
    else if (caps.prompt.required) return { error: 'Escreva o prompt.' };
    else if (caps.prompt.needed) return { error: 'Esse modelo precisa que o prompt diga qual objeto reconstruir (por exemplo "cadeira").' };
    if (caps.prompt.max && prompt.length > caps.prompt.max) used.promptCut = caps.prompt.max;
  }
  if (mode === 'image') {
    const all = (inp.images || []).filter((x) => x && x.url);
    const main = all.find((x) => x.slot === 'front') || all[0];
    if (!main) return { error: 'Adicione a imagem do objeto.' };
    const extras = VIEW_SLOTS.slice(1).map((s) => all.find((x) => x !== main && x.slot === s)).filter(Boolean);
    for (const x of all) if (x !== main && !extras.includes(x)) extras.push(x);
    if (caps.image) {
      body[caps.image.key] = main.url;
      used.images = 1;
      if (caps.views && extras.length) {
        const list = extras.slice(0, caps.views.max);
        body[caps.views.key] = list.map((x) => x.url);
        used.images += list.length;
        // frente, costas, esquerda, direita: um "1" para cada vista enviada
        if (caps.views.bits) body[caps.views.bits] = `1${VIEW_SLOTS.slice(1).map((s) => (list.some((x) => x.slot === s) ? '1' : '0')).join('')}`;
        if (caps.views.bits && body[caps.views.bits].split('1').length - 1 !== used.images) delete body[caps.views.bits]; // vistas sem posição marcada: vale a ordem
      }
    } else {
      const list = [main, ...extras].slice(0, caps.views.max);
      body[caps.views.key] = list.map((x) => x.url);
      used.images = list.length;
    }
  } else if (caps.image && caps.image.required) return { error: 'Esse modelo precisa de uma imagem.' };

  // opções: primeiro o valor de cada uma (o escolhido ou o padrão), depois as regras entre elas
  const given = inp.options || {};
  const images = inp.optionImages || {};
  const chosen = {};
  for (const o of caps.options) { const v = cleanOption(o, given[o.key], images); if (v !== undefined) chosen[o.key] = v; }
  const eff = {};
  for (const o of caps.options) eff[o.key] = chosen[o.key] !== undefined ? chosen[o.key] : o.def;
  for (const o of caps.options) {
    if (chosen[o.key] === undefined) continue;
    const off = ruleOff(o, eff) || (o.conflicts || []).find((k) => chosen[k] !== undefined && caps.options.findIndex((x) => x.key === k) < caps.options.indexOf(o));
    if (off) { used.dropped.push(o.key); continue; }
    body[o.key] = chosen[o.key];
  }
  for (const o of caps.options) if (o.required && body[o.key] === undefined) return { error: `Esse modelo precisa da opção "${o.key}".` };
  for (const [k, v] of Object.entries(caps.defaults)) if (body[k] === undefined) body[k] = v;
  // formatos de arquivo que vão sair (para o app saber o que esperar)
  if (caps.format) { const f = body[caps.format.key] !== undefined ? body[caps.format.key] : caps.format.def; used.formats = (Array.isArray(f) ? f : f ? [f] : []).map((x) => String(x).toLowerCase()); }
  return { body, used };
}

// O que a tela precisa saber de cada variante
function publicCaps(c) {
  if (!c) return null;
  return {
    known: c.known,
    usable: c.usable,
    prompt: c.prompt ? { required: c.prompt.required, needed: c.prompt.needed, max: c.prompt.max } : null,
    images: imageRoom(c), // quantas vistas do objeto aproveita
    slots: !!(c.views && c.views.bits), // sabe qual vista é qual (frente, costas, esquerda, direita)
    options: c.options.map((o) => ({ ...o, desc: o.desc.slice(0, 400) })),
    format: c.format ? c.format.key : null,
  };
}

module.exports = { MODES, VIEW_SLOTS, is3d, buildFamilies, defaultEnabled, analyze, pickVariant, whyNot, buildBody, publicCaps, imageRoom };
