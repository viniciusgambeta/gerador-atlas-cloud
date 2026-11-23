'use strict';

/* ================================================================== */
/* Aba de vídeos                                                       */
/* Carregado depois de app.js: usa o estado (S) e os utilitários de lá */
/* ================================================================== */

// Cada modo corresponde a um tipo de modelo do Atlas Cloud (texto→vídeo, imagem→vídeo...)
const VMODES = [
  { key: 'text', label: 'Texto', long: 'Texto para vídeo', icon: 'type', kinds: ['t2v'], tip: 'Criar o vídeo só com o prompt', hint: 'Descreva o vídeo' },
  { key: 'image', label: 'Imagem', long: 'Imagem para vídeo', icon: 'image', kinds: ['i2v', 'se'], tip: 'Animar uma imagem. O quadro final é opcional', hint: 'Descreva o movimento da cena' },
  { key: 'ref', label: 'Referência', long: 'Referências', icon: 'images', kinds: ['ref'], tip: 'Usar imagens de personagens, objetos ou estilo como referência', hint: 'Descreva o vídeo com essas referências' },
  { key: 'edit', label: 'Editar', long: 'Edição de vídeo', icon: 'wand', kinds: ['edit', 'ref'], tip: 'Alterar um vídeo existente pelo prompt', hint: 'Descreva o que mudar no vídeo' },
  { key: 'extend', label: 'Estender', long: 'Extensão de vídeo', icon: 'forward', kinds: ['extend'], tip: 'Continuar um vídeo existente', hint: 'Descreva como o vídeo continua' },
];
const VRATIOS = ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
const VRES = ['480p', '720p', '1080p', '4K'];
const VSTORE = 'gerador.video.v1';

const vMode = (key = S.v.mode) => VMODES.find((m) => m.key === key) || VMODES[0];
const usesVideo = (mode = S.v.mode) => mode === 'edit' || mode === 'extend';
// Variante de um modelo que atende a um modo. No Editar, a de referência só conta quando o modelo edita por ela
const vKindFits = (f, mode, kind) => !!f.variants[kind] && !(mode === 'edit' && kind === 'ref' && f.variants.ref.caps && !f.variants.ref.caps.edits);
const videoPlaceholder = () => vMode().hint;
const clock = (sec) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function loadVideo() {
  try {
    const s = JSON.parse(localStorage.getItem(VSTORE) || 'null');
    if (!s) return;
    const ok = (r) => (r && r.id && !r.uploading ? r : null);
    Object.assign(S.v, s, { start: ok(s.start), end: ok(s.end), video: ok(s.video), refs: (s.refs || []).filter(ok), editRefs: (s.editRefs || []).filter(ok) });
    if (!VMODES.some((m) => m.key === S.v.mode)) S.v.mode = 'text';
  } catch { /* ignora */ }
}

let vSaveTimer;
function saveVideo() {
  clearTimeout(vSaveTimer);
  vSaveTimer = setTimeout(() => {
    // vídeo cortado guarda também o original e o trecho, para dar para reajustar depois
    const keep = (r) => (r && !r.uploading ? { id: r.id, url: r.url, w: r.w, h: r.h, kind: r.kind, duration: r.duration, ...(r.range && r.source ? { range: r.range, source: r.source } : {}) } : null);
    const { prompt, mode, families, ratio, res, dur, durAuto, audio } = S.v;
    localStorage.setItem(VSTORE, JSON.stringify({ prompt, mode, families, ratio, res, dur, durAuto: !!durAuto, audio, start: keep(S.v.start), end: keep(S.v.end), video: keep(S.v.video), refs: S.v.refs.map(keep).filter(Boolean), editRefs: S.v.editRefs.map(keep).filter(Boolean) }));
  }, 200);
}

/* ---------- modelos ---------- */

const vEnabled = () => S.config.enabledVideo.map((k) => S.vfam.get(k)).filter(Boolean);

const isVid = (r) => r.kind === 'video';

// O que está no painel e muda quais modelos servem: quadro final, imagens e vídeos de referência
function vNeed() {
  const v = S.v;
  if (v.mode === 'image') return { end: !!v.end };
  if (v.mode === 'ref') return { images: v.refs.filter((r) => !isVid(r)).length, videos: v.refs.filter(isVid).length };
  if (v.mode === 'edit') return { images: v.editRefs.length };
  return {};
}
// O mesmo, para um lote já gerado
const vNeedOf = (b) => ({ end: !!b.inputs?.end, images: (b.inputs?.refs || []).length, videos: (b.inputs?.videos || []).length });

// Variante do modelo que atende ao modo escolhido (o servidor confere de novo na hora de gerar)
function vPick(f, mode = S.v.mode, need = vNeed()) {
  if (!f) return null;
  const images = need.images || 0;
  const videos = need.videos || 0;
  for (const kind of vMode(mode).kinds) {
    if (!vKindFits(f, mode, kind)) continue;
    const v = f.variants[kind];
    const c = v.caps;
    if (!c) return v; // schema ainda não carregado
    if (!c.known || !c.usable) continue;
    if (mode === 'image' && (!c.start || (need.end ? !c.end : c.endRequired))) continue;
    if (mode === 'ref') {
      if (!c.refs && !c.videos) continue;
      if (images && !c.refs) continue;
      if (videos && !c.videos) continue;
      if (videos && !images && c.refsRequired) continue; // só vídeo, mas o modelo exige imagem
    }
    if (mode === 'edit' && (!c.video || (images && !c.refs))) continue;
    if (mode === 'extend' && !c.video) continue;
    return v;
  }
  return null;
}

// Por que o modelo f não serve para o que está no painel
function vWhyNot(mode = S.v.mode, need = vNeed(), f = null) {
  if (mode === 'text') return 'Não gera vídeo só com texto';
  if (mode === 'image') return need.end ? 'Não aceita quadro final' : 'Não gera vídeo a partir de imagem';
  if (mode === 'ref') {
    const c = f?.variants.ref?.caps;
    if (f && !f.variants.ref) return 'Não trabalha com referências';
    if (need.videos && !(c && c.videos)) return 'Não aceita vídeo de referência';
    if (need.videos && !need.images && c?.refsRequired) return 'Precisa de pelo menos uma imagem de referência';
    return 'Não aceita imagens de referência';
  }
  if (mode === 'edit') return need.images && (!f || vMode('edit').kinds.some((k) => vKindFits(f, 'edit', k))) ? 'Não aceita imagens de referência na edição' : 'Não edita vídeos';
  return 'Não estende vídeos';
}

const vPrice = (f) => ['t2v', 'i2v', 'ref', 'se', 'edit', 'extend'].map((k) => f.variants[k]?.price).find((p) => p != null) ?? null;
const vRunnable = () => S.v.families.map((k) => S.vfam.get(k)).filter((f) => f && vPick(f));

function vModelRow(f) {
  const variants = Object.values(f.variants);
  const unusable = variants.every((v) => v.caps && (!v.caps.known || !v.caps.usable));
  const modes = VMODES.filter((m) => m.kinds.some((k) => vKindFits(f, m.key, k))).map((m) => m.label).join(' · ');
  const price = vPrice(f);
  return { unusable, sub: unusable ? 'Pede campos que o app não preenche' : `${price != null ? `<span class="num">${cost(price)}/s</span>` : ''}<span>${esc(modes)}</span>` };
}

