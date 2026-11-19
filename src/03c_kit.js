// Kenney Car Kit bodies (CC0, https://kenney.nl/assets/car-kit), baked by tools/bake_kit.py.
// Wheels are the game's own. Vertex tag 1 is paint, tag 2 is a warm accent. Do not edit by hand.
const KIT = {};
function kitMesh(name, color) {
  const src = KIT[name].geo;
  const g = src.clone();
  g.userData.tags = src.userData.tags;
  recolorTag(g, 1, color);
  return g;
}
// Geometry is decoded from the meshopt GLB in src/03b_meshopt.js (MESHOPT).
function kitRoster() {
  const q = settings.quality;
  const few = ['khatch', 'ksedan', 'kvan', 'ktaxi'];
  const mid = ['khatch', 'ksedan', 'kvan', 'kpickup', 'ktaxi', 'kpolice'];
  const all = ['khatch', 'ksedan', 'kvan', 'kpickup', 'ktruck', 'ktaxi', 'kpolice', 'kambulance'];
  if (q === 'low') return { models: few, n: 6, parked: 3, buses: 1 };
  if (q === 'high') return { models: all, n: 18, parked: 8, buses: 2 };
  return { models: mid, n: 14, parked: 6, buses: 2 };
}
