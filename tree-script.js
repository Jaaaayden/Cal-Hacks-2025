import * as THREE from 'https://esm.sh/three@0.152.2';
import { OrbitControls } from 'https://esm.sh/three@0.152.2/examples/jsm/controls/OrbitControls.js';

// --- Global Variables ---
// ... (rest of globals) ...
let renderer, camera, controls, scene;

// --- Get HTML Elements ---
// ... (rest of element getters) ...
const loadingOverlay = document.getElementById('loading-overlay');
const sceneContainer = document.getElementById('scene-container');

let NodesList = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
// --- Main Execution ---
// ... (rest of main execution logic) ...
document.addEventListener('DOMContentLoaded', async () => {
    // ... (logic to get word and fetch data) ...
    const   urlParams = new URLSearchParams(window.location.search);
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
// ... (initTree function remains the same) ...
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

        // Initialize mouse and ray casting

        function animate() {
            requestAnimationFrame(animate);

            // Dynamic sizing (safe to do here)
            const w = Math.max(1, sceneContainer.clientWidth || Math.floor(window.innerWidth * 0.75));
            const h = Math.max(1, sceneContainer.clientHeight || Math.floor(window.innerHeight * 0.75));

            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h, false);

            // Update controls (for moving camera)
            controls.update();

            // Update raycasting (hover or click logic)
            raycaster.setFromCamera(mouse, camera);
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
  const rect = renderer.domElement.getBoundingClientRect();

  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}
function checkIntersects(onClick) {
  raycaster.setFromCamera(mouse, camera);
  //const arrow = new THREE.ArrowHelper(raycaster.ray.direction, raycaster.ray.origin, 5, 0xff0000);
  //scene.add(arrow);
  // Assuming `objects` is an array of your clickable meshes
  const intersects = raycaster.intersectObjects(NodesList, true);

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
    if (hoveredObject) hoveredObject.material.emissive.set(0x000000);
    hoveredObject = obj;
    hoveredObject.material.emissive.set(0x333333);
  }
}

function clearHighlight() {
  if (hoveredObject) hoveredObject.material.emissive.set(0x000000);
  hoveredObject = null;
}

function onMouseClick(event) {
  // Same normalization if you want to raycast on click
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  checkIntersects(true); // true means "on click"
}

// --- Handle window resizing ---
// ... (resize listener remains the same) ...
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



// --- RENDER TREE ---
// ... (renderTree function remains the same) ...
function renderTree(treeNode, scene, position = [0, 0, 0], depth = 0) {
    if (!treeNode || !treeNode.word) return;

    new VisualizedWordNode(treeNode.word, scene, position);

    const children = Array.isArray(treeNode.children) ? treeNode.children : [];
    if (children.length === 0) return;

    const gen = generateNextPosition(position, depth, children.length);
    for (const child of children) {
        const nextpos = gen.next().value;
        new VisualizedBranch(position, nextpos, scene);
        renderTree(child, scene, nextpos, depth + 1);
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

    // --- ✅ ADD sizeAttenuation: false ---
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        sizeAttenuation: false // Keep size constant regardless of distance
    });
    // --- END OF CHANGE ---

    const sprite = new THREE.Sprite(material);

    // --- ✅ ADJUST SCALE FACTOR ---
    // With sizeAttenuation: false, scale relates more directly to pixels.
    // Start with a much smaller value and adjust as needed.
    const scaleFactor = opts.scale || 0.0005; // Experiment with this value (e.g., 0.03, 0.05, 0.07)
    // --- END OF CHANGE ---

    sprite.scale.set(canvas.width * scaleFactor, canvas.height * scaleFactor, 1);
    sprite.userData.canvasTexture = texture;
    return sprite;
}
// --- END OF UPDATED FUNCTION ---

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
        this.label = createTextSprite(word); // createTextSprite uses the updated material
        this.label.position.set(position[0], position[1] + 0.7, position[2]);
        scene.add(this.label);
        this._scene = scene;
        NodesList.push(this.sphere); // Add to global NodesList for interaction
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






