import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';

const wordForm = document.getElementById('word-form');
const wordInput = document.getElementById('word-input');


//get float in range
function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}
// Utility to create a text sprite
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

    // must reset font after resizing canvas
    ctx.font = font;
    ctx.textBaseline = 'top';

    // rounded background
    const radius = 6;
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, canvas.width, canvas.height, radius);
    ctx.fill();

    // text
    ctx.fillStyle = color;
    ctx.fillText(text, padding, padding);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);

    // scale sprite so it looks reasonable in scene units
    const scaleFactor = opts.scale || 0.01;
    sprite.scale.set(canvas.width * scaleFactor, canvas.height * scaleFactor, 1);

    // keep a reference to the canvas texture for cleanup if needed
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

        // create sphere mesh
        const geo = new THREE.SphereGeometry(0.5, 2, 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0x0077ff, metalness: 0.2, roughness: 0.4 });

        this.sphere = new THREE.Mesh(geo, mat);
        this.sphere.position.set(...position);
        scene.add(this.sphere);

        // create label sprite and place it above the sphere
        this.label = createTextSprite(word);
        this.label.position.set(position[0], position[1] + 0.8, position[2]);
        scene.add(this.label);
        
        this._scene = scene;
    }
    setPosition([x, y, z]) {
        this.position = [x, y, z];
        this.sphere.position.set(x, y, z);
        if (this.label) this.label.position.set(x, y + 0.8, z);
    }
}

//branch class
class VisualizedBranch {
    constructor(startPos, endPos, scene) {
        this.startPos = startPos;
        this.endPos = endPos;
        
        // Convert arrays to Vector3
        const points = [
        new THREE.Vector3(...this.startPos),
        new THREE.Vector3(...this.endPos)
        ];

        // Create geometry
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Create material
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

        // Create line
        const line = new THREE.Line(geometry, material);
        scene.add(line);
    }

}

async function fetchSampleTree() {
  const res = await fetch('/sampleTree.json');
  if (!res.ok) throw new Error(`Failed to load sampleTree.json: ${res.status}`);
  return await res.json();
}

async function loadAndRenderTreeFromSample(scene) {
  const tree = await fetchSampleTree();
  renderTree(tree, scene);
}

