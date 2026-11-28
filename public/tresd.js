'use strict';

/* ================================================================== */
/* Aba 3D                                                              */
/* Carregado depois de app.js: usa o estado (S) e os utilitários de lá */
/* ================================================================== */

const DMODES = [
  { key: 'text', label: 'Texto', long: 'Texto para 3D', icon: 'type', tip: 'Criar o modelo 3D só com o prompt', hint: 'Descreva o objeto' },
  { key: 'image', label: 'Imagem', long: 'Imagem para 3D', icon: 'image', tip: 'Criar o modelo 3D a partir de uma foto ou de várias vistas do mesmo objeto', hint: 'Diga qual objeto reconstruir (por exemplo: cadeira)' },
];
// As vistas do objeto. Só a frente é obrigatória; as outras ajudam os modelos que aceitam mais de uma imagem.
const DSLOTS = [['front', 'Frente'], ['back', 'Costas'], ['left', 'Esquerda'], ['right', 'Direita']];
const DSTORE = 'gerador.3d.v1';
const DTHUMB_MAX = 80 * 1024 * 1024; // acima disso a miniatura só é feita quando o modelo é aberto

Object.assign(S, {
  dfamilies: [], dfam: new Map(), dcatalogLoaded: false, dcatalogError: null,
  // images: uma imagem por vista; opts: { modelo: { opção: valor } } (só o que foi mudado do padrão)
  d: { prompt: '', mode: 'text', images: { front: null, back: null, left: null, right: null }, families: [], opts: {}, open: {} },
});

const dMode = (key = S.d.mode) => DMODES.find((m) => m.key === key) || DMODES[0];
const dImages = () => DSLOTS.map(([slot]) => (S.d.images[slot] ? { ...S.d.images[slot], slot } : null)).filter(Boolean);
const dReady = (r) => r && !r.uploading;

function loadD3() {
  try {
    const s = JSON.parse(localStorage.getItem(DSTORE) || 'null');
    if (!s) return;
    const ok = (r) => (r && r.id && !r.uploading ? r : null);
    Object.assign(S.d, { prompt: s.prompt || '', mode: s.mode === 'image' ? 'image' : 'text', families: s.families || [], opts: s.opts || {}, open: s.open || {} });
    for (const [slot] of DSLOTS) S.d.images[slot] = ok((s.images || {})[slot]);
  } catch { /* ignora */ }
}

let dSaveTimer;
function saveD3() {
  clearTimeout(dSaveTimer);
  dSaveTimer = setTimeout(() => {
    const keep = (r) => (dReady(r) ? { id: r.id, url: r.url, w: r.w, h: r.h, kind: 'image' } : null);
    const images = {};
    for (const [slot] of DSLOTS) images[slot] = keep(S.d.images[slot]);
    const { prompt, mode, families, opts, open } = S.d;
    localStorage.setItem(DSTORE, JSON.stringify({ prompt, mode, families, opts, open, images }));
  }, 200);
}

/* ---------- modelos ---------- */

const dEnabled = () => (S.config.enabled3d || []).map((k) => S.dfam.get(k)).filter(Boolean);
const dUsable = (v) => !!v && (!v.caps || (v.caps.known && v.caps.usable));

// Variante do modelo para o modo e a quantidade de vistas (a mesma escolha que o servidor faz)
function dPick(f, mode = S.d.mode, count = dImages().length) {
  if (!f) return null;
  const v = f.variants;
  if (mode === 'text') return dUsable(v.text) ? v.text : null;
  const single = dUsable(v.image) ? v.image : null;
  const multi = dUsable(v.multi) ? v.multi : null;
  if (count > 1 && multi && (multi.caps?.images || 0) > (single?.caps?.images || 0)) return multi;
  return single || multi;
}
const dRunnable = () => S.d.families.map((k) => S.dfam.get(k)).filter((f) => f && dPick(f));
const dWhyNot = (mode = S.d.mode) => (mode === 'text' ? 'Não cria 3D só com texto' : 'Não cria 3D a partir de imagem');
const dPrice = (f) => ['text', 'image', 'multi'].map((k) => f.variants[k]?.price).filter((p) => p != null).sort((a, b) => a - b)[0] ?? null;

function dModelRow(f) {
  const variants = Object.values(f.variants);
  const unusable = variants.every((v) => v.caps && (!v.caps.known || !v.caps.usable));
  const price = dPrice(f);
  const views = Math.max(...variants.map((v) => v.caps?.images || 0));
  const kinds = `${f.variants.text ? `<span ${tip('Cria a partir de texto')}>${svg('type', 's14')}</span>` : ''}${f.variants.image || f.variants.multi ? `<span ${tip(views > 1 ? `Cria a partir de imagem (até ${views} vistas do objeto)` : 'Cria a partir de uma imagem')}>${svg(views > 1 ? 'images' : 'image', 's14')}</span>` : ''}`;
  return { unusable, sub: `<span class="kinds">${kinds}</span>${unusable ? 'Pede campos que o app não preenche' : price != null ? `a partir de <span class="num">${cost(price)}</span>` : ''}` };
}

async function loadDModels() {
  try {
    const r = await api('/api/3d/models');
    S.dfamilies = r.families || [];
    S.dfam = new Map(S.dfamilies.map((f) => [f.key, f]));
    if (Array.isArray(r.enabled)) S.config.enabled3d = r.enabled;
    S.dcatalogError = !S.dfamilies.length ? (r.error || 'Catálogo vazio.') : null;
  } catch (e) {
    S.dcatalogError = e.message;
  }
  S.dcatalogLoaded = true;
  if (!S.d.families.length && (S.config.enabled3d || []).length) S.d.families = [S.config.enabled3d[0]];
  if (S.tab === '3d') renderD3Panel();
  if (SET.open) renderModelList();
}

/* ---------- opções de cada modelo ---------- */

