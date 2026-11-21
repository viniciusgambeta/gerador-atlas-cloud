// Reconhece arquivos de áudio pelos primeiros bytes (sem dependências)

const MIME_EXT = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm',
};
const EXTS = new Set(['mp3', 'wav', 'ogg', 'opus', 'flac', 'm4a', 'aac', 'pcm']);

function info(buf) {
  if (!buf || buf.length < 12) return null;
  const s = (a, b) => buf.toString('latin1', a, b);
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (s(0, 3) === 'ID3') return { ext: 'mp3', mime: 'audio/mpeg' };
  if (s(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (s(0, 4) === 'fLaC') return { ext: 'flac', mime: 'audio/flac' };
  // .m4a usa o mesmo contêiner do .mp4: a marca dentro de "ftyp" diz que é só áudio
  if (s(4, 8) === 'ftyp' && /^M4[AB] /.test(s(8, 12))) return { ext: 'm4a', mime: 'audio/mp4' };
  // MP3 sem etiqueta ID3 começa direto num quadro de áudio (11 bits ligados e camada 3)
  if (buf[0] === 0xff && (buf[1] & 0xe6) === 0xe2) return { ext: 'mp3', mime: 'audio/mpeg' };
  return null;
}

module.exports = { info, MIME_EXT, EXTS };
