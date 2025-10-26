import * as THREE from 'https://esm.sh/three@0.152.2';
import { OrbitControls } from 'https://esm.sh/three@0.152.2/examples/jsm/controls/OrbitControls.js';

// --- Global Variables ---
let renderer, camera, controls, scene;

// --- Get HTML Elements ---
const loadingOverlay = document.getElementById('loading-overlay');
const sceneContainer = document.getElementById('scene-container');

// --- GLOBAL COLLISION INDEX -------------------------------------------------
class SpatialHash {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.map = new Map(); // key: "ix,iy,iz" -> array of [x,y,z]
  }
  _key(x, y, z) {
    const cs = this.cellSize;
    const ix = Math.floor(x / cs), iy = Math.floor(y / cs), iz = Math.floor(z / cs);
    return `${ix},${iy},${iz}`;
  }
  add(p) {
    const k = this._key(p[0], p[1], p[2]);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(p);
  }
  *neighbors(x, y, z) {
    const cs = this.cellSize;
    const ix = Math.floor(x / cs), iy = Math.floor(y / cs), iz = Math.floor(z / cs);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const k = `${ix+dx},${iy+dy},${iz+dz}`;
          const arr = this.map.get(k);
          if (arr) yield arr;
        }
  }
  isFarEnough(p, minDistSq) {
    const [x,y,z] = p;
    for (const bucket of this.neighbors(x,y,z)) {
      for (const q of bucket) {
        const dx = x - q[0], dy = y - q[1], dz = z - q[2];
        if (dx*dx + dy*dy + dz*dz < minDistSq) return false;
      }
    }
    return true;
  }
}
const MIN_GLOBAL_DIST = 1.25; // world units (tweak as needed)
const MIN_GLOBAL_DIST_SQ = MIN_GLOBAL_DIST * MIN_GLOBAL_DIST;
const GLOBAL_INDEX = new SpatialHash(MIN_GLOBAL_DIST);

// --- Main Execution ---
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const word = urlParams.get('word') || 'sample';

  if (!word) {
    loadingOverlay.innerHTML = '<p style="color: red;">Error: No word specified in URL.</p>';
    return;
  }

  console.log(`Received word from URL: ${word}. Loading sample tree.`);
  const loadingText = loadingOverlay.querySelector('p');
  if (loadingText) {
    loadingText.textContent = `Loading sample tree...`;
  }

  try {
    const res = await fetch('trees.json'); // [cite: Cal-Hacks-2025/sampleTree.json]
    if (!res.ok) {
      throw new Error(`Could not load sampleTree.json: ${res.statusText}`);
    }
    const treeData = await res.json();
    console.log('Loaded sampleTree.json data:', treeData);

    initTree(treeData);

    if (sceneContainer && !sceneContainer.classList.contains('hidden') && renderer) {
      requestAnimationFrame(() => {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => {
          if (renderer && scene && camera) {
            renderer.render(scene, camera);
          }
        }, 50);
      });
    } else if (!sceneContainer || !renderer) {
      throw new Error("Scene initialization failed or container not found.");
    }

  } catch (err) {
    console.error('Error during tree generation:', err);
    loadingOverlay.innerHTML = `<p style="color: red;">Error generating tree: ${err.message}</p>`;
    loadingOverlay.classList.remove('hidden');
    if (sceneContainer) sceneContainer.classList.add('hidden');
  }
});

