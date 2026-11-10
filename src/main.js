import { SPECIES, CHAPTERS } from './data.js';
import { paintWing, bodyTexture, drawSpecimen, loadPhoto } from './wings.js';
import { Scene } from './scene.js';
import { Book } from './book.js';

const $ = (s) => document.querySelector(s);
const frame = () => new Promise((r) => requestAnimationFrame(r));
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const pad = (n) => String(n).padStart(2, '0');

const HERO = { bg: '#efe7d4', bg2: '#f8f2e3', ink: '#1c1712', accent: '#d8452b' };
const CABINET = { bg: '#ebe2cb', bg2: '#f5eedc', ink: '#1c1712', accent: '#2f76e6' };
const CH_COLOUR = { blue: '#1492ff', green: '#18c46a', yellow: '#f2df5a', orange: '#f08a24', red: '#e2382a', earth: '#7a5a3c' };

/* ---------- build the page ---------- */

const flow = $('#flow');
const stops = []; // colour stops down the page: { el, ground }
const spEls = [];
stops.push({ el: $('.hero'), ground: HERO });

$('#spectrum').innerHTML = CHAPTERS.map((c) => `<li style="--c:${CH_COLOUR[c.id]}"><b>${c.no}</b>${c.title}</li>`).join('');

let last = null;
SPECIES.forEach((sp, i) => {
  if (sp.chapter !== last) {
    last = sp.chapter;
    const ch = CHAPTERS.find((c) => c.id === sp.chapter);
    const el = document.createElement('section');
    el.className = 'chapter';
    el.innerHTML = `<div class="rv"><p class="ch-no">Chapter ${ch.no}</p><h2 class="ch-title">${ch.title}</h2><p class="ch-line">${ch.line}</p><p class="ch-text">${ch.text}</p></div>`;
    flow.append(el);
    stops.push({ el, ground: sp.ground });
  }
  const el = document.createElement('section');
  el.className = 'sp ' + (i % 2 ? 't-right' : 't-left');
  el.id = sp.id;
  el.innerHTML = `<div class="rv">
    <p class="sp-no"><b>No. ${pad(i + 1)}</b> &nbsp;·&nbsp; ${sp.family}, ${sp.span}</p>
    <h2>${sp.common}</h2>
    <p class="sp-latin">${sp.latin}</p>
    <p class="sp-lede">${sp.lede}</p>
    <ul class="chips" aria-label="Colours of the ${sp.common}">${sp.chips.map(([n, h]) => `<li><i style="--c:${h}"></i>${n}</li>`).join('')}</ul>
    <button class="open" type="button" data-open="${i}">Open its page <span>&rarr;</span></button>
  </div>`;
  flow.append(el);
  spEls.push(el);
  stops.push({ el, ground: sp.ground });
});

const cab = document.createElement('section');
cab.className = 'cabinet';
cab.id = 'cabinet';
cab.innerHTML = `<h2>The <em>cabinet</em></h2>
  <p class="cab-sub">All twenty-two, pinned in the order of the spectrum. Choose one to read its page.</p>
  <div class="drawer" id="drawer"></div>
  <p class="colophon">Most wings here are drawn in code from a description of their pattern, and the drawings simplify what the living insect does better; the Blue Morpho and the Glasswing are photographs of real specimens. About 18,000 butterfly species have been described, so this is a first drawer, not the whole cabinet. Colour names follow the manner of Werner’s Nomenclature of Colours (Syme, 1821).</p>`;
flow.append(cab);
stops.push({ el: cab, ground: CABINET, top: true });

$('#rail').innerHTML = SPECIES.map((sp, i) => `<button type="button" data-go="${i}" aria-label="${sp.common}" style="--c:${sp.chips[0][1]}"><i></i><span>${sp.common}</span></button>`).join('');
const railBtns = [...document.querySelectorAll('#rail button')];

/* ---------- paint the collection ---------- */

