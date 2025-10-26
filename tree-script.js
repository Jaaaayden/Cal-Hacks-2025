import * as THREE from 'https://esm.sh/three@0.152.2';
import { OrbitControls } from 'https://esm.sh/three@0.152.2/examples/jsm/controls/OrbitControls.js';

// --- Ensure Global Variables are declared at the top level ---
let renderer, camera, controls, scene;

// --- Get HTML Elements ---
const loadingOverlay = document.getElementById('loading-overlay');
const sceneContainer = document.getElementById('scene-container');


// --- Main Execution ---
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const word = urlParams.get('word');

    if (!word) {
        loadingOverlay.innerHTML = '<p style="color: red;">Error: No word specified in URL.</p>';
        return;
    }

    console.log(`Received word from URL: ${word}`);
    // Check if the p element exists before setting textContent
    const loadingText = loadingOverlay.querySelector('p');
    if (loadingText) {
        loadingText.textContent = `Generating tree for "${word}"...`;
    }


    try {
        const res = await fetch('tree-test.json'); // Using test data [cite: Cal-Hacks-2025/tree-test.json]
        if (!res.ok) {
            throw new Error(`Could not load tree-test.json: ${res.statusText}`);
        }
        const treeData = await res.json();
        console.log('Loaded local test data:', treeData);

        initTree(treeData); // Call initTree

        // Hide loader AFTER initTree completes successfully and scene is ready
        if (sceneContainer && !sceneContainer.classList.contains('hidden') && renderer) {
            // Give the browser a tiny moment to render the first frame before hiding loader
            requestAnimationFrame(() => {
                loadingOverlay.classList.add('hidden');
                // ✅ Force one more frame after overlay is hidden
                setTimeout(() => {
                    if (renderer && scene && camera) {
                        renderer.render(scene, camera);
                    }
                }, 50);
            });
        } else if (!sceneContainer || !renderer) {
             // Handle cases where initTree might have failed silently earlier
            throw new Error("Scene initialization failed or container not found.");
        }

    } catch (err) {
       // ... (error handling remains the same) ...
        console.error('Error during tree generation:', err);
        loadingOverlay.innerHTML = `<p style="color: red;">Error generating tree: ${err.message}</p>`;
        // Ensure loading overlay stays visible if there's an error
        loadingOverlay.classList.remove('hidden');
        if (sceneContainer) sceneContainer.classList.add('hidden'); // Hide scene container on error
    }
});

// --- RENDERER INITIALIZATION (MODIFIED) ---
function initTree(treeData) {
    if (!sceneContainer) {
        console.error("Scene container element not found!");
        if (loadingOverlay) loadingOverlay.innerHTML = '<p style="color: red;">Error: Cannot find scene container.</p>';
        return;
    }

    try {
        // remove old canvas if present
        const oldCanvas = sceneContainer.querySelector('canvas');
        if (oldCanvas) sceneContainer.removeChild(oldCanvas);

        // create scene & camera
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x121212);
        camera = new THREE.PerspectiveCamera(50, 2, 0.1, 1000); // temp aspect
        camera.position.set(0, 5, 30);

        // create renderer but don't size it yet
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        // append canvas BEFORE sizing so CSS rules apply
        sceneContainer.appendChild(renderer.domElement);

        // lighting + controls
        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, 1);
        dir.position.set(5, 10, 5);
        scene.add(dir);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 2.0;
        controls.maxDistance = 50.0;

        // Render tree objects into the scene
        renderTree(treeData, scene);

        // --- IMPORTANT: make container visible BEFORE sizing/rendering ---
        // If `.hidden` uses display:none, clientWidth will be 0 until it's removed.
        sceneContainer.classList.remove('hidden');

        // Now wait for next animation frame so layout has a chance to apply.
        requestAnimationFrame(() => {
            // Defensive: if computed size is zero, fallback to window size.
            const w = Math.max(1, sceneContainer.clientWidth || Math.floor(window.innerWidth * 0.75));
            const h = Math.max(1, sceneContainer.clientHeight || Math.floor(window.innerHeight * 0.75));

            camera.aspect = w / h;
            camera.updateProjectionMatrix();

            renderer.setSize(w, h, false); // false -> don't update style, only drawing buffer
            // If you want the canvas element to match CSS width/height, you can set renderer.domElement.style.width/height = '100%'

            // ensure controls knows about the new size
            controls.update();

            // hide loader (if using a fade, this starts the fade)
            if (loadingOverlay) loadingOverlay.classList.add('hidden');

            // Force a render after the overlay actually disappears / layout stabilizes.
            // Using both requestAnimationFrame + small setTimeout covers both immediate and CSS-transition cases.
            requestAnimationFrame(() => renderer.render(scene, camera));
            setTimeout(() => { if (renderer) renderer.render(scene, camera); }, 60);

            // start animation loop
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
    // Check variables exist before using them
    if (sceneContainer && camera && renderer) {
        // Update camera aspect ratio
        camera.aspect = sceneContainer.clientWidth / sceneContainer.clientHeight;
        camera.updateProjectionMatrix();
        // Update renderer size
        renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
        // No extra render needed here, animate loop handles it
    }
});

// --- Animation loop ---
function animate() {
    // Check variables exist before using them
    if (!renderer || !scene || !camera || !controls) return;

    requestAnimationFrame(animate); // Continue the loop
    controls.update(); // Update controls (needed for damping)
    renderer.render(scene, camera); // Render the current frame
}

// --- RENDER TREE (No changes needed here) ---
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


// --- Helper functions and Classes (No changes needed here) ---
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
        this._scene = scene; // Keep reference if needed for interaction later
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
    const yStep = 5.0 - parentDepth * 0.8; // Decreasing vertical step
    const radius = 2.5 + parentDepth * 2.5; // Increasing horizontal spread
    for (let i = 0; i < totalChildren; i++) {
        const angle = (i / totalChildren) * Math.PI * 2; // Even angular distribution
        const jitter = Math.random() * 0.6 - 0.3; // Randomness in angle/radius
        // Calculate child position relative to parent
        const x = parentPos[0] + Math.cos(angle + jitter) * (radius + jitter * 2);
        const y = parentPos[1] - (yStep + Math.random() * 0.5); // Go downwards, with jitter
        const z = parentPos[2] + Math.sin(angle + jitter) * (radius + jitter * 2);
        yield [x, y, z]; // Return the calculated position
    }
}

