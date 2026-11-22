// Aba de áudio: fala (texto → voz), música, efeitos sonoros e transcrição.
// Usa o estado e os utilitários de app.js (S, $, api, svg, tip, toast…).

const AMODES = [
  { key: 'speech', label: 'Fala', icon: 'mic', tip: 'Transformar um texto em voz', hint: 'Escreva o texto que a voz vai falar', title: 'Texto' },
  { key: 'music', label: 'Música', icon: 'music', tip: 'Criar uma música a partir de uma descrição', hint: 'Descreva a música: estilo, clima, instrumentos, tipo de voz', title: 'Descrição' },
  { key: 'sfx', label: 'Efeitos', icon: 'wave', tip: 'Criar um efeito sonoro ou um som ambiente', hint: 'Descreva o som: o que acontece, onde, com que intensidade', title: 'Descrição' },
  { key: 'stt', label: 'Transcrever', icon: 'fileText', tip: 'Passar um áudio para texto', hint: '', title: '' },
];
const ALANGS = [['auto', 'Auto', 'O modelo descobre o idioma sozinho'], ['pt', 'Português', ''], ['en', 'Inglês', ''], ['es', 'Espanhol', '']];
const ASTORE = 'gerador.audio.v1';

const aMode = (key = S.a.mode) => AMODES.find((m) => m.key === key) || AMODES[0];
const audioPlaceholder = () => aMode().hint;

function loadAudio() {
  try {
    const saved = JSON.parse(localStorage.getItem(ASTORE) || 'null');
    if (saved) Object.assign(S.a, saved, { input: saved.input && saved.input.id ? saved.input : null });
  } catch { /* ignora */ }
  if (!AMODES.some((m) => m.key === S.a.mode)) S.a.mode = 'speech';
  S.a.prompts = S.a.prompts || {};
  S.a.touched = S.a.touched || {};
  S.a.myVoices = S.a.myVoices || {}; // por modelo: vozes acrescentadas pelo ID (ex.: clonadas no ElevenLabs)
  S.a.cloned = Array.isArray(S.a.cloned) ? S.a.cloned : []; // vozes clonadas de um áudio enviado
}

let aSaveT;
function saveAudio() {
  clearTimeout(aSaveT);
  aSaveT = setTimeout(() => {
    const { prompt, prompts, touched, mode, lyrics, voices, myVoices, cloned, speed, lang, instrumental, duration, sfxDuration, loop, input, families } = S.a;
    try {
      localStorage.setItem(ASTORE, JSON.stringify({ prompt, prompts, touched, mode, lyrics, voices, myVoices, cloned, speed, lang, instrumental, duration, sfxDuration, loop, families, input: input && !input.uploading ? input : null }));
    } catch { /* sem espaço: segue sem lembrar */ }
  }, 200);
}

/* ---------- modelos ---------- */

// Modelos ligados nas Configurações que servem para o modo
function aEnabled(mode = S.a.mode) {
  const on = new Set(S.config.enabledAudio || []);
  return S.afamilies.filter((f) => on.has(f.key) && f.kind === mode);
}
const aUsable = (f) => !f.caps || f.caps.usable !== false;
// Os escolhidos no painel, só os do modo aberto
function aSelected() {
  const ok = new Map(aEnabled().filter(aUsable).map((f) => [f.key, f]));
  return S.a.families.filter((k) => ok.has(k)).map((k) => ok.get(k));
}

function aUnit(f) {
  const u = String(f.unit || '').toLowerCase();
  if (/minute/.test(u)) return 'por minuto';
  if (/character/.test(u)) return 'por mil caracteres';
  if (/second/.test(u)) return 'por segundo';
  return 'por geração';
}
const aPriceLabel = (f) => (f.price != null ? `${cost(f.price)} ${aUnit(f)}` : '');

// Estimativa pela tabela de preços (o valor cobrado aparece depois de gerar)
function aEstimate(f) {
  if (f.price == null) return null;
  const u = String(f.unit || '').toLowerCase();
  const secs = S.a.mode === 'sfx' ? S.a.sfxDuration : f.caps?.duration ? S.a.duration : 30;
  if (/minute/.test(u)) return f.price * Math.max(1, secs) / 60;
  if (/second/.test(u)) return f.price * Math.max(1, secs);
  if (/character/.test(u)) return f.price * Math.max(1, S.a.prompt.length) / 1000;
  return f.price;
}

async function loadAModels() {
  try {
    const r = await api('/api/audio/models');
    S.afamilies = r.families || [];
    S.afam = new Map(S.afamilies.map((f) => [f.key, f]));
    S.acatalogError = r.error || null;
    if (Array.isArray(r.enabled)) S.config.enabledAudio = r.enabled;
  } catch (e) { S.acatalogError = e.message; }
  S.acatalogLoaded = true;
  if (S.tab === 'audio') { renderAModels(); renderAOpts(); renderALyrics(); renderAGo(); }
  if (SET.open) renderModelList();
}

function aModelRow(f) {
  const m = aMode(f.kind);
  const unusable = !aUsable(f);
  return { unusable, sub: `<span class="kinds"><span ${tip(m.tip)}>${svg(m.icon, 's14')}</span></span>${unusable ? 'Pede campos que o app não preenche' : `${m.label}${f.price != null ? ` · ${aPriceLabel(f)}` : ''}`}` };
}

