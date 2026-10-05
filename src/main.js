import * as THREE from 'three';
import { countryAt, korean, loadEarth, loadGeoid, POSTER } from './geo.js';
import { createInfoCanvas, drawInfo, drawPoster, INFO, OCEAN, SOCKET, ACCENT } from './poster.js';
import { latLonOf, potatoGeometry, potatoTexture, radiusOf } from './potato.js';
import './style.css';

// 단위: 포스터 가로 = 1, 세로 = 1.4. 포스터는 벽(z<0) 앞 z=0 에 세워져 있고 카메라는 +z 쪽
const ASPECT = POSTER.height / POSTER.width;
const WALL = '#d3cec4';
const POTATO_RADIUS = 0.215; // 둥근 지구일 때 반지름
const POP_OUT = 0.3; // 감자가 포스터에서 튀어나온 거리
const AXIAL_TILT = THREE.MathUtils.degToRad(23.4);
const AUTO_SPIN = 0.22; // 저절로 도는 빠르기 (rad/s)
const MAX_FLING = 9; // 끌다 놓을 때 낼 수 있는 가장 빠른 자전 (rad/s)
const PITCH = 0.12; // 처음 기울기. 위아래로 끌었다 놓으면 천천히 여기로 돌아옴
const MORPH = { k: 120, c: 10 }; // 둥근 구 ↔ 감자 스프링 (감쇠비 ≈ 0.46, 부풀며 출렁)

const FRAME_MS = 1000 / 60; // 60fps 고정 스텝
const STEP = 1 / 60;
const approach = (dt, speed) => 1 - Math.exp(-dt * speed);
const clamp = THREE.MathUtils.clamp;

const canvas = document.querySelector('#stage');
const announcer = document.querySelector('#announcer');
const modeButton = document.querySelector('#mode');

main();