// Nome e explicação, em português, das opções que os modelos de hoje têm. Opção nova no catálogo aparece
// com o nome técnico e a descrição original do Atlas.
const DOPT = {
  should_texture: ['Textura', 'Gera as cores e os detalhes da superfície. Desligado, sai só a malha.'],
  texture: ['Textura', 'Gera as cores e os detalhes da superfície. Desligado, sai só a malha (mais barato).'],
  enable_pbr: ['Materiais PBR', 'Além da cor, gera os mapas de metal, rugosidade e relevo, para o modelo reagir à luz em outros programas.'],
  pbr: ['Materiais PBR', 'Além da cor, gera os mapas de metal, rugosidade e relevo, para o modelo reagir à luz em outros programas.'],
  generate_type: ['Tipo de saída', 'Com textura, ou só a geometria (modelo branco).'],
  mode: ['O que gerar', 'Malha com textura, ou só a malha, para avaliar a forma antes de pagar pela textura.'],
  enable_geometry: ['Geometria separada', 'Devolve também um arquivo só com a malha, sem textura.'],
  geometry_resolution: ['Resolução da geometria', 'Mais resolução dá mais detalhe na superfície e custa mais. A Ultra 4K só vale com texto ou uma imagem.'],
  geometry_quality: ['Qualidade da geometria', 'Detalhada custa mais.'],
  ultra_mode: ['Modo Ultra', 'Geometria com mais detalhe. Demora mais e custa mais.'],
  subdivision_level: ['Nível de detalhe', 'Alto = 1 milhão de polígonos, médio = 500 mil, baixo = 100 mil.'],
  texture_resolution: ['Resolução da textura', '2K, 4K ou 8K.'],
  texture_quality: ['Qualidade da textura', 'Detalhada custa mais.'],
  texture_prompt: ['Descrição da textura', 'Texto dizendo como é o material da superfície (até 800 caracteres).'],
  texture_image: ['Imagem para a textura', 'Uma imagem de referência só para a textura.'],
  texture_images: ['Vistas para a textura', 'Várias vistas só para guiar a textura. Não combina com a descrição nem com a imagem única de textura.'],
  texture_alignment: ['Alinhar a textura', 'Pela imagem original ou pela geometria.'],
  target_polycount: ['Polígonos', 'Quantidade de faces da malha. Em branco, o modelo decide.'],
  face_count: ['Polígonos', 'Quantidade de faces da malha. Em branco, o modelo usa o padrão dele.'],
  face_limit: ['Limite de polígonos', 'Máximo de faces da malha. Em branco, o modelo decide.'],
  should_remesh: ['Refazer a malha', 'Reorganiza a malha para um número de polígonos definido. Desligado, sai a malha de maior qualidade.'],
  topology: ['Topologia', 'Malha de triângulos ou de quadriláteros.'],
  quad: ['Malha de quadriláteros', 'Em vez de triângulos. O arquivo sai em FBX, que o visualizador do app não abre.'],
  decimation_mode: ['Redução automática', 'Nível de redução de polígonos, no lugar de um número exato.'],
  save_pre_remeshed_model: ['Guardar a malha original', 'Devolve também o arquivo de antes de refazer a malha, para comparar.'],
  pose_mode: ['Pose do personagem', 'Força a pose em A ou em T, útil para animar depois.'],
  image_enhancement: ['Melhorar a imagem', 'Trata a imagem antes de reconstruir. Desligue para manter a aparência exata.'],
  remove_lighting: ['Tirar a luz da foto', 'Remove brilhos e sombras da textura, para o modelo funcionar com a sua própria iluminação.'],
  shading: ['Tirar a luz da foto', '0 mantém as sombras da foto na textura; 1 remove o máximo.'],
  rmbg: ['Remover o fundo', 'Recorta o objeto antes de reconstruir. Desligue só se a imagem já estiver sem fundo.'],
  output_format: ['Formato do arquivo', 'O visualizador do app abre GLB.'],
  target_formats: ['Formato do arquivo', 'O visualizador do app abre GLB. Cada formato a mais aumenta o tempo.'],
  file_format: ['Formato do arquivo', 'O visualizador do app abre GLB.'],
  format: ['Formato do arquivo', 'O visualizador do app abre GLB. MP4 devolve só um vídeo do modelo girando.'],
  auto_size: ['Tamanho real', 'Estima a altura real do objeto e ajusta a escala do modelo.'],
  origin_at: ['Origem do modelo', 'Onde fica o ponto de origem quando o tamanho real está ligado.'],
  orientation: ['Orientação', 'Padrão, ou alinhada com a imagem.'],
  alpha_thumbnail: ['Miniatura sem fundo', 'Devolve também uma imagem do modelo com fundo transparente.'],
  multi_view_thumbnails: ['Miniaturas de 4 ângulos', 'Devolve também imagens do modelo de lado e de costas.'],
  moderation: ['Filtro de conteúdo', 'Confere as entradas antes de gerar. Um pedido barrado não é gerado.'],
  negative_prompt: ['Evitar', 'O que não deve aparecer no modelo.'],
  model_seed: ['Semente da geometria', 'Um número para repetir o mesmo resultado. Em branco, sorteia.'],
  texture_seed: ['Semente da textura', 'Um número para repetir a mesma textura. Em branco, sorteia.'],
  image_seed: ['Semente da imagem', 'Um número para repetir a imagem intermediária. Em branco, sorteia.'],
  seed: ['Semente', 'Um número para repetir o mesmo resultado. Em branco (ou -1), sorteia.'],
  detection_threshold: ['Sensibilidade da detecção', 'Menor encontra mais objetos, com menos precisão.'],
  export_textured_glb: ['Textura no arquivo', 'Ligado: o GLB sai com textura. Desligado: as cores ficam nos vértices.'],
  mask: ['Máscara', 'Imagem em preto e branco (branco = a pessoa) para escolher quem reconstruir.'],
  export_meshes: ['Malha por pessoa', 'Devolve também um arquivo PLY para cada pessoa encontrada.'],
  include_3d_keypoints: ['Marcadores das articulações', 'Inclui no modelo os pontos das articulações.'],
};
const DVALUE = {
  standard: 'Padrão', detailed: 'Detalhada', high: 'Alto', medium: 'Médio', low: 'Baixo', triangle: 'Triângulos', quad: 'Quadriláteros', bottom: 'Na base', center: 'No centro',
  original_image: 'Pela imagem', geometry: 'Pela geometria', default: 'Padrão', align_image: 'Alinhada à imagem', normal: 'Com textura', full: 'Malha + textura', preview: 'Só a malha',
  '': 'Nenhuma', 'a-pose': 'Pose em A', 't-pose': 'Pose em T', ultra: 'Ultra', '2k': '2K', '4k': '4K', '8k': '8K',
};
const dOptLabel = (o) => (DOPT[o.key] ? DOPT[o.key][0] : o.key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
const dOptHint = (o) => (DOPT[o.key] ? DOPT[o.key][1] : o.desc || '');
function dValueLabel(o, v) {
  if (o.key === 'generate_type' && String(v).toLowerCase() === 'geometry') return 'Só a geometria';
  if (/format/.test(o.key)) return String(v).toUpperCase();
  const fromSchema = o.labels && o.labels[v];
  const pt = DVALUE[String(v).toLowerCase()];
  return pt || fromSchema || String(v);
}
const dNum = (n) => Number(n).toLocaleString('pt-BR');

// Valores que valem para um modelo: o que o usuário mudou por cima do padrão de cada opção
function dEffective(key, caps) {
  const mine = S.d.opts[key] || {};
  const eff = {};
  for (const o of caps.options) eff[o.key] = mine[o.key] !== undefined ? mine[o.key] : o.def;
  return eff;
}
// A opção não vale nesta combinação? Devolve a opção de que ela depende (a mesma regra que o servidor aplica).
function dRuleOff(o, eff, mine, caps) {
  const on = (v) => v !== undefined && v !== null && v !== false && v !== '' && !(Array.isArray(v) && !v.length) && !(v && v.refs && !v.refs.length);
  for (const n of o.needs || []) if (n.value !== undefined ? String(eff[n.key]) !== String(n.value) : !on(eff[n.key])) return n.key;
  for (const n of o.not || []) if (n.value !== undefined ? String(eff[n.key]).toLowerCase() === String(n.value).toLowerCase() : on(eff[n.key])) return n.key;
  return (o.conflicts || []).find((k) => on(mine[k]) && caps.options.findIndex((x) => x.key === k) < caps.options.indexOf(o)) || null;
}

function dSetOpt(key, opt, value) {
  const mine = S.d.opts[key] || (S.d.opts[key] = {});
  const same = value === undefined || value === '' || value === null || (!Array.isArray(value) && typeof value !== 'object' && String(value) === String(opt.def)) || (Array.isArray(value) && Array.isArray(opt.def) && value.join() === opt.def.join());
  if (same) delete mine[opt.key]; else mine[opt.key] = value;
  if (!Object.keys(mine).length) delete S.d.opts[key];
}

function dOptControl(f, o, eff, mine, off) {
  const id = `data-key="${esc(f.key)}" data-opt="${esc(o.key)}"`;
  const dis = off ? 'disabled' : '';
  const v = eff[o.key];
  if (o.type === 'bool') return `<button class="dswitch ${v ? 'on' : ''}" role="switch" aria-checked="${!!v}" data-act="d-opt-bool" ${id} ${dis}><span class="switch ${v ? 'on' : ''}"></span></button>`;
  if (o.type === 'enum') return `<select class="dsel" data-dopt="enum" ${id} ${dis}>${o.values.map((x) => `<option value="${esc(x)}" ${String(x) === String(v) ? 'selected' : ''}>${esc(dValueLabel(o, x))}</option>`).join('')}${v === null || v === undefined ? '<option value="" selected>Automático</option>' : ''}</select>`;
  if (o.type === 'multi') { const set = new Set((v || []).map(String)); return `<div class="dchips">${o.values.map((x) => `<button class="${set.has(String(x)) ? 'on' : ''}" data-act="d-opt-multi" data-v="${esc(x)}" ${id} ${dis}>${esc(dValueLabel(o, x))}</button>`).join('')}</div>`; }
  if (o.type === 'range') {
    const step = o.integer ? Math.max(1, Math.round((o.max - o.min) / 400)) : 0.01;
    const shown = v === null || v === undefined ? '' : v;
    return `<div class="drange"><input class="range" type="range" min="${o.min}" max="${o.max}" step="${step}" value="${shown === '' ? o.min : shown}" data-dopt="range" ${id} ${dis} aria-label="${esc(dOptLabel(o))}">
      <input class="dnum num" type="number" min="${o.min}" max="${o.max}" step="${o.integer ? 1 : 0.01}" value="${shown}" placeholder="auto" data-dopt="num" ${id} ${dis} aria-label="${esc(dOptLabel(o))}"></div>`;
  }
  if (o.type === 'number') return `<input class="dnum wide num" type="number" step="${o.integer ? 1 : 'any'}" value="${mine[o.key] !== undefined ? mine[o.key] : ''}" placeholder="${o.def !== null && o.def !== undefined && o.def !== -1 ? o.def : 'aleatório'}" data-dopt="num" ${id} ${dis} aria-label="${esc(dOptLabel(o))}">`;
  if (o.type === 'text') return `<textarea class="dtext" rows="2" ${o.max ? `maxlength="${o.max}"` : ''} placeholder="${o.max ? `até ${o.max} caracteres` : ''}" data-dopt="text" ${id} ${dis} aria-label="${esc(dOptLabel(o))}">${esc(mine[o.key] || '')}</textarea>`;
  if (o.type === 'image' || o.type === 'images') {
    const refs = (mine[o.key] && mine[o.key].refs) || [];
    const max = o.type === 'image' ? 1 : o.max;
    const slot = `dopt|${f.key}|${o.key}`;
    return `<div class="dimgs">${refs.map((r, i) => `<span class="dimg ${r.uploading ? 'uploading' : ''}"><img src="${esc(r.url)}" alt=""><button class="rm" data-act="d-opt-rm" data-i="${i}" ${id} ${tip('Remover')}>${svg('x', 's14')}</button></span>`).join('')}${refs.length < max && !off
      ? `<button class="dimg add" data-act="d-opt-add" ${id} ${tip('Enviar uma imagem')}>${svg('imagePlus', 's16')}</button><button class="dimg add" data-act="lib-open" data-slot="${esc(slot)}" ${tip('Escolher da biblioteca')}>${svg('bookmark', 's16')}</button>` : ''}</div>`;
  }
  return '';
}

function renderDOpts() {
  const box = $('#dopts');
  const fams = dRunnable();
  if (!fams.length) { box.innerHTML = ''; return; }
  box.innerHTML = fams.map((f) => {
    const v = dPick(f);
    const caps = v.caps;
    if (!caps || !caps.options.length) return '';
    const mine = S.d.opts[f.key] || {};
    const eff = dEffective(f.key, caps);
    const changed = caps.options.filter((o) => mine[o.key] !== undefined).length;
    // com um modelo só, as opções já vêm abertas
    const open = S.d.open[f.key] !== undefined ? S.d.open[f.key] : fams.length === 1;
    const rows = caps.options.map((o) => {
      const off = dRuleOff(o, eff, mine, caps);
      const need = off ? caps.options.find((x) => x.key === off) : null;
      const why = off ? `Não vale agora: depende de "${need ? dOptLabel(need) : off}"` : dOptHint(o);
      const wide = o.type === 'text' || o.type === 'multi' || o.type === 'images' || o.type === 'range';
      return `<div class="dopt ${wide ? 'wide' : ''} ${off ? 'off' : ''} ${mine[o.key] !== undefined ? 'set' : ''}"><span class="dopt-name" ${tip(why)}>${esc(dOptLabel(o))}</span>${dOptControl(f, o, eff, mine, off)}</div>`;
    }).join('');
    return `<section class="dgroup ${open ? 'open' : ''}">
      <button class="dgroup-head" data-act="d-opts-toggle" data-key="${esc(f.key)}" aria-expanded="${open}">${svg('chevR', 's14 chev')}<span class="dgroup-name">Opções · ${esc(f.name)}</span>${changed ? `<span class="dgroup-count num">${changed} ${changed > 1 ? 'alteradas' : 'alterada'}</span>` : ''}</button>
      ${open ? `<div class="dgroup-body">${rows}${changed ? `<button class="dgroup-reset" data-act="d-opts-reset" data-key="${esc(f.key)}">${svg('undo', 's14')}Voltar ao padrão</button>` : ''}</div>` : ''}
    </section>`;
  }).join('');
}

/* ---------- painel ---------- */

function renderDModes() {
  $('#dmodes').innerHTML = DMODES.map((m) => `<button class="ratio ${S.d.mode === m.key ? 'on' : ''}" role="radio" aria-checked="${S.d.mode === m.key}" data-act="d-mode" data-v="${m.key}" ${tip(m.tip)}><span class="g">${svg(m.icon, 's16')}</span><span class="t">${m.label}</span></button>`).join('');
}

function dSlot(slot, label, ref) {
  if (!ref) return `<div class="vslot-wrap"><button class="vslot" data-act="d-pick" data-slot="${slot}" ${tip(slot === 'front' ? 'Clique, arraste ou cole a imagem do objeto' : `Opcional: o objeto visto de ${label.toLowerCase()}`)}>${svg('imagePlus', 's20')}<span>${label}</span></button>${libOpenBtn(`d|${slot}`, 'vslot-lib')}</div>`;
  return `<div class="vslot filled ${ref.uploading ? 'uploading' : ''}"><img src="${esc(ref.url)}" alt=""><span class="cap">${label}</span>${libSaveBtn(ref)}<button class="rm" data-act="d-rm" data-slot="${slot}" ${tip('Remover')}>${svg('x', 's14')}</button></div>`;
}

function renderDMedia() {
  const box = $('#dmedia');
  if (S.d.mode !== 'image') { box.innerHTML = ''; return; }
  const count = dImages().length;
  const room = Math.max(0, ...dRunnable().map((f) => dPick(f)?.caps?.images || 1));
  const note = count > 1 && room < count ? (room <= 1 ? 'Os modelos escolhidos usam só a imagem da frente.' : `Os modelos escolhidos usam até ${room} vistas.`)
    : count <= 1 ? 'Só a frente é obrigatória. As outras vistas do mesmo objeto são para os modelos que aceitam várias imagens.' : '';
  box.innerHTML = `<div class="dviews">${DSLOTS.map(([slot, label]) => dSlot(slot, label, S.d.images[slot])).join('')}</div>${note ? `<p class="dnote">${esc(note)}</p>` : ''}`;
}

function renderDModels() {
  const box = $('#models');
  if (!S.dcatalogLoaded) { box.innerHTML = '<div class="pgroup-chips"><span class="chip skeleton"></span><span class="chip skeleton"></span><span class="chip skeleton"></span></div>'; return; }
  const list = dEnabled();
  if (!list.length) {
    box.innerHTML = S.dcatalogError
      ? `<div class="models-empty">${svg('alert', 's16')}<span>Não consegui carregar os modelos.</span><button data-act="reload-models">Tentar de novo</button></div>`
      : '<div class="models-empty"><span>Nenhum modelo 3D no painel.</span><button data-act="open-settings">Escolher modelos</button></div>';
    return;
  }
  const keys = new Set(list.map((f) => f.key));
  S.d.families = S.d.families.filter((k) => keys.has(k));
  const count = dImages().length;
  box.innerHTML = modelGroups(list, (f) => {
    const on = S.d.families.includes(f.key);
    const v = dPick(f);
    let t = v ? (v.price != null ? `${cost(v.price)} com as opções padrão` : providerName(f)) : dWhyNot();
    if (v && S.d.mode === 'image') {
      const room = v.caps?.images || 1;
      if (count > room) t += room === 1 ? ', usa só a imagem da frente' : `, usa até ${room} vistas`;
      else if (room > 1) t += `, aceita até ${room} vistas do objeto`;
    }
    if (v) t += `. Usa ${v.id}`;
    t += '. Duplo clique deixa só ele';
    return `<button class="chip ${on ? 'on' : ''} ${v ? '' : 'off-compat'}" data-act="d-model" data-key="${esc(f.key)}" aria-pressed="${on}" ${tip(t)}><span>${esc(f.name)}</span></button>`;
  });
}

// O prompt aparece no modo Texto e, no modo Imagem, quando algum modelo escolhido usa texto junto da imagem
function dPromptUse() {
  if (S.d.mode === 'text') return { show: true, needed: true };
  const caps = dRunnable().map((f) => dPick(f)?.caps).filter(Boolean);
  return { show: caps.some((c) => c.prompt), needed: caps.some((c) => c.prompt && (c.prompt.required || c.prompt.needed)) };
}

function dMissing() {
  if (S.d.mode === 'image' && !S.d.images.front) return dImages().length ? 'Coloque uma imagem na vista da frente' : 'Adicione a imagem do objeto';
  if (dPromptUse().needed && !S.d.prompt.trim()) return S.d.mode === 'text' ? 'Escreva um prompt' : 'Escreva no prompt qual objeto reconstruir';
  for (const f of dRunnable()) {
    const caps = dPick(f).caps;
    const mine = S.d.opts[f.key] || {};
    const miss = caps ? caps.options.find((o) => o.required && mine[o.key] === undefined && (o.def === null || o.def === undefined)) : null;
    if (miss) return `${f.name}: preencha "${dOptLabel(miss)}"`;
  }
  return '';
}

function dRequestBody(fams = dRunnable()) {
  const options = {};
  for (const f of fams) {
    const caps = dPick(f)?.caps;
    const mine = S.d.opts[f.key];
    if (!caps || !mine) continue;
    const out = {};
    for (const o of caps.options) {
      const v = mine[o.key];
      if (v === undefined) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) { const ids = (v.refs || []).filter(dReady).map((r) => r.id); if (ids.length) out[o.key] = { refs: ids }; } else out[o.key] = v;
    }
    if (Object.keys(out).length) options[f.key] = out;
  }
  return {
    mode: S.d.mode, prompt: dPromptUse().show ? S.d.prompt.trim() : '',
    images: S.d.mode === 'image' ? dImages().filter(dReady).map((r) => ({ id: r.id, slot: r.slot })) : [],
    families: fams.map((f) => f.key), options,
  };
}

