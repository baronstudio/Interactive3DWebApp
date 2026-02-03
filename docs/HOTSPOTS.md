# Documentation des Hotspots

Ce document décrit le format de configuration et l'utilisation des "hotspots" (points d'intérêt) pour l'application Interactive3DWebApp.

## Emplacement
- Les hotspots peuvent être déclarés dans `config.json` sous la clé `hotspots` (tableau).
- Optionnellement, vous pouvez demander un fichier séparé (non implémenté par défaut) si vous préférez séparer la configuration.

## Exemple (extrait de `config.json`)

```json
"DysplayHotSpotListe": true,
"hotspots": [
  {
    "id": "door",
    "title": "Porte principale",
    "objectName": "Door_01",
    "position": null,
    "color": "#00ccff",
    "opacity": 0.95,
    "size": 22,
    "showLabelOnHover": true,
    "contentMode": "md",
    "content": "**Porte principale**\nCliquez pour plus de détails.",
    "distance": 2.5
  }
]
```

Dans `config.json` vous pouvez aussi définir des options globales utiles :

```json
"showHotspotId": false,
"showHotspotTitle": false,
```

Ces options contrôlent l'affichage par défaut des identifiants et titres des hotspots dans la liste et les labels. Elles peuvent être outrepassées par hotspot individuel (voir ci-dessous).

## Champs disponibles
- `id` (string) : identifiant unique du hotspot.
- `title` (string) : texte court affiché dans la liste et comme label du hotspot.
- `objectName` (string|null) : nom d'un objet dans le modèle GLB. Si fourni et trouvé, le hotspot sera positionné sur cet objet.
- `position` (array|null) : coordonnée 3D explicite `[x,y,z]` (utilisée si `objectName` non fournie ou non trouvée).
- `color` (string) : couleur du point (ex. `#FF5000`).
- `opacity` (number) : 0..1 pour l'opacité du point.
- `size` (number) : taille en pixels du point (dot).
- `showLabelOnHover` (boolean) : si `true`, le label/popup n'apparaît que lors du survol.
- `contentMode` (string) : `text` (par défaut), `html`, ou `md` (markdown minimal).
- `content` (string) : contenu du popup (texte, HTML ou markdown selon `contentMode`).
- `distance` (number) : distance souhaitée entre la caméra et le hotspot lors du `focusOn` (optionnel).
 - `showId` (boolean) : (optionnel) override par-hotspot pour afficher l'`id` dans la liste/UI.
 - `showTitle` (boolean) : (optionnel) override par-hotspot pour afficher le `title` dans la liste/UI.

## Règles de positionnement
1. Si `objectName` est fourni et l'objet existe dans la hiérarchie du modèle, on utilise la position monde de cet objet.
2. Sinon si `position` est fournie, on l'utilise.
3. Sinon on positionne le hotspot au centre de la boîte englobante du modèle.

## API runtime (module `HotspotUI`)
- `hotspots.addHotspot(id, worldPos, options)` : ajoute un hotspot à la volée (worldPos peut être `THREE.Vector3` ou `[x,y,z]`).
- `hotspots.removeHotspot(id)` : supprime un hotspot.
- `hotspots.focusOn(pos, opts)` : recentre la caméra sur `pos` (options : `distance`, `duration`).
- `hotspots.dispose()` : nettoie l'overlay et arrête la mise à jour.

Note : `HotspotUI` est instancié automatiquement dans `src/main.js` et lit `cfg.hotspots`.

## Listes et UI
- Activez l'affichage du panneau listant les hotspots via la clé `DysplayHotSpotListe: true`.
- La liste est dynamique : elle affiche les hotspots présents et propose un bouton pour supprimer chaque item et un bouton pour recentrer la vue.

### Bascule d'affichage ID/Title

L'affichage de l'`id` et du `title` est contrôlé par les options globales `showHotspotId` et `showHotspotTitle` dans `config.json`. Exemple :