async function main() {
  const earth = loadEarth();
  const geoid = await loadGeoid();

  // ── 렌더러 / 장면 ─────────────────────────────────────

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WALL);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd6d0c2, 2));
  const sun = new THREE.DirectionalLight(0xfff8ee, 1.9);
  sun.position.set(-0.7, 1, 2.3); // 왼쪽 위 앞에서 → 감자 그림자는 포스터 오른쪽 아래로
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 8;
  sun.shadow.intensity = 0.5; // 종이 위 그림자는 옅고 부드럽게
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.002;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = shadowCamera.bottom = -1.1;
  shadowCamera.right = shadowCamera.top = 1.1;
  shadowCamera.near = 0.5;
  shadowCamera.far = 6;
  scene.add(sun);

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: WALL, roughness: 1 }));
  wall.position.z = -0.05; // 포스터가 벽에서 살짝 떠서 그림자가 보이게
  wall.receiveShadow = true;
  scene.add(wall);

  const posterTexture = new THREE.CanvasTexture(drawPoster(geoid));
  posterTexture.colorSpace = THREE.SRGBColorSpace;
  posterTexture.anisotropy = anisotropy;
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(1, ASPECT),
    new THREE.MeshStandardMaterial({ map: posterTexture, roughness: 0.92 }),
  );
  poster.castShadow = true;
  poster.receiveShadow = true;
  scene.add(poster);

  // 위치 정보 칸: 자주 바뀌니 포스터 위에 얇게 붙인 따로 된 판
  const infoCanvas = createInfoCanvas();
  const infoTexture = new THREE.CanvasTexture(infoCanvas);
  infoTexture.colorSpace = THREE.SRGBColorSpace;
  infoTexture.anisotropy = anisotropy;
  const info = new THREE.Mesh(
    new THREE.PlaneGeometry(1, INFO.height / POSTER.width),
    new THREE.MeshStandardMaterial({ map: infoTexture, transparent: true, roughness: 0.92, depthWrite: false }),
  );
  info.position.set(0, ASPECT / 2 - (INFO.top + INFO.height / 2) / POSTER.width, 0.0002);
  info.receiveShadow = true;
  scene.add(info);

  // ── 감자 지구 ─────────────────────────────────────────
  // root(포스터 위 자리, 크기) → pitch(끌어서 위아래) → tilt(자전축 23.4°) → spin(자전) → potato

  const potatoMap = new THREE.CanvasTexture(potatoTexture(geoid, earth));
  potatoMap.colorSpace = THREE.SRGBColorSpace;
  potatoMap.anisotropy = anisotropy;
  const potato = new THREE.Mesh(potatoGeometry(geoid), new THREE.MeshStandardMaterial({ map: potatoMap, roughness: 0.8 }));
  potato.castShadow = true;
  potato.receiveShadow = true;
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshBasicMaterial({ color: ACCENT }));
  marker.visible = false;
  potato.add(marker);
  const spinGroup = new THREE.Group();
  spinGroup.add(potato);
  const tiltGroup = new THREE.Group();
  tiltGroup.rotation.z = -AXIAL_TILT;
  tiltGroup.add(spinGroup);
  const pitchGroup = new THREE.Group();
  pitchGroup.add(tiltGroup);
  const root = new THREE.Group();
  root.position.set(SOCKET.x / POSTER.width - 0.5, ASPECT / 2 - SOCKET.y / POSTER.width, POP_OUT);
  root.scale.setScalar(POTATO_RADIUS);
  root.add(pitchGroup);
  scene.add(root);

  // ── 상태 ─────────────────────────────────────────────

  const spin = { angle: -0.6, velocity: AUTO_SPIN, pitch: PITCH, dragging: false };
  const morph = { value: 1, velocity: 0, target: 1 }; // 0 둥근 구, 1 감자 (처음부터 감자)
  const pointer = { x: 0, y: 0, inside: false };
  let place = undefined; // 정보 칸에 그려진 곳
  let infoClock = 0;
  let elapsed = 0;

  function layout() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const margin = 1.14;
    // 정면에 고정: 포스터가 여백을 두고 화면에 꽉 차는 거리
    camera.position.set(0, 0, Math.max((ASPECT * margin) / 2 / half, margin / 2 / (half * camera.aspect)));
    camera.lookAt(0, 0, 0);
  }

  // ── 고르기: 삼각형 대신 높이 자료를 따라 광선을 걸어서 표면을 찾음 ──

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const inverse = new THREE.Matrix4();
  const ray = new THREE.Ray();
  const point = new THREE.Vector3();

  // 표면과의 차이: 양수면 바깥, 음수면 안쪽
  function gap(t) {
    ray.at(t, point);
    const r = point.length();
    const [lat, lon] = latLonOf(point.divideScalar(r));
    return r - radiusOf(geoid.sample(lat, lon), morph.value);
  }

  function pickPotato(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2);
    raycaster.setFromCamera(ndc, camera);
    potato.updateWorldMatrix(true, false);
    inverse.copy(potato.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inverse); // 감자 로컬: 둥근 지구 = 반지름 1
    const b = ray.origin.dot(ray.direction);
    const disc = b * b - (ray.origin.lengthSq() - 1.25 * 1.25);
    if (disc < 0) return null;
    const enter = -b - Math.sqrt(disc);
    const exit = -b + Math.sqrt(disc);
    let previous = enter;
    for (let i = 1; i <= 48; i++) {
      const t = enter + ((exit - enter) * i) / 48;
      if (gap(t) > 0) {
        previous = t;
        continue;
      }
      let lo = previous;
      let hi = t;
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) / 2;
        if (gap(mid) > 0) lo = mid;
        else hi = mid;
      }
      ray.at(hi, point);
      const direction = point.clone().normalize();
      const [lat, lon] = latLonOf(direction);
      return { lat, lon, height: geoid.sample(lat, lon), local: point.clone(), direction };
    }
    return null;
  }

  function updateHover() {
    const hit = pointer.inside && !spin.dragging ? pickPotato(pointer.x, pointer.y) : null;
    marker.visible = !!hit;
    canvas.style.cursor = spin.dragging ? 'grabbing' : hit ? 'grab' : '';
    if (hit) marker.position.copy(hit.direction).multiplyScalar(hit.local.length() + 0.01);
    // 정보 칸은 1초에 12번까지만 다시 그림 (도는 동안 매 프레임 올리면 무거움)
    if (elapsed - infoClock < 1 / 12 && !!hit === !!place) return;
    infoClock = elapsed;
    const next = hit ? { ...hit, name: countryAt(earth, hit.lon, hit.lat) ?? OCEAN } : null;
    if (!next && !place) return;
    place = next;
    drawInfo(infoCanvas, place);
    infoTexture.needsUpdate = true;
    announcer.textContent = place ? place.name : '';
  }

  // ── 입력 ─────────────────────────────────────────────

  let drag = null;

  canvas.addEventListener('pointerdown', (event) => {
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), from: [event.clientX, event.clientY] };
    spin.dragging = true;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // 합성 이벤트는 캡처가 안 될 수 있음
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.inside = true;
    if (drag && event.pointerId === drag.id) {
      // 좌우로 끌면 자전, 위아래로 끌면 앞뒤로 기울임. 손을 떼면 그 빠르기로 돌다가 원래 빠르기로
      const now = performance.now();
      const turn = (event.clientX - drag.x) * 0.008;
      const dt = Math.max(8, now - drag.time) / 1000; // 이벤트가 몰려 와도 튀지 않게
      spin.angle += turn;
      spin.velocity = clamp(spin.velocity * 0.4 + (turn / dt) * 0.6, -MAX_FLING, MAX_FLING);
      spin.pitch = clamp(spin.pitch + (event.clientY - drag.y) * 0.005, -0.9, 0.9);
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.time = now;
    }
  });

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (performance.now() - drag.time > 90) spin.velocity = 0; // 멈췄다 놓으면 던지지 않음
    // 터치는 올려 둘 수가 없으니 톡 누른 자리를 읽음 (그 아래로 감자가 돌아가며 바뀜). 끌었으면 지움
    if (event.pointerType === 'touch') {
      const tap = Math.hypot(event.clientX - drag.from[0], event.clientY - drag.from[1]) < 10;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = tap && event.type === 'pointerup';
    }
    drag = null;
    spin.dragging = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', (event) => {
    if (spin.dragging || event.pointerType === 'touch') return; // 터치는 손을 떼면 바로 leave 가 옴
    pointer.inside = false;
  });

  function setShape(target) {
    morph.target = target;
    modeButton.textContent = korean ? (target ? '둥글게' : '감자로') : target ? 'Round' : 'Potato'; // 누르면 될 모양
  }
  modeButton.addEventListener('click', () => setShape(morph.target ? 0 : 1));
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLButtonElement || event.code !== 'Space') return;
    event.preventDefault();
    setShape(morph.target ? 0 : 1);
  });
  window.addEventListener('resize', layout);

  // ── 시작 ─────────────────────────────────────────────

  setShape(1);
  layout();
  drawInfo(infoCanvas, null);
  infoTexture.needsUpdate = true;

  function tick(dt) {
    elapsed += dt;
    if (!spin.dragging) {
      spin.velocity += (AUTO_SPIN - spin.velocity) * approach(dt, 0.9);
      spin.angle += spin.velocity * dt;
      spin.pitch += (PITCH - spin.pitch) * approach(dt, 0.6);
    }
    spinGroup.rotation.y = spin.angle;
    pitchGroup.rotation.x = spin.pitch;

    morph.velocity += (MORPH.k * (morph.target - morph.value) - MORPH.c * morph.velocity) * dt;
    morph.value += morph.velocity * dt;
    potato.morphTargetInfluences[0] = Math.max(-0.2, morph.value);
  }

  // 감자가 늘 돌고 있으니 60fps 로 계속 그림 (120Hz 화면에선 한 프레임씩 건너뜀)
  let clock = performance.now();
  renderer.setAnimationLoop((now) => {
    const pending = now - clock;
    if (pending < FRAME_MS - 1) return;
    const steps = Math.min(4, Math.max(1, Math.round(pending / FRAME_MS)));
    clock = steps === 4 ? now : clock + steps * FRAME_MS;
    for (let i = 0; i < steps; i++) tick(STEP);
    updateHover();
    renderer.render(scene, camera);
  });
}
