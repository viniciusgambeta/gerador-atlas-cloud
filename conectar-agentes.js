#!/usr/bin/env node
// Conecta o Gerador aos agentes de IA instalados neste computador, pelo MCP:
//   Claude Desktop, Claude Code, ChatGPT para desktop / Codex e Cursor.
//
// Jeitos de usar:
//   - botão "Conectar agora" em Configurações > Agentes de IA, dentro do Gerador
//   - dois cliques em "Conectar agentes.bat" (Windows) ou "Conectar agentes.command" (Mac)
//   - node conectar-agentes.js
//
// O que ele faz em cada agente: acrescenta uma entrada "gerador" no arquivo de configuração,
// apontando para o mcp.js desta pasta. Antes de alterar um arquivo, guarda uma cópia ao lado dele
// (mesmo nome, terminado em ".antes-do-gerador"). Não mexe em mais nada.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const NAME = 'gerador';
const SCRIPT = path.join(__dirname, 'mcp.js');
const NODE = process.execPath;
const HOME = os.homedir();

function backup(file) {
  const copy = `${file}.antes-do-gerador`;
  if (fs.existsSync(file) && !fs.existsSync(copy)) fs.copyFileSync(file, copy);
}

const result = (app, status, detail = '') => ({ app, status, detail });
// status: 'conectado' (acabou de entrar), 'ja' (já estava certo), 'ausente' (app não instalado), 'erro'

/* ---------- arquivos JSON com "mcpServers" (Claude Desktop, Cursor) ---------- */

function connectJson(app, file, restart) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) return result(app, 'ausente');
  try {
    let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const bom = text.charCodeAt(0) === 0xfeff;
    if (bom) text = text.slice(1);
    const json = text.trim() ? JSON.parse(text) : {};
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('o arquivo de configuração não tem o formato esperado');
    const want = { command: NODE, args: [SCRIPT] };
    const have = json.mcpServers && json.mcpServers[NAME];
    if (have && have.command === want.command && JSON.stringify(have.args) === JSON.stringify(want.args)) return result(app, 'ja');
    backup(file);
    json.mcpServers = { ...(json.mcpServers || {}), [NAME]: want };
    const indent = (text.match(/\n([ \t]+)\S/) || [])[1] || '  ';
    let out = JSON.stringify(json, null, indent);
    if (text.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
    fs.writeFileSync(file, (bom ? String.fromCharCode(0xfeff) : '') + out + (/\n$/.test(text) ? '\n' : ''), 'utf8');
    const saved = fs.readFileSync(file, 'utf8');
    JSON.parse(saved.charCodeAt(0) === 0xfeff ? saved.slice(1) : saved); // confere que continua um JSON válido
    return result(app, 'conectado', restart);
  } catch (e) {
    return result(app, 'erro', e.message);
  }
}

function claudeDesktopConfig() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (process.platform === 'darwin') return path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'Claude', 'claude_desktop_config.json');
}

/* ---------- ChatGPT para desktop e Codex (config.toml compartilhado) ---------- */

