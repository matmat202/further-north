// Further North — the page. Pure logic lives in north-logic.js.
import * as L from './north-logic.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: play on, unsaved */ } },
};

let W = null, C = [];
let game = null; // { key, day, practice, pairs, picks }

function start(practice) {
  const day = L.dayKey();
  const key = practice ? `practice-${Date.now().toString(36)}` : day;
  game = { key, day, practice, pairs: L.pairsFor(W.cities, key), picks: practice ? [] : store.get('fn:' + day, []) };
  $('daily').hidden = !practice;
  render();
}

function save() {
  if (game.practice) return;
  store.set('fn:' + game.day, game.picks);
  if (game.picks.length === game.pairs.length) {
    const days = store.get('fn:days', []);
    if (!days.includes(game.day)) { days.push(game.day); store.set('fn:days', days.slice(-400)); }
  }
}

const pairAt = (k) => game.pairs[k].map((i) => C[i]);
const marks = () => game.picks.map((p, k) => { const [a, b] = pairAt(k); return L.isRight(a, b, p); });

function render() {
  const k = game.picks.length, done = k >= game.pairs.length;
  // A finished round stays on screen until Next; `showing` is the round whose answer is up.
  const showing = game.showing ?? null;
  $('play').hidden = done && showing == null;
  $('end').hidden = !($('play').hidden);
  drawMarks(showing ?? k);
  if (!$('play').hidden) drawRound(showing ?? k, showing != null);
  if (!$('end').hidden) drawEnd();
}

function drawMarks(now) {
  const m = marks();
  $('marks').replaceChildren(...game.pairs.map((_, k) => {
    const li = document.createElement('li');
    if (k < m.length) { li.className = m[k] ? 'y' : 'n'; li.title = m[k] ? 'right' : 'wrong'; }
    if (k === now) li.classList.add('now');
    return li;
  }));
  $('marks').setAttribute('aria-label', `${m.filter(Boolean).length} right of ${m.length} so far`);
}

function drawRound(k, answered) {
  const [a, b] = pairAt(k);
  $('round').textContent = `${game.practice ? 'Practice · ' : ''}Round ${k + 1} of ${game.pairs.length}`;
  const btns = [...$('pick').querySelectorAll('button')];
  [a, b].forEach((c, i) => {
    const el = btns[i];
    el.querySelector('b').textContent = c.name;
    el.querySelector('small').textContent = c.country;
    el.querySelector('.lat').textContent = answered ? L.fmtLat(c.lat) : '';
    el.disabled = answered;
    el.classList.toggle('right', answered && L.northIndex(a, b) === i);
    el.classList.toggle('wrong', answered && game.picks[k] === i && !L.isRight(a, b, i));
    el.setAttribute('aria-label', answered ? `${c.name}, ${c.country}: ${L.fmtLat(c.lat)}` : `${c.name}, ${c.country}`);
  });
  if (answered) {
    const right = L.isRight(a, b, game.picks[k]);
    $('out').replaceChildren();
    const tag = document.createElement('b');
    tag.className = right ? 'y' : 'n';
    tag.textContent = right ? 'Right. ' : 'Not quite. ';
    $('out').append(tag, L.verdict(a, b));
    drawMap(a, b);
    $('map').hidden = false;
    $('next').hidden = false;
    $('next').textContent = k + 1 >= game.pairs.length ? 'See your score' : 'Next';
  } else {
    $('out').textContent = '';
    $('map').hidden = true;
    $('next').hidden = true;
  }
}

function pick(i) {
  if (!game || game.showing != null || game.picks.length >= game.pairs.length) return;
  game.showing = game.picks.length;
  game.picks.push(i);
  save();
  render();
  $('next').focus({ preventScroll: true });
}

function next() {
  if (game.showing == null) return;
  game.showing = null;
  render();
  const first = $('pick').querySelector('button');
  if (!$('play').hidden) first.focus({ preventScroll: true }); else $('share').focus({ preventScroll: true });
}

