import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

// AnimationController
// - engine: instance of Engine (provides scene, camera, renderer)
// - animationsCfg: array of animation control entries from config.json
// Each entry example:
// {
//   id: 'door_open',
//   objectName: 'Door_01',        // target object/node name (optional — actions may target whole scene)
//   clipName: 'Open',            // clip name from glTF.animations (optional -> first clip)
//   speed: 1.0,
//   loop: 'loop'|'once'|'pingpong',
//   autoplay: false,
//   hotspotTrigger: 'door'       // hotspot id that will trigger this animation
// }

export class AnimationController {
  constructor(engine, animationsCfg = []) {
    this.engine = engine;
    this.cfg = Array.isArray(animationsCfg) ? animationsCfg : [];
    this._mixers = new Map(); // id -> THREE.AnimationMixer
    this._actions = new Map(); // id -> THREE.AnimationAction
    this._playing = new Set();

    // listen for hotspot click events to trigger animations
    this._onHotspotClick = (e) => {
      const hid = e && e.detail && e.detail.id;
      if (!hid) return;
      for (const a of this.cfg) {
        if (a.hotspotTrigger && a.hotspotTrigger === hid) {
          // toggle or play depending on mode
          this.play(a.id);
        }
      }
    };
    document.addEventListener('hotspot:click', this._onHotspotClick);

    // init if model is already loaded
    if (this.engine && this.engine._lastGltf) this._setupFromGltf(this.engine._lastGltf);
  }

  _setupFromGltf(gltf) {
    const model = gltf.scene || gltf.scenes && gltf.scenes[0] || this.engine.scene;
    const clips = Array.isArray(gltf.animations) ? gltf.animations : [];

    // build map of clips by name for lookup
    const clipMap = new Map();
    clips.forEach((c) => { if (c && c.name) clipMap.set(c.name, c); });

    for (const aCfg of this.cfg) {
      const aid = aCfg.id || (aCfg.objectName || aCfg.clipName || Math.random().toString(36).slice(2,8));
      // find target object
      let target = model;
      if (aCfg.objectName) {
        const found = model.getObjectByName ? model.getObjectByName(aCfg.objectName) : null;
        if (found) target = found;
      }

      // choose clip
      let clip = null;
      if (aCfg.clipName && clipMap.has(aCfg.clipName)) clip = clipMap.get(aCfg.clipName);
      else if (clips.length === 1) clip = clips[0];
      else if (clips.length > 0) clip = clips.find((c) => c.name && c.name.toLowerCase().includes((aCfg.clipName||'').toLowerCase())) || clips[0];

      if (!clip) {
        console.warn('AnimationController: no clip found for', aCfg);
        continue;
      }

      const mixer = new THREE.AnimationMixer(target);
      const action = mixer.clipAction(clip, target);

      // loop modes
      const loopMode = (aCfg.loop || 'loop').toLowerCase();
      if (loopMode === 'once') action.setLoop(THREE.LoopOnce, 0);
      else if (loopMode === 'pingpong') action.setLoop(THREE.LoopPingPong, Infinity);
      else action.setLoop(THREE.LoopRepeat, Infinity);

      // speed
      action.timeScale = (typeof aCfg.speed === 'number') ? aCfg.speed : 1.0;

      // clamp when finished for once behaviors
      if (loopMode === 'once') action.clampWhenFinished = true;

      // store
      this._mixers.set(aid, mixer);
      this._actions.set(aid, action);

      // autoplay
      if (aCfg.autoplay) {
        action.play();
        this._playing.add(aid);
      }
    }

    // ensure engine updates our mixers
    if (this._tickBound !== true) {
      this._tickBound = true;
      const update = (dt) => {
        for (const m of this._mixers.values()) m.update(dt);
      };
      // hook into engine's animate loop by wrapping engine.animate? Simpler: poll with requestAnimationFrame
      let prev = performance.now();
      const raf = (now) => {
        const dt = (now - prev) / 1000;
        prev = now;
        update(dt);
        this._rafId = requestAnimationFrame(raf);
      };
      this._rafId = requestAnimationFrame(raf);
    }
  }

  play(id) {
    const action = this._actions.get(id);
    if (!action) return console.warn('AnimationController.play: unknown id', id);
    action.paused = false;
    action.reset();
    action.play();
    this._playing.add(id);
  }

  stop(id) {
    const action = this._actions.get(id);
    if (!action) return;
    action.stop();
    this._playing.delete(id);
  }

  pause(id) {
    const action = this._actions.get(id);
    if (!action) return;
    action.paused = true;
  }

  setSpeed(id, speed) {
    const action = this._actions.get(id);
    if (!action) return;
    action.timeScale = speed;
  }

  setLoop(id, mode) {
    const action = this._actions.get(id);
    if (!action) return;
    if (mode === 'once') action.setLoop(THREE.LoopOnce, 0);
    else if (mode === 'pingpong') action.setLoop(THREE.LoopPingPong, Infinity);
    else action.setLoop(THREE.LoopRepeat, Infinity);
  }

  dispose() {
    document.removeEventListener('hotspot:click', this._onHotspotClick);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._mixers.clear();
    this._actions.clear();
    this._playing.clear();
  }
}
