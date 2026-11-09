// The encyclopedia: a two-page spread that opens like a pair of wings and turns leaf by leaf.

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV'];
const PLATE_ASPECT = 1024 / 608;
const lum = (h) => (0.3 * parseInt(h.slice(1, 3), 16) + 0.59 * parseInt(h.slice(3, 5), 16) + 0.11 * parseInt(h.slice(5, 7), 16)) / 255;

export class Book {
  constructor({ species, chapters, plateURL, onTurn }) {
    Object.assign(this, { species, chapters, plateURL, onTurn });
    this.el = document.getElementById('book');
    this.spread = document.getElementById('spread');
    this.L = document.getElementById('pageL');
    this.R = document.getElementById('pageR');
    this.leaf = document.getElementById('leaf');
    this.prev = document.getElementById('turnPrev');
    this.next = document.getElementById('turnNext');
    this.i = 0;
    this.isOpen = false;
    this.busy = false;
    this.prev.addEventListener('click', () => this.turn(-1));
    this.next.addEventListener('click', () => this.turn(1));
  }

  get stacked() { return window.matchMedia('(max-width: 860px)').matches; }
  get calm() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  leftHTML(i) {
    const s = this.species[i], ch = this.chapters.find((c) => c.id === s.chapter);
    return `<div class="pg">
      <div class="run"><span>Plate ${ROMAN[i]}</span><span>${ch.title}</span></div>
      <figure class="plate">
        <img src="${this.plateURL(i)}" alt="Drawing of a ${s.common}, wings spread, seen from above" />
        <figcaption>Fig. ${i + 1}. ${s.latin}, upper side. Wingspan ${s.span}.</figcaption>
      </figure>
      <table class="werner"><caption>Colours observed</caption>
        ${s.chips.map(([n, h, w]) => `<tr><td style="--c:${h}"></td><td>${n}</td><td>${w}</td></tr>`).join('')}
      </table>
      <div class="folio">${i * 2 + 8}</div>
    </div>`;
  }

  rightHTML(i) {
    const s = this.species[i];
    const cap = (s.chips.find(([, h]) => lum(h) > 0.12 && lum(h) < 0.62) || [0, '#2a2118'])[1];
    return `<div class="pg" style="--c:${cap}">
      <div class="run"><span>${s.family}</span><span>Wingbook</span></div>
      <h2>${s.common}</h2>
      <p class="latin">${s.latin} <span>${s.auth}</span></p>
      <dl>
        <dt>Family</dt><dd>${s.family}</dd>
        <dt>Wingspan</dt><dd>${s.span}</dd>
        <dt>Range</dt><dd>${s.range}</dd>
        <dt>Larval food</dt><dd>${s.host}</dd>
      </dl>
      <p class="first">${s.text[0]}</p>
      ${s.text.slice(1).map((t) => `<p>${t}</p>`).join('')}
      <h3>On its colour</h3>
      <p>${s.colour}</p>
      <div class="folio">${i * 2 + 9}</div>
    </div>`;
  }

  render(i) {
    this.i = i;
    this.L.innerHTML = this.leftHTML(i);
    this.R.innerHTML = this.rightHTML(i);
    this.buttons();
  }
  buttons() {
    this.prev.disabled = this.i === 0;
    this.next.disabled = this.i === this.species.length - 1;
  }

  // lay the book out (invisible) so the plate can be measured before anything moves
  async prepare(i, hidePlate) {
    this.el.hidden = false;
    this.el.scrollTop = 0;
    this.render(i);
    this.L.style.opacity = this.R.style.opacity = 0;
    const img = this.L.querySelector('.plate img');
    img.style.opacity = hidePlate ? 0 : 1;
    try { await img.decode(); } catch { /* still usable */ }
  }

  // the rectangle the drawing actually occupies inside its <img> box
  plateRect() {
    const r = this.L.querySelector('.plate img').getBoundingClientRect();
    let w = r.width, h = w / PLATE_ASPECT;
    if (h > r.height) { h = r.height; w = h * PLATE_ASPECT; }
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }
  showPlate() { this.L.querySelector('.plate img').style.opacity = 1; }

  async animateOpen() {
    this.isOpen = true;
    this.el.classList.add('on');
    this.L.style.opacity = this.R.style.opacity = 1;
    if (this.stacked || this.calm) {
      await this.spread.animate([{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'ease-out' }).finished;
    } else {
      // two pages hinged at the spine, beating open like wings before they settle flat
      const o = { duration: 1150, easing: 'cubic-bezier(.3,.7,.25,1)', fill: 'backwards' };
      const beat = (d) => [
        { transform: `rotateY(${d * 86}deg)`, offset: 0 },
        { transform: `rotateY(${d * 28}deg)`, offset: 0.3 },
        { transform: `rotateY(${d * 52}deg)`, offset: 0.48 },
        { transform: `rotateY(${d * -5}deg)`, offset: 0.8 },
        { transform: 'rotateY(0deg)', offset: 1 },
      ];
      this.L.animate(beat(1), o);
      this.R.animate(beat(-1), o);
      await this.spread.animate(
        [{ opacity: 0, transform: 'translateY(8%) scale(.34) rotateX(24deg)' }, { opacity: 1, offset: 0.3 }, { opacity: 1, transform: 'none' }],
        { duration: 1150, easing: 'cubic-bezier(.2,.75,.2,1)' }
      ).finished;
    }
    document.getElementById('bookClose').focus({ preventScroll: true });
  }

  async close() {
    if (!this.isOpen || this.busy) return;
    this.busy = true;
    this.el.classList.remove('on');
    if (this.stacked || this.calm) {
      await this.spread.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished;
    } else {
      const o = { duration: 480, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' };
      this.L.animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(84deg)' }], o);
      this.R.animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(-84deg)' }], o);
      await this.spread.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6%) scale(.4)' }], o).finished;
    }
    this.el.hidden = true;
    for (const el of [this.L, this.R, this.spread]) el.getAnimations().forEach((a) => a.cancel());
    this.isOpen = false;
    this.busy = false;
  }

  async turn(dir) {
    const i = this.i, j = i + dir;
    if (!this.isOpen || this.busy || j < 0 || j >= this.species.length) return;
    this.busy = true;
    if (this.stacked || this.calm) {
      this.render(j);
      this.el.scrollTop = 0;
    } else {
      const [front, back] = this.leaf.children, fwd = dir > 0;
      this.leaf.className = 'leaf ' + (fwd ? 'fwd' : 'bwd');
      front.className = 'page face front ' + (fwd ? 'as-right' : 'as-left');
      back.className = 'page face back ' + (fwd ? 'as-left' : 'as-right');
      front.innerHTML = fwd ? this.rightHTML(i) : this.leftHTML(i);
      back.innerHTML = fwd ? this.leftHTML(j) : this.rightHTML(j);
      (fwd ? this.R : this.L).innerHTML = fwd ? this.rightHTML(j) : this.leftHTML(j);
      this.leaf.hidden = false;
      await this.leaf.animate(
        [{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${fwd ? -180 : 180}deg)` }],
        { duration: 950, easing: 'cubic-bezier(.45,.05,.3,1)' }
      ).finished;
      (fwd ? this.L : this.R).innerHTML = fwd ? this.leftHTML(j) : this.rightHTML(j);
      this.leaf.hidden = true;
      this.i = j;
      this.buttons();
    }
    this.busy = false;
    this.onTurn(j, i);
  }
}
