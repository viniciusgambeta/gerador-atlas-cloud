// As ferramentas que os agentes de IA enxergam pelo MCP: o que cada uma recebe e o que faz.
// Tudo passa pelas mesmas funções que a tela usa (ops, montado no server.js), então o que um
// agente gera aparece na linha do tempo do Gerador como qualquer outra geração.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { fileURLToPath } = require('url');

const IMG_RATIOS = ['auto', '1:1', '4:5', '3:4', '2:3', '9:16', '16:9', '3:2', '4:3', '21:9'];
const VID_RATIOS = ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
const TIERS = ['1K', '2K', '4K'];
const VRES = ['480p', '720p', '1080p', '4K'];
// nome que o agente usa -> modo interno
const MODES = { texto: 'text', imagem: 'image', referencia: 'ref', editar: 'edit', estender: 'extend' };
const MODE_PT = Object.fromEntries(Object.entries(MODES).map(([pt, m]) => [m, pt]));
// áudio: nome que o agente usa -> modo interno
const AUDIO_MODES = { fala: 'speech', musica: 'music', efeito: 'sfx', transcrever: 'stt' };
const AUDIO_PT = Object.fromEntries(Object.entries(AUDIO_MODES).map(([pt, m]) => [m, pt]));
const LANGS = ['auto', 'pt', 'en', 'es'];
// quais entradas cada modo de vídeo usa
const MODE_USES = { text: [], image: ['imagem_inicial', 'imagem_final'], ref: ['referencias'], edit: ['video', 'referencias'], extend: ['video'] };

const MAX_WAIT = 240; // segundos: abaixo do tempo em que o próprio Node desiste de esperar uma resposta HTTP
const MAX_INPUT = 300 * 1024 * 1024;
const FILE_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
};

/* ------------------------------------------------------------------ */
/* Definição das ferramentas                                           */
/* ------------------------------------------------------------------ */

const INPUT_HELP = 'caminho absoluto de um arquivo deste computador, URL http(s) ou o item_id de um resultado anterior do Gerador';
const WAIT_PROP = {
  type: 'integer', minimum: 0, maximum: MAX_WAIT,
  description: `Quantos segundos esperar pelo término antes de responder (padrão 45, máximo ${MAX_WAIT}). Muitos clientes cortam chamadas com mais de 60 s. A geração continua mesmo que a espera acabe.`,
};
const PREVIEW_PROP = { type: 'boolean', description: 'true devolve também uma miniatura de cada resultado, para você ver o que foi gerado (gasta mais tokens). Padrão false.' };
const ESTIMATE_PROP = { type: 'boolean', description: 'true devolve só o custo estimado, sem gerar nem cobrar nada. Padrão false.' };
const MODELS_PROP = (kind) => ({
  type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 6,
  description: `Um ou mais modelos, pelo id ou pelo nome que aparece em listar_modelos (tipo "${kind}"). Com vários, cada um gera o seu resultado para comparar, e cada um é cobrado.`,
});