function renderDGo() {
  const btn = $('#go');
  const fams = dRunnable();
  $('#go-icon').innerHTML = svg('sparkles', 's16');
  let reason = '';
  if (!S.config.hasKey) reason = 'Configure a API key primeiro';
  else if (!S.d.families.length) reason = 'Escolha um modelo';
  else if (!fams.length) reason = `Os modelos escolhidos não servem para este modo (${dMode().label.toLowerCase()})`;
  else if (dMissing()) reason = dMissing();
  btn.disabled = !!reason && S.config.hasKey;
  // nos modelos 3D o preço de tabela não vale: só a cotação do Atlas diz quanto custa. O texto não muda o preço.
  const body = fams.length && (S.d.mode === 'text' || S.d.images.front) ? { ...dRequestBody(fams), prompt: '' } : null;
  askEstimate('/api/3d/estimate', body);
  paintEstimate(fams.map((f) => f.key), 0, reason);
}

function renderD3Panel() {
  const use = dPromptUse();
  $('.prompt-wrap').hidden = !use.show;
  $('#prompt').placeholder = S.d.mode === 'text' ? dMode().hint : dMode('image').hint;
  renderDModes(); renderDMedia(); renderDModels(); renderDOpts(); renderDGo();
}
const dRefresh = () => { renderD3Panel(); saveD3(); };

