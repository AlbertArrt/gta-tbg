// ======================= WIDOK ZZA KIEROWNICY – kabina na osobnej warstwie =======================
// Rysowana po świecie, z wyczyszczoną głębią, więc deska nie wpada w jezdnię i nie zostawia szpary.
const CAB = { ready: false };
const CAB_INK = 0x1a120c;
function cabLines(geo) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geo, 12), new THREE.LineBasicMaterial({ color: CAB_INK }));
}
function cabBasic(color, transparent) {
  return new THREE.MeshBasicMaterial(transparent ? { color, transparent: true, opacity: 0.42, depthWrite: false } : { color });
}
function cabOutline(mesh) { mesh.add(cabLines(mesh.geometry)); return mesh; }
function ensureCockpit() {
  if (CAB.ready) return;
  CAB.ready = true;
  CAB.scene = new THREE.Scene();
  CAB.cam = new THREE.PerspectiveCamera(52, 1.6, 0.04, 12);
  CAB.cam.position.set(0, 0, 0.22);
  CAB.cam.lookAt(0, -0.04, -1);
  CAB.root = new THREE.Group();
  CAB.scene.add(CAB.root);
  buildCarCockpit();
  buildScooterCockpit();
}
function buildCarCockpit() {
  const g = new THREE.Group();
  const shell = mergeBoxes([
    [3.4, 0.85, 0.22, 0, 0.78, -1.02, '#1a1714'],
    [0.28, 1.25, 0.16, -0.82, 0.08, -1.0, '#2c2824'],
    [0.28, 1.25, 0.16, 0.82, 0.08, -1.0, '#2c2824'],
    [0.36, 0.95, 0.14, -1.12, -0.18, -0.92, '#24211e'],
    [0.36, 0.95, 0.14, 1.12, -0.18, -0.92, '#24211e'],
    [3.6, 1.55, 0.32, 0, -1.02, -0.86, '#2a2622'],
    [2.3, 0.05, 0.1, 0, -0.22, -0.68, '#4a453f'],
    [0.5, 0.12, 0.06, 0, 0.36, -0.74, '#1a1714'],
    [0.4, 0.07, 0.02, 0, 0.36, -0.7, '#7eb6d6'],
    [0.18, 0.1, 0.05, -0.62, 0.1, -0.74, '#1a1714'],
    [0.13, 0.07, 0.02, -0.62, 0.1, -0.7, '#7eb6d6'],
    [0.18, 0.1, 0.05, 0.62, 0.1, -0.74, '#1a1714'],
    [0.13, 0.07, 0.02, 0.62, 0.1, -0.7, '#7eb6d6'],
    [1.7, 0.18, 0.36, 0, -0.2, -0.98, '#2a2622'],
    [0.62, 0.2, 0.05, 0.38, -0.34, -0.64, '#141210'],
    [0.28, 0.14, 0.05, 0.78, -0.34, -0.6, '#1c1916'],
    [0.08, 0.05, 0.02, 0.7, -0.34, -0.56, '#0e0c0a'],
    [0.08, 0.05, 0.02, 0.86, -0.34, -0.56, '#0e0c0a'],
  ]);
  g.add(new THREE.Mesh(shell, new THREE.MeshBasicMaterial({ vertexColors: true })));
  g.add(cabLines(shell));
  const faceMat = cabBasic('#f4f1ea');
  [[0.22, -0.34], [0.38, -0.34], [0.54, -0.34]].forEach(([x, y], i) => {
    const d = new THREE.Mesh(new THREE.CircleGeometry(i === 0 ? 0.075 : 0.058, 14), faceMat);
    d.position.set(x, y, -0.55); g.add(d);
    const rim = new THREE.Mesh(new THREE.RingGeometry(i === 0 ? 0.075 : 0.058, (i === 0 ? 0.075 : 0.058) + 0.012, 14), cabBasic('#1a1714'));
    rim.position.set(x, y, -0.545); g.add(rim);
  });
  CAB.needle = new THREE.Group();
  CAB.needle.position.set(0.22, -0.34, -0.53);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.006), cabBasic('#e8503a'));
  needle.position.y = 0.028; CAB.needle.add(needle); g.add(CAB.needle);
  CAB.wheel = new THREE.Group();
  CAB.wheel.position.set(-0.18, -0.28, -0.42);
  const ring = cabOutline(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 16), cabBasic('#2a211c')));
  CAB.wheel.add(ring);
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.012), cabBasic('#3a342c'));
    sp.rotation.z = i / 3 * Math.PI; CAB.wheel.add(sp);
  }
  const skin = cabBasic('#f0c7a0'), sleeve = cabBasic('#3d8fe0');
  [[-0.12, 0.08, 0.7], [0.12, 0.08, -0.7]].forEach(([x, y, rot]) => {
    const h = new THREE.Group(); h.position.set(x, y, 0.03); h.rotation.z = rot;
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.04), sleeve); sl.position.y = -0.05; h.add(sl);
    h.add(new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.04, 0.032), skin));
    CAB.wheel.add(h);
  });
  g.add(CAB.wheel);
  CAB.hood = cabOutline(new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.7), cabBasic('#c0392b')));
  CAB.hood.position.set(0, -0.15, -1.15);
  const hood2 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.04, 0.4), CAB.hood.material);
  hood2.position.set(0, -0.12, -1.5);
  g.add(CAB.hood); g.add(hood2);
  CAB.car = g; CAB.root.add(g);
}
function buildScooterCockpit() {
  const g = new THREE.Group();
  CAB.bars = new THREE.Group();
  CAB.bars.position.set(0, -0.02, -0.72);
  const bar = cabOutline(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.035, 0.035), cabBasic('#2a211c')));
  CAB.bars.add(bar);
  [[-0.42, 0], [0.42, 0]].forEach(([x]) => {
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), cabBasic('#1a1714'));
    grip.position.set(x, 0, 0); CAB.bars.add(grip);
  });
  [[-0.34, 1], [0.34, -1]].forEach(([x, s]) => {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, 0.015), cabBasic('#3a342c'));
    stalk.position.set(x, 0.1, 0); CAB.bars.add(stalk);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), cabBasic('#1a1714'));
    head.position.set(x + s * 0.02, 0.18, 0.02); CAB.bars.add(head);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.028, 10), cabBasic('#9fd0ea'));
    glass.position.set(x + s * 0.02, 0.18, 0.035); CAB.bars.add(glass);
  });
  const pod = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), cabBasic('#f4f1ea'));
  pod.position.set(0, 0.02, 0.04); CAB.bars.add(pod);
  CAB.scootNeedle = new THREE.Group();
  CAB.scootNeedle.position.set(0, 0.02, 0.05);
  const nd = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.04, 0.004), cabBasic('#e8503a'));
  nd.position.y = 0.016; CAB.scootNeedle.add(nd); CAB.bars.add(CAB.scootNeedle);
  const glove = cabBasic('#f7f4ee'), sleeve = cabBasic('#3d8fe0');
  [[-0.42], [0.42]].forEach(([x]) => {
    const h = new THREE.Group(); h.position.set(x, 0.01, 0.02);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.04), sleeve); sl.position.y = -0.05; h.add(sl);
    h.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), glove));
    CAB.bars.add(h);
  });
  g.add(CAB.bars);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), cabBasic('#d7eefb', true));
  screen.position.set(0, 0.2, -0.86); g.add(screen);
  CAB.scootPanel = cabOutline(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.16), cabBasic('#d2452f')));
  CAB.scootPanel.position.set(0, -0.22, -0.8);
  g.add(CAB.scootPanel);
  CAB.scoot = g; g.visible = false; CAB.root.add(g);
}
function renderCockpit() {
  if (!G.started || !G.driveView || G.mode !== 'car' || !activeCar || G.inRange) return;
  ensureCockpit();
  const c = activeCar, scoot = !!c.scooter;
  CAB.car.visible = !scoot; CAB.scoot.visible = scoot;
  const aspect = innerWidth / Math.max(1, innerHeight);
  CAB.root.scale.set(aspect / 1.6, 1, 1);
  CAB.cam.aspect = aspect; CAB.cam.updateProjectionMatrix();
  if (!scoot) {
    CAB.hood.material.color.set(c.color);
    CAB.wheel.rotation.z = -(c.steer || 0) * 2.5;
    const t = clamp((c.speed || 0) * 3.6 / 160, 0, 1);
    CAB.needle.rotation.z = 0.9 - t * 2.6;
  } else {
    CAB.scootPanel.material.color.set(c.color);
    CAB.bars.rotation.z = -(c.steer || 0) * 1.1;
    const t = clamp((c.speed || 0) * 3.6 / 80, 0, 1);
    CAB.scootNeedle.rotation.z = 0.8 - t * 2.2;
  }
  const prev = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(CAB.scene, CAB.cam);
  renderer.autoClear = prev;
  G.cockpitCalls = renderer.info.render.calls || 0;
  G.cockpitTris = renderer.info.render.triangles || 0;
}