const TOOLS = [
  {
    name: 'listar_modelos',
    title: 'Listar modelos',
    description: 'Lista os modelos de imagem, de vídeo ou de áudio ligados no Gerador (estúdio local do usuário que gera pelo Atlas Cloud), com o preço e o que cada um aceita: referências, modos, durações, vozes. Chame antes de gerar para escolher o modelo.',
    inputSchema: {
      type: 'object',
      properties: { tipo: { type: 'string', enum: ['imagem', 'video', 'audio'], description: 'Quais modelos listar.' } },
      required: ['tipo'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'gerar_imagem',
    title: 'Gerar imagem',
    description: 'Gera imagens a partir de um prompt, com ou sem imagens de referência (para editar uma imagem, manter um personagem ou seguir um estilo). Cada imagem é cobrada no saldo do Atlas Cloud do usuário. Os arquivos ficam salvos no computador (o caminho vem em "arquivos") e aparecem na linha do tempo do Gerador. Se não terminar dentro de esperar_segundos, a resposta vem com status "em_andamento" e o id para acompanhar com consultar_geracao.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Descrição da imagem. Com referências, descreva o que fazer com elas ("imagem 1", "imagem 2"… na ordem enviada).' },
        modelos: MODELS_PROP('imagem'),
        proporcao: { type: 'string', enum: IMG_RATIOS, description: 'Proporção da imagem. Cada modelo usa a mais próxima que aceita. Padrão "auto".' },
        qualidade: { type: 'string', enum: TIERS, description: 'Resolução aproximada. Cada modelo usa a mais próxima que aceita. Padrão "1K".' },
        quantidade: { type: 'integer', minimum: 1, maximum: 8, description: 'Quantas imagens gerar. Só vale com um único modelo. Padrão 1.' },
        referencias: { type: 'array', items: { type: 'string' }, maxItems: 10, description: `Imagens de referência (opcional). Cada item: ${INPUT_HELP}.` },
        apenas_estimar: ESTIMATE_PROP,
        esperar_segundos: WAIT_PROP,
        incluir_previa: PREVIEW_PROP,
      },
      required: ['prompt', 'modelos'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'gerar_video',
    title: 'Gerar vídeo',
    description: 'Gera ou edita vídeos. Modos: "texto" (só o prompt), "imagem" (anima imagem_inicial; imagem_final é opcional), "referencia" (usa imagens e/ou vídeos de personagem, objeto, estilo ou movimento), "editar" (altera um vídeo existente pelo prompt) e "estender" (continua um vídeo existente). Vídeo é cobrado por segundo no saldo do Atlas Cloud do usuário e custa bem mais que imagem. Costuma levar de 1 a 10 minutos: quase sempre a resposta vem com status "em_andamento" e você acompanha com consultar_geracao.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Descrição do vídeo, do movimento, da alteração ou da continuação. Obrigatório em todos os modos.' },
        modelos: MODELS_PROP('video'),
        modo: { type: 'string', enum: Object.keys(MODES), description: 'Como criar o vídeo. Se faltar, é deduzido das entradas: imagem_inicial → "imagem", referencias → "referencia", nada → "texto". Com "video" é preciso dizer "editar" ou "estender".' },
        proporcao: { type: 'string', enum: VID_RATIOS, description: 'Proporção do vídeo. Cada modelo usa a mais próxima que aceita. Padrão "auto". Em "editar" e "estender" vale a do vídeo original.' },
        resolucao: { type: 'string', enum: VRES, description: 'Resolução. Cada modelo usa a mais próxima que aceita; resolução maior custa mais. Padrão "720p".' },
        duracao: { type: 'integer', minimum: 1, maximum: 60, description: 'Duração em segundos. Cada modelo usa o valor mais próximo que aceita (veja em listar_modelos). Padrão 5. Em "editar" vale a duração do vídeo original.' },
        audio: { type: 'boolean', description: 'Gerar com som, nos modelos que têm áudio. Padrão true.' },
        imagem_inicial: { type: 'string', description: `Modo "imagem": primeiro quadro do vídeo. Aceita ${INPUT_HELP}.` },
        imagem_final: { type: 'string', description: 'Modo "imagem": último quadro do vídeo (opcional; nem todo modelo aceita).' },
        referencias: { type: 'array', items: { type: 'string' }, maxItems: 10, description: `Modo "referencia": imagens e/ou vídeos de referência. Modo "editar": imagens de referência opcionais. Cada item: ${INPUT_HELP}.` },
        video: { type: 'string', description: `Modos "editar" e "estender": o vídeo de entrada. Aceita ${INPUT_HELP}.` },
        apenas_estimar: ESTIMATE_PROP,
        esperar_segundos: WAIT_PROP,
        incluir_previa: PREVIEW_PROP,
      },
      required: ['prompt', 'modelos'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'gerar_audio',
    title: 'Gerar áudio',
    description: 'Gera áudio ou transcreve um áudio. Modos: "fala" (lê um texto com uma voz), "musica" (cria uma música a partir de uma descrição, com letra opcional), "efeito" (efeito sonoro ou som ambiente) e "transcrever" (passa um áudio para texto). É cobrado no saldo do Atlas Cloud do usuário. Os arquivos ficam salvos no computador (o caminho vem em "arquivos"); na transcrição o resultado vem em "texto".',
    inputSchema: {
      type: 'object',
      properties: {
        modo: { type: 'string', enum: Object.keys(AUDIO_MODES), description: 'O que fazer.' },
        texto: { type: 'string', description: 'Modo "fala": o texto a ser falado. Modos "musica" e "efeito": a descrição do som (estilo, clima, instrumentos, o que acontece). Não se usa em "transcrever".' },
        modelos: MODELS_PROP('audio'),
        voz: { type: 'string', description: 'Modo "fala": a voz, pelo id ou pelo nome que aparece em listar_modelos. Nos modelos marcados com aceita_voz_por_id (ElevenLabs v4), também vale o ID de qualquer voz do ElevenLabs, inclusive uma clonada. Sem isso, cada modelo usa a voz padrão dele.' },
        voz_de_audio: { type: 'string', description: `Modo "fala", só nos modelos marcados com clona_voz_de_audio: uma amostra de 5 a 30 s de uma voz, que o modelo imita. Aceita ${INPUT_HELP}.` },
        velocidade: { type: 'number', minimum: 0.5, maximum: 2, description: 'Modo "fala": velocidade da voz (1 é o normal). Nem todo modelo aceita.' },
        idioma: { type: 'string', enum: LANGS, description: 'Idioma da fala ou do áudio a transcrever. Padrão "auto" (o modelo descobre).' },
        letra: { type: 'string', description: 'Modo "musica": a letra (opcional). Sem letra, o modelo escreve uma ou faz só o instrumental.' },
        instrumental: { type: 'boolean', description: 'Modo "musica": só os instrumentos, sem voz. Padrão false.' },
        duracao: { type: 'integer', minimum: 1, maximum: 600, description: 'Modos "musica" e "efeito": duração em segundos, nos modelos que aceitam (veja em listar_modelos).' },
        loop: { type: 'boolean', description: 'Modo "efeito": som que se repete sem emenda. Padrão false.' },
        audio: { type: 'string', description: `Modo "transcrever": o áudio (ou vídeo) de entrada. Aceita ${INPUT_HELP}.` },
        apenas_estimar: ESTIMATE_PROP,
        esperar_segundos: WAIT_PROP,
      },
      required: ['modo', 'modelos'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'consultar_geracao',
    title: 'Consultar geração',
    description: 'Mostra o andamento e o resultado de uma geração do Gerador: status de cada modelo, caminho dos arquivos e custo. Se ainda estiver gerando, espera até esperar_segundos pelo término.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'O id devolvido por gerar_imagem, gerar_video ou listar_geracoes (o item_id de um resultado também serve).' },
        esperar_segundos: WAIT_PROP,
        incluir_previa: PREVIEW_PROP,
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'listar_geracoes',
    title: 'Listar gerações',
    description: 'Lista as gerações mais recentes do Gerador, as do usuário e as dos agentes, da mais nova para a mais antiga, com o prompt, o status e o caminho dos arquivos. Útil para reaproveitar um resultado anterior como entrada (pelo item_id).',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['imagem', 'video', 'audio'], description: 'Só imagens, só vídeos ou só áudios. Sem isso, lista tudo.' },
        limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Quantas gerações devolver. Padrão 10.' },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'ver_saldo',
    title: 'Ver saldo',
    description: 'Mostra o saldo do usuário no Atlas Cloud, quanto os agentes já gastaram hoje e os limites de gasto definidos nas Configurações do Gerador.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

const INSTRUCTIONS = 'Gerador: estúdio local do usuário para criar imagens, vídeos e áudios (fala, música, efeitos, transcrição) com os modelos do Atlas Cloud. '
  + 'Fluxo: listar_modelos, depois gerar_imagem, gerar_video ou gerar_audio, depois consultar_geracao enquanto o status for "em_andamento". '
  + 'Cada geração gasta o saldo do usuário: prefira o modelo mais barato que resolve, não repita gerações sem necessidade e use apenas_estimar quando o custo for incerto (vídeo principalmente). '
  + 'Os arquivos ficam no computador do usuário (o caminho vem em "arquivos") e aparecem na linha do tempo do Gerador.';

/* ------------------------------------------------------------------ */
/* Execução                                                            */
/* ------------------------------------------------------------------ */

function create(ops) {
  // O texto do erro volta para o agente, que lê e corrige o pedido
  const fail = (msg) => { throw new Error(msg); };
  const text = (obj) => ({ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1) });
  const usd = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10000) / 10000);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const isTrue = (v) => v === true || v === 'true';
  const listOf = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map((x) => String(x || '').trim()).filter(Boolean);
  const int = (v, lo, hi, dflt) => {
    if (v == null || v === '') return dflt;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };

  function allowed() {
    if (!ops.settings().enabled) fail('O acesso de agentes está desligado no Gerador. Peça ao usuário para ligar em Configurações > Agentes de IA.');
  }
  function needKey() {
    if (!ops.hasKey()) fail(`O Gerador ainda não tem a API key do Atlas Cloud. Peça ao usuário para configurar em ${ops.baseUrl()}.`);
  }

  // Limites de gasto dos agentes, definidos pelo usuário nas Configurações (0 = sem limite)
  function guard(estimate) {
    const s = ops.settings();
    const value = estimate || 0;
    const where = 'Peça ao usuário para aumentar o limite em Configurações > Agentes de IA.';
    if (s.maxPerCall > 0 && value > s.maxPerCall + 1e-9) {
      fail(`Custo estimado de US$ ${value.toFixed(2)} passa do limite por geração dos agentes (US$ ${s.maxPerCall.toFixed(2)}). Reduza quantidade, duração, resolução ou número de modelos. ${where}`);
    }
    const spent = ops.spentToday();
    if (s.maxPerDay > 0 && spent + value > s.maxPerDay + 1e-9) {
      fail(`Limite diário dos agentes atingido: já foram US$ ${spent.toFixed(2)} hoje e esta geração custaria cerca de US$ ${value.toFixed(2)} (limite de US$ ${s.maxPerDay.toFixed(2)} por dia). ${where}`);
    }
  }

  const origin = (ctx) => ({ agent: String(ctx?.client?.name || ctx?.agent || '').replace(/[^\w .\-/]/g, '').trim().slice(0, 40) });

  /* ---------- modelos ---------- */

  async function resolveModels(kind, wanted) {
    const label = kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'imagem';
    const list = listOf(wanted);
    if (!list.length) fail(`Informe pelo menos um modelo em "modelos". Use listar_modelos (tipo "${label}") para ver os disponíveis.`);
    if (list.length > 6) fail('Use no máximo 6 modelos por geração.');
    await ops.ensureCatalog();
    const all = ops.families(kind);
    const on = new Set(ops.enabledKeys(kind));
    const enabled = all.filter((f) => on.has(f.key));
    const names = (fams) => fams.map((f) => `${f.name} (${f.key})`).join(', ') || 'nenhum';
    // primeiro o id ou o nome exato; depois um nome parcial ("kling o3" acha "Kling Video O3 Std")
    const find = (pool, w) => {
      const n = norm(w);
      const exact = pool.filter((f) => f.key.toLowerCase() === w.toLowerCase() || norm(f.name) === n || norm(f.key) === n);
      if (exact.length || !n) return exact;
      const words = n.split(' ');
      return pool.filter((f) => { const have = new Set(`${norm(f.name)} ${norm(f.key)}`.split(' ')); return words.every((x) => have.has(x)); });
    };
    const out = [];
    for (const w of list) {
      const hits = find(enabled, w);
      if (hits.length === 1) { if (!out.includes(hits[0])) out.push(hits[0]); continue; }
      if (hits.length > 1) fail(`"${w}" combina com mais de um modelo: ${names(hits)}. Use o id.`);
      if (find(all, w).length) fail(`O modelo "${w}" existe no Atlas Cloud mas não está ligado no Gerador. Use um dos ligados (${names(enabled)}) ou peça ao usuário para ligar esse modelo nas Configurações.`);
      fail(`Modelo "${w}" não encontrado. Ligados no Gerador: ${names(enabled)}.`);
    }
    await ops.loadCaps(out);
    return out;
  }

  async function listarModelos(a) {
    const kind = { video: 'video', imagem: 'image', audio: 'audio' }[norm(a.tipo)];
    if (!kind) fail('Informe "tipo": "imagem", "video" ou "audio".');
    await ops.ensureCatalog();
    const on = new Set(ops.enabledKeys(kind));
    const fams = ops.families(kind).filter((f) => on.has(f.key));
    await ops.loadCaps(fams);
    const note = 'Só aparecem os modelos que o usuário ligou nas Configurações do Gerador.';
    if (kind === 'audio') {
      const modelos = fams.map((f) => {
        const v = f.variants.main;
        const c = ops.publicAudioCaps(ops.caps(v.id)) || {};
        const m = { id: f.key, nome: f.name, empresa: f.provider, modo: AUDIO_PT[f.kind], preco_usd: usd(v.price), unidade_do_preco: v.unit || 'geração' };
        if (c.voice) {
          m.voz_padrao = c.voice.default;
          m.vozes = c.voice.list.slice(0, 40).map((x) => [x.v, x.name && x.name !== x.v ? x.name : '', x.gender, x.lang].filter(Boolean).join(' | '));
          if (c.voice.list.length > 40) m.total_de_vozes = c.voice.list.length;
          if (c.voice.custom) m.aceita_voz_por_id = true;
        }
        if (c.voiceFromAudio) m.clona_voz_de_audio = true;
        if (c.speed) m.velocidade = `${c.speed.min} a ${c.speed.max}`;
        if (c.lang) m.aceita_idioma = true;
        if (c.lyrics) m.aceita_letra = true;
        if (c.instrumental) m.aceita_instrumental = true;
        if (c.duration) m.duracao_s = `${c.duration.min} a ${c.duration.max}`;
        if (c.loop) m.aceita_loop = true;
        if (c.textMax) m.max_caracteres = c.textMax;
        return m;
      });
      return [text({ tipo: 'audio', modelos, modos: Object.keys(AUDIO_MODES), idiomas: LANGS, observacao: `${note} Em "vozes", cada item é "id | nome | gênero | idioma"; use o id em "voz".` })];
    }
    if (kind === 'image') {
      const modelos = fams.map((f) => {
        const plain = ops.pickImage(f, false);
        const withRefs = ops.pickImage(f, true);
        const m = { id: f.key, nome: f.name, empresa: f.provider };
        if (plain) m.preco_por_imagem_usd = usd(plain.price);
        m.aceita_referencias = !!withRefs;
        if (withRefs) {
          const max = ops.caps(withRefs.id)?.maxImages;
          if (max) m.max_referencias = max;
          if (!plain) { m.exige_referencia = true; m.preco_por_imagem_usd = usd(withRefs.price); } else if (withRefs.price !== plain.price) m.preco_com_referencia_usd = usd(withRefs.price);
        }
        return m;
      });
      return [text({ tipo: 'imagem', modelos, proporcoes: IMG_RATIOS, qualidades: TIERS, observacao: `${note} Preços da tabela do Atlas Cloud; qualidade maior pode custar mais.` })];
    }
    const modelos = fams.map((f) => {
      const m = { id: f.key, nome: f.name, empresa: f.provider, modos: {} };
      for (const [pt, mode] of Object.entries(MODES)) {
        const v = ops.pickVideo(f, mode, {});
        if (!v) continue;
        const c = ops.publicVideoCaps(ops.caps(v.id)) || {};
        const o = { preco_por_segundo_usd: usd(v.price) };
        if (mode !== 'edit') o.duracao_s = !c.dur ? 'definida pelo modelo' : c.dur.values ? c.dur.values : `${c.dur.min ?? 1} a ${c.dur.max ?? 30}`;
        if (c.audio) o.audio = true;
        if (mode === 'image' && ops.pickVideo(f, 'image', { end: true })) o.aceita_imagem_final = true;
        if (mode === 'ref') { o.max_imagens = c.refs || 0; o.max_videos = c.videos || 0; }
        if (mode === 'edit') o.max_imagens_de_referencia = c.refs || 0;
        m.modos[pt] = o;
      }
      return m;
    });
    return [text({ tipo: 'video', modelos, proporcoes: VID_RATIOS, resolucoes: VRES, observacao: `${note} O preço por segundo é o da tabela e sobe com a resolução: use apenas_estimar em gerar_video para o valor de uma geração.` })];
  }

  /* ---------- entradas (imagens e vídeos que o agente manda) ---------- */

  // Aceita item_id de um resultado, endereço do próprio Gerador, URL, data: ou arquivo local
  async function input(src, label) {
    const s = String(src || '').trim();
    try {
      const m = /^(i[a-z0-9]{6,})(?:#(\d+))?$/i.exec(s);
      if (m) {
        const ref = await ops.refFromOutput(m[1], m[2] ? Number(m[2]) - 1 : 0);
        if (!ref) fail('não achei esse resultado no Gerador (use listar_geracoes para ver os item_id).');
        return ref;
      }
      const own = ops.ownMedia(s);
      if (own) return await ops.saveRef(await fsp.readFile(own), path.basename(own), FILE_MIME[path.extname(own).toLowerCase()]);
      if (/^(https?:)?\/\//i.test(s) || s.startsWith('data:')) {
        const { buf, mime } = await ops.download(s, 5 * 60e3);
        if (buf.length > MAX_INPUT) fail('arquivo grande demais (máximo de 300 MB).');
        const name = s.startsWith('data:') ? 'entrada' : path.basename(new URL(s.startsWith('//') ? `https:${s}` : s).pathname) || 'entrada';
        return await ops.saveRef(buf, name, String(mime || '').split(';')[0] || FILE_MIME[path.extname(name).toLowerCase()]);
      }
      const file = s.startsWith('file:') ? fileURLToPath(s) : s;
      if (!path.isAbsolute(file)) fail('use o caminho completo do arquivo (por exemplo C:\\Users\\nome\\Pictures\\foto.png), uma URL http(s) ou um item_id.');
      const st = await fsp.stat(file).catch(() => null);
      if (!st || !st.isFile()) fail(`arquivo não encontrado: ${file}`);
      if (st.size > MAX_INPUT) fail('arquivo grande demais (máximo de 300 MB).');
      return await ops.saveRef(await fsp.readFile(file), path.basename(file), FILE_MIME[path.extname(file).toLowerCase()]);
    } catch (e) {
      fail(`${label}: ${e.message || 'não consegui ler essa entrada.'}`);
    }
  }

  async function oneInput(src, label, kind) {
    const ref = await input(src, label);
    if (ref.kind !== kind) fail(`${label}: esperava ${kind === 'video' ? 'um vídeo' : 'uma imagem'}, mas o arquivo é ${ref.kind === 'video' ? 'um vídeo' : 'uma imagem'}.`);
    return ref;
  }

  /* ---------- resultado ---------- */

  const ITEM_STATUS = { queued: 'na_fila', running: 'gerando', done: 'concluida', failed: 'falhou' };
  const busy = (b) => b.items.some((i) => i.status === 'queued' || i.status === 'running');

  function batchStatus(b) {
    if (busy(b)) return 'em_andamento';
    if (b.items.every((i) => i.status === 'failed')) return 'falhou';
    return b.items.some((i) => i.status === 'failed') ? 'parcial' : 'concluida';
  }

  function itemView(it) {
    const o = { item_id: it.id, modelo: it.familyName, status: ITEM_STATUS[it.status] || it.status };
    if (it.edited) o.versao_cortada_pelo_usuario = true;
    if (it.status === 'done') {
      o.arquivos = it.outputs.map((x) => ops.localOutputPath(x.url) || x.url);
      const first = it.outputs[0] || {};
      if (first.w && first.h) o.tamanho = `${first.w}x${first.h}`;
      if (first.duration) o.duracao_s = Math.round(first.duration * 10) / 10;
      if (it.cost != null) { o.custo_usd = usd(it.cost); if (it.costEstimated) o.custo_estimado = true; }
    }
    if (it.status === 'done' && it.text) o.texto = it.text; // transcrição
    if (it.status === 'failed') o.erro = it.error || 'A geração falhou.';
    if (it.note) o.aviso = it.note;
    return o;
  }

  function batchView(b, { short } = {}) {
    const status = batchStatus(b);
    const video = b.kind === 'video';
    const prompt = String(b.prompt || '');
    const v = {
      id: b.id,
      tipo: video ? 'video' : b.kind === 'audio' ? 'audio' : 'imagem',
      status,
      prompt: short && prompt.length > 200 ? `${prompt.slice(0, 200)}…` : prompt,
      criada_em: new Date(b.createdAt).toLocaleString('pt-BR'),
    };
    if (video) v.modo = MODE_PT[b.mode] || b.mode;
    if (b.kind === 'audio') v.modo = AUDIO_PT[b.mode] || b.mode;
    if (short) v.origem = b.via === 'mcp' ? `agente${b.agent ? ` (${b.agent})` : ''}` : 'usuario';
    v.resultados = b.items.map(itemView);
    const total = b.items.reduce((s, i) => s + (i.status === 'done' && i.cost ? i.cost : 0), 0);
    if (total) v.custo_total_usd = usd(total);
    if (status === 'em_andamento' && !short) {
      v.proximo_passo = `Ainda gerando. Chame consultar_geracao com id "${b.id}" para acompanhar${video ? ' (vídeo costuma levar de 1 a 10 minutos)' : ''}.`;
    }
    return v;
  }

  async function wait(batch, seconds, ctx) {
    const until = Date.now() + int(seconds, 0, MAX_WAIT, 45) * 1000;
    while (busy(batch) && Date.now() < until && !(ctx?.aborted && ctx.aborted())) await ops.sleep(300);
  }

  // Miniaturas para o agente ver o que saiu (no máximo 4 por resposta)
  async function previews(batch, want) {
    const out = [];
    if (!isTrue(want)) return out;
    for (const it of batch.items) {
      if (it.status !== 'done') continue;
      for (const o of it.outputs) {
        if (out.length >= 4) return out;
        const file = ops.localOutputPath(o.url);
        const p = file ? await ops.preview(file, batch.kind === 'video' ? 'video' : 'image') : null;
        if (p) out.push({ type: 'image', data: p.buf.toString('base64'), mimeType: p.mime });
      }
    }
    return out;
  }

  const pick = (value, list, label) => {
    if (value == null || value === '') return null;
    const hit = list.find((x) => x.toLowerCase() === String(value).trim().toLowerCase());
    if (!hit) fail(`"${value}" não é um valor aceito em ${label}. Use um destes: ${list.join(', ')}.`);
    return hit;
  };

  /* ---------- imagens ---------- */

  async function gerarImagem(a, ctx) {
    const prompt = String(a.prompt || '').trim();
    if (!prompt) fail('Informe o prompt.');
    const ratio = pick(a.proporcao, IMG_RATIOS, 'proporcao') || 'auto';
    const tier = Math.max(0, TIERS.indexOf(pick(a.qualidade, TIERS, 'qualidade') || '1K'));
    const srcs = listOf(a.referencias);
    if (srcs.length > 10) fail('Use no máximo 10 imagens de referência.');
    const fams = await resolveModels('image', a.modelos ?? a.modelo);
    const count = fams.length === 1 ? int(a.quantidade, 1, 8, 1) : 1;
    // cada modelo precisa aceitar (ou dispensar) referência: melhor avisar agora do que falhar depois de cobrar os outros
    const picks = fams.map((f) => ({ f, v: ops.pickImage(f, srcs.length > 0) }));
    const bad = picks.find((p) => !p.v);
    if (bad) fail(srcs.length ? `${bad.f.name} não aceita imagens de referência. Veja em listar_modelos quais aceitam.` : `${bad.f.name} só funciona com pelo menos uma imagem de referência.`);
    const refs = [];
    for (const [i, s] of srcs.entries()) refs.push(await oneInput(s, `referencias[${i + 1}]`, 'image'));
    // a cotação vem do Atlas e considera proporção e qualidade (o preço de tabela vale só para a menor qualidade)
    const quotes = await ops.estimateImage({ refs: refs.map((r) => r.id), families: fams.map((f) => f.key), ratio, tier, count });
    const estimate = quotes.reduce((s, q) => s + (q.price || 0), 0);
    if (isTrue(a.apenas_estimar)) {
      return [text({
        custo_estimado_usd: usd(estimate),
        por_modelo: quotes.map((q) => {
          const o = { modelo: (fams.find((f) => f.key === q.key) || {}).name || q.key, imagens: count, custo_usd: usd(q.price) };
          if (!q.exact) o.aproximado = true;
          return o;
        }),
        observacao: 'Onde aparece "aproximado", o valor é uma estimativa e o cobrado pode ser diferente. Nada foi gerado nem cobrado.',
      })];
    }
    needKey();
    guard(estimate);
    const batch = ops.newBatch({ prompt, refs, familyKeys: fams.map((f) => f.key), ratio, tier, count, via: origin(ctx) });
    await wait(batch, a.esperar_segundos, ctx);
    const view = batchView(batch);
    if (fams.length > 1 && int(a.quantidade, 1, 8, 1) > 1) view.aviso = 'Com mais de um modelo, cada um gera uma imagem só: "quantidade" foi ignorada.';
    return [text(view), ...(await previews(batch, a.incluir_previa))];
  }

  /* ---------- vídeos ---------- */

  function videoMode(a, given) {
    if (a.modo != null && a.modo !== '') {
      const n = norm(a.modo);
      const mode = MODES[n] || (MODE_PT[n] ? n : n === 'reference' ? 'ref' : null);
      if (!mode) fail(`"${a.modo}" não é um modo. Use: ${Object.keys(MODES).join(', ')}.`);
      return mode;
    }
    if (given.video) fail('Com "video", diga o modo: "editar" (altera o vídeo) ou "estender" (continua o vídeo).');
    return given.imagem_inicial || given.imagem_final ? 'image' : given.referencias ? 'ref' : 'text';
  }

  async function gerarVideo(a, ctx) {
    const prompt = String(a.prompt || '').trim();
    if (!prompt) fail('Informe o prompt (é obrigatório em todos os modos).');
    const refSrcs = listOf(a.referencias);
    if (refSrcs.length > 10) fail('Use no máximo 10 referências.');
    const given = { imagem_inicial: !!a.imagem_inicial, imagem_final: !!a.imagem_final, referencias: refSrcs.length > 0, video: !!a.video };
    const mode = videoMode(a, given);
    const pt = MODE_PT[mode];
    const extra = Object.keys(given).filter((k) => given[k] && !MODE_USES[mode].includes(k));
    if (extra.length) fail(`O modo "${pt}" não usa ${extra.map((k) => `"${k}"`).join(' nem ')}. ${MODE_USES[mode].length ? `Ele usa ${MODE_USES[mode].map((k) => `"${k}"`).join(' e ')}.` : 'Ele usa só o prompt.'} Troque o modo ou tire essas entradas.`);
    if (mode === 'image' && !given.imagem_inicial) fail('O modo "imagem" precisa de "imagem_inicial".');
    if (mode === 'ref' && !given.referencias) fail('O modo "referencia" precisa de pelo menos uma imagem ou um vídeo em "referencias".');
    if ((mode === 'edit' || mode === 'extend') && !given.video) fail(`O modo "${pt}" precisa de "video".`);
    const ratio = pick(a.proporcao, VID_RATIOS, 'proporcao') || 'auto';
    const res = pick(a.resolucao, VRES, 'resolucao') || '720p';
    const duration = int(a.duracao, 1, 60, 5);
    const audio = !(a.audio === false || a.audio === 'false');
    const fams = await resolveModels('video', a.modelos ?? a.modelo);

    const raw = { refs: [], videos: [] };
    if (mode === 'image') {
      raw.start = (await oneInput(a.imagem_inicial, 'imagem_inicial', 'image')).id;
      if (given.imagem_final) raw.end = (await oneInput(a.imagem_final, 'imagem_final', 'image')).id;
    }
    for (const [i, s] of refSrcs.entries()) {
      const ref = await input(s, `referencias[${i + 1}]`);
      if (ref.kind === 'video' && mode === 'edit') fail(`referencias[${i + 1}]: no modo "editar" as referências são só imagens; o vídeo a alterar vai em "video".`);
      (ref.kind === 'video' ? raw.videos : raw.refs).push(ref.id);
    }
    if (mode === 'edit' || mode === 'extend') raw.video = (await oneInput(a.video, 'video', 'video')).id;
    const inputs = ops.videoInputs(mode, raw);
    const need = ops.needOf(inputs);
    for (const f of fams) {
      if (!ops.pickVideo(f, mode, need)) fail(`${f.name}: ${ops.whyNotVideo(mode, need)} Veja em listar_modelos o que cada modelo aceita.`);
    }

    // com as entradas já no Atlas, o preço vem exato (enviar arquivo não custa nada)
    if (ops.hasKey()) {
      try { await ops.uploadInputs(inputs); } catch (e) { fail(`Não consegui enviar as entradas ao Atlas Cloud. ${e.message || ''}`.trim()); }
    }
    const keys = fams.map((f) => f.key);
    const quotes = await ops.estimateVideo({ mode, inputs, keys, ratio, res, duration, audio });
    const estimate = quotes.reduce((s, q) => s + (q.price || 0), 0);
    const exact = quotes.every((q) => q.exact);
    const perModel = quotes.map((q) => {
      const f = fams.find((x) => x.key === q.key);
      const o = { modelo: f ? f.name : q.key, custo_usd: usd(q.price) };
      if (q.used?.duration) o.duracao_s = q.used.duration;
      if (!q.exact) o.aproximado = true;
      return o;
    });
    if (isTrue(a.apenas_estimar)) {
      return [text({
        custo_estimado_usd: usd(estimate),
        por_modelo: perModel,
        observacao: `${exact ? 'Preço informado pelo Atlas Cloud.' : 'Onde aparece "aproximado", o valor é uma estimativa e o cobrado pode ser diferente (em geral maior em resoluções altas).'} Nada foi gerado nem cobrado.`,
      })];
    }
    needKey();
    guard(estimate);
    const prices = Object.fromEntries(quotes.filter((q) => q.price != null).map((q) => [q.key, q.price]));
    const batch = ops.newVideoBatch({ prompt, mode, inputs, familyKeys: keys, ratio, res, duration, audio, via: { ...origin(ctx), prices } });
    await wait(batch, a.esperar_segundos, ctx);
    const view = batchView(batch);
    if (busy(batch) && estimate) view.custo_previsto_usd = usd(estimate);
    const adjusted = perModel.filter((p) => p.duracao_s && p.duracao_s !== duration).map((p) => `${p.modelo} usa ${p.duracao_s} s`);
    if (adjusted.length && mode !== 'edit') view.aviso = `Duração ajustada ao que o modelo aceita: ${adjusted.join(', ')}.`;
    return [text(view), ...(await previews(batch, a.incluir_previa))];
  }

  /* ---------- áudio ---------- */

  async function gerarAudio(a, ctx) {
    const mode = AUDIO_MODES[norm(a.modo)] || (AUDIO_PT[norm(a.modo)] ? norm(a.modo) : { efeitos: 'sfx', voz: 'speech', transcricao: 'stt' }[norm(a.modo)]);
    if (!mode) fail(`Informe "modo": ${Object.keys(AUDIO_MODES).join(', ')}.`);
    const pt = AUDIO_PT[mode];
    const words = String(a.texto ?? a.prompt ?? '').trim();
    if (mode !== 'stt' && !words) fail(mode === 'speech' ? 'Informe em "texto" o que a voz vai falar.' : 'Informe em "texto" a descrição do som.');
    if (mode === 'stt' && !a.audio) fail('O modo "transcrever" precisa de "audio": o arquivo que vai virar texto.');
    if (mode !== 'stt' && a.audio) fail(`O modo "${pt}" não usa "audio". Para passar um áudio para texto, use o modo "transcrever".`);
    const lang = pick(a.idioma, LANGS, 'idioma') || 'auto';
    const fams = await resolveModels('audio', a.modelos ?? a.modelo);
    const wrong = fams.find((f) => f.kind !== mode);
    if (wrong) fail(`${wrong.name} é um modelo de "${AUDIO_PT[wrong.kind]}", não de "${pt}". Veja em listar_modelos (tipo "audio") o modo de cada um.`);
    // a voz pode vir pelo id ou pelo nome: cada modelo tem a sua lista
    const voices = {};
    if (a.voz != null && a.voz !== '' && mode === 'speech') {
      const want = String(a.voz).trim();
      for (const f of fams) {
        const voice = ops.caps(f.variants.main.id)?.voice;
        const list = voice?.list || [];
        if (!list.length) continue;
        const hit = list.find((v) => v.v === want) || list.find((v) => norm(v.name) === norm(want) || norm(v.v) === norm(want));
        // modelos que aceitam voz pelo ID (ElevenLabs v4): o que não está na lista vai como ID
        if (!hit && voice.custom && /^[\w-]{6,80}$/.test(want)) { voices[f.key] = want; continue; }
        if (!hit) fail(`${f.name} não tem a voz "${want}". Algumas das vozes dele: ${list.slice(0, 15).map((v) => v.name || v.v).join(', ')}. A lista completa está em listar_modelos (tipo "audio").`);
        voices[f.key] = hit.v;
      }
    }
    if (a.voz_de_audio != null && a.voz_de_audio !== '') {
      if (mode !== 'speech') fail('"voz_de_audio" só vale no modo "fala".');
      const cant = fams.find((f) => !ops.caps(f.variants.main.id)?.refAudio);
      if (cant) fail(`${cant.name} não clona voz a partir de um áudio. Veja em listar_modelos (tipo "audio") quais têm clona_voz_de_audio.`);
      const sample = await input(a.voz_de_audio, 'voz_de_audio');
      if (sample.kind === 'image') fail('voz_de_audio: esperava um áudio, mas o arquivo é uma imagem.');
      if (ops.hasKey()) { try { await ops.uploadInputs({ video: sample }); } catch (e) { fail(`Não consegui enviar a amostra de voz ao Atlas Cloud. ${e.message || ''}`.trim()); } }
      for (const f of fams) voices[f.key] = `ref:${sample.id}`;
    }
    let source = null;
    if (mode === 'stt') {
      source = await input(a.audio, 'audio');
      if (source.kind === 'image') fail('audio: esperava um áudio (ou um vídeo), mas o arquivo é uma imagem.');
    }
    const r = ops.audioRequest({
      mode, prompt: words, lyrics: a.letra, voices, speed: a.velocidade, lang, instrumental: isTrue(a.instrumental), duration: a.duracao, loop: isTrue(a.loop),
      input: source ? source.id : null, families: fams.map((f) => f.key),
    });
    if (ops.hasKey() && r.input) {
      try { await ops.uploadInputs({ video: r.input }); } catch (e) { fail(`Não consegui enviar o áudio ao Atlas Cloud. ${e.message || ''}`.trim()); }
    }
    const quotes = await ops.estimateAudio(r);
    const broken = quotes.find((q) => q.error);
    if (broken) fail(`${(fams.find((f) => f.key === broken.key) || {}).name || broken.key}: ${broken.error}`);
    const estimate = quotes.reduce((s, q) => s + (q.price || 0), 0);
    const perModel = quotes.map((q) => {
      const o = { modelo: (fams.find((f) => f.key === q.key) || {}).name || q.key, custo_usd: usd(q.price) };
      if (q.used?.duration) o.duracao_s = q.used.duration;
      if (q.used?.voice) o.voz = q.used.voice;
      if (!q.exact) o.aproximado = true;
      return o;
    });
    if (isTrue(a.apenas_estimar)) {
      return [text({ custo_estimado_usd: usd(estimate), por_modelo: perModel, observacao: 'Onde aparece "aproximado", o valor vem da tabela de preços e o cobrado pode ser diferente. Nada foi gerado nem cobrado.' })];
    }
    needKey();
    guard(estimate);
    const prices = Object.fromEntries(quotes.filter((q) => q.price != null).map((q) => [q.key, q.price]));
    const batch = ops.newAudioBatch(r, { ...origin(ctx), prices });
    await wait(batch, a.esperar_segundos, ctx);
    return [text(batchView(batch))];
  }

  /* ---------- consultas ---------- */

  async function consultar(a, ctx) {
    const id = String(a.id || '').trim();
    if (!id) fail('Informe o id da geração.');
    const batch = ops.batches().find((b) => b.id === id) || ops.findItem(id).batch;
    if (!batch) fail(`Não achei a geração "${id}". Use listar_geracoes para ver os ids.`);
    await wait(batch, a.esperar_segundos, ctx);
    return [text(batchView(batch)), ...(await previews(batch, a.incluir_previa))];
  }

  async function listarGeracoes(a) {
    const kind = a.tipo == null || a.tipo === '' ? null : { video: 'video', imagem: 'image', audio: 'audio' }[norm(a.tipo)] || fail('"tipo" aceita "imagem", "video" ou "audio".');
    const all = ops.batches().filter((b) => !kind || (b.kind || 'image') === kind);
    const list = all.slice(-int(a.limite, 1, 50, 10)).reverse();
    return [text({ total_no_historico: all.length, geracoes: list.map((b) => batchView(b, { short: true })) })];
  }

  async function verSaldo() {
    const s = ops.settings();
    const out = {};
    if (ops.hasKey()) {
      const b = await ops.balance();
      out.saldo_usd = b.value != null ? Math.round(b.value * 100) / 100 : null;
      if (b.error) out.erro_ao_consultar_saldo = b.error;
    } else out.saldo_usd = null;
    out.gasto_dos_agentes_hoje_usd = Math.round(ops.spentToday() * 100) / 100;
    out.limite_por_geracao_usd = s.maxPerCall > 0 ? s.maxPerCall : 'sem limite';
    out.limite_por_dia_usd = s.maxPerDay > 0 ? s.maxPerDay : 'sem limite';
    if (!ops.hasKey()) out.observacao = 'O Gerador ainda não tem a API key do Atlas Cloud configurada.';
    return [text(out)];
  }

  const RUN = { listar_modelos: listarModelos, gerar_imagem: gerarImagem, gerar_video: gerarVideo, gerar_audio: gerarAudio, consultar_geracao: consultar, listar_geracoes: listarGeracoes, ver_saldo: verSaldo };

  // Devolve os blocos de conteúdo do resultado. Erros sobem como exceção (o MCP os entrega ao agente).
  async function call(name, args, ctx) {
    allowed();
    return RUN[name](args || {}, ctx || {});
  }

  return { call };
}

module.exports = { TOOLS, INSTRUCTIONS, create };