async function loadVModels() {
  try {
    const r = await api('/api/video/models');
    S.vfamilies = r.families || [];
    S.vfam = new Map(S.vfamilies.map((f) => [f.key, f]));
    if (Array.isArray(r.enabled)) S.config.enabledVideo = r.enabled;
    S.vcatalogError = !S.vfamilies.length ? (r.error || 'Catálogo vazio.') : null;
  } catch (e) {
    S.vcatalogError = e.message;
  }
  S.vcatalogLoaded = true;
  if (!S.v.families.length && S.config.enabledVideo.length) S.v.families = [S.config.enabledVideo[0]];
  if (S.tab === 'video') { renderVModels(); renderVGo(); }
  if (SET.open) renderModelList();
}

/* ---------- painel ---------- */

function renderVModes() {
  $('#vmodes').innerHTML = VMODES.map((m) => `<button class="ratio ${S.v.mode === m.key ? 'on' : ''}" role="radio" aria-checked="${S.v.mode === m.key}" data-act="v-mode" data-v="${m.key}" ${tip(m.tip)}><span class="g">${svg(m.icon, 's16')}</span><span class="t">${m.label}</span></button>`).join('');
}

function vSlot(name, ref, label, kind) {
  if (!ref) {
    const pick = `<button class="vslot" data-act="v-pick" data-slot="${name}" ${tip(kind === 'video' ? 'Clique, arraste ou cole um vídeo' : 'Clique, arraste ou cole uma imagem')}>${svg(kind === 'video' ? 'video' : 'imagePlus', 's20')}<span>${label}</span></button>`;
    // nas imagens, um atalho no canto para escolher da biblioteca de referências
    return kind === 'video' ? pick : `<div class="vslot-wrap">${pick}${libOpenBtn(name, 'vslot-lib')}</div>`;
  }
  const media = kind === 'video'
    ? `<video src="${esc(ref.url)}${ref.uploading ? '' : '#t=0.1'}" muted playsinline preload="metadata"></video>`
    : `<img src="${esc(ref.url)}" alt="">`;
  // vídeo: mostra a duração (e, se foi cortado, o total do original) e o botão de cortar trecho
  const dur = kind === 'video' ? `<span data-fill>${ref.duration ? clock(ref.duration) : ''}</span>${ref.range ? ` de ${clock(ref.source.duration)}` : ''}` : '';
  const trim = kind === 'video' && !ref.uploading ? `<button class="trim" data-act="v-trim" ${tip(ref.range ? 'Ajustar o trecho' : 'Cortar um trecho')}>${svg('scissors', 's14')}</button>` : '';
  return `<div class="vslot filled ${ref.uploading ? 'uploading' : ''}">${media}<span class="cap num">${label}${dur ? ' · ' : ''}${dur}</span>
    ${trim}${kind === 'video' ? '' : libSaveBtn(ref)}<button class="rm" data-act="v-rm" data-slot="${name}" ${tip('Remover')}>${svg('x', 's14')}</button></div>`;
}

