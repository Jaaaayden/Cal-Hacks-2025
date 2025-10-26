// tree-script.js
import * as THREE from "https://esm.sh/three@0.169.0";

import { OrbitControls } from "https://esm.sh/three@0.169.0/examples/jsm/controls/OrbitControls.js?deps=three@0.169.0";
import { EffectComposer } from "https://esm.sh/three@0.169.0/examples/jsm/postprocessing/EffectComposer.js?deps=three@0.169.0";
import { RenderPass } from "https://esm.sh/three@0.169.0/examples/jsm/postprocessing/RenderPass.js?deps=three@0.169.0";
import { UnrealBloomPass } from "https://esm.sh/three@0.169.0/examples/jsm/postprocessing/UnrealBloomPass.js?deps=three@0.169.0";

// --- Global Variables ---
let renderer, camera, controls, scene, composer;
let wordToVisualizedNode = {};
let circleMeshToWord = {};
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
    clear() {
    this.map.clear();
    }
}
const MIN_GLOBAL_DIST = 1.25; // world units (tweak as needed)
const MIN_GLOBAL_DIST_SQ = MIN_GLOBAL_DIST * MIN_GLOBAL_DIST;
const GLOBAL_INDEX = new SpatialHash(MIN_GLOBAL_DIST);

//raycasting global variables
let NodesList = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// --- Main Execution ---
const neonOutlineMaterial = new THREE.ShaderMaterial({
  uniforms: {
    color: { value: new THREE.Color(0x00ff66) },
    opacity: { value: 0.8 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vViewDir = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    uniform vec3 color;
    uniform float opacity;

    void main() {
      float edge = 1.0 - abs(dot(vNormal, vViewDir));
      edge = pow(edge, 3.0);
      vec3 glow = color * edge * 2.0;
      gl_FragColor = vec4(glow, edge * opacity);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.BackSide,
});

// ... (rest of main execution logic) ...
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
    loadingText.textContent = `Loading tree...`;
  }

  try {
    const res = await fetch('trees.json'); // [cite: Cal-Hacks-2025/sampleTree.json]
    if (!res.ok) {
      throw new Error(`Could not load sampleTree.json: ${res.statusText}`);
    }
    const treeData = await res.json();
    console.log('Loaded trees.json data:', treeData);

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
    // clear previous canvas + state
    const oldCanvas = sceneContainer.querySelector('canvas');
    if (oldCanvas) sceneContainer.removeChild(oldCanvas);

    // reset global index and nodes
    GLOBAL_INDEX.map.clear();
    NodesList = [];

    // scene & camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121212);

    camera = new THREE.PerspectiveCamera(50, 2, 0.1, 1000);
    camera.position.set(0, 5, 30);

    // renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        sceneContainer.appendChild(renderer.domElement);

    // lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    // postprocessing composer
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.9,
      0.7,
      0.1
    );
    composer.addPass(bloomPass);

    // controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2.0;
    controls.maxDistance = 50.0;

    // build the tree
    renderTree(treeData, scene);

        sceneContainer.classList.remove('hidden');

    // Initialize mouse and ray casting
    function animate() {
      requestAnimationFrame(animate);

      // Dynamic sizing (safe to do here)
      const w = Math.max(1, sceneContainer.clientWidth || Math.floor(window.innerWidth * 0.75));
      const h = Math.max(1, sceneContainer.clientHeight || Math.floor(window.innerHeight * 0.75));

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);

      // keep composer in-sync
      if (composer && typeof composer.setSize === 'function') {
        composer.setSize(w, h);
      }

      // Update controls (for moving camera)
      controls.update();

      // --- Step 1: Render bloom only for objects tagged with bloom ---
      scene.traverse(obj => {
        obj.visible = obj.userData.bloom === true;
      });
      composer.render();

      // --- Step 2: Render full scene normally ---
      scene.traverse(obj => obj.visible = true);

      // Update raycasting (hover or click logic)
      // raycaster.setFromCamera(mouse, camera);  // checkIntersects does it
      checkIntersects(false);

      // Finally, render
      renderer.render(scene, camera);
    }
    animate();

  } catch (err) {
    console.error('Failed to initialize three.js scene:', err);
    sceneContainer.innerHTML = `<p style="color: red; padding: 20px;">Error initializing 3D view: ${err.message}</p>`;
    sceneContainer.classList.remove('hidden');
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
}


// mouse tracking event and pos
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onMouseClick);

