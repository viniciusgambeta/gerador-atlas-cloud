// Modelos de vídeo do Atlas Cloud: agrupa as variantes de um mesmo modelo
// (texto→vídeo, imagem→vídeo, referências, edição, extensão) numa "família" e
// monta o corpo de cada requisição a partir do schema OpenAPI do modelo.
//
// Como no mapper de imagens, nada aqui fixa nomes de parâmetros por modelo:
// os campos são classificados pelo nome e pelo formato dos valores.

// Tipos de modelo que precisam de entradas que a interface não oferece (áudio, avatar, máscaras...)
const EXCLUDE_RE = /(upscal|lip-?sync|reframe|avatar|motion-control|animate-|keyframes|draft-complete|audio-to-video|digital-twin|infinitetalk|omni-human|try-on|-lora\b|\/studio\/)/i;

const KIND_PATTERNS = [
  [/^(text-to-video|t2v)(?:-(.+))?$/i, 't2v'],
  [/^(image-to-video|i2v)(?:-(.+))?$/i, 'i2v'],
  [/^(reference-to-video|ref-to-video)(?:-(.+))?$/i, 'ref'],
  [/^(start-end-frame-to-video|start-end-to-video|first-last-frame-to-video)(?:-(.+))?$/i, 'se'],
  [/^(video-edit|edit-video|video-to-video)(?:-(.+))?$/i, 'edit'],
  [/^(video-extend|extend-video)(?:-(.+))?$/i, 'extend'],
];
const KIND_ORDER = ['t2v', 'i2v', 'ref', 'se', 'edit', 'extend'];

function matchKind(s) {
  for (const [re, kind] of KIND_PATTERNS) {
    const m = String(s).match(re);
    if (m) return { kind, mod: m[2] || '' };
  }
  return null;
}

function categoryKind(m) {
  const s = [...(m.categories || []), ...(m.tags || [])]
    .filter((x) => typeof x === 'string')
    .map((x) => x.toLowerCase().replace(/_/g, '-'));
  if (s.includes('text-to-video')) return 't2v';
  if (s.includes('image-to-video')) return 'i2v';
  return null;
}

function parseVariant(m) {
  const parts = String(m.model).split('/');
  const org = parts[0];
  let base = parts[1] || '';
  const rest = parts.slice(2).join('/');
  let kind = null;
  let mod = '';
  if (rest) {
    const k = matchKind(rest);
    if (k) ({ kind, mod } = k);
    else mod = rest;
  } else {
    let mm;
    const k = matchKind(base);
    if (k && k.mod) { kind = k.kind; base = k.mod; } // "vidu/image-to-video-2.0" → família "vidu/2.0"
    else if (k) { kind = k.kind; base = ''; } // "ltx-2.3-quality/image-to-video"
    else if ((mm = base.match(/^(.*)-(i2v|t2v)(?:-(.+))?$/i))) { base = mm[1]; kind = mm[2].toLowerCase(); mod = mm[3] || ''; } // "seedance-v1-pro-i2v-1080p"
  }
  if (!kind) kind = categoryKind(m);
  if (!kind) return null;
  return { org, base, mod, kind, family: `${org}/${base || '_'}${mod ? '#' + mod : ''}` };
}

function cleanName(n, org) {
  let s = String(n || '')
    .replace(/\b(text|image|reference|video|start[\s-]?end(?:[\s-]frame)?|first\s*(?:&|and)\s*last\s*frame)[\s-]+to[\s-]+(video|animation)\b/gi, '')
    .replace(/\b(video[\s-]edit|edit[\s-]video|video[\s-]extend|extend[\s-]video|t2v|i2v)\b/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–:]+$/g, '')
    .trim();
  // "BLACKFORESTLABS FLUX 3" → "FLUX 3": o provider já aparece no título do grupo
  const flat = String(org || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const first = s.split(' ')[0] || '';
  if (/[-_]/.test(String(org)) && first.replace(/[^a-z0-9]/gi, '').toLowerCase() === flat && s.includes(' ')) s = s.slice(first.length).trim();
  return s;
}

