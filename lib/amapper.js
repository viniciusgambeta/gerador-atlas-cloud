// Modelos de áudio do Atlas Cloud: fala (texto → voz), música, efeitos sonoros e transcrição.
// Cada modelo tem campos próprios; aqui o schema é lido e traduzido para o que o painel oferece.

const MODES = ['speech', 'music', 'sfx', 'stt'];

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

// Em qual modo do painel o modelo aparece (null = fica de fora)
function kindOf(m) {
  const id = String(m.model || '').toLowerCase();
  const tags = (m.tags || []).map((t) => String(t).toUpperCase());
  const cats = (m.categories || []).map((c) => String(c).toUpperCase());
  if (tags.includes('VOICE-CLONE') || /custom-voice|voice-clone/.test(id)) return null; // cria uma voz, não um áudio
  if (/lyrics/.test(id)) return null; // devolve só o texto da letra
  if (cats.includes('SPEECH-TO-TEXT') || /\b(stt|asr)\b/.test(id.replace(/[-_/]/g, ' '))) return 'stt';
  if (tags.some((t) => /MUSIC/.test(t)) || /music|suno|chirp|song/.test(id)) return 'music';
  if (tags.includes('SOUND-EFFECTS') || /sfx|sound-effect/.test(id)) return 'sfx';
  if (cats.includes('TEXT-TO-SPEECH') || /tts|speech/.test(id)) return 'speech';
  if (cats.includes('TEXT-TO-AUDIO')) return 'sfx';
  return null;
}

function priceOf(m) {
  const p = m.price && (m.price.actual || m.price.origin);
  const n = p ? Number(p.base_price) : NaN;
  return { price: Number.isFinite(n) && n > 0 ? n : null, unit: (p && p.unit) || '' };
}