function renderAModels() {
  const box = $('#models');
  if (!S.acatalogLoaded) { box.innerHTML = '<div class="pgroup-chips"><span class="chip skeleton"></span><span class="chip skeleton"></span><span class="chip skeleton"></span></div>'; return; }
  const list = aEnabled();
  if (!list.length) {
    box.innerHTML = S.acatalogError
      ? `<div class="models-empty">${svg('alert', 's16')}<span>Não consegui carregar os modelos.</span><button data-act="reload-models">Tentar de novo</button></div>`
      : `<div class="models-empty"><span>Nenhum modelo de ${aMode().label.toLowerCase()} no painel.</span><button data-act="open-settings">Escolher modelos</button></div>`;
    return;
  }
  // na primeira visita a cada modo, já deixa um modelo escolhido
  if (!S.a.touched[S.a.mode] && !aSelected().length) {
    // a ordem em que os modelos foram ligados começa pelos sugeridos, então o primeiro costuma ser a melhor aposta
    const first = (S.config.enabledAudio || []).map((k) => S.afam.get(k)).find((f) => f && f.kind === S.a.mode && aUsable(f)) || list.find(aUsable);
    if (first) S.a.families = [...S.a.families, first.key];
    S.a.touched[S.a.mode] = true;
    renderAOpts(); // as opções dependem do modelo que acabou de ser escolhido
  }
  const chip = (f) => {
    const on = S.a.families.includes(f.key);
    const ok = aUsable(f);
    const t = `${ok ? aPriceLabel(f) || providerName(f) : 'Pede campos que o app não preenche'}. Duplo clique deixa só ele`;
    return `<button class="chip ${on ? 'on' : ''} ${ok ? '' : 'off-compat'}" data-act="a-model" data-key="${esc(f.key)}" aria-pressed="${on}" ${tip(t)}><span>${esc(f.name)}</span></button>`;
  };
  box.innerHTML = modelGroups(list, chip);
}

/* ---------- painel ---------- */

function aSetMode(mode) {
  if (!AMODES.some((m) => m.key === mode) || mode === S.a.mode) return;
  // cada modo lembra o próprio texto: o que se fala não é o que descreve uma música
  S.a.prompts[S.a.mode] = S.a.prompt;
  S.a.mode = mode;
  S.a.prompt = S.a.prompts[mode] || '';
  saveAudio();
  renderComposer();
}

function renderAModes() {
  $('#amodes').innerHTML = AMODES.map((m) => `<button class="ratio ${S.a.mode === m.key ? 'on' : ''}" role="radio" aria-checked="${S.a.mode === m.key}" data-act="a-mode" data-v="${m.key}" ${tip(m.tip)}><span class="g">${svg(m.icon, 's16')}</span><span class="t">${m.label}</span></button>`).join('');
}

// Transcrever: o arquivo de áudio que vai virar texto
function renderAMedia() {
  const box = $('#amedia');
  if (S.a.mode !== 'stt') { box.innerHTML = ''; return; }
  const r = S.a.input;
  box.innerHTML = r
    ? `<div class="afile ${r.uploading ? 'uploading' : ''}"><div class="afile-head">${svg('wave', 's16')}<span class="afile-name">${esc(r.name || 'Áudio')}</span>${r.uploading ? '<span class="mini-spin"></span>' : ''}<button class="icon-btn" data-act="a-rm-input" ${tip('Tirar')}>${svg('x', 's16')}</button></div>${r.uploading ? '' : `<audio src="${esc(r.url)}" controls preload="metadata"></audio>`}</div>`
    : `<button class="afile-add" data-act="a-pick">${svg('plus', 's20')}<span>Adicionar o áudio</span><small>mp3, wav, m4a, ogg ou um vídeo. Dá para arrastar o arquivo para cá.</small></button>`;
}

function renderALyrics() {
  const show = S.a.mode === 'music' && !S.a.instrumental;
  $('#lyrics-wrap').hidden = !show;
  const ta = $('#lyrics');
  if (ta.value !== S.a.lyrics) ta.value = S.a.lyrics;
}

const GENDER = { female: 'feminina', male: 'masculina', neutral: 'neutra' };
const aHasVoice = (f) => !!(f.caps?.voice || f.caps?.voiceFromAudio);
// A voz escolhida para um modelo: uma da lista dele, um ID acrescentado à mão ou "ref:<id>" (clonada de um áudio)
const aVoiceOf = (f) => (aHasVoice(f) ? S.a.voices[f.key] ?? f.caps.voice?.default ?? null : null);
// Nome, detalhe e amostra de uma voz, venha de onde vier
function aVoiceInfo(key, value) {
  if (value == null || value === '') return { name: 'Sem voz definida', detail: 'o texto descreve a voz', sample: '' };
  if (typeof value === 'string' && value.startsWith('ref:')) {
    const c = S.a.cloned.find((x) => `ref:${x.id}` === value);
    return { name: c ? c.name : 'Voz clonada', detail: 'clonada de um áudio', sample: c ? c.url : '' };
  }
  const v = S.afam.get(key)?.caps?.voice?.list.find((x) => x.v === value);
  if (v) {
    const lang = v.lang === 'multilingual' ? 'vários idiomas' : v.lang;
    return { name: v.name || String(v.v).replace(/[_-]+/g, ' '), detail: [GENDER[String(v.gender).toLowerCase()], lang].filter(Boolean).join(' · '), sample: v.sample || '' };
  }
  const mine = (S.a.myVoices[key] || []).find((x) => x.v === value);
  return { name: mine ? mine.name : String(value), detail: 'voz pelo ID', sample: '' };
}
const aVoiceName = (key, value) => aVoiceInfo(key, value).name;

