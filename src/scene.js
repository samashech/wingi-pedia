import * as THREE from 'three';
import { WING_H, HINGE_V } from './wings.js';

export const D = 12; // distance between stations along the flight path
const CAM_BACK = 6; // how far the camera sits from the butterfly in focus
const FOV = 40;

const VERT = /* glsl */ `
uniform float uBend;
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z += uBend * p.x * p.x * 0.45;            // wings curl a little as they beat
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 uFog, uIriC;
uniform float uFogNear, uFogFar, uFade, uGlobal, uSolo, uIri, uSheen, uShade, uCut;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < uCut) discard;
  vec3 c = t.rgb * uShade;
  float l = dot(t.rgb, vec3(0.3, 0.59, 0.11));
  c += uIri * uSheen * (c * 0.4 + uIriC * l * 0.3); // structural colour: brightens with the angle
  float f = smoothstep(uFogNear, uFogFar, vDepth);
  c = mix(c, uFog, f * 0.94);
  gl_FragColor = vec4(c, t.a * uFade * mix(uGlobal, 1.0, uSolo) * (1.0 - f * 0.92));
}`;

const wingGeo = new THREE.PlaneGeometry(1, WING_H, 10, 1).translate(0.5, HINGE_V - WING_H / 2, 0);
const bodyGeo = new THREE.PlaneGeometry(0.5, WING_H).translate(0, HINGE_V - WING_H / 2, 0.004);
const sideGeo = new THREE.PlaneGeometry(0.09, WING_H).translate(0, HINGE_V - WING_H / 2, 0);
{
  const uv = sideGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + (uv.getX(i) - 0.5) * 0.18);
  sideGeo.rotateY(Math.PI / 2);
}

const hexV = (h) => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

class Fly {
  constructor(sp, tex, shared) {
    const mk = (map, cut, depthWrite) =>
      new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite, side: THREE.DoubleSide,
        uniforms: {
          map: { value: map }, uFog: shared.fog, uFogNear: shared.near, uFogFar: shared.far, uGlobal: shared.global,
          uFade: { value: 1 }, uSolo: { value: 0 }, uBend: { value: 0 }, uSheen: { value: 0 }, uShade: { value: 1 },
          uIri: { value: 0 }, uIriC: { value: hexV(sp.iriC || '#ffffff') }, uCut: { value: cut },
        },
      });
    this.sp = sp;
    this.mat = mk(tex.wing, sp.glass ? 0.01 : 0.3, !sp.glass);
    this.mat.uniforms.uIri.value = sp.iri || 0;
    this.bmat = mk(tex.body, 0.3, true);
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.inner = new THREE.Group();
    this.wR = new THREE.Mesh(wingGeo, this.mat);
    this.wL = new THREE.Mesh(wingGeo, this.mat);
    this.wL.scale.x = -1;
    this.inner.add(this.wR, this.wL, new THREE.Mesh(bodyGeo, this.bmat), new THREE.Mesh(sideGeo, this.bmat));
    this.group.add(this.inner);
    this.phase = 0;
  }
  flap(a) {
    this.wR.rotation.y = -a;
    this.wL.rotation.y = a;
    const u = this.mat.uniforms;
    u.uBend.value = a * 0.55;
    u.uShade.value = 0.8 + 0.2 * Math.cos(a);
    u.uSheen.value = 0.5 + 0.5 * Math.sin(a * 2.6 + 0.6);
  }
  fade(f) {
    this.mat.uniforms.uFade.value = f;
    this.bmat.uniforms.uFade.value = f;
    this.group.visible = f > 0.004;
  }
  solo(v) {
    this.mat.uniforms.uSolo.value = v;
    this.bmat.uniforms.uSolo.value = v;
  }
}

