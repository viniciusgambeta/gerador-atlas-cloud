'use strict';

/* ================================================================== */
/* Visualizador de modelos 3D (arquivos .glb), sem bibliotecas         */
/* WebGL2 puro: lê o GLB, desenha com uma luz de estúdio e deixa       */
/* girar, aproximar e arrastar. Não cobre tudo do formato glTF: fica   */
/* de fora animação, esqueleto e malha comprimida (Draco / Meshopt).   */
/* ================================================================== */

const V3 = (() => {
  /* ---------- matrizes 4x4, em colunas como o WebGL espera ---------- */

  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
    const [x, y, z, w] = q;
    const x2 = x + x; const y2 = y + y; const z2 = z + z;
    const xx = x * x2; const xy = x * y2; const xz = x * z2; const yy = y * y2; const yz = y * z2; const zz = z * z2; const wx = w * x2; const wy = w * y2; const wz = w * z2;
    return new Float32Array([(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]);
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2); const nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function lookAt(eye, target, up) {
    const z = norm(sub(eye, target)); const x = norm(cross(up, z)); const y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  const point = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  // matriz das normais: inversa transposta da parte 3x3 (os cofatores bastam; o tamanho some no normalize)
  function normalMat(m) {
    const a = m[0]; const b = m[1]; const c = m[2]; const d = m[4]; const e = m[5]; const f = m[6]; const g = m[8]; const h = m[9]; const i = m[10];
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    const s = det < 0 ? -1 : 1;
    return new Float32Array([(e * i - f * h) * s, (f * g - d * i) * s, (d * h - e * g) * s, (c * h - b * i) * s, (a * i - c * g) * s, (b * g - a * h) * s, (b * f - c * e) * s, (c * d - a * f) * s, (a * e - b * d) * s]);
  }

  /* ---------- shaders ---------- */

  const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUv; layout(location=3) in vec4 aCol;
uniform mat4 uMVP; uniform mat4 uMV; uniform mat3 uN;
out vec3 vPos; out vec3 vNor; out vec2 vUv; out vec4 vCol;
void main() { vec4 p = uMV * vec4(aPos, 1.0); vPos = p.xyz; vNor = uN * aNor; vUv = aUv; vCol = aCol; gl_Position = uMVP * vec4(aPos, 1.0); }`;
  // uMode: 0 = com textura, 1 = malha lisa (cor única, para ver a geometria), 2 = linhas da malha
  const FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec3 vNor; in vec2 vUv; in vec4 vCol;
uniform sampler2D uTex; uniform vec4 uBase; uniform int uHasTex; uniform int uHasNor; uniform int uHasCol; uniform int uMode; uniform float uCut; uniform vec4 uLine;
out vec4 o;
void main() {
  if (uMode == 2) { o = uLine; return; }
  vec3 n = uHasNor == 1 ? normalize(vNor) : normalize(cross(dFdx(vPos), dFdy(vPos)));
  if (uHasNor == 1 && !gl_FrontFacing) n = -n;
  vec4 base = vec4(pow(uBase.rgb, vec3(1.0 / 2.2)), uBase.a);
  if (uHasTex == 1) base *= texture(uTex, vUv);
  if (uHasCol == 1) base *= vec4(pow(max(vCol.rgb, 0.0), vec3(1.0 / 2.2)), vCol.a);
  if (uMode == 1) base = vec4(0.74, 0.745, 0.76, 1.0);
  if (base.a < uCut) discard;
  vec3 v = normalize(-vPos);
  vec3 amb = mix(vec3(0.33, 0.32, 0.31), vec3(0.66, 0.67, 0.70), 0.5 + 0.5 * n.y);
  vec3 l1 = normalize(vec3(0.45, 0.70, 0.60)); vec3 l2 = normalize(vec3(-0.70, 0.25, 0.35));
  vec3 lit = amb + max(dot(n, l1), 0.0) * vec3(0.58) + max(dot(n, l2), 0.0) * vec3(0.20);
  float spec = pow(max(dot(n, normalize(l1 + v)), 0.0), 40.0) * (uMode == 1 ? 0.22 : 0.10);
  o = vec4(base.rgb * lit + spec, base.a);
}`;

  function program(gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'program');
    const u = {};
    for (const n of ['uMVP', 'uMV', 'uN', 'uTex', 'uBase', 'uHasTex', 'uHasNor', 'uHasCol', 'uMode', 'uCut', 'uLine']) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  /* ---------- leitura do GLB ---------- */

  const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const fail = (code, message) => Object.assign(new Error(message), { code });

  function parseGlb(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw fail('format', 'Esse arquivo não é um GLB.');
    if (dv.getUint32(4, true) !== 2) throw fail('format', 'Versão de GLB que o visualizador não abre.');
    let json = null; let bin = null;
    for (let p = 12; p + 8 <= buf.byteLength;) {
      const len = dv.getUint32(p, true); const type = dv.getUint32(p + 4, true);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, p + 8, len)));
      else if (type === 0x004e4942 && !bin) bin = new Uint8Array(buf, p + 8, len);
      p += 8 + len + ((4 - (len % 4)) % 4);
    }
    if (!json) throw fail('format', 'GLB sem a descrição da cena.');
    const packed = (json.extensionsRequired || []).find((e) => /draco|meshopt/i.test(e));
    if (packed) throw fail('packed', 'Esse modelo vem com a malha comprimida, que o visualizador do app não abre.');
    return { json, bin: bin || new Uint8Array(0) };
  }

  /* ---------- o visualizador ---------- */

  // canvas: onde desenhar. opts.interactive = false para só tirar uma foto do modelo
  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw fail('webgl', 'Este navegador não tem WebGL2, que o visualizador 3D precisa.');
    const prog = program(gl);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const maxTex = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const S = {
      prims: [], textures: [], buffers: [], center: [0, 0, 0], radius: 1, tris: 0, verts: 0,
      yaw: 0.6, pitch: 0.22, dist: 3, target: [0, 0, 0],
      mode: 'tex', wire: false, spin: opts.spin !== false && opts.interactive !== false, dirty: true, dead: false, raf: 0, last: 0, lines: false,
    };
    const white = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

    function clear() {
      for (const p of S.prims) { gl.deleteVertexArray(p.vao); if (p.lineVao) gl.deleteVertexArray(p.lineVao); }
      for (const b of S.buffers) gl.deleteBuffer(b);
      for (const t of S.textures) if (t) gl.deleteTexture(t);
      Object.assign(S, { prims: [], textures: [], buffers: [], tris: 0, verts: 0, lines: false });
    }

    async function load(buf) {
      clear();
      const { json, bin } = parseGlb(buf);
      const views = json.bufferViews || []; const accs = json.accessors || [];
      const slice = (i) => { const v = views[i]; return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };
      const made = new Map(); // "alvo:vista" -> buffer da placa
      const glBuffer = (viewIndex, target) => {
        const key = `${target}:${viewIndex}`;
        if (!made.has(key)) { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, slice(viewIndex), gl.STATIC_DRAW); S.buffers.push(b); made.set(key, b); }
        return made.get(key);
      };
      const attr = (loc, accIndex) => {
        const a = accs[accIndex];
        if (!a || a.bufferView === undefined || !NCOMP[a.type]) return null;
        const b = glBuffer(a.bufferView, gl.ARRAY_BUFFER);
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, NCOMP[a.type], a.componentType, !!a.normalized || (loc === 3 && a.componentType !== 5126), views[a.bufferView].byteStride || 0, a.byteOffset || 0);
        return b;
      };

      // texturas (a imagem fica dentro do próprio arquivo)
      const imgs = json.images || [];
      const loadImage = async (i) => {
        const im = imgs[i];
        if (!im) return null;
        const blob = im.bufferView !== undefined ? new Blob([slice(im.bufferView)], { type: im.mimeType || 'image/png' }) : im.uri && im.uri.startsWith('data:') ? await (await fetch(im.uri)).blob() : null;
        if (!blob) return null;
        let bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        if (Math.max(bmp.width, bmp.height) > maxTex) { // texturas de 8K não cabem com folga na placa: reduz
          const k = maxTex / Math.max(bmp.width, bmp.height);
          const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
          bmp.close(); bmp = small;
        }
        return bmp;
      };
      const texCache = new Map();
      const texture = async (texIndex) => {
        if (texIndex === undefined || texIndex === null) return null;
        if (texCache.has(texIndex)) return texCache.get(texIndex);
        const t = (json.textures || [])[texIndex] || {};
        const source = t.source !== undefined ? t.source : t.extensions && t.extensions.EXT_texture_webp ? t.extensions.EXT_texture_webp.source : undefined;
        let tex = null;
        try {
          const bmp = source === undefined ? null : await loadImage(source);
          if (bmp) {
            const s = (json.samplers || [])[t.sampler] || {};
            tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, s.wrapS || gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, s.wrapT || gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, s.magFilter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
            if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
            bmp.close();
            S.textures.push(tex);
          }
        } catch { tex = null; } // textura num formato que o navegador não abre: o modelo aparece sem ela
        texCache.set(texIndex, tex);
        return tex;
      };
      const material = async (i) => {
        const m = (json.materials || [])[i] || {};
        const pbr = m.pbrMetallicRoughness || {};
        const old = m.extensions && m.extensions.KHR_materials_pbrSpecularGlossiness; // exportadores antigos
        const texInfo = pbr.baseColorTexture || (old && old.diffuseTexture);
        return {
          base: pbr.baseColorFactor || (old && old.diffuseFactor) || [1, 1, 1, 1],
          tex: await texture(texInfo ? texInfo.index : undefined),
          twoSided: !!m.doubleSided,
          blend: m.alphaMode === 'BLEND',
          cut: m.alphaMode === 'MASK' ? (m.alphaCutoff === undefined ? 0.5 : m.alphaCutoff) : 0,
        };
      };
      const mats = new Map();
      const matOf = async (i) => { const k = i === undefined ? -1 : i; if (!mats.has(k)) mats.set(k, await material(i)); return mats.get(k); };

      // percorre a cena e monta cada pedaço da malha já na posição final
      let lo = [Infinity, Infinity, Infinity]; let hi = [-Infinity, -Infinity, -Infinity];
      const visit = async (nodeIndex, parent, depth) => {
        const n = (json.nodes || [])[nodeIndex];
        if (!n || depth > 64) return;
        const m = mul(parent, n.matrix ? new Float32Array(n.matrix) : trs(n.translation, n.rotation, n.scale));
        const mesh = n.mesh !== undefined ? (json.meshes || [])[n.mesh] : null;
        for (const p of mesh ? mesh.primitives || [] : []) {
          const mode = p.mode === undefined ? 4 : p.mode;
          const pos = accs[p.attributes && p.attributes.POSITION];
          if (!pos || pos.bufferView === undefined || mode < 4) continue; // pontos e linhas soltas ficam de fora
          const vao = gl.createVertexArray();
          gl.bindVertexArray(vao);
          const posBuf = attr(0, p.attributes.POSITION);
          const hasNor = p.attributes.NORMAL !== undefined && !!attr(1, p.attributes.NORMAL);
          const hasUv = p.attributes.TEXCOORD_0 !== undefined && !!attr(2, p.attributes.TEXCOORD_0);
          const hasCol = p.attributes.COLOR_0 !== undefined && !!attr(3, p.attributes.COLOR_0);
          const idx = p.indices !== undefined ? accs[p.indices] : null;
          if (idx && idx.bufferView !== undefined) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glBuffer(idx.bufferView, gl.ELEMENT_ARRAY_BUFFER));
          gl.bindVertexArray(null);
          const count = idx ? idx.count : pos.count;
          const mat = await matOf(p.material);
          S.prims.push({ vao, mode, count, idx, pos, posBuf, model: m, hasNor, hasCol, mat: { ...mat, tex: hasUv ? mat.tex : null } });
          S.tris += mode === 4 ? Math.floor(count / 3) : Math.max(0, count - 2);
          S.verts += pos.count;
          if (pos.min && pos.max) {
            for (let c = 0; c < 8; c++) {
              const w = point(m, [c & 1 ? pos.max[0] : pos.min[0], c & 2 ? pos.max[1] : pos.min[1], c & 4 ? pos.max[2] : pos.min[2]]);
              for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
            }
          }
        }
        for (const c of n.children || []) await visit(c, m, depth + 1);
      };
      const scene = (json.scenes || [])[json.scene || 0];
      const roots = scene && scene.nodes ? scene.nodes : (json.nodes || []).map((_, i) => i).filter((i) => !(json.nodes || []).some((n) => (n.children || []).includes(i)));
      for (const r of roots) await visit(r, IDENT, 0);
      if (!S.prims.length) throw fail('empty', 'Esse arquivo não tem malha para mostrar.');
      if (!Number.isFinite(lo[0])) { lo = [-1, -1, -1]; hi = [1, 1, 1]; }
      S.center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      S.radius = Math.max(1e-6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
      S.bin = bin; S.views = views;
      reset();
      return { tris: S.tris, verts: S.verts, textures: S.textures.length, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
    }

    const FOV = 0.56; // ~32 graus: pouca distorção de perspectiva
    function reset() {
      Object.assign(S, { yaw: 0.6, pitch: 0.22, target: [...S.center], dist: (S.radius / Math.sin(FOV / 2)) * 1.08, dirty: true });
      kick();
    }

    // Linhas da malha: uma lista de arestas por pedaço, montada só quando o usuário pede
    function buildLines() {
      if (S.lines) return true;
      if (S.tris > 4e6) return false;
      for (const p of S.prims) {
        if (p.mode !== 4) continue;
        const n = Math.floor(p.count / 3);
        let src = null;
        if (p.idx) {
          const v = S.views[p.idx.bufferView];
          const off = (v.byteOffset || 0) + (p.idx.byteOffset || 0) + S.bin.byteOffset;
          const T = p.idx.componentType === 5125 ? Uint32Array : p.idx.componentType === 5123 ? Uint16Array : Uint8Array;
          src = off % T.BYTES_PER_ELEMENT === 0 ? new T(S.bin.buffer, off, p.idx.count) : new T(S.bin.buffer.slice(off, off + p.idx.count * T.BYTES_PER_ELEMENT));
        }
        const lines = new Uint32Array(n * 6);
        for (let t = 0; t < n; t++) {
          const a = src ? src[t * 3] : t * 3; const b = src ? src[t * 3 + 1] : t * 3 + 1; const c = src ? src[t * 3 + 2] : t * 3 + 2;
          lines.set([a, b, b, c, c, a], t * 6);
        }
        p.lineVao = gl.createVertexArray();
        gl.bindVertexArray(p.lineVao);
        const a = p.pos; const view = S.views[a.bufferView];
        // o mesmo buffer de posições da malha, com outra lista de índices
        gl.bindBuffer(gl.ARRAY_BUFFER, p.posBuf);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, a.componentType, !!a.normalized, view.byteStride || 0, a.byteOffset || 0);
        const eb = gl.createBuffer(); S.buffers.push(eb);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, eb);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lines, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
        p.lineCount = lines.length;
      }
      S.lines = true;
      return true;
    }

    function draw() {
      const w = canvas.width; const h = canvas.height;
      if (!w || !h) return;
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!S.prims.length) return;
      const cp = Math.cos(S.pitch);
      const eye = [S.target[0] + S.dist * cp * Math.sin(S.yaw), S.target[1] + S.dist * Math.sin(S.pitch), S.target[2] + S.dist * cp * Math.cos(S.yaw)];
      const view = lookAt(eye, S.target, [0, 1, 0]);
      const proj = perspective(FOV, w / h, Math.max(S.dist - S.radius * 3, S.radius * 0.01), S.dist + S.radius * 4);
      gl.useProgram(prog.p);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(prog.u.uTex, 0);
      const pass = (blend) => {
        for (const p of S.prims) {
          if (p.mat.blend !== blend && S.mode === 'tex') continue;
          if (S.mode !== 'tex' && blend) continue;
          const mv = mul(view, p.model);
          gl.uniformMatrix4fv(prog.u.uMV, false, mv);
          gl.uniformMatrix4fv(prog.u.uMVP, false, mul(proj, mv));
          gl.uniformMatrix3fv(prog.u.uN, false, normalMat(mv));
          gl.uniform4fv(prog.u.uBase, p.mat.base);
          gl.uniform1i(prog.u.uHasTex, p.mat.tex ? 1 : 0);
          gl.uniform1i(prog.u.uHasNor, p.hasNor ? 1 : 0);
          gl.uniform1i(prog.u.uHasCol, p.hasCol ? 1 : 0);
          gl.uniform1i(prog.u.uMode, S.mode === 'clay' ? 1 : 0);
          gl.uniform1f(prog.u.uCut, S.mode === 'tex' ? p.mat.cut : 0);
          gl.bindTexture(gl.TEXTURE_2D, p.mat.tex || white);
          if (p.mat.twoSided || S.mode !== 'tex') gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
          gl.bindVertexArray(p.vao);
          if (!p.hasCol) gl.vertexAttrib4f(3, 1, 1, 1, 1);
          if (p.idx) gl.drawElements(p.mode, p.count, p.idx.componentType, p.idx.byteOffset || 0); else gl.drawArrays(p.mode, 0, p.count);
        }
      };
      gl.disable(gl.BLEND); gl.depthMask(true);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); // abre espaço para as linhas ficarem por cima
      pass(false);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      pass(true);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      if (S.wire && S.lines) {
        gl.uniform1i(prog.u.uMode, 2);
        gl.uniform4f(prog.u.uLine, 0.05, 0.07, 0.12, S.mode === 'clay' ? 0.55 : 0.42);
        for (const p of S.prims) {
          if (!p.lineVao) continue;
          const mv = mul(view, p.model);
          gl.uniformMatrix4fv(prog.u.uMVP, false, mul(proj, mv));
          gl.bindVertexArray(p.lineVao);
          gl.drawElements(gl.LINES, p.lineCount, gl.UNSIGNED_INT, 0);
        }
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    function frame(now) {
      S.raf = 0;
      if (S.dead) return;
      if (S.spin && S.prims.length) { S.yaw += Math.min(64, now - (S.last || now)) * 0.00035; S.dirty = true; }
      S.last = now;
      if (S.dirty) { S.dirty = false; draw(); }
      if (S.spin) kick();
    }
    function kick() { if (!S.raf && !S.dead && opts.interactive !== false) S.raf = requestAnimationFrame(frame); }
    const touch = () => { S.dirty = true; kick(); };

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)); const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; touch(); }
    }

    /* ---------- mouse e toque ---------- */
    const off = [];
    if (opts.interactive !== false) {
      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      off.push(() => ro.disconnect());
      const ptr = new Map(); let pinch = 0;
      const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };
      const stopSpin = () => { if (S.spin) { S.spin = false; if (opts.onSpin) opts.onSpin(false); } };
      on(canvas, 'pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button !== 0 || e.shiftKey }); stopSpin(); e.preventDefault(); });
      on(canvas, 'pointermove', (e) => {
        const p = ptr.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x; const dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (ptr.size === 2) { // pinça: aproxima e afasta
          const [a, b] = [...ptr.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch) S.dist = Math.min(S.radius * 40, Math.max(S.radius * 0.05, S.dist * (pinch / d)));
          pinch = d;
        } else if (p.pan) { // arrasta o modelo de lugar, no plano da tela
          const k = (S.dist * Math.tan(FOV / 2) * 2) / canvas.clientHeight;
          const cy = Math.cos(S.yaw); const sy = Math.sin(S.yaw); const cp = Math.cos(S.pitch); const sp = Math.sin(S.pitch);
          const right = [cy, 0, -sy]; const up = [-sy * sp, cp, -cy * sp];
          for (let i = 0; i < 3; i++) S.target[i] += (-dx * right[i] + dy * up[i]) * k;
        } else {
          S.yaw -= dx * 0.008;
          S.pitch = Math.max(-1.5, Math.min(1.5, S.pitch + dy * 0.008));
        }
        touch();
      });
      const up = (e) => { ptr.delete(e.pointerId); pinch = 0; };
      on(canvas, 'pointerup', up); on(canvas, 'pointercancel', up);
      on(canvas, 'wheel', (e) => { e.preventDefault(); stopSpin(); S.dist = Math.min(S.radius * 40, Math.max(S.radius * 0.05, S.dist * Math.exp(e.deltaY * 0.0012))); touch(); }, { passive: false });
      on(canvas, 'contextmenu', (e) => e.preventDefault());
      on(canvas, 'dblclick', () => reset());
      resize();
    }

    return {
      load,
      reset,
      stats: () => ({ tris: S.tris, verts: S.verts }),
      // 'tex' = com textura, 'clay' = malha lisa
      setMode(m) { S.mode = m === 'clay' ? 'clay' : 'tex'; touch(); },
      // liga as linhas da malha; devolve false quando ela é grande demais para isso
      setWire(v) { if (v && !buildLines()) return false; S.wire = !!v; touch(); return true; },
      setSpin(v) { S.spin = !!v; S.last = 0; touch(); },
      get spin() { return S.spin; },
      // Foto do modelo como está na tela (fundo transparente)
      snapshot(type = 'image/webp', quality = 0.9) {
        draw();
        return new Promise((res) => canvas.toBlob(res, type, quality));
      },
      dispose() {
        S.dead = true;
        cancelAnimationFrame(S.raf);
        for (const f of off) f();
        clear();
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      },
    };
  }

  // Foto de um GLB sem abrir o visualizador: usada para a miniatura da linha do tempo
  async function thumbnail(buf, size = 640) {
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const v = create(canvas, { interactive: false });
    try { await v.load(buf); return await v.snapshot(); } finally { v.dispose(); }
  }

  return { create, thumbnail, supported: () => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } } };
})();
