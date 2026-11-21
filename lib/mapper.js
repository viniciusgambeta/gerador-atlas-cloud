// Traduz o catálogo do Atlas Cloud para "famílias" de modelo e monta o corpo
// de cada requisição a partir do schema OpenAPI do modelo.
//
// Cada modelo do Atlas declara parâmetros diferentes (aspect_ratio, size,
// image_size, width/height, resolution, quality...). Em vez de fixar nomes,
// classificamos os campos pelo formato dos valores e mapeamos as três escolhas
// da interface (proporção, qualidade, referências) para o que o modelo aceita.

const EXCLUDE_RE = /(upscal|super-?res|remove-?b(ack)?g|background-remov|bg-remov|face-?swap|-to-3d|(^|[^a-z])3d([^a-z]|$)|vectori[sz]|matting|segment|lip-?sync)/i;

const KIND_PATTERNS = [
  [/^(text-to-image|t2i|txt2img|text2image|generate|generation|image-generation)(?:-(.+))?$/i, 't2i'],
  [/^(image-edit|edit|image-to-image|i2i|img2img|editing|reference-to-image|ref-to-image|multi-reference|image-reference|reference)(?:-(.+))?$/i, 'edit'],
];

function categoryKind(m) {
  const s = [...(m.categories || []), ...(m.tags || [])]
    .filter((x) => typeof x === 'string')
    .map((x) => x.toLowerCase().replace(/_/g, '-'));
  if (s.some((x) => x.includes('text-to-image'))) return 't2i';
  if (s.some((x) => x.includes('image-to-image') || x.includes('image-edit') || x === 'edit')) return 'edit';
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
    let matched = false;
    for (const [re, k] of KIND_PATTERNS) {
      const mm = rest.match(re);
      if (mm) { kind = k; mod = mm[2] || ''; matched = true; break; }
    }
    if (!matched) mod = rest;
  } else {
    const mm = base.match(/^(.*)-(edit|image-edit|i2i|img2img|image-to-image|t2i|text-to-image)$/i);
    if (mm) { base = mm[1]; kind = /t2i|text-to-image/i.test(mm[2]) ? 't2i' : 'edit'; }
  }
  if (!kind) kind = categoryKind(m) || 't2i';
  return { org, base, mod, kind, family: `${org}/${base}${mod ? '#' + mod : ''}` };
}

function cleanName(n) {
  return String(n || '')
    .replace(/\b(reference[- ]?to[- ]?image|text[- ]?to[- ]?image|image[- ]?to[- ]?image|t2i|i2i|image[- ]edit|edit|editing)\b/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–:]+$/g, '')
    .trim();
}