```json
"showHotspotId": false,
"showHotspotTitle": false
```

Par défaut ces deux valeurs sont `false` (invisible). Pour un contrôle plus fin, chaque hotspot peut définir `showId` et/ou `showTitle` dans sa configuration pour outrepasser le comportement global.

Exemple : rendre le titre visible uniquement pour un hotspot précis

```json
{
  "id": "door",
  "title": "Porte principale",
  "showTitle": true
}
```

## Contenu HTML vs Markdown et chargement différé

- `text` : texte simple, pas de mise en forme.
- `contentMode: "html"` : le HTML est injecté via `innerHTML` — attention aux risques XSS si le contenu provient d'une source non fiable.
- `contentMode: "md"` : rendu Markdown minimal (`**bold**`, `*italic*`, sauts de ligne). Pour un rendu complet, on peut intégrer une librairie (ex. `marked`).

### Chargement différé (URLs) et comportement au clic

- Si `content` contient une URL (commençant par `http://` ou `https://`) et que `contentMode` vaut `html` ou `md`, le contenu distant n'est **pas** chargé au survol : il est récupéré (fetch) uniquement au clic sur le hotspot. Le popup s'ouvre alors et affiche le contenu récupéré.
- Lorsque le contenu est chargé depuis une URL, `showLabelOnHover` est ignoré : l'ouverture se fait au clic pour éviter des chargements réseau indésirables au simple survol.
- Pour un contenu fourni inline (chaîne `content`), le comportement respecte `showLabelOnHover` : survol pour afficher si activé, sinon affichage par défaut ou au clic selon la configuration.

### Comportement des popups

- Les popups distants sont ouverts/fermés par clic. Un clic en dehors de l'overlay ferme le popup ouvert.
- Ouvrir un nouveau popup fermera automatiquement l'ancien.

### Limitations et recommandations

- CORS : le `fetch` d'une page distante pour remplir un popup peut être bloqué par la politique CORS du serveur distant — dans ce cas, le chargement échouera.
- Injection HTML : injecter du HTML distant avec `innerHTML` peut provoquer des conflits CSS, scripts non exécutés ou risques de sécurité. Pour isoler le rendu, l'usage d'un `iframe` est recommandé.
- Option `iframe` : l'implémentation actuelle n'intègre pas automatiquement `contentMode: "iframe"`. Si vous souhaitez charger une page distante isolée (comportement plus robuste pour des sites externes), je peux ajouter le support `iframe` qui créera un élément `iframe` dans le popup et chargera la `content` URL.

### Support `iframe` (nouveau)

- `contentMode: "iframe"` crée un `iframe` dans le popup et charge la `content` fournie.
- Si `content` est une URL, le `src` est défini au clic (chargement différé) pour éviter les préchargements indésirables.
- Si `content` est du HTML inline, il est placé dans l'`iframe` via `srcdoc`.
- L'`iframe` est créé avec un `sandbox` par défaut (`allow-same-origin allow-scripts allow-popups`) et `referrerpolicy="no-referrer"` pour limiter les risques. Si vous souhaitez modifier ces attributs, je peux ajouter une option `iframeAttrs` dans `config.json`.

Exemple de hotspot `iframe` :

```json
{
  "id": "doc1",
  "title": "Page externe",
  "contentMode": "iframe",
  "content": "https://example.com/page.html",
  "showLabelOnHover": false
}
```

Remarque : l'`iframe` isole le CSS/JS du document hôte, mais ne contourne pas les restrictions CORS si le site distant refuse d'être affiché en `iframe` (politique `X-Frame-Options` ou `Content-Security-Policy` frame-ancestors). Dans ces cas, l'iframe ne chargera pas la page.

### Auto-redimensionnement des popups et iframes

Nous pouvons automatiquement redimensionner les popups (contenu inline) et les `iframe` pour éviter les ascenseurs inutiles. Selon le cas d'usage il existe des limites techniques :