function onMouseMove(event) {
  if (!renderer || !renderer.domElement) return;
  const rect = renderer.domElement.getBoundingClientRect();

  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function checkIntersects(onClick) {
  // ensure ray is aligned
  raycaster.setFromCamera(mouse, camera);

  // intersect only our nodes (which should be meshes)
  const intersects = raycaster.intersectObjects(NodesList.filter(o => !!o), true);

  if (intersects.length > 0) {
    const firstObject = intersects[0].object;

    if (onClick) {
      // Handle click
      console.log('Clicked on:', firstObject.name || firstObject);
    } else {
      // Handle hover
      highlightObject(firstObject);
    }
  } else {
    // Handle when not hovering any object
    clearHighlight();
  }
}

//highlight object
let hoveredObject = null;

function highlightObject(obj) {
  if (hoveredObject !== obj) {
    // reset old
    if (hoveredObject && hoveredObject.material) {
      // prefer emissive if present, otherwise tint color
      if (hoveredObject.material.emissive) {
        hoveredObject.material.emissive.setHex(0x000000);
      } else if (hoveredObject.material.color) {
        hoveredObject.material.color.setHex(0x003300);
      }
    }

    hoveredObject = obj;

    if (hoveredObject && hoveredObject.material) {
      if (hoveredObject.material.emissive) {
        hoveredObject.material.emissive.setHex(0x333333);
      } else if (hoveredObject.material.color) {
        hoveredObject.material.color.setHex(0x33ff33);
      }
    }
  }
}

function clearHighlight() {
  if (hoveredObject && hoveredObject.material) {
    if (hoveredObject.material.emissive) {
      hoveredObject.material.emissive.setHex(0x000000);
    } else if (hoveredObject.material.color) {
      hoveredObject.material.color.setHex(0x003300);
    }
  }
  hoveredObject = null;
}

function onMouseClick(event) {
  if (!renderer || !renderer.domElement) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  checkIntersects(true); // true means "on click"
}

// --- Handle window resizing ---
window.addEventListener('resize', () => {
  if (sceneContainer && camera && renderer) {
    const width = sceneContainer.clientWidth;
    const height = sceneContainer.clientHeight;
    if (width > 0 && height > 0) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (composer && typeof composer.setSize === 'function') composer.setSize(width, height);
    }
  }
});


// --- RENDER TREE ---
// NOTE: pass grandparent position for forward-cone at depth >= 2
function renderTree(treeNode, scene, position = [0, 0, 0], depth = 0, prevPos = null) {
  if (!treeNode || !treeNode.word) return;

  new VisualizedWordNode(treeNode.word, scene, position, treeNode.children);

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
function clearScene(scene) {
    // dispose geometries/materials/textures for GC friendliness
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
        else obj.material.dispose?.();
      }
      if (obj.userData?.canvasTexture) obj.userData.canvasTexture.dispose?.();
    });
    // remove all children
    while (scene.children.length) scene.remove(scene.children[0]);
}

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
  constructor(word, scene, position = [0, 0, 0], children) {
    this.word = word;
    this.position = position;
    this.children = children;

    const outerRadius = 0.35;   // neon ring outer radius
    const innerRadius = 0.30;   // neon ring inner radius (thin)
    const segments = 64;

    // --- Interior circle (dark green center) ---
    // Use MeshStandardMaterial so `.emissive` exists for highlighting
    const circleGeo = new THREE.CircleGeometry(innerRadius, segments);
    const circleMat = new THREE.MeshStandardMaterial({
      color: 0x003300,       // dark green
      emissive: 0x000000,
      emissiveIntensity: 1.0,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true
    });
    const circleMesh = new THREE.Mesh(circleGeo, circleMat);
    circleMesh.position.set(...position);
    circleMesh.renderOrder = 0;
    circleMesh.onBeforeRender = (renderer, scene, camera) => {
      circleMesh.quaternion.copy(camera.quaternion);
    };
    scene.add(circleMesh);

    // --- Thin neon ring (no additive blending) ---
    const ringGeo = new THREE.RingGeometry(innerRadius, outerRadius, segments);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,       // neon green
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8            // controls glow intensity
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(...position);
    ringMesh.renderOrder = 1;
    ringMesh.onBeforeRender = (renderer, scene, camera) => {
      ringMesh.quaternion.copy(camera.quaternion);
    };
    scene.add(ringMesh);

    // --- Outer subtle glow (additive blending) ---
    const glowGeo = new THREE.RingGeometry(outerRadius, outerRadius + 0.05, segments);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.3
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.position.set(...position);
    glowMesh.renderOrder = 2;
    glowMesh.onBeforeRender = (renderer, scene, camera) => {
      glowMesh.quaternion.copy(camera.quaternion);
    };
    scene.add(glowMesh);

    // --- Text label ---
    this.label = createTextSprite(word, { fontSize: 32, scale: 0.0006 });
    this.label.position.set(position[0], position[1] + 0.8, position[2]);
    scene.add(this.label);

    // Use the main circle mesh as the interactive object
    this.sphere = circleMesh;
    NodesList.push(this.sphere); // Add to global NodesList for interaction
    wordToVisualizedNode[word] = this;
    circleMeshToWord[circleMesh] = word;
    
    this._scene = scene;
  }
}

class VisualizedBranch {
  constructor(startPos, endPos, scene) {
    const points = [
      new THREE.Vector3(...startPos),
      new THREE.Vector3(...endPos)
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // --- Core branch: slightly darker solid brown ---
    const coreMat = new THREE.LineBasicMaterial({
      color: 0x3E2616, // slightly darker wood brown
      transparent: true,
      opacity: 1.0
    });
    const coreLine = new THREE.Line(geometry, coreMat);
    scene.add(coreLine);

    // --- Glow branch: slightly darker additive glow ---
    const glowMat = new THREE.LineBasicMaterial({
      color: 0x3E2616, // match darker brown
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    const glowLine = new THREE.Line(geometry.clone(), glowMat);
    glowLine.userData.bloom = true;    // tag for UnrealBloomPass
    scene.add(glowLine);
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
    const elevMin = 4.5, elevMax = 5.0; // vertical lift

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
document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-tree');
    if (!generateBtn) return;
  
    generateBtn.addEventListener('click', () => {
      // If they came from your homepage, go back. Otherwise hard-redirect.
      const ref = document.referrer ? new URL(document.referrer) : null;
      const cameFromHome = !!ref && /(?:^|\/)(index\.html)?$/.test(ref.pathname);
  
      if (cameFromHome) {
        history.back();
      } else {
        // change if your homepage filename/path is different
        window.location.href = 'index.html';
      }
    });
  });