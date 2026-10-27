// Further North — the page's pure logic. No DOM; imported by app.js and the test.

export const ROUNDS = 10;
// Latitude gap (degrees) for each round of a day: easy first, a hair's breadth last.
export const BANDS = [
  [10, 18], [7, 12], [5, 9], [4, 7], [3, 5.5], [2, 4], [1.5, 3], [1, 2.2], [0.5, 1.5], [0.15, 0.9],
];
// Two cities on the same meridian are easy; the game is in comparing across the map.
export const MIN_LON_GAP = 35;
export const KM_PER_DEG = 111.2;

// FNV-1a: a date string to a 32-bit seed.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// mulberry32: small, fast, and the same sequence in every browser.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const city = (r) => ({ name: r[0], country: r[1], lat: r[2], lon: r[3], pop: r[4] });

export function lonGap(a, b) {
  const d = Math.abs(a.lon - b.lon) % 360;
  return d > 180 ? 360 - d : d;
}

export function fits(a, b, [lo, hi]) {
  const d = Math.abs(a.lat - b.lat);
  return a.country !== b.country && d >= lo && d <= hi && lonGap(a, b) >= MIN_LON_GAP;
}

// The day's pairs. Each pair is [i, j] into `cities`, in the order shown (left, right).
// No city appears twice in a day. A band nothing fits (a tiny pool) widens until one does.
export function pairsFor(cities, seedStr, n = ROUNDS) {
  const r = rng(hash(seedStr));
  const C = cities.map(city);
  const used = new Set();
  const out = [];
  for (let k = 0; k < n; k++) {
    let [lo, hi] = BANDS[Math.min(k, BANDS.length - 1)];
    let pair = null;
    for (let widen = 0; !pair && widen < 6; widen++) {
      for (let t = 0; t < 4000 && !pair; t++) {
        const i = Math.floor(r() * C.length), j = Math.floor(r() * C.length);
        if (i === j || used.has(i) || used.has(j)) continue;
        if (fits(C[i], C[j], [lo, hi])) pair = [i, j];
      }
      lo /= 2; hi *= 2;
    }
    if (!pair) break;
    used.add(pair[0]); used.add(pair[1]);
    out.push(pair);
  }
  return out;
}

// Which side is further north: 0 (left) or 1 (right). Exact ties never get picked by
// pairsFor (the smallest band starts above zero), but count a tie as either side right.
export function northIndex(a, b) { return a.lat >= b.lat ? 0 : 1; }
export function isRight(a, b, pick) { return a.lat === b.lat || northIndex(a, b) === pick; }

export function fmtLat(lat) {
  const v = Math.abs(lat).toFixed(1);
  return lat > 0 ? `${v}°N` : lat < 0 ? `${v}°S` : '0.0°';
}

// "about 130 km" — the gap a player is told after each answer.
export function gapKm(a, b) {
  const km = Math.abs(a.lat - b.lat) * KM_PER_DEG;
  if (km < 10) return `${Math.round(km)} km`;
  if (km < 1000) return `${Math.round(km / 10) * 10} km`;
  return `${(Math.round(km / 100) * 100).toLocaleString('en-US')} km`;
}

export function verdict(a, b) {
  const [n, s] = northIndex(a, b) === 0 ? [a, b] : [b, a];
  return `${n.name} is about ${gapKm(a, b)} further north than ${s.name}.`;
}

// Local calendar date, so "today's ten" turns over at the player's midnight.
export function dayKey(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The first day a daily ten was served. ?day= plays any day from here up to yesterday.
export const FIRST_DAY = '2026-10-26';

export function prevDay(key) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

// A ?day= worth honouring: a real calendar date, FIRST_DAY or later and before `today`.
// Anything else is null, and the page plays today's ten.
export function pastDay(param, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param || '')) return null;
  const d = new Date(param + 'T12:00:00');
  if (Number.isNaN(d.getTime()) || dayKey(d) !== param) return null;
  return param >= FIRST_DAY && param < today ? param : null;
}

// The latest day before `from` whose ten is unfinished, back to FIRST_DAY; null if none.
// `done(day)` says whether that day's ten was played to the end.
export function missedDay(from, done) {
  for (let d = prevDay(from); d >= FIRST_DAY; d = prevDay(d)) if (!done(d)) return d;
  return null;
}

export function shareText(day, marks) {
  const score = marks.filter(Boolean).length;
  return `Further North ${day}: ${score}/${marks.length}\n${marks.map((m) => (m ? '🟩' : '🟥')).join('')}`;
}

// Consecutive days played, ending today or yesterday. `days` is a list of dayKeys.
export function streak(days, today) {
  const have = new Set(days);
  const d = new Date(today + 'T12:00:00');
  if (!have.has(today)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (have.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// Map position in the land path's viewBox (-180 -90 360 180).
export const xy = (c) => [c.lon, -c.lat];