const textures = [];
for (let i = 0; i < SPECIES.length; i++) {
  const sp = SPECIES[i];
  let t = null;
  if (sp.photo) {
    try {
      const p = await loadPhoto(sp.id, sp.photo);
      t = { wing: p.wing, body: p.body || bodyTexture(sp.wings.body), photoBody: p.body };
    } catch { /* fall back to the painted wing */ }
  }
  textures.push(t || { wing: paintWing(sp.wings), body: bodyTexture(sp.wings.body) });
  $('#loadN').textContent = i + 1;
  await frame();
}
const plates = [];
const plateURL = (i) => (plates[i] ??= drawSpecimen(textures[i].wing, SPECIES[i].wings.body, 1, true, textures[i].photoBody).toDataURL());

const drawer = $('#drawer');
SPECIES.forEach((sp, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cell';
  b.dataset.cab = i;
  b.style.setProperty('--cbg', sp.ground.bg);
  b.style.setProperty('--cink', sp.ground.ink);
  b.append(drawSpecimen(textures[i].wing, sp.wings.body, 0.4, true, textures[i].photoBody));
  b.insertAdjacentHTML('beforeend', `<span><b>${sp.common}</b><small>${sp.latin}</small></span>`);
  drawer.append(b);
});

const gl = $('#gl');
const scene = new Scene(gl, SPECIES, textures);

/* ---------- scroll choreography ---------- */

let vh = innerHeight, heroC = 0, spC = [];
function measure() {
  vh = innerHeight;
  for (const s of stops) s.y = s.top ? s.el.offsetTop + vh * 0.35 : s.el.offsetTop + s.el.offsetHeight / 2;
  for (const s of stops) s.rv = s.el.querySelector('.rv');
  heroC = stops[0].y;
  spC = spEls.map((el) => el.offsetTop + el.offsetHeight / 2);
}
measure();
addEventListener('resize', () => { measure(); scene.resize(); });
document.fonts?.ready.then(measure);

function stationAt(c) {
  const n = spC.length;
  if (c <= spC[0]) return Math.max(-1, -1 + (c - heroC) / (spC[0] - heroC));
  for (let k = 0; k < n - 1; k++) if (c < spC[k + 1]) return k + (c - spC[k]) / (spC[k + 1] - spC[k]);
  return n - 1 + (c - spC[n - 1]) / (vh * 1.6);
}

const root = document.documentElement;
for (const s of stops) s.c = { bg: rgb(s.ground.bg), bg2: rgb(s.ground.bg2), ink: rgb(s.ground.ink), accent: rgb(s.ground.accent) };
function ground(c) {
  let k = 0;
  while (k < stops.length - 2 && c > stops[k + 1].y) k++;
  const a = stops[k], b = stops[k + 1];
  const f = sstep(0.22, 0.78, (c - a.y) / (b.y - a.y));
  const mix = (key) => a.c[key].map((v, i) => Math.round(v + (b.c[key][i] - v) * f));
  const bg = mix('bg');
  for (const key of ['bg', 'bg2', 'ink', 'accent']) root.style.setProperty('--' + key, `rgb(${(key === 'bg' ? bg : mix(key)).join(' ')})`);
  scene.setFog(bg[0] / 255, bg[1] / 255, bg[2] / 255);
}