// --- RENDERER INITIALIZATION ---
function initTree(treeData) {
  if (!sceneContainer) {
    console.error("Scene container element not found!");
    if (loadingOverlay) loadingOverlay.innerHTML = '<p style="color: red;">Error: Cannot find scene container.</p>';
    return;
  }

  try {
    const oldCanvas = sceneContainer.querySelector('canvas');
    if (oldCanvas) sceneContainer.removeChild(oldCanvas);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121212);
    camera = new THREE.PerspectiveCamera(50, 2, 0.1, 1000); // temp aspect
    camera.position.set(0, 5, 30);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    sceneContainer.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2.0;
    controls.maxDistance = 50.0;

    renderTree(treeData, scene);

    sceneContainer.classList.remove('hidden');

    requestAnimationFrame(() => {
      const w = Math.max(1, sceneContainer.clientWidth || Math.floor(window.innerWidth * 0.75));
      const h = Math.max(1, sceneContainer.clientHeight || Math.floor(window.innerHeight * 0.75));

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      controls.update();

      if (loadingOverlay) loadingOverlay.classList.add('hidden');

      requestAnimationFrame(() => { if(renderer) renderer.render(scene, camera) });
      setTimeout(() => { if (renderer) renderer.render(scene, camera); }, 60);

      animate();
    });

  } catch (err) {
    console.error('Failed to initialize three.js scene:', err);
    sceneContainer.innerHTML = `<p style="color: red; padding: 20px;">Error initializing 3D view: ${err.message}</p>`;
    sceneContainer.classList.remove('hidden');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
}

// --- Handle window resizing ---
window.addEventListener('resize', () => {
  if (sceneContainer && camera && renderer) {
    const width = sceneContainer.clientWidth;
    const height = sceneContainer.clientHeight;
    if (width > 0 && height > 0) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
  }
});

// --- Animation loop ---
function animate() {
  if (!renderer || !scene || !camera || !controls) return;
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// --- RENDER TREE ---
// NOTE: pass grandparent position for forward-cone at depth >= 2
function renderTree(treeNode, scene, position = [0, 0, 0], depth = 0, prevPos = null) {
  if (!treeNode || !treeNode.word) return;

  new VisualizedWordNode(treeNode.word, scene, position);

  const children = Array.isArray(treeNode.children) ? treeNode.children : [];
  if (children.length === 0) return;

  const gen = generateNextPosition(position, prevPos, depth, children.length);
  for (const child of children) {
    const nextpos = gen.next().value;
    new VisualizedBranch(position, nextpos, scene);
    renderTree(child, scene, nextpos, depth + 1, position);
  }
}

// --- Helper functions and Classes ---
function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

// --- UPDATED createTextSprite FUNCTION ---
function createTextSprite(text, opts = {}) {
  const fontSize = opts.fontSize || 32;
  const font = `${fontSize}px Inter, Arial`;
  const padding = opts.padding || 8;
  const bg = opts.bg || 'rgba(0,0,0,0.6)';
  const color = opts.color || '#ffffff';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = fontSize;
  canvas.width = textWidth + padding * 2;
  canvas.height = textHeight + padding * 2;
  ctx.font = font;
  ctx.textBaseline = 'top';
  const radius = 6;
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, radius);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, padding, padding);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    sizeAttenuation: false
  });

  const sprite = new THREE.Sprite(material);
  const scaleFactor = opts.scale || 0.0005;
  sprite.scale.set(canvas.width * scaleFactor, canvas.height * scaleFactor, 1);
  sprite.userData.canvasTexture = texture;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  const min = Math.min;
  r = min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

class VisualizedWordNode {
  constructor(word, scene, position = [0, 0, 0]) {
    this.word = word;
    this.position = position;

    const geo = new THREE.SphereGeometry(0.3, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0088ff, metalness: 0.2, roughness: 0.4 });
    this.sphere = new THREE.Mesh(geo, mat);
    this.sphere.position.set(...position);
    scene.add(this.sphere);

    // Register globally for collision checks
    GLOBAL_INDEX.add(position);

    this.label = createTextSprite(word);
    this.label.position.set(position[0], position[1] + 0.7, position[2]);
    scene.add(this.label);
    this._scene = scene;
  }
}

class VisualizedBranch {
  constructor(startPos, endPos, scene) {
    const points = [new THREE.Vector3(...startPos), new THREE.Vector3(...endPos)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.6 });
    const line = new THREE.Line(geometry, material);
    scene.add(line);
  }
}

