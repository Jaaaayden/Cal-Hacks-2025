const wordForm = document.getElementById('word-form');
const wordInput = document.getElementById('word-input');

wordForm.addEventListener('submit', (event) => {
    // Prevents the page from actually reloading
    event.preventDefault();

    const word = wordInput.value.trim();

    if (word) {
        // Log the word to the console for now
        console.log(`Word submitted: ${word}`);

        // --- NEXT STEP ---
        // Redirect to the tree visualization page, passing the word as a parameter.
        // For example:
        // window.location.href = `/tree.html?word=${encodeURIComponent(word)}`;
    }
});

(async function initThree() {
  try {
    const THREE = await import('https://unpkg.com/three@0.152.2/build/three.module.js');
    const { Scene, PerspectiveCamera, WebGLRenderer, SphereGeometry, MeshStandardMaterial, Mesh, AmbientLight, DirectionalLight } = THREE;
    
    // Added: import OrbitControls from the examples module
    const { OrbitControls } = await import('https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js');

    const container = document.getElementById('three-container') || (() => {
      const c = document.createElement('div');
      c.id = 'three-container';
      c.style.width = '100%';
      c.style.height = '400px'; // adjust as desired
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

    const geometry = new SphereGeometry(1, 32, 32);
    const material = new MeshStandardMaterial({ color: 0x0077ff, metalness: 0.2, roughness: 0.4 });
    const sphere = new Mesh(geometry, material);
    scene.add(sphere);

    const ambient = new AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    // Added: OrbitControls setup for mouse rotate + scroll zoom
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // smooth movement
    controls.dampingFactor = 0.08;
    controls.enablePan = false;   // disable panning if you want only rotate+zoom
    controls.minDistance = 1.0;   // zoom in limit
    controls.maxDistance = 10.0;  // zoom out limit

    function onResize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    function animate() {
      requestAnimationFrame(animate);
      sphere.rotation.y += 0.01;
      sphere.rotation.x += 0.005;

      // Added: update controls to apply damping and user interaction
      controls.update();

      renderer.render(scene, camera);
    }
    animate();
  } catch (err) {
    console.error('Failed to load three.js or initialize scene:', err);
  }
})();