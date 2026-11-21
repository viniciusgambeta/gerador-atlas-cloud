// Ferramentas de um clique sobre um resultado já gerado. São modelos do Atlas Cloud que não pedem
// prompt, só o arquivo de entrada:
//   upscale   aumentar a resolução de uma imagem
//   rembg     remover o fundo de uma imagem
//   vupscale  aumentar a resolução de um vídeo
//   avatar    fazer uma foto falar (foto + áudio → vídeo)
//   lipsync   refazer a boca de um vídeo para acompanhar um áudio (vídeo + áudio → vídeo)

const TOOLS = {
  upscale: { type: 'Image', re: /upscal/i, label: 'Aumentar resolução', needs: ['image'], out: 'image' },
  rembg: { type: 'Image', re: /remove-?background|background-?remov/i, label: 'Remover fundo', needs: ['image'], out: 'image' },
  vupscale: { type: 'Video', re: /upscal/i, label: 'Aumentar resolução', needs: ['video'], out: 'video' },
  avatar: { type: 'Video', re: /avatar|audio-to-video|fabric-1|infinitetalk/i, not: /digital-twin/i, label: 'Vídeo falante', needs: ['image', 'audio'], out: 'video' },
  lipsync: { type: 'Video', re: /lip-?sync/i, label: 'Sincronizar a boca', needs: ['video', 'audio'], out: 'video' },
};

// nomes que os modelos dão ao campo de cada tipo de entrada
const FIELD = {
  image: ['image', 'image_url', 'input_image', 'first_frame_url'],
  video: ['video', 'video_url', 'input_video'],
  audio: ['audio', 'audio_url', 'input_audio'],
};

function priceOf(m) {
  const p = m.price && (m.price.actual || m.price.origin);
  const n = p ? Number(p.base_price) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Modelos do catálogo que fazem a ferramenta, do mais barato para o mais caro
function candidates(models, tool) {
  const t = TOOLS[tool];
  if (!t) return [];
  return models
    .filter((m) => m.type === t.type && m.display_console !== false && t.re.test(m.model) && !(t.not && t.not.test(m.model)))
    .map((m) => ({ id: m.model, tool, name: m.displayName || m.model, avatar: m.avatar || '', provider: m.organization || '', price: priceOf(m), schema: m.schema || null }))
    .sort((a, b) => (a.price ?? 9e9) - (b.price ?? 9e9));
}

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
  return null;
}

function analyze(schema, tool) {
  const t = TOOLS[tool];
  const caps = { known: false, usable: false, inputs: {}, defaults: {}, unfillable: [] };
  const body = requestSchema(schema);
  if (!t || !body || !body.properties) return caps;
  caps.known = true;
  const props = body.properties;
  const required = new Set(body.required || []);
  const taken = new Set(['model']);
  for (const kind of t.needs) {
    const key = FIELD[kind].find((k) => props[k] && deref(schema, props[k]).type === 'string');
    if (key) { caps.inputs[kind] = key; taken.add(key); } else caps.unfillable.push(kind);
  }
  for (const k of required) {
    if (taken.has(k)) continue;
    const p = deref(schema, props[k]);
    if (p.default !== undefined && p.default !== null && p.default !== '') caps.defaults[k] = p.default;
    else if (Array.isArray(p.enum) && p.enum.length) caps.defaults[k] = p.enum[0];
    else caps.unfillable.push(k);
  }
  // um campo de entrada obrigatório que a ferramenta não tem como preencher (ex.: avatar que exige vídeo)
  for (const [kind, names] of Object.entries(FIELD)) {
    if (t.needs.includes(kind)) continue;
    for (const k of names) if (required.has(k)) caps.unfillable.push(k);
  }
  // o padrão de alguns ampliadores é 1× (não aumenta nada): pede o dobro
  if (tool === 'upscale' && props.outscale) caps.defaults.outscale = 2;
  caps.usable = caps.unfillable.length === 0;
  return caps;
}

// urls: { image, video, audio } com os endereços já enviados ao Atlas
function buildBody(id, caps, urls) {
  if (!caps || !caps.usable) return { error: 'Esse modelo pede campos que o app não preenche.' };
  const body = { model: id };
  for (const [kind, key] of Object.entries(caps.inputs)) {
    if (!urls[kind]) return { error: 'Falta um arquivo de entrada.' };
    body[key] = urls[kind];
  }
  for (const [k, v] of Object.entries(caps.defaults)) if (body[k] === undefined) body[k] = v;
  return { body };
}

module.exports = { TOOLS, candidates, analyze, buildBody };
