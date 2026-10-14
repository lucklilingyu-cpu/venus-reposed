/* Lifecycle compatibility for the removed website-generated space.
   No geometry is created or classified by colour/height/size. VA_Hall_Scan and
   interactive sequence groups are never passed to this source-specific policy. */
function createArchitectureDisplay(parent, renderer) {
  function apply() {
    parent.removeFromParent();
    scene.background = ExhibitionEnvelope.background;
    scene.fog = null;
    renderer.setClearColor(ExhibitionEnvelope.background, 1);
    if (canvas.dataset.vaHallScan === 'ready') {
      VAHallScan.applyMaterials(); // restore role baselines before each adjustment
      const materials = new Set();
      VAHallScan.group.traverse(object => {
        if (!object.isMesh) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material?.userData.scanRole) materials.add(material);
        }
      });
      for (const material of materials) {
        material.opacity *= 0.7;
        if (!material.transparent) { material.transparent = true; material.needsUpdate = true; }
        material.depthWrite = false;
      }
      canvas.dataset.scanOpacityFactor = '0.7';
    }
    renderer.shadowMap.needsUpdate = true;
  }
  return { apply, refreshShadows: apply, removed: true, source: 'website-procedural-space' };
}