// m:ss.d, para os pontos de corte
const stamp = (sec) => { const s = Math.max(0, sec); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

// Faixa de miniaturas de referência (imagens e vídeos), com o botão de adicionar no fim.
// Imagens e vídeos são numerados em separado, como os modelos se referem a eles ("imagem 1", "vídeo 1").
function vStrip(list, slot, label, hint) {
  let img = 0; let vid = 0;
  const thumbs = list.map((r, i) => {
    const n = isVid(r) ? ++vid : ++img;
    const media = isVid(r)
      ? `<video src="${esc(r.url)}${r.uploading ? '' : '#t=0.1'}" muted playsinline preload="metadata"></video>`
      : `<img src="${esc(r.url)}" alt="">`;
    if (!isVid(r)) {
      return `<div class="ref ${r.uploading ? 'uploading' : ''}" ${tip(`Imagem ${n}`)}>${media}
        <span class="idx num">${n}</span>
        ${libSaveBtn(r)}
        <button class="rm" data-act="v-rm-ref" data-list="${slot}" data-i="${i}" ${tip('Remover')}>${svg('x', 's14')}</button></div>`;
    }
    // vídeo: a miniatura mostra a duração e abre o corte de trecho ao clicar
    const what = r.range ? `trecho de ${stamp(r.range[0])} a ${stamp(r.range[1])} (original: ${clock(r.source.duration)})` : (r.duration ? clock(r.duration) : '');
    return `<div class="ref vid ${r.uploading ? 'uploading' : ''}" ${r.uploading ? '' : `data-act="v-trim" data-list="${slot}" data-i="${i}"`} ${tip(`Vídeo ${n}${what ? `, ${what}` : ''}. Clique para cortar um trecho`)}>${media}
      <span class="dur num">${r.range ? svg('scissors', 's14') : ''}<span data-fill>${r.duration ? clock(r.duration) : ''}</span></span>
      <span class="idx num">${svg('play', 's14')}${n}</span>
      <button class="rm" data-act="v-rm-ref" data-list="${slot}" data-i="${i}" ${tip('Remover')}>${svg('x', 's14')}</button></div>`;
  }).join('');
  return `<div class="refs ${list.length ? '' : 'none'}">${thumbs}<button class="ref-add" data-act="v-pick" data-slot="${slot}" ${tip(hint)}>${svg('imagePlus', 's20')}${list.length ? '' : `<span>${label}</span>`}</button>${libOpenBtn(slot)}</div>`;
}

/* ---------- biblioteca de referências (a lista e o painel ficam em app.js) ---------- */

// Imagens da biblioteca que já estão no lugar para onde o painel aberto vai mandar
function vLibraryInUse(slot) {
  const v = S.v;
  const list = slot === 'start' || slot === 'end' ? [v[slot]] : slot === 'editRefs' ? v.editRefs : v.refs;
  return new Set(list.filter(Boolean).map((r) => r.id));
}

// Põe uma imagem da biblioteca no painel de vídeo. Nos quadros inicial e final ela ocupa o lugar e o
// painel fecha; nas faixas de referência dá para ir marcando várias (outro clique tira).
function vUseLibrary(ref, slot) {
  const v = S.v;
  if (slot === 'start' || slot === 'end') {
    v[slot] = ref;
    closePop();
  } else {
    const list = slot === 'editRefs' ? v.editRefs : v.refs;
    const i = list.findIndex((r) => r.id === ref.id);
    if (i >= 0) list.splice(i, 1); else list.push(ref);
  }
  saveVideo();
  renderVMedia(); renderVModels(); renderVGo();
  if (popEl && popEl.classList.contains('lib-pop')) renderLibraryPop();
}

function renderVMedia() {
  const box = $('#vmedia');
  const v = S.v;
  box.className = 'vmedia only-video';
  if (v.mode === 'image') box.innerHTML = vSlot('start', v.start, 'Início', 'image') + vSlot('end', v.end, v.end ? 'Fim' : 'Fim (opcional)', 'image');
  else if (v.mode === 'ref') {
    box.classList.add('stack');
    box.innerHTML = vStrip(v.refs, 'refs', 'Imagens ou vídeos de referência', 'Referências: clique, arraste ou cole imagens e vídeos');
  } else if (v.mode === 'edit') {
    box.classList.add('stack');
    box.innerHTML = vSlot('video', v.video, 'Vídeo para editar', 'video')
      + vStrip(v.editRefs, 'editRefs', 'Imagens de referência (opcional)', 'Imagens de apoio para a edição: clique, arraste ou cole');
  } else if (v.mode === 'extend') box.innerHTML = vSlot('video', v.video, 'Vídeo para estender', 'video');
  else box.innerHTML = '';
}

function renderVModels() {
  const box = $('#models');
  if (!S.vcatalogLoaded) { box.innerHTML = '<div class="pgroup-chips"><span class="chip skeleton"></span><span class="chip skeleton"></span><span class="chip skeleton"></span></div>'; return; }
  const list = vEnabled();
  if (!list.length) {
    box.innerHTML = S.vcatalogError
      ? `<div class="models-empty">${svg('alert', 's16')}<span>Não consegui carregar os modelos.</span><button data-act="reload-models">Tentar de novo</button></div>`
      : '<div class="models-empty"><span>Nenhum modelo de vídeo no painel.</span><button data-act="open-settings">Escolher modelos</button></div>';
    return;
  }
  const keys = new Set(list.map((f) => f.key));
  S.v.families = S.v.families.filter((k) => keys.has(k));
  const need = vNeed();
  box.innerHTML = modelGroups(list, (f) => {
    const on = S.v.families.includes(f.key);
    const v = vPick(f, S.v.mode, need);
    const price = v?.price ?? vPrice(f);
    let t = v ? (price != null ? `${cost(price)} por segundo` : providerName(f)) : vWhyNot(S.v.mode, need, f);
    if (v?.caps) {
      // o modelo aceita menos referências do que há no painel
      const lim = [];
      if (v.caps.refs && need.images > v.caps.refs) lim.push(v.caps.refs === 1 ? 'só a primeira imagem' : `até ${v.caps.refs} imagens`);
      if (v.caps.videos && need.videos > v.caps.videos) lim.push(v.caps.videos === 1 ? 'só o primeiro vídeo' : `até ${v.caps.videos} vídeos`);
      if (lim.length) t += `, usa ${lim.join(' e ')}`;
    }
    if (v) t += `. Usa ${v.id}`; // cada modo usa uma versão diferente do modelo: mostra qual
    t += '. Duplo clique deixa só ele';
    return `<button class="chip ${on ? 'on' : ''} ${v ? '' : 'off-compat'}" data-act="v-model" data-key="${esc(f.key)}" aria-pressed="${on}" ${tip(t)}><span>${esc(f.name)}</span></button>`;
  });
  renderVDur(); // os limites de duração dependem dos modelos escolhidos
}

function renderVRatios() {
  const box = $('#ratios');
  box.hidden = usesVideo(); // editar e estender seguem a proporção do vídeo de entrada
  box.innerHTML = VRATIOS.map((r) => ratioButton(r, S.v.ratio === r, 'v-ratio')).join('');
}

function renderVOpts() {
  const near = ' (o modelo usa a mais próxima que tiver)';
  $('#vres').innerHTML = VRES.map((r) => `<button class="${S.v.res === r ? 'on' : ''}" role="radio" aria-checked="${S.v.res === r}" data-act="v-res" data-v="${r}" ${tip(`Resolução${near}`)}>${r}</button>`).join('');
  renderVDur();
  const a = $('#vaudio');
  a.classList.toggle('on', S.v.audio);
  a.setAttribute('aria-pressed', S.v.audio);
  a.innerHTML = `${svg(S.v.audio ? 'volume' : 'volumeOff', 's16')}<span>Áudio</span>`;
  a.dataset.tip = S.v.audio ? 'Com som, nos modelos que geram áudio' : 'Sem som';
}

/* ---------- duração ---------- */

// Cada modelo aceita durações diferentes: uma lista fechada (Veo: 4, 6 ou 8 s) ou uma faixa livre (Wan 3.0: 2 a 30 s).
// O controle vai do menor ao maior valor entre os modelos escolhidos; quem não aceita o valor exato usa o mais próximo.
const DUR_FALLBACK = { lo: 3, hi: 15 };

function vDurRange(d) {
  if (!d) return null;
  if (d.values) return { lo: Math.min(...d.values), hi: Math.max(...d.values) };
  return { lo: Math.max(1, Math.ceil(d.min ?? 1)), hi: Math.floor(d.max ?? 30) };
}

// Duração que o modelo vai usar de fato (a mesma conta que o servidor faz); null = o modelo decide sozinho
function vEffDur(d, want) {
  if (!d) return null;
  if (d.values) {
    let best = d.values[0]; let bestD = Infinity;
    for (const x of d.values) { const dist = Math.abs(Math.log(x) - Math.log(want)); if (dist < bestD - 1e-9) { bestD = dist; best = x; } }
    return best;
  }
  const r = vDurRange(d);
  return Math.min(r.hi, Math.max(r.lo, want));
}

// Limites do controle, a partir dos modelos escolhidos que servem para o modo atual
function vDurBounds() {
  const ranges = vRunnable().map((f) => vDurRange(vPick(f)?.caps?.dur)).filter(Boolean);
  if (!ranges.length) return { ...DUR_FALLBACK, free: false };
  return { lo: Math.min(...ranges.map((r) => r.lo)), hi: Math.max(...ranges.map((r) => r.hi)), free: true };
}

// Com um único conjunto de valores fechados em jogo, o controle "gruda" nos valores permitidos
function vDurSnap(n) {
  const durs = vRunnable().map((f) => vPick(f)?.caps?.dur).filter(Boolean);
  if (!durs.length || durs.some((d) => !d.values)) return n;
  const all = [...new Set(durs.flatMap((d) => d.values))];
  return all.reduce((best, x) => (Math.abs(x - n) < Math.abs(best - n) ? x : best), all[0]);
}

// Duração automática: o modelo escolhe (no Seedance e no Wan 3.0, por exemplo) ou acompanha o vídeo de
// referência. Estender não tem: ali a duração é quantos segundos acrescentar.
const vDurAuto = () => !!S.v.durAuto && S.v.mode !== 'edit' && S.v.mode !== 'extend';
// Duração do primeiro vídeo de referência, que a duração automática acompanha em quem não sabe escolher
const vSourceSeconds = () => (S.v.mode === 'ref' ? S.v.refs.find(isVid)?.duration || 0 : 0);

function renderVDur() {
  const box = $('#vdur');
  const note = $('#vdur-note');
  box.hidden = S.v.mode === 'edit'; // o vídeo editado mantém a duração do original
  if (box.hidden) { note.hidden = true; return; }
  const auto = vDurAuto();
  const toggle = $('#vdur-auto');
  toggle.hidden = S.v.mode === 'extend';
  toggle.classList.toggle('on', auto);
  toggle.setAttribute('aria-pressed', auto);
  toggle.dataset.tip = auto ? 'Duração automática. Clique para escolher os segundos' : 'Deixar a duração por conta do modelo';
  box.classList.toggle('auto', auto);
  const bounds = vDurBounds();
  let { lo, hi } = bounds;
  S.v.dur = Math.max(1, Math.round(Number(S.v.dur) || 5));
  if (bounds.free) S.v.dur = Math.min(hi, Math.max(lo, S.v.dur));
  else { lo = Math.min(lo, S.v.dur); hi = Math.max(hi, S.v.dur); } // sem modelo escolhido ainda: não mexe no valor guardado
  const range = $('#vdur-range');
  const num = $('#vdur-num');
  range.min = num.min = lo;
  range.max = num.max = hi;
  range.disabled = lo === hi || auto;
  if (Number(range.value) !== S.v.dur) range.value = S.v.dur;
  if (document.activeElement !== num) num.value = S.v.dur;
  box.dataset.tip = auto ? 'Duração automática: o modelo escolhe, ou acompanha o vídeo de referência'
    : `${S.v.mode === 'extend' ? 'Segundos a acrescentar' : 'Duração do vídeo'}: de ${lo} a ${hi} s com os modelos escolhidos`;
  // quem vai usar um valor diferente do pedido
  const diff = [];
  const src = vSourceSeconds();
  for (const f of vRunnable()) {
    const d = vPick(f)?.caps?.dur;
    if (auto) {
      // quem não tem duração automática acompanha o vídeo de referência ou fica na duração padrão dele
      if (!d || d.auto) continue;
      if (src) diff.push(`${f.name} acompanha o vídeo de referência (${Math.round(vEffDur(d, src))} s)`);
      else if (d.def) diff.push(`${f.name} usa ${d.def} s, o padrão dele`);
      continue;
    }
    const eff = vEffDur(d, S.v.dur);
    if (eff == null) diff.push(`${f.name} define a duração sozinho`);
    else if (eff !== S.v.dur) diff.push(`${f.name} usa ${eff} s`);
  }
  note.hidden = !diff.length;
  note.textContent = diff.join(' · ');
}

function vSetDur(n, { snap = true } = {}) {
  if (!Number.isFinite(n)) return;
  const { lo, hi } = vDurBounds();
  let v = Math.min(hi, Math.max(lo, Math.round(n)));
  if (snap) v = vDurSnap(v);
  S.v.dur = v;
  renderVDur();
  renderVGo();
  saveVideo();
}

function vMissing() {
  const v = S.v;
  if (v.mode === 'image' && !v.start) return 'Adicione a imagem inicial';
  if (v.mode === 'ref' && !v.refs.length) return 'Adicione uma referência (imagem ou vídeo)';
  if (usesVideo() && !v.video) return 'Adicione o vídeo';
  return '';
}

function vRequestBody(fams = vRunnable()) {
  const v = S.v;
  const id = (r) => (r && !r.uploading ? r.id : null);
  const ids = (list) => list.map(id).filter(Boolean);
  // refs: imagens de referência (do modo Referência ou do Editar); videos: vídeos de referência
  // só vai o que o modo usa: o que ficou guardado dos outros modos não entra
  const ref = v.mode === 'ref';
  const images = v.mode === 'edit' ? v.editRefs : ref ? v.refs.filter((r) => !isVid(r)) : [];
  return {
    prompt: v.prompt.trim(), mode: v.mode,
    inputs: {
      start: v.mode === 'image' ? id(v.start) : null, end: v.mode === 'image' ? id(v.end) : null,
      refs: ids(images), videos: ref ? ids(v.refs.filter(isVid)) : [], video: usesVideo() ? id(v.video) : null,
    },
    families: fams.map((f) => f.key), ratio: v.ratio, res: v.res, duration: vDurAuto() ? 'auto' : v.dur, audio: v.audio,
  };
}

/* ---------- custo ---------- */

// Antes de gerar, o servidor pergunta ao Atlas quanto cada modelo cobraria (sem gerar nada): veja
// askEstimate em app.js. A conta pela tabela (preço por segundo × duração) só entra se a cotação falhar,
// porque ela ignora a resolução e costuma ficar bem abaixo do cobrado.
function vTableTotal(fams) {
  const secs = S.v.mode === 'edit' ? (S.v.video?.duration || 5) : vDurAuto() ? (vSourceSeconds() || 5) : S.v.dur;
  let total = 0;
  for (const f of fams) { const p = vPick(f)?.price; if (p != null) total += p * secs; }
  return total;
}

function renderVGo() {
  const btn = $('#go');
  const fams = vRunnable();
  $('#go-icon').innerHTML = svg('sparkles', 's16');
  let reason = '';
  if (!S.config.hasKey) reason = 'Configure a API key primeiro';
  else if (vMissing()) reason = vMissing();
  else if (!S.v.prompt.trim()) reason = 'Escreva um prompt';
  else if (!S.v.families.length) reason = 'Escolha um modelo';
  else if (!fams.length) reason = `Os modelos escolhidos não servem para este modo (${vMode().label.toLowerCase()})`;
  btn.disabled = !!reason && S.config.hasKey;
  // o texto do prompt não muda o preço: fica de fora para não pedir cotação a cada tecla
  const body = fams.length ? { ...vRequestBody(fams), prompt: '' } : null;
  askEstimate('/api/video/estimate', body);
  paintEstimate(fams.map((f) => f.key), vTableTotal(fams), reason);
}

function renderVideoPanel() {
  renderVModes(); renderVMedia(); renderVModels(); renderVRatios(); renderVOpts(); renderVGo();
  $('#prompt').placeholder = videoPlaceholder();
}

/* ---------- entradas (imagens e vídeo) ---------- */

function vUpload(file, place) {
  const temp = { id: `tmp-${Math.random().toString(36).slice(2)}`, url: URL.createObjectURL(file), uploading: true, kind: file.type.startsWith('video/') ? 'video' : 'image' };
  place(temp);
  const swap = (ref) => {
    for (const k of ['start', 'end', 'video']) if (S.v[k] === temp) S.v[k] = ref;
    for (const list of [S.v.refs, S.v.editRefs]) {
      const i = list.indexOf(temp);
      if (i >= 0) { if (ref && !list.some((r) => r.id === ref.id)) list[i] = ref; else list.splice(i, 1); }
    }
  };
  const p = (async () => {
    try {
      swap(await api('/api/refs', { method: 'POST', raw: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'arquivo') } }));
    } catch (e) {
      swap(null);
      toast(e.message, 'error');
    } finally {
      URL.revokeObjectURL(temp.url);
      if (S.tab === 'video') { renderVMedia(); renderVModels(); renderVGo(); }
      saveVideo();
    }
  })();
  S.uploads.add(p);
  p.finally(() => S.uploads.delete(p));
}

