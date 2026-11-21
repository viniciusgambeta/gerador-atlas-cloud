// Servidor MCP (Model Context Protocol) sem dependências: só o que o Gerador usa (ferramentas).
//
// O protocolo tem duas gerações e os agentes em uso hoje se dividem entre elas, então este
// servidor atende as duas no mesmo endereço:
//   moderna (2026-07-28): sem sessão. Cada pedido traz a versão e os dados do cliente em _meta.
//   antiga (até 2025-11-25): o cliente começa com "initialize" e depois chama os métodos.
// Quem decide é o próprio pedido: se traz a versão em _meta, é moderno.

const MODERN = ['2026-07-28'];
const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SUPPORTED = [...MODERN, ...LEGACY];
const META = 'io.modelcontextprotocol/';

const CODE = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  HEADER_MISMATCH: -32020,
  UNSUPPORTED_VERSION: -32022,
};

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  const out = { jsonrpc: '2.0', error };
  if (id !== undefined && id !== null) out.id = id;
  return out;
}

// Valores fora do ASCII viajam nos cabeçalhos como =?base64?...?=
function headerValue(v) {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== 'string') return undefined;
  const m = /^=\?base64\?(.*)\?=$/.exec(s);
  return m ? Buffer.from(m[1], 'base64').toString('utf8') : s;
}

// info: { name, title, version }
// tools: lista fixa de ferramentas ({ name, title, description, inputSchema, annotations })
// call(name, args, ctx): executa a ferramenta e devolve os blocos de conteúdo. Se lançar erro,
//   o texto do erro volta para o agente como resultado com isError, para ele corrigir e tentar de novo.
function create({ info, instructions, tools, call }) {
  const names = new Set(tools.map((t) => t.name));

  async function callTool(params, ctx) {
    const args = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {};
    try {
      const content = await call(params.name, args, ctx);
      return { content, isError: false };
    } catch (e) {
      return { content: [{ type: 'text', text: e && e.message ? e.message : 'Erro interno no Gerador.' }], isError: true };
    }
  }

  async function modern(msg, params, meta, ctx) {
    const id = msg.id;
    const bad = (code, message, data) => ({ status: 400, body: rpcError(id, code, message, data) });
    const version = meta[`${META}protocolVersion`];
    if (typeof version !== 'string') return bad(CODE.INVALID_PARAMS, `Missing required _meta field ${META}protocolVersion`);
    if (!MODERN.includes(version)) return bad(CODE.UNSUPPORTED_VERSION, 'Unsupported protocol version', { supported: SUPPORTED, requested: version });
    if (ctx.headers) {
      // no HTTP os cabeçalhos repetem o corpo e os dois precisam bater
      const h = ctx.headers;
      const mismatch = (name, got, want) => bad(CODE.HEADER_MISMATCH, `Header mismatch: ${name} header value '${got ?? ''}' does not match body value '${want}'`);
      if (headerValue(h['mcp-protocol-version']) !== version) return mismatch('MCP-Protocol-Version', headerValue(h['mcp-protocol-version']), version);
      if (headerValue(h['mcp-method']) !== msg.method) return mismatch('Mcp-Method', headerValue(h['mcp-method']), msg.method);
      if (msg.method === 'tools/call' && headerValue(h['mcp-name']) !== params.name) return mismatch('Mcp-Name', headerValue(h['mcp-name']), params.name);
    }
    const caps = meta[`${META}clientCapabilities`];
    if (!caps || typeof caps !== 'object') return bad(CODE.INVALID_PARAMS, `Missing required _meta field ${META}clientCapabilities`);
    const done = (result) => ({ status: 200, body: { jsonrpc: '2.0', id, result: { resultType: 'complete', ...result, _meta: { [`${META}serverInfo`]: info } } } });
    switch (msg.method) {
      case 'server/discover':
        return done({ supportedVersions: SUPPORTED, capabilities: { tools: {} }, instructions, ttlMs: 3600e3, cacheScope: 'private' });
      case 'tools/list':
        return done({ tools, ttlMs: 300e3, cacheScope: 'private' });
      case 'tools/call': {
        if (!names.has(params.name)) return bad(CODE.INVALID_PARAMS, `Unknown tool: ${params.name}`);
        const client = meta[`${META}clientInfo`];
        return done(await callTool(params, { ...ctx, client: client && typeof client === 'object' ? client : null }));
      }
      default:
        return { status: 404, body: rpcError(id, CODE.METHOD_NOT_FOUND, `Method not found: ${msg.method}`) };
    }
  }

  async function legacy(msg, params, ctx) {
    const id = msg.id;
    const ok = (result) => ({ status: 200, body: { jsonrpc: '2.0', id, result } });
    switch (msg.method) {
      case 'initialize':
        // responde na versão pedida quando conhece; senão oferece a mais nova das antigas
        return ok({
          protocolVersion: LEGACY.includes(params.protocolVersion) ? params.protocolVersion : LEGACY[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: info,
          instructions,
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools });
      case 'tools/call':
        if (!names.has(params.name)) return { status: 200, body: rpcError(id, CODE.INVALID_PARAMS, `Unknown tool: ${params.name}`) };
        return ok(await callTool(params, { ...ctx, client: null }));
      default:
        return { status: 200, body: rpcError(id, CODE.METHOD_NOT_FOUND, `Method not found: ${msg.method}`) };
    }
  }

  // Recebe uma mensagem JSON-RPC já lida e devolve { status, body }. Sem body = nada a responder.
  // ctx: { headers (só no HTTP), aborted() }
  async function handle(msg, ctx = {}) {
    if (Array.isArray(msg)) {
      // lotes de mensagens só existiram na versão 2025-03-26
      const out = [];
      for (const m of msg) { const r = await handle(m, ctx); if (r.body) out.push(r.body); }
      return out.length ? { status: 200, body: out } : { status: 202 };
    }
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return { status: 400, body: rpcError(null, CODE.INVALID_REQUEST, 'Invalid Request') };
    if (typeof msg.method !== 'string') {
      // resposta de um cliente antigo a um pedido do servidor: este servidor nunca pede nada
      if ('result' in msg || 'error' in msg) return { status: 202 };
      return { status: 400, body: rpcError(msg.id, CODE.INVALID_REQUEST, 'Invalid Request') };
    }
    if (msg.id === undefined || msg.id === null) return { status: 202 }; // notificação: nada a fazer
    const params = msg.params && typeof msg.params === 'object' && !Array.isArray(msg.params) ? msg.params : {};
    const meta = params._meta && typeof params._meta === 'object' ? params._meta : {};
    const headVersion = ctx.headers ? headerValue(ctx.headers['mcp-protocol-version']) : undefined;
    const isModern = meta[`${META}protocolVersion`] !== undefined || msg.method === 'server/discover' || (typeof headVersion === 'string' && headVersion >= MODERN[MODERN.length - 1]);
    return isModern ? modern(msg, params, meta, ctx) : legacy(msg, params, ctx);
  }

  return { handle };
}

module.exports = { create, rpcError, CODE, MODERN, LEGACY, META };
