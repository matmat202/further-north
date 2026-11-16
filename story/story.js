/* The scrolling story: each <section class="step"> names a layout in data-step; as the
 * reader scrolls into a step, the marks move to their place in that layout. Numbers in
 * the prose are not typed in: a <b data-fact="..."> is computed here from story.json's
 * rows, and test/story.test.mjs checks each against the `check` block build_story.py
 * computed in python. Modelled on which-read-more/site/story. */
import { layout, rowRate, rowPairs, STEPS, RATE } from './layout.js';
import { BANDS, KM_PER_DEG } from '../north-logic.js';

const fmt = (n) => n.toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;
const sorted = (xs) => [...xs].sort((a, b) => a - b);

export function numbers(D) {
  const N = { n_pairs: D.pairs.length, n_days: (Date.parse(`${D.last}T00:00:00Z`) - Date.parse(`${D.first}T00:00:00Z`)) / 864e5 + 1,
    n_cities: D.cities.length, n_used: new Set(D.pairs.flatMap((p) => [p[1], p[2]])).size,
    n_eu: D.cities.filter((c) => c[2] === 'EU').length, n_cap: D.cities.filter((c) => c[5] === 1).length };
  for (const { key } of D.rows) {
    const R = rowRate(D, key), rate = R.won / R.n, s = sorted(D.shuffles[key]);
    Object.assign(N, {
      [`${key}_won`]: R.won, [`${key}_n`]: R.n, [`${key}_rate`]: rate,
      [`${key}_med`]: s[Math.floor(s.length / 2)], [`${key}_min`]: s[0], [`${key}_max`]: s.at(-1),
      [`${key}_high`]: s.filter((v) => v >= rate).length, [`${key}_low`]: s.filter((v) => v <= rate).length,
    });
  }
  let aseu = 0;
  for (const [, i, j] of rowPairs(D).across) {
    const [b, s] = D.cities[i][4] > D.cities[j][4] ? [D.cities[i], D.cities[j]] : [D.cities[j], D.cities[i]];
    if (b[3] < s[3] && b[2] === 'AS' && s[2] === 'EU') aseu++;
  }
  N.aseu_lost = aseu;
  return N;
}

const day = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const km = (deg) => fmt(Math.round((deg * KM_PER_DEG) / 10) * 10);

/* "rate:europe" -> "77%". Unknown names throw: a typo must not render as blank */
export function fact(D, spec) {
  const N = numbers(D);
  const [f, k] = spec.split(':');
  const has = (x) => { if (!(x in N)) throw new Error(`unknown fact ${spec}`); return N[x]; };
  switch (f) {
    case 'n_pairs': case 'n_days': case 'n_cities': case 'n_used': case 'n_eu': case 'n_cap': return fmt(has(f));
    case 'first': return day(D.first);
    case 'last': return day(D.last);
    case 'n_sh': return fmt(D.shuffles.europe.length);
    case 'urals': return `${D.urals}°E`;
    case 'won': return fmt(has(`${k}_won`));
    case 'n': return fmt(has(`${k}_n`));
    case 'lost': return fmt(has(`${k}_n`) - has(`${k}_won`));
    case 'rate': return pct(has(`${k}_rate`));
    case 'other': return pct(1 - has(`${k}_rate`));
    case 'med': return pct(has(`${k}_med`));
    case 'max': return pct(has(`${k}_max`));
    case 'min': return pct(has(`${k}_min`));
    case 'high': return fmt(has(`${k}_high`));
    case 'low': return fmt(has(`${k}_low`));
    case 'aseu': return fmt(has('aseu_lost'));
    case 'band': { const b = BANDS[+k - 1]; if (!b) throw new Error(`unknown fact ${spec}`); return `${km(b[0])}–${km(b[1])} km`; }
    default: throw new Error(`unknown fact ${spec}`);
  }
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

async function main() {
  const D = await (await fetch('story.json')).json();
  for (const e of document.querySelectorAll('[data-fact]')) e.textContent = fact(D, e.dataset.fact);
  const steps = [...document.querySelectorAll('.step')];
  for (const s of steps) if (!STEPS[s.dataset.step]) throw new Error(`unknown step ${s.dataset.step}`);
  const plot = document.getElementById('plot');
  const svg = el('svg', { id: 'chart' });
  const gAxis = el('g', { class: 'axis' }), gS = el('g'), gR = el('g');
  svg.append(gAxis, gS, gR);
  plot.append(svg);
  const dots = D.rows.map((r) => {
    const c = gR.appendChild(el('circle', { r: 0 }));
    c.append(el('title')); c.firstChild.textContent = `${r.label}: the real rule`;
    return c;
  });
  const tick = (x, y, text, cls = 'tick') => { const t = el('text', { x, y, class: cls }); t.textContent = text; gAxis.append(t); };
  const grid = (x1, y1, x2, y2, cls = 'grid') => gAxis.append(el('line', { x1, x2, y1, y2, class: cls }));

  let shown = -1;
  const draw = (i) => {
    const name = steps[i].dataset.step;
    const box = plot.getBoundingClientRect(), W = box.width, H = box.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const L = layout(name, D, W, H);
    // 1,000 animated dots per row lagged the scroll in which-read-more, so the twins are bars
    gS.replaceChildren();
    for (const r of D.rows) for (const b of L.shuffles[r.key]) {
      const e = gS.appendChild(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, class: 'bar' }));
      e.append(el('title')); e.firstChild.textContent = `${b.n} random twins of “${r.label}”`;
    }
    L.real.forEach((d, k) => {
      const c = dots[k];
      c.style.transform = `translate(${d.x}px, ${d.y}px)`;
      c.setAttribute('r', d.r);
      c.style.fill = d.fill;
      c.style.opacity = d.op;
    });
    gAxis.replaceChildren();
    for (let v = RATE[0]; v <= RATE[1] + 1e-9; v += 0.1) {
      grid(L.X(v), 0, L.X(v), H, Math.abs(v - 0.5) < 1e-9 ? 'grid zero' : 'grid');
      tick(L.X(v), H + 16, pct(v), 'tick mid');
    }
    tick(W / 2, H + 32, 'how often the city it picks is the further north', 'tick mid');
    const lab = { rules: 'pick ', rounds: 'pick the city in Europe, ', bigger: 'pick ' }[name];
    L.show.forEach((key, k) => {
      const r = D.rows.find((x) => x.key === key), R = rowRate(D, key);
      const pre = name === 'rules' || k === 0 ? lab : '';
      tick(0, L.Y(k) - L.rowH + (name === 'rounds' ? 11 : 14), `${pre}${r.label}: ${pct(R.won / R.n)} of ${fmt(R.n)}`, 'tick cat');
    });
    document.body.dataset.step = i;
    const bars = D.rows.reduce((n, r) => n + L.shuffles[r.key].length, 0);
    window.__story = { step: i, name, shown: bars + L.real.filter((d) => d.op > 0).length };
  };

  const pick = () => {
    const line = innerHeight * 0.5;
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (steps[k].getBoundingClientRect().top < line) i = k;
    if (i !== shown) { shown = i; draw(i); }
  };
  addEventListener('scroll', pick, { passive: true });
  addEventListener('resize', () => { shown = -1; pick(); });
  pick();
}

if (typeof document !== 'undefined') main().catch((e) => {
  document.body.classList.add('failed');
  document.getElementById('err').textContent = String(e.message || e);
  console.error(e);
});