/* ---------- imagens ---------- */

async function dUpload(file, put) {
  const temp = { id: `tmp-${Math.random().toString(36).slice(2)}`, url: URL.createObjectURL(file), kind: 'image', uploading: true };
  put(temp);
  renderD3Panel();
  const p = (async () => {
    try { put(await api('/api/refs', { method: 'POST', raw: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name || 'imagem.png') } }), temp); }
    catch (e) { put(null, temp); toast(e.message, 'error'); }
    finally { URL.revokeObjectURL(temp.url); dRefresh(); }
  })();
  S.uploads.add(p);
  p.finally(() => S.uploads.delete(p));
}

// Arquivos soltos, colados ou escolhidos: preenchem as vistas vazias, a partir da que foi clicada
function dAddFiles(files, from) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) { toast('Aqui entram imagens do objeto', 'error'); return; }
  if (S.d.mode !== 'image') S.d.mode = 'image';
  const order = DSLOTS.map(([s]) => s);
  const slots = [...(from ? [from] : []), ...order.filter((s) => s !== from && !S.d.images[s])];
  imgs.slice(0, slots.length).forEach((file, i) => {
    const slot = slots[i];
    dUpload(file, (ref, temp) => { if (!temp || S.d.images[slot] === temp) S.d.images[slot] = ref; });
  });
  if (imgs.length > slots.length) toast('Cabem quatro vistas: frente, costas, esquerda e direita');
}