const aClock = (sec) => { const s = Math.max(0, Math.round(sec)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const aSpeedText = (v) => `${Number(v).toFixed(2).replace(/0$/, '').replace('.', ',')}×`;

// Faixa de duração que os modelos escolhidos aceitam
function aDurRange(fams) {
  const caps = fams.map((f) => f.caps?.duration).filter(Boolean);
  if (!caps.length) return null;
  return { min: Math.min(...caps.map((c) => c.min)), max: Math.max(...caps.map((c) => c.max)) };
}

function renderAOpts() {
  const box = $('#aopts');
  const mode = S.a.mode;
  const fams = aSelected();
  const slider = (id, label, min, max, step, value, text) => `<div class="vdur aslider"><label for="${id}">${label}</label><input class="range" id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-a="${id}"><span class="aval num">${text}</span></div>`;
  const langs = `<div class="seg" role="radiogroup" aria-label="Idioma">${ALANGS.map(([k, label, hint]) => `<button class="${S.a.lang === k ? 'on' : ''}" role="radio" aria-checked="${S.a.lang === k}" data-act="a-lang" data-v="${k}" ${hint ? tip(hint) : ''}>${label}</button>`).join('')}</div>`;
  let html = '';
  if (mode === 'speech') {
    const withVoice = fams.filter(aHasVoice);
    if (withVoice.length) {
      html += `<div class="avoices">${withVoice.map((f) => {
        const info = aVoiceInfo(f.key, aVoiceOf(f));
        return `<div class="avoice"><span class="avoice-model">${avatarHTML(f.key, f.name, f.avatar)}<span>${esc(f.name)}</span></span>
          <button class="avoice-pick" data-act="vp-open" data-key="${esc(f.key)}" ${tip('Escolher a voz: lista com amostras, voz pelo ID e voz clonada')}><span class="avoice-name">${esc(info.name)}</span><span class="avoice-detail">${esc(info.detail)}</span>${svg('chevR', 's14')}</button>
          <button class="icon-btn" data-act="a-sample" data-key="${esc(f.key)}" ${info.sample ? tip('Ouvir uma amostra desta voz') : 'disabled'}>${svg('play', 's14')}</button></div>`;
      }).join('')}</div>`;
    }
    if (fams.some((f) => f.caps?.speed)) html += slider('a-speed', 'Velocidade', 0.5, 2, 0.05, S.a.speed, aSpeedText(S.a.speed));
    if (fams.some((f) => f.caps?.lang)) html += langs;
  } else if (mode === 'music') {
    html += `<button class="toggle ${S.a.instrumental ? 'on' : ''}" data-act="a-instr" aria-pressed="${S.a.instrumental}" ${tip('Só os instrumentos, sem voz')}>${svg('music', 's16')}<span>Instrumental</span></button>`;
    const r = aDurRange(fams);
    if (r) {
      S.a.duration = Math.min(r.max, Math.max(r.min, S.a.duration || 30));
      html += slider('a-duration', 'Duração', r.min, Math.min(r.max, 600), 1, S.a.duration, aClock(S.a.duration));
      if (fams.some((f) => !f.caps?.duration)) html += `<p class="vdur-note">${esc(fams.filter((f) => !f.caps?.duration).map((f) => f.name).join(', '))}: a duração é decidida pelo modelo.</p>`;
    }
  } else if (mode === 'sfx') {
    const r = aDurRange(fams) || { min: 1, max: 30 };
    S.a.sfxDuration = Math.min(r.max, Math.max(r.min, S.a.sfxDuration || 5));
    html += slider('a-sfx', 'Duração', r.min, r.max, 1, S.a.sfxDuration, aClock(S.a.sfxDuration));
    html += `<button class="toggle ${S.a.loop ? 'on' : ''}" data-act="a-loop" aria-pressed="${S.a.loop}" ${tip('Som que se repete sem emenda, para ambientes e fundos')}>${svg('repeat', 's16')}<span>Loop</span></button>`;
  } else if (mode === 'stt') {
    html += langs;
  }
  box.innerHTML = html;
}

function renderAudioPanel() {
  renderAModes();
  renderAMedia();
  renderALyrics();
  renderAOpts();
}

function renderAGo() {
  const btn = $('#go');
  const fams = aSelected();
  const mode = S.a.mode;
  let est = 0;
  for (const f of fams) est += aEstimate(f) || 0;
  $('#go-icon').innerHTML = svg(mode === 'stt' ? 'fileText' : 'sparkles', 's16');
  let reason = '';
  if (!S.config.hasKey) reason = 'Configure a API key primeiro';
  else if (mode === 'stt' && !S.a.input) reason = 'Adicione o áudio';
  else if (mode === 'stt' && S.a.input.uploading) reason = 'Enviando o áudio…';
  else if (mode !== 'stt' && !S.a.prompt.trim()) reason = mode === 'speech' ? 'Escreva o texto' : 'Escreva a descrição';
  else if (!fams.length) reason = 'Escolha um modelo';
  btn.disabled = !!reason && S.config.hasKey;
  // a cotação vem do Atlas; na fala o preço depende do tamanho do texto, então ele entra na conta
  const ready = fams.length && (mode === 'stt' ? S.a.input && !S.a.input.uploading : S.a.prompt.trim());
  askEstimate('/api/audio/estimate', ready ? aRequestBody(fams) : null, 700);
  paintEstimate(fams.map((f) => f.key), est, reason, mode === 'stt' ? 'Transcrever' : 'Gerar');
}

// O pedido de áudio como o servidor espera (o mesmo corpo serve para estimar e para gerar)
function aRequestBody(fams = aSelected()) {
  const a = S.a;
  const voices = {};
  for (const f of fams) { const v = aVoiceOf(f); if (v) voices[f.key] = v; }
  return {
    mode: a.mode, prompt: a.prompt.trim(), lyrics: a.instrumental ? '' : a.lyrics, voices, speed: a.speed, lang: a.lang,
    instrumental: a.instrumental, loop: a.loop, input: a.input?.id,
    duration: a.mode === 'sfx' ? a.sfxDuration : a.mode === 'music' && aDurRange(fams) ? a.duration : 0,
    families: fams.map((f) => f.key),
  };
}

/* ---------- ações ---------- */

async function aGenerate() {
  const btn = $('#go');
  if (!S.config.hasKey) return openSettings(true);
  if (btn.disabled) { toast(btn.dataset.tip, 'error'); return; }
  btn.classList.remove('sent'); void btn.offsetWidth; btn.classList.add('sent');
  try {
    const b = await api('/api/audio/generate', { method: 'POST', body: aRequestBody() });
    upsertBatch(b);
    $('#stream').scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { toast(e.message, 'error'); }
}

// Um arquivo de áudio (ou de vídeo) solto no painel vira a entrada da transcrição
async function aAddFiles(files) {
  const file = [...files].find((f) => /^(audio|video)\//.test(f.type) || /\.(mp3|wav|m4a|ogg|flac|opus|aac|mp4|mov|webm)$/i.test(f.name || ''));
  if (!file) { toast('Aqui entra um arquivo de áudio', 'error'); return; }
  if (S.a.mode !== 'stt') aSetMode('stt');
  const temp = { id: 'tmp', name: file.name, uploading: true };
  S.a.input = temp;
  renderAMedia(); renderAGo();
  try {
    const ref = await api('/api/refs', { method: 'POST', raw: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'audio.mp3') } });
    if (S.a.input === temp) S.a.input = { ...ref, name: ref.name || file.name };
  } catch (e) {
    if (S.a.input === temp) S.a.input = null;
    toast(e.message, 'error');
  }
  if (S.tab === 'audio') { renderAMedia(); renderAGo(); }
  saveAudio();
}

function aReuseBatch(b) {
  const on = new Set(S.config.enabledAudio || []);
  const fams = b.families.filter((k) => on.has(k));
  if (S.a.mode !== b.mode) { S.a.prompts[S.a.mode] = S.a.prompt; S.a.mode = b.mode; }
  Object.assign(S.a, {
    prompt: b.prompt || '', lyrics: b.lyrics || '', voices: { ...S.a.voices, ...(b.voices || {}) }, speed: b.speed || 1, lang: b.lang || 'auto',
    instrumental: !!b.instrumental, loop: !!b.loop, input: b.input || null,
  });
  if (b.duration) { if (b.mode === 'sfx') S.a.sfxDuration = b.duration; else S.a.duration = b.duration; }
  if (fams.length) S.a.families = [...S.a.families.filter((k) => S.afam.get(k)?.kind !== b.mode), ...fams];
  S.a.touched[b.mode] = true;
  saveAudio();
  if (S.tab !== 'audio') switchTab('audio'); else renderComposer();
  if (b.mode !== 'stt') $('#prompt').focus();
  toast('Levado para o painel');
}

/* ---------- linha do tempo ---------- */

function aBatchMeta(b) {
  const m = aMode(b.mode);
  const parts = [`<span class="m" ${tip(m.tip)}>${svg(m.icon, 's14')}${m.label}</span>`];
  const fams = [];
  for (const it of b.items) if (!fams.some((f) => f.family === it.family)) fams.push(it);
  for (const it of fams) parts.push(`<span class="m">${avatarHTML(it.family, it.familyName, it.avatar)}${esc(it.familyName)}</span>`);
  if (b.mode === 'speech' && fams.length === 1 && b.voices?.[fams[0].family]) parts.push(`<span class="m" ${tip('Voz')}>${svg('mic', 's14')}${esc(aVoiceName(fams[0].family, b.voices[fams[0].family]))}</span>`);
  if (b.mode === 'speech' && b.speed && b.speed !== 1) parts.push(`<span class="m num" ${tip('Velocidade')}>${aSpeedText(b.speed)}</span>`);
  if (b.lang && b.lang !== 'auto') parts.push(`<span class="m" ${tip('Idioma pedido')}>${esc(b.lang.toUpperCase())}</span>`);
  if (b.mode === 'music' && b.instrumental) parts.push('<span class="m">Instrumental</span>');
  if (b.mode === 'music' && b.lyrics) parts.push(`<span class="m" ${tip('Com letra')}>${svg('fileText', 's14')}Letra</span>`);
  if ((b.mode === 'music' || b.mode === 'sfx') && b.duration) parts.push(`<span class="m num" ${tip('Duração pedida')}>${aClock(b.duration)}</span>`);
  if (b.mode === 'sfx' && b.loop) parts.push(`<span class="m" ${tip('Som em loop')}>${svg('repeat', 's14')}Loop</span>`);
  if (b.mode === 'stt' && b.input) parts.push(`<span class="m" ${tip('Áudio de entrada')}>${svg('wave', 's14')}${esc(b.input.name || 'Áudio')}</span>`);
  if (b.via === 'mcp') parts.push(agentMark(b));
  const running = b.items.some((x) => x.status === 'running' || x.status === 'queued');
  const done = b.items.filter((x) => x.status === 'done' && x.cost != null);
  const total = done.reduce((a, x) => a + x.cost, 0);
  const est = done.some((x) => x.costEstimated);
  if (done.length || running) parts.push(`<span class="m cost" ${tip(est ? COST_TIP_EST : COST_TIP)}>${running ? '<span class="mini-spin"></span>' : ''}${done.length ? `${est ? '≈ ' : ''}${costHTML(total)}` : ''}</span>`);
  return parts.join('');
}

// Texto que aparece ao abrir "Texto" / "Descrição" de uma geração
const aPromptText = (b) => (b.lyrics ? `${b.prompt}\n\nLetra:\n${b.lyrics}` : b.prompt || '');

function aTileSpecs(b, it) {
  const specs = [];
  const per = it.cost != null ? it.cost / Math.max(1, it.outputs.length) : null;
  it.outputs.forEach((out, idx) => specs.push({ key: `${it.id}:${idx}`, sig: `d${out.url}`, item: it, make: () => aTileHTML(it, out, idx, per) }));
  if (it.text) specs.push({ key: `${it.id}:t`, sig: `d${it.text.length}:${it.text.slice(0, 24)}`, item: it, make: () => aTextTileHTML(it) });
  return specs;
}

const aCost = (it, per) => (per != null ? `<span class="a-cost num">${it.costEstimated ? '≈ ' : ''}${costHTML(per)}</span>` : '<span></span>');

function aTileHTML(it, out, idx, per) {
  return `<div class="tile done audio" data-item="${it.id}" data-idx="${idx}">
    <button class="a-play" data-act="a-play" aria-label="Tocar ou pausar">${svg('play', 's16')}</button>
    <div class="a-body">
      <div class="a-top"><span class="a-name">${esc(it.familyName)}${it.outputs.length > 1 ? ` · faixa ${idx + 1}` : ''}</span><span class="a-time num">0:00</span></div>
      <div class="a-bar" data-act="a-seek" role="slider" aria-label="Posição no áudio"><i></i></div>
      <div class="a-bottom">${aCost(it, per)}<span class="a-tools">
        <button data-act="a-avatar" data-item="${it.id}" data-idx="${idx}" ${tip('Vídeo falante: escolha uma foto (ou um vídeo) para falar com este áudio')}>${svg('film', 's16')}</button>
        <button data-act="download" data-item="${it.id}" data-idx="${idx}" ${tip('Baixar')}>${svg('download', 's16')}</button>
        <button data-act="variation" data-item="${it.id}" ${tip('Gerar outro com este modelo')}>${svg('refresh', 's16')}</button>
        <button data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash', 's16')}</button>
      </span></div>
      ${it.note ? `<p class="a-note">${esc(it.note)}</p>` : ''}
    </div>
    <audio preload="metadata" src="${esc(out.url)}"></audio>
  </div>`;
}

function aTextTileHTML(it) {
  return `<div class="tile done audio text" data-item="${it.id}">
    <div class="a-body">
      <div class="a-top"><span class="a-name">${svg('fileText', 's14')}${esc(it.familyName)}</span>${aCost(it, it.cost)}</div>
      <p class="a-text">${esc(it.text)}</p>
      <div class="a-bottom"><span></span><span class="a-tools">
        <button data-act="a-copy-text" data-item="${it.id}" ${tip('Copiar o texto')}>${svg('copy', 's16')}</button>
        <button data-act="a-speak-text" data-item="${it.id}" ${tip('Levar o texto para Fala')}>${svg('mic', 's16')}</button>
        <button data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash', 's16')}</button>
      </span></div>
    </div>
  </div>`;
}

/* ---------- tocar ---------- */

let aNow = null; // o <audio> que está tocando
function aToggle(tile) {
  const au = tile?.querySelector('audio');
  if (!au) return;
  if (aNow && aNow !== au) aNow.pause();
  if (au.paused) { aNow = au; au.play().catch(() => toast('Não consegui tocar este áudio', 'error')); } else au.pause();
}
const aStamp = (s) => { const n = Math.max(0, Math.floor(s || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
function aPaint(au) {
  const tile = au.closest('.tile.audio');
  if (!tile) return;
  const dur = Number.isFinite(au.duration) ? au.duration : 0;
  $('.a-bar i', tile).style.width = dur ? `${Math.min(100, (au.currentTime / dur) * 100)}%` : '0%';
  $('.a-time', tile).textContent = dur ? (au.currentTime > 0 ? `${aStamp(au.currentTime)} / ${aStamp(dur)}` : aStamp(dur)) : '0:00';
  const playing = !au.paused && !au.ended;
  if (tile.classList.contains('playing') !== playing) {
    tile.classList.toggle('playing', playing);
    $('.a-play', tile).innerHTML = svg(playing ? 'pause' : 'play', 's16');
  }
}
// eventos de mídia não sobem na árvore: por isso a escuta é na captura
for (const ev of ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended']) {
  document.addEventListener(ev, (e) => { if (e.target.matches?.('.tile.audio audio')) aPaint(e.target); }, true);
}

// Amostra de uma voz: o arquivo de exemplo publicado pelo Atlas Cloud ou, nas vozes clonadas, o áudio enviado.
// Um clique toca; outro clique no mesmo botão para.
let aSample = null;
function aPlayUrl(url, btn, size = 's14') {
  const was = aSample;
  if (was) { was.pause(); if (was._btn === btn) return; }
  if (!url) { toast('Essa voz não tem amostra'); return; }
  if (aNow) aNow.pause();
  const au = new Audio(url);
  au._btn = btn;
  aSample = au;
  btn.innerHTML = svg('pause', size);
  btn.classList.add('playing');
  const stop = () => { if (aSample === au) aSample = null; if (btn.isConnected) { btn.innerHTML = svg('play', size); btn.classList.remove('playing'); } };
  au.addEventListener('ended', stop);
  au.addEventListener('pause', stop);
  au.addEventListener('error', () => { stop(); toast('Não consegui tocar a amostra', 'error'); });
  au.play().catch(() => {});
}
function aPlaySample(key, btn) {
  const f = S.afam.get(key);
  aPlayUrl(f ? aVoiceInfo(key, aVoiceOf(f)).sample : '', btn);
}

/* ---------- painel de vozes ---------- */

// Lista as vozes de um modelo com amostra para ouvir, busca e filtros. Nos modelos que aceitam, também
// deixa usar uma voz pelo ID (clonada no ElevenLabs) ou clonar a voz de um áudio enviado.
const VP = {
  key: null, q: '', gender: 'all', lang: 'all', el: null,

  open(key) {
    this.close();
    const f = S.afam.get(key);
    if (!f || !aHasVoice(f)) return;
    Object.assign(this, { key, q: '', gender: 'all', lang: 'all' });
    const el = document.createElement('div');
    el.className = 'vp-scrim';
    el.innerHTML = `<div class="vp" role="dialog" aria-modal="true" aria-label="Escolher a voz">
      <div class="vp-head"><span class="vp-title">${avatarHTML(f.key, f.name, f.avatar)}<span>Voz do ${esc(f.name)}</span></span><button class="icon-btn" data-act="vp-close" ${tip('Fechar (Esc)')}>${svg('x', 's20')}</button></div>
      <div class="vp-tools"></div>
      <div class="vp-list" role="listbox"></div>
      <div class="vp-extra"></div>
    </div>`;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('mousedown', (e) => { if (e.target === el) this.close(); });
    this.renderTools();
    this.render();
    setTimeout(() => $('.vp-search', el)?.focus(), 40);
  },

  close() {
    if (!this.el) return;
    if (aSample) aSample.pause();
    this.el.remove();
    this.el = null;
    this.key = null;
    hideTip();
  },

  renderTools() {
    const f = S.afam.get(this.key);
    const list = f.caps.voice ? f.caps.voice.list : [];
    const box = $('.vp-tools', this.el);
    if (list.length < 8) { box.innerHTML = ''; return; }
    const langs = [...new Set(list.map((v) => v.lang).filter(Boolean))].sort();
    const genders = new Set(list.map((v) => String(v.gender).toLowerCase()).filter(Boolean));
    box.innerHTML = `<input class="input vp-search" type="search" placeholder="Buscar entre ${list.length} vozes" autocomplete="off" spellcheck="false" aria-label="Buscar voz">
      ${genders.size > 1 ? `<div class="seg">${[['all', 'Todas'], ['female', 'Femininas'], ['male', 'Masculinas']].map(([k, label]) => `<button class="${this.gender === k ? 'on' : ''}" data-act="vp-gender" data-v="${k}">${label}</button>`).join('')}</div>` : ''}
      ${langs.length > 1 ? `<select class="aselect vp-lang" aria-label="Idioma da voz"><option value="all">Todos os idiomas</option>${langs.map((l) => `<option value="${esc(l)}"${this.lang === l ? ' selected' : ''}>${esc(l === 'multilingual' ? 'vários idiomas' : l)}</option>`).join('')}</select>` : ''}`;
    $('.vp-search', box).addEventListener('input', (e) => { this.q = e.target.value.trim().toLowerCase(); this.render(); });
    $('.vp-lang', box)?.addEventListener('change', (e) => { this.lang = e.target.value; this.render(); });
  },

  row(value, name, detail, sample, cur, removable) {
    const on = value === cur;
    return `<div class="vp-row ${on ? 'on' : ''}" data-act="vp-pick" data-v="${esc(value)}" role="option" aria-selected="${on}" tabindex="0">
      <button class="vp-play" data-act="vp-play" data-url="${esc(sample || '')}" ${sample ? tip('Ouvir a amostra') : 'disabled'}>${svg('play', 's14')}</button>
      <span class="vp-name">${esc(name)}</span><span class="vp-detail">${esc(detail)}</span>
      ${removable ? `<button class="vp-rm" data-act="vp-rm" data-kind="${removable}" data-v="${esc(value)}" ${tip('Tirar da lista')}>${svg('x', 's14')}</button>` : ''}
      <span class="vp-check">${on ? svg('check', 's16') : ''}</span>
    </div>`;
  },

  render() {
    if (!this.el) return;
    const f = S.afam.get(this.key);
    const cur = aVoiceOf(f) || '';
    const voice = f.caps.voice;
    let list = voice ? voice.list : [];
    if (this.gender !== 'all') list = list.filter((v) => String(v.gender).toLowerCase() === this.gender);
    if (this.lang !== 'all') list = list.filter((v) => v.lang === this.lang);
    if (this.q) list = list.filter((v) => `${v.name} ${v.v} ${v.lang} ${GENDER[String(v.gender).toLowerCase()] || ''}`.toLowerCase().includes(this.q));
    const rows = list.map((v) => { const i = aVoiceInfo(f.key, v.v); return this.row(v.v, i.name, i.detail, i.sample, cur); });
    if (!voice) rows.unshift(this.row('', 'Sem voz definida', 'o próprio texto descreve quem fala', '', cur));
    $('.vp-list', this.el).innerHTML = rows.join('') || '<p class="vp-empty">Nenhuma voz combina com a busca.</p>';

    let extra = '';
    if (voice && voice.custom) {
      const mine = S.a.myVoices[f.key] || [];
      extra += `<div class="vp-section"><b>Voz clonada ou da biblioteca do ElevenLabs</b>
        <p>A clonagem é feita no site do ElevenLabs (em Voices). Cole aqui o ID da voz: o Atlas Cloud repassa o ID ao ElevenLabs como está.</p>
        ${mine.map((v) => this.row(v.v, v.name, `ID ${v.v}`, '', cur, 'id')).join('')}
        <form class="vp-form" data-form="id"><input class="input" name="name" placeholder="Nome (ex.: Minha voz)" maxlength="40" autocomplete="off"><input class="input" name="id" placeholder="ID da voz" maxlength="80" autocomplete="off" spellcheck="false"><button class="btn line" type="submit">Adicionar</button></form></div>`;
    }
    if (f.caps.voiceFromAudio) {
      extra += `<div class="vp-section"><b>Clonar a voz de um áudio</b>
        <p>Envie de 5 a 30 segundos de uma voz só, sem música de fundo. O modelo imita a voz e o jeito de falar da amostra.</p>
        ${S.a.cloned.map((c) => this.row(`ref:${c.id}`, c.name, 'clonada de um áudio', c.url, cur, 'clone')).join('')}
        <button class="btn line" data-act="vp-clone">${svg('mic', 's16')}Enviar uma amostra de voz</button></div>`;
    }
    $('.vp-extra', this.el).innerHTML = extra;
    const form = $('.vp-form', this.el);
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); this.addId(form); });
  },

  pick(value) {
    const f = S.afam.get(this.key);
    if (value === '' || (f.caps.voice && value === f.caps.voice.default)) delete S.a.voices[this.key]; else S.a.voices[this.key] = value;
    saveAudio();
    this.close();
    renderAOpts(); renderAGo();
  },

  addId(form) {
    const id = form.elements.id.value.trim();
    const name = form.elements.name.value.trim() || `Voz ${id.slice(0, 6)}`;
    if (!/^[\w-]{6,80}$/.test(id)) { toast('O ID da voz tem letras e números, sem espaços (copie do site do ElevenLabs)', 'error'); form.elements.id.focus(); return; }
    const list = (S.a.myVoices[this.key] = S.a.myVoices[this.key] || []);
    if (!list.some((v) => v.v === id)) list.push({ v: id, name });
    S.a.voices[this.key] = id;
    saveAudio();
    this.render();
    renderAOpts(); renderAGo();
    toast('Voz adicionada e escolhida', 'ok');
  },

  remove(kind, value) {
    if (kind === 'id') S.a.myVoices[this.key] = (S.a.myVoices[this.key] || []).filter((v) => v.v !== value);
    else S.a.cloned = S.a.cloned.filter((c) => `ref:${c.id}` !== value);
    for (const [k, v] of Object.entries(S.a.voices)) if (v === value && (kind === 'clone' || k === this.key)) delete S.a.voices[k];
    saveAudio();
    this.render();
    renderAOpts(); renderAGo();
  },

  async clone(file) {
    if (!file || !this.el) return;
    if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|wav|m4a|ogg|flac|opus|aac|mp4|mov|webm)$/i.test(file.name || '')) { toast('Escolha um arquivo de áudio', 'error'); return; }
    const key = this.key;
    toast('Enviando a amostra…');
    try {
      const ref = await api('/api/refs', { method: 'POST', raw: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'voz.mp3') } });
      if (ref.kind === 'image') throw new Error('Esse arquivo é uma imagem. Envie um áudio.');
      const name = String(file.name || 'Voz clonada').replace(/\.[^.]+$/, '').slice(0, 40) || 'Voz clonada';
      if (!S.a.cloned.some((c) => c.id === ref.id)) S.a.cloned.push({ id: ref.id, name, url: ref.url });
      S.a.voices[key] = `ref:${ref.id}`;
      saveAudio();
      if (this.key === key) this.render();
      renderAOpts(); renderAGo();
      toast('Voz clonada e escolhida', 'ok');
    } catch (e) { toast(e.message, 'error'); }
  },
};

