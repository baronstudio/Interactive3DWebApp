import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { Engine } from './3DEngine.js';
import { HotspotUI } from './HotspotUI.js';

async function loadConfig() {
  try {
    const res = await fetch('./config.json');
    if (!res.ok) throw new Error('config.json not found');
    return await res.json();
  } catch (e) {
    // default config
    return {
      glbPath: 'Model3D/model.glb',
      fallbackGlb: 'https://threejs.org/examples/models/gltf/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
      bgTop: '#aee1ff',
      bgBottom: '#ffffff'
    };
  }
}

(async () => {
  const cfg = await loadConfig();
  // expose cfg for debugging
  window.__APP_CFG = cfg;

  // global variables requested
  window.GLB_PATH = cfg.glbPath;
  window.BG_COLOR_TOP = cfg.bgTop;
  window.BG_COLOR_BOTTOM = cfg.bgBottom;
  window.CAMERA_ZOOM = typeof cfg.cameraZoom === 'number' ? cfg.cameraZoom : 0;

  // apply CSS variables for background gradient
  document.documentElement.style.setProperty('--bg-top', window.BG_COLOR_TOP);
  document.documentElement.style.setProperty('--bg-bottom', window.BG_COLOR_BOTTOM);

  const container = document.getElementById('viewer');
  const engine = new Engine(container, cfg);

  // instantiate hotspots UI
  const hotspots = new HotspotUI(engine, { showList: cfg.DysplayHotSpotListe });

  // attempt to load model (user may place GLB into Model3D folder)
  try {
    const model = await engine.loadModel(window.GLB_PATH);
    console.log('Model loaded:', window.GLB_PATH);

    // instantiate animation controller if animations configured
    if (Array.isArray(cfg.animations) && cfg.animations.length) {
      try {
        const { AnimationController } = await import('./AnimationController.js');
        const animCtrl = new AnimationController(engine, cfg.animations);
        // expose for debugging
        window.__ANIM_CTRL = animCtrl;
      } catch (e) {
        console.warn('Failed to init AnimationController', e);
      }
    }

    // create hotspots from config if present
    if (Array.isArray(cfg.hotspots) && cfg.hotspots.length) {
      for (const h of cfg.hotspots) {
        try {
          let pos = null;
          if (h.objectName && model.getObjectByName) {
            const obj = model.getObjectByName(h.objectName);
            if (obj) {
              pos = new THREE.Vector3();
              obj.getWorldPosition(pos);
            }
          }
          if (!pos && Array.isArray(h.position) && h.position.length === 3) {
            pos = new THREE.Vector3(h.position[0], h.position[1], h.position[2]);
          }
          if (!pos) {
            // fallback to model center
            const box = new THREE.Box3().setFromObject(model);
            pos = box.getCenter(new THREE.Vector3());
          }
          hotspots.addHotspot(h.id || h.title || `hot_${Math.random().toString(36).slice(2,8)}`,
            pos,
            {
              title: h.title || h.id,
              color: h.color || undefined,
              opacity: (h.opacity !== undefined) ? h.opacity : undefined,
              size: h.size || undefined,
              showLabelOnHover: !!h.showLabelOnHover,
              content: h.content || undefined,
              contentMode: h.contentMode || 'text',
              distance: h.distance || undefined
            }
          );
        } catch (e) {
          console.warn('Failed to create hotspot', h, e);
        }
      }
    } else {
      // add example hotspot at model center when no config
      try {
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        hotspots.addHotspot('center', center, { title: 'Centre du modèle' });
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    console.warn('Model load failed for', window.GLB_PATH, e.message);
    // try fallback from config
    const fallback = cfg.fallbackGlb || 'https://threejs.org/examples/models/gltf/DamagedHelmet/glTF-Binary/DamagedHelmet.glb';
    try {
      console.log('Attempting fallback model:', fallback);
      const model = await engine.loadModel(fallback);
      console.log('Fallback model loaded:', fallback);
      try {
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        hotspots.addHotspot('center', center, { title: 'Centre du modèle' });
      } catch (e2) {}
    } catch (e2) {
      console.warn('Fallback model load failed:', e2.message);
    }
  }
})();