let smooth = scrollY, active = -2, tPrev = performance.now();
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
function tick(now) {
  const dt = Math.min(0.05, (now - tPrev) / 1000);
  tPrev = now;
  smooth += (scrollY - smooth) * (calm ? 1 : Math.min(1, dt * 5.5));
  if (Math.abs(scrollY - smooth) < 0.05) smooth = scrollY;
  const c = smooth + vh / 2;
  scene.s = stationAt(c);
  ground(c);

  // text arrives and leaves around the centre of the screen
  const cNow = scrollY + vh / 2;
  for (const s of stops) {
    if (!s.rv || s.top) continue;
    const d = (s.y - cNow) / vh;
    if (Math.abs(d) > 1.2) { if (s.vis) { s.rv.style.opacity = 0; s.vis = false; } continue; }
    s.vis = true;
    s.rv.style.opacity = s === stops[0] ? 1 - sstep(0.15, 0.7, -d) : 1 - sstep(0.2, 0.42, Math.abs(d));
    s.rv.style.transform = `translate3d(0, ${(d * 46).toFixed(1)}px, 0)`;
  }

  const i = Math.round(scene.s);
  const on = scene.s > -0.5 && cNow < stops[stops.length - 1].y - vh * 0.5;
  $('#rail').classList.toggle('on', on);
  if (i !== active) {
    railBtns[active]?.classList.remove('on');
    railBtns[i]?.classList.add('on');
    active = i;
  }
  scene.frame(now / 1000, dt);
  requestAnimationFrame(tick);
}

/* ---------- the book ---------- */

let origin = null; // 'flight' when the butterfly itself flew onto the page
const book = new Book({
  species: SPECIES, chapters: CHAPTERS, plateURL,
  onTurn(j, i) {
    if (origin !== 'flight') return;
    scene.release(i, false);
    scrollTo(0, spC[j] - vh / 2);
    smooth = scrollY;
  },
});

async function openBook(i, viaFlight) {
  if (book.isOpen || book.busy) return;
  book.busy = true;
  hover(-1);
  document.body.classList.add('locked');
  const flight = viaFlight && !book.stacked && !book.calm;
  origin = viaFlight ? 'flight' : 'cabinet';
  await book.prepare(i, flight);
  if (flight) {
    scene.dim(true);
    gl.classList.add('front');
    await Promise.all([scene.flyTo(i, book.plateRect(), 1.15), book.animateOpen()]);
    book.showPlate();
    await frame();
    scene.hide(i);
    gl.classList.remove('front');
    scene.dim(false);
  } else {
    await book.animateOpen();
  }
  book.busy = false;
}

async function closeBook() {
  if (!book.isOpen || book.busy) return;
  const i = book.i;
  await book.close();
  document.body.classList.remove('locked');
  if (origin === 'flight') scene.release(i, true);
}

$('#bookClose').addEventListener('click', closeBook);
$('.veil').addEventListener('click', closeBook);
addEventListener('keydown', (e) => {
  if (!book.isOpen) return;
  if (e.key === 'Escape') closeBook();
  if (e.key === 'ArrowRight') book.turn(1);
  if (e.key === 'ArrowLeft') book.turn(-1);
});

/* ---------- pointer ---------- */

const hint = $('#hint');
function hover(i) {
  scene.hover = i;
  hint.classList.toggle('on', i >= 0);
  root.style.cursor = i >= 0 ? 'pointer' : '';
}
addEventListener('pointermove', (e) => {
  scene.mouse.x = (e.clientX / innerWidth) * 2 - 1;
  scene.mouse.y = (e.clientY / innerHeight) * 2 - 1;
  if (book.isOpen || book.busy || e.pointerType === 'touch') return;
  const over = e.target.closest?.('a, button') ? -1 : scene.hoverTest(e.clientX, e.clientY);
  hover(over);
  hint.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 18}px)`;
});
addEventListener('click', (e) => {
  const t = e.target.closest?.('[data-open], [data-cab], [data-go], a, button');
  if (t?.dataset.open) return openBook(+t.dataset.open, true);
  if (t?.dataset.cab) return openBook(+t.dataset.cab, false);
  if (t?.dataset.go) return scrollTo({ top: spC[+t.dataset.go] - vh / 2, behavior: calm ? 'auto' : 'smooth' });
  if (t || book.isOpen || book.busy) return;
  const i = scene.hoverTest(e.clientX, e.clientY);
  if (i >= 0) openBook(i, true);
});

requestAnimationFrame(tick);
$('#loader').classList.add('done');
