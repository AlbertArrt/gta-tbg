// YUKA-STEER. Nearby pedestrians and traffic only (LOD). Sidewalks stay the authority:
// a pedestrian may speed up, slow down or turn around, but the step stays on the path.
function yukaRadius() { return { low: 180, med: 260, high: 340 }[settings.quality] || 220; }
function yukaNear(x, z) {
  const f = focusPos();
  return Math.hypot(x - f.x, z - f.z) < yukaRadius();
}
function yukaPedNudge(p, dt, tx, tz) {
  if (!yukaNear(p.x, p.z)) return 1;
  if (!p._yv) {
    p._yv = new Vehicle();
    p._yv.maxSpeed = 2.4;
    p._yv.maxForce = 10;
    p._yv.boundingRadius = 0.35;
    p._sep = new SeparationBehavior();
    p._flee = new FleeBehavior(new Vector3(p.x, 0, p.z), 8);
    p._flee.active = false;
    p._yv.steering.add(p._sep);
    p._yv.steering.add(p._flee);
  }
  const neighbors = [];
  for (const o of TR.peds) {
    if (!o.on || o === p) continue;
    if (Math.hypot(o.x - p.x, o.z - p.z) > 1.7) continue;
    if (!o._ent) { o._ent = new GameEntity(); o._ent.boundingRadius = 0.35; }
    o._ent.position.set(o.x, 0, o.z);
    neighbors.push(o._ent);
  }
  if (G.mode === 'foot' && Math.hypot(player.x - p.x, player.z - p.z) < 1.7) {
    if (!yukaPedNudge._player) { yukaPedNudge._player = new GameEntity(); yukaPedNudge._player.boundingRadius = 0.4; }
    yukaPedNudge._player.position.set(player.x, 0, player.z);
    neighbors.push(yukaPedNudge._player);
  }
  p._yv.neighbors = neighbors;
  p._yv.position.set(p.x, 0, p.z);
  p._yv.velocity.set(tx * p.v, 0, tz * p.v);
  let threat = null, td = 8;
  for (const c of cars) {
    if (!c.g.visible || c.speed < 2.4) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < td) { td = d; threat = c; }
  }
  if (threat) { p._flee.active = true; p._flee.target.set(threat.x, 0, threat.z); p._flee.panicDistance = 8; }
  else p._flee.active = false;
  p._yv.update(dt);
  if (p._baseV == null) p._baseV = p.v;
  if (threat && td < 7) {
    const away = (p.x - threat.x) * tx + (p.z - threat.z) * tz;
    p.v = Math.min(2.6, p._baseV + 1.1);
    return away < 0 ? -1 : 1;
  }
  p.v = p._baseV;
  for (const n of neighbors) {
    const dx = n.position.x - p.x, dz = n.position.z - p.z;
    if (dx * tx + dz * tz > 0.15 && Math.hypot(dx, dz) < 1.15) { p.v = Math.min(p.v, 0.4); break; }
  }
  return 1;
}
function yukaTrafficSpeed(c, a, e, dt, cap) {
  if (!yukaNear(c.x, c.z)) return cap;
  if (!c._yv) {
    c._yv = new Vehicle();
    c._yv.maxForce = 18;
    c._yv.boundingRadius = c.rad || 1.1;
    c._path = new Path();
    c._follow = new FollowPathBehavior(c._path, 4);
    c._avoid = new ObstacleAvoidanceBehavior([]);
    c._avoid.dBoxMinLength = 6;
    c._avoid.brakingWeight = 0.85;
    c._yv.steering.add(c._follow);
    c._yv.steering.add(c._avoid);
    c._obs = [];
  }
  c._yv.maxSpeed = cap;
  c._yv.position.set(c.x, 0, c.z);
  const spd = Math.max(a.v, 0.4);
  c._yv.velocity.set(Math.sin(c.h) * spd, 0, Math.cos(c.h) * spd);
  const pts = [];
  const pose = agentPose(c);
  pts.push(new Vector3(pose.x, 0, pose.z));
  const ahead = Math.min(e.len, a.s + 8);
  const far = edgeSample(e, a.dir > 0 ? ahead : e.len - ahead, { x: 0, z: 0, h: 0 });
  pts.push(new Vector3(far.x, 0, far.z));
  c._path.clear();
  for (const p of pts) c._path.add(p);
  c._path.loop = false;
  const obstacles = [];
  for (const o of cars) {
    if (o === c || !o.g.visible) continue;
    if (Math.hypot(o.x - c.x, o.z - c.z) > 16) continue;
    if (!o._ent) { o._ent = new GameEntity(); }
    o._ent.position.set(o.x, 0, o.z);
    o._ent.boundingRadius = (o.rad || 1) + 0.4;
    obstacles.push(o._ent);
  }
  if (G.mode === 'foot' && Math.hypot(player.x - c.x, player.z - c.z) < 14) {
    if (!yukaTrafficSpeed._player) { yukaTrafficSpeed._player = new GameEntity(); yukaTrafficSpeed._player.boundingRadius = 0.6; }
    yukaTrafficSpeed._player.position.set(player.x, 0, player.z);
    obstacles.push(yukaTrafficSpeed._player);
  }
  c._avoid.obstacles = obstacles;
  c._yv.update(dt);
  return Math.min(cap, c._yv.getSpeed ? c._yv.getSpeed() : c._yv.velocity.length());
}
