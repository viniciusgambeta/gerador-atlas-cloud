#!/usr/bin/env node
// Ponte MCP por stdio para o Gerador.
//
// Agentes de IA que iniciam um comando (em vez de conectar numa URL) rodam este arquivo:
//   node mcp.js
// Ele conversa com o agente pela entrada e saída padrão e repassa as chamadas de ferramenta para o
// Gerador deste computador (http://localhost:7777/mcp). Se o Gerador estiver desligado, ele é ligado
// em segundo plano na primeira chamada de ferramenta, não antes: só abrir o agente não liga nada.
//
// Pela saída padrão só podem sair mensagens MCP. Avisos vão para a saída de erro.

const http = require('http');
const readline = require('readline');
const { spawn } = require('child_process');
const mcp = require('./lib/mcp');
const { TOOLS, INSTRUCTIONS } = require('./lib/agent');

if (Number(process.versions.node.split('.')[0]) < 18) {
  process.stderr.write(`O Gerador precisa do Node.js 18 ou mais novo (você tem ${process.versions.node}).\n`);
  process.exit(1);
}

const ROOT = __dirname;
const START_PORT = Number(process.env.GERADOR_PORT || process.env.PORT) || 7777;
const APP_ID = 'gerador-imgs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => process.stderr.write(`[gerador] ${msg}\n`);

/* ---------- achar (ou ligar) o Gerador ---------- */

// Uma conexão por pedido, sem reaproveitar: assim nada fica aberto segurando o processo na hora de sair
function request({ port, path, method = 'GET', body, headers = {}, signal, timeout }) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(body);
    const req = http.request({
      host: '127.0.0.1', port, path, method, agent: false, signal, timeout,
      headers: data ? { ...headers, 'Content-Length': data.length } : headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('error', reject);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* resposta sem JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end(data || undefined);
  });
}

async function ping(port) {
  try {
    const r = await request({ port, path: '/api/ping', timeout: 900 });
    return !!r.json && r.json.app === APP_ID;
  } catch { return false; }
}

// O Gerador sobe na 7777 ou, se ela estiver ocupada, numa das 20 portas seguintes
async function findServer() {
  const ports = Array.from({ length: 21 }, (_, i) => START_PORT + i);
  const up = await Promise.all(ports.map(ping));
  const i = up.indexOf(true);
  return i < 0 ? null : ports[i];
}

function startServer() {
  const env = { ...process.env, GERADOR_BG: '1', NO_OPEN: '1', PORT: String(START_PORT) };
  const onError = (e) => log(`não consegui iniciar o Gerador: ${e.message}`);
  if (process.platform === 'win32') {
    // Pelo PowerShell o Gerador nasce solto deste processo: continua ligado quando o agente fecha
    // e encerra tudo o que abriu, e não mostra janela.
    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const cmd = `Start-Process -FilePath ${q(process.execPath)} -ArgumentList 'server.js' -WorkingDirectory ${q(ROOT)} -WindowStyle Hidden`;
    spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', cmd], { env, stdio: 'ignore', windowsHide: true }).on('error', onError);
  } else {
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'ignore', detached: true });
    child.on('error', onError);
    child.unref();
  }
}

let port = null;
let starting = null;
async function locate() {
  const found = await findServer();
  if (found) return found;
  starting ??= (async () => {
    log('Gerador desligado: ligando em segundo plano.');
    startServer();
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const p = await findServer();
      if (p) return p;
    }
    throw new Error('Não consegui ligar o Gerador. Peça ao usuário para abrir o Gerador pelo atalho da área de trabalho e tente de novo.');
  })().finally(() => { starting = null; });
  return starting;
}

/* ---------- repassar as chamadas de ferramenta ---------- */

let clientName = ''; // clientes antigos só dizem quem são no "initialize"
const ascii = (s) => String(s || '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 60);

async function call(name, args, ctx) {
  const who = ascii(ctx.client?.name || clientName);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (who) headers['X-Gerador-Agent'] = who;
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  let res;
  for (let attempt = 0; ; attempt++) {
    port = port || await locate();
    try {
      res = await request({ port, path: '/mcp', method: 'POST', headers, body, signal: ctx.signal });
      break;
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      port = null;
      // Só repete se o pedido nem chegou ao Gerador (ele foi encerrado desde a última chamada).
      // Repetir depois que chegou poderia gerar, e cobrar, duas vezes.
      if (e.code !== 'ECONNREFUSED') throw new Error('Perdi a conexão com o Gerador no meio da chamada. Antes de repetir uma geração, confira com listar_geracoes se ela já foi criada.');
      if (attempt > 0) throw new Error('Não consegui falar com o Gerador. Peça ao usuário para abrir o Gerador pelo atalho da área de trabalho.');
    }
  }
  if (res.status === 404) throw new Error('O Gerador que está rodando é de uma versão sem suporte a agentes. Peça ao usuário para encerrar (Configurações > Encerrar) e abrir o Gerador de novo.');
  const json = res.json;
  if (!json) throw new Error(`Resposta inesperada do Gerador (HTTP ${res.status}).`);
  if (json.error) throw new Error(json.error.message || 'Erro no Gerador.');
  const content = (json.result && json.result.content) || [];
  if (json.result && json.result.isError) throw new Error(content.map((c) => c.text || '').join('\n').trim() || 'Erro no Gerador.');
  return content;
}

/* ---------- conversa com o agente (uma mensagem JSON por linha) ---------- */

const server = mcp.create({
  info: { name: 'gerador', title: 'Gerador', version: require('./package.json').version || '1.0.0' },
  instructions: INSTRUCTIONS,
  tools: TOOLS,
  call,
});

const inflight = new Map(); // id do pedido -> AbortController
const write = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);

async function onLine(raw) {
  // alguns terminais colocam uma marca invisível (BOM) antes da primeira linha
  const line = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  let msg;
  try { msg = JSON.parse(line); } catch { return write(mcp.rpcError(null, mcp.CODE.PARSE, 'Parse error')); }
  const single = msg && typeof msg === 'object' && !Array.isArray(msg);
  if (single && msg.method === 'notifications/cancelled') {
    inflight.get(msg.params && msg.params.requestId)?.abort();
    return;
  }
  if (single && msg.method === 'initialize' && msg.params?.clientInfo?.name) clientName = String(msg.params.clientInfo.name);
  const id = single ? msg.id : undefined;
  const tracked = id !== undefined && id !== null;
  const ctrl = new AbortController();
  if (tracked) inflight.set(id, ctrl);
  try {
    const out = await server.handle(msg, { signal: ctrl.signal, aborted: () => ctrl.signal.aborted });
    // pedido cancelado não recebe resposta
    if (out.body !== undefined && !ctrl.signal.aborted) write(out.body);
  } catch (e) {
    if (tracked && !ctrl.signal.aborted) write(mcp.rpcError(id, -32603, e.message || 'Internal error'));
  } finally {
    if (tracked) inflight.delete(id);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => { if (line.trim()) onLine(line); });
// o agente fechou a entrada: é o sinal para encerrar
rl.on('close', () => {
  for (const c of inflight.values()) c.abort();
  // sai sozinho quando nada mais estiver pendente; o temporizador garante a saída se algo sobrar
  setTimeout(() => process.exit(0), 400).unref();
});
process.stdout.on('error', () => process.exit(0));