// --- POSITION GENERATOR (with sibling + global spacing) ---
function* generateNextPosition(parentPos, grandparentPos, parentDepth, totalChildren) {
  const rand = (a, b) => Math.random() * (b - a) + a;
  const distSq3 = (a, b) => {
    const dx = a[0]-b[0], dy = a[1]-b[1], dz = a[2]-b[2];
    return dx*dx + dy*dy + dz*dz;
  };

  // Shared knobs
  const MAX_ATTEMPTS = 16;
  const ANGLE_STEP = Math.PI / 36; // 5°
  const SWEEP_STEPS = 12;

  // Depth 0: circle around root, enforce global spacing
  if (parentDepth === 0) {
    const TAU = Math.PI * 2;
    const n = Math.max(1, totalChildren);
    const baseRadius = 1.0; // nominal radial distance from root
    const elevMin = 3.5, elevMax = 4.0; // vertical lift

    for (let i = 0; i < n; i++) {
      const angle = (i / n) * TAU;
      const radius = rand(0.7, 1.2) * baseRadius;

      let candidate;
      let attempts = 0;
      do {
        const yaw = angle + rand(-0.05, 0.05);
        const dist = radius;
        const xOff = Math.cos(yaw) * dist;
        const zOff = Math.sin(yaw) * dist;
        const yOff = rand(elevMin, elevMax);
        candidate = [parentPos[0] + xOff, parentPos[1] + yOff, parentPos[2] + zOff];
        attempts++;
        if (GLOBAL_INDEX.isFarEnough(candidate, MIN_GLOBAL_DIST_SQ)) break;
      } while (attempts < MAX_ATTEMPTS);

      // Reserve globally
      GLOBAL_INDEX.add(candidate);
      yield candidate;
    }
    return;
  }

  // Depth 1: coherent cone + sibling + global spacing
  if (parentDepth === 1) {
    const spread = Math.PI / 3;          // 60° cone
    const yawJitter = 0.05;
    const elevMin = 0.2, elevMax = 0.75; // upward bias
    const distMin = 2.4, distMax = 3.0;

    const MIN_SIBLING_DIST = 1.25;
    const MIN_SIBLING_DIST_SQ = MIN_SIBLING_DIST * MIN_SIBLING_DIST;

    let baseAngle = Math.atan2(parentPos[2], parentPos[0]);
    if (!isFinite(baseAngle)) baseAngle = 0;

    const start = baseAngle - spread / 2;
    const n = Math.max(1, totalChildren);
    const accepted = [];

    const isFarEnoughLocal = (candidate) => {
      for (const p of accepted) if (distSq3(candidate, p) < MIN_SIBLING_DIST_SQ) return false;
      return true;
    };
    const isFarEnoughGlobal = (candidate) => GLOBAL_INDEX.isFarEnough(candidate, MIN_GLOBAL_DIST_SQ);

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const yawBase = start + t * spread;

      let chosen = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS && !chosen; attempt++) {
        const yaw  = yawBase + rand(-yawJitter, yawJitter);
        const elev = rand(elevMin, elevMax);
        const dist = rand(distMin, distMax);

        const xOff = Math.cos(elev) * Math.cos(yaw) * dist;
        const zOff = Math.cos(elev) * Math.sin(yaw) * dist;
        const yOff = Math.sin(elev) * dist;

        const candidate = [parentPos[0] + xOff, parentPos[1] + yOff, parentPos[2] + zOff];
        if (isFarEnoughLocal(candidate) && isFarEnoughGlobal(candidate)) chosen = candidate;
      }

      if (!chosen) {
        let best = null, bestScore = -Infinity;
        for (let s = -SWEEP_STEPS; s <= SWEEP_STEPS; s++) {
          const yaw  = yawBase + s * ANGLE_STEP;
          const elev = (elevMin + elevMax) * 0.5;
          const dist = distMax;
          const xOff = Math.cos(elev) * Math.cos(yaw) * dist;
          const zOff = Math.cos(elev) * Math.sin(yaw) * dist;
          const yOff = Math.sin(elev) * dist;
          const candidate = [parentPos[0] + xOff, parentPos[1] + yOff, parentPos[2] + zOff];

          if (!GLOBAL_INDEX.isFarEnough(candidate, MIN_GLOBAL_DIST_SQ)) continue;

          let minLocal = Infinity;
          for (const p of accepted) {
            const d2 = distSq3(candidate, p);
            if (d2 < minLocal) minLocal = d2;
          }
          const score = accepted.length ? minLocal : 1e9;
          if (score > bestScore) { bestScore = score; best = candidate; }
        }
        chosen = best ?? [parentPos[0], parentPos[1], parentPos[2]];
      }

      GLOBAL_INDEX.add(chosen);
      accepted.push(chosen);
      yield chosen;
    }
    return;
  }

  // Depth >= 2: forward cone from (grandparent -> parent) + sibling + global spacing
  if (parentDepth >= 2) {
    // Compute true forward from grandparent -> parent (fallback to origin->parent)
    let fx = parentPos[0], fz = parentPos[2];
    if (grandparentPos) {
      fx = parentPos[0] - grandparentPos[0];
      fz = parentPos[2] - grandparentPos[2];
    }
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;
    const baseAngle = Math.atan2(fz, fx);

    const spread = Math.PI / 3;     // 60° cone
    const yawJitter = 0.06;
    const elevMin = -0.7, elevMax = 2;
    const distMin = 2.6, distMax = 4.2;

    const MIN_SIBLING_DIST = 1.0;
    const MIN_SIBLING_DIST_SQ = MIN_SIBLING_DIST * MIN_SIBLING_DIST;

    const start = baseAngle - spread / 2;
    const n = Math.max(1, totalChildren);
    const accepted = [];

    const isFarEnoughLocal = (candidate) => {
      for (const p of accepted) if (distSq3(candidate, p) < MIN_SIBLING_DIST_SQ) return false;
      return true;
    };
    const isFarEnoughGlobal = (candidate) => GLOBAL_INDEX.isFarEnough(candidate, MIN_GLOBAL_DIST_SQ);

    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const yawBase = start + t * spread;

      let chosen = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS && !chosen; attempt++) {
        const yaw  = yawBase + rand(-yawJitter, yawJitter);
        const elev = rand(elevMin, elevMax);
        const dist = rand(distMin, distMax);

        const xOff = Math.cos(elev) * Math.cos(yaw) * dist;
        const zOff = Math.cos(elev) * Math.sin(yaw) * dist;
        const yOff = Math.sin(elev) * dist;

        const candidate = [parentPos[0] + xOff, parentPos[1] + yOff, parentPos[2] + zOff];
        if (isFarEnoughLocal(candidate) && isFarEnoughGlobal(candidate)) chosen = candidate;
      }

      if (!chosen) {
        let best = null, bestScore = -Infinity;
        for (let s = -SWEEP_STEPS; s <= SWEEP_STEPS; s++) {
          const yaw  = yawBase + s * ANGLE_STEP;
          const elev = (elevMin + elevMax) * 0.5;
          const dist = distMax;

          const xOff = Math.cos(elev) * Math.cos(yaw) * dist;
          const zOff = Math.cos(elev) * Math.sin(yaw) * dist;
          const yOff = Math.sin(elev) * dist;

          const candidate = [parentPos[0] + xOff, parentPos[1] + yOff, parentPos[2] + zOff];

          if (!GLOBAL_INDEX.isFarEnough(candidate, MIN_GLOBAL_DIST_SQ)) continue;

          let minLocal = Infinity;
          for (const p of accepted) {
            const d2 = distSq3(candidate, p);
            if (d2 < minLocal) minLocal = d2;
          }
          const score = accepted.length ? minLocal : 1e9;
          if (score > bestScore) { bestScore = score; best = candidate; }
        }
        chosen = best ?? [parentPos[0], parentPos[1], parentPos[2]];
      }

      GLOBAL_INDEX.add(chosen);
      accepted.push(chosen);
      yield chosen;
    }
    return;
  }
}
