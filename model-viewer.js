import * as THREE from './vendor/three.module.js';

// Every texture and cosmetic geometry below is loaded from the supplied JAR.
// The only procedural cosmetic is the simple halo ring.
const NATIVE = new URL('./assets/native/', import.meta.url);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const jsonCache = new Map();
const textureCache = new Map();
const viewers = new Map();
const fallbacks = new WeakMap();
const radians = Math.PI / 180;
const cosmeticNames = {
  halo: 'Нимб', fox: 'Лиса', penguin: 'Пингвин', pig: 'Свинка',
  wings: 'Крылья', 'dark-wings': 'Тёмные крылья',
  'rocker-wings': 'Крылья Rocker', 'vulcano-wings': 'Крылья Vulcano',
};
const nativeModels = {
  fox: 'fox_hat', penguin: 'penguin_hat', pig: 'pig_hat',
  wings: 'pulse_dark_wings', 'dark-wings': 'pulse_dark_wings',
  'rocker-wings': 'pulse_rocker_wings', 'vulcano-wings': 'vulcano_wings',
};

function showModelFallback(container, id) {
  let fallback = fallbacks.get(container);
  if (!fallback) {
    const image = container.querySelector('.model-fallback') || document.createElement('img');
    image.className = 'model-fallback';
    image.draggable = false;
    image.decoding = 'async';
    if (!image.parentElement) container.append(image);
    fallback = { image };
    fallbacks.set(container, fallback);
    // Constructor failures have no ModelViewer attribute observer of their own.
    fallback.observer = new MutationObserver(() => showModelFallback(container));
    fallback.observer.observe(container, { attributes: true,
      attributeFilter: ['data-character', 'data-model-viewer'] });
  }
  const selected = id || container.dataset.character || container.dataset.modelViewer || 'halo';
  const imageId = ['halo', 'fox', 'penguin', 'pig'].includes(selected) ? selected : 'halo';
  fallback.image.src = new URL(`./assets/character-${imageId}.png`, import.meta.url).href;
  fallback.image.alt = `Персонаж CosmoVisuals с косметикой «${cosmeticNames[imageId]}». Статичный предпросмотр.`;
  fallback.image.hidden = false;
  container.querySelectorAll('.cosmo-model-canvas').forEach((canvas) => {
    canvas.hidden = true;
    canvas.style.display = 'none';
    canvas.tabIndex = -1;
    canvas.setAttribute('aria-hidden', 'true');
  });
}

