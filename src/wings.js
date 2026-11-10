// Procedural wing painter.
// Every butterfly is described as a wing outline plus a stack of pattern layers
// written in "wing space": t runs from the wing base (0) to the margin (1),
// u runs from the leading edge (0) to the trailing edge (1). A few species are photographs
// instead (see loadPhoto); the painted wing is their fallback.

export const TW = 512;          // texture width  = 1 wing unit
export const TH = 608;          // texture height
export const HY = 256;          // hinge (wing root) y in pixels
export const WING_H = TH / TW;  // plane height in wing units
export const HINGE_V = HY / TW; // distance from top of plane to hinge, in units

const N = 720, A = 2.3; // polar table: N bins over [-A, A] radians

const hex = (h) => {
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
};
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
// discal cell per wing: [where it closes (t), its leading boundary (u), its trailing boundary (u)]
const FCELL = [0.46, 0.2, 0.56], HCELL = [0.42, 0.26, 0.62];

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
        // Real venation: a closed discal cell near the base, veins leaving its outer end,
        // and the outer veins branching off the cell's two boundary veins. Thick at the root.
        const [cT, c0, c1] = (L.cell && L.cell[id]) || (id === 'f' ? FCELL : HCELL);
        const k = W.span * r, rad = r / Math.max(t, 1e-3);
        let d = 9;
        if (t < cT + 0.005) d = Math.min(Math.abs(u - c0), Math.abs(u - c1)) * k;
        if (u > c0 && u < c1) d = Math.min(d, Math.abs(t - cT - 0.035 * Math.sin((Math.PI * (u - c0)) / (c1 - c0))) * rad);
        for (let j = 1; j < L.n; j++) {
          const uk = j / L.n;
          let uu;
          if (uk > c0 && uk < c1) {
            if (t < cT) continue;
            uu = uk;
          } else {
            const ub = uk <= c0 ? c0 : c1;
            const tb = 0.08 + cT * 0.85 * Math.max(0, 1 - Math.abs(uk - ub) * 2.6);
            if (t < tb) continue;
            uu = ub + (uk - ub) * Math.pow(Math.min(1, (t - tb) / (1 - tb)), 0.55);
          }
          const dd = Math.abs(u - uu) * k;
          if (dd < d) d = dd;
        }
        const w = L.w * (1.45 - 0.75 * t);
        al = (1 - ss(w * 0.45, w, d)) * ss(L.t0 ?? 0.05, (L.t0 ?? 0.05) + 0.12, t);
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
  const bodyC = hex((spec.body && (spec.body.c)) || '#1b1613');
  const FR = spec.fringe ?? 0.014; // width of the hair fringe beyond the scaled margin, in wing units
  const fringeC = spec.fringeC ? hex(spec.fringeC) : null;
  const veinN = (spec.layers.find((L) => L.k === 'v') || { n: 9 }).n;
  const hairA = spec.hairA ?? 0.55;

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
      const covF = Rf > 0 ? Math.min(1, Math.max(0, ((Rf + FR - rf) * TW) / 1.4 + 0.5)) : 0;
      dx = x - H.ox; dy = y - H.oy;
      const rh = Math.sqrt(dx * dx + dy * dy), thh = Math.atan2(dy, dx), Rh = lookup(H, thh);
      const covH = Rh > 0 ? Math.min(1, Math.max(0, ((Rh + FR - rh) * TW) / 1.4 + 0.5)) : 0;
      if (covF <= 0 && covH <= 0) continue;

      // Scales are laid like roof tiles, so no colour boundary is a clean line: warp pattern space a little.
      const w1 = noise(x * 22, y * 22) - 0.5, w2 = noise(x * 22 + 31.7, y * 22 + 7.3) - 0.5;
      const w3 = noise(x * 70, y * 70) - 0.5, w4 = noise(x * 70 + 13.1, y * 70 + 41.9) - 0.5;
      const wx = (w1 * 0.75 + w3 * 0.25) * 0.016, wy = (w2 * 0.75 + w4 * 0.25) * 0.016;
      const sx = x + wx, sy = y + wy;

      let r = 0, g = 0, b = 0, a = 0;
      const finish = (id, t, u, rr, W) => {
        const R0 = rr / Math.max(t, 1e-6);
        // Along the forewing's inner edge the rays from the root run nearly parallel to the outline,
        // which squeezes every band into a thin seam. Measure there against a ray further in.
        let tp = t;
        if (id === 'f' && u > 0.86) {
          const Ri = lookup(W, W.th0 + 0.86 * W.span);
          tp = t + (Math.min(rr / Ri, 1.2) - t) * ss(0.86, 0.95, u);
        }
        const tw = tp + (wx * 0.9 + wy * 0.6) / Math.max(R0, 0.1);
        const uw = u + (wy * 0.9 - wx * 0.6) / Math.max(R0 * W.span * Math.max(t, 0.15), 0.05);
        shade(Ls, id, tw, uw, rr, sx, sy, W);
        // fine striations along the scale rows, and per-pixel dust
        const grain = 1 + 0.05 * Math.sin(u * 230 + noise(x * 40, y * 40) * 5) * ss(0.1, 0.4, t) + (hash(pxl, py) - 0.5) * 0.07 + (noise(x * 160, y * 160) - 0.5) * 0.06;
        const k = (0.7 + 0.3 * ss(0, 0.22, t)) * grain;
        // only the outer margins carry a fringe; the costa and the inner edges end clean
        const fu = ss(0.05, 0.13, u) * (1 - ss(0.84, 0.94, u));
        const e = ss(0.955, 0.99, t) * edgeA * (1 - ss(1.0, 1.01, t) * fu);
        px.r = px.r * k + (edge[0] - px.r * k) * e;
        px.g = px.g * k + (edge[1] - px.g * k) * e;
        px.b = px.b * k + (edge[2] - px.b * k) * e;
        px.a += (1 - px.a) * e;
        // hair at the wing root (and along the inner edge of the hindwing), the colour of body and wing mixed
        let h = ss(0.34, 0.02, t);
        if (id === 'h') h = Math.max(h, ss(0.78, 0.98, u) * ss(0.8, 0.15, t) * 0.8);
        if (h > 0) {
          const strand = noise(u * W.span * rr * 520, t * 7 + (id === 'h' ? 50 : 0));
          h *= hairA * (0.45 + 0.55 * strand);
          px.r += (px.r * 0.5 + bodyC[0] * 0.3 + 40 - px.r) * h;
          px.g += (px.g * 0.5 + bodyC[1] * 0.3 + 36 - px.g) * h;
          px.b += (px.b * 0.5 + bodyC[2] * 0.3 + 30 - px.b) * h;
        }
        // the fringe: short hairs past the scaled margin, paler, interrupted where veins run out
        if (t > 1 && fu <= 0) px.a *= 1 - ss(0, 1.5, (rr - R0) * TW);
        else if (t > 1) {
          const f = (rr - R0) / (FR * fu);
          const strand = noise(u * W.span * R0 * 900, f * 2.5);
          const chk = 0.5 + 0.5 * Math.cos(6.2832 * u * veinN);
          const lift = fringeC ? 1 : 0.35;
          const fc = fringeC || [px.r + (235 - px.r) * 0.3, px.g + (225 - px.g) * 0.3, px.b + (210 - px.b) * 0.3];
          const m = lift * fu * (1 - ss(0.55, 0.95, chk) * 0.85);
          px.r += (fc[0] - px.r) * m; px.g += (fc[1] - px.g) * m; px.b += (fc[2] - px.b) * m;
          px.a *= (1 - ss(0.25, 1, f)) * ss(0.2, 0.6, strand + 0.35 * (1 - f));
        }
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
// Antennae with clubs, a head with compound eyes and palps, a furred thorax, a ringed abdomen.
const tint = (h, k) => { const [r, g, b] = hex(h); const f = (v) => Math.round(Math.min(255, Math.max(0, k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
export function drawBody(ctx, cx, cy, s, body = {}, antennae = true) {
  const c = body.c || '#1b1613', abd = body.abd || c, head = body.head || c, len = body.len || 0.34;
  const fur = body.fur || tint(c, 0.32);
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  if (antennae) {
    for (const d of [-1, 1]) {
      const P = (t) => {
        const m = 1 - t;
        return [d * (m * m * m * 0.012 + 3 * m * m * t * 0.03 + 3 * m * t * t * 0.09 + t * t * t * 0.15),
          m * m * m * -0.13 + 3 * m * m * t * -0.24 + 3 * m * t * t * -0.33 + t * t * t * -0.385];
      };
      // the shaft, ringed light and dark
      for (let i = 0; i < 40; i++) {
        const t0 = i / 40, t1 = (i + 1) / 40, [x0, y0] = P(t0), [x1, y1] = P(t1);
        const club = ss(0.78, 0.97, t1);
        ctx.strokeStyle = i % 2 && i < 31 ? tint(c, 0.16) : c;
        ctx.lineWidth = 0.0045 + club * 0.011;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      const [tx, ty] = P(1);
      ctx.fillStyle = body.tip || tint(c, 0.45);
      ctx.beginPath(); ctx.arc(tx, ty, 0.0055, 0, 6.3); ctx.fill();
    }
  }
  const lg = (col, w = 0.04) => {
    const g = ctx.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, tint(col, -0.75));
    g.addColorStop(0.42, tint(col, 0.12));
    g.addColorStop(0.55, col);
    g.addColorStop(1, tint(col, -0.8));
    return g;
  };
  const hairs = (x0, y0, rx, ry, n, col, lenH, out = 0) => {
    ctx.strokeStyle = col;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, rr = Math.sqrt(rnd());
      const x = x0 + Math.cos(a) * rx * rr, y = y0 + Math.sin(a) * ry * rr;
      const dir = Math.atan2(y - y0, (x - x0) * 0.6) * out + (1 - out) * (Math.PI / 2 + (rnd() - 0.5) * 1.2);
      const l = lenH * (0.5 + rnd());
      ctx.globalAlpha = 0.25 + rnd() * 0.45;
      ctx.lineWidth = 0.0018 + rnd() * 0.0016;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(dir) * l, y + Math.sin(dir) * l); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  // abdomen: tapered, ringed, furred along the sides
  ctx.fillStyle = lg(abd, 0.03);
  ctx.beginPath();
  ctx.moveTo(-0.025, 0.03);
  ctx.bezierCurveTo(-0.033, len * 0.45, -0.014, len * 0.95, 0, len);
  ctx.bezierCurveTo(0.014, len * 0.95, 0.033, len * 0.45, 0.025, 0.03);
  ctx.fill();
  for (let i = 1; i < 8; i++) {
    const yy = 0.04 + ((len - 0.06) * i) / 8, hw = 0.029 * (1 - (i / 8) ** 2 * 0.55);
    ctx.strokeStyle = 'rgba(0,0,0,.42)'; ctx.lineWidth = 0.004;
    ctx.beginPath(); ctx.moveTo(-hw, yy); ctx.quadraticCurveTo(0, yy + 0.012, hw, yy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 0.003;
    ctx.beginPath(); ctx.moveTo(-hw * 0.8, yy + 0.006); ctx.quadraticCurveTo(0, yy + 0.017, hw * 0.8, yy + 0.006); ctx.stroke();
  }
  hairs(0, len * 0.25, 0.026, len * 0.22, 40, fur, 0.007, 1);
  // thorax: a dense coat of hair over a dark core
  ctx.fillStyle = lg(c, 0.042);
  ctx.beginPath(); ctx.ellipse(0, -0.03, 0.04, 0.08, 0, 0, 6.3); ctx.fill();
  hairs(0, -0.03, 0.042, 0.08, 260, fur, 0.016, 1);
  hairs(0, -0.04, 0.02, 0.05, 80, tint(c, 0.5), 0.01, 0.3);
  // head, palps and the two great compound eyes
  ctx.fillStyle = lg(head, 0.03);
  ctx.beginPath(); ctx.ellipse(0, -0.118, 0.026, 0.023, 0, 0, 6.3); ctx.fill();
  hairs(0, -0.115, 0.02, 0.016, 40, fur, 0.008, 1);
  ctx.fillStyle = tint(c, 0.15);
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(d * 0.007, -0.143, 0.005, 0.014, d * 0.25, 0, 6.3); ctx.fill();
  }
  for (const d of [-1, 1]) {
    const g = ctx.createRadialGradient(d * 0.021 - d * 0.004, -0.124, 0.001, d * 0.02, -0.12, 0.014);
    g.addColorStop(0, body.eye ? tint(body.eye, 0.4) : '#6b6052');
    g.addColorStop(0.35, body.eye || '#2b241d');
    g.addColorStop(1, '#070605');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(d * 0.02, -0.12, 0.012, 0.014, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(d * 0.017, -0.126, 0.0025, 0, 6.3); ctx.fill();
  }
  ctx.restore();
}

// A flat, pinned specimen: both wing pairs plus the body. Used for the book plate and the cabinet.
export function drawSpecimen(wingCanvas, body, scale = 1, shadow = true, bodyImg = null) {
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
  if (bodyImg) ctx.drawImage(bodyImg, w / 2 - (TW * scale) / 4, 0, (TW * scale) / 2, h);
  else drawBody(ctx, w / 2, HY * scale, TW * scale, body);
  return cv;
}

// Photographed specimens: <id>-wings.webp holds both wings (midline at centre, hinge at the same
// height as the drawn ones, 1.5x scale); <id>-body.webp holds body + antennae.
// One half is used for both sides, so the flying insect and the plate it lands on match exactly.
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
export async function loadPhoto(id, { half = 'R', body = true } = {}) {
  const [w, b] = await Promise.all([loadImg(`/specimens/${id}-wings.webp`), body ? loadImg(`/specimens/${id}-body.webp`) : null]);
  const hw = w.width / 2;
  const wing = document.createElement('canvas');
  wing.width = hw; wing.height = w.height;
  const x = wing.getContext('2d');
  if (half === 'L') { x.translate(hw, 0); x.scale(-1, 1); x.drawImage(w, 0, 0, hw, w.height, 0, 0, hw, w.height); }
  else x.drawImage(w, hw, 0, hw, w.height, 0, 0, hw, w.height);
  let bodyCv = null;
  if (b) {
    bodyCv = document.createElement('canvas');
    bodyCv.width = b.width; bodyCv.height = b.height;
    bodyCv.getContext('2d').drawImage(b, 0, 0);
  }
  return { wing, body: bodyCv };
}

export function bodyTexture(body) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = TH;
  drawBody(cv.getContext('2d'), 128, HY, TW, body);
  return cv;
}
