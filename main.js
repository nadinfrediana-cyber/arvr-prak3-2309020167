import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ===== A: variabel =====
let camera, scene, renderer, orbit;
const controllers = [];
const interactables = []; // daftar objek yang boleh berinteraksi
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const logBox = document.getElementById('log');
const lines = [];

// Tombol keyboard untuk WASD
const keys = {};
const moveDir = new THREE.Vector3();
const rightDir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Daftar bentuk: objek akan berganti bentuk berurutan setiap kali ditekan
const SHAPES = [
  (s) => new THREE.BoxGeometry(s * 1.2, s * 1.2, s * 1.2),
  (s) => new THREE.SphereGeometry(s, 32, 16),
  (s) => new THREE.ConeGeometry(s * 0.6, s * 1.6, 32),
  (s) => new THREE.CylinderGeometry(s * 0.6, s * 0.6, s * 1.8, 32),
  (s) => new THREE.TorusGeometry(s * 0.8, s * 0.1 + 0.03, 16, 48),
  (s) => new THREE.OctahedronGeometry(s),
  (s) => new THREE.DodecahedronGeometry(s * 0.9),
  (s) => new THREE.IcosahedronGeometry(s),
  (s) => new THREE.TorusKnotGeometry(s * 0.6, s * 0.18, 100, 16)
];

// Log ke layar dan console, berguna sebagai bukti pengujian
function log(msg) {
  console.log(msg);
  lines.unshift(msg);
  lines.length = Math.min(lines.length, 5);
  logBox.textContent = lines.join(' | ');
}

// ===== B: scene dan objek interaktif =====
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8c0ff); // langit

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.6, 2);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(2, 4, 2);
  scene.add(sun);

  // Lantai hijau 12 x 12
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ color: 0x6b8f71 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -4);
  scene.add(floor);

  // Teks nama dan NIM
  scene.add(makeLabel('Nadin Frediana - 2309020167', 0, 3.8, -5));

  // Tiga objek dari modul
  addObject(0, 0.25, 0xe74c3c, -0.6, 1.2, -1);
  addObject(1, 0.2, 0x3498db, 0, 1.2, -1);
  addObject(2, 0.25, 0x2ecc71, 0.6, 1.2, -1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true; // aktifkan WebXR
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer));

  // Kontrol mouse untuk mode desktop (tidak aktif saat sesi XR)
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 1.2, -1);
  orbit.update();

  setupControllers();

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => { keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.setAnimationLoop(render);
}

// Membuat objek interaktif dari daftar SHAPES
function addObject(shapeIndex, size, color, x, y, z, rotYDeg = 0) {
  const mesh = new THREE.Mesh(
    SHAPES[shapeIndex](size),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = THREE.MathUtils.degToRad(rotYDeg);
  mesh.userData.shapeIndex = shapeIndex;
  mesh.userData.size = size;
  scene.add(mesh);
  interactables.push(mesh);
  return mesh;
}

// Teks 3D sederhana memakai canvas (pengganti <a-text>)
function makeLabel(text, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#222222';
  ctx.font = 'bold 110px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  label.position.set(x, y, z);
  return label;
}

// Ubah warna dan bentuk objek sekaligus
function changeShapeAndColor(mesh) {
  mesh.material.color.setHex(Math.floor(Math.random() * 0xffffff));
  mesh.userData.shapeIndex = (mesh.userData.shapeIndex + 1) % SHAPES.length;
  mesh.geometry.dispose();
  mesh.geometry = SHAPES[mesh.userData.shapeIndex](mesh.userData.size);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===== C: controller dan garis sinar =====
function setupControllers() {
  const modelFactory = new XRControllerModelFactory();

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);

    controller.addEventListener('connected', (e) => {
      controller.userData.gamepad = e.data.gamepad; // untuk haptic dan thumbstick
      controller.add(buildRay());
      log('Controller ' + i + ' terhubung (' + e.data.handedness + ')');
    });
    controller.addEventListener('disconnected', () => controller.clear());
    controller.addEventListener('selectstart', onSelectStart);
    controller.addEventListener('selectend', onSelectEnd);
    controller.addEventListener('squeezestart', onSqueezeStart);

    scene.add(controller);
    controllers.push(controller);

    const grip = renderer.xr.getControllerGrip(i);
    grip.add(modelFactory.createControllerModel(grip));
    scene.add(grip);
  }
}