function getJSON(path) {
  const url = new URL(path, NATIVE).href;
  if (!jsonCache.has(url)) {
    jsonCache.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Model asset ${response.status}: ${path}`);
      return response.json();
    }));
  }
  return jsonCache.get(url);
}

function getTexture(path) {
  const url = new URL(path, NATIVE).href;
  if (!textureCache.has(url)) {
    textureCache.set(url, new THREE.TextureLoader().loadAsync(url).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      return texture;
    }));
  }
  return textureCache.get(url);
}

function texturedMaterial(texture, side = THREE.DoubleSide) {
  return new THREE.MeshStandardMaterial({
    map: texture, roughness: 0.93, metalness: 0,
    // Cutouts write solid depth; blended transparent layers can sort against
    // one another while a character turns.
    alphaTest: 0.5, transparent: false, depthWrite: true, side,
  });
}

// Match the rotation convention of CosmeticModel.rotate in the supplied JAR:
// JOML rotateZYX(-z, y, -x), with absolute Bedrock pivots.
function bedrockRotation(object, rotation = [0, 0, 0]) {
  object.rotation.set(-rotation[0] * radians, rotation[1] * radians,
    -rotation[2] * radians, 'ZYX');
}

function boxUV(uv, size) {
  const [u, v] = uv;
  const [w, h, d] = size;
  return {
    north: { uv: [u + d, v + d], uv_size: [w, h] },
    east: { uv: [u, v + d], uv_size: [d, h] },
    south: { uv: [u + d + w + d, v + d], uv_size: [w, h] },
    west: { uv: [u + d + w, v + d], uv_size: [d, h] },
    up: { uv: [u + d, v], uv_size: [w, d] },
    down: { uv: [u + d + w, v + d], uv_size: [w, -d] },
  };
}

function cubeGeometry(cube, textureWidth, textureHeight, anchor = [0, 0, 0]) {
  const origin = cube.origin || [0, 0, 0];
  const size = cube.size || [0, 0, 0];
  const inflate = cube.inflate || 0;
  const [x0, y0, z0] = origin.map((value, i) => value - inflate - anchor[i]);
  const [x1, y1, z1] = origin.map((value, i) => value + size[i] + inflate - anchor[i]);
  // Same face order and corner orientation as the game's native renderer.
  const faces = {
    north: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]],
    south: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]],
    east: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]],
    west: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]],
    up: [[x1, y1, z1], [x0, y1, z1], [x0, y1, z0], [x1, y1, z0]],
    down: [[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]],
  };
  const mapping = Array.isArray(cube.uv) ? boxUV(cube.uv, size) : cube.uv || {};
  const positions = [];
  const uvs = [];
  const indices = [];
  Object.entries(faces).forEach(([name, corners]) => {
    const face = mapping[name];
    if (!face) return;
    const [u, v] = face.uv || [0, 0];
    let [w, h] = face.uv_size || [size[0], size[1]];
    // A tiny texel inset prevents neighbouring transparent atlas texels bleeding.
    const iu = Math.sign(w) * Math.min(0.015, Math.abs(w) / 4);
    const iv = Math.sign(h) * Math.min(0.015, Math.abs(h) / 4);
    const rotation = Math.round((face.uv_rotation || 0) / 90);
    const start = positions.length / 3;
    corners.forEach((position, i) => {
      const corner = ((i + rotation) % 4 + 4) % 4;
      positions.push(...position);
      uvs.push((u + (corner === 1 || corner === 2 ? w - iu : iu)) / textureWidth,
        1 - (v + (corner >= 2 ? h - iv : iv)) / textureHeight);
    });
    indices.push(start, start + 2, start + 1, start, start + 3, start + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addCube(parent, cube, material, dimensions, anchor) {
  const pivot = cube.pivot || anchor;
  const rotationGroup = new THREE.Group();
  rotationGroup.position.set(...pivot.map((value, i) => value - anchor[i]));
  bedrockRotation(rotationGroup, cube.rotation);
  const mesh = new THREE.Mesh(cubeGeometry(cube, ...dimensions, pivot), material);
  rotationGroup.add(mesh);
  parent.add(rotationGroup);
  return rotationGroup;
}

function createPlayer(texture) {
  const player = new THREE.Group();
  // The supplied 64 x 64 skin is a classic skin with four-pixel arms.
  // Neutral Minecraft-style face shading preserves its actual skin colours;
  // purple scene lighting belongs on the cosmetics, not the uploaded skin.
  const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true,
    alphaTest: 0.5, transparent: false, depthWrite: true,
    side: THREE.FrontSide, toneMapped: false });
  const skinGeometry = (part) => {
    const geometry = cubeGeometry(part, 64, 64, part.pivot);
    const colours = [];
    const normals = geometry.attributes.normal;
    for (let i = 0; i < normals.count; i++) {
      const shade = normals.getY(i) > 0.5 ? 1 : normals.getY(i) < -0.5 ? 0.65
        : normals.getZ(i) < -0.5 ? 1 : normals.getZ(i) > 0.5 ? 0.8 : 0.88;
      colours.push(shade, shade, shade);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    return geometry;
  };
  const parts = [
    { name: 'head', origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0], overlay: [32, 0], pivot: [0, 24, 0] },
    { name: 'body', origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16], overlay: [16, 32], pivot: [0, 24, 0] },
    // Looking toward -Z, the player's anatomical right is +X. Keeping each
    // named limb on that side is essential for asymmetrical skin artwork.
    { name: 'rightArm', origin: [4, 12, -2], size: [4, 12, 4], uv: [40, 16], overlay: [40, 32], pivot: [6, 23, 0], pose: [0, 0, -4] },
    { name: 'leftArm', origin: [-8, 12, -2], size: [4, 12, 4], uv: [32, 48], overlay: [48, 48], pivot: [-6, 23, 0], pose: [0, 0, 4] },
    { name: 'rightLeg', origin: [0, 0, -2], size: [4, 12, 4], uv: [0, 16], overlay: [0, 32], pivot: [2, 12, 0], pose: [-2, 0, 0] },
    { name: 'leftLeg', origin: [-4, 0, -2], size: [4, 12, 4], uv: [16, 48], overlay: [0, 48], pivot: [-2, 12, 0], pose: [2, 0, 0] },
  ];
  parts.forEach((part) => {
    const limb = new THREE.Group();
    limb.name = part.name;
    limb.position.set(...part.pivot);
    bedrockRotation(limb, part.pose);
    limb.userData.restRotation = limb.rotation.clone();
    const base = new THREE.Mesh(skinGeometry(part), material);
    base.name = `${part.name}-base`;
    limb.add(base);
    const overlay = new THREE.Mesh(skinGeometry({ ...part, uv: part.overlay,
      inflate: part.name === 'head' ? 0.5 : 0.25 }), material);
    overlay.name = `${part.name}-outer`;
    limb.add(overlay);
    player.add(limb);
  });
  const body = player.getObjectByName('body');
  const rightArm = player.getObjectByName('rightArm');
  const leftArm = player.getObjectByName('leftArm');
  player.userData.updateIdle = (seconds, amount = 1) => {
    const breath = Math.sin(seconds * 1.35);
    body.scale.set(1 + breath * 0.0015 * amount, 1, 1 + breath * 0.009 * amount);
    [rightArm, leftArm].forEach((arm, index) => {
      arm.rotation.copy(arm.userData.restRotation);
      arm.rotation.x += Math.sin(seconds * 1.35 + index * 0.25) * 0.008 * amount;
      arm.rotation.z += (index ? -1 : 1) * Math.cos(seconds * 1.05) * 0.004 * amount;
    });
    // Head, feet and root stay fixed, so every hat remains attached and there
    // is no full-character bouncing or floating above the ground.
  };
  return player;
}

function vector(value, fallback = 0) {
  if (Array.isArray(value)) return [0, 1, 2].map((i) => Number(value[i]) || 0);
  if (value && typeof value === 'object') return vector(value.vector ?? value.post ?? value.pre, fallback);
  return [fallback, fallback, fallback];
}

function sample(channel, time, fallback = 0) {
  if (!channel) return [fallback, fallback, fallback];
  if (Array.isArray(channel) || channel.vector || channel.post || channel.pre) return vector(channel, fallback);
  const frames = Object.entries(channel).filter(([key]) => Number.isFinite(Number(key)))
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!frames.length) return vector(channel, fallback);
  const nextIndex = frames.findIndex(([key]) => Number(key) > time);
  if (nextIndex === 0) return vector(frames[0][1], fallback);
  if (nextIndex < 0) return vector(frames[frames.length - 1][1], fallback);
  const [ta, a] = frames[nextIndex - 1];
  const [tb, b] = frames[nextIndex];
  let fraction = (time - Number(ta)) / (Number(tb) - Number(ta));
  if (b?.easing === 'easeInOutQuad') fraction = fraction < 0.5
    ? 2 * fraction * fraction : 1 - ((-2 * fraction + 2) ** 2) / 2;
  const va = vector(a, fallback);
  const vb = vector(b, fallback);
  return va.map((value, i) => THREE.MathUtils.lerp(value, vb[i], fraction));
}

function createBedrock(data, texture, modelName, animation) {
  const definition = data['minecraft:geometry'][0];
  const root = new THREE.Group();
  const bones = new Map();
  const material = texturedMaterial(texture);
  const dimensions = [definition.description.texture_width,
    modelName === 'pig_hat' ? 64 : definition.description.texture_height];
  definition.bones.forEach((bone) => {
    const object = new THREE.Group();
    object.name = bone.name;
    object.userData.definition = bone;
    bones.set(bone.name, object);
  });
  definition.bones.forEach((bone) => {
    const object = bones.get(bone.name);
    const parent = bones.get(bone.parent);
    const pivot = bone.pivot || [0, 0, 0];
    const parentPivot = parent?.userData.definition.pivot || [0, 0, 0];
    object.position.set(...pivot.map((value, i) => value - parentPivot[i]));
    object.userData.basePosition = object.position.clone();
    bedrockRotation(object, bone.rotation);
    (parent || root).add(object);
    (bone.cubes || []).forEach((cube) => addCube(object, cube, material, dimensions, pivot));
  });
  root.userData.update = (seconds) => {
    if (!animation) return;
    const time = seconds % (animation.animation_length || 1);
    bones.forEach((object, name) => {
      const channels = animation.bones?.[name];
      if (!channels) return;
      const baseRotation = object.userData.definition.rotation || [0, 0, 0];
      const rotation = sample(channels.rotation, time);
      bedrockRotation(object, baseRotation.map((value, i) => value + rotation[i]));
      const position = sample(channels.position, time);
      object.position.copy(object.userData.basePosition).add(new THREE.Vector3(...position));
      object.scale.set(...sample(channels.scale, time, 1));
    });
  };
  root.userData.animated = Boolean(animation);
  if (modelName.endsWith('_hat')) root.position.y = 24;
  if (modelName === 'vulcano_wings') root.position.y = 19;
  return root;
}

function createHalo() {
  const halo = new THREE.Group();
  halo.position.set(0, 35, 0);
  halo.rotation.x = Math.PI / 2;
  const core = new THREE.Mesh(new THREE.TorusGeometry(4.9, 0.13, 12, 96),
    new THREE.MeshStandardMaterial({ color: 0xc3a0ff, emissive: 0x8a39ff,
      emissiveIntensity: 2, roughness: 0.22, metalness: 0.15 }));
  const glow = new THREE.Mesh(new THREE.TorusGeometry(4.9, 0.29, 12, 96),
    new THREE.MeshBasicMaterial({ color: 0x9245ff, transparent: true, opacity: 0.13,
      depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.add(core, glow);
  return halo;
}

function disposeObject(object) {
  const materials = new Set();
  object.traverse((node) => {
    node.geometry?.dispose();
    if (node.material) (Array.isArray(node.material) ? node.material : [node.material])
      .forEach((material) => materials.add(material));
  });
  materials.forEach((material) => material.dispose());
}

class ModelViewer {
  constructor(container) {
    this.container = container;
    this.interactive = container.id === 'cosmetic-viewer';
    this.dragging = false;
    this.idleWeight = 0;
    this.scene = new THREE.Scene();
    // All geometry stays close to the camera: this range keeps skin depth
    // precise without clipping wings or the outer skin layer.
    this.camera = new THREE.PerspectiveCamera(33, 1, 1, 160);
    this.camera.position.set(0, 21, -74);
    this.camera.lookAt(0, 18, 0);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true,
      powerPreference: 'low-power', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    const canvas = this.renderer.domElement;
    canvas.className = 'cosmo-model-canvas';
    canvas.style.cssText = `display:block;width:100%;height:100%;outline:none;touch-action:${this.interactive ? 'none' : 'pan-y'};cursor:${this.interactive ? 'grab' : 'default'};`;
    canvas.tabIndex = this.interactive ? 0 : -1;
    canvas.setAttribute('role', 'img');
    canvas.addEventListener('webglcontextlost', () => this.fail(new Error('WebGL context lost')));
    container.append(canvas);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x44335d, 2.4));
    const key = new THREE.DirectionalLight(0xfff8ef, 3.1);
    key.position.set(-24, 42, -36);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6c1ff, 1.6);
    fill.position.set(25, 24, -9);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x9860f7, 3.3);
    rim.position.set(0, 34, 22);
    this.scene.add(rim);
    this.stage = new THREE.Group();
    this.stage.position.y = 18;
    this.modelPivot = new THREE.Group();
    this.modelPivot.position.y = -18;
    this.stage.add(this.modelPivot);
    this.scene.add(this.stage);
    this.targetYaw = -0.38;
    this.yaw = this.targetYaw;
    this.targetPitch = 0;
    this.pitch = 0;
    this.visible = true;
    this.dirty = true;
    this.ready = false;
    this.requestId = 0;
    if (this.interactive) this.bindInteraction(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.dirty = true;
    }, { rootMargin: '120px' });
    this.visibilityObserver.observe(container);
    this.attributeObserver = new MutationObserver(() => {
      this.setCharacter(container.dataset.character || container.dataset.modelViewer || 'halo');
    });
    this.attributeObserver.observe(container, { attributes: true,
      attributeFilter: ['data-character', 'data-model-viewer'] });
    this.resize();
    this.readyPromise = this.initialise();
  }

  async initialise() {
    try {
      this.player = createPlayer(await getTexture('skin.png?v=bc2a8bff'));
      if (fallbacks.has(this.container)) return;
      this.modelPivot.add(this.player);
      // Show the real player immediately; retain it while a selected cosmetic
      // loads. Changes also keep the previous accessory until the next is ready.
      this.ready = true;
      this.dirty = true;
      this.render(0);
      await this.setCharacter(this.container.dataset.character || this.container.dataset.modelViewer || 'halo');
      if (fallbacks.has(this.container)) return;
      this.dirty = true;
      this.container.dataset.renderState = 'ready';
      this.container.dispatchEvent(new CustomEvent('modelviewerready', { bubbles: true }));
    } catch (error) {
      this.fail(error);
    }
  }

  fail(error) {
    this.ready = false;
    this.requestId++;
    const alreadyFailed = fallbacks.has(this.container);
    this.container.dataset.renderState = 'error';
    showModelFallback(this.container, this.character);
    if (!alreadyFailed) {
      this.container.dispatchEvent(new CustomEvent('modelviewererror', { detail: error, bubbles: true }));
      console.error('CosmoVisuals model viewer:', error);
    }
  }

  async setCharacter(id) {
    if (fallbacks.has(this.container)) {
      this.character = cosmeticNames[id] ? id : 'halo';
      showModelFallback(this.container, this.character);
      return;
    }
    const pending = this.loadCharacter(id);
    const requestId = this.requestId;
    try { await pending; }
    catch (error) {
      if (requestId === this.requestId) this.fail(error);
    }
  }

  async loadCharacter(id) {
    if (!cosmeticNames[id]) id = 'halo';
    if (id === this.character && this.accessory) return;
    this.character = id;
    const requestId = ++this.requestId;
    let accessory;
    let animatedTexture;
    if (id === 'halo') accessory = createHalo();
    else {
      const nativeName = nativeModels[id];
      const prefix = `cosmetics/${nativeName}/${nativeName}`;
      const [data, originalTexture, animations] = await Promise.all([
        getJSON(`${prefix}.geo.json`), getTexture(`${prefix}.png`),
        nativeName.includes('wings') ? getJSON(`${prefix}.animation.json`) : Promise.resolve(null),
      ]);
      // The pig atlas is an original 15-frame strip; texture transform selects
      // its current frame without modifying or resampling the image.
      let texture = originalTexture;
      if (id === 'pig') {
        texture = originalTexture.clone();
        texture.repeat.y = 1 / 15;
        texture.offset.y = 14 / 15;
        animatedTexture = texture;
      }
      const animation = animations ? Object.values(animations.animations || {})[0] : null;
      accessory = createBedrock(data, texture, nativeName, animation);
    }
    if (requestId !== this.requestId) {
      disposeObject(accessory);
      animatedTexture?.dispose();
      return;
    }
    if (this.accessory) {
      this.modelPivot.remove(this.accessory);
      disposeObject(this.accessory);
      this.animatedTexture?.dispose();
    }
    this.accessory = accessory;
    this.animatedTexture = animatedTexture;
    this.modelPivot.add(accessory);
    this.renderer.domElement.setAttribute('aria-label', `3D-персонаж CosmoVisuals. ${cosmeticNames[id]}.${this.interactive ? ' Перетащите для вращения.' : ''}`);
    // Wings need a little more room horizontally; hats retain consistent scale.
    this.camera.position.z = id.includes('wings') ? -88 : -74;
    this.camera.lookAt(0, 18, 0);
    this.dirty = true;
  }

  bindInteraction(canvas) {
    let drag = null;
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      drag = { x: event.clientX, y: event.clientY };
      this.dragging = true;
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drag) return;
      this.targetYaw += (event.clientX - drag.x) * 0.012;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - (event.clientY - drag.y) * 0.009, -1.1, 1.1);
      // A direct grip follows the pointer in the same frame, with no inertia
      // to keep turning after the pointer stops.
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
      drag = { x: event.clientX, y: event.clientY };
      this.dirty = true;
    });
    const end = () => { drag = null; this.dragging = false; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        this.targetYaw += event.key === 'ArrowLeft' ? -0.18 : 0.18;
        this.dirty = true;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.targetPitch = THREE.MathUtils.clamp(this.targetPitch
          + (event.key === 'ArrowUp' ? 0.18 : -0.18), -1.1, 1.1);
        this.dirty = true;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        this.targetYaw = -0.38;
        this.targetPitch = 0;
        this.dirty = true;
      }
    });
  }

  resize() {
    const bounds = this.container.getBoundingClientRect();
    if (!bounds.width) return;
    const height = bounds.height || 220;
    if (!bounds.height) this.container.style.minHeight = '220px';
    this.renderer.setSize(Math.round(bounds.width), Math.round(height), false);
    this.camera.aspect = bounds.width / height;
    // Fit the model vertically in tall stages and horizontally in narrow CTAs.
    const verticalFov = this.camera.aspect < 0.65 ? 43 : 33;
    this.camera.fov = verticalFov;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  render(seconds) {
    if (!this.ready || !this.visible || document.hidden) return;
    const delta = Math.min(0.05, Math.max(0, seconds - (this.lastFrameSeconds ?? seconds)));
    this.lastFrameSeconds = seconds;
    const moving = Math.abs(this.yaw - this.targetYaw) > 0.0005
      || Math.abs(this.pitch - this.targetPitch) > 0.0005;
    const animated = this.interactive && !reducedMotion.matches
      && (this.accessory?.userData.animated || this.animatedTexture);
    const idle = !reducedMotion.matches && this.container.dataset.idle !== 'off';
    const idleTarget = idle && !this.dragging ? 1 : 0;
    this.idleWeight = reducedMotion.matches ? 0
      : THREE.MathUtils.lerp(this.idleWeight, idleTarget, 1 - Math.exp(-delta / 0.12));
    if (!this.dirty && !moving && !animated && !idle && this.idleWeight < 0.0001) return;
    const easing = reducedMotion.matches || this.dragging ? 1 : 1 - Math.exp(-delta / 0.02);
    this.yaw = moving ? THREE.MathUtils.lerp(this.yaw, this.targetYaw, easing) : this.targetYaw;
    this.pitch = moving ? THREE.MathUtils.lerp(this.pitch, this.targetPitch, easing) : this.targetPitch;
    // Rotate around the torso, rather than swinging the feet around the
    // scene origin. Idle animation only affects the arms and chest.
    this.stage.rotation.y = this.yaw;
    this.stage.rotation.x = this.pitch;
    this.player?.userData.updateIdle?.(seconds, this.idleWeight * (this.interactive ? 1 : 0.45));
    this.accessory?.userData.update?.(animated ? seconds : 0);
    if (this.animatedTexture) {
      const frame = animated ? Math.floor(seconds * 20 / 3) % 15 : 0;
      this.animatedTexture.offset.y = (14 - frame) / 15;
    }
    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }
}

export function initModelViewers(root = document) {
  root.querySelectorAll('[data-model-viewer]').forEach((container) => {
    if (viewers.has(container) || fallbacks.has(container)) return;
    try { viewers.set(container, new ModelViewer(container)); }
    catch (error) {
      container.dataset.renderState = 'unavailable';
      showModelFallback(container);
      container.dispatchEvent(new CustomEvent('modelviewererror', { detail: error, bubbles: true }));
      console.error('CosmoVisuals WebGL:', error);
    }
  });
  return Promise.all([...viewers.values()].map((viewer) =>
    Promise.resolve(viewer.readyPromise).catch((error) => viewer.fail(error))));
}

export function setCharacter(id, target = document.getElementById('cosmetic-viewer')) {
  const viewer = viewers.get(target);
  if (viewer) return viewer.setCharacter(id);
  if (target && fallbacks.has(target)) {
    target.dataset.character = cosmeticNames[id] ? id : 'halo';
    showModelFallback(target);
  }
}

const ready = document.readyState === 'loading'
  ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
  : Promise.resolve();

ready.then(() => {
  initModelViewers();
  document.querySelectorAll('button[data-character]').forEach((button) => {
    button.addEventListener('click', () => {
      const container = document.getElementById('cosmetic-viewer');
      if (container) container.dataset.character = button.dataset.character;
    });
  });
  reducedMotion.addEventListener('change', () => viewers.forEach((viewer) => { viewer.dirty = true; }));
  function frame(time) {
    viewers.forEach((viewer) => {
      try { viewer.render(time / 1000); }
      catch (error) { viewer.fail(error); }
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});

window.CosmoModelViewer = { init: initModelViewers, setCharacter, viewers };