// slot: 'start' | 'end' | 'refs' | 'editRefs' | 'video' quando o usuário clicou num espaço; vazio quando arrastou ou colou
function vAddFiles(files, slot) {
  const list = [...files];
  const vids = list.filter((f) => f.type.startsWith('video/'));
  const imgs = list.filter((f) => f.type.startsWith('image/'));
  const v = S.v;
  if (!vids.length && !imgs.length) {
    if (list.length) toast('Escolha uma imagem ou um vídeo.', 'error');
    return;
  }
  // arrastou ou colou num modo que não usa esse tipo de arquivo: o arquivo decide o modo
  if (!slot) {
    if (vids.length && (v.mode === 'text' || v.mode === 'image')) v.mode = 'edit';
    else if (imgs.length && v.mode === 'text') v.mode = 'image';
  }
  if (v.mode === 'ref') {
    // referências aceitam imagens e vídeos juntos
    for (const f of [...imgs, ...vids]) vUpload(f, (r) => { v.refs.push(r); });
  } else if (v.mode === 'edit') {
    // o vídeo é o que será editado; as imagens entram como referência de apoio
    if (vids.length) vUpload(vids[0], (r) => { v.video = r; });
    for (const f of imgs) vUpload(f, (r) => { v.editRefs.push(r); });
  } else if (v.mode === 'extend') {
    if (!vids.length) { toast('Este modo usa um vídeo, não uma imagem.', 'error'); return; }
    vUpload(vids[0], (r) => { v.video = r; });
  } else {
    if (!imgs.length) { toast('Escolha uma imagem.', 'error'); return; }
    const target = slot === 'end' || (!slot && v.start) ? 'end' : 'start';
    vUpload(imgs[0], (r) => { v[target] = r; });
    if (!slot && target === 'start' && imgs[1]) vUpload(imgs[1], (r) => { v.end = r; });
  }
  renderVideoPanel();
  saveVideo();
}

