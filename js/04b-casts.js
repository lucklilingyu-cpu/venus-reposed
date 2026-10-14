/* The former procedural cast meshes are removed by source.
   Retain their illumination and invisible analytical walk bounds only. */
const PORT_D = 2.3;
const TRAJAN = { x: 19.6, zLow: -3.5, zUp: 3.5 };
(() => {
  const spot = new THREE.SpotLight(0xfff0dc, 640, 0, 0.66, 0.7, 2);
  spot.name = 'portico-light';
  spot.position.set(HALL.x0 + 8.5, 14, 7.2); spot.target.position.set(HALL.x0 + 0.6, 5.0, -0.6);
  spot.castShadow = true; spot.shadow.mapSize.set(isSmall() ? 1024 : 2048, isSmall() ? 1024 : 2048); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02;
  scene.add(spot, spot.target);
})();
/* floor plan for walk mode: free area and obstacles [x0, z0, x1, z1] */
const WALK = {
  bounds: { x0: HALL.x0 + PORT_D - 0.1, x1: HALL.x1 - 1.35, z0: -HALL.z + 1.3, z1: HALL.z - 1.3 },
  rects: [
    [-18.25, -3.95, 15.85, 3.95], // pool, coping and cascade
    [TRAJAN.x - 3.0, TRAJAN.zLow - 3.0, TRAJAN.x + 3.0, TRAJAN.zLow + 3.0], // pedestal
    [TRAJAN.x - 2.2, TRAJAN.zUp - 2.2, TRAJAN.x + 2.2, TRAJAN.zUp + 2.2], // base of the upper half
  ],
};