function dAddOptFiles(files, key, optKey) {
  const f = S.dfam.get(key);
  const o = dPick(f)?.caps?.options.find((x) => x.key === optKey);
  if (!o) return;
  const max = o.type === 'image' ? 1 : o.max;
  const cur = () => { const mine = S.d.opts[key] || (S.d.opts[key] = {}); return mine[optKey] && mine[optKey].refs ? mine[optKey] : (mine[optKey] = { refs: [] }); };
  for (const file of [...files].filter((x) => x.type.startsWith('image/')).slice(0, Math.max(0, max - cur().refs.length))) {
    dUpload(file, (ref, temp) => {
      const list = cur().refs;
      const i = temp ? list.indexOf(temp) : -1;
      if (!temp) list.push(ref); else if (i >= 0) { if (ref && !list.some((r) => r.id === ref.id)) list[i] = ref; else list.splice(i, 1); }
      if (!list.length) { delete S.d.opts[key][optKey]; if (!Object.keys(S.d.opts[key]).length) delete S.d.opts[key]; }
    });
  }
}

// Usa um resultado da linha do tempo (uma imagem gerada) como a vista da frente
async function dUseOutput(itemId, index) {
  try {
    const ref = await api('/api/refs/from-output', { method: 'POST', body: { itemId, index } });
    if (ref.kind && ref.kind !== 'image') { toast('O 3D parte de uma imagem', 'error'); return; }
    S.d.mode = 'image';
    const slot = DSLOTS.map(([s]) => s).find((s) => !S.d.images[s]) || 'front';
    S.d.images[slot] = ref;
    if (LB.open) LB.close();
    if (S.tab !== '3d') switchTab('3d'); else renderComposer();
    saveD3();
    toast(slot === 'front' ? 'Imagem levada para a aba 3D' : 'Imagem adicionada como outra vista', 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

// Biblioteca de referências: slot = "d|vista" ou "dopt|modelo|opção"
function dLibraryInUse(slot) {
  const [where, a, b] = String(slot).split('|');
  if (where === 'dopt') return new Set((((S.d.opts[a] || {})[b] || {}).refs || []).map((r) => r.id));
  return new Set(dImages().map((r) => r.id));
}
function dUseLibrary(ref, slot) {
  const [where, a, b] = String(slot).split('|');
  if (where === 'dopt') {
    const o = dPick(S.dfam.get(a))?.caps?.options.find((x) => x.key === b);
    if (!o) return;
    const mine = S.d.opts[a] || (S.d.opts[a] = {});
    const list = (mine[b] && mine[b].refs) || [];
    const i = list.findIndex((r) => r.id === ref.id);
    if (i >= 0) list.splice(i, 1); else if (o.type === 'image') list.splice(0, list.length, ref); else if (list.length < o.max) list.push(ref);
    if (list.length) mine[b] = { refs: list }; else { delete mine[b]; if (!Object.keys(mine).length) delete S.d.opts[a]; }
  } else {
    const used = DSLOTS.map(([s]) => s).find((s) => S.d.images[s] && S.d.images[s].id === ref.id);
    if (used) S.d.images[used] = null; else { S.d.images[a] = ref; closePop(); } // uma imagem por vista: escolheu, fecha
  }
  dRefresh();
}

/* ---------- gerar ---------- */

async function dGenerate() {
  const btn = $('#go');
  if (!S.config.hasKey) return openSettings(true);
  if (btn.disabled) { toast(btn.dataset.tip, 'error'); return; }
  if (S.uploads.size) await Promise.allSettled([...S.uploads]);
  if (dMissing()) { toast(dMissing(), 'error'); return; }
  const fams = dRunnable();
  const skipped = S.d.families.length - fams.length;
  btn.classList.remove('sent'); void btn.offsetWidth; btn.classList.add('sent');
  try {
    const b = await api('/api/3d/generate', { method: 'POST', body: dRequestBody(fams) });
    upsertBatch(b);
    $('#stream').scrollTo({ top: 0, behavior: 'smooth' });
    if (skipped) toast(`${skipped} ${skipped > 1 ? 'modelos ficaram' : 'modelo ficou'} de fora por não servir para este modo`);
  } catch (e) { toast(e.message, 'error'); }
}

function dReuseBatch(b) {
  const enabled = new Set(S.config.enabled3d || []);
  const fams = b.families.filter((k) => enabled.has(k));
  const images = { front: null, back: null, left: null, right: null };
  for (const r of b.inputs?.images || []) if (r.slot in images) images[r.slot] = { id: r.id, url: r.url, w: r.w, h: r.h, kind: 'image' };
  // as opções de imagem do lote guardam só o id: a tela precisa do endereço
  const opts = {};
  for (const [key, o] of Object.entries(b.options || {})) {
    opts[key] = {};
    for (const [k, v] of Object.entries(o)) if (!(v && typeof v === 'object' && !Array.isArray(v))) opts[key][k] = v;
    if (!Object.keys(opts[key]).length) delete opts[key];
  }
  Object.assign(S.d, { prompt: b.prompt || '', mode: b.mode === 'image' ? 'image' : 'text', images, families: fams.length ? fams : S.d.families, opts: { ...S.d.opts, ...opts } });
  renderComposer(); saveD3();
  const ta = $('#prompt');
  if (!$('.prompt-wrap').hidden) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  toast('Levado para o painel');
}

/* ================================================================== */
/* Linha do tempo                                                      */
/* ================================================================== */

const dBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const dMain = (it) => it.outputs.find((o) => o.kind === 'model' && o.ext === 'glb') || it.outputs.find((o) => o.kind === 'model') || it.outputs[0];

function dBatchMeta(b) {
  const mode = dMode(b.mode);
  const parts = [`<span class="m" ${tip(mode.long)}>${svg(mode.icon, 's14')}${mode.label}</span>`];
  const fams = [];
  for (const it of b.items) if (!fams.some((f) => f.family === it.family)) fams.push(it);
  for (const it of fams) parts.push(`<span class="m">${avatarHTML(it.family, it.familyName, it.avatar)}${esc(it.familyName)}</span>`);
  const imgs = b.inputs?.images || [];
  if (imgs.length) parts.push(`<span class="m refs-mini" ${tip(imgs.length > 1 ? `${imgs.length} vistas do objeto` : 'Imagem do objeto')}>${imgs.slice(0, 4).map((r) => `<img src="${esc(r.url)}" alt="">`).join('')}</span>`);
  if (b.via === 'mcp') parts.push(agentMark(b));
  const running = b.items.some((x) => x.status === 'running' || x.status === 'queued');
  const done = b.items.filter((x) => x.status === 'done' && x.cost != null);
  const total = done.reduce((a, x) => a + x.cost, 0);
  const est = done.some((x) => x.costEstimated);
  if (done.length || running) parts.push(`<span class="m cost" ${tip(est ? COST_TIP_EST : COST_TIP)}>${running ? '<span class="mini-spin"></span>' : ''}${done.length ? `${est ? '≈ ' : ''}${costHTML(total)}` : ''}</span>`);
  return parts.join('');
}

function dTileSpecs(b, it, badge) {
  const main = dMain(it);
  const mesh = main && main.mesh;
  if (!it.thumb) dQueueThumb(it);
  const info = mesh ? `${dNum(mesh.tris)} triângulos` : main ? (main.ext || '').toUpperCase() : '';
  return [{
    key: `${it.id}:0`, sig: `d${it.thumb || ''}|${main ? main.url : ''}`, item: it,
    make: () => `<div class="tile done d3" style="aspect-ratio:1 / 1" data-act="open" data-item="${it.id}" data-idx="0" tabindex="0">
      ${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy" draggable="false">` : `<span class="d3-ph">${svg('box', 's20')}<span>${main && main.ext === 'glb' ? 'Abrir o modelo' : esc((main?.ext || 'arquivo').toUpperCase())}</span></span>`}
      ${badge}
      ${it.cost != null ? `<span class="tcost num">${it.costEstimated ? '≈ ' : ''}${costHTML(it.cost)}</span>` : ''}
      ${info ? `<span class="tdur num">${svg('box', 's14')}${esc(info)}</span>` : ''}
      <div class="tools">
        <button data-act="download" data-item="${it.id}" data-idx="${Math.max(0, it.outputs.indexOf(main))}" ${tip(`Baixar${main ? ` (${(main.ext || '').toUpperCase()})` : ''}`)}>${svg('download')}</button>
        <button data-act="variation" data-item="${it.id}" ${tip('Gerar outro com este modelo')}>${svg('refresh')}</button>
        <button data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash')}</button>
      </div>
    </div>`,
  }];
}

/* ---------- miniaturas ---------- */

// A miniatura é uma foto do próprio modelo, tirada aqui no navegador e guardada pelo servidor
const DTHUMB = { queue: [], seen: new Set(), busy: false };
function dQueueThumb(it) {
  const main = dMain(it);
  if (!main || main.ext !== 'glb' || main.mesh?.packed || main.bytes > DTHUMB_MAX || DTHUMB.seen.has(it.id) || !V3.supported()) return;
  DTHUMB.seen.add(it.id);
  DTHUMB.queue.push({ id: it.id, url: main.url });
  dThumbNext();
}
async function dSendThumb(id, blob) {
  if (blob) await fetch(`/api/items/${id}/thumb`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/png' } }).catch(() => {});
}
async function dThumbNext() {
  if (DTHUMB.busy) return;
  const job = DTHUMB.queue.shift();
  if (!job) return;
  DTHUMB.busy = true;
  try { await dSendThumb(job.id, await V3.thumbnail(await (await fetch(job.url)).arrayBuffer())); } catch { /* sem miniatura: fica o ícone */ }
  DTHUMB.busy = false;
  setTimeout(dThumbNext, 60);
}

/* ================================================================== */
/* Janela do modelo                                                    */
/* ================================================================== */

const D3V = { key: '', viewer: null, token: 0 };
function dUnmount() {
  D3V.token++;
  if (D3V.viewer) { D3V.viewer.dispose(); D3V.viewer = null; }
  D3V.key = '';
}

function dSideHTML(lb, x) {
  const { b, it } = x;
  const main = dMain(it);
  const mesh = main && main.mesh;
  const params = [it.variantId ? `modelo: ${it.variantId}` : '', ...Object.entries(it.params || {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
  const facts = [
    ['Tipo', dMode(b.mode).long],
    mesh ? ['Triângulos', dNum(mesh.tris)] : null,
    mesh ? ['Vértices', dNum(mesh.verts)] : null,
    mesh ? ['Texturas', mesh.textures ? `${mesh.textures}${mesh.pbr ? ' (com PBR)' : ''}` : mesh.colors ? 'Cores nos vértices' : 'Sem textura'] : null,
    it.cost != null ? ['Custo', `${it.costEstimated ? '≈ ' : ''}${cost(it.cost)}`] : null,
    ['Criado', `${dayLabel(dayKey(b.createdAt))}, ${hhmm(it.finishedAt || b.createdAt)}`],
  ].filter(Boolean);
  const kindName = { model: 'Modelo', image: 'Imagem', video: 'Vídeo', file: 'Pacote' };
  const files = it.outputs.map((o, i) => `<button class="dfile" data-act="download" data-item="${it.id}" data-idx="${i}" ${tip('Baixar')}>
    <span class="dfile-ext">${esc((o.ext || '?').toUpperCase())}</span><span class="dfile-name">${esc(o.label || kindName[o.kind] || 'Arquivo')}</span><span class="dfile-size num">${o.bytes ? dBytes(o.bytes) : ''}</span>${svg('download', 's14')}</button>`).join('');
  return `
    <div class="lb-head">
      <span class="lb-model">${avatarHTML(it.family, it.familyName, it.avatar)}<span>${esc(it.familyName)}</span></span>
      ${params ? `<span class="lb-params" data-tip="${esc(params)}" aria-label="Parâmetros enviados">${svg('info', 's16')}</span>` : ''}
      <button class="icon-btn" data-act="lb-close" ${tip('Fechar (Esc)')}>${svg('x', 's20')}</button>
    </div>
    <div class="lb-scroll">
      ${b.prompt ? `<div class="lb-label"><span>Prompt</span><button data-act="copy-prompt" data-batch="${b.id}" ${tip('Copiar prompt')}>${svg('copy', 's14')}</button></div><p class="lb-prompt">${esc(b.prompt)}</p>` : ''}
      ${(b.inputs?.images || []).length ? `<div class="lb-label"><span>${b.inputs.images.length > 1 ? 'Vistas do objeto' : 'Imagem do objeto'}</span></div><div class="d3-inputs">${b.inputs.images.map((r) => `<img src="${esc(r.url)}" alt="" ${tip(Object.fromEntries(DSLOTS)[r.slot] || '')}>`).join('')}</div>` : ''}
      <dl class="lb-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join('')}</dl>
      <div class="lb-label"><span>Arquivos</span></div>
      <div class="dfiles">${files}${it.outputs.length > 1 ? `<a class="dfile all" href="/api/items/${it.id}/pack" download ${tip('Baixar todos os arquivos num .zip')}><span class="dfile-ext">ZIP</span><span class="dfile-name">Baixar tudo</span><span class="dfile-size num">${dBytes(it.outputs.reduce((s, o) => s + (o.bytes || 0), 0))}</span>${svg('download', 's14')}</a>` : ''}</div>
      ${it.note ? `<p class="lb-note">${svg('info', 's14')}<span>${esc(it.note)}</span></p>` : ''}
    </div>
    <div class="lb-foot">
      <div class="lb-actions">
        <button class="icon-btn" data-act="variation" data-item="${it.id}" ${tip('Gerar outro com este modelo')}>${svg('refresh')}</button>
        <button class="icon-btn" data-act="lb-reuse" data-batch="${b.id}" ${tip('Levar para o painel e editar')}>${svg('pencil')}</button>
        <button class="icon-btn" data-act="del-item" data-item="${it.id}" ${tip('Apagar')}>${svg('trash')}</button>
      </div>
      <div class="lb-count num">${lb.i + 1} de ${lb.list.length}</div>
    </div>`;
}

// Desenha a janela de um modelo. O palco só é refeito quando o modelo muda: o custo chegando não recarrega o arquivo.
function dRenderCard(lb, x) {
  const card = $('.lb-card', lb.el);
  const { it } = x;
  const main = dMain(it);
  const key = `${it.id}|${main ? main.url : ''}`;
  if (D3V.key === key && $('.d3-stage', card)) { $('.lb-side', card).innerHTML = dSideHTML(lb, x); return; }
  dUnmount();
  D3V.key = key;
  const nav = `<button class="lb-nav prev" data-act="lb-prev" ${lb.i === 0 ? 'disabled' : ''} ${tip('Anterior (←)')}>${svg('chevL', 's20')}</button>
    <button class="lb-nav next" data-act="lb-next" ${lb.i >= lb.list.length - 1 ? 'disabled' : ''} ${tip('Próximo (→)')}>${svg('chevR', 's20')}</button>`;
  const video = it.outputs.find((o) => o.kind === 'video');
  const canView = main && main.ext === 'glb' && V3.supported() && !(main.mesh && main.mesh.packed);
  let stage;
  if (canView) {
    stage = `<canvas class="d3-canvas" aria-label="Modelo 3D: arraste para girar"></canvas>
      <div class="d3-load"><span class="mini-spin"></span><span>Abrindo o modelo${main.bytes ? ` (${dBytes(main.bytes)})` : ''}…</span></div>
      <div class="d3-bar" hidden>
        <div class="seg"><button class="on" data-act="d3-mode" data-v="tex" ${tip('Com textura')}>Textura</button><button data-act="d3-mode" data-v="clay" ${tip('Sem textura, para ver a forma')}>Forma</button></div>
        <button class="toggle" data-act="d3-wire" aria-pressed="false" ${tip('Mostrar as linhas da malha')}>${svg('box', 's16')}<span>Malha</span></button>
        <button class="toggle on" data-act="d3-spin" aria-pressed="true" ${tip('Girar sozinho')}>${svg('refresh', 's16')}<span>Girar</span></button>
        <button class="toggle" data-act="d3-reset" ${tip('Voltar ao enquadramento inicial (ou duplo clique)')}>${svg('maximize', 's16')}</button>
      </div>
      <p class="d3-help">Arraste para girar · roda do mouse aproxima · Shift ou botão direito arrasta</p>`;
  } else {
    const why = !main ? 'Esse resultado não trouxe um arquivo de modelo.'
      : main.ext !== 'glb' ? `O visualizador do app abre arquivos GLB. Este resultado veio em ${(main.ext || '').toUpperCase()}: baixe para abrir em outro programa.`
        : main.mesh && main.mesh.packed ? 'Esse modelo vem com a malha comprimida, que o visualizador do app não abre. Baixe para abrir em outro programa.'
          : 'Este navegador não tem WebGL2, que o visualizador 3D precisa.';
    stage = `${video ? `<video src="${esc(video.url)}" controls autoplay loop muted playsinline></video>` : it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : `<span class="d3-ph big">${svg('box', 's20')}</span>`}<p class="d3-why">${svg('info', 's14')}<span>${esc(why)}</span></p>`;
  }
  card.innerHTML = `<div class="lb-stage d3-stage">${stage}${nav}</div><aside class="lb-side">${dSideHTML(lb, x)}</aside>`;
  if (canView) dMount(card, it, main);
}

async function dMount(card, it, main) {
  const token = D3V.token;
  const stage = $('.d3-stage', card);
  const failed = (msg) => { const l = $('.d3-load', stage); if (l) l.innerHTML = `${svg('alert', 's16')}<span>${esc(msg)}</span>`; };
  try {
    const viewer = V3.create($('.d3-canvas', stage), { onSpin: (v) => { const b = $('[data-act="d3-spin"]', stage); if (b) { b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); } } });
    D3V.viewer = viewer;
    const res = await fetch(main.url);
    if (!res.ok) throw new Error('Não consegui ler o arquivo do modelo.');
    const buf = await res.arrayBuffer();
    if (token !== D3V.token) return; // fechou ou trocou de modelo enquanto carregava
    await viewer.load(buf);
    if (token !== D3V.token) return;
    $('.d3-load', stage)?.remove();
    $('.d3-bar', stage).hidden = false;
    // modelo grande demais para a fila de miniaturas: aproveita que está aberto e tira a foto agora
    if (!it.thumb && !DTHUMB.seen.has(it.id)) { DTHUMB.seen.add(it.id); viewer.setSpin(false); dSendThumb(it.id, await viewer.snapshot()); viewer.setSpin(true); }
  } catch (e) {
    if (token === D3V.token) failed(e.code ? e.message : 'Não consegui abrir esse modelo no visualizador. Baixe o arquivo para abrir em outro programa.');
  }
}

/* ---------- cliques e campos ---------- */

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const d = S.d;
  const fam = t.dataset.key ? S.dfam.get(t.dataset.key) : null;
  const opt = fam && t.dataset.opt ? dPick(fam)?.caps?.options.find((o) => o.key === t.dataset.opt) : null;
  switch (t.dataset.act) {
    case 'd-mode': d.mode = t.dataset.v === 'image' ? 'image' : 'text'; hideTip(); renderComposer(); saveD3(); break;
    case 'd-pick': D3PICK = { slot: t.dataset.slot }; $('#dfile-input').multiple = true; $('#dfile-input').click(); break;
    case 'd-rm': d.images[t.dataset.slot] = null; hideTip(); dRefresh(); break;
    case 'd-model': {
      const k = t.dataset.key; const now = performance.now();
      if (dLastChip.key === k && now - dLastChip.t < 400) { d.families = [k]; dLastChip = {}; }
      else { d.families = d.families.includes(k) ? d.families.filter((x) => x !== k) : [...d.families, k]; dLastChip = { key: k, t: now }; }
      dRefresh();
      break;
    }
    case 'd-opts-toggle': { const k = t.dataset.key; const open = d.open[k] !== undefined ? d.open[k] : dRunnable().length === 1; d.open[k] = !open; renderDOpts(); saveD3(); break; }
    case 'd-opts-reset': delete d.opts[t.dataset.key]; hideTip(); renderDOpts(); renderDGo(); saveD3(); break;
    case 'd-opt-bool': if (opt) { dSetOpt(fam.key, opt, !dEffective(fam.key, dPick(fam).caps)[opt.key]); renderDOpts(); renderDGo(); saveD3(); } break;
    case 'd-opt-multi': {
      if (!opt) break;
      const cur = new Set((dEffective(fam.key, dPick(fam).caps)[opt.key] || []).map(String));
      const v = t.dataset.v;
      if (cur.has(v)) { if (cur.size > Math.max(1, opt.min)) cur.delete(v); } else if (cur.size < opt.max) cur.add(v);
      dSetOpt(fam.key, opt, opt.values.filter((x) => cur.has(String(x))));
      renderDOpts(); renderDGo(); saveD3();
      break;
    }
    case 'd-opt-add': D3PICK = { key: t.dataset.key, opt: t.dataset.opt }; $('#dfile-input').multiple = opt && opt.type === 'images'; $('#dfile-input').click(); break;
    case 'd-opt-rm': {
      const mine = d.opts[t.dataset.key]; const list = mine && mine[t.dataset.opt] && mine[t.dataset.opt].refs;
      if (list) { list.splice(Number(t.dataset.i), 1); if (!list.length) { delete mine[t.dataset.opt]; if (!Object.keys(mine).length) delete d.opts[t.dataset.key]; } }
      hideTip(); renderDOpts(); renderDGo(); saveD3();
      break;
    }
    case 'to-3d': dUseOutput(t.dataset.item, Number(t.dataset.idx)); break;
    case 'd3-mode': if (D3V.viewer) { D3V.viewer.setMode(t.dataset.v); for (const b of $$('[data-act="d3-mode"]', t.parentElement)) b.classList.toggle('on', b === t); } break;
    case 'd3-wire': if (D3V.viewer) { const on = t.getAttribute('aria-pressed') !== 'true'; if (D3V.viewer.setWire(on)) { t.classList.toggle('on', on); t.setAttribute('aria-pressed', on); } else toast('Essa malha é grande demais para mostrar as linhas', 'error'); } break;
    case 'd3-spin': if (D3V.viewer) { const on = !D3V.viewer.spin; D3V.viewer.setSpin(on); t.classList.toggle('on', on); t.setAttribute('aria-pressed', on); } break;
    case 'd3-reset': if (D3V.viewer) D3V.viewer.reset(); break;
    default: break;
  }
});
let dLastChip = {};
let D3PICK = null; // para onde vai o arquivo escolhido: uma vista ou uma opção de imagem

$('#dfile-input').addEventListener('change', (e) => {
  const files = e.target.files;
  if (D3PICK && D3PICK.opt) dAddOptFiles(files, D3PICK.key, D3PICK.opt); else dAddFiles(files, D3PICK && D3PICK.slot);
  e.target.value = '';
  D3PICK = null;
});

// seletores, números e textos das opções
function dOptInput(e, done) {
  const t = e.target.closest('[data-dopt]');
  if (!t) return;
  const fam = S.dfam.get(t.dataset.key);
  const opt = fam && dPick(fam)?.caps?.options.find((o) => o.key === t.dataset.opt);
  if (!opt) return;
  const kind = t.dataset.dopt;
  let v = t.value;
  if (kind === 'enum') v = v === '' ? undefined : opt.numeric ? Number(v) : v;
  else if (kind === 'range' || kind === 'num') v = v === '' ? undefined : Number(v);
  if ((kind === 'range' || kind === 'num') && v !== undefined && !Number.isFinite(v)) return;
  dSetOpt(fam.key, opt, v);
  saveD3();
  if (kind === 'range') { const n = t.parentElement.querySelector('[data-dopt="num"]'); if (n) n.value = v; }
  // enquanto digita, não redesenha (perderia o cursor); ao terminar, atualiza o que depende do valor
  if (done || kind === 'enum') renderDOpts();
  renderDGo();
}
$('#dopts').addEventListener('input', (e) => dOptInput(e, false));
$('#dopts').addEventListener('change', (e) => dOptInput(e, true));