function cleanName(m) {
  return String(m.displayName || m.model)
    .replace(/\s*[-–]?\s*Text[- ]to[- ](Speech|Music|Sound[- ]Effects|Audio)\b/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || m.model;
}

// Cada modelo de áudio é uma "família" de uma variante só (o mesmo formato das de imagem e vídeo)
function buildFamilies(models) {
  const out = [];
  for (const m of models) {
    if (m.type !== 'Audio' || m.display_console === false) continue;
    const kind = kindOf(m);
    if (!kind) continue;
    const { price, unit } = priceOf(m);
    out.push({
      key: m.model,
      name: cleanName(m),
      provider: m.organization || m.model.split('/')[0],
      avatar: m.avatar || '',
      kind,
      priority: Number(m.priority) || 0,
      variants: { main: { id: m.model, audio: true, kind, price, unit, schema: m.schema || null } },
    });
  }
  return out.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// Ligados no primeiro uso: pelo menos um de cada modo
const DEFAULT_PICKS = [
  /^xai\/tts-v1$/, /^elevenlabs\/v4-turbo\//, /^minimax\/speech-2\.8-turbo$/, /^google\/gemini-2\.5-flash-tts$/,
  /^minimax\/music-3\.0$/, /^elevenlabs\/music-v2\.5\/text-to-music$/, /^suno\/chirp-v6$/,
  /^elevenlabs\/sfx/, /^xai\/stt-v1$/,
];

function defaultEnabled(families) {
  const out = [];
  for (const re of DEFAULT_PICKS) {
    const f = families.find((x) => re.test(x.key));
    if (f && !out.includes(f.key)) out.push(f.key);
  }
  for (const mode of MODES) {
    if (families.some((f) => f.kind === mode && out.includes(f.key))) continue;
    const cheapest = families.filter((f) => f.kind === mode).sort((a, b) => (a.variants.main.price ?? 9) - (b.variants.main.price ?? 9))[0];
    if (cheapest) out.push(cheapest.key);
  }
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
  return null;
}

function analyze(schema) {
  const caps = {
    known: false, usable: true, unfillable: [],
    text: null, lyrics: null, voice: null, speed: null, lang: null, instrumental: null,
    duration: null, loop: null, audioIn: null, optimizer: null, custom: null, refAudio: null, defaults: {},
  };
  const body = requestSchema(schema);
  if (!body || !body.properties) return caps;
  caps.known = true;
  const required = new Set(body.required || []);
  const props = body.properties;
  for (const [k, raw] of Object.entries(props)) {
    const p = deref(schema, raw);
    const req = required.has(k);
    const isEnum = Array.isArray(p.enum) && p.enum.length > 0;
    if (k === 'model') continue;
    if (k === 'text' || k === 'prompt') {
      if (!caps.text || k === 'text') caps.text = { key: k, max: p.maxLength || 0, required: req };
    } else if (k === 'lyrics') {
      caps.lyrics = { key: k, max: p.maxLength || 0 };
    } else if (k === 'lyrics_optimizer') {
      caps.optimizer = k;
    } else if ((k === 'voice' || k === 'voice_id') && isEnum) {
      const info = p['x-enum-options'] || {};
      caps.voice = {
        key: k,
        // alguns modelos (ElevenLabs v4) aceitam também o ID de uma voz que não está na lista, como uma voz clonada
        custom: p['x-ui-allow-custom'] === true,
        default: p.default !== undefined ? p.default : p.enum[0],
        list: p.enum.map((v) => { const o = info[v] || {}; return { v, name: o.name || '', gender: o.gender || '', lang: o.language || '', sample: o.example || '' }; }),
      };
    } else if (k === 'speed' && (p.type === 'number' || p.type === 'integer')) {
      caps.speed = { key: k, min: p.minimum ?? 0.5, max: p.maximum ?? 2 };
    } else if (/^language(_boost|_code|_hints)?$/.test(k)) {
      const item = p.type === 'array' ? deref(schema, p.items) : p;
      caps.lang = { key: k, array: p.type === 'array', values: Array.isArray(item.enum) ? item.enum.map(String) : null, required: req, default: p.default };
    } else if (/^(is_|force_)?instrumental$/.test(k)) {
      caps.instrumental = { key: k };
    } else if (k === 'duration' && (p.type === 'integer' || p.type === 'number')) {
      caps.duration = { key: k, min: p.minimum ?? 1, max: p.maximum ?? 600, default: p.default ?? null };
    } else if (k === 'loop' && p.type === 'boolean') {
      caps.loop = { key: k };
    } else if ((k === 'audio' || k === 'audio_url') && p.type === 'string') {
      caps.audioIn = { key: k };
    } else if (k === 'custom' && p.type === 'boolean' && props.style) {
      caps.custom = { key: k, style: 'style' };
    } else if (k === 'references' && p.type === 'array' && deref(schema, p.items).properties && deref(schema, p.items).properties.audio_url) {
      // áudio de referência: o modelo fala com a voz de uma amostra (clonagem a partir de um áudio)
      caps.refAudio = { key: k, field: 'audio_url' };
    } else if (req) {
      // campo obrigatório que o painel não tem: usa o padrão do modelo, se houver
      if (p.default !== undefined && p.default !== null && p.default !== '') caps.defaults[k] = p.default;
      else if (isEnum) caps.defaults[k] = p.enum[0];
      else caps.unfillable.push(k);
    }
  }
  if (!caps.text && !caps.audioIn) caps.unfillable.push('texto');
  caps.usable = caps.unfillable.length === 0;
  return caps;
}

// O que a tela precisa saber de cada modelo
function publicCaps(c) {
  if (!c) return null;
  return {
    known: c.known,
    usable: c.usable,
    textMax: c.text ? c.text.max : 0,
    voice: c.voice ? { default: c.voice.default, list: c.voice.list, custom: !!c.voice.custom } : null,
    voiceFromAudio: !!c.refAudio,
    speed: c.speed ? { min: c.speed.min, max: c.speed.max } : null,
    lang: !!c.lang,
    lyrics: !!(c.lyrics || c.custom),
    instrumental: !!c.instrumental,
    duration: c.duration ? { min: c.duration.min, max: c.duration.max, default: c.duration.default } : null,
    loop: !!c.loop,
    audioIn: !!c.audioIn,
  };
}

/* ------------------------------------------------------------------ */
/* Corpo da requisição                                                 */
/* ------------------------------------------------------------------ */

// O painel oferece poucos idiomas; cada modelo escreve o mesmo idioma de um jeito
const LANGS = {
  pt: { codes: ['pt-BR', 'pt', 'pt-PT'], name: 'Portuguese', say: 'Brazilian Portuguese' },
  en: { codes: ['en', 'en-US', 'en-GB'], name: 'English', say: 'English' },
  es: { codes: ['es', 'es-MX', 'es-ES'], name: 'Spanish', say: 'Spanish' },
};

function langValue(l, want) {
  const L = LANGS[want];
  if (!l || !L) return undefined;
  if (l.values) {
    const hit = [...L.codes, L.name].map((c) => l.values.find((v) => v.toLowerCase() === c.toLowerCase())).find(Boolean);
    return hit === undefined ? undefined : l.array ? [hit] : hit;
  }
  // texto livre: "language_code" pede o código de duas letras; "language" pede idioma e região
  const code = l.key === 'language' ? L.codes.find((c) => c.includes('-')) : want;
  return l.array ? [code] : code;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// inp: { text, lyrics, voice, voiceRefUrl, speed, lang, instrumental, duration, loop, audioUrl }
//   voice: uma voz da lista do modelo ou, nos modelos que aceitam, o ID de outra voz (ex.: clonada no ElevenLabs)
//   voiceRefUrl: amostra de áudio cuja voz o modelo deve imitar (só nos modelos com áudio de referência)
function buildBody(id, caps, inp) {
  if (!caps || !caps.usable) return { error: 'Esse modelo pede campos que o app não preenche.' };
  const body = { model: id };
  const used = {};
  const text = String(inp.text || '').trim();
  const lyrics = String(inp.lyrics || '').trim();
  const cut = (s, max) => (max && s.length > max ? s.slice(0, max) : s);

  if (caps.audioIn) {
    if (!inp.audioUrl) return { error: 'Adicione o áudio.' };
    body[caps.audioIn.key] = inp.audioUrl;
  }
  if (caps.text) {
    if (!text) return { error: 'Escreva o texto.' };
    if (caps.text.max && text.length > caps.text.max) used.cut = caps.text.max;
    body[caps.text.key] = cut(text, caps.text.max);
  }
  const wantsInstrumental = !!inp.instrumental && !!caps.instrumental;
  if (wantsInstrumental) {
    body[caps.instrumental.key] = true;
  } else if (lyrics && caps.text) {
    if (caps.custom) {
      // modo "letra própria": o prompt vira a letra e a descrição vira o estilo
      body[caps.custom.key] = true;
      body[caps.text.key] = cut(lyrics, caps.text.max);
      body[caps.custom.style] = cut(text, 500);
    } else if (caps.lyrics) {
      body[caps.lyrics.key] = cut(lyrics, caps.lyrics.max);
    } else {
      body[caps.text.key] = cut(`${text}\n\nLyrics:\n${lyrics}`, caps.text.max);
    }
  } else if (caps.lyrics) {
    // sem letra: o modelo escreve uma, se souber; senão a música sai instrumental
    if (caps.optimizer) body[caps.optimizer] = true;
    else if (caps.instrumental) { body[caps.instrumental.key] = true; used.instrumental = true; }
  }
  if (caps.voice) {
    const asked = typeof inp.voice === 'string' ? inp.voice.trim() : '';
    const known = caps.voice.list.some((x) => x.v === asked);
    // ID de voz fora da lista: vai como está (o Atlas repassa ao provedor)
    const custom = !known && caps.voice.custom && /^[\w-]{6,80}$/.test(asked);
    const v = known || custom ? asked : caps.voice.default;
    if (v !== undefined && v !== null) { body[caps.voice.key] = v; used.voice = v; if (custom) used.customVoice = true; }
  }
  if (caps.refAudio && inp.voiceRefUrl && caps.text) {
    // a documentação do modelo pede que o texto cite a amostra como @audio1
    const L = LANGS[inp.lang];
    body[caps.refAudio.key] = [{ [caps.refAudio.field]: inp.voiceRefUrl }];
    body[caps.text.key] = cut(`Use the voice and delivery of @audio1 and say${L ? ` in ${L.say}` : ''}: ${text}`, caps.text.max);
    used.voiceRef = true;
  }
  const speed = Number(inp.speed);
  if (caps.speed && Number.isFinite(speed) && speed > 0 && speed !== 1) body[caps.speed.key] = Math.round(clamp(speed, caps.speed.min, caps.speed.max) * 100) / 100;
  if (caps.lang) {
    const v = inp.lang && inp.lang !== 'auto' ? langValue(caps.lang, inp.lang) : undefined;
    if (v !== undefined) body[caps.lang.key] = v;
    else if (caps.lang.required && caps.lang.default !== undefined && caps.lang.default !== null) body[caps.lang.key] = caps.lang.default;
  }
  const dur = Math.round(Number(inp.duration));
  if (caps.duration && Number.isFinite(dur) && dur > 0 && (!caps.custom || body[caps.custom.key])) {
    used.duration = clamp(dur, caps.duration.min, caps.duration.max);
    body[caps.duration.key] = used.duration;
  }
  if (caps.loop && inp.loop) body[caps.loop.key] = true;
  for (const [k, v] of Object.entries(caps.defaults)) if (body[k] === undefined) body[k] = v;
  return { body, used };
}

// Estimativa pela tabela. A unidade muda de modelo para modelo: por geração, por minuto ou por mil caracteres.
function tablePrice(variant, inp) {
  if (!variant || variant.price == null) return null;
  const unit = String(variant.unit || '').toLowerCase();
  if (/minute/.test(unit)) return variant.price * Math.max(1, Number(inp.seconds) || 30) / 60;
  if (/second/.test(unit)) return variant.price * Math.max(1, Number(inp.seconds) || 5);
  if (/character/.test(unit)) return variant.price * Math.max(1, String(inp.text || '').length) / 1000;
  return variant.price;
}

module.exports = { MODES, kindOf, buildFamilies, defaultEnabled, analyze, publicCaps, buildBody, tablePrice };
