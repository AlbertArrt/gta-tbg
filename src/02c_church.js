// Kościół Wniebowzięcia NMP (dominikanie) przy Placu Bartosza Głowackiego.
// Pozycja z OSM: budynek kind=church przy landmarkzie „Kościół pw. Wniebowzięcia Najświętszej Maryi Panny”.
// Własny model komiksowy – nie korzysta z cudzych siatek.
function clockFaceTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f1e4'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#2a211c'; g.stroke();
  g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    g.beginPath(); g.moveTo(64 + Math.sin(a) * 42, 64 - Math.cos(a) * 42); g.lineTo(64 + Math.sin(a) * 52, 64 - Math.cos(a) * 52); g.stroke();
  }
  g.lineWidth = 7; g.beginPath(); g.moveTo(64, 68); g.lineTo(64 + Math.sin(0.55) * 24, 64 - Math.cos(0.55) * 24); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(64, 68); g.lineTo(64 + Math.sin(-0.9) * 36, 64 - Math.cos(-0.9) * 36); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function churchSolid(geo, color) {
  const mesh = new THREE.Mesh(geo, mkMat({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (TOON) {
    if (!geo.attributes.hdir) addHdir(geo);
    mesh.add(new THREE.Mesh(geo, hullMats().small));
  }
  return mesh;
}
function churchCone(radius, height, color) {
  const geo = new THREE.ConeGeometry(radius, height, 8);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, mkMat({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (TOON) mesh.add(new THREE.Mesh(geo, hullMats().norm));
  return mesh;
}
function putBox(parent, w, h, d, color, x, y, z) {
  const mesh = churchSolid(new THREE.BoxGeometry(w, h, d), color);
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
function buildDominicanChurch(scene, ring, cx, cz) {
  let best = 0, hx = 0, hz = 1;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ring[j * 2] - ring[i * 2], dz = ring[j * 2 + 1] - ring[i * 2 + 1];
    const L = Math.hypot(dx, dz);
    if (L > best) { best = L; hx = dx / L; hz = dz / L; }
  }
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = Math.atan2(hx, hz);
  const wall = 0xf4efe4, roof = 0xc8442f, dark = 0x2a211c, stone = 0xd7c6a8;
  putBox(g, 11.5, 8.2, 22, wall, 0, 4.1, 2);
  const naveRoof = churchCone(6.4, 4.2, roof); naveRoof.scale.set(1, 1, 2.15); naveRoof.position.set(0, 8.2, 2); g.add(naveRoof);
  putBox(g, 6.6, 18.5, 6.6, wall, 0, 9.25, -11.2);
  putBox(g, 7.1, 0.7, 7.1, stone, 0, 18.6, -11.2);
  for (const face of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]]) {
    putBox(g, face[0] ? 0.35 : 1.7, 2.4, face[2] ? 0.35 : 1.7, dark, face[0] * 3.15, 15.6, -11.2 + face[2] * 3.15);
  }
  const faceTex = clockFaceTexture();
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex });
  for (const face of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]]) {
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 2.15), faceMat);
    clock.position.set(face[0] * 3.32, 12.4, -11.2 + face[2] * 3.32);
    if (face[0]) clock.rotation.y = face[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (face[2] < 0) clock.rotation.y = Math.PI;
    g.add(clock);
  }
  const spire = churchCone(2.5, 8.4, roof); spire.position.set(0, 19.1, -11.2); g.add(spire);
  putBox(g, 0.28, 2.4, 0.28, dark, 0, 28.2, -11.2);
  putBox(g, 1.5, 0.22, 0.22, dark, 0, 29.1, -11.2);
  putBox(g, 2.2, 3.4, 0.28, dark, 0, 1.7, -7.8);
  putBox(g, 1.15, 1.5, 0.2, 0x8ec5ea, -3.2, 4.6, -8.9);
  putBox(g, 1.15, 1.5, 0.2, 0x8ec5ea, 3.2, 4.6, -8.9);
  scene.add(g);
  W.visObjects.push({ obj: g, x: cx, z: cz, r: 28, bias: 120 });
  W.landmarkChurch = { name: 'Kościół Wniebowzięcia NMP', x: cx, z: cz, h: 34, landmark: 'kosciol-wniebowziecia' };
}
