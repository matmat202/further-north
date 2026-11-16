/* Where every mark sits on each step of the story. Pure: no DOM, so test/story.test.mjs
 * runs every layout at several plot sizes. Modelled on which-read-more/site/story.
 *
 * Every step is the same chart with different rows: one row per rule (or per slice of
 * the pairs), in each the rule's 1,000 random twins as a grey histogram of how often
 * they picked the further-north city, and the real rule as one red dot.
 *   "rules":  the three rules, over every pair of the year
 *   "rounds": "pick the European city", one row per round of the day's ten
 *   "bigger": "pick the bigger city", all pairs, then split by continent
 */
export const COL = { hit: '#b3261e', faint: '#cfcac3' };
export const RATE = [0.3, 1];
export const BIN = 0.005;
export const STEPS = {
  rules: ['europe', 'capital', 'bigger'],
  rounds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10'],
  bigger: ['bigger', 'across', 'within'],
};

const memo = new WeakMap();
/* row key -> the pairs it is asked over ([round, i, j], i and j into D.cities) */
export function rowPairs(D) {
  if (memo.has(D)) return memo.get(D);
  const C = D.cities, same = ([, i, j]) => C[i][2] === C[j][2];
  const out = { europe: D.pairs, capital: D.pairs, bigger: D.pairs,
    across: D.pairs.filter((p) => !same(p)), within: D.pairs.filter(same) };
  for (let k = 0; k < 10; k++) out[`r${k + 1}`] = D.pairs.filter((p) => p[0] === k);
  memo.set(D, out);
  return out;
}

const lat = (D, i) => D.cities[i][3];
/* the real rule on one row -> {won, n}: of the pairs where it picks one city, how often that one is further north */
export function rowRate(D, key) {
  const row = D.rows.find((r) => r.key === key);
  if (!row) throw new Error(`unknown row ${key}`);
  let won = 0, n = 0;
  for (const [, i, j] of rowPairs(D)[key]) {
    if (row.kind === 'pop') {
      const pi = D.cities[i][4], pj = D.cities[j][4];
      if (pi === pj) continue;
      n++; won += (pi > pj) === (lat(D, i) > lat(D, j));
    } else {
      const has = row.kind === 'eu' ? (x) => D.cities[x][2] === 'EU' : (x) => D.cities[x][5] === 1;
      if (has(i) === has(j)) continue;
      n++; won += has(i) ? lat(D, i) > lat(D, j) : lat(D, j) > lat(D, i);
    }
  }
  return { won, n };
}

/* -> {X, Y, show, rowH, shuffles: {key: [{x,y,w,h,n}]}, real: [{x,y,r,fill,op}] one per D.rows} in px of w x h */
export function layout(name, D, w, h) {
  const show = STEPS[name];
  if (!show) throw new Error(`unknown step ${name}`);
  const pad = 8;
  const keys = D.rows.map((r) => r.key);
  const X = (v) => pad + ((v - RATE[0]) / (RATE[1] - RATE[0])) * (w - 2 * pad);
  const rowH = (h - 2 * pad) / show.length;
  const Y = (k) => pad + rowH * (k + 1);
  const shuffles = Object.fromEntries(keys.map((k) => [k, []]));
  const real = keys.map(() => ({ x: w / 2, y: h / 2, r: 0, op: 0, fill: COL.faint }));
  // the random twins as a histogram: one bar per BIN of rate, its height the share of twins in it
  const hist = (vals, base, room) => {
    const cnt = {};
    for (const v of vals) { const b = Math.round(v / BIN); cnt[b] = (cnt[b] || 0) + 1; }
    const most = Math.max(...Object.values(cnt)), bw = Math.max(1, (X(BIN) - X(0)) * 0.7);
    return Object.entries(cnt).map(([b, n]) => ({ x: X(b * BIN) - bw / 2, y: base - (room * n) / most, w: bw, h: (room * n) / most, n: +n }));
  };
  const big = Math.max(3.5, Math.min(8, rowH * 0.2));
  show.forEach((key, k) => {
    shuffles[key] = hist(D.shuffles[key], Y(k) - 2, rowH * (show.length > 5 ? 0.45 : 0.6));
    const R = rowRate(D, key);
    real[keys.indexOf(key)] = { x: X(R.won / R.n), y: Y(k) - 2 - big, r: big, fill: COL.hit, op: 1 };
  });
  return { kind: name, X, Y, show, rowH, shuffles, real };
}