// --- ✅ THIS IS THE OLD POSITION GENERATOR FUNCTION (RESTORED) ---
/*function* generateNextPosition(parentPos, parentDepth, totalChildren) {
    let yOffset = 0.0;
    let xOffset = 0.0;
    let zOffset = 0.0;

    switch (parentDepth) {
        case 0: yOffset = getRandomFloat(3.0, 4.5); break;
        case 1: yOffset = getRandomFloat(2.0, 3.0); break;
        case 2: yOffset = getRandomFloat(0.0, 1.5); break;
        default: yOffset = getRandomFloat(-2.0, 2.0); break;
    }

    let baseAngle, baseAdvance;
    if (parentDepth > 1) {
        const px = parentPos[0], pz = parentPos[2];
        baseAngle = (px === 0 && pz === 0) ? getRandomFloat(0, Math.PI * 2) : Math.atan2(pz, px);
        baseAdvance = 0.9 + parentDepth * 0.6;
    }

    for (let i = 0; i < totalChildren; i++) {
        if (parentDepth <= 1) {
            const TAU = Math.PI * 2;
            const spacing = TAU / Math.max(1, totalChildren);
            const angleJitter = spacing * 0.25;
            let baseRadius;
            switch (parentDepth) {
                case 0: baseRadius = getRandomFloat(1.2, 2.0); break;
                case 1: baseRadius = getRandomFloat(1.8, 2.5); break;
                default: baseRadius = getRandomFloat(2.2, 3.0); break;
            }
            const angle = i * spacing + getRandomFloat(-angleJitter, angleJitter);
            const radius = baseRadius * getRandomFloat(0.85, 1.15);
            xOffset = Math.cos(angle) * radius;
            zOffset = Math.sin(angle) * radius;
        } else {
            const spreadAngle = Math.PI * 130 / 180;
            const startAngle = baseAngle - spreadAngle / 2;
            const t = totalChildren === 1 ? 0.5 : i / (totalChildren - 1);
            let angle = startAngle + t * spreadAngle;
            angle += getRandomFloat(-0.08, 0.08);
            const forward = (baseAdvance + Math.abs(t - 0.5) * 0.18) * getRandomFloat(0.9, 1.12);
            const perpJitter = getRandomFloat(-0.28, 0.28) * (1 / (parentDepth + 1));
            xOffset = Math.cos(angle) * forward + perpJitter * Math.cos(angle + Math.PI / 2);
            zOffset = Math.sin(angle) * forward + perpJitter * Math.sin(angle + Math.PI / 2);
            const rise = 1.2 / (parentDepth + 0.5);
            const droop = -Math.log(parentDepth + 1) * 0.1;
            const yjitter = getRandomFloat(-0.15, 0.25);
            yOffset = rise + droop + yjitter;
        }
        yield [parentPos[0] + xOffset, parentPos[1] + yOffset, parentPos[2] + zOffset];
    }
}*/

