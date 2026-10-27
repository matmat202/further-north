// node site/north-logic.test.mjs — the page's pure logic, plus the shipped data checked
// against facts read straight out of GeoNames. Exit 1 on any failure.
//   test/plant.sh   # mutates a copy of the logic three ways; each must FAIL this suite
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const L = await import(process.env.LOGIC ? pathToFileURL(process.env.LOGIC).href : './north-logic.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${extra}`); } };
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

// --- the pieces ------------------------------------------------------------------------
eq('hash is stable', L.hash('2026-10-26'), L.hash('2026-10-26'));
ok('hash differs by day', L.hash('2026-10-26') !== L.hash('2026-10-27'));
{
  const a = L.rng(7), b = L.rng(7), xs = Array.from({ length: 5 }, a);
  eq('rng is reproducible', xs, Array.from({ length: 5 }, b));
  ok('rng stays in [0,1)', Array.from({ length: 2000 }, L.rng(1)).every((x) => x >= 0 && x < 1));
}
const A = { name: 'A', country: 'X', lat: 41.9, lon: 12.5 }, B = { name: 'B', country: 'Y', lat: 40.7, lon: -74 };
eq('north is the higher latitude', [L.northIndex(A, B), L.northIndex(B, A)], [0, 1]);
eq('a pick is right or wrong', [L.isRight(A, B, 0), L.isRight(A, B, 1)], [true, false]);
eq('south of the equator is still compared by signed latitude',
  L.northIndex({ lat: -33.9 }, { lat: -34.6 }), 0);
eq('longitude gap wraps the dateline', L.lonGap({ lon: 170 }, { lon: -170 }), 20);
eq('fits: same country never', L.fits(A, { ...B, country: 'X' }, [0, 5]), false);
eq('fits: too close in longitude never', L.fits(A, { ...B, lon: 30 }, [0, 5]), false);
eq('fits: inside the band', L.fits(A, B, [1, 2]), true);
eq('fits: outside the band', L.fits(A, B, [2, 3]), false);
eq('latitudes format', [41.89, -33.87, 0].map(L.fmtLat), ['41.9°N', '33.9°S', '0.0°']);
eq('gap in km rounds by size', [L.gapKm({ lat: 0 }, { lat: 0.05 }), L.gapKm({ lat: 0 }, { lat: 1.2 }), L.gapKm({ lat: 0 }, { lat: 20 })],
  ['6 km', '130 km', '2,200 km']);
eq('verdict names north first', L.verdict(B, A), 'A is about 130 km further north than B.');
eq('day key is the local date', L.dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
eq('share text', L.shareText('2026-10-26', [true, false, true]), 'Further North 2026-10-26: 2/3\n🟩🟥🟩');
eq('streak counts back from today', L.streak(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26'), 3);
eq('streak survives not having played yet today', L.streak(['2026-10-24', '2026-10-25'], '2026-10-26'), 2);
eq('streak breaks on a gap', L.streak(['2026-10-23', '2026-10-25', '2026-10-26'], '2026-10-26'), 2);
eq('streak across a month end', L.streak(['2026-09-30', '2026-10-01'], '2026-10-01'), 2);
eq('no streak', L.streak(['2026-10-20'], '2026-10-26'), 0);

// --- earlier days (?day=) ----------------------------------------------------------------
eq('prevDay crosses a month', [L.prevDay('2026-11-01'), L.prevDay('2027-01-01')], ['2026-10-31', '2026-12-31']);
eq('pastDay takes an earlier real day', L.pastDay('2026-10-27', '2026-10-30'), '2026-10-27');
eq('pastDay takes the first day', L.pastDay(L.FIRST_DAY, '2026-10-30'), L.FIRST_DAY);
eq('pastDay refuses before the first day', L.pastDay('2026-10-25', '2026-10-30'), null);
eq('pastDay refuses today and later', [L.pastDay('2026-10-30', '2026-10-30'), L.pastDay('2026-10-31', '2026-10-30')], [null, null]);
eq('pastDay refuses non-dates', ['2026-11-31', '2027-02-29', '2026-13-01', '26-10-27', '', null, '2026-10-27x'].map((p) => L.pastDay(p, '2027-06-01')), [null, null, null, null, null, null, null]);
const played = new Set(['2026-10-29', '2026-10-28']);
eq('missedDay skips played days', L.missedDay('2026-10-30', (d) => played.has(d)), '2026-10-27');
eq('missedDay is yesterday when unplayed', L.missedDay('2026-10-30', () => false), '2026-10-29');
eq('missedDay stops at the first day', [L.missedDay('2026-10-30', () => true), L.missedDay(L.FIRST_DAY, () => false)], [null, null]);

// --- the shipped data, against GeoNames ------------------------------------------------
const here = fileURLToPath(new URL('.', import.meta.url));
const W = JSON.parse(readFileSync(here + 'data/world.json', 'utf8'));
const by = (n, c) => W.cities.map(L.city).find((x) => x.name === n && x.country === c);
const rome = by('Rome', 'Italy'), nyc = by('New York City', 'United States'), london = by('London', 'United Kingdom');
// Read from cities15000.txt: Rome 41.89193 12.51133; New York City 40.71427 -74.00597;
// London 51.50853 -0.12574; Sydney -33.86785 151.20732.
eq('Rome is where GeoNames puts it', [rome.lat, rome.lon], [41.89, 12.51]);
eq('New York City is where GeoNames puts it', [nyc.lat, nyc.lon], [40.71, -74.01]);
eq('London is where GeoNames puts it', [london.lat, london.lon], [51.51, -0.13]);
eq('Sydney is south', by('Sydney', 'Australia').lat, -33.87);
eq('the textbook surprise holds: Rome is north of New York', L.northIndex(rome, nyc), 0);
ok('no district of a city: Puxi and Pudong are Shanghai', !W.cities.some((r) => ['Puxi', 'Pudong', 'New Territories'].includes(r[0])));
ok('a few hundred cities', W.cities.length >= 300 && W.cities.length <= 600, `got ${W.cities.length}`);
ok('every row is [name, country, lat, lon, pop]', W.cities.every((r) => r.length === 5 && typeof r[0] === 'string'
  && r[0] && typeof r[1] === 'string' && Math.abs(r[2]) <= 90 && Math.abs(r[3]) <= 180 && r[4] > 0));
ok('one city per name and country', new Set(W.cities.map((r) => r[0] + '|' + r[1])).size === W.cities.length);
ok('country codes were resolved to names', W.cities.every((r) => r[1].length > 2));
ok('both hemispheres are in the pool', W.cities.some((r) => r[2] < -30) && W.cities.some((r) => r[2] > 55));
ok('the land path is there and in the viewBox', /^M-?\d/.test(W.land) && W.land.length > 20000
  && W.land.match(/-?\d+(\.\d)?/g).every((v) => Math.abs(+v) <= 180));

// --- a day's ten, on the real pool -----------------------------------------------------
for (const day of ['2026-10-26', '2026-10-27', '2027-02-29', '2030-12-31', 'practice-1']) {
  const P = L.pairsFor(W.cities, day);
  const C = W.cities.map(L.city);
  eq(`${day}: ten rounds`, P.length, L.ROUNDS);
  ok(`${day}: no city twice`, new Set(P.flat()).size === 2 * P.length);
  ok(`${day}: every pair inside its own band`, P.every(([i, j], k) => L.fits(C[i], C[j], L.BANDS[k])),
    JSON.stringify(P.map(([i, j]) => [C[i].name, C[j].name])));
  ok(`${day}: north is not always on one side`, new Set(P.map(([i, j]) => L.northIndex(C[i], C[j]))).size === 2);
  eq(`${day}: the same day gives the same ten`, L.pairsFor(W.cities, day), P);
}
ok('different days give different tens', JSON.stringify(L.pairsFor(W.cities, '2026-10-26')) !== JSON.stringify(L.pairsFor(W.cities, '2026-10-27')));
// Days already served, pinned by name. Everyone gets the same ten on a day (the share text
// compares scores) and ?day= replays a past day against picks stored by round, so a change
// to the hash, the rng, a band or the search that re-deals a served day breaks both. These
// were read from the LIVE site on 2026-10-27 (world.json and north-logic.js byte-identical
// to these files). If world.json is deliberately regenerated, this is meant to fail: decide
// then what happens to the days already played. "Reproduces itself" above cannot see any of it.
const SERVED = {
  '2026-10-26': ['Peshawar|Paris', 'Bandar Abbas|Nashville', 'Haikou|Dakar', 'Shijiazhuang|Beersheba',
    'Delhi|Madinah', 'Sao Paulo|Mbabane', "Mosul|Xi'an", 'Denver|Yinchuan', 'Algiers|Taiyuan', 'Tyumen|Gothenburg'],
  '2026-10-27': ['Wuxi|Ottawa', 'Jamshedpur|Baghdad', 'Wuhan|Tunis', 'Yuzhno-Sakhalinsk|Duesseldorf',
    'Yerevan|Nashville', 'Kremenchuk|Quebec', 'Havana|Honolulu', 'Adiyaman|Pyongyang', 'Prague|Astana',
    'Luxembourg|Blagoveshchensk'],
};
for (const [day, want] of Object.entries(SERVED)) {
  eq(`${day}: the ten actually served, unchanged`, L.pairsFor(W.cities, day).map(([i, j]) => W.cities[i][0] + '|' + W.cities[j][0]), want);
}

// --- boundaries the cases above never stood on (bin/mutate survivors, 2026-10-27) -------
{
  const at = (country, lat, lon) => ({ country, lat, lon });
  ok('a gap exactly at the band floor fits', L.fits(at('X', 10, 0), at('Y', 13, 100), [3, 5]));
  ok('a gap exactly at the band ceiling fits', L.fits(at('X', 10, 0), at('Y', 15, 100), [3, 5]));
  ok('a longitude gap of exactly MIN_LON_GAP fits', L.fits(at('X', 10, 0), at('Y', 14, L.MIN_LON_GAP), [3, 5]));
  ok('one degree short of MIN_LON_GAP does not', !L.fits(at('X', 10, 0), at('Y', 14, L.MIN_LON_GAP - 1), [3, 5]));
  eq('lonGap just past 180 wraps', L.lonGap({ lon: -170 }, { lon: 10.5 }), 179.5);
  eq('just north of the equator is N', L.fmtLat(0.5), '0.5°N');
  const g = (km) => L.gapKm({ lat: km / L.KM_PER_DEG }, { lat: 0 });
  eq('10.5 km rounds to tens', g(10.5), '10 km');
  eq('just over 1,000 km keeps the thousands comma', g(1000.4), '1,000 km');
  eq('the first day itself can be the missed one', L.missedDay('2026-10-28', () => false), '2026-10-27');
  eq('...and back to FIRST_DAY when the later ones were played',
    L.missedDay('2026-10-28', (d) => d !== L.FIRST_DAY), L.FIRST_DAY);
}
{
  const tiny = [['P', 'X', 10, 0, 1], ['Q', 'Y', 40, 100, 1], ['R', 'Z', -20, -100, 1]];
  const P = L.pairsFor(tiny, 'd', 3);
  ok('a tiny pool widens the band rather than hang', P.length === 1, JSON.stringify(P));
}

console.log(`${fail ? 'FAIL' : 'ok'} north-logic: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