function priceOf(m) {
  const p = m.price || {};
  const v = p.actual?.base_price ?? p.origin?.base_price ?? m.basePrice;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isCandidate(m) {
  if (m.type !== 'Image') return false;
  if (m.display_console === false) return false;
  const tags = (m.tags || []).filter((t) => typeof t === 'string');
  if (tags.some((t) => /3d/i.test(t))) return false;
  const hay = `${m.model} ${m.displayName || ''}`;
  return !EXCLUDE_RE.test(hay);
}

// Agrupa as variantes texto→imagem e edição de um mesmo modelo
function buildFamilies(models) {
  const fams = new Map();
  for (const m of models) {
    if (!isCandidate(m)) continue;
    const v = parseVariant(m);
    let key = v.family;
    let fam = fams.get(key);
    if (fam && fam.variants[v.kind]) {
      // colisão: duas variantes do mesmo tipo — vira família própria
      key = `${v.family}~${m.model}`;
      fam = null;
    }
    if (!fam) {
      fam = {
        key,
        org: v.org,
        provider: m.organization || v.org,
        name: '',
        avatar: m.avatar || '',
        priority: Number(m.priority) || 0,
        variants: {},
      };
      fams.set(key, fam);
    }
    fam.variants[v.kind] = {
      id: m.model,
      kind: v.kind,
      price: priceOf(m),
      schema: m.schema || null,
      displayName: m.displayName || m.model,
    };
    if (!fam.avatar && m.avatar) fam.avatar = m.avatar;
    fam.priority = Math.max(fam.priority, Number(m.priority) || 0);
  }
  for (const fam of fams.values()) {
    const src = fam.variants.t2i || fam.variants.edit;
    fam.name = cleanName(src.displayName) || src.id.split('/')[1];
    // "Nano Banana 2" e "Nano Banana 2 Developer" precisam continuar distinguíveis
    if (fam.key.includes('#')) {
      const mod = fam.key.split('#')[1].split('~')[0];
      const pretty = mod.replace(/[-_]+/g, ' ');
      if (!fam.name.toLowerCase().includes(pretty.toLowerCase().split(' ')[0])) fam.name = `${fam.name} ${pretty}`;
    }
  }
  return [...fams.values()].sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

// Famílias ativadas no primeiro uso, se existirem no catálogo
const DEFAULT_PICKS = [
  /^google\/nano-banana-pro$/,
  /^google\/nano-banana-2$/,
  /^bytedance\/seedream-v5/,
  /^openai\/gpt-image/,
  /^black-forest-labs\/flux-2-pro/,
  /^xai\/grok-imagine-image$/,
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

const PROMPT_FIELDS = ['prompt', 'text', 'text_prompt', 'user_prompt', 'positive_prompt'];
const IMAGE_FIELDS = [
  'images', 'image_urls', 'reference_images', 'reference_image_urls', 'image', 'image_url',
  'input_image', 'input_images', 'init_image', 'source_image', 'subject_image', 'product_image',
  'subjects', 'refers',
];
const ITEM_URL_KEYS = ['url', 'image', 'images', 'image_url', 'file'];
const COUNT_FIELDS = /^(num_images|n|num_outputs|number_of_images|batch_size|image_num|max_images|num)$/i;

const RATIO_RE = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/;
const SIZE_RE = /^\s*(\d{2,5})\s*[x*×X]\s*(\d{2,5})\s*$/;
const K_RE = /^\s*(\d+(?:\.\d+)?)\s*k\s*$/i;
const P_RE = /^\s*(\d{3,4})\s*p\s*$/i;
const AUTO_RE = /^(auto|match_input_image|match_input|original|adaptive|default|smart)$/i;
const NAMED = {
  square: 1, square_hd: 1,
  portrait: 3 / 4, portrait_4_3: 3 / 4, portrait_3_2: 2 / 3, portrait_16_9: 9 / 16, portrait_2_3: 2 / 3,
  landscape: 4 / 3, landscape_4_3: 4 / 3, landscape_3_2: 3 / 2, landscape_16_9: 16 / 9, landscape_21_9: 21 / 9,
};
const QUALITY_RANK = { low: 0, fast: 0, turbo: 0, draft: 0, medium: 1, standard: 1, balanced: 1, default: 1, normal: 1, high: 2, hd: 2, quality: 2, ultra: 3, max: 3 };
const TIER_PIXELS = [1024 * 1024, 2048 * 2048, 4096 * 4096];
const TIER_K = [1, 2, 4];

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

function share(values, re) {
  const strs = values.filter((v) => typeof v === 'string' && !AUTO_RE.test(v));
  if (!strs.length) return 0;
  return strs.filter((v) => re.test(v)).length / strs.length;
}

function isStringish(p) {
  if (!p) return false;
  if (p.type === 'string') return true;
  const br = p.anyOf || p.oneOf;
  return Array.isArray(br) && br.some((b) => b.type === 'string');
}

function mediaCapable(p) {
  if (!p) return false;
  if (p.type === 'string') return !p.enum;
  if (p.type === 'array') return p.items?.type === 'string' || p.items?.type === 'object';
  return false;
}

function findPromptField(props) {
  return PROMPT_FIELDS.find((k) => props[k]) ??
    Object.keys(props).find((k) => props[k]?.type === 'string' && !props[k]?.enum && /prompt/i.test(k) && !/negative/i.test(k));
}

function findMedia(props, required) {
  const cands = IMAGE_FIELDS.filter((k) => mediaCapable(props[k]));
  if (!cands.length) return null;
  const ordered = [...cands.filter((k) => required.includes(k)), ...cands.filter((k) => !required.includes(k))];
  const key = ordered[0];
  const p = props[key];
  if (p.type === 'array') {
    return {
      key,
      shape: p.items?.type === 'object' ? 'objects' : 'array',
      max: Number.isFinite(p.maxItems) ? p.maxItems : 10,
      required: required.includes(key),
      itemSchema: p.items,
    };
  }
  // campo único: as demais imagens transbordam para outros campos de imagem únicos
  const spill = ordered.slice(1).filter((k) => props[k]?.type === 'string');
  return { key, shape: 'string', spill, max: 1 + spill.length, required: required.includes(key) };
}

function descRange(desc) {
  const nums = String(desc || '').replace(/,/g, '').match(/\d{6,}/g);
  if (!nums || nums.length < 2) return null;
  const v = nums.map(Number).sort((a, b) => a - b);
  return [v[0], v[v.length - 1]];
}

function classifySizing(props) {
  const roles = {};
  for (const [key, p] of Object.entries(props)) {
    if (/media|mask|thumb|video|audio|frame/i.test(key)) continue;
    const e = enumOf(p);
    if (e && e.length) {
      if (share(e, RATIO_RE) >= 0.5) roles.ratio ??= { key, values: e };
      else if (share(e, SIZE_RE) >= 0.5) roles.size ??= { key, values: e };
      else if (share(e, /^(square|portrait|landscape)/i) >= 0.5) roles.named ??= { key, values: e };
      else if (share(e, K_RE) >= 0.5 || (share(e, P_RE) >= 0.5 && /resolution|quality|size/i.test(key))) roles.res ??= { key, values: e };
      else if (/^(quality|image_quality|output_quality|rendering_speed)$/i.test(key) && e.some((v) => typeof v === 'string' && QUALITY_RANK[v.toLowerCase()] !== undefined)) roles.quality ??= { key, values: e };
      continue;
    }
    if ((p.type === 'integer' || p.type === 'number')) {
      if (/^(width|image_width)$/i.test(key)) roles.width = { key, min: p.minimum, max: p.maximum, def: p.default };
      else if (/^(height|image_height)$/i.test(key)) roles.height = { key, min: p.minimum, max: p.maximum, def: p.default };
      else if (COUNT_FIELDS.test(key) && p.type === 'integer') roles.count = { key, min: p.minimum, max: p.maximum, def: p.default };
      continue;
    }
    if (isStringish(p)) {
      if (/^(aspect_ratio|ratio|aspectratio|image_aspect_ratio)$/i.test(key)) roles.ratioFree ??= { key };
      else if (/^(size|image_size|output_size|resolution)$/i.test(key)) {
        const def = String(p.default ?? '');
        const looks = SIZE_RE.test(def) || /width|pixel|\d+\s*[x*]\s*\d+/i.test(p.description || '');
        if (looks) {
          let sep = '*';
          const dm = def.match(/\d\s*([x*×])\s*\d/) || String(p.description || '').match(/\d\s*([x*])\s*\d/);
          if (dm) sep = dm[1];
          roles.sizeFree ??= { key, sep, range: descRange(p.description), def };
        }
      }
    }
  }
  return roles;
}

function analyzeSchema(schema) {
  const input = inputOf(schema);
  if (!input) return { known: false, usable: true, acceptsImages: false, requiresImages: false, maxImages: 0 };
  const props = input.properties;
  const required = (input.required || []).filter((k) => k !== 'model');
  const promptField = findPromptField(props);
  const media = findMedia(props, required);
  const sizing = classifySizing(props);
  const mediaKeys = media ? [media.key, ...(media.spill || [])] : [];
  const unfillable = required.filter((k) => k !== promptField && !mediaKeys.includes(k) && props[k]?.default === undefined);
  return {
    known: true,
    promptField: promptField || null,
    media,
    sizing,
    acceptsImages: !!media,
    requiresImages: !!media?.required,
    maxImages: media ? media.max : 0,
    usable: !!promptField && unfillable.length === 0,
    unfillable,
    required,
    defaults: Object.fromEntries(required.filter((k) => props[k]?.default !== undefined).map((k) => [k, props[k].default])),
  };
}

/* ------------------------------------------------------------------ */
/* Mapeamento proporção / qualidade                                    */
/* ------------------------------------------------------------------ */

function parseRatio(s) {
  const m = String(s).match(RATIO_RE);
  if (!m) return null;
  const r = Number(m[1]) / Number(m[2]);
  return Number.isFinite(r) && r > 0 ? r : null;
}

function parseSize(s) {
  const m = String(s).match(SIZE_RE);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

const dist = (a, b) => Math.abs(Math.log(a) - Math.log(b));

function autoValue(values) {
  return values.find((v) => typeof v === 'string' && /^(auto|match_input_image|match_input|adaptive)$/i.test(v));
}

function pickRatio(values, r) {
  if (r == null) return autoValue(values);
  let best; let bestD = Infinity;
  for (const v of values) {
    const vr = parseRatio(v);
    if (vr == null) continue;
    const d = dist(vr, r);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

function pickSize(values, r, tier) {
  const opts = values.map((v) => ({ v, s: parseSize(v) })).filter((o) => o.s);
  if (r == null) return autoValue(values);
  if (!opts.length) return undefined;
  const withD = opts.map((o) => ({ ...o, d: dist(o.s.w / o.s.h, r), px: o.s.w * o.s.h }));
  const minD = Math.min(...withD.map((o) => o.d));
  const group = withD.filter((o) => o.d - minD < 0.03);
  group.sort((a, b) => dist(a.px, TIER_PIXELS[tier]) - dist(b.px, TIER_PIXELS[tier]));
  return group[0].v;
}

function pickNamed(values, r, tier) {
  if (r == null) return autoValue(values);
  let best; let bestScore = Infinity;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const nr = NAMED[v.toLowerCase()];
    if (nr === undefined) continue;
    const hd = /_hd$/i.test(v);
    const score = dist(nr, r) + ((tier > 0) !== hd ? 0.001 : 0);
    if (score < bestScore) { bestScore = score; best = v; }
  }
  return best;
}

function pickRes(values, tier) {
  let best; let bestD = Infinity;
  for (const v of values) {
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    let k = null;
    const km = String(v).match(K_RE);
    const pm = String(v).match(P_RE);
    if (km) k = Number(km[1]);
    else if (pm) k = Number(pm[1]) / 1000 * 1.78;
    if (!k) continue;
    const d = dist(k, TIER_K[tier]);
    if (d < bestD - 1e-9) { bestD = d; best = v; }
  }
  return best;
}

function pickQuality(values, tier) {
  const target = [1, 2, 3][tier];
  let best; let bestD = Infinity;
  for (const v of values) {
    const rank = typeof v === 'string' ? QUALITY_RANK[v.toLowerCase()] : undefined;
    if (rank === undefined) continue;
    const d = Math.abs(rank - target);
    if (d < bestD || (d === bestD && rank > (QUALITY_RANK[String(best).toLowerCase()] ?? -1))) { bestD = d; best = v; }
  }
  return best;
}

function dimsFor(r, px, step, minSide, maxSide, minPx, maxPx) {
  let w = Math.sqrt(px * r);
  let h = w / r;
  const hi = maxSide ?? Infinity;
  const lo = minSide ?? 0;
  const down = Math.min(1, hi / Math.max(w, h));
  w *= down; h *= down;
  const up = Math.max(1, lo / Math.min(w, h));
  w *= up; h *= up;
  w = Math.max(step, Math.round(w / step) * step);
  h = Math.max(step, Math.round(h / step) * step);
  // o arredondamento não pode estourar os limites do modelo
  let guard = 0;
  while ((w * h > (maxPx ?? Infinity) || Math.max(w, h) > hi) && guard++ < 200) {
    if (w / h > r) w -= step; else h -= step;
  }
  guard = 0;
  while (w * h < (minPx ?? 0) && guard++ < 200) {
    if (w / h < r) w += step; else h += step;
  }
  return { w, h };
}

function applySizing(sizing, ratio, tier) {
  const out = {};
  const r = ratio && ratio !== 'auto' ? parseRatio(ratio) : null;
  if (sizing.ratio) {
    const v = pickRatio(sizing.ratio.values, r);
    if (v !== undefined) out[sizing.ratio.key] = v;
  } else if (sizing.ratioFree && r != null) {
    out[sizing.ratioFree.key] = ratio;
  }
  if (sizing.size) {
    const v = pickSize(sizing.size.values, r, tier);
    if (v !== undefined) out[sizing.size.key] = v;
  } else if (sizing.named) {
    const v = pickNamed(sizing.named.values, r, tier);
    if (v !== undefined) out[sizing.named.key] = v;
  } else if (sizing.sizeFree && r != null && !sizing.ratio) {
    const range = sizing.sizeFree.range;
    let px = TIER_PIXELS[tier];
    if (range) px = Math.min(range[1], Math.max(range[0], px));
    const { w, h } = dimsFor(r, px, 16, null, null, range?.[0], range?.[1]);
    out[sizing.sizeFree.key] = `${w}${sizing.sizeFree.sep}${h}`;
  } else if (sizing.width && sizing.height && r != null && !sizing.ratio) {
    const max = Math.min(sizing.width.max ?? 4096, sizing.height.max ?? 4096);
    const min = Math.max(sizing.width.min ?? 64, sizing.height.min ?? 64);
    const px = Math.min(TIER_PIXELS[tier], max * max);
    const { w, h } = dimsFor(r, px, 16, min, max);
    out[sizing.width.key] = w;
    out[sizing.height.key] = h;
  }
  if (sizing.res) {
    const v = pickRes(sizing.res.values, tier);
    if (v !== undefined) out[sizing.res.key] = v;
  }
  if (sizing.quality) {
    const v = pickQuality(sizing.quality.values, tier);
    if (v !== undefined) out[sizing.quality.key] = v;
  }
  if (sizing.count) {
    out[sizing.count.key] = Math.max(1, sizing.count.min ?? 1);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Imagens de referência                                               */
/* ------------------------------------------------------------------ */

function objectItems(itemSchema, field, urls) {
  const props = itemSchema?.properties || {};
  const req = itemSchema?.required || [];
  const urlKey = ITEM_URL_KEYS.find((k) => props[k]);
  if (!urlKey) return null;
  const singular = field.replace(/s$/, '') || 'item';
  const items = [];
  for (const [i, url] of urls.entries()) {
    const item = { [urlKey]: props[urlKey]?.type === 'array' ? [url] : url };
    for (const k of req) {
      if (item[k] !== undefined) continue;
      const p = props[k] || {};
      if (p.default !== undefined) item[k] = p.default;
      else if (k === 'type' && Array.isArray(p.enum) && p.enum.includes('image')) item[k] = 'image';
      else if (k === 'id' && p.type === 'string') item[k] = `${singular}${i + 1}`;
      else return null;
    }
    items.push(item);
  }
  return items;
}

function assignImages(body, media, urls) {
  const list = urls.slice(0, media.max);
  if (media.shape === 'array') { body[media.key] = list; return null; }
  if (media.shape === 'objects') {
    const items = objectItems(media.itemSchema, media.key, list);
    if (!items) return `Este modelo pede referências num formato que o app não monta (${media.key}).`;
    body[media.key] = items;
    return null;
  }
  body[media.key] = list[0];
  media.spill.forEach((k, i) => { if (list[i + 1]) body[k] = list[i + 1]; });
  return null;
}

// Monta o corpo final da requisição
function buildBody(variantId, caps, { prompt, refUrls, ratio, tier }) {
  const body = { model: variantId };
  if (!caps.known) {
    body.prompt = prompt;
    if (refUrls.length) body.images = refUrls;
    if (ratio && ratio !== 'auto') body.aspect_ratio = ratio;
    return { body };
  }
  const input = caps;
  body[input.promptField] = prompt;
  if (refUrls.length && input.media) {
    const err = assignImages(body, input.media, refUrls);
    if (err) return { error: err };
  }
  Object.assign(body, applySizing(input.sizing, ratio, tier));
  for (const [k, v] of Object.entries(input.defaults || {})) if (body[k] === undefined) body[k] = v;
  return { body };
}

// Escolhe a variante (texto→imagem ou edição) conforme haja referências
function pickVariant(fam, capsById, hasRefs) {
  const t2i = fam.variants.t2i;
  const edit = fam.variants.edit;
  const c = (v) => (v ? capsById[v.id] || { known: false, usable: true, acceptsImages: v.kind === 'edit', requiresImages: v.kind === 'edit' } : null);
  const ct = c(t2i);
  const ce = c(edit);
  if (hasRefs) {
    if (edit && ce.usable && ce.acceptsImages) return edit;
    if (t2i && ct.usable && ct.acceptsImages) return t2i;
    return null;
  }
  if (t2i && ct.usable && !ct.requiresImages) return t2i;
  if (edit && ce.usable && !ce.requiresImages) return edit;
  return null;
}

module.exports = {
  buildFamilies,
  defaultEnabled,
  analyzeSchema,
  applySizing,
  buildBody,
  pickVariant,
  parseVariant,
  cleanName,
};