function* generateNextPosition(parentPos, parentDepth, totalChildren) {
    // --- CONFIGURATION ---
    const ANGLE_JITTER = 0.2;  // Small randomness to break symmetry

    // Helper for randomness
    const rand = (min, max) => Math.random() * (max - min) + min;

    // --- Depth 1 (Root Node) ---
    if (parentDepth === 0) {
        const TAU = Math.PI * 2; // Full circle in radians

        for (let i = 0; i < totalChildren; i++) {
            // Evenly distribute children across the full circle (no randomness in angle)
            const angle = (i / totalChildren) * TAU;  // Evenly spaced angle
            const distance = rand(0.7, 1.2);  // Small outward spread
            const xOffset = Math.cos(angle) * distance;
            const zOffset = Math.sin(angle) * distance;
            const yOffset = rand(3.5, 4.0);  // Significant upward movement

            const newPos = [
                parentPos[0] + xOffset,
                parentPos[1] + yOffset,
                parentPos[2] + zOffset
            ];
            yield newPos;
        }
    } 

    // --- Depth 1 (First Layer of Branches in a Quarter Hemisphere) ---
    if (parentDepth === 1) {
        const baseAngle = Math.atan2(parentPos[2], parentPos[0]);
        const maxAzimuthAngle = Math.PI ; // 90 degrees spread for azimuth
        const maxElevationAngle = Math.PI / 2; // 45 degrees spread for elevation (upward)

        for (let i = 0; i < totalChildren; i++) {
            // Randomly select an azimuthal angle (0 to π/2) and elevation angle (0 to π/4)
            const azimuthAngle =  rand(0, maxAzimuthAngle);  // Azimuth angle (horizontal plane)
            const elevationAngle = rand(0, maxElevationAngle);  // Elevation angle (vertical direction)

            // Apply jitter to the azimuth to introduce slight randomness
            const angle = baseAngle + azimuthAngle + rand(-ANGLE_JITTER, ANGLE_JITTER);

            // Compute spherical coordinates (r, θ, φ)
            const distance = rand(2.5, 3.0);  // Spread the children further out from the parent
            const xOffset = Math.cos(elevationAngle) * Math.cos(angle) * distance;
            const zOffset = Math.cos(elevationAngle) * Math.sin(angle) * distance;
            const yOffset = Math.sin(elevationAngle) * distance;  // Y offset controlled by elevation

            // Generate the new position
            const newPos = [
                parentPos[0] + xOffset,
                parentPos[1] + yOffset,
                parentPos[2] + zOffset
            ];
            yield newPos;
        }
    }

    // --- Depth 3 and Beyond (Continued Expansion) ---
    /*if (parentDepth >= 2) {
        const baseAngle = Math.atan2(parentPos[2], parentPos[0]);
        const spreadAngle = Math.PI / 2;  // 90-degree spread for branches

        for (let i = 0; i < totalChildren; i++) {
            // Spread positions evenly within 90 degrees of the parent's base angle
            const angle = baseAngle - spreadAngle / 2 + (i / (totalChildren - 1)) * spreadAngle + rand(-ANGLE_JITTER, ANGLE_JITTER);
            const distance = rand(1.5, 2.5);  // Continue expanding outward
            const xOffset = Math.cos(angle) * distance;
            const zOffset = Math.sin(angle) * distance;

            // Randomize the Y offset: up or down depending on the depth
            const yOffset = rand(-0.5, 0.5);  // Can go up or down

            const newPos = [
                parentPos[0] + xOffset,
                parentPos[1] + yOffset,
                parentPos[2] + zOffset
            ];
            yield newPos;
        }
    }
    */
     if (parentDepth >= 2) {
        // Calculate the vector from the parent to the grandparent
        const parentToGrandparentX = parentPos[0];
        const parentToGrandparentZ = parentPos[2];
        const parentAngle = Math.atan2(parentToGrandparentZ, parentToGrandparentX);

        // Set a restriction angle range (no backward movement)
        const restrictedAngleRange = Math.PI;  // No more than 180 degrees in reverse direction

        for (let i = 0; i < totalChildren; i++) {
            // Random angle within a restricted range: forward or sideways, but not backward
            const angle = rand(parentAngle - restrictedAngleRange / 2, parentAngle + restrictedAngleRange / 2);

            // Random distance
            const distance = rand(1.5, 3.0);  // Further expansion in all directions
            const xOffset = Math.cos(angle) * distance;
            const zOffset = Math.sin(angle) * distance;

            // Drastic Y offset: large up/down movement for more erratic growth
            const yOffset = rand(-3.0, 3.0);  // Large randomness in vertical direction

            const newPos = [
                parentPos[0] + xOffset,
                parentPos[1] + yOffset,
                parentPos[2] + zOffset
            ];

            // Yield the position directly (no overlap check)
            yield newPos;
        }
    }
}


