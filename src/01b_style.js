
// ======================= STYLE (komiks / cel-shading) =======================
const OUTLINE_COL = new THREE.Color('#2a211c');
let toonGradTex = null;
function toonGrad() {
  if (!toonGradTex) {
    toonGradTex = new THREE.DataTexture(new Uint8Array([118, 190, 255]), 3, 1, THREE.RedFormat);
    toonGradTex.minFilter = toonGradTex.magFilter = THREE.NearestFilter; toonGradTex.generateMipmaps = false; toonGradTex.needsUpdate = true;
  }
  return toonGradTex;
}
// material factory: toon (3-step gradient) in comic styles, Lambert in classic
function mkMat(p) {
  const q = { ...p };
  if (!TOON) return new THREE.MeshLambertMaterial(q);
  delete q.flatShading; delete q.shininess; delete q.specular;
  q.gradientMap = toonGrad();
  return new THREE.MeshToonMaterial(q);
}
// ---- inverted-hull outlines (thickness grows with distance ≈ constant on screen, capped)
const HULL_U = { uHullW: { value: 0.0026 }, uHullB: { value: 0.012 }, uHullMax: { value: 0.35 } };
const HULL = {};
function makeHullMat(box, maxW) {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COL, side: THREE.BackSide });
  const umax = { value: maxW };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHullW = HULL_U.uHullW; sh.uniforms.uHullB = HULL_U.uHullB; sh.uniforms.uHullMax = umax;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uHullW; uniform float uHullB; uniform float uHullMax;\n' + (box ? 'attribute vec3 hdir;\n' : ''))
      .replace('#include <begin_vertex>', `vec3 transformed = vec3( position );
      {
      #ifdef USE_INSTANCING
        mat4 hM = modelMatrix * instanceMatrix;
      #else
        mat4 hM = modelMatrix;
      #endif
        vec3 hs = vec3(length(hM[0].xyz), length(hM[1].xyz), length(hM[2].xyz));
        vec3 hw = (hM * vec4(position, 1.0)).xyz;
        float tw = min(uHullW * distance(cameraPosition, hw) + uHullB, uHullMax);
        transformed += ${box ? 'hdir' : 'normal'} * tw / hs;
      }`);
  };
  m.customProgramCacheKey = () => 'hull' + (box ? 'B' : 'N');
  return m;
}
function hullMats() {
  if (!HULL.box) { HULL.box = makeHullMat(true, 0.09); HULL.norm = makeHullMat(false, 0.28); HULL.small = makeHullMat(true, 0.05); }
  return HULL;
}
// adds the hull push-direction attribute (per-axis sign from the box centre) to a box-like geometry
function addHdir(geo) {
  geo.computeBoundingBox(); const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
  const p = geo.attributes.position, a = new Float32Array(p.count * 3);
  const sz = new THREE.Vector3(); geo.boundingBox.getSize(sz);
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - c.x, dy = p.getY(i) - c.y, dz = p.getZ(i) - c.z;
    a[i * 3] = Math.abs(dx) > sz.x * 0.01 ? Math.sign(dx) : 0; a[i * 3 + 1] = Math.abs(dy) > sz.y * 0.01 ? Math.sign(dy) : 0; a[i * 3 + 2] = Math.abs(dz) > sz.z * 0.01 ? Math.sign(dz) : 0;
  }
  geo.setAttribute('hdir', new THREE.BufferAttribute(a, 3)); return geo;
}
// merge a list of box specs into one non-indexed geometry with vertex colours + hdir: [w,h,d,x,y,z,color, tag]
function mergeBoxes(specs) {
  const P = [], N = [], C = [], H = [], tags = [];
  const col = new THREE.Color();
  for (const s of specs) {
    const g = (s[8] || new THREE.BoxGeometry(s[0], s[1], s[2])).toNonIndexed(); if (!s[8]) addHdir(g); else if (!g.attributes.hdir) addHdir(g);
    g.translate(s[3], s[4], s[5]);
    const p = g.attributes.position, n = g.attributes.normal, h = g.attributes.hdir; col.set(s[6]);
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(col.r, col.g, col.b); H.push(h.getX(i), h.getY(i), h.getZ(i)); tags.push(s[7] || 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('hdir', new THREE.Float32BufferAttribute(H, 3));
  g.userData.tags = tags; g.computeBoundingSphere(); return g;
}
function recolorTag(geo, tag, color) {
  const c = new THREE.Color(color), a = geo.attributes.color, t = geo.userData.tags;
  for (let i = 0; i < t.length; i++) if (t[i] === tag) a.setXYZ(i, c.r, c.g, c.b);
  a.needsUpdate = true;
}

// ---- screen-space line outlines for building edges (one instanced draw per chunk)
let edgeMat = null;
function getEdgeMat() {
  if (edgeMat) return edgeMat;
  edgeMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uRes: { value: new THREE.Vector2(640, 360) }, uW: { value: 1.0 }, uNear: { value: 0.3 }, uFade: { value: 500 }, uCol: { value: OUTLINE_COL.clone() } }]),
    vertexShader: `attribute vec3 iA; attribute vec3 iB; uniform vec2 uRes; uniform float uW; uniform float uNear; uniform float uFade;
      #include <fog_pars_vertex>
      void main(){
        vec4 a = modelViewMatrix * vec4(iA, 1.0); vec4 b = modelViewMatrix * vec4(iB, 1.0);
        float nz = -uNear * 1.05;
        if (a.z > nz && b.z > nz) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        if (a.z > nz) a = mix(b, a, (b.z - nz) / (b.z - a.z)); else if (b.z > nz) b = mix(a, b, (a.z - nz) / (a.z - b.z));
        a.xyz *= 0.9965; b.xyz *= 0.9965;
        vec4 pa = projectionMatrix * a, pb = projectionMatrix * b;
        vec2 sa = pa.xy / pa.w * uRes, sb = pb.xy / pb.w * uRes;
        vec2 d = sb - sa; float L = length(d); d = L > 1e-4 ? d / L : vec2(1.0, 0.0);
        vec2 n = vec2(-d.y, d.x);
        float e = position.x; vec4 p = e < 0.5 ? pa : pb; vec4 mvPosition = e < 0.5 ? a : b;
        float w = uW * clamp(1.5 - (-mvPosition.z) / uFade, 0.5, 1.0);
        vec2 off = (n * position.y + d * (e * 2.0 - 1.0) * 0.5) * w;
        p.xy += off / uRes * p.w;
        gl_Position = p;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uCol;
      #include <fog_pars_fragment>
      void main(){ gl_FragColor = vec4(uCol, 1.0);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return edgeMat;
}
let edgeBase = null;
function makeEdgeMesh(arr) {
  if (!edgeBase) edgeBase = new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0]);
  const n = arr.length / 6; const A = new Float32Array(n * 3), B = new Float32Array(n * 3);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = 0;
  for (let i = 0; i < n; i++) {
    A[i * 3] = arr[i * 6]; A[i * 3 + 1] = arr[i * 6 + 1]; A[i * 3 + 2] = arr[i * 6 + 2]; B[i * 3] = arr[i * 6 + 3]; B[i * 3 + 1] = arr[i * 6 + 4]; B[i * 3 + 2] = arr[i * 6 + 5];
    x0 = Math.min(x0, arr[i * 6], arr[i * 6 + 3]); x1 = Math.max(x1, arr[i * 6], arr[i * 6 + 3]); z0 = Math.min(z0, arr[i * 6 + 2], arr[i * 6 + 5]); z1 = Math.max(z1, arr[i * 6 + 2], arr[i * 6 + 5]); y1 = Math.max(y1, arr[i * 6 + 1], arr[i * 6 + 4]);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(edgeBase, 3));
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 3)); g.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
  g.instanceCount = n;
  const c = new THREE.Vector3((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2);
  g.boundingSphere = new THREE.Sphere(c, Math.hypot(x1 - x0, z1 - z0, y1) / 2 + 1);
  const m = new THREE.Mesh(g, getEdgeMat()); m.matrixAutoUpdate = false; m.renderOrder = 1;
  return m;
}

// ---- facade atlas: 4 columns × 3 rows (piętro, zwykły parter, jedyne wejście)
// mask: R = kolor ściany, G = akcent, B = szyba, która może świecić w nocy
function makeFacadeAtlas(aniso) {
  const CW = 128, COLS = 4, ROWS = 3, W2 = CW * COLS, H2 = CW * ROWS;
  const mk = () => { const c = document.createElement('canvas'); c.width = W2; c.height = H2; return [c, c.getContext('2d')]; };
  const [cc, g] = mk(), [mc, m] = mk();
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W2, H2); m.fillStyle = 'rgb(255,0,0)'; m.fillRect(0, 0, W2, H2);
  const OUT = '#2a211c', GLASS = '#8ec5ea', GLASS2 = '#5f9fd0';
  // cell coords: x left→right, y bottom→top, 0..1. Row 0 is the bottom band of the texture.
  const R = (col, row, x0, y0, x1, y1) => { const px = (col + x0) * CW, py = H2 - (row + y1) * CW; return [px, py, (x1 - x0) * CW, (y1 - y0) * CW]; };
  const rect = (col, row, x0, y0, x1, y1, color, mask) => { const r = R(col, row, x0, y0, x1, y1); g.fillStyle = color; g.fillRect(...r); m.fillStyle = mask; m.fillRect(...r); };
  const win = (col, row, x0, y0, x1, y1, cross) => {
    rect(col, row, x0 - 0.035, y0 - 0.035, x1 + 0.035, y1 + 0.035, OUT, 'rgb(0,0,0)');
    rect(col, row, x0, y0, x1, y1, GLASS, 'rgb(0,0,255)');
    const r = R(col, row, x0, y0, x1, y1); const grd = g.createLinearGradient(r[0], r[1], r[0] + r[2], r[1] + r[3]); grd.addColorStop(0, '#b9e0fa'); grd.addColorStop(0.55, GLASS); grd.addColorStop(1, GLASS2); g.fillStyle = grd; g.fillRect(...r);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(r[0] + r[2] * 0.12, r[1] + r[3] * 0.55); g.lineTo(r[0] + r[2] * 0.45, r[1] + r[3] * 0.12); g.lineTo(r[0] + r[2] * 0.58, r[1] + r[3] * 0.12); g.lineTo(r[0] + r[2] * 0.12, r[1] + r[3] * 0.72); g.fill();
    if (cross) { rect(col, row, (x0 + x1) / 2 - 0.018, y0, (x0 + x1) / 2 + 0.018, y1, OUT, 'rgb(0,0,0)'); rect(col, row, x0, y0 + (y1 - y0) * 0.62, x1, y0 + (y1 - y0) * 0.62 + 0.03, OUT, 'rgb(0,0,0)'); }
  };
  const sill = (col, row, x0, x1, y) => { rect(col, row, x0, y, x1, y + 0.035, '#ffffff', 'rgb(0,255,0)'); rect(col, row, x0, y - 0.012, x1, y, OUT, 'rgb(0,0,0)'); };
  const cornice = (col, row) => { rect(col, row, 0, 0.9, 1, 0.97, '#ffffff', 'rgb(0,255,0)'); rect(col, row, 0, 0.97, 1, 1, OUT, 'rgb(0,0,0)'); rect(col, row, 0, 0, 1, 0.045, '#ffffff', 'rgb(0,255,0)'); rect(col, row, 0, 0.045, 1, 0.062, OUT, 'rgb(0,0,0)'); };
  cornice(0, 0); win(0, 0, 0.22, 0.22, 0.46, 0.72, true); win(0, 0, 0.54, 0.22, 0.78, 0.72, true); sill(0, 0, 0.18, 0.82, 0.16);
  cornice(1, 0); win(1, 0, 0.3, 0.28, 0.7, 0.78, true); sill(1, 0, 0.22, 0.78, 0.2);
  cornice(2, 0); win(2, 0, 0.36, 0.28, 0.64, 0.74, true); sill(2, 0, 0.32, 0.68, 0.22);
  rect(2, 0, 0.22, 0.26, 0.32, 0.76, OUT, 'rgb(0,0,0)'); rect(2, 0, 0.232, 0.28, 0.308, 0.74, '#ffffff', 'rgb(0,255,0)');
  rect(2, 0, 0.68, 0.26, 0.78, 0.76, OUT, 'rgb(0,0,0)'); rect(2, 0, 0.692, 0.28, 0.768, 0.74, '#ffffff', 'rgb(0,255,0)');
  for (let k = 0; k < 8; k++) rect(3, 0, k / 8, 0, k / 8 + 0.012, 1, 'rgba(0,0,0,.15)', 'rgb(180,0,0)');
  win(3, 0, 0.04, 0.42, 0.96, 0.7, false); rect(3, 0, 0, 0.7, 1, 0.74, OUT, 'rgb(0,0,0)');
  const plinth = (col) => { rect(col, 1, 0, 0, 1, 0.16, '#ffffff', 'rgb(0,255,0)'); rect(col, 1, 0, 0.16, 1, 0.185, OUT, 'rgb(0,0,0)'); };
  plinth(0); win(0, 1, 0.22, 0.32, 0.46, 0.78, true); win(0, 1, 0.54, 0.32, 0.78, 0.78, true); sill(0, 1, 0.18, 0.82, 0.26);
  plinth(1); win(1, 1, 0.3, 0.34, 0.7, 0.8, true); sill(1, 1, 0.24, 0.76, 0.28);
  plinth(2); win(2, 1, 0.36, 0.36, 0.64, 0.78, true); sill(2, 1, 0.3, 0.7, 0.3);
  plinth(3); win(3, 1, 0.08, 0.4, 0.92, 0.72, false);
  const door = (col, x0, x1, y1, color) => {
    rect(col, 2, x0 - 0.03, 0, x1 + 0.03, y1 + 0.04, OUT, 'rgb(0,0,0)');
    rect(col, 2, x0, 0, x1, y1, color, 'rgb(0,0,0)');
    rect(col, 2, (x0 + x1) / 2 - 0.01, 0.05, (x0 + x1) / 2 + 0.01, y1 - 0.04, OUT, 'rgb(0,0,0)');
    rect(col, 2, x1 - 0.07, y1 * 0.48, x1 - 0.035, y1 * 0.48 + 0.04, '#f6c431', 'rgb(0,0,0)');
  };
  rect(0, 2, 0, 0, 1, 0.08, '#ffffff', 'rgb(0,255,0)');
  win(0, 2, 0.06, 0.14, 0.94, 0.62, false);
  for (let k = 0; k < 7; k++) rect(0, 2, k / 7, 0.66, (k + 0.86) / 7, 0.9, '#ffffff', k % 2 ? 'rgb(0,0,0)' : 'rgb(0,255,0)');
  rect(0, 2, 0, 0.62, 1, 0.66, OUT, 'rgb(0,0,0)'); rect(0, 2, 0, 0.9, 1, 0.94, OUT, 'rgb(0,0,0)');
  rect(1, 2, 0, 0, 1, 0.1, '#ffffff', 'rgb(0,255,0)');
  door(1, 0.34, 0.66, 0.62, '#6b3e2a');
  win(1, 2, 0.08, 0.28, 0.26, 0.62, true); win(1, 2, 0.74, 0.28, 0.92, 0.62, true);
  rect(1, 2, 0.28, 0.66, 0.72, 0.74, '#ffffff', 'rgb(0,255,0)'); rect(1, 2, 0.28, 0.64, 0.72, 0.66, OUT, 'rgb(0,0,0)');
  rect(2, 2, 0, 0, 1, 0.1, '#ffffff', 'rgb(0,255,0)');
  door(2, 0.36, 0.64, 0.58, '#7a4632');
  rect(2, 2, 0.3, 0.62, 0.7, 0.7, '#ffffff', 'rgb(0,255,0)');
  win(2, 2, 0.72, 0.38, 0.9, 0.7, true);
  rect(3, 2, 0.08, 0, 0.92, 0.78, OUT, 'rgb(0,0,0)');
  rect(3, 2, 0.12, 0, 0.88, 0.74, '#d7d2c8', 'rgb(0,0,0)');
  for (let k = 1; k < 6; k++) rect(3, 2, 0.12, k * 0.12, 0.88, k * 0.12 + 0.018, OUT, 'rgb(0,0,0)');
  const tex = new THREE.CanvasTexture(cc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
  const mask = new THREE.CanvasTexture(mc); mask.anisotropy = aniso;
  return { tex, mask };
}
function makeFacadeMat(aniso) {
  const { tex, mask } = makeFacadeAtlas(aniso);
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, map: tex, gradientMap: toonGrad(), emissive: 0xffd28a, emissiveIntensity: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.facMask = { value: mask };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 acc; attribute float aTile; varying vec3 vAcc; varying float vTile;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAcc = acc; vTile = aTile;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D facMask; varying vec3 vAcc; varying float vTile;')
      .replace('#include <map_fragment>', `float facLit = 0.0;
        if (vTile < -0.5) { diffuseColor.rgb *= vColor; }
        else {
          vec2 fu = vMapUv; vec2 cu = fract(fu); float fl = floor(fu.y);
          float door = step(15.5, vTile);
          float base = vTile - door * 16.0;
          float tc = mod(base, 4.0);
          float shop = step(3.5, base);
          float row = 0.0;
          if (fl < 0.5) {
            if (door > 0.5) {
              row = 2.0;
              if (shop > 0.5) tc = 0.0;
              else if (tc < 1.5) tc = 1.0;
            } else row = 1.0;
          }
          vec2 auv = vec2((tc + cu.x) * 0.25, (row + cu.y) / 3.0);
          vec2 gx = dFdx(fu) * vec2(0.25, 0.333333), gy = dFdy(fu) * vec2(0.25, 0.333333);
          vec4 fc = textureGrad(map, auv, gx, gy); vec4 fm = textureGrad(facMask, auv, gx, gy);
          vec3 pc = mix(fc.rgb, vColor, fm.r); pc = mix(pc, vAcc, fm.g);
          diffuseColor.rgb *= pc;
          facLit = fm.b * step(0.42, fract(sin(dot(floor(fu) + vec2(vTile * 3.7, vTile), vec2(12.9898, 78.233))) * 43758.5453));
        }`)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= facLit;');
  };
  mat.customProgramCacheKey = () => 'facade3';
  return mat;
}

// ---- optional post-process (Komiks pełny): depth-edge outlines + slight saturation boost
const POST = { on: false };
function initPost() {
  const want = STYLE === 'full' && settings.quality !== 'low';
  if (!want) { POST.on = false; return; }
  POST.on = true; if (POST.rt) { resizePost(); return; }
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  const dt = new THREE.DepthTexture(sz.x, sz.y); dt.type = THREE.UnsignedIntType;
  POST.rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { depthTexture: dt, samples: QUALITY[settings.quality].aa ? 4 : 0 });
  POST.mat = new THREE.ShaderMaterial({
    uniforms: { tCol: { value: POST.rt.texture }, tDep: { value: dt }, uPx: { value: new THREE.Vector2(1 / sz.x, 1 / sz.y) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uCol: { value: OUTLINE_COL.clone() }, uSat: { value: 1.1 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tCol; uniform sampler2D tDep; uniform vec2 uPx; uniform float uNear; uniform float uFar; uniform vec3 uCol; uniform float uSat; uniform float uK; varying vec2 vUv;
      float lin(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }
      void main(){
        vec4 c = texture2D(tCol, vUv);
        float zc = lin(texture2D(tDep, vUv).x);
        vec2 o = uPx * uK;
        float z1 = lin(texture2D(tDep, vUv + vec2(o.x, 0.0)).x), z2 = lin(texture2D(tDep, vUv - vec2(o.x, 0.0)).x);
        float z3 = lin(texture2D(tDep, vUv + vec2(0.0, o.y)).x), z4 = lin(texture2D(tDep, vUv - vec2(0.0, o.y)).x);
        float dz = max(max(z1, z2), max(z3, z4)) - zc;
        float e = smoothstep(0.05, 0.12, dz / zc) * (1.0 - smoothstep(180.0, 420.0, zc));
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = max(mix(vec3(l), c.rgb, uSat), 0.0);
        c.rgb = mix(c.rgb, uCol, e * 0.9);
        gl_FragColor = vec4(c.rgb, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  POST.scene = new THREE.Scene(); POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), POST.mat); q.frustumCulled = false; POST.scene.add(q);
}
function resizePost() {
  if (!POST.on) return; const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  POST.rt.setSize(sz.x, sz.y); POST.mat.uniforms.uPx.value.set(1 / sz.x, 1 / sz.y); POST.mat.uniforms.uK.value = Math.max(1, renderer.getPixelRatio());
}
function renderFrame() {
  if (TOON) {
    const sz = renderer.getDrawingBufferSize(tmpSz); const em = getEdgeMat();
    em.uniforms.uRes.value.set(sz.x / 2, sz.y / 2); em.uniforms.uW.value = 1.05 * renderer.getPixelRatio(); em.uniforms.uNear.value = camera.near;
  }
  if (POST.on) {
    POST.mat.uniforms.uNear.value = camera.near; POST.mat.uniforms.uFar.value = camera.far;
    renderer.setRenderTarget(POST.rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(POST.scene, POST.cam);
  } else renderer.render(scene, camera);
}
const tmpSz = new THREE.Vector2();
