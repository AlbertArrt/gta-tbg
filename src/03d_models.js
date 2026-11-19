// ======================= Kenney bodies + city bus =======================
function lampMats(c) {
  c.headMat = mkMat({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.2 });
  c.tailMat = mkMat({ color: 0x990000, emissive: 0xff1010, emissiveIntensity: 0.3 });
}
function addLamps(c, heads, tails) {
  const B = c.body;
  B.add(new THREE.Mesh(mergeBoxes(heads.map((h) => [...h, '#ffffff'])), c.headMat));
  B.add(new THREE.Mesh(mergeBoxes(tails.map((h) => [...h, '#ffffff'])), c.tailMat));
}
function addWheels(c, wr, pairs) {
  c.wr = wr;
  const WW = Math.max(0.18, wr * 0.62);
  const key = wr + '_' + WW + '_' + TOON + '_0';
  Car.wheelGeo = Car.wheelGeo || {};
  if (!Car.wheelGeo[key]) Car.wheelGeo[key] = wheelGeometry(wr, WW, false);
  c.wheels = [];
  for (const [wx, wz] of pairs) {
    const pv = new THREE.Group(); pv.position.set(wx, wr, wz); c.g.add(pv);
    const w = new THREE.Mesh(Car.wheelGeo[key], carMat()); w.castShadow = true; pv.add(w);
    c.wheels.push({ pv, w, front: wz > 0 });
  }
}
function buildKitBody(c, color) {
  const K = KIT[c.model];
  const B = c.body;
  c.offs = K.offs.slice(); c.rad = K.rad; c.bus = false;
  if (c.model === 'ktaxi') color = 0xf6c431;
  else if (c.model === 'kpolice') color = 0xf4f6fa;
  else if (c.model === 'kambulance') color = 0xf4f1ea;
  c.color = color;
  c.geo = kitMesh(c.model, color);
  const bm = new THREE.Mesh(c.geo, carMat()); bm.castShadow = true; B.add(bm); c.bodyMesh = bm;
  if (TOON) { c.hull = new THREE.Mesh(c.geo, hullMats().norm); B.add(c.hull); }
  lampMats(c);
  const hy = Math.min(K.h * 0.45, 0.9), hz = K.len * 0.47, wx = K.wid * 0.28;
  addLamps(c,
    [[0.22, 0.12, 0.05, -wx, hy, hz], [0.22, 0.12, 0.05, wx, hy, hz]],
    [[0.24, 0.14, 0.05, -wx, hy, -hz], [0.24, 0.14, 0.05, wx, hy, -hz]]);
  if (c.model === 'kpolice') {
    c.lbR = new THREE.MeshBasicMaterial({ color: 0x661111 }); c.lbB = new THREE.MeshBasicMaterial({ color: 0x112266 });
    const y = K.h + 0.04;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), c.lbR); r.position.set(-0.18, y, 0); B.add(r);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), c.lbB); b2.position.set(0.18, y, 0); B.add(b2);
  } else if (c.model === 'ktaxi') {
    const sign = new THREE.Mesh(mergeBoxes([[0.42, 0.14, 0.16, 0, K.h + 0.06, 0, '#f6c431', 2]]), carMat());
    if (TOON) sign.add(new THREE.Mesh(sign.geometry, hullMats().small));
    B.add(sign);
  } else if (c.model === 'kambulance') {
    B.add(new THREE.Mesh(mergeBoxes([[0.46, 0.08, 0.14, 0, K.h + 0.02, 0, '#e8503a', 2], [0.14, 0.08, 0.46, 0, K.h + 0.02, 0, '#e8503a', 2]]), carMat()));
  }
  addWheels(c, K.wr, K.wp);
}
function buildBusBody(c, color) {
  c.bus = true; c.offs = [-3.3, -1.15, 1.15, 3.3]; c.rad = 1.22;
  const B = c.body;
  // MESHOPT bus body (same boxes, packed by glTF-Transform). Lamps and wheels stay live.
  c.geo = MESH.bus ? MESH.bus.clone() : new THREE.BoxGeometry(2.3, 2.2, 8);
  if (MESH.bus) { c.geo.userData.tags = MESH.bus.userData.tags; recolorTag(c.geo, 1, color); }
  const bm = new THREE.Mesh(c.geo, carMat()); bm.castShadow = true; B.add(bm); c.bodyMesh = bm;
  if (TOON) { c.hull = new THREE.Mesh(c.geo, hullMats().norm); B.add(c.hull); }
  lampMats(c);
  addLamps(c,
    [[0.28, 0.16, 0.06, -0.7, 0.7, 4.18], [0.28, 0.16, 0.06, 0.7, 0.7, 4.18]],
    [[0.32, 0.18, 0.06, -0.72, 0.82, -4.18], [0.32, 0.18, 0.06, 0.72, 0.82, -4.18]]);
  addWheels(c, 0.46, [[-1.02, 2.65], [1.02, 2.65], [-1.02, -2.5], [1.02, -2.5]]);
}
