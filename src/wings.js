// Procedural wing painter.
// Every butterfly is described as a wing outline plus a stack of pattern layers
// written in "wing space": t runs from the wing base (0) to the margin (1),
// u runs from the leading edge (0) to the trailing edge (1). Nothing is a photo.

export const TW = 512;          // texture width  = 1 wing unit
export const TH = 608;          // texture height
export const HY = 256;          // hinge (wing root) y in pixels
export const WING_H = TH / TW;  // plane height in wing units
export const HINGE_V = HY / TW; // distance from top of plane to hinge, in units

const N = 720, A = 2.3; // polar table: N bins over [-A, A] radians

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ss = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/* ---------- outlines ---------- */

const SHAPES = {
  broad: {
    fore: { ax: 0.93, ay: -0.44, tx: 0.72, ty: 0.1, cb: 0.1, mb: 0.02 },
    hind: { hx: 0.66, hy: 0.05, bx: 0.4, by: 0.56, ax: 0.08, ay: 0.42, mb: 0.12, scn: 7, sc: 0.025 },
  },
  monarch: {
    fore: { ax: 0.97, ay: -0.4, tx: 0.66, ty: 0.1, cb: 0.08, mb: -0.01 },
    hind: { hx: 0.62, hy: 0.06, bx: 0.36, by: 0.52, ax: 0.08, ay: 0.4, mb: 0.12 },
  },
  swallow: {
    fore: { ax: 0.94, ay: -0.46, tx: 0.66, ty: 0.08, cb: 0.06, mb: -0.02 },
    hind: { hx: 0.56, hy: 0.06, bx: 0.34, by: 0.48, ax: 0.08, ay: 0.4, mb: 0.1, scn: 7, sc: 0.05, tails: [{ u: 0.64, h: 0.36, w: 0.04 }] },
  },
  birdwing: {
    fore: { ax: 0.99, ay: -0.36, tx: 0.6, ty: 0.1, cb: 0.1, mb: -0.03 },
    hind: { hx: 0.5, hy: 0.08, bx: 0.3, by: 0.42, ax: 0.07, ay: 0.34, mb: 0.09 },
  },
  longwing: {
    fore: { ax: 0.98, ay: -0.37, tx: 0.68, ty: 0.06, cb: 0.1, mb: 0.07 },
    hind: { hx: 0.58, hy: 0.07, bx: 0.38, by: 0.37, ax: 0.08, ay: 0.29, mb: 0.09 },
  },
  round: {
    fore: { ax: 0.82, ay: -0.44, tx: 0.66, ty: 0.1, cb: 0.1, mb: 0.08 },
    hind: { hx: 0.6, hy: 0.06, bx: 0.36, by: 0.52, ax: 0.08, ay: 0.4, mb: 0.14 },
  },
  small: {
    fore: { ax: 0.8, ay: -0.42, tx: 0.66, ty: 0.08, cb: 0.08, mb: 0.07 },
    hind: { hx: 0.58, hy: 0.06, bx: 0.36, by: 0.48, ax: 0.08, ay: 0.38, mb: 0.13 },
  },
  angle: {
    fore: { ax: 0.92, ay: -0.46, tx: 0.66, ty: 0.1, cb: 0.08, mb: -0.03, scn: 5, sc: 0.02 },
    hind: { hx: 0.62, hy: 0.05, bx: 0.38, by: 0.52, ax: 0.08, ay: 0.4, mb: 0.12, scn: 7, sc: 0.04 },
  },
};