// Leva uma imagem ou um vídeo já gerado para o painel de vídeo
async function vUseOutput(itemId, idx, as) {
  try {
    const ref = await api('/api/refs/from-output', { method: 'POST', body: { itemId, index: idx } });
    const v = S.v;
    const inRef = v.mode === 'ref' && S.tab === 'video' && !as; // arrastou para o painel no modo Referência
    if (inRef) {
      if (!v.refs.some((r) => r.id === ref.id)) v.refs.push(ref);
    } else if (ref.kind === 'video') {
      v.video = ref;
      if (as === 'extend' || as === 'edit') v.mode = as;
      else if (!usesVideo()) v.mode = 'edit';
    } else {
      v.mode = 'image';
      v.start = ref;
    }
    saveVideo();
    if (LB.open) LB.close();
    if (S.tab !== 'video') switchTab('video'); else renderComposer();
    $('#composer .composer-scroll').scrollTo({ top: 0, behavior: 'smooth' });
    toast(inRef ? 'Adicionado às referências' : ref.kind === 'video' ? `Vídeo pronto para ${v.mode === 'extend' ? 'estender' : 'editar'}` : 'Imagem levada para o painel de vídeo', 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

async function vGenerate() {
  const btn = $('#go');
  if (!S.config.hasKey) return openSettings(true);
  if (btn.disabled) { toast(btn.dataset.tip, 'error'); return; }
  if (S.uploads.size) await Promise.allSettled([...S.uploads]);
  if (vMissing()) { toast(vMissing(), 'error'); return; }
  const fams = vRunnable();
  const skipped = S.v.families.length - fams.length;
  btn.classList.remove('sent'); void btn.offsetWidth; btn.classList.add('sent');
  try {
    const b = await api('/api/video/generate', { method: 'POST', body: vRequestBody(fams) });
    upsertBatch(b);
    $('#stream').scrollTo({ top: 0, behavior: 'smooth' });
    if (skipped) toast(`${skipped} ${skipped > 1 ? 'modelos ficaram' : 'modelo ficou'} de fora por não servir para este modo`);
  } catch (e) { toast(e.message, 'error'); }
}

function vReuseBatch(b) {
  const enabled = new Set(S.config.enabledVideo);
  const fams = b.families.filter((k) => enabled.has(k));
  const i = b.inputs || {};
  const copy = (list) => (list || []).map((r) => ({ ...r }));
  Object.assign(S.v, {
    prompt: b.prompt,
    mode: VMODES.some((m) => m.key === b.mode) ? b.mode : 'text',
    start: i.start ? { ...i.start } : null,
    end: i.end ? { ...i.end } : null,
    // no lote, as imagens ficam em refs tanto na Referência quanto no Editar; aqui cada modo tem a sua lista
    ...(b.mode === 'edit' ? { editRefs: copy(i.refs) } : { refs: [...copy(i.refs), ...copy(i.videos)] }),
    video: i.video ? { ...i.video } : null,
    families: fams.length ? fams : S.v.families,
    ratio: VRATIOS.includes(b.ratio) ? b.ratio : 'auto',
    res: VRES.includes(b.res) ? b.res : '720p',
    dur: Number(b.duration) > 0 ? Math.round(Number(b.duration)) : S.v.dur || 5,
    durAuto: b.duration === 'auto',
    audio: b.audio !== false,
  });
  renderComposer(); saveVideo();
  const ta = $('#prompt');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.classList.remove('flash'); void ta.offsetWidth; ta.classList.add('flash');
}

/* ================================================================== */
/* Linha do tempo e visualizador                                       */
/* ================================================================== */

function vBatchMeta(b) {
  const mode = vMode(b.mode);
  const i = b.inputs || {};
  const parts = [`<span class="m" ${tip(mode.long)}>${svg(mode.icon, 's14')}${mode.label}</span>`];
  const fams = [];
  for (const it of b.items) if (!fams.some((f) => f.family === it.family)) fams.push(it);
  for (const it of fams) parts.push(`<span class="m">${avatarHTML(it.family, it.familyName, it.avatar)}${esc(it.familyName)}</span>`);
  const thumbs = [i.start, i.end, ...(i.refs || [])].filter(Boolean);
  if (thumbs.length) parts.push(`<span class="m refs-mini" ${tip(b.mode === 'image' ? (i.end ? 'Quadro inicial e final' : 'Quadro inicial') : `${thumbs.length} ${thumbs.length > 1 ? 'imagens de referência' : 'imagem de referência'}`)}>${thumbs.slice(0, 5).map((r) => `<img src="${esc(r.url)}" alt="">`).join('')}</span>`);
  const rv = (i.videos || []).length;
  if (rv) parts.push(`<span class="m num" ${tip(`${rv} ${rv > 1 ? 'vídeos de referência' : 'vídeo de referência'}`)}>${svg('film', 's14')}${rv}</span>`);
  if (i.video) parts.push(`<span class="m" ${tip('Vídeo de entrada')}>${svg('video', 's14')}${i.video.duration ? clock(i.video.duration) : ''}</span>`);
  if (!usesVideo(b.mode) && b.ratio && b.ratio !== 'auto') parts.push(`<span class="m glyph" ${tip('Proporção')}>${ratioGlyph(b.ratio, 13)}${esc(b.ratio)}</span>`);
  parts.push(`<span class="m" ${tip('Resolução pedida')}>${esc(b.res || '720p')}</span>`);
  if (b.mode !== 'edit') parts.push(b.duration === 'auto' ? `<span class="m" ${tip('Duração por conta do modelo')}>duração auto</span>` : `<span class="m num" ${tip(b.mode === 'extend' ? 'Segundos acrescentados' : 'Duração pedida')}>${b.duration}s</span>`);
  if (b.audio === false) parts.push(`<span class="m" ${tip('Sem som')}>${svg('volumeOff', 's14')}</span>`);
  if (b.via === 'mcp') parts.push(agentMark(b));
  const running = b.items.some((x) => x.status === 'running' || x.status === 'queued');
  const done = b.items.filter((x) => x.status === 'done' && x.cost != null);
  const total = done.reduce((a, x) => a + x.cost, 0);
  const est = done.some((x) => x.costEstimated);
  if (done.length || running) parts.push(`<span class="m cost" ${tip(est ? COST_TIP_EST : COST_TIP)}>${running ? '<span class="mini-spin"></span>' : ''}${done.length ? `${est ? '≈ ' : ''}${costHTML(total)}` : ''}</span>`);
  return parts.join('');
}

function vTileHTML(b, it, out, idx, badge, per) {
  return `<div class="tile done video" style="aspect-ratio:${tileRatio(b, it, out)}" data-act="open" data-item="${it.id}" data-idx="${idx}" draggable="true" tabindex="0">
    <video src="${esc(out.url)}#t=0.1" muted loop playsinline preload="metadata" draggable="false"></video>
    ${badge}
    ${per != null ? `<span class="tcost num">${it.costEstimated ? '≈ ' : ''}${costHTML(per)}</span>` : ''}
    <span class="tdur num">${svg('play', 's14')}${out.duration ? clock(out.duration) : ''}</span>
    <div class="tools">
      <button data-act="v-use" data-as="edit" data-item="${it.id}" data-idx="${idx}" ${tip('Editar este vídeo')}>${svg('wand')}</button>
      <button data-act="v-use" data-as="extend" data-item="${it.id}" data-idx="${idx}" ${tip('Estender este vídeo')}>${svg('forward')}</button>
      <button data-act="download" data-item="${it.id}" data-idx="${idx}" ${tip('Baixar')}>${svg('download')}</button>
      <button data-act="variation" data-item="${it.id}" ${tip('Gerar outro com este modelo')}>${svg('refresh')}</button>
      <button data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash')}</button>
    </div>
  </div>`;
}

function vCardHTML(lb, x) {
  const { b, it, idx, o } = x;
  const params = [it.variantId ? `modelo: ${it.variantId}` : '', ...Object.entries(it.params || {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
  const facts = [
    ['Tipo', vMode(b.mode).long],
    o.w ? ['Tamanho', `${o.w} × ${o.h} px`] : null,
    o.duration ? ['Duração', `${+o.duration.toFixed(1)} s`] : null,
    o.w ? ['Proporção', ratioLabel(o.w, o.h)] : null,
    it.cost != null ? ['Custo', `${it.costEstimated ? '≈ ' : ''}${cost(it.cost)}`] : null,
    ['Criado', `${dayLabel(dayKey(b.createdAt))}, ${hhmm(it.finishedAt || b.createdAt)}`],
  ].filter(Boolean);
  return `
    <div class="lb-stage">
      <video src="${esc(o.url)}" controls autoplay loop playsinline></video>
      <button class="lb-nav prev" data-act="lb-prev" ${lb.i === 0 ? 'disabled' : ''} ${tip('Anterior (←)')}>${svg('chevL', 's20')}</button>
      <button class="lb-nav next" data-act="lb-next" ${lb.i >= lb.list.length - 1 ? 'disabled' : ''} ${tip('Próximo (→)')}>${svg('chevR', 's20')}</button>
    </div>
    <aside class="lb-side">
      <div class="lb-head">
        <span class="lb-model">${avatarHTML(it.family, it.familyName, it.avatar)}<span>${esc(it.familyName)}</span></span>
        ${params ? `<span class="lb-params" data-tip="${esc(params)}" aria-label="Parâmetros enviados">${svg('info', 's16')}</span>` : ''}
        <button class="icon-btn" data-act="lb-close" ${tip('Fechar (Esc)')}>${svg('x', 's20')}</button>
      </div>
      <div class="lb-scroll">
        <div class="lb-label"><span>Prompt</span>${b.prompt ? `<button data-act="copy-prompt" data-batch="${b.id}" ${tip('Copiar prompt')}>${svg('copy', 's14')}</button>` : ''}</div>
        <p class="lb-prompt">${b.prompt ? esc(b.prompt) : '<span class="faint">Sem prompt</span>'}</p>
        <dl class="lb-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join('')}</dl>
        ${it.note ? `<p class="lb-note">${svg('info', 's14')}<span>${esc(it.note)}</span></p>` : ''}
      </div>
      <div class="lb-foot">
        <div class="crop-buttons even">
          <button class="btn line" data-act="v-use" data-as="edit" data-item="${it.id}" data-idx="${idx}">${svg('wand', 's16')}Editar</button>
          <button class="btn line" data-act="v-use" data-as="extend" data-item="${it.id}" data-idx="${idx}">${svg('forward', 's16')}Estender</button>
        </div>
        <button class="btn line" data-act="tool" data-tool="vupscale" data-item="${it.id}" data-idx="${idx}" ${tip('Gera uma versão deste vídeo em resolução maior')}>${svg('maximize', 's16')}Aumentar resolução</button>
        <div class="lb-actions">
          <button class="icon-btn" data-act="download" data-item="${it.id}" data-idx="${idx}" ${tip('Baixar')}>${svg('download')}</button>
          <button class="icon-btn" data-act="variation" data-item="${it.id}" ${tip('Gerar outro com este modelo')}>${svg('refresh')}</button>
          <button class="icon-btn" data-act="lb-reuse" data-batch="${b.id}" ${tip('Levar para o painel e editar')}>${svg('pencil')}</button>
          <button class="icon-btn" data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash')}</button>
        </div>
        <div class="lb-count num">${lb.i + 1} de ${lb.list.length}</div>
      </div>
    </aside>`;
}

/* ================================================================== */
/* Eventos                                                             */
/* ================================================================== */

let vLastChip = {};
let vPickSlot = 'start';

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const v = S.v;
  const refresh = () => { renderVideoPanel(); saveVideo(); };
  switch (t.dataset.act) {
    case 'v-mode': v.mode = t.dataset.v; hideTip(); refresh(); break;
    case 'v-pick': {
      vPickSlot = t.dataset.slot;
      const input = $('#vfile-input');
      const videoTypes = 'video/mp4,video/quicktime,video/webm,video/*';
      // a faixa de referências aceita imagens e vídeos; as imagens de apoio da edição, só imagens
      input.accept = vPickSlot === 'video' ? videoTypes : vPickSlot === 'refs' ? `image/*,${videoTypes}` : 'image/*';
      input.multiple = vPickSlot === 'refs' || vPickSlot === 'editRefs';
      input.click();
      break;
    }
    case 'v-rm': v[t.dataset.slot] = null; hideTip(); refresh(); break;
    case 'v-rm-ref': (t.dataset.list === 'editRefs' ? v.editRefs : v.refs).splice(Number(t.dataset.i), 1); hideTip(); refresh(); break;
    case 'v-model': {
      const k = t.dataset.key;
      const now = performance.now();
      if (vLastChip.key === k && now - vLastChip.t < 400) { v.families = [k]; vLastChip = {}; }
      else { v.families = v.families.includes(k) ? v.families.filter((x) => x !== k) : [...v.families, k]; vLastChip = { key: k, t: now }; }
      renderVModels(); renderVGo(); saveVideo();
      break;
    }
    case 'v-ratio': v.ratio = t.dataset.v; renderVRatios(); renderVGo(); saveVideo(); break;
    case 'v-res': v.res = t.dataset.v; renderVOpts(); renderVGo(); saveVideo(); break;
    case 'v-trim': {
      e.stopPropagation();
      const list = t.dataset.list === 'refs' ? v.refs : null;
      const ref = list ? list[Number(t.dataset.i)] : v.video;
      if (ref && !ref.uploading) TRIM.open(ref, (next) => { if (list) { const i = list.indexOf(ref); if (i >= 0) list[i] = next; } else if (v.video === ref) v.video = next; refresh(); });
      break;
    }
    case 'trim-cancel': TRIM.close(); break;
    case 'trim-play': TRIM.toggle(); break;
    case 'trim-whole': TRIM.set(0, TRIM.dur); break;
    case 'trim-save': TRIM.save(); break;
    case 'v-audio': v.audio = !v.audio; hideTip(); renderVOpts(); renderVGo(); saveVideo(); break;
    case 'v-dur-auto': v.durAuto = !v.durAuto; hideTip(); renderVDur(); renderVGo(); saveVideo(); break;
    case 'v-use': e.stopPropagation(); vUseOutput(t.dataset.item, Number(t.dataset.idx), t.dataset.as); break;
    case 'to-video': vUseOutput(t.dataset.item, Number(t.dataset.idx), 'start'); break;
    default: break;
  }
});

$('#vfile-input').addEventListener('change', (e) => { vAddFiles(e.target.files, vPickSlot); e.target.value = ''; });

// As miniaturas da linha do tempo tocam (sem som) enquanto o mouse está em cima
document.addEventListener('pointerover', (e) => {
  const tile = e.target.closest?.('.tile.video');
  if (!tile || tile.contains(e.relatedTarget)) return;
  const video = tile.querySelector('video');
  video.currentTime = 0;
  video.play().catch(() => {});
});
document.addEventListener('pointerout', (e) => {
  const tile = e.target.closest?.('.tile.video');
  if (!tile || tile.contains(e.relatedTarget)) return;
  const video = tile.querySelector('video');
  video.pause();
  video.currentTime = 0.1;
});

// Vídeos cujas dimensões o servidor não conseguiu ler ganham a proporção certa quando carregam
document.addEventListener('loadedmetadata', (e) => {
  const video = e.target;
  const tile = video.closest?.('.tile.video');
  if (tile && video.videoWidth && video.videoHeight) tile.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  // miniaturas de entrada: preenche a duração quando o servidor não conseguiu ler do arquivo
  const fill = video.closest?.('.ref, .vslot')?.querySelector('[data-fill]');
  if (fill && !fill.textContent && Number.isFinite(video.duration)) fill.textContent = clock(video.duration);
}, true);

$('#vdur-range').addEventListener('input', (e) => vSetDur(Number(e.target.value)));
// no campo numérico, só ajusta para um valor permitido quando o usuário termina de digitar
$('#vdur-num').addEventListener('input', (e) => { const n = Number(e.target.value); if (e.target.value !== '' && n >= 1) vSetDur(n, { snap: false }); });
$('#vdur-num').addEventListener('change', (e) => { vSetDur(Number(e.target.value) || S.v.dur); e.target.value = S.v.dur; });

/* ================================================================== */
/* Cortar um trecho de um vídeo de entrada                             */
/* ================================================================== */

const TRIM_MIN = 0.5; // menor trecho, em segundos

// a e b são o início e o fim do trecho, em segundos do vídeo original
const TRIM = {
  on: false, saving: false, ref: null, src: null, done: null, dur: 0, a: 0, b: 0, el: null, video: null, drag: null,

  open(ref, done) {
    if (this.on) return;
    const src = ref.source || ref; // um vídeo já cortado reabre no original, com o trecho de antes
    Object.assign(this, { on: true, saving: false, ref, src, done, dur: 0, a: ref.range ? ref.range[0] : 0, b: ref.range ? ref.range[1] : 0, drag: null });
    hideTip();
    const el = document.createElement('div');
    el.className = 'lightbox trimbox';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="lb-card">
      <div class="lb-stage trim-stage">
        <div class="trim-view"><video src="${esc(src.url)}" playsinline preload="auto"></video></div>
        <div class="trim-row">
          <button class="icon-btn" id="trim-play" data-act="trim-play" ${tip('Tocar o trecho (Espaço)')}>${svg('play')}</button>
          <div class="trim-bar" id="trim-bar">
            <div class="trim-frames" id="trim-frames"></div>
            <div class="trim-dim" id="trim-dim-a"></div><div class="trim-dim" id="trim-dim-b"></div>
            <div class="trim-sel" id="trim-sel"><span class="th a" data-h="a"></span><span class="th b" data-h="b"></span></div>
            <div class="trim-head" id="trim-head"></div>
          </div>
        </div>
      </div>
      <aside class="lb-side">
        <div class="lb-head"><span class="lb-model"><span>Cortar trecho</span></span><button class="icon-btn" data-act="trim-cancel" ${tip('Cancelar (Esc)')}>${svg('x', 's20')}</button></div>
        <div class="lb-scroll">
          <div class="trim-fields">
            <label><span>Início</span><input class="input num" id="trim-a" type="number" step="0.1" min="0"><i>s</i></label>
            <label><span>Fim</span><input class="input num" id="trim-b" type="number" step="0.1" min="0"><i>s</i></label>
          </div>
          <dl class="lb-facts">
            <div><dt>Trecho escolhido</dt><dd class="num" id="trim-len"></dd></div>
            <div><dt>Vídeo original</dt><dd class="num" id="trim-total"></dd></div>
          </dl>
          <p class="crop-hint">Arraste as bordas da faixa para escolher onde o trecho começa e termina, ou arraste o meio para mover o trecho inteiro. O vídeo original não é alterado.</p>
        </div>
        <div class="lb-foot">
          <button class="btn line" data-act="trim-whole">Usar o vídeo inteiro</button>
          <div class="crop-buttons">
            <button class="btn line" data-act="trim-cancel">Cancelar</button>
            <button class="btn" id="trim-save" data-act="trim-save">Usar trecho</button>
          </div>
        </div>
      </aside></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.video = $('video', el);
    this.video.addEventListener('loadedmetadata', () => this.ready());
    this.video.addEventListener('timeupdate', () => this.tick());
    this.video.addEventListener('play', () => this.paintPlay());
    this.video.addEventListener('pause', () => this.paintPlay());
    this.video.addEventListener('error', () => { if (this.on) { toast('Não consegui abrir esse vídeo.', 'error'); this.close(); } });
    const bar = $('#trim-bar', el);
    bar.addEventListener('pointerdown', (e) => this.down(e));
    bar.addEventListener('pointermove', (e) => this.move(e));
    bar.addEventListener('pointerup', (e) => this.up(e));
    bar.addEventListener('pointercancel', (e) => this.up(e));
    for (const id of ['trim-a', 'trim-b']) $(`#${id}`, el).addEventListener('change', () => this.set(Number($('#trim-a', el).value), Number($('#trim-b', el).value)));
  },

  ready() {
    const d = this.video.duration;
    this.dur = Number.isFinite(d) && d > 0 ? d : (this.src.duration || 0);
    if (!this.dur) { toast('Não consegui ler a duração desse vídeo.', 'error'); this.close(); return; }
    if (!this.b || this.b > this.dur) this.b = this.dur;
    this.set(this.a, this.b);
    this.frames();
  },

  set(a, b) {
    if (!this.on || !this.dur) return;
    const min = Math.min(TRIM_MIN, this.dur);
    a = Math.min(Math.max(0, Number.isFinite(a) ? a : 0), this.dur - min);
    b = Math.min(this.dur, Math.max(a + min, Number.isFinite(b) ? b : this.dur));
    const moved = a !== this.a ? a : b !== this.b ? b : null;
    this.a = a; this.b = b;
    if (moved != null && this.video.paused) this.video.currentTime = Math.min(moved, this.dur - 0.01);
    this.paint();
  },

  paint() {
    if (!this.on || !this.dur) return;
    const pa = (this.a / this.dur) * 100;
    const pb = (this.b / this.dur) * 100;
    const sel = $('#trim-sel', this.el);
    sel.style.left = `${pa}%`;
    sel.style.width = `${pb - pa}%`;
    $('#trim-dim-a', this.el).style.width = `${pa}%`;
    $('#trim-dim-b', this.el).style.width = `${100 - pb}%`;
    const fa = $('#trim-a', this.el); const fb = $('#trim-b', this.el);
    fa.max = fb.max = this.dur.toFixed(1);
    if (document.activeElement !== fa) fa.value = this.a.toFixed(1);
    if (document.activeElement !== fb) fb.value = this.b.toFixed(1);
    $('#trim-len', this.el).textContent = `${(this.b - this.a).toFixed(1)} s (${stamp(this.a)} a ${stamp(this.b)})`;
    $('#trim-total', this.el).textContent = `${this.dur.toFixed(1)} s`;
    const save = $('#trim-save', this.el);
    save.disabled = this.saving;
    save.innerHTML = this.saving ? '<span class="mini-spin"></span>Cortando…' : 'Usar trecho';
    this.tick();
  },
  paintPlay() { if (this.on) $('#trim-play', this.el).innerHTML = svg(this.video.paused ? 'play' : 'pause'); },

  // a prévia toca só o trecho escolhido, em laço
  tick() {
    if (!this.on || !this.dur) return;
    const v = this.video;
    if (!v.paused && (v.currentTime >= this.b - 0.03 || v.currentTime < this.a - 0.05)) v.currentTime = this.a;
    $('#trim-head', this.el).style.left = `${(Math.min(this.dur, v.currentTime) / this.dur) * 100}%`;
  },
  toggle() {
    const v = this.video;
    if (!v.paused) { v.pause(); return; }
    if (v.currentTime < this.a || v.currentTime >= this.b - 0.05) v.currentTime = this.a;
    v.play().catch(() => {});
  },

  time(e) {
    const r = $('#trim-bar', this.el).getBoundingClientRect();
    return Math.min(this.dur, Math.max(0, ((e.clientX - r.left) / r.width) * this.dur));
  },
  down(e) {
    if (!this.dur || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const handle = e.target.closest('.th');
    const t = this.time(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    this.video.pause();
    if (handle) this.drag = { type: handle.dataset.h };
    else if (e.target.closest('.trim-sel')) this.drag = { type: 'move', t, a: this.a, len: this.b - this.a };
    else { this.drag = { type: 'seek' }; this.video.currentTime = t; this.tick(); }
  },
  move(e) {
    const d = this.drag;
    if (!d) return;
    const t = this.time(e);
    if (d.type === 'a') this.set(Math.min(t, this.b - TRIM_MIN), this.b);
    else if (d.type === 'b') this.set(this.a, Math.max(t, this.a + TRIM_MIN));
    else if (d.type === 'move') { const a = Math.min(this.dur - d.len, Math.max(0, d.a + t - d.t)); this.set(a, a + d.len); }
    else { this.video.currentTime = t; this.tick(); }
  },
  up() { this.drag = null; },

  // tira alguns quadros do vídeo para a faixa virar uma tira de miniaturas
  async frames() {
    const box = $('#trim-frames', this.el);
    const probe = document.createElement('video');
    probe.muted = true; probe.preload = 'auto'; probe.src = this.src.url;
    try {
      await new Promise((ok, fail) => { probe.addEventListener('loadeddata', ok, { once: true }); probe.addEventListener('error', fail, { once: true }); });
      const n = 12;
      for (let i = 0; i < n; i++) {
        if (!this.on || !document.body.contains(box)) break;
        probe.currentTime = Math.min(this.dur - 0.05, ((i + 0.5) / n) * this.dur);
        await new Promise((ok) => probe.addEventListener('seeked', ok, { once: true }));
        const c = document.createElement('canvas');
        c.height = 96; c.width = Math.max(16, Math.round((96 * probe.videoWidth) / (probe.videoHeight || 1)));
        c.getContext('2d').drawImage(probe, 0, 0, c.width, c.height);
        box.appendChild(c);
      }
    } catch { /* sem miniaturas: a faixa fica lisa */ } finally {
      probe.removeAttribute('src');
      probe.load();
    }
  },

  key(e) {
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.target.matches?.('input')) return;
    if (e.key === ' ') { e.preventDefault(); this.toggle(); }
  },

  async save() {
    if (this.saving || !this.dur) return;
    const { src, ref, done, a, b } = this;
    const whole = a < 0.05 && b > this.dur - 0.05;
    if (whole) { this.close(); if (ref.range) done({ id: src.id, url: src.url, w: src.w, h: src.h, kind: 'video', duration: src.duration || this.dur }); return; }
    if (ref.range && Math.abs(ref.range[0] - a) < 0.05 && Math.abs(ref.range[1] - b) < 0.05) { this.close(); return; } // mesmo trecho de antes
    this.saving = true;
    this.video.pause();
    this.paint();
    try {
      const out = await api(`/api/refs/${src.id}/trim`, { method: 'POST', body: { start: a, end: b } });
      const source = { id: src.id, url: src.url, w: src.w, h: src.h, kind: 'video', duration: src.duration || this.dur };
      this.close();
      done({ ...out, source, range: [a, b] });
      toast('Trecho pronto', 'ok');
    } catch (err) {
      this.saving = false;
      this.paint();
      toast(err.message, 'error');
    }
  },

  close() {
    if (!this.on) return;
    this.on = false;
    this.video?.pause();
    this.el?.remove();
    Object.assign(this, { el: null, video: null, ref: null, src: null, done: null, drag: null, saving: false });
    hideTip();
  },
};