/* ---------- eventos ---------- */

let aLastChip = {};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  switch (t.dataset.act) {
    case 'a-mode': aSetMode(t.dataset.v); break;
    case 'a-model': {
      const k = t.dataset.key;
      const now = performance.now();
      const others = S.a.families.filter((x) => S.afam.get(x)?.kind !== S.a.mode); // escolhas dos outros modos ficam como estão
      const mine = S.a.families.filter((x) => S.afam.get(x)?.kind === S.a.mode);
      if (aLastChip.key === k && now - aLastChip.t < 400) { S.a.families = [...others, k]; aLastChip = {}; }
      else { S.a.families = [...others, ...(mine.includes(k) ? mine.filter((x) => x !== k) : [...mine, k])]; aLastChip = { key: k, t: now }; }
      S.a.touched[S.a.mode] = true;
      renderAModels(); renderAOpts(); renderALyrics(); renderAGo(); saveAudio();
      break;
    }
    case 'a-lang': S.a.lang = t.dataset.v; renderAOpts(); saveAudio(); break;
    case 'a-instr': S.a.instrumental = !S.a.instrumental; renderALyrics(); renderAOpts(); renderAGo(); saveAudio(); break;
    case 'a-loop': S.a.loop = !S.a.loop; renderAOpts(); saveAudio(); break;
    case 'a-pick': $('#afile-input').click(); break;
    case 'a-rm-input': S.a.input = null; renderAMedia(); renderAGo(); saveAudio(); break;
    case 'a-sample': aPlaySample(t.dataset.key, t); break;
    case 'vp-open': VP.open(t.dataset.key); break;
    case 'vp-close': VP.close(); break;
    case 'vp-play': aPlayUrl(t.dataset.url, t); break;
    case 'vp-pick': VP.pick(t.dataset.v); break;
    case 'vp-rm': VP.remove(t.dataset.kind, t.dataset.v); break;
    case 'vp-clone': $('#vp-file').click(); break;
    case 'vp-gender':
      VP.gender = t.dataset.v;
      for (const b of t.parentElement.children) b.classList.toggle('on', b === t);
      VP.render();
      break;
    case 'a-play': aToggle(t.closest('.tile')); break;
    case 'a-seek': {
      const au = t.closest('.tile')?.querySelector('audio');
      if (!au || !Number.isFinite(au.duration)) break;
      const r = t.getBoundingClientRect();
      au.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * au.duration;
      if (au.paused) aToggle(t.closest('.tile'));
      break;
    }
    case 'a-copy-text': {
      const { it } = findItem(t.dataset.item);
      if (it?.text) navigator.clipboard.writeText(it.text).then(() => toast('Texto copiado'), () => toast('Não consegui copiar', 'error'));
      break;
    }
    case 'a-speak-text': {
      const { it } = findItem(t.dataset.item);
      if (!it?.text) break;
      S.a.prompts.speech = it.text;
      if (S.a.mode === 'speech') { S.a.prompt = it.text; renderComposer(); } else aSetMode('speech');
      $('#prompt').focus();
      toast('Texto levado para Fala');
      break;
    }
    default:
  }
});