function bez(p0, c1, c2, p1, out, n = 40) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, m = 1 - t;
    out.push([
      m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p1[0],
      m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
}

function foreOutline(s) {
  const { ax, ay, tx, ty, cb, mb } = s;
  const pts = [[0, -0.04]];
  bez([0, -0.04], [ax * 0.3, ay * 0.75 - cb], [ax * 0.75, ay * 1.04 - cb * 0.3], [ax, ay], pts);
  bez([ax, ay], [ax + mb + 0.02, ay + (ty - ay) * 0.3], [tx + mb + 0.03, ay + (ty - ay) * 0.75], [tx, ty], pts);
  bez([tx, ty], [tx * 0.66, ty + 0.02], [tx * 0.3, 0.05], [0, 0.03], pts);
  return pts;
}

function hindOutline(s) {
  const { hx, hy, bx, by, ax, ay, mb } = s;
  const pts = [[0, 0]];
  bez([0, 0], [hx * 0.4, hy - 0.1], [hx * 0.8, hy - 0.06], [hx, hy], pts);
  bez([hx, hy], [hx + mb, hy + (by - hy) * 0.35], [bx + mb * 1.2, by - (by - hy) * 0.15], [bx, by], pts);
  bez([bx, by], [bx - 0.12, by + 0.04], [ax + 0.05, ay + 0.03], [ax, ay], pts);
  bez([ax, ay], [ax - 0.05, ay - 0.1], [0, 0.2], [0, 0.08], pts);
  return pts;
}

function makeWing(pts, ox, oy, s) {
  const R = new Float32Array(N);
  let Rmax = 0;
  for (let i = 0; i < N; i++) {
    const th = -A + (2 * A * i) / (N - 1);
    const dx = Math.cos(th), dy = Math.sin(th);
    let best = 0;
    for (let j = 0; j < pts.length; j++) {
      const a = pts[j], b = pts[(j + 1) % pts.length];
      const x0 = a[0] - ox, y0 = a[1] - oy, ex = b[0] - a[0], ey = b[1] - a[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const lam = (x0 * ey - y0 * ex) / den;
      const k = (x0 * dy - y0 * dx) / den;
      if (k >= 0 && k <= 1 && lam > best) best = lam;
    }
    R[i] = best;
    if (best > Rmax) Rmax = best;
  }
  let i0 = 0, i1 = N - 1;
  while (R[i0] < 0.45 * Rmax) i0++;
  while (R[i1] < 0.45 * Rmax) i1--;
  const th0 = -A + (2 * A * i0) / (N - 1), th1 = -A + (2 * A * i1) / (N - 1);
  // tails and scallops are modifiers on the radius
  for (let i = 0; i < N; i++) {
    const th = -A + (2 * A * i) / (N - 1);
    const u = (th - th0) / (th1 - th0);
    let m = 1;
    if (s.tails) for (const t of s.tails) m += t.h * Math.exp(-(((u - t.u) / t.w) ** 2));
    if (s.sc && u > 0.02 && u < 0.98) m -= s.sc * (1 - Math.abs(Math.cos(Math.PI * s.scn * u)));
    R[i] *= m;
  }
  return { ox, oy, R, th0, th1, span: th1 - th0 };
}

const lookup = (W, th) => {
  const f = ((th + A) / (2 * A)) * (N - 1);
  if (f <= 0 || f >= N - 1) return 0;
  const i = f | 0;
  return W.R[i] + (W.R[i + 1] - W.R[i]) * (f - i);
};
const place = (W, t, u) => {
  const th = W.th0 + u * W.span, r = lookup(W, th) * t;
  return { x: W.ox + r * Math.cos(th), y: W.oy + r * Math.sin(th) };
};

/* ---------- pattern layers ---------- */

function compile(layers, wings) {
  return layers.map((L) => {
    const o = { ...L, on: L.on || 'b' };
    if (L.c) o.rgb = hex(L.c);
    if (L.k === 'g') o.stops = L.s.map(([t, c]) => [t, hex(c)]);
    if (L.k === 'd' || L.k === 'e') {
      o.pts = [];
      for (const id of o.on === 'b' ? ['f', 'h'] : [o.on]) {
        if (L.k === 'e') o.pts.push({ id, ...place(wings[id], L.t, L.u) });
        else {
          const [u0, u1] = L.u || [0.08, 0.92];
          for (let i = 0; i < L.n; i++) {
            const uu = L.n === 1 ? (u0 + u1) / 2 : u0 + ((u1 - u0) * i) / (L.n - 1);
            o.pts.push({ id, ...place(wings[id], L.t + (L.arc || 0) * Math.sin((Math.PI * i) / Math.max(1, L.n - 1)), uu) });
          }
        }
      }
      if (L.k === 'e') o.rings = L.rings.map(([f, c]) => [f, hex(c)]);
    }
    return o;
  });
}

const px = { r: 0, g: 0, b: 0, a: 1 };

function shade(Ls, id, t, u, r, x, y, W) {
  let R = 0, G = 0, B = 0, Al = 1;
  for (let li = 0; li < Ls.length; li++) {
    const L = Ls[li];
    if (L.on !== 'b' && L.on !== id) continue;
    let al = 0, c = L.rgb;
    switch (L.k) {
      case 'g': {
        const S = L.stops;
        let k = 0;
        while (k < S.length - 2 && t > S[k + 1][0]) k++;
        const f = Math.min(1, Math.max(0, (t - S[k][0]) / (S[k + 1][0] - S[k][0])));
        R = S[k][1][0] + (S[k + 1][1][0] - S[k][1][0]) * f;
        G = S[k][1][1] + (S[k + 1][1][1] - S[k][1][1]) * f;
        B = S[k][1][2] + (S[k + 1][1][2] - S[k][1][2]) * f;
        Al = L.a ?? 1;
        continue;
      }
      case 'r': {
        const tt = t + (L.wob ? L.wob * Math.sin(u * (L.wf || 8) * 6.2832 + (L.ph || 0)) : 0);
        const st = L.st ?? 0.015, su = L.su ?? 0.02;
        const T = L.t || [-9, 9], Uu = L.u || [-9, 9];
        al = ss(T[0] - st, T[0] + st, tt) * (1 - ss(T[1] - st, T[1] + st, tt)) * ss(Uu[0] - su, Uu[0] + su, u) * (1 - ss(Uu[1] - su, Uu[1] + su, u));
        break;
      }
      case 'm': {
        const w = L.w * (1 + (L.sc ? L.sc * Math.cos(u * L.scn * 6.2832) : 0));
        al = ss(1 - w - 0.012, 1 - w + 0.012, t);
        break;
      }
      case 'v': {
        const f = u * L.n + 0.5, fr = f - Math.floor(f);
        const d = (Math.abs(fr - 0.5) / L.n) * W.span * r;
        const w = L.w * (0.6 + 0.8 * t);
        al = (1 - ss(w * 0.5, w, d)) * ss(L.t0 ?? 0.05, (L.t0 ?? 0.05) + 0.12, t);
        break;
      }
      case 'th': {
        const Uu = L.u || [0, 1];
        const f = ((u - Uu[0]) / (Uu[1] - Uu[0])) * L.n;
        if (f < 0 || f > L.n) break;
        const tri = 1 - Math.abs(2 * (f - Math.floor(f)) - 1);
        const top = L.t[0] + (L.t[1] - L.t[0]) * (0.25 + 0.75 * tri);
        al = ss(L.t[0] - 0.01, L.t[0] + 0.01, t) * (1 - ss(top - 0.012, top + 0.012, t)) * ss(0.04, 0.14, tri);
        break;
      }
      case 'd': {
        for (let i = 0; i < L.pts.length; i++) {
          const p = L.pts[i];
          if (p.id !== id) continue;
          const dx = x - p.x, dy = y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          const a = 1 - ss(L.r * 0.8, L.r * 1.08, d);
          if (a > al) al = a;
        }
        break;
      }
      case 'e': {
        for (let i = 0; i < L.pts.length; i++) {
          const p = L.pts[i];
          if (p.id !== id) continue;
          const dx = x - p.x, dy = (y - p.y) * (L.sq || 1);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > L.r * 1.1) continue;
          for (let k = 0; k < L.rings.length; k++) {
            const rr = L.rings[k][0] * L.r, cc = L.rings[k][1];
            // inner rings sit slightly off-centre, like a real ocellus
            const ex = k > 1 ? dx + L.r * 0.06 : dx, ey = k > 1 ? dy + L.r * 0.06 : dy;
            const dd = k > 1 ? Math.sqrt(ex * ex + ey * ey) : d;
            const a = 1 - ss(rr - 0.004, rr + 0.004, dd);
            R += (cc[0] - R) * a; G += (cc[1] - G) * a; B += (cc[2] - B) * a;
            Al += (1 - Al) * a;
          }
        }
        continue;
      }
      case 'n': {
        const v = noise(x * L.f, y * L.f) * 0.6 + noise(x * L.f * 2.7, y * L.f * 2.7) * 0.4;
        al = ss(L.lo ?? 0.45, L.hi ?? 0.7, v);
        break;
      }
    }
    al *= L.a ?? 1;
    if (al <= 0) continue;
    R += (c[0] - R) * al; G += (c[1] - G) * al; B += (c[2] - B) * al;
    Al += (1 - Al) * al;
  }
  px.r = R; px.g = G; px.b = B; px.a = Al;
}

/* ---------- painting ---------- */

export function paintWing(spec) {
  const base = SHAPES[spec.shape.base];
  const fs = { ...base.fore, ...(spec.shape.fore || {}) };
  const hs = { ...base.hind, ...(spec.shape.hind || {}) };
  const F = makeWing(foreOutline(fs), -0.02, -0.01, fs);
  const H = makeWing(hindOutline(hs), -0.02, 0.03, hs);
  const Ls = compile(spec.layers, { f: F, h: H });
  const edge = hex(spec.edge || '#15100c');
  const edgeA = spec.edgeA ?? 0.6;

  const cv = document.createElement('canvas');
  cv.width = TW; cv.height = TH;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(TW, TH);
  const D = img.data;

  for (let py = 0; py < TH; py++) {
    for (let pxl = 0; pxl < TW; pxl++) {
      const x = (pxl + 0.5) / TW, y = (py + 0.5 - HY) / TW;
      let dx = x - F.ox, dy = y - F.oy;
      const rf = Math.sqrt(dx * dx + dy * dy), thf = Math.atan2(dy, dx), Rf = lookup(F, thf);
      const covF = Rf > 0 ? Math.min(1, Math.max(0, ((Rf - rf) * TW) / 1.4 + 0.5)) : 0;
      dx = x - H.ox; dy = y - H.oy;
      const rh = Math.sqrt(dx * dx + dy * dy), thh = Math.atan2(dy, dx), Rh = lookup(H, thh);
      const covH = Rh > 0 ? Math.min(1, Math.max(0, ((Rh - rh) * TW) / 1.4 + 0.5)) : 0;
      if (covF <= 0 && covH <= 0) continue;

      let r = 0, g = 0, b = 0, a = 0;
      const finish = (id, t, u, rr, W) => {
        shade(Ls, id, t, u, rr, x, y, W);
        const grain = 1 + 0.045 * Math.sin(u * 210 + noise(x * 40, y * 40) * 4) * ss(0.1, 0.4, t) + (hash(pxl, py) - 0.5) * 0.05;
        const k = (0.7 + 0.3 * ss(0, 0.22, t)) * grain;
        const e = ss(0.965, 0.99, t) * edgeA;
        px.r = px.r * k + (edge[0] - px.r * k) * e;
        px.g = px.g * k + (edge[1] - px.g * k) * e;
        px.b = px.b * k + (edge[2] - px.b * k) * e;
        px.a += (1 - px.a) * e;
      };
      if (covH > 0) {
        finish('h', rh / Rh, (thh - H.th0) / H.span, rh, H);
        // the forewing throws a soft shadow on the hindwing beneath it
        const sh = Rf > 0 ? 1 - 0.35 * (1 - ss(1.0, 1.07, rf / Rf)) : 1;
        r = px.r * sh; g = px.g * sh; b = px.b * sh; a = px.a * covH;
      }
      if (covF > 0) {
        finish('f', rf / Rf, (thf - F.th0) / F.span, rf, F);
        const fa = px.a * covF, oa = fa + a * (1 - fa);
        if (oa > 0) {
          r = (px.r * fa + r * a * (1 - fa)) / oa;
          g = (px.g * fa + g * a * (1 - fa)) / oa;
          b = (px.b * fa + b * a * (1 - fa)) / oa;
        }
        a = oa;
      }
      const o = (py * TW + pxl) * 4;
      D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// Body, drawn in wing units around (cx, cy) at `s` pixels per unit.
export function drawBody(ctx, cx, cy, s, body = {}, antennae = true) {
  const c = body.c || '#1b1613', abd = body.abd || c, head = body.head || c, len = body.len || 0.34;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  if (antennae) {
    ctx.strokeStyle = c; ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      ctx.lineWidth = 0.006;
      ctx.beginPath();
      ctx.moveTo(d * 0.012, -0.125);
      ctx.bezierCurveTo(d * 0.03, -0.24, d * 0.09, -0.33, d * 0.15, -0.385);
      ctx.stroke();
      ctx.lineWidth = 0.014;
      ctx.beginPath();
      ctx.moveTo(d * 0.138, -0.374);
      ctx.lineTo(d * 0.153, -0.388);
      ctx.stroke();
    }
  }
  const lg = (col) => {
    const g = ctx.createLinearGradient(-0.04, 0, 0.04, 0);
    g.addColorStop(0, '#000');
    g.addColorStop(0.45, col);
    g.addColorStop(1, '#000');
    return g;
  };
  // abdomen
  ctx.fillStyle = lg(abd);
  ctx.beginPath();
  ctx.moveTo(-0.026, 0.02);
  ctx.bezierCurveTo(-0.034, len * 0.45, -0.014, len * 0.95, 0, len);
  ctx.bezierCurveTo(0.014, len * 0.95, 0.034, len * 0.45, 0.026, 0.02);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.004;
  for (let i = 1; i < 7; i++) {
    const yy = 0.04 + ((len - 0.07) * i) / 7;
    ctx.beginPath(); ctx.moveTo(-0.028, yy); ctx.quadraticCurveTo(0, yy + 0.012, 0.028, yy); ctx.stroke();
  }
  // thorax
  ctx.fillStyle = lg(c);
  ctx.beginPath(); ctx.ellipse(0, -0.028, 0.037, 0.078, 0, 0, 6.3); ctx.fill();
  // head
  ctx.fillStyle = lg(head);
  ctx.beginPath(); ctx.ellipse(0, -0.118, 0.026, 0.024, 0, 0, 6.3); ctx.fill();
  ctx.restore();
}

// A flat, pinned specimen: both wing pairs plus the body. Used for the book plate and the cabinet.
export function drawSpecimen(wingCanvas, body, scale = 1, shadow = true) {
  const w = Math.round(TW * 2 * scale), h = Math.round(TH * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (shadow) {
    ctx.shadowColor = 'rgba(40,25,10,.38)';
    ctx.shadowBlur = 14 * scale;
    ctx.shadowOffsetX = 5 * scale;
    ctx.shadowOffsetY = 9 * scale;
  }
  ctx.drawImage(wingCanvas, w / 2, 0, TW * scale, h);
  ctx.save();
  ctx.translate(w / 2, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(wingCanvas, 0, 0, TW * scale, h);
  ctx.restore();
  drawBody(ctx, w / 2, HY * scale, TW * scale, body);
  return cv;
}

export function bodyTexture(body) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = TH;
  drawBody(cv.getContext('2d'), 128, HY, TW, body);
  return cv;
}
