// Arquivos que os modelos 3D devolvem: reconhece o tipo pelos primeiros bytes, lê os números de um GLB
// (triângulos, vértices, texturas) e abre arquivos .zip. Sem dependências: só o zlib do próprio Node.
const zlib = require('zlib');

// Extensões de modelo 3D que o app guarda e oferece para baixar
const MODEL_EXTS = new Set(['glb', 'gltf', 'obj', 'fbx', 'stl', 'usdz', 'usd', 'usdc', 'usda', '3mf', 'ply']);
const MIME = {
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj', fbx: 'application/octet-stream', stl: 'model/stl',
  usdz: 'model/vnd.usdz+zip', usd: 'application/octet-stream', usdc: 'application/octet-stream', usda: 'text/plain', '3mf': 'model/3mf', ply: 'application/octet-stream', zip: 'application/zip',
};

const extOf = (name) => { const m = /\.([a-z0-9]{2,5})$/i.exec(String(name || '').split(/[?#]/)[0]); return m ? m[1].toLowerCase() : ''; };

// Tipo do arquivo: { ext, kind } com kind = 'model' | 'image' | 'video' | 'zip' | null. hint = nome ou endereço de onde veio.
function sniff(buf, hint = '') {
  const s = (a, b) => buf.toString('latin1', a, b);
  const byName = extOf(hint);
  if (!buf || buf.length < 12) return { ext: byName, kind: MODEL_EXTS.has(byName) ? 'model' : null };
  if (s(0, 4) === 'glTF') return { ext: 'glb', kind: 'model' };
  if (s(0, 8) === '\x89PNG\r\n\x1a\n') return { ext: 'png', kind: 'image' };
  if (buf[0] === 0xff && buf[1] === 0xd8) return { ext: 'jpg', kind: 'image' };
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return { ext: 'webp', kind: 'image' };
  if (s(0, 4) === 'GIF8') return { ext: 'gif', kind: 'image' };
  if (s(4, 8) === 'ftyp') return { ext: 'mp4', kind: 'video' };
  if (s(0, 4) === '\x1aE\xdf\xa3') return { ext: 'webm', kind: 'video' };
  if (s(0, 18) === 'Kaydara FBX Binary') return { ext: 'fbx', kind: 'model' };
  if (s(0, 8) === 'PXR-USDC') return { ext: byName === 'usd' ? 'usd' : 'usdc', kind: 'model' };
  if (s(0, 5) === '#usda') return { ext: byName === 'usd' ? 'usd' : 'usda', kind: 'model' };
  if (/^ply\r?\n/.test(s(0, 5))) return { ext: 'ply', kind: 'model' };
  if (s(0, 4) === 'PK\x03\x04') {
    // .usdz e .3mf também são zips por dentro: valem como modelo, não como pacote
    if (byName === 'usdz' || byName === '3mf') return { ext: byName, kind: 'model' };
    const names = zipEntries(buf).map((e) => e.name.toLowerCase());
    if (names.some((n) => n === '3d/3dmodel.model')) return { ext: '3mf', kind: 'model' };
    if (names.length && /\.usd[ac]?$/.test(names[0]) && names.every((n) => !/\.(glb|obj|fbx|stl)$/.test(n))) return { ext: 'usdz', kind: 'model' };
    return { ext: 'zip', kind: 'zip' };
  }
  if (MODEL_EXTS.has(byName)) return { ext: byName, kind: 'model' }; // OBJ, STL e FBX em texto não têm assinatura
  const head = s(0, Math.min(buf.length, 400));
  if (/^\s*{[\s\S]*"asset"\s*:/.test(head)) return { ext: 'gltf', kind: 'model' };
  if (/^(#[^\n]*\n|\s)*(mtllib|v |vn |vt |o |g )/.test(head)) return { ext: 'obj', kind: 'model' };
  if (/^solid\s/.test(head)) return { ext: 'stl', kind: 'model' };
  return { ext: byName, kind: null };
}

/* ---------- GLB ---------- */

// Números de um GLB sem abrir a malha: lê só o cabeçalho JSON do arquivo
function glbInfo(buf) {
  try {
    if (buf.toString('latin1', 0, 4) !== 'glTF' || buf.readUInt32LE(4) !== 2) return null;
    const len = buf.readUInt32LE(12);
    if (buf.toString('latin1', 16, 20) !== 'JSON' || 20 + len > buf.length) return null;
    const json = JSON.parse(buf.toString('utf8', 20, 20 + len));
    const acc = json.accessors || [];
    let tris = 0; let verts = 0;
    for (const mesh of json.meshes || []) {
      for (const p of mesh.primitives || []) {
        const pos = acc[p.attributes && p.attributes.POSITION];
        if (!pos) continue;
        verts += pos.count || 0;
        const n = p.indices !== undefined && acc[p.indices] ? acc[p.indices].count : pos.count;
        const mode = p.mode === undefined ? 4 : p.mode;
        tris += mode === 4 ? Math.floor(n / 3) : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0;
      }
    }
    const used = json.extensionsUsed || [];
    const packed = (json.extensionsRequired || []).find((e) => /draco|meshopt/i.test(e)) || '';
    return { tris, verts, textures: (json.images || []).length, materials: (json.materials || []).length, pbr: (json.materials || []).some((m) => m.normalTexture || (m.pbrMetallicRoughness && m.pbrMetallicRoughness.metallicRoughnessTexture)), colors: (json.meshes || []).some((m) => (m.primitives || []).some((p) => p.attributes && p.attributes.COLOR_0 !== undefined)), ...(packed ? { packed } : {}), ...(used.length ? { extensions: used } : {}) };
  } catch { return null; }
}

/* ---------- ZIP ---------- */

// Lista o conteúdo de um .zip pelo índice no fim do arquivo
function zipEntries(buf) {
  const out = [];
  try {
    let end = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    if (end < 0) return out;
    const count = buf.readUInt16LE(end + 10);
    let p = buf.readUInt32LE(end + 16);
    for (let n = 0; n < count && p + 46 <= buf.length; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const method = buf.readUInt16LE(p + 10);
      const csize = buf.readUInt32LE(p + 20);
      const size = buf.readUInt32LE(p + 24);
      const nameLen = buf.readUInt16LE(p + 28);
      const extraLen = buf.readUInt16LE(p + 30);
      const commentLen = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
      if (!name.endsWith('/')) out.push({ name, method, csize, size, local });
      p += 46 + nameLen + extraLen + commentLen;
    }
  } catch { /* zip quebrado: devolve o que deu para ler */ }
  return out;
}

// Conteúdo de uma entrada (só os métodos comuns: guardado e deflate)
function zipRead(buf, entry) {
  const p = entry.local;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error('zip inválido');
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const raw = buf.subarray(start, start + entry.csize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  throw new Error('compressão do zip não suportada');
}

// Monta um .zip (sem compressão), para juntar num pacote os arquivos de um modelo. files: [{ name, buf }]
function zipWrite(files) {
  const crcTable = zipWrite.table || (zipWrite.table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts = []; const index = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.buf);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(f.buf.length, 18); local.writeUInt32LE(f.buf.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(f.buf.length, 20); central.writeUInt32LE(f.buf.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(local, name, f.buf);
    index.push(central, name);
    offset += 30 + name.length + f.buf.length;
  }
  const dir = Buffer.concat(index);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

module.exports = { MODEL_EXTS, MIME, extOf, sniff, glbInfo, zipEntries, zipRead, zipWrite };