- Inline HTML/MD (contenu injecté dans un `div` popup) : totalement pris en charge. Le parent peut mesurer le contenu (`element.scrollHeight`) et ajuster la hauteur du popup. Utiliser `ResizeObserver` permet de suivre les changements dynamiques (images chargées, contenu asynchrone) et régler la hauteur automatiquement. Exemple : limiter à `max-height: 80vh` et réduire si le contenu est plus petit.

- `iframe` same-origin (page sur la même origine que le viewer) : possible. Le parent peut lire `iframe.contentWindow.document.body.scrollHeight` à l'événement `load` et appliquer `iframe.style.height`. On peut aussi utiliser `ResizeObserver` côté parent si la page change dynamiquement.

- `iframe` cross-origin (page externe) : restreint par la politique de même origine. Solutions possibles :
  1. PostMessage coopératif (recommandé) : ajouter dans la page distante un script qui calcule sa hauteur et l'envoie au parent via `window.parent.postMessage({ type:'hotspot-height', height }, '*')`. Le parent écoute et ajuste l'iframe. Nécessite de pouvoir modifier la page distante ou d'un accord avec le fournisseur.
  2. Fallback UI : appliquer une `max-height` raisonnable (ex. `60-80vh`) et laisser `overflow:auto` sur l'iframe ou sur le popup wrapper. C'est le comportement le plus sûr lorsque la page distante ne coopère pas.
  3. Proxy/injection côté serveur : récupérer la page distante côté serveur et l'injecter inline (ou via `srcdoc`) — contourne l'origine mais soulève des questions de sécurité et de conformité (CSP, copyright).

Exemple minimal à ajouter dans une page distante pour communiquer la hauteur (postMessage) :

```html
<script>
  function sendHeight() {
    const h = document.body.scrollHeight || document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'hotspot-height', height: h }, '*');
  }
  // envoyer au chargement et lors de changements
  window.addEventListener('load', sendHeight);
  new ResizeObserver(sendHeight).observe(document.body);
</script>
```

Et côté parent (`HotspotUI`) : écouter le message et mettre à jour la taille de l'iframe :

```javascript
window.addEventListener('message', (ev) => {
  if (!ev.data || ev.data.type !== 'hotspot-height') return;
  const h = Number(ev.data.height) || 0;
  // retrouver l'iframe lié (par exemple via data-attr sur l'iframe ou popup)
  // puis appliquer : iframe.style.height = Math.min(h, window.innerHeight * 0.8) + 'px';
});
```

Recommandations pratiques :
- Activer l'auto-resize pour les popups inline par défaut. C'est sûr et améliore l'UX.
- Pour les iframes, tenter la mesure same-origin puis écouter `postMessage` pour cross-origin, et retomber sur `max-height` si aucune réponse n'arrive.
- Ajouter une option `allowIframeAutoResize` / `iframeAttrs` dans `config.json` pour contrôler le comportement et les attributs du `iframe` (sandbox, allow, etc.).


## Styling
- Le CSS des hotspots se trouve injecté par le module (`.hotspot`, `.dot`, `.pulse`, `.label`, `.popup`). Vous pouvez surcharger ces styles dans `index.html` ou ajouter un fichier CSS.

## Bonnes pratiques
- Préférer `objectName` quand vous souhaitez cibler précisément une partie du modèle (vérifiez les noms avec un viewer glTF si nécessaire).
- Eviter de fournir du HTML provenant d'utilisateurs non fiables (préférer Markdown ou contenu serveur filtré).

## Prochaines évolutions possibles
- Chargement depuis un fichier `hotspots.json` séparé.
- Intégration d'une librairie Markdown complète.
- Support d'icônes personnalisées au lieu du point rond.
- Callbacks JS à l'ouverture d'un popup.

---
Fichier de référence : `config.json` (clefs `DysplayHotSpotListe` et `hotspots`).