function connectCodex() {
  const app = 'ChatGPT (app de desktop) e Codex';
  const dir = process.env.CODEX_HOME || path.join(HOME, '.codex');
  if (!fs.existsSync(dir)) return result(app, 'ausente');
  const file = path.join(dir, 'config.toml');
  try {
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    // JSON.stringify gera um texto entre aspas que também é válido em TOML (barras e aspas já escapadas)
    const block = [`[mcp_servers.${NAME}]`, `command = ${JSON.stringify(NODE)}`, `args = [${JSON.stringify(SCRIPT)}]`].join(nl);
    const header = new RegExp(`^\\[mcp_servers\\.${NAME}\\][^\\n]*$`, 'm');
    let out;
    if (header.test(text)) {
      // já existe: troca o bloco inteiro (do cabeçalho até a próxima tabela)
      const start = text.search(header);
      const rest = text.slice(start + 1);
      const next = rest.search(/^\[/m);
      const end = next < 0 ? text.length : start + 1 + next;
      const current = text.slice(start, end).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n');
      const asLiteral = [`[mcp_servers.${NAME}]`, `command = '${NODE}'`, `args = ['${SCRIPT}']`].join('\n');
      if (current === block.split(nl).join('\n') || current === asLiteral) return result(app, 'ja');
      out = `${text.slice(0, start)}${block}${nl}${next < 0 ? '' : nl}${text.slice(end)}`;
    } else {
      out = `${text}${text && !/\n$/.test(text) ? nl : ''}${text ? nl : ''}${block}${nl}`;
    }
    backup(file);
    fs.writeFileSync(file, out, 'utf8');
    return result(app, 'conectado', 'Feche o ChatGPT (ou o Codex) e abra de novo.');
  } catch (e) {
    return result(app, 'erro', e.message);
  }
}

/* ---------- Claude Code (pela linha de comando dele, que cuida do próprio arquivo) ---------- */

function connectClaudeCode() {
  const app = 'Claude Code';
  const opts = { encoding: 'utf8', timeout: 60000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };
  let run = (args) => execFileSync('claude', args, opts);
  if (process.platform === 'win32') {
    // no Windows o "claude" pode ser um .exe ou um .cmd: acha qual é para chamar do jeito certo
    let found = [];
    try { found = execFileSync('where', ['claude'], opts).split(/\r?\n/).map((s) => s.trim()).filter(Boolean); } catch { return result(app, 'ausente'); }
    const exe = found.find((f) => /\.exe$/i.test(f));
    const cmd = found.find((f) => /\.(cmd|bat)$/i.test(f));
    if (exe) run = (args) => execFileSync(exe, args, opts);
    else if (cmd) run = (args) => execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${cmd}" ${args.map((a) => `"${a}"`).join(' ')}"`], { ...opts, windowsVerbatimArguments: true });
    else return result(app, 'ausente');
  }
  try { run(['--version']); } catch { return result(app, 'ausente'); }
  try {
    let current = '';
    try { current = run(['mcp', 'get', NAME]); } catch { /* ainda não existe */ }
    const here = current.includes(SCRIPT);
    if (here && /Scope:\s*User/i.test(current)) return result(app, 'ja');
    try {
      run(['mcp', 'add', '--scope', 'user', NAME, '--', NODE, SCRIPT]);
    } catch (e) {
      // já registrado em outro escopo (por exemplo, só numa pasta de projeto): continua valendo
      if (here) return result(app, 'ja');
      throw e;
    }
    return result(app, 'conectado', 'Vale a partir da próxima sessão.');
  } catch (e) {
    return result(app, 'erro', String(e.stderr || e.message || '').trim().split('\n').pop());
  }
}

function connectAll() {
  return [
    connectJson('Claude Desktop', claudeDesktopConfig(), 'Feche o Claude por completo (pelo ícone perto do relógio) e abra de novo.'),
    connectClaudeCode(),
    connectCodex(),
    connectJson('Cursor', path.join(HOME, '.cursor', 'mcp.json'), 'Reabra o Cursor.'),
  ];
}

const LABEL = { conectado: 'conectado agora', ja: 'já estava conectado', ausente: 'não encontrado neste computador', erro: 'não deu certo' };

if (require.main === module) {
  if (!fs.existsSync(SCRIPT)) { console.error(`Não achei ${SCRIPT}. Rode este arquivo de dentro da pasta do Gerador.`); process.exit(1); }
  console.log('\n  Conectando o Gerador aos agentes de IA deste computador\n');
  const results = connectAll();
  for (const r of results) console.log(`  ${r.status === 'conectado' || r.status === 'ja' ? '[ok]' : r.status === 'erro' ? '[!!]' : '[--]'} ${r.app}: ${LABEL[r.status]}${r.detail ? `. ${r.detail}` : ''}`);
  const ok = results.some((r) => r.status === 'conectado' || r.status === 'ja');
  console.log(ok
    ? '\n  Pronto. Depois de reabrir o agente, peça algo como:\n  "liste os modelos de imagem do Gerador e gere um gato astronauta no mais barato"\n'
    : '\n  Nenhum agente compatível foi encontrado. Instale o Claude Desktop ou o ChatGPT para desktop e rode de novo.\n');
}

module.exports = { connectAll, LABEL };