// The map, zoomed to the pair: a line at each city's latitude makes the answer visible.
function drawMap(a, b) {
  const wrap = Math.abs(a.lon - b.lon) > 180;
  let x = -180, w = 360;
  if (!wrap) {
    const lo = Math.min(a.lon, b.lon), hi = Math.max(a.lon, b.lon);
    w = Math.min(360, Math.max(70, hi - lo + 40));
    x = Math.max(-180, Math.min(180 - w, (lo + hi) / 2 - w / 2));
  }
  const h = w / 2;
  const y = Math.max(-85, Math.min(85 - h, -(a.lat + b.lat) / 2 - h / 2));
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Map: ${a.name} at ${L.fmtLat(a.lat)}, ${b.name} at ${L.fmtLat(b.lat)}`);
  const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
  el('rect', { class: 'sea', x, y, width: w, height: h });
  // the land path is drawn for one world; repeat it either side so a zoom near the
  // dateline is not cut off at the edge
  for (const dx of [-360, 0, 360]) el('path', { class: 'land', d: W.land, transform: `translate(${dx} 0)` });
  if (y < 0 && y + h > 0) el('line', { class: 'eq', x1: x, x2: x + w, y1: 0, y2: 0 });
  const fs = w / 26, r = w / 110;
  const north = L.northIndex(a, b);
  [a, b].forEach((c, i) => {
    const cls = i ? 'b' : 'a';
    const [cx, cy] = L.xy(c);
    el('line', { class: 'll ' + cls, x1: x, x2: x + w, y1: cy, y2: cy });
    el('circle', { class: cls, cx, cy, r });
    const t = el('text', { class: cls, x: cx, y: i === north ? cy - fs * 0.7 : cy + fs * 1.3,
      'font-size': fs, 'stroke-width': fs / 5, 'text-anchor': cx < x + w * 0.25 ? 'start' : cx > x + w * 0.75 ? 'end' : 'middle' });
    t.textContent = `${c.name} ${L.fmtLat(c.lat)}`;
  });
  $('map').replaceChildren(svg);
}

function drawEnd() {
  const m = marks(), score = m.filter(Boolean).length;
  $('endday').textContent = game.practice ? 'Practice ten' : `Today's ten · ${game.day}`;
  $('score').textContent = `${score} / ${m.length}`;
  const s = L.streak(store.get('fn:days', []), game.day);
  $('streak').textContent = game.practice ? 'Practice rounds do not count toward your streak.'
    : `${s === 1 ? 'First day of a streak' : `${s}-day streak`}. A new ten tomorrow.`;
  $('share').hidden = game.practice;
  $('copied').textContent = '';
  $('recap').replaceChildren(...game.pairs.map((_, k) => {
    const [a, b] = pairAt(k);
    const li = document.createElement('li');
    const mk = document.createElement('span'); mk.className = 'm ' + (m[k] ? 'y' : 'n'); mk.textContent = m[k] ? '✓' : '✗';
    mk.setAttribute('aria-label', m[k] ? 'right' : 'wrong');
    const [n, so] = L.northIndex(a, b) === 0 ? [a, b] : [b, a];
    const t = document.createElement('span'); t.className = 't'; t.textContent = `${n.name} is north of ${so.name}`;
    const d = document.createElement('span'); d.className = 'd'; d.textContent = `${L.fmtLat(n.lat)} vs ${L.fmtLat(so.lat)}`;
    li.append(mk, t, d);
    return li;
  }));
}

async function share() {
  const text = L.shareText(game.day, marks()) + '\nhttps://matmat202.github.io/further-north/';
  try { await navigator.clipboard.writeText(text); $('copied').textContent = 'Copied.'; }
  catch { $('copied').textContent = text; }
}

$('pick').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pick(Number(b.dataset.i)); });
$('next').addEventListener('click', next);
$('share').addEventListener('click', share);
$('practice').addEventListener('click', () => start(true));
$('daily').addEventListener('click', () => start(false));
document.addEventListener('keydown', (e) => {
  if (!game || e.metaKey || e.ctrlKey || e.altKey) return;
  if (game.showing == null && !$('play').hidden) {
    if (e.key === 'ArrowLeft' || e.key === '1') { e.preventDefault(); pick(0); }
    else if (e.key === 'ArrowRight' || e.key === '2') { e.preventDefault(); pick(1); }
  } else if (game.showing != null && (e.key === 'Enter' || e.key === ' ')) {
    // handled here even when Next has focus, so Enter is one path, not a click that may or may not fire
    e.preventDefault(); next();
  }
});

fetch('data/world.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((w) => {
  W = w; C = w.cities.map(L.city);
  $('count').textContent = String(C.length);
  start(false);
}).catch((e) => {
  $('round').textContent = '';
  $('out').textContent = `Could not load the cities (${e.message}). Reload to try again.`;
});
