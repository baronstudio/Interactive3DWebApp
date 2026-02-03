import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.158.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/DRACOLoader.js';

export class Engine {
  constructor(container, config = {}) {
    this.container = container;
    this.config = config;
    this.showAxes = !!config.showAxes;
    // cameraZoom: 0..100 where 0=no change, 100 = zoom x100 (objects appear 100x larger)
    const v = typeof config.cameraZoom === 'number' ? Math.max(0, Math.min(100, config.cameraZoom)) : 0;
    // compute zoomFactor such that v=0 => 1, v=100 => 100
    this.cameraZoomFactor = 1 + 0.99 * v;

    this.scene = new THREE.Scene();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0); // transparent so CSS gradient shows
    // Lighting: follow new three.js defaults (do not set deprecated flags here).
    // Color management: use outputColorSpace instead of outputEncoding
    if (THREE.SRGBColorSpace !== undefined) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else {
      // fallback for older three versions
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }
    this.renderer.domElement.style.display = 'block';

    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // Make orbit (rotate) use middle mouse button
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.DOLLY
    };
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7.5);
    this.scene.add(dir);

    window.addEventListener('resize', () => this.resize());

    this.mixers = [];
    this._clock = new THREE.Clock();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  async loadModel(glbPath) {
    if (!glbPath) throw new Error('glbPath required');

    const loader = new GLTFLoader();
    // optional: enable Draco if available
    try {
      const draco = new DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      loader.setDRACOLoader(draco);
    } catch (e) {
      // ignore
    }

    const gltf = await new Promise((resolve, reject) => {
      loader.load(glbPath, resolve, undefined, reject);
    });

    // Clear previous content (keep renderer and DOM) and reset mixers
    this.mixers = [];
    this.scene.clear();
    // re-add lights (hemisphere + ambient + directional)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7.5);
    this.scene.add(dirLight);

    const model = gltf.scene || gltf.scenes[0];

    // Ensure PBR materials remain correct and fix texture color spaces
    model.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((mat) => {
          if (!mat) return;
          mat.needsUpdate = true;

          // Color textures that should use sRGB
          const colorMaps = ['map', 'emissiveMap', 'lightMap', 'aoMap'];
          colorMaps.forEach((k) => {
            const tex = mat[k];
            if (tex) {
              if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
              else tex.encoding = THREE.sRGBEncoding;
            }
          });

          // Non-color textures should remain linear (normal/metalness/roughness/displacement/bump)
          const linearMaps = ['metalnessMap', 'roughnessMap', 'normalMap', 'displacementMap', 'bumpMap'];
          linearMaps.forEach((k) => {
            const tex = mat[k];
            if (tex) {
              // If colorSpace API exists, set to Linear (no-op for older versions)
              if (tex.colorSpace !== undefined && THREE.LinearSRGBColorSpace !== undefined) {
                tex.colorSpace = THREE.LinearSRGBColorSpace;
              }
            }
          });
        });
      }
    });

    this.scene.add(model);

    // Diagnostic: compute bounding box and log
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    console.log('Model bounding box size:', size, 'center:', center);

    // Add axes helper only when explicitly enabled in config
    if (this.showAxes) {
      try {
        // remove previous
        const prev = this.scene.getObjectByName('debug-axes');
        if (prev) this.scene.remove(prev);
        const axes = new THREE.AxesHelper(Math.max(size.x || 1, size.y || 1, size.z || 1) * 1.5);
        axes.name = 'debug-axes';
        this.scene.add(axes);
      } catch (e) {
        // ignore
      }
    }

    // If the model has effectively zero size, place a default camera
    const maxSize = Math.max(size.x, size.y, size.z);
    if (!isFinite(maxSize) || maxSize === 0) {
      console.warn('Loaded model bounding box is empty or invalid — using default camera placement.');
      this.camera.position.set(0, 1.5, 3);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    } else {
      // fit camera to model
      this.fitCameraToObject(model, { offset: 1.5, phi: Math.PI / 4, theta: -Math.PI / 4 });
    }

    // store last gltf for external controllers to access clips
    this._lastGltf = gltf;
    // NOTE: do not auto-play animations here — AnimationController will manage playback.
    // final camera fit (already handled above depending on bbox)

    return model;
  }

  fitCameraToObject(object, { offset = 1.25, phi = Math.PI / 4, theta = -Math.PI / 4 } = {}) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxSize = Math.max(size.x, size.y, size.z);
    const fitHeightDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)));
    // apply offset and camera zoom factor: larger cameraZoomFactor => closer camera (zoom in)
    let distance = fitHeightDistance * offset;
    if (this.cameraZoomFactor && this.cameraZoomFactor > 1) {
      distance = distance / this.cameraZoomFactor;
    }

    // spherical to cartesian
    const x = distance * Math.sin(phi) * Math.cos(theta);
    const y = distance * Math.cos(phi);
    const z = distance * Math.sin(phi) * Math.sin(theta);

    this.camera.position.set(center.x + x, center.y + y, center.z + z);
    this.camera.near = Math.max(0.1, maxSize / 1000);
    this.camera.far = Math.max(1000, distance * 10 + maxSize * 10);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.update();
  }

  animate() {
    const delta = this._clock.getDelta();
    if (this.mixers.length) this.mixers.forEach((m) => m.update(delta));

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }

  resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
