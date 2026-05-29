import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('bolt-canvas');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scene = new THREE.Scene();

// Dark radial gradient backdrop (deep navy center -> near-black edges)
function makeGradientTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#0a0e1a');
  grad.addColorStop(0.55, '#070912');
  grad.addColorStop(1, '#020308');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.background = makeGradientTexture();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;

// --- Lightning bolt mesh ---
const pts = [
  [0.25, 1.0],
  [-0.45, 0.05],
  [0.0, 0.05],
  [-0.25, -1.0],
  [0.55, 0.15],
  [0.1, 0.15],
];
const shape = new THREE.Shape();
shape.moveTo(pts[0][0], pts[0][1]);
for (let i = 1; i < pts.length; i++) {
  shape.lineTo(pts[i][0], pts[i][1]);
}
shape.closePath();

const extrudeSettings = {
  depth: 0.4,
  bevelEnabled: true,
  bevelThickness: 0.06,
  bevelSize: 0.05,
  bevelSegments: 3,
};
const boltGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
boltGeo.center();

const boltMat = new THREE.MeshStandardMaterial({
  color: 0x0a1a3a,
  emissive: new THREE.Color(0x2a5cff),
  emissiveIntensity: 1.15,
  metalness: 0.7,
  roughness: 0.25,
});

const bolt = new THREE.Mesh(boltGeo, boltMat);
bolt.scale.setScalar(2.4);
bolt.rotation.z = -0.12;
bolt.rotation.x = 0.18;
scene.add(bolt);

// Additive glow halo behind the bolt (fallback glow + depth even with bloom)
const haloMat = new THREE.SpriteMaterial({
  map: (() => {
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(59,140,255,0.34)');
    g.addColorStop(0.4, 'rgba(0,82,255,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(c);
  })(),
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});
const halo = new THREE.Sprite(haloMat);
halo.scale.set(7, 8, 1);
halo.position.z = -1;
scene.add(halo);

// --- Lighting ---
scene.add(new THREE.AmbientLight(0x223355, 0.6));
const blueLight = new THREE.PointLight(0x0052ff, 60, 30);
blueLight.position.set(-4, 3, 5);
scene.add(blueLight);
const cyanLight = new THREE.PointLight(0x4d9bff, 55, 30);
cyanLight.position.set(4, -2, 4);
scene.add(cyanLight);

// --- Drifting ember/particle field for depth ---
const particleCount = 140;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * 16;
  pPos[i * 3 + 1] = (Math.random() - 0.5) * 12;
  pPos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({
  color: 0x2ad8ff,
  size: 0.04,
  transparent: true,
  opacity: 0.3,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

// --- Postprocessing: UnrealBloom ---
let composer = null;
let useComposer = false;
try {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,
    0.6,
    0.1
  );
  composer.addPass(bloom);
  useComposer = true;
} catch (err) {
  console.warn('Bloom unavailable, falling back to emissive + halo glow.', err);
  useComposer = false;
}

// --- Scroll + resize ---
let scrollY = window.scrollY;
window.addEventListener('scroll', () => {
  scrollY = window.scrollY;
}, { passive: true });

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// Pause loop when tab hidden
let running = true;
let frameId = null; // guards against spawning a second RAF loop on re-show
document.addEventListener('visibilitychange', () => {
  running = !document.hidden;
  if (running && frameId === null) animate();
});

const clock = new THREE.Clock();

function render() {
  if (useComposer) composer.render();
  else renderer.render(scene, camera);
}

function animate() {
  if (!running) {
    frameId = null;
    return;
  }
  frameId = requestAnimationFrame(animate);

  const t = clock.getElapsedTime();
  const scrollNorm = scrollY / Math.max(1, window.innerHeight);

  if (reducedMotion) {
    // Honor reduced-motion: keep a gentle idle rotation only, no flicker/pulse/parallax.
    bolt.rotation.y = t * 0.12;
    window.__boltRotY = bolt.rotation.y;
    render();
    return;
  }

  // Idle slow Y rotation + scroll-driven turn
  bolt.rotation.y = t * 0.18 + scrollNorm * 0.9;
  window.__boltRotY = bolt.rotation.y;
  // Subtle breathing pulse
  const pulse = 2.4 + Math.sin(t * 1.3) * 0.04;
  bolt.scale.setScalar(pulse);
  // Emissive flicker
  boltMat.emissiveIntensity = 1.15 + Math.sin(t * 2.2) * 0.2;

  // Parallax drift on scroll
  bolt.position.y = scrollNorm * 0.6;
  halo.position.y = scrollNorm * 0.5;
  camera.position.x = Math.sin(t * 0.15) * 0.15 + scrollNorm * 0.2;
  camera.position.y = -scrollNorm * 0.3;
  camera.lookAt(0, 0, 0);

  // Drift particles
  particles.rotation.y = t * 0.03;
  particles.position.y = -scrollNorm * 0.4;

  render();
}

// Always start the loop; it self-limits motion when reduced-motion is set.
animate();
