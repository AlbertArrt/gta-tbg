// MESH-BVH. Lazy bounds trees on the chunk meshes near the player. Camera pull and
// movement raycasts use them; chunks farther away drop the tree to save memory.
const BVH = { list: [], ray: new THREE.Raycaster(), built: 0, dropped: 0 };
function bvhCap() { return { low: 2, med: 4, high: 6 }[settings.quality] || 3; }
function bvhRadius() { return { low: 220, med: 360, high: 520 }[settings.quality] || 280; }
function bvhRegister(mesh) {
  const bs = mesh.geometry.boundingSphere;
  if (!bs) return;
  BVH.list.push({ mesh, x: bs.center.x, z: bs.center.z, r: bs.radius });
}
function bvhEnsure(x, z) {
  const R = bvhRadius(), cap = bvhCap();
  const near = [];
  for (const rec of BVH.list) if (Math.hypot(rec.x - x, rec.z - z) - rec.r < R) near.push(rec);
  near.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const keep = new Set(near.slice(0, cap));
  for (const rec of BVH.list) {
    const geo = rec.mesh.geometry;
    if (keep.has(rec)) {
      if (!geo.boundsTree && !rec.failed) {
        const n = geo.getAttribute('position').count;
        const capN = settings.quality === 'low' ? 70000 : 140000;
        if (n > capN) { rec.failed = true; continue; }
        try {
          if (!geo.index) {
            const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
            for (let i = 0; i < n; i++) idx[i] = i;
            geo.setIndex(new THREE.BufferAttribute(idx, 1));
          }
          geo.boundsTree = new MeshBVH(geo);
          BVH.built++;
        } catch (e) { rec.failed = true; }
      }
    } else if (geo.boundsTree) {
      geo.boundsTree = null;
      BVH.dropped++;
    }
  }
}
function bvhHits(ox, oy, oz, dx, dy, dz, far) {
  const len = Math.hypot(dx, dy, dz) || 1;
  BVH.ray.ray.origin.set(ox, oy, oz);
  BVH.ray.ray.direction.set(dx / len, dy / len, dz / len);
  BVH.ray.near = 0;
  BVH.ray.far = far;
  BVH.ray.firstHitOnly = true;
  let best = null;
  for (const rec of BVH.list) {
    if (!rec.mesh.geometry.boundsTree) continue;
    const hits = [];
    rec.mesh.raycast(BVH.ray, hits);
    if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
  }
  return best;
}
// Shorten a ground move when a wall mesh is in the way. Returns null if no tree is ready.
function bvhMove(x, z, nx, nz, radius, height) {
  bvhEnsure(x, z);
  let ready = false;
  for (const rec of BVH.list) if (rec.mesh.geometry.boundsTree) { ready = true; break; }
  if (!ready) return null;
  const dist = Math.hypot(nx - x, nz - z);
  if (dist < 1e-4) return { x: nx, z: nz, hit: false, used: true };
  const hit = bvhHits(x, height, z, nx - x, 0, nz - z, dist + radius);
  if (!hit || hit.distance > dist + radius * 0.25) return { x: nx, z: nz, hit: false, used: true };
  const keep = Math.max(0, hit.distance - radius);
  const k = keep / dist;
  const hx = hit.face ? hit.face.normal.x : (x - nx) / dist;
  const hz = hit.face ? hit.face.normal.z : (z - nz) / dist;
  return { x: x + (nx - x) * k, z: z + (nz - z) * k, hit: true, used: true, nx: hx, nz: hz };
}
function bvhCamDist(ox, oy, oz, dx, dy, dz) {
  bvhEnsure(ox, oz);
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.2) return null;
  const hit = bvhHits(ox, oy, oz, dx, dy, dz, dist);
  if (!hit) return null;
  return Math.max(0.15, hit.distance - 0.3) / dist;
}