function priceOf(m) {
  const p = m.price || {};
  const v = p.actual?.base_price ?? p.origin?.base_price ?? m.basePrice;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isCandidate(m) {
  if (m.type !== 'Video') return false;
  if (m.display_console === false) return false;
  if ((m.categories || []).some((c) => /audio-to-video/i.test(String(c)))) return false;
  return !EXCLUDE_RE.test(`${m.model} ${m.displayName || ''}`);
}

function buildFamilies(models) {
  const fams = new Map();
  for (const m of models) {
    if (!isCandidate(m)) continue;
    const v = parseVariant(m);
    if (!v) continue;
    const key = v.family;
    let fam = fams.get(key);
    if (!fam) {
      fam = { key, org: v.org, provider: m.organization || v.org, name: '', avatar: m.avatar || '', priority: Number(m.priority) || 0, variants: {} };
      fams.set(key, fam);
    }
    const variant = { id: m.model, kind: v.kind, video: true, price: priceOf(m), schema: m.schema || null, displayName: m.displayName || m.model };
    // o catálogo às vezes lista o mesmo modelo duas vezes ("hailuo-02/pro" e "hailuo-02/i2v-pro"): fica o mais barato
    const prev = fam.variants[v.kind];
    if (!prev || (variant.price ?? Infinity) < (prev.price ?? Infinity)) fam.variants[v.kind] = variant;
    if (!fam.avatar && m.avatar) fam.avatar = m.avatar;
    fam.priority = Math.max(fam.priority, Number(m.priority) || 0);
  }
  for (const fam of fams.values()) {
    // o nome mais comum entre as variantes, já sem "Text-to-Video", "Video-Edit" etc.
    const names = KIND_ORDER.map((k) => fam.variants[k]).filter(Boolean).map((x) => cleanName(x.displayName, fam.org).replace(/^[\s\-–:.]+/, ''));
    const count = (n) => names.filter((x) => x === n).length;
    const best = names.filter((n) => /[a-z]{2}/i.test(n)).sort((a, b) => count(b) - count(a))[0];
    const src = KIND_ORDER.map((k) => fam.variants[k]).find(Boolean);
    fam.name = best || [fam.org, names[0] || src.id.split('/').slice(1).join(' ')].join(' ').trim();
    if (fam.key.includes('#')) {
      const mod = fam.key.split('#')[1].split('~')[0];
      const pretty = mod.replace(/[-_]+/g, ' ');
      if (!fam.name.toLowerCase().includes(pretty.toLowerCase().split(' ')[0])) fam.name = `${fam.name} ${pretty}`;
    }
  }
  return [...fams.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

// Famílias ligadas no primeiro uso: juntas cobrem texto, imagem, referência, edição e extensão
const DEFAULT_PICKS = [
  /^google\/veo3\.1-fast$/,
  /^bytedance\/seedance-2\.0$/,
  /^kwaivgi\/kling-video-o3-std$/,
  /^alibaba\/wan-2\.7$/,
  /^xai\/grok-imagine-video$/,
];

function defaultEnabled(families) {
  const out = [];
  for (const re of DEFAULT_PICKS) {
    const f = families.find((x) => re.test(x.key) && !out.includes(x.key));
    if (f) out.push(f.key);
  }
  if (out.length < 3) {
    const extra = [...families].sort((a, b) => b.priority - a.priority).map((f) => f.key);
    for (const k of extra) { if (out.length >= 5) break; if (!out.includes(k)) out.push(k); }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const PROMPT_FIELDS = ['prompt', 'user_prompt', 'text', 'text_prompt'];
const START_FIELDS = ['image', 'image_url', 'start_image', 'start_image_url', 'first_frame', 'first_image', 'first_frame_image', 'first_frame_url', 'input_image'];
const END_FIELDS = ['last_image', 'end_image', 'end_image_url', 'last_frame', 'tail_image', 'last_frame_image', 'last_frame_url', 'end_frame', 'last_image_url'];
const REF_FIELDS = ['reference_images', 'images', 'image_urls', 'reference_image_urls', 'subjects', 'refers', 'elements'];
const VIDEO_FIELDS = ['video', 'video_url', 'videos', 'reference_videos', 'reference_video', 'input_video', 'source_video'];
const AUDIO_FIELDS = ['generate_audio', 'sound', 'audio', 'with_audio', 'enable_audio'];
const ITEM_URL_KEYS = ['url', 'image', 'image_url', 'images', 'file'];

const RATIO_RE = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/;
const SIZE_RE = /^\s*(\d{3,5})\s*[x*×X]\s*(\d{3,5})\s*$/;
const AUTO_RE = /^(auto|adaptive|match_input_image|match_input|original|keep|source)$/i;

function inputOf(schema) {
  const input = schema?.components?.schemas?.Input;
  return input && typeof input === 'object' && input.properties ? input : null;
}

function enumOf(p) {
  if (!p) return null;
  if (Array.isArray(p.enum)) return p.enum;
  const br = p.anyOf || p.oneOf;
  if (Array.isArray(br)) {
    const e = br.flatMap((x) => (Array.isArray(x.enum) ? x.enum : x.const !== undefined ? [x.const] : []));
    if (e.length) return e;
  }
  return null;
}

// altura em pixels de "720p", "1080P", "4k", "2K"; null para variantes especiais ("720p-SR")
function resHeight(v) {
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(\d{3,4})p$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d)k$/);
  if (m) return { 1: 1080, 2: 1440, 4: 2160, 8: 4320 }[m[1]] || null;
  return null;
}

function mediaField(props, names, required) {
  const cands = names.filter((k) => props[k] && (props[k].type === 'string' ? !props[k].enum : props[k].type === 'array'));
  if (!cands.length) return null;
  const key = cands.find((k) => required.includes(k)) || cands[0];
  const p = props[key];
  if (p.type === 'array') {
    const shape = p.items?.type === 'object' ? 'objects' : 'array';
    return { key, shape, max: Number.isFinite(p.maxItems) ? p.maxItems : 4, min: Number.isFinite(p.minItems) ? p.minItems : 0, required: required.includes(key), itemSchema: shape === 'objects' ? p.items : undefined };
  }
  return { key, shape: 'string', max: 1, min: 0, required: required.includes(key) };
}

function analyze(schema, kind) {
  const input = inputOf(schema);
  if (!input) return { known: false, usable: false };
  const props = input.properties;
  const required = (input.required || []).filter((k) => k !== 'model');

  const promptKey = PROMPT_FIELDS.find((k) => props[k]?.type === 'string' && !props[k].enum) || null;
  const start = mediaField(props, START_FIELDS, required);
  const end = mediaField(props, END_FIELDS, required);
  const refs = mediaField(props, REF_FIELDS.filter((k) => k !== start?.key), required);
  const video = mediaField(props, VIDEO_FIELDS, required);

  const caps = {
    known: true,
    prompt: promptKey ? { key: promptKey, required: required.includes(promptKey) } : null,
    start: start && start.shape === 'string' ? start : null,
    end: end && end.shape === 'string' ? end : null,
    refs: refs && refs.shape !== 'string' ? refs : null,
    video,
    ratio: null, res: null, size: null, duration: null, audio: null,
  };
  // Lista mista: uma lista só para imagens e vídeos, com o tipo marcado em cada item
  // (Wan 3.0 e MiniMax H3: "refers": [{ url, type: "image" | "video" | "audio" }])
  if (caps.refs?.shape === 'objects') {
    const types = caps.refs.itemSchema?.properties?.type?.enum;
    if (Array.isArray(types) && types.includes('video')) caps.refs.mixed = true;
  }
  // modelos de imagem→vídeo que recebem os quadros numa lista ("images": [início, fim])
  if ((kind === 'i2v' || kind === 'se') && !caps.start && caps.refs && caps.refs.shape === 'array') {
    caps.frames = caps.refs;
    caps.refs = null;
  }

  for (const [key, p] of Object.entries(props)) {
    const e = enumOf(p);
    if (/^(aspect_ratio|ratio)$/i.test(key)) {
      const needed = required.includes(key) && p.default === undefined;
      if (e && e.some((v) => RATIO_RE.test(String(v)))) caps.ratio = { key, values: e, needed };
      else if (!e && p.type === 'string') caps.ratio = { key, values: null, needed };
    } else if (/^(resolution|quality|target_resolution)$/i.test(key) && e && e.some((v) => resHeight(v))) {
      caps.res ??= { key, values: e };
    } else if (/^(size|video_size)$/i.test(key) && e && e.some((v) => SIZE_RE.test(String(v)))) {
      caps.size = { key, values: e };
    } else if (/^(duration|video_length|length|seconds)$/i.test(key) && (p.type === 'integer' || p.type === 'number' || (e && e.every((v) => !Number.isNaN(Number(v)))))) {
      caps.duration ??= {
        key,
        values: e ? e.map(Number).filter((n) => n > 0) : null,
        min: p.minimum, max: p.maximum, def: p.default,
        asString: p.type === 'string' || (e ? e.some((v) => typeof v === 'string') : false),
        integer: p.type === 'integer',
      };
    }
  }
  for (const key of AUDIO_FIELDS) {
    const p = props[key];
    if (!p) continue;
    const e = enumOf(p);
    if (p.type === 'boolean') { caps.audio = { key, on: true, off: false }; break; }
    if (e && e.some((v) => /^(yes|true|on)$/i.test(String(v)))) {
      caps.audio = { key, on: e.find((v) => /^(yes|true|on)$/i.test(String(v))), off: e.find((v) => /^(no|false|off)$/i.test(String(v))) };
      break;
    }
  }

  // campos obrigatórios que a interface não sabe preencher deixam o modelo de fora
  const fillable = new Set([promptKey, caps.start?.key, caps.frames?.key, caps.end?.key, caps.refs?.key, caps.video?.key, caps.ratio?.key, caps.res?.key, caps.size?.key, caps.duration?.key, caps.audio?.key].filter(Boolean));
  caps.unfillable = required.filter((k) => !fillable.has(k) && props[k]?.default === undefined);
  // qualquer obrigatório que a interface deixar em branco vai com o valor padrão do modelo
  caps.defaults = Object.fromEntries(required.filter((k) => k !== promptKey && props[k]?.default !== undefined).map((k) => [k, props[k].default]));
  caps.usable = caps.unfillable.length === 0;
  return caps;
}

/* ------------------------------------------------------------------ */
/* Escolha da variante                                                 */
/* ------------------------------------------------------------------ */

const MODES = ['text', 'image', 'ref', 'edit', 'extend'];

// O que cada variante precisa ter para atender a um modo da interface.
// need descreve o que o usuário colocou no painel: { end, images, videos }
//   end: tem quadro final (modo imagem)
//   images / videos: quantas imagens e vídeos de referência (modos referência e editar)
function supports(caps, mode, need = {}) {
  if (!caps || !caps.known || !caps.usable) return false;
  const images = need.images || 0;
  const videos = need.videos || 0;
  if (mode === 'text') return !caps.start?.required && !caps.frames?.required && !caps.refs?.required && !caps.video?.required && !caps.end?.required;
  if (mode === 'image') {
    if (!(caps.start || caps.frames) || caps.video?.required) return false;
    if (need.end) return !!(caps.end || (caps.frames && caps.frames.max >= 2));
    return !caps.end?.required && !(caps.frames && caps.frames.min >= 2);
  }
  if (mode === 'ref') {
    if (!(caps.refs || caps.video) || caps.start?.required) return false;
    if (!images && !videos) return true; // nada escolhido ainda: serve qualquer modelo que aceite referência
    if (images && !caps.refs) return false;
    const mixed = !!caps.refs?.mixed; // a mesma lista aceita imagens e vídeos
    if (videos && !caps.video && !mixed) return false;
    if (!images && caps.refs?.required && !mixed) return false; // só vídeo, mas o modelo exige imagem
    if (!videos && caps.video?.required) return false;
    return true;
  }
  if (mode === 'edit') return !!caps.video && (!images || !!caps.refs) && !caps.refs?.required;
  if (mode === 'extend') return !!caps.video && !caps.refs?.required;
  return false;
}

const MODE_KINDS = { text: ['t2v'], image: ['i2v', 'se'], ref: ['ref'], edit: ['edit'], extend: ['extend'] };

function pickVariant(fam, capsById, mode, need = {}) {
  // com quadro final, a variante "início e fim" vem antes da imagem→vídeo comum
  const order = mode === 'image' && need.end ? ['i2v', 'se'] : MODE_KINDS[mode] || [];
  for (const kind of order) {
    const v = fam.variants[kind];
    if (v && supports(capsById[v.id], mode, need)) return v;
  }
  return null;
}

function whyNot(mode, need = {}) {
  if (mode === 'text') return 'Esse modelo não gera vídeo só com texto.';
  if (mode === 'image') return need.end ? 'Esse modelo não aceita quadro final.' : 'Esse modelo não gera vídeo a partir de imagem.';
  if (mode === 'ref') return need.videos ? 'Esse modelo não aceita vídeo de referência.' : 'Esse modelo não aceita imagens de referência.';
  if (mode === 'edit') return need.images ? 'Esse modelo não aceita imagens de referência na edição.' : 'Esse modelo não edita vídeos.';
  return 'Esse modelo não estende vídeos.';
}

/* ------------------------------------------------------------------ */
/* Corpo da requisição                                                 */
/* ------------------------------------------------------------------ */

const dist = (a, b) => Math.abs(Math.log(a) - Math.log(b));

function parseRatio(s) {
  const m = String(s).match(RATIO_RE);
  if (!m) return null;
  const r = Number(m[1]) / Number(m[2]);
  return Number.isFinite(r) && r > 0 ? r : null;
}

function nearest(values, target, measure) {
  let best; let bestD = Infinity;
  for (const v of values) {
    const n = measure(v);
    if (!n) continue;
    const d = dist(n, target);
    if (d < bestD - 1e-9) { bestD = d; best = v; }
  }
  return best;
}

function pickDuration(d, want) {
  if (d.values && d.values.length) return nearest(d.values, want, (v) => v);
  let n = want;
  if (Number.isFinite(d.min)) n = Math.max(d.min, n);
  if (Number.isFinite(d.max)) n = Math.min(d.max, n);
  return d.integer ? Math.round(n) : n;
}

// entries: URLs (imagens) ou { url, kind: 'image' | 'video' } nas listas mistas
function objectItems(itemSchema, field, entries) {
  const props = itemSchema?.properties || {};
  const req = itemSchema?.required || [];
  const urlKey = ITEM_URL_KEYS.find((k) => props[k]);
  if (!urlKey) return null;
  const singular = field.replace(/s$/, '') || 'item';
  const types = Array.isArray(props.type?.enum) ? props.type.enum : [];
  const items = [];
  for (const [i, entry] of entries.entries()) {
    const url = typeof entry === 'string' ? entry : entry.url;
    const kind = typeof entry === 'string' ? 'image' : entry.kind;
    const item = { [urlKey]: props[urlKey]?.type === 'array' ? [url] : url };
    if (types.includes(kind)) item.type = kind; // quando o item declara o tipo de mídia, vai sempre explícito
    for (const k of req) {
      if (item[k] !== undefined) continue;
      const p = props[k] || {};
      if (p.default !== undefined) item[k] = p.default;
      else if (k === 'type' && Array.isArray(p.enum) && p.enum.includes('image')) item[k] = 'image';
      else if ((k === 'id' || k === 'name') && p.type === 'string') item[k] = `${singular}${i + 1}`;
      else return null;
    }
    items.push(item);
  }
  return items;
}

// Coloca as imagens de referência no campo do modelo (lista de URLs ou lista de objetos)
function putRefs(body, refs, urls) {
  if (refs.shape === 'objects') {
    const items = objectItems(refs.itemSchema, refs.key, urls);
    if (!items) return `Esse modelo pede referências num formato que o app não monta (${refs.key}).`;
    body[refs.key] = items;
  } else body[refs.key] = urls;
  return null;
}

// in: { prompt, start, end, refs: [], videos: [], video, ratio, res, duration, audio } — as mídias já como URLs
//   refs: imagens de referência (modos referência e editar); videos: vídeos de referência; video: o vídeo a editar ou estender
function buildBody(variantId, caps, mode, inp) {
  const body = { model: variantId };
  const used = {}; // o que foi realmente enviado, para mostrar na interface
  const prompt = String(inp.prompt || '').trim();
  if (caps.prompt) {
    if (prompt) body[caps.prompt.key] = prompt;
    else if (caps.prompt.required) return { error: 'Esse modelo precisa de um prompt.' };
  }

  if (mode === 'image') {
    if (!inp.start) return { error: 'Falta a imagem inicial.' };
    if (caps.start) {
      body[caps.start.key] = inp.start;
      if (inp.end) body[caps.end.key] = inp.end;
    } else body[caps.frames.key] = [inp.start, inp.end].filter(Boolean);
  } else if (mode === 'ref') {
    // referências podem ser imagens, vídeos ou os dois, conforme o modelo
    const mixed = !!caps.refs?.mixed;
    const imgs = caps.refs ? (inp.refs || []).slice(0, caps.refs.max) : [];
    let vids;
    if (mixed) {
      // imagens e vídeos dividem a mesma lista e o mesmo limite; com os dois, fica garantida a vaga de pelo menos um vídeo
      const wanted = inp.videos || [];
      if (wanted.length && imgs.length >= caps.refs.max) imgs.length = caps.refs.max - 1;
      vids = wanted.slice(0, caps.refs.max - imgs.length);
    } else vids = caps.video ? (inp.videos || []).slice(0, caps.video.max) : [];
    if (!imgs.length && !vids.length) return { error: 'Faltam as referências.' };
    if (mixed) {
      const entries = [...imgs.map((url) => ({ url, kind: 'image' })), ...vids.map((url) => ({ url, kind: 'video' }))];
      const min = Math.max(1, caps.refs.min || 0);
      if (entries.length < min) return { error: `Esse modelo precisa de pelo menos ${min} referências.` };
      const err = putRefs(body, caps.refs, entries);
      if (err) return { error: err };
    } else {
      if (caps.refs && (imgs.length || caps.refs.required)) {
        const min = Math.max(1, caps.refs.min || 0);
        if (imgs.length < min) return { error: min > 1 ? `Esse modelo precisa de pelo menos ${min} imagens de referência.` : 'Esse modelo precisa de uma imagem de referência.' };
        const err = putRefs(body, caps.refs, imgs);
        if (err) return { error: err };
      }
      if (vids.length) body[caps.video.key] = caps.video.shape === 'string' ? vids[0] : vids;
    }
    used.refs = imgs.length;
    used.videos = vids.length;
  } else if (mode === 'edit' || mode === 'extend') {
    if (!inp.video) return { error: 'Falta o vídeo.' };
    body[caps.video.key] = caps.video.shape === 'string' ? inp.video : [inp.video];
    // na edição, boa parte dos modelos aceita imagens de referência junto do vídeo
    const imgs = mode === 'edit' && caps.refs ? (inp.refs || []).slice(0, caps.refs.max) : [];
    if (imgs.length) {
      const err = putRefs(body, caps.refs, imgs);
      if (err) return { error: err };
    }
    used.refs = imgs.length;
  }

  const r = inp.ratio && inp.ratio !== 'auto' ? parseRatio(inp.ratio) : null;
  const wantH = resHeight(inp.res) || 720;
  if (caps.size) {
    // um campo só para proporção e resolução ("1280*720")
    const sizes = caps.size.values.map((v) => ({ v, m: String(v).match(SIZE_RE) })).filter((o) => o.m).map((o) => ({ v: o.v, w: Number(o.m[1]), h: Number(o.m[2]) }));
    if (sizes.length) {
      const target = r ?? 16 / 9;
      const minD = Math.min(...sizes.map((s) => dist(s.w / s.h, target)));
      const group = sizes.filter((s) => dist(s.w / s.h, target) - minD < 0.03);
      group.sort((a, b) => dist(Math.min(a.w, a.h), wantH) - dist(Math.min(b.w, b.h), wantH));
      body[caps.size.key] = group[0].v;
      used.size = group[0].v;
    }
  }
  if (caps.ratio) {
    // editar e estender seguem a proporção do vídeo de entrada
    const follow = mode === 'edit' || mode === 'extend';
    const auto = caps.ratio.values ? caps.ratio.values.find((v) => AUTO_RE.test(String(v))) : undefined;
    let v;
    if (r != null && !follow) v = caps.ratio.values ? nearest(caps.ratio.values, r, parseRatio) : inp.ratio;
    else if (auto !== undefined && mode !== 'text') v = auto; // "automática": acompanha a mídia de entrada
    if (v === undefined && caps.ratio.needed) v = caps.ratio.values ? nearest(caps.ratio.values, 16 / 9, parseRatio) : '16:9';
    if (v !== undefined) { body[caps.ratio.key] = v; used.ratio = v; }
  }
  if (caps.res) {
    const v = nearest(caps.res.values, wantH, resHeight);
    if (v !== undefined) { body[caps.res.key] = v; used.res = v; }
  }
  // na edição o vídeo editado mantém a duração do original
  if (caps.duration && Number(inp.duration) > 0 && mode !== 'edit') {
    const n = pickDuration(caps.duration, Number(inp.duration));
    if (n !== undefined) { body[caps.duration.key] = caps.duration.asString ? String(n) : n; used.duration = n; }
  }
  if (caps.audio && typeof inp.audio === 'boolean') {
    const v = inp.audio ? caps.audio.on : caps.audio.off;
    if (v !== undefined) { body[caps.audio.key] = v; used.audio = inp.audio; }
  }
  for (const [k, v] of Object.entries(caps.defaults || {})) if (body[k] === undefined) body[k] = v;
  return { body, used };
}

// O que a interface precisa saber de cada variante
function publicCaps(c) {
  if (!c) return null;
  return {
    known: c.known,
    usable: c.usable,
    start: !!(c.start || c.frames),
    end: !!(c.end || (c.frames && c.frames.max >= 2)),
    endRequired: !!(c.end?.required || (c.frames && c.frames.min >= 2)),
    refs: c.refs ? c.refs.max : 0,
    refsMin: c.refs ? Math.max(1, c.refs.min) : 0,
    refsRequired: !!c.refs?.required && !c.refs.mixed, // exige imagem (numa lista mista, um vídeo também serve)
    video: !!c.video,
    // quantos vídeos aceita (na variante de referência, são vídeos de referência; na lista mista, o limite é o da lista)
    videos: c.video ? c.video.max : c.refs?.mixed ? c.refs.max : 0,
    audio: !!c.audio,
    // durações que o modelo aceita: uma lista fechada ({ values }) ou uma faixa ({ min, max }); null = o modelo decide
    dur: !c.duration ? null
      : c.duration.values && c.duration.values.length ? { values: c.duration.values }
        : { min: Number.isFinite(c.duration.min) ? c.duration.min : null, max: Number.isFinite(c.duration.max) ? c.duration.max : null },
  };
}

module.exports = { MODES, buildFamilies, defaultEnabled, analyze, supports, pickVariant, whyNot, buildBody, publicCaps, parseVariant, cleanName, resHeight };
