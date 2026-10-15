/* Performance layer. Loaded before the app: each js/ part is passed through __PERF.js(source, partName) after translation.
   Every patch is an exact-text replacement; if a teammate rewrites that line the patch simply does not apply (see __PERF.report).
   What it fixes (measured on the live hall: 8.8 M triangles drawn per frame, 13.4 M on shadow frames, twice a second):
     - statues were always upgraded to their 200-360 k-triangle detailed mesh; now only when the camera is near / focused (level of detail)
     - the glass roof used `transmission`, which makes three.js render the whole scene a second time every frame
     - the 4096 px sun shadow map was redrawn every 30 frames; now 3072 px and only when something changed (or every ~10 s)
     - antialias:true allocated a multisampled buffer that the post-processing chain never used
     - pixel ratio was up to 2 (4x the pixels of a normal screen); now 1.5, and lowered automatically when frames get slow
     - the hall kept rendering at full rate behind the opaque lobby / embedded gallery
*/
(function () {
  var PATCHES = [
    // [part, find, replace, label]
    ['04-scene.js', "antialias: true, powerPreference: 'high-performance'", "antialias: false, powerPreference: 'high-performance'", 'no unused MSAA buffer'],
    ['04-scene.js', "renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 2));", "renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.25 : 1.5));", 'pixel ratio cap (start)'],
    ['04-scene.js', "transmission: 0.35, thickness: 0.14, ior: 1.45,", "", 'glass roof: drop transmission pass'],
    ['04-scene.js', "const SHADOW_RES = isSmall() ? 2048 : 4096;", "const SHADOW_RES = isSmall() ? 1536 : 3072;", 'shadow map size'],
    ['10-main.js', "renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall() ? 1.5 : 2));", "renderer.setPixelRatio(window.__prNow ? window.__prNow() : Math.min(window.devicePixelRatio || 1, isSmall() ? 1.25 : 1.5)); if (window.__prNow) composer.setPixelRatio(window.__prNow());", 'pixel ratio cap (resize)'],
    ['10-main.js', "renderer.shadowMap.needsUpdate = tweens.length > 0 || shadowTick === 0;", "renderer.shadowMap.needsUpdate = renderer.shadowMap.needsUpdate || tweens.length > 0 || shadowTick === 0;", 'shadow: keep pending updates'],
    ['10-main.js', "shadowTick = (shadowTick + 1) % 30;", "shadowTick = (shadowTick + 1) % 600;", 'shadow: refresh every ~10 s, not 0.5 s'],
    ['10-main.js', "if (Atlas.isOpen || Group.isOpen) return;", "if (Atlas.isOpen || Group.isOpen) return; if (document.body.classList.contains('intro-on') || document.body.classList.contains('gallery-on')) { window.__lobbyTick = (window.__lobbyTick || 0) + 1; if (window.__lobbyTick % 15) return; }", 'hall: idle while the lobby / gallery covers it'],
    ['10-main.js', "const wave = document.getElementById('wave'); if (wave) Sound.drawWave(wave);", "const wave = document.getElementById('wave'); if (wave && wave.offsetParent) Sound.drawWave(wave);", 'sound wave only when visible'],
    ['05-seq.js', "if (!p || !vp || !vp.fig || vp.work !== p.work) return;\n  const fig = vp.fig, mesh = await detailedMeshOf(p.work);", "if (!p || !vp || !vp.fig || vp.work !== p.work) return;\n  if (window.__lodGate && !window.__lodGate(vp)) return;\n  const fig = vp.fig, mesh = await detailedMeshOf(p.work);", 'level of detail: gate the detailed mesh'],
  ];

  /* Appended to the end of 10-main.js, so it runs inside the app module and can see renderer, composer, V, S, camera... */
  function moduleCode() {
    try {
      /* 1. level of detail: a statue gets its detailed mesh only while the camera is near it (or it is focused) */
      var NEAR = 11, FAR = 14, tmp = new THREE.Vector3(), busy = false;
      var dist = function (vp) { vp.fig.getWorldPosition(tmp); return camera.position.distanceTo(tmp); };
      window.__lodGate = function (vp) { return !!vp && !!vp.fig && (vp === focusedSculpture || dist(vp) < NEAR); };
      var lodStep = async function () {
        if (busy) return; busy = true;
        try {
          for (var i = 0; i < V.length; i++) {
            var vp = V[i], p = S.pos[i];
            if (!vp || !vp.fig || !p || vp.work !== p.work) continue;
            var d = dist(vp), keep = vp === focusedSculpture;
            if (!vp.fig.userData.detail && (keep || d < NEAR)) await refineFigure(i, p);
            else if (vp.fig.userData.detail && !keep && d > FAR) {
              var base = await meshOf(vp.work);
              if (vp.fig && vp.fig.userData.detail && vp.work === p.work && V.indexOf(vp) === i) {
                vp.fig.geometry = base.geo; vp.fig.userData.detail = false; vp.bounds = base.bounds;
                renderer.shadowMap.needsUpdate = true; updateHallQuality();
              }
            }
          }
        } catch (e) { /* keep going */ } finally { busy = false; }
      };
      setInterval(function () { if (!document.hidden && !document.body.classList.contains('intro-on')) lodStep(); }, 500);

      /* 2. adaptive resolution: if frames get slow, lower the render resolution step by step (never raised again in the same session) */
      var pr = renderer.getPixelRatio(), avg = 16.7, last = performance.now(), cool = 0;
      window.__prNow = function () { return pr; };
      var apply = function (v) {
        pr = v; if (typeof Cam !== 'undefined' && Cam.quality) return;
        var w = window.innerWidth, h = window.innerHeight;
        renderer.setPixelRatio(v); composer.setPixelRatio(v); renderer.setSize(w, h, false); composer.setSize(w, h);
        try { bloom.setSize(w, h); } catch (e) { /* no bloom */ }
      };
      var tick = function (now) {
        requestAnimationFrame(tick);
        var dt = now - last; last = now;
        var covered = document.hidden || document.body.classList.contains('intro-on') || document.body.classList.contains('gallery-on') || (Atlas && Atlas.isOpen) || (Group && Group.isOpen);
        if (covered || dt > 400) { avg = 16.7; return; }
        avg = avg * 0.95 + dt * 0.05;
        if (avg > 27 && pr > 0.7 && now > cool) { apply(Math.max(0.7, Math.round(pr * 82) / 100)); cool = now + 3000; avg = 16.7; }
      };
      requestAnimationFrame(tick);
    } catch (e) { console.warn('perf layer:', e); }
  }

  var report = [];
  window.__PERF = {
    report: report,
    js: function (src, part) {
      for (var i = 0; i < PATCHES.length; i++) {
        var p = PATCHES[i]; if (p[0] !== part) continue;
        var find = p[1], rep = p[2], at = src.indexOf(find);
        if (at < 0 && find.indexOf('\n') >= 0) { find = find.replace(/\n/g, '\r\n'); rep = rep.replace(/\n/g, '\r\n'); at = src.indexOf(find); } // files saved with Windows line endings
        if (at >= 0) { src = src.slice(0, at) + rep + src.slice(at + find.length); report.push([p[3], true]); } else report.push([p[3], false]);
      }
      if (part === '10-main.js') src += '\n(' + moduleCode.toString() + ')();\n';
      return src;
    }
  };
})();