export class Scene {
  constructor(canvas, species, textures) {
    this.species = species;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // textures are passed through untouched
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
    this.shared = { fog: { value: new THREE.Vector3(1, 1, 1) }, near: { value: 7 }, far: { value: 27 }, global: { value: 1 } };
    this.globalTarget = 1;
    this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    this.s = -1;
    this.hover = -1;
    this.frozen = false;

    const max = this.renderer.capabilities.getMaxAnisotropy();
    this.tex = textures.map((t) => {
      const wing = new THREE.CanvasTexture(t.wing);
      wing.anisotropy = max;
      const body = new THREE.CanvasTexture(t.body);
      return { wing, body };
    });

    this.stations = species.map((sp, i) => {
      const f = new Fly(sp, this.tex[i], this.shared);
      f.i = i;
      f.side = i % 2 ? -1 : 1;
      f.hoverK = 0;
      f.appear = 1;
      this.scene.add(f.group);
      return f;
    });

    // ambient butterflies: a crowd over the title page, then a few companions along the route
    const r = rng(7);
    this.ambient = [];
    const add = (spi, home, size, rad) => {
      const f = new Fly(species[spi], this.tex[spi], this.shared);
      Object.assign(f, {
        home, rad, k: size * species[spi].size,
        w: [0.25 + r() * 0.3, 0.35 + r() * 0.35, 0.2 + r() * 0.3], p: [r() * 6.3, r() * 6.3, r() * 6.3],
        speed: 9 + r() * 6, prev: new THREE.Vector3(),
      });
      f.phase = r() * 6;
      this.scene.add(f.group);
      this.ambient.push(f);
    };
    const n = species.length;
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + r() * 0.3, rad = 2.2 + r() * 3.4;
      add(Math.floor((i / 18) * n + r() * 2) % n, [Math.cos(ang) * rad * 1.15, Math.sin(ang) * rad * 0.6, D - 3.5 + r() * 6.5], 0.4 + r() * 0.32, [1.1, 0.7, 1.4]);
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) {
        const side = (i + j) % 2 ? 1 : -1;
        add(clamp(i + (r() < 0.5 ? 0 : 1), 0, n - 1), [side * (1.2 + r() * 3.2), (r() - 0.4) * 3, -i * D - 2 - r() * 8], 0.2 + r() * 0.16, [1.6, 0.9, 2.2]);
      }
    }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.halfH = CAM_BACK * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.halfW = this.halfH * this.camera.aspect;
    this.wide = this.camera.aspect > 0.95;
  }

  setFog(r, g, b) { this.shared.fog.value.set(r, g, b); }
  dim(on) { this.globalTarget = on ? 0 : 1; }

  stationScale(f) {
    const base = f.sp.size * 0.95;
    return this.wide ? Math.min(base, this.halfW * 0.42) : Math.min(base * 0.8, this.halfW * 0.82);
  }

  frame(t, dt) {
    const cam = this.camera, m = this.mouse;
    m.sx += (m.x - m.sx) * Math.min(1, dt * 3);
    m.sy += (m.y - m.sy) * Math.min(1, dt * 3);
    this.shared.global.value += (this.globalTarget - this.shared.global.value) * Math.min(1, dt * 7);

    if (!this.frozen) {
      const s = this.s, fl = Math.floor(s), fr = s - fl;
      this.sE = fl + fr * 0.4 + 0.6 * fr * fr * (3 - 2 * fr); // linger at each butterfly
      cam.position.set(m.sx * 0.3, -m.sy * 0.18 + Math.sin(t * 0.4) * 0.05, CAM_BACK - this.sE * D);
      cam.lookAt(m.sx * 0.1, 0, cam.position.z - 10);
      cam.updateMatrixWorld();
    }
    const sE = this.sE;

    for (const f of this.stations) {
      if (f.lock) { this.runLock(f, t); continue; }
      const rel = f.i - sE;
      if (Math.abs(rel) > 2.3) { f.group.visible = false; continue; }
      const far = clamp(rel), gone = clamp(-rel * 2.4);
      const dist = rel * D + CAM_BACK;
      f.hoverK += ((this.hover === f.i ? 1 : 0) - f.hoverK) * Math.min(1, dt * 8);
      f.appear = Math.min(1, f.appear + dt * 1.8);
      f.phase += dt * (2.3 + far * 7 + gone * 9 + f.hoverK * 5);
      const amp = 0.42 + far * 0.45 + gone * 0.4;
      f.flap(0.36 + far * 0.1 + Math.sin(f.phase) * amp * (0.75 + 0.25 * Math.sin(f.phase * 0.31)));
      const x = this.wide ? f.side * Math.min(2.0, this.halfW * 0.5) : 0, y = this.wide ? 0.05 : 0.95;
      f.group.position.set(
        x + f.side * far * far * 0.9 + f.side * gone * 1.2,
        y + Math.sin(t * 1.3 + f.i) * 0.06 + far * far * 0.7 + gone * 1.6,
        -f.i * D + gone * 1.5
      );
      f.group.rotation.set(0, -f.side * (this.wide ? 0.32 : 0) + rel * f.side * -1.1 + m.sx * 0.3, f.side * (0.06 + far * 0.25) + Math.sin(t * 0.9 + f.i) * 0.03);
      f.inner.rotation.x = -0.5 - far * 0.55 - gone * 0.5 + m.sy * 0.2;
      const e = 1 - Math.pow(1 - f.appear, 3);
      f.group.scale.setScalar(this.stationScale(f) * (1 + f.hoverK * 0.05) * (0.4 + 0.6 * e));
      f.fade(sstep(1.0, 3.0, dist) * e);
    }

    const cz = cam.position.z;
    for (const f of this.ambient) {
      const dz = cz - f.home[2];
      if (dz < -4 || dz > 30) { f.group.visible = false; continue; }
      const g = f.group;
      const x = f.home[0] + Math.sin(t * f.w[0] + f.p[0]) * f.rad[0] + Math.sin(t * f.w[1] * 2.1 + f.p[2]) * 0.3;
      const y = f.home[1] + Math.sin(t * f.w[1] + f.p[1]) * f.rad[1];
      const z = f.home[2] + Math.cos(t * f.w[2] + f.p[2]) * f.rad[2];
      f.phase += dt * f.speed * (0.75 + 0.25 * Math.sin(t * 0.8 + f.p[0]));
      const a = 0.3 + Math.sin(f.phase) * 0.95;
      f.flap(a);
      const vx = x - f.prev.x, vy = y - f.prev.y, vz = z - f.prev.z;
      f.prev.set(x, y, z);
      g.position.set(x, y + Math.cos(f.phase) * 0.035, z);
      if (vx * vx + vz * vz > 1e-9) {
        let d = Math.atan2(-vx, -vz) - g.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        g.rotation.y += d * Math.min(1, dt * 4);
        g.rotation.z = clamp(-d * 2, -0.7, 0.7);
      }
      f.inner.rotation.x = -Math.PI / 2 + 0.5 + clamp(vy * 40, -0.4, 0.4);
      g.scale.setScalar(f.k);
      f.fade(sstep(0.6, 2.2, cz - z));
    }
    this.renderer.render(this.scene, cam);
  }

  // which butterfly (if any) is under the pointer
  hoverTest(px, py) {
    const i = Math.round(this.sE ?? -1);
    const f = this.stations[i];
    if (!f || f.lock || Math.abs(i - this.sE) > 0.3) return -1;
    const v = f.group.position.clone().project(this.camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth, y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const pxPerUnit = window.innerHeight / (2 * this.halfH);
    const rad = f.group.scale.x * 0.8 * pxPerUnit;
    return Math.hypot(px - x, (py - y) * 1.25) < rad ? i : -1;
  }

  // world transform that makes a butterfly cover a screen rectangle exactly (used to land on the book plate)
  screenTarget(rect) {
    const cam = this.camera, d = 4;
    const nx = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
    const ny = -(((rect.top + rect.height * (HINGE_V / WING_H)) / window.innerHeight) * 2 - 1);
    const dir = new THREE.Vector3(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const pos = cam.position.clone().addScaledVector(dir, d / dir.dot(fwd));
    const unitsPerPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / window.innerHeight;
    return { pos, quat: cam.quaternion.clone(), scale: (rect.width * unitsPerPx) / 2 };
  }

  flyTo(i, rect, dur = 1.0) {
    const f = this.stations[i], g = f.group;
    this.frozen = true;
    f.solo(1);
    f.fade(1);
    return new Promise((resolve) => {
      f.lock = {
        t0: null, dur, resolve, to: this.screenTarget(rect),
        from: { pos: g.position.clone(), quat: g.quaternion.clone(), scale: g.scale.x, ix: f.inner.rotation.x, a: f.wR.rotation.y * -1 },
      };
    });
  }

  runLock(f, t) {
    const L = f.lock;
    if (L.t0 === null) L.t0 = t;
    const k = clamp((t - L.t0) / L.dur), e = ease(k);
    const g = f.group;
    g.position.lerpVectors(L.from.pos, L.to.pos, e);
    g.position.y += Math.sin(k * Math.PI) * 0.35;
    g.quaternion.slerpQuaternions(L.from.quat, L.to.quat, e);
    g.scale.setScalar(L.from.scale + (L.to.scale - L.from.scale) * e);
    f.inner.rotation.x = L.from.ix * (1 - e);
    f.flap(L.from.a * (1 - e) + Math.sin(k * Math.PI * 5) * 0.75 * (1 - k) * (1 - k));
    f.mat.uniforms.uSheen.value *= 1 - e;
    f.mat.uniforms.uShade.value += (1 - f.mat.uniforms.uShade.value) * e;
    if (k >= 1 && L.resolve) { L.resolve(); L.resolve = null; }
  }

  // hand the butterfly back to the scroll choreography
  release(i, show = true) {
    const f = this.stations[i];
    if (!f) return;
    f.lock = null;
    f.solo(0);
    f.group.rotation.set(0, 0, 0);
    f.appear = show ? 0 : 1;
    this.frozen = false;
  }
  hide(i) { this.stations[i].group.visible = false; this.stations[i].fade(0); }
}