// render tree from wordtree data & tree node
function renderTree(treeNode, scene, position = [0, 0, 0], depth = 0) {

    new VisualizedWordNode(treeNode.word, scene, position);
    console.log('Rendering node:', treeNode.word, 'at depth', depth);
    const children = Array.isArray(treeNode.children) ? treeNode.children : [];
    if (children.length === 0) return;
    const gen = generateNextPosition(position, depth, children.length);
    for (const child of children) {
        const nextpos = gen.next().value;
        new VisualizedBranch(position, nextpos, scene);
        renderTree(child, scene, nextpos, depth + 1);
    }
}
function* generateNextPosition(parentPos, parentDepth, totalChildren) {
    //generator that helps shape the tree based on depth of node(what part of tree it's in)
    
    let yOffset = 0.0;
    let xOffset = 0.0;
    let zOffset = 0.0;
    // y offset based off depth
    switch (parentDepth) {
        case 0: 
        yOffset = getRandomFloat(3.0, 4.5);
        break;
        case 1: 
            yOffset = getRandomFloat(2.0, 3.0);
        break;
        case 2:
            yOffset = getRandomFloat(0.0, 1.5);
        break;
        default:
            yOffset = getRandomFloat(-2.0, 2.0);
        break;
    }
    
    for (let i = 0; i < totalChildren; i++) {

        if (parentDepth <= 1) {
            // distribute children around parent in a noisy circle if trunk of tree
            const TAU = Math.PI * 2;
            const spacing = TAU / Math.max(1, totalChildren);
            const angleJitter = spacing * 0.25; // up to ±25% of spacing

            // radius depends on depth so higher levels spread wider
            let baseRadius;
            switch (parentDepth) {
            case 0: baseRadius = getRandomFloat(0.6, 1.2); break;
            case 1: baseRadius = getRandomFloat(1.2, 2.0); break;
            case 2: baseRadius =  getRandomFloat(1.8, 3.0); break;
            default: baseRadius = getRandomFloat(2.2, 3.6); break;
            }

            const angle = i * spacing + getRandomFloat(-angleJitter, angleJitter);
            const radius = baseRadius * getRandomFloat(0.85, 1.15); // slight radial jitter

            xOffset = Math.cos(angle) * radius;
            zOffset = Math.sin(angle) * radius;
        } else {

            // compute a consistent base direction for this parent once (function-scoped via var)
            let baseAngle, baseAdvance;
            if (typeof baseAngle === 'undefined') {
                const px = parentPos[0], pz = parentPos[2];
                // outward direction from origin; if parent is at origin pick a random direction
                baseAngle = (px === 0 && pz === 0) ? getRandomFloat(0, Math.PI * 2) : Math.atan2(pz, px);
                baseAdvance = 0.9 + parentDepth * 0.6; // how far forward children extend
            }

            // Spread children evenly over ~130 degrees (~2.27 radians)
            const spreadAngle = Math.PI * 130 / 180; // convert 130° to radians
            const startAngle = baseAngle - spreadAngle / 2;
            const endAngle = baseAngle + spreadAngle / 2;

            // Determine evenly spaced angle for this child
            const t = totalChildren === 1 ? 0.5 : i / (totalChildren - 1); // normalized 0..1
            let angle = startAngle + t * spreadAngle;

            // add small random jitter to avoid perfectly uniform spacing
            const jitter = getRandomFloat(-0.08, 0.08); // adjust for randomness
            angle += jitter;

            // distance along forward axis; outer children can go a bit further
            const forward = (baseAdvance + Math.abs(t - 0.5) * 0.18) * getRandomFloat(0.9, 1.12);

            // small perpendicular jitter so children don't lie on one line
            const perpJitter = getRandomFloat(-0.28, 0.28) * (1 / (parentDepth + 1));

            xOffset = Math.cos(angle) * forward + perpJitter * Math.cos(angle + Math.PI / 2);
            zOffset = Math.sin(angle) * forward + perpJitter * Math.sin(angle + Math.PI / 2);

            // reduce vertical offset as depth increases so deeper branches stay more level
            const rise = 1 / (parentDepth + 1);        // smaller as depth increases
            const droop = -Math.log(parentDepth + 1) * 0.05; // small downward tendency for deeper branches
            const yjitter = getRandomFloat(-0.1, 0.2); // small vertical randomness

            yOffset = rise + droop + yjitter;
            
        }
    yield [parentPos[0] + xOffset, parentPos[1] + yOffset, parentPos[2] + zOffset];
    }
}


// Use one submit handler that sends to backend
wordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const word = wordInput.value.trim();
  const wordTree = null; // Placeholder for returned data
  if (!word) return;
  //Send word to backend and receive data in "wordTree"
  try {
    const res = await fetch('/api/word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word })
    });
    const wordtree = await res.json();
    if (!res.ok) throw new Error(wordtree.error || 'Request failed');
    console.log('Server response:', wordtree);
    //received data in wordtree, clear page and load 3d scene
    initTree();
  } catch (err) {
    console.error('Failed to send word to backend:', err);
  }
  // received data in wordtree
  
});
// Once word is taken in, initialize the 3d tree.
function initTree() {
  try {

    //create scene
    const { Scene, PerspectiveCamera, WebGLRenderer, SphereGeometry, MeshStandardMaterial, Mesh, AmbientLight, DirectionalLight } = THREE;

    const container = document.getElementById('three-container') || (() => {
      const c = document.createElement('div');
      c.id = 'three-container';
      c.style.width = '100%';
      c.style.height = '400px';
      c.style.maxWidth = '800px';
      c.style.margin = '16px auto';
      document.body.appendChild(c);
      return c;
    })();

    const scene = new Scene();
    const camera = new PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 3;

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);

    // lighting

    const ambient = new AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    // OrbitControls & controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.0;
    controls.maxDistance = 15.0;

    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    //render tree, later replace null with actual data
    loadAndRenderTreeFromSample(scene);

    function animate() {
      requestAnimationFrame(animate);
      /*// optional auto-rotation — remove if you want only manual control
      sphere.rotation.y += 0.002;
      sphere.rotation.x += 0.001;
        */
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  } catch (err) {
    console.error('Failed to initialize three.js scene:', err);
  }
}