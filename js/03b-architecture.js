/* Lifecycle compatibility for the removed website-generated space.
   No geometry is created or classified by colour/height/size. VA_Hall_Scan and
   interactive sequence groups are never passed to this source-specific policy. */
function createArchitectureDisplay(parent, renderer) {
  function apply() {
    parent.removeFromParent();
    scene.background = ExhibitionEnvelope.background;
    scene.fog = null;
    renderer.setClearColor(ExhibitionEnvelope.background, 1);
    if (canvas.dataset.vaHallScan === 'ready') VAHallScan.applyMaterials();
    renderer.shadowMap.needsUpdate = true;
  }
  return { apply, refreshShadows: apply, removed: true, source: 'website-procedural-space' };
}
