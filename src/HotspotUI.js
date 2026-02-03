import * as THREE from 'https://unpkg.com/three@0.158.0/build/three.module.js';

export class HotspotUI {
  constructor(engine, options = {}) {
    this.engine = engine; // expects instance of Engine with camera, renderer, controls
    this.container = engine.container;
    this.hotspots = new Map();
    this.showList = options.showList || !!(engine.config && engine.config.DysplayHotSpotListe);
    // global toggles for showing id/title (default false to keep infos hidden)
    this.showIdGlobal = !!(engine.config && engine.config.showHotspotId);
    this.showTitleGlobal = !!(engine.config && engine.config.showHotspotTitle);

    // create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'hotspot-overlay';
    Object.assign(this.overlay.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none'
    });
    this.container.style.position = this.container.style.position || 'relative';
    this.container.appendChild(this.overlay);

    this._injectStyles();

    if (this.showList) this._createListUI();

    this._update = this._update.bind(this);
    this._running = true;
    this._openPopup = null;
    this._onDocClick = (e) => { if (!this.overlay.contains(e.target)) this._closeOpenPopup(); };
    document.addEventListener('click', this._onDocClick);
    requestAnimationFrame(this._update);
  }

  _injectStyles() {
    if (document.getElementById('hotspot-ui-styles')) return;
    const s = document.createElement('style');
    s.id = 'hotspot-ui-styles';
    s.textContent = `
  .hotspot { position: absolute; transform: translate(-50%, -50%); pointer-events: auto; }
  .hotspot .dot { width: 18px; height: 18px; border-radius: 50%; background: rgba(255,80,0,0.95); box-shadow: 0 0 6px rgba(0,0,0,0.4); border:2px solid white; }
  .hotspot .pulse { position:absolute; left:50%; top:50%; width:40px; height:40px; transform:translate(-50%,-50%); border-radius:50%; background: rgba(255,80,0,0.15); animation: pulse 1.6s infinite; }
  .hotspot .label { margin-top:6px; background: rgba(0,0,0,0.6); color: white; padding:6px 8px; border-radius:6px; font-size:13px; white-space:nowrap; }
  .hotspot .popup { max-width: 320px; max-height: 40vh; overflow: auto; }
  @keyframes pulse { 0%{transform:translate(-50%,-50%) scale(0.6); opacity:0.9} 100%{transform:translate(-50%,-50%) scale(1.6); opacity:0} }
  `;
    document.head.appendChild(s);
  }

  addHotspot(id, worldPos, options = {}) {
    if (this.hotspots.has(id)) return this.hotspots.get(id);

    const el = document.createElement('div');
    el.className = 'hotspot';
    el.style.pointerEvents = 'auto';

    const pulse = document.createElement('div'); pulse.className = 'pulse';
    const dot = document.createElement('div'); dot.className = 'dot';
    const label = document.createElement('div'); label.className = 'label';
    const effectiveShowTitle = (options.showTitle !== undefined) ? !!options.showTitle : this.showTitleGlobal;
    label.textContent = options.title || options.label || '';

    // apply style options
    if (options.size) {
      dot.style.width = dot.style.height = `${options.size}px`;
    }
    if (options.color) {
      dot.style.background = options.color;
      // pulse uses semi-transparent variant; try to append 33 if color is hex
      try {
        pulse.style.background = options.color + '33';
      } catch (e) {
        pulse.style.background = 'rgba(255,80,0,0.15)';
      }
    }
    if (options.opacity !== undefined) {
      dot.style.opacity = String(options.opacity);
      pulse.style.opacity = String(Math.min(0.6, options.opacity));
    }

    el.appendChild(pulse);
    el.appendChild(dot);
    if (effectiveShowTitle) {
      if (options.showLabelOnHover === true) {
        // label shown only on hover
        label.style.display = 'none';
        el.addEventListener('mouseenter', () => { label.style.display = 'block'; });
        el.addEventListener('mouseleave', () => { label.style.display = 'none'; });
      }
      el.appendChild(label);
    }

    // popup content (supports deferred load for html/md URLs)
    let popup = null;
    if (options.content) {
      popup = document.createElement('div');
      popup.className = 'label popup';
      popup.style.position = 'absolute';
      popup.style.top = 'calc(100% + 6px)';
      popup.style.left = '50%';
      popup.style.transform = 'translateX(-50%)';
      popup.style.pointerEvents = 'auto';

      const mode = (options.contentMode || 'text').toLowerCase();
      const isUrl = typeof options.content === 'string' && /^(https?:)?\/\//i.test(options.content);

      if (mode === 'iframe') {
        // iframe mode: create an iframe inside the popup. For URL content we defer setting src until click.
        popup.textContent = '';
        popup.style.display = 'none';
        const iframe = document.createElement('iframe');
        iframe.style.width = '320px';
        iframe.style.height = '40vh';
        iframe.style.border = '0';
        iframe.sandbox = 'allow-same-origin allow-scripts allow-popups';
        iframe.setAttribute('referrerpolicy', 'no-referrer');
        // if content is URL, defer load until click to avoid unwanted preloads
        if (isUrl) {
          popup.textContent = 'Chargement...';
          el.appendChild(popup);
          el.addEventListener('click', (ev) => {
            ev.stopPropagation(); ev.preventDefault();
            if (this._openPopup && this._openPopup !== popup) this._closeOpenPopup();
            if (popup.style.display === 'block') { popup.style.display = 'none'; this._openPopup = null; try{ iframe.src = 'about:blank'; }catch(e){} return; }
            // set src and show
            iframe.src = options.content;
            popup.innerHTML = '';
            popup.appendChild(iframe);
            popup.style.display = 'block';
            this._openPopup = popup;
          });
        } else {
          // inline content -> use srcdoc
          iframe.srcdoc = (typeof options.content === 'string') ? options.content : '';
          popup.innerHTML = '';
          popup.appendChild(iframe);
          if (options.showLabelOnHover === true) popup.style.display = 'none';
          else popup.style.display = 'block';
          el.appendChild(popup);
          if (options.showLabelOnHover === true) {
            el.addEventListener('mouseenter', () => { popup.style.display = 'block'; });
            el.addEventListener('mouseleave', () => { popup.style.display = 'none'; });
          }
        }
      } else if ((mode === 'html' || mode === 'md') && isUrl) {
        // defer loading until click; ignore hover option for URL-based content
        popup.textContent = 'Chargement...';
        popup.style.display = 'none';
        el.appendChild(popup);
        el.addEventListener('click', async (ev) => {
          ev.stopPropagation(); ev.preventDefault();
          // close other popup
          if (this._openPopup && this._openPopup !== popup) this._closeOpenPopup();
          if (popup.style.display === 'block') { popup.style.display = 'none'; this._openPopup = null; return; }
          try {
            const resp = await fetch(options.content);
            const text = await resp.text();
            if (mode === 'html') popup.innerHTML = text;
            else popup.innerHTML = this._simpleMarkdown(text);
          } catch (err) {
            popup.textContent = 'Erreur de chargement';
          }
          popup.style.display = 'block';
          this._openPopup = popup;
        });
      } else {
        // immediate content (inline string or non-URL)
        if (mode === 'html') popup.innerHTML = options.content;
        else if (mode === 'md') popup.innerHTML = this._simpleMarkdown(options.content);
        else popup.textContent = options.content;
        if (options.showLabelOnHover === true) popup.style.display = 'none';
        el.appendChild(popup);
        if (options.showLabelOnHover === true) {
          el.addEventListener('mouseenter', () => { popup.style.display = 'block'; });
          el.addEventListener('mouseleave', () => { popup.style.display = 'none'; });
        }
      }
    }

    this.overlay.appendChild(el);

    const pos = (worldPos && worldPos.isVector3) ? worldPos.clone() : (Array.isArray(worldPos) ? new THREE.Vector3(...worldPos) : new THREE.Vector3(0,0,0));

    const data = { id, el, pos, options };
    this.hotspots.set(id, data);

    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      this.focusOn(pos, options);
      // emit a global event so other modules (eg. AnimationController) can react
      try {
        document.dispatchEvent(new CustomEvent('hotspot:click', { detail: { id } }));
      } catch (e) {}
    });

    // helper to close currently open popup
    this._closeOpenPopup = () => {
      if (this._openPopup) {
        try { this._openPopup.style.display = 'none'; } catch (e) {}
        this._openPopup = null;
      }
    };

    if (this.listEl) this._refreshList();

    return data;
  }

  removeHotspot(id) {
    const data = this.hotspots.get(id);
    if (!data) return;
    if (data.el && data.el.parentElement) data.el.parentElement.removeChild(data.el);
    this.hotspots.delete(id);
    if (this.listEl) this._refreshList();
  }

  focusOn(pos, options = {}) {
    // smooth camera move: interpolate position and target
    const cam = this.engine.camera;
    const controls = this.engine.controls;
    const startPos = cam.position.clone();
    const startTarget = controls.target.clone();

    // compute desired camera position: offset back along camera-to-target vector
    const dir = new THREE.Vector3().subVectors(cam.position, controls.target).normalize();
    const distance = (options.distance !== undefined) ? options.distance : 2.5;
    const destPos = new THREE.Vector3().copy(pos).add(dir.multiplyScalar(distance));

    const destTarget = pos.clone();

    const duration = options.duration || 600;
    const t0 = performance.now();
    const animate = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = t * (2 - t);
      cam.position.lerpVectors(startPos, destPos, eased);
      controls.target.lerpVectors(startTarget, destTarget, eased);
      controls.update();
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  _update() {
    if (!this._running) return;
    const rect = this.engine.renderer.domElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const cam = this.engine.camera;

    for (const data of this.hotspots.values()) {
      const ndc = data.pos.clone().project(cam);
      const x = (ndc.x + 1) / 2 * width + rect.left;
      const y = (1 - ndc.y) / 2 * height + rect.top;
      const el = data.el;
      // If behind camera, hide
      if (ndc.z < -1 || ndc.z > 1) {
        el.style.display = 'none';
      } else {
        el.style.display = 'block';
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      }
    }

    requestAnimationFrame(this._update);
  }

  _createListUI() {
    // simple floating panel on the left
    this.listEl = document.createElement('div');
    this.listEl.className = 'hotspot-list';
    Object.assign(this.listEl.style, {
      position: 'absolute',
      left: '12px',
      top: '12px',
      maxHeight: '60vh',
      overflow: 'auto',
      background: 'rgba(255,255,255,0.9)',
      padding: '8px',
      borderRadius: '6px',
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#111'
    });
    const title = document.createElement('div'); title.textContent = 'Hotspots'; title.style.fontWeight = '600'; title.style.marginBottom = '6px';
    this.listEl.appendChild(title);
    this.ul = document.createElement('ul');
    Object.assign(this.ul.style, { listStyle: 'none', padding: 0, margin: 0 });
    this.listEl.appendChild(this.ul);
    this.overlay.appendChild(this.listEl);
    this._refreshList();
  }

  _refreshList() {
    if (!this.ul) return;
    // clear
    this.ul.innerHTML = '';
    for (const [id, data] of this.hotspots) {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.marginBottom = '6px';
      const btn = document.createElement('button');
      // compute label based on per-hotspot or global settings
      const showTitle = (data.options.showTitle !== undefined) ? !!data.options.showTitle : this.showTitleGlobal;
      const showId = (data.options.showId !== undefined) ? !!data.options.showId : this.showIdGlobal;
      let btnText = '';
      if (showTitle && (data.options.title || data.options.label)) btnText = data.options.title || data.options.label;
      else if (showId) btnText = id;
      else btnText = 'Hotspot';
      btn.textContent = btnText;
      Object.assign(btn.style, { marginRight: '8px', cursor: 'pointer' });
      btn.addEventListener('click', () => this.focusOn(data.pos, { distance: data.options.distance || 2.5 }));
      const del = document.createElement('button'); del.textContent = '✕'; del.title='Remove';
      Object.assign(del.style, { marginLeft: 'auto', cursor: 'pointer', background:'none', border:'none' });
      del.addEventListener('click', () => this.removeHotspot(id));
      li.appendChild(btn);
      li.appendChild(del);
      this.ul.appendChild(li);
    }
  }

  _simpleMarkdown(md) {
    // very small subset: **bold**, *italic*, line breaks
    if (!md) return '';
    let s = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  dispose() {
    this._running = false;
    this.hotspots.forEach((h) => { if (h.el.parentElement) h.el.parentElement.removeChild(h.el); });
    if (this.overlay.parentElement) this.overlay.parentElement.removeChild(this.overlay);
    this.hotspots.clear();
    // remove doc click listener
    try { document.removeEventListener('click', this._onDocClick); } catch (e) {}
    this._closeOpenPopup();
  }
}