function buildRay() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffffff }));
  line.name = 'ray';
  line.scale.z = 5; // panjang sinar 5 meter
  return line;
}

// ===== D: raycast, select/grab, release, squeeze =====
// Menghitung objek yang terkena sinar dari sebuah controller
function getIntersections(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  return raycaster.intersectObjects(interactables, false);
}

// Getaran singkat pada controller (jika perangkat mendukung)
function pulse(controller, strength = 0.5, ms = 80) {
  const gp = controller.userData.gamepad;
  const actuator = gp && gp.hapticActuators && gp.hapticActuators[0];
  if (actuator && actuator.pulse) actuator.pulse(strength, ms);
}

// Trigger ditekan: genggam objek yang terkena sinar
function onSelectStart(event) {
  const controller = event.target;
  const hits = getIntersections(controller);
  if (hits.length > 0) {
    const obj = hits[0].object;
    controller.attach(obj); // objek menjadi anak controller
    controller.userData.selected = obj;
    pulse(controller);
    log('GRAB: ' + obj.geometry.type);
  }
}

// Trigger dilepas: kembalikan objek ke scene di posisi terakhirnya
function onSelectEnd(event) {
  const controller = event.target;
  const obj = controller.userData.selected;
  if (obj) {
    scene.attach(obj); // posisi dunia tetap terjaga
    controller.userData.selected = undefined;
    log('RELEASE: ' + obj.geometry.type);
  }
}

// Grip ditekan: ganti warna DAN bentuk objek yang disorot
function onSqueezeStart(event) {
  const controller = event.target;
  const hits = getIntersections(controller);
  if (hits.length > 0) {
    const obj = hits[0].object;
    changeShapeAndColor(obj);
    pulse(controller, 0.3, 50);
    log('SQUEEZE: berubah jadi ' + obj.geometry.type);
  }
}

// ===== E: gerak WASD dan loop render (hover + skala) =====
function moveWithKeyboard(delta) {
  const forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const side = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const vertical = (keys['KeyE'] ? 1 : 0) - (keys['KeyQ'] ? 1 : 0);
  if (!forward && !side && !vertical) return;

  const speed = (keys['ShiftLeft'] || keys['ShiftRight'] ? 4 : 2) * delta;

  // Arah depan kamera, diratakan ke bidang lantai
  camera.getWorldDirection(moveDir);
  moveDir.y = 0;
  moveDir.normalize();
  rightDir.crossVectors(moveDir, UP).normalize();

  const step = new THREE.Vector3()
    .addScaledVector(moveDir, forward * speed)
    .addScaledVector(rightDir, side * speed);
  step.y = vertical * speed;

  // Kamera dan titik pusat orbit digeser bersama agar sudut pandang tetap
  camera.position.add(step);
  orbit.target.add(step);
}

function render() {
  const delta = clock.getDelta();

  // Reset sorotan semua objek
  interactables.forEach((o) => o.material.emissive.setHex(0x000000));

  controllers.forEach((c) => {
    const held = c.userData.selected;
    if (held) {
      // Objek sedang digenggam: sorot dan izinkan ubah skala dengan thumbstick
      held.material.emissive.setHex(0x222222);
      const gp = c.userData.gamepad;
      if (gp && gp.axes.length >= 4) {
        const y = gp.axes[3]; // sumbu Y thumbstick
        if (Math.abs(y) > 0.15) { // abaikan drift kecil
          held.scale.multiplyScalar(1 - y * 0.02).clampScalar(0.3, 3);
        }
      }
    } else if (c.children.length > 0) {
      // Controller sudah terhubung dan tidak memegang apa pun: cek hover
      const hits = getIntersections(c);
      if (hits.length > 0) hits[0].object.material.emissive.setHex(0x444444);
    }
  });

  if (!renderer.xr.isPresenting) {
    moveWithKeyboard(delta);
    orbit.update();
  }
  renderer.render(scene, camera);
}

// ===== F: fallback desktop =====
// Klik mouse mengganti warna dan bentuk objek
function onPointerDown(e) {
  if (renderer.xr.isPresenting) return;
  pointer.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(interactables, false);
  if (hits.length > 0) {
    const obj = hits[0].object;
    changeShapeAndColor(obj);
    log('CLICK (desktop): berubah jadi ' + obj.geometry.type);
  }
}

// ===== Jalankan (hanya sekali, paling bawah) =====
init();