$('#aopts').addEventListener('input', (e) => {
  const k = e.target.dataset.a;
  const out = e.target.closest('.aslider')?.querySelector('.aval');
  if (k === 'a-speed') { S.a.speed = Number(e.target.value); if (out) out.textContent = aSpeedText(S.a.speed); }
  else if (k === 'a-duration') { S.a.duration = Number(e.target.value); if (out) out.textContent = aClock(S.a.duration); }
  else if (k === 'a-sfx') { S.a.sfxDuration = Number(e.target.value); if (out) out.textContent = aClock(S.a.sfxDuration); }
  else return;
  renderAGo();
  saveAudio();
});
$('#vp-file').addEventListener('change', (e) => { VP.clone(e.target.files[0]); e.target.value = ''; });
// com o painel de vozes aberto: Esc fecha, Enter ou espaço escolhe a voz em foco
document.addEventListener('keydown', (e) => {
  if (!VP.el) return;
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); VP.close(); }
  else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.vp-row')) { e.preventDefault(); VP.pick(e.target.dataset.v); }
}, true);
$('#lyrics').addEventListener('input', (e) => { S.a.lyrics = e.target.value; saveAudio(); });
$('#afile-input').addEventListener('change', (e) => { aAddFiles(e.target.files); e.target.value = ''; });
