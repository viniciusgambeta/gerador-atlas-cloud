// Lê tipo, dimensões e duração de vídeos MP4/MOV direto dos bytes (e reconhece WebM)

function* boxes(buf, start, end) {
  let pos = start;
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let head = 8;
    if (size === 1) {
      if (pos + 16 > end) return;
      size = Number(buf.readBigUInt64BE(pos + 8));
      head = 16;
    } else if (size === 0) size = end - pos; // vai até o fim do arquivo
    if (size < head || pos + size > end) return;
    yield { type, body: pos + head, end: pos + size };
    pos += size;
  }
}

function info(buf) {
  if (!buf || buf.length < 16) return null;
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return { ext: 'webm', mime: 'video/webm', w: 0, h: 0, duration: 0 };
  let ftyp = null; let moov = null;
  for (const b of boxes(buf, 0, buf.length)) {
    if (b.type === 'ftyp') ftyp = b;
    else if (b.type === 'moov') moov = b;
  }
  if (!ftyp && !moov) return null;
  const brand = ftyp ? buf.toString('latin1', ftyp.body, ftyp.body + 4).trim() : '';
  const out = brand === 'qt' ? { ext: 'mov', mime: 'video/quicktime' } : { ext: 'mp4', mime: 'video/mp4' };
  Object.assign(out, { w: 0, h: 0, duration: 0 });
  if (!moov) return out;
  try {
    for (const b of boxes(buf, moov.body, moov.end)) {
      if (b.type === 'mvhd') {
        const v1 = buf[b.body] === 1;
        const scale = buf.readUInt32BE(b.body + (v1 ? 20 : 12));
        const dur = v1 ? Number(buf.readBigUInt64BE(b.body + 24)) : buf.readUInt32BE(b.body + 16);
        if (scale) out.duration = Math.round((dur / scale) * 100) / 100;
      } else if (b.type === 'trak' && !out.w) {
        for (const t of boxes(buf, b.body, b.end)) {
          if (t.type !== 'tkhd') continue;
          // largura e altura fecham o tkhd, em ponto fixo 16.16, logo depois da matriz de rotação
          let w = buf.readUInt32BE(t.end - 8) / 65536;
          let h = buf.readUInt32BE(t.end - 4) / 65536;
          const a = buf.readInt32BE(t.end - 44);
          const bb = buf.readInt32BE(t.end - 40);
          if (a === 0 && bb !== 0) [w, h] = [h, w]; // gravado girado em 90°
          if (w >= 1 && h >= 1) { out.w = Math.round(w); out.h = Math.round(h); }
        }
      }
    }
  } catch { /* arquivo truncado: fica só com o tipo */ }
  return out;
}

const MIME_EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v' };

module.exports = { info, MIME_EXT };
