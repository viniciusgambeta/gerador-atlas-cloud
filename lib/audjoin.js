// Junta vários arquivos de áudio do mesmo formato num só, sem dependências.
// Serve para textos longos, que são gerados em partes: MP3 e WAV. Outros formatos devolvem null.

/* ------------------------------------------------------------------ */
/* MP3                                                                 */
/* ------------------------------------------------------------------ */

// kbps por índice, para a camada 3: MPEG-1 e MPEG-2/2.5
const KBPS_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const KBPS_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
// taxa de amostragem pelos 2 bits de versão: 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

// Cabeçalho de um quadro MP3 na posição i (null se ali não começa um quadro)
function frameAt(buf, i) {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const ver = (buf[i + 1] >> 3) & 3;
  const layer = (buf[i + 1] >> 1) & 3;
  if (ver === 1 || layer !== 1) return null; // só camada 3
  const br = (buf[i + 2] >> 4) & 15;
  const sr = (buf[i + 2] >> 2) & 3;
  if (br === 0 || br === 15 || sr === 3) return null;
  const kbps = (ver === 3 ? KBPS_V1 : KBPS_V2)[br];
  const rate = RATES[ver][sr];
  const len = Math.floor(((ver === 3 ? 144000 : 72000) * kbps) / rate) + ((buf[i + 2] >> 1) & 1);
  const mono = ((buf[i + 3] >> 6) & 3) === 3;
  return { len, ver, rate, mono, side: ver === 3 ? (mono ? 17 : 32) : (mono ? 9 : 17) };
}

// Só os quadros de áudio de um MP3: sem a etiqueta ID3 do começo, sem a do fim e sem o quadro de
// informações (Xing/Info/VBRI), que guarda a duração daquele arquivo sozinho e confundiria o player
function mp3Audio(buf) {
  let start = 0;
  while (start + 10 <= buf.length && buf.toString('latin1', start, start + 3) === 'ID3') {
    const size = ((buf[start + 6] & 0x7f) << 21) | ((buf[start + 7] & 0x7f) << 14) | ((buf[start + 8] & 0x7f) << 7) | (buf[start + 9] & 0x7f);
    start += 10 + size + (buf[start + 5] & 0x10 ? 10 : 0);
  }
  // primeiro quadro de verdade: tem de ser seguido de outro, para não confundir com bytes soltos
  let first = null;
  for (let i = start; i < Math.min(buf.length - 4, start + 65536); i++) {
    const f = frameAt(buf, i);
    if (!f) continue;
    const next = i + f.len;
    if (next + 4 > buf.length || frameAt(buf, next)) { first = f; start = i; break; }
  }
  if (!first) return null;
  const tagAt = start + 4 + first.side;
  const tag = buf.toString('latin1', tagAt, tagAt + 4);
  if (tag === 'Xing' || tag === 'Info' || buf.toString('latin1', start + 36, start + 40) === 'VBRI') start += first.len;
  let end = buf.length;
  if (end - start > 128 && buf.toString('latin1', end - 128, end - 125) === 'TAG') end -= 128;
  if (end <= start) return null;
  return { data: buf.subarray(start, end), ver: first.ver, rate: first.rate, mono: first.mono };
}

function joinMp3(bufs) {
  const parts = bufs.map(mp3Audio);
  if (parts.some((p) => !p)) return null;
  const a = parts[0];
  if (parts.some((p) => p.ver !== a.ver || p.rate !== a.rate || p.mono !== a.mono)) return null;
  return Buffer.concat(parts.map((p) => p.data));
}

/* ------------------------------------------------------------------ */
/* WAV                                                                 */
/* ------------------------------------------------------------------ */

function wavChunks(buf) {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let fmt = null; let data = null;
  for (let i = 12; i + 8 <= buf.length;) {
    const id = buf.toString('latin1', i, i + 4);
    let size = buf.readUInt32LE(i + 4);
    const body = i + 8;
    // áudio gerado em fluxo costuma vir com o tamanho em branco: vale até o fim do arquivo
    if (id === 'data' && (size === 0 || size === 0xffffffff || body + size > buf.length)) size = buf.length - body;
    if (id === 'fmt ') fmt = buf.subarray(body, Math.min(buf.length, body + size));
    if (id === 'data') { data = buf.subarray(body, body + size); break; }
    i = body + size + (size % 2);
  }
  return fmt && data && fmt.length >= 16 ? { fmt, data } : null;
}

function joinWav(bufs) {
  const parts = bufs.map(wavChunks);
  if (parts.some((p) => !p)) return null;
  const fmt = parts[0].fmt;
  if (parts.some((p) => !p.fmt.subarray(0, 16).equals(fmt.subarray(0, 16)))) return null;
  const data = Buffer.concat(parts.map((p) => p.data));
  const head = Buffer.alloc(12 + 8 + fmt.length + (fmt.length % 2) + 8);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(Math.min(0xffffffff, head.length - 8 + data.length), 4);
  head.write('WAVE', 8, 'latin1');
  head.write('fmt ', 12, 'latin1');
  head.writeUInt32LE(fmt.length, 16);
  fmt.copy(head, 20);
  const at = 20 + fmt.length + (fmt.length % 2);
  head.write('data', at, 'latin1');
  head.writeUInt32LE(Math.min(0xffffffff, data.length), at + 4);
  return Buffer.concat([head, data]);
}

// bufs: os arquivos na ordem; ext: o formato deles ('mp3' ou 'wav'). Devolve o arquivo único, ou null
// quando o formato não dá para juntar aqui (ou as partes não combinam entre si).
function join(bufs, ext) {
  if (!Array.isArray(bufs) || !bufs.length) return null;
  if (bufs.length === 1) return bufs[0];
  if (ext === 'mp3') return joinMp3(bufs);
  if (ext === 'wav') return joinWav(bufs);
  return null;
}

module.exports = { join, mp3Audio, wavChunks };
