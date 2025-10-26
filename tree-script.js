import * as THREE from 'https://esm.sh/three@0.152.2';
import { OrbitControls } from 'https://esm.sh/three@0.152.2/examples/jsm/controls/OrbitControls.js';

// --- Get HTML Elements ---
const loadingOverlay = document.getElementById('loading-overlay');
const sceneContainer = document.getElementById('scene-container');
let renderer, camera, controls, scene; // Keep references accessible

// --- Main Execution ---
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const word = urlParams.get('word');

    if (!word) {
        loadingOverlay.innerHTML = '<p style="color: red;">Error: No word specified in URL.</p>';
        return;
    }

    console.log(`Received word from URL: ${word}`);
    loadingOverlay.querySelector('p').textContent = `Generating tree for "${word}"...`;

    try {
        const res = await fetch('tree-test.json'); // [cite: Cal-Hacks-2025/tree-test.json]
        if (!res.ok) {
            throw new Error(`Could not load tree-test.json: ${res.statusText}`);
        }
        const treeData = await res.json();
        console.log('Loaded local test data:', treeData);

        initTree(treeData);

        // Hide loader only AFTER initTree completes successfully and scene is ready
        if (sceneContainer && !sceneContainer.classList.contains('hidden') && renderer) {
            loadingOverlay.classList.add('hidden');
        } else if (!sceneContainer || !renderer) {
            throw new Error("Scene initialization failed.");
        }

    } catch (err) {
        console.error('Error during tree generation:', err);
        loadingOverlay.innerHTML = `<p style="color: red;">Error generating tree: ${err.message}</p>`;
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
        if (oldCanvas) {
            sceneContainer.removeChild(oldCanvas);
        }

        scene = new THREE.Scene(); // Use global scene variable
        scene.background = new THREE.Color(0x121212);

        camera = new THREE.PerspectiveCamera(50, sceneContainer.clientWidth / sceneContainer.clientHeight, 0.1, 1000);
        camera.position.set(0, 5, 30);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        sceneContainer.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 1.0);
        dir.position.set(5, 10, 5);
        scene.add(dir);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 2.0;
        controls.maxDistance = 50.0;

        // Render the tree structure into the scene
        renderTree(treeData, scene);

        // --- ✅ ADD THIS LINE ---
        // Force the very first render immediately
        renderer.render(scene, camera);
        // --- END OF ADDED LINE ---

        // Make the container visible now that it's ready
        sceneContainer.classList.remove('hidden');

        // Start the continuous animation loop
        animate(); // No need to pass scene anymore as it's global

    } catch (err) {
        console.error('Failed to initialize three.js scene:', err);
        sceneContainer.innerHTML = `<p style="color: red; padding: 20px;">Error initializing 3D view: ${err.message}</p>`;
        sceneContainer.classList.remove('hidden'); // Show error
    }
}

// --- Handle window resizing ---
window.addEventListener('resize', () => {
    if (sceneContainer && camera && renderer) {
        camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
        // No need for an extra render call here, animate loop handles it
    }
});

// --- Animation loop ---
function animate() {
    // Use global variables
    if (!renderer || !scene || !camera || !controls) return;

    requestAnimationFrame(animate); // Loop
    controls.update(); // Update controls (important for damping)
    renderer.render(scene, camera); // Render the scene
}


// --- RENDER TREE ---
function renderTree(treeNode, scene, position = [0, 0, 0], depth = 0) {
    if (!treeNode || !treeNode.name) return;

    new VisualizedWordNode(treeNode.name, scene, position);

    const children = Array.isArray(treeNode.children) ? treeNode.children : [];
    if (children.length === 0) return;

    const gen = generateNextPosition(position, depth, children.length);
    for (const child of children) {
        const nextpos = gen.next().value;
        new VisualizedBranch(position, nextpos, scene);
        renderTree(child, scene, nextpos, depth + 1);
    }
}


// --- (Keep the rest of your helper functions: getRandomFloat, createTextSprite, roundRect, VisualizedWordNode, VisualizedBranch, generateNextPosition) ---
function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

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
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    const scaleFactor = opts.scale || 0.015;
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

function* generateNextPosition(parentPos, parentDepth, totalChildren) {
    const yStep = 5.0 - parentDepth * 0.8;
    const radius = 2.5 + parentDepth * 2.5;
    for (let i = 0; i < totalChildren; i++) {
        const angle = (i / totalChildren) * Math.PI * 2;
        const jitter = Math.random() * 0.6 - 0.3;
        const x = parentPos[0] + Math.cos(angle + jitter) * (radius + jitter * 2);
        const y = parentPos[1] - (yStep + Math.random() * 0.5);
        const z = parentPos[2] + Math.sin(angle + jitter) * (radius + jitter * 2);
        yield [x, y, z];
    }
}