/* Architecture-only display policy. Exhibits, pool and walking bounds never
   enter these groups. Split crossing surfaces at the actual gallery datum,
   interpolating every vertex attribute rather than classifying mesh centres. */
function splitArchitectureGeometry(geometry, floorY) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const names = Object.keys(source.attributes);
  const pos = source.attributes.position, epsilon = 1e-6;
  source.computeBoundingBox();
  if (source.boundingBox.min.y >= floorY - epsilon) {
    if (source !== geometry) source.dispose();
    return { lower: null, upper: geometry };
  }
  if (source.boundingBox.max.y < floorY + epsilon) {
    if (source !== geometry) source.dispose();
    return { lower: geometry, upper: null };
  }
  const attributes = names.map(name => source.attributes[name]);
  const positionIndex = names.indexOf('position');
  const outputs = [names.map(() => []), names.map(() => [])];
  const vertex = i => attributes.map(a => Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k]));
  const interpolate = (a, b) => {
    const t = (floorY - a[positionIndex][1]) / (b[positionIndex][1] - a[positionIndex][1]);
    const v = a.map((values, j) => values.map((value, k) => value + (b[j][k] - value) * t));
    v[positionIndex][1] = floorY;
    const normal = names.indexOf('normal');
    if (normal >= 0) {
      const n = v[normal], length = Math.hypot(...n) || 1;
      for (let k = 0; k < n.length; k++) n[k] /= length;
    }
    return v;
  };
  function clip(triangle, upper) {
    const result = [];
    const inside = v => upper ? v[positionIndex][1] >= floorY : v[positionIndex][1] <= floorY;
    let previous = triangle[triangle.length - 1];
    for (const current of triangle) {
      if (inside(previous) !== inside(current)) result.push(interpolate(previous, current));
      if (inside(current)) result.push(current);
      previous = current;
    }
    return result;
  }
  function emit(polygon, output) {
    for (let i = 1; i + 1 < polygon.length; i++) {
      const triangle = [polygon[0], polygon[i], polygon[i + 1]];
      const [a, b, c] = triangle.map(v => v[positionIndex]);
      const ab = b.map((v, k) => v - a[k]), ac = c.map((v, k) => v - a[k]);
      if (Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) < 1e-10) continue;
      for (const v of triangle) v.forEach((values, j) => output[j].push(...values));
    }
  }
  for (let i = 0; i < pos.count; i += 3) {
    const triangle = [vertex(i), vertex(i + 1), vertex(i + 2)];
    const heights = triangle.map(v => v[positionIndex][1]);
    if (Math.min(...heights) >= floorY - epsilon) emit(triangle, outputs[1]);
    else if (Math.max(...heights) <= floorY + epsilon) emit(triangle, outputs[0]);
    else { emit(clip(triangle, false), outputs[0]); emit(clip(triangle, true), outputs[1]); }
  }
  const build = output => {
    if (!output[positionIndex].length) return null;
    const g = new THREE.BufferGeometry();
    names.forEach((name, j) => g.setAttribute(name, new THREE.Float32BufferAttribute(output[j], attributes[j].itemSize, attributes[j].normalized)));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  };
  if (source !== geometry) source.dispose();
  return { lower: build(outputs[0]), upper: build(outputs[1]) };
}

function createArchitectureDisplay(parent, renderer, floorY) {
  const lower = new THREE.Group(), upper = new THREE.Group(), pool = new THREE.Group();
  lower.name = 'architecture-ground-hidden'; upper.name = 'architecture-upper-30-percent'; pool.name = 'pool-preserved';
  lower.userData.role = 'ground-floor-architecture'; lower.userData.floorY = floorY;
  upper.userData.role = 'upper-floor-architecture'; upper.userData.floorY = floorY;
  pool.userData.role = 'pool';
  parent.add(lower, upper, pool);
  const clones = new Map(), buckets = new Map();
  function upperMaterial(original) {
    if (!clones.has(original)) {
      const material = original.clone();
      material.name = (original.name || original.type) + '-upper-30-percent';
      material.transparent = true; material.opacity = 0.7;
      material.depthWrite = false; material.depthTest = true;
      material.forceSinglePass = true;
      material.userData.architectureOnly = true;
      clones.set(original, material);
    }
    return clones.get(original);
  }
  function add(mesh, level, role) {
    mesh.userData.architecture = true; mesh.userData.floor = level; mesh.userData.part = role;
    // Ordinary opaque shadow maps would make the hidden/translucent shell cast
    // solid shadows. The exhibits keep their original shadow behaviour.
    mesh.castShadow = false; mesh.receiveShadow = false;
    if (level === 'upper') {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(upperMaterial) : upperMaterial(mesh.material);
      mesh.renderOrder = 0; // normal per-object back-to-front transparent sorting
      upper.add(mesh);
    } else lower.add(mesh);
    return mesh;
  }
  function collect(key, geometry, elevation, assembly = 'wall') {
    const pieces = assembly === 'gallery-assembly' ? { lower: null, upper: geometry } : splitArchitectureGeometry(geometry, floorY);
    for (const level of ['lower', 'upper']) {
      const g = pieces[level]; if (!g) continue;
      const id = `${level}:${elevation}:${key}`;
      if (!buckets.has(id)) buckets.set(id, { key, level, elevation, geometry: [] });
      buckets.get(id).geometry.push(g.index ? g.toNonIndexed() : g);
    }
  }
  function flush(materials) {
    for (const [id, bucket] of buckets) {
      const mesh = new THREE.Mesh(mergeGeometries(bucket.geometry), materials[bucket.key]);
      mesh.name = 'architecture-' + id;
      add(mesh, bucket.level, bucket.elevation);
    }
    buckets.clear(); apply();
  }
  function apply() {
    lower.visible = false; upper.visible = true; pool.visible = true;
    for (const [original, material] of clones) {
      // NightLighting changes the original colour tokens. Copy only colour;
      // its independently captured environment-intensity fade remains intact.
      if (material.color && original.color) material.color.copy(original.color);
      material.transparent = true; material.opacity = 0.7; material.depthWrite = false;
    }
    renderer.shadowMap.needsUpdate = true;
  }
  function refreshShadows() {
    // Drop cached shadows from the old solid shell as well as requesting a draw.
    parent.parent?.traverse(o => {
      if (o.isLight && o.shadow?.map) { o.shadow.map.dispose(); o.shadow.map = null; }
    });
    renderer.shadowMap.needsUpdate = true;
  }
  return { lower, upper, pool, add, collect, flush, apply, refreshShadows,
    materialsFor: original => clones.has(original) ? [clones.get(original)] : [] };
}
