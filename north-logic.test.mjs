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
// the shared link opens the sharer's ten: today's on the day, the same one as ?day= after
const dayOf = (u) => L.pastDay(new URL(u).searchParams.get('day'), '2026-11-13');
eq('a shared link names its day', dayOf(L.shareUrl('2026-11-12')), '2026-11-12');
eq('a shared link opened the same day plays today', L.pastDay(new URL(L.shareUrl('2026-11-12')).searchParams.get('day'), '2026-11-12'), null);
ok('a shared link points at the site', L.shareUrl('2026-11-12').startsWith('https://matmat202.github.io/further-north/'));
eq('streak counts back from today', L.streak(['2026-10-24', '2026-10-25', '2026-10-26'], '2026-10-26'), 3);
eq('streak survives not having played yet today', L.streak(['2026-10-24', '2026-10-25'], '2026-10-26'), 2);
eq('streak breaks on a gap', L.streak(['2026-10-23', '2026-10-25', '2026-10-26'], '2026-10-26'), 2);
eq('streak across a month end', L.streak(['2026-09-30', '2026-10-01'], '2026-10-01'), 2);
eq('no streak', L.streak(['2026-10-20'], '2026-10-26'), 0);

// --- the record (played, average, best streak, distribution) ---------------------------
eq('best streak is the longest run, not the current one',
  L.bestStreak(['2026-10-26', '2026-10-27', '2026-10-28', '2026-11-01', '2026-11-02']), 3);
eq('best streak in any order, across a month end', L.bestStreak(['2026-11-01', '2026-10-30', '2026-10-31', '2026-10-05']), 3);
eq('best streak of nothing', L.bestStreak([]), 0);
eq('best streak counts a day once', L.bestStreak(['2026-10-26', '2026-10-26']), 1);
eq('next day crosses a month', L.nextDay('2026-10-31'), '2026-11-01');
eq('record: played, average to one place, distribution', L.record([9, 7, 9], 10),
  { played: 3, avg: 8.3, dist: [0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0] });
eq('record of nothing', L.record([], 3), { played: 0, avg: 0, dist: [0, 0, 0, 0] });
{
  const toy = [['N', 'X', 50, 0, 1], ['S', 'Y', 10, 100, 1], ['M', 'Z', 30, -100, 1], ['Q', 'W', 20, 50, 1]];
  const P = L.pairsFor(toy, 'd', 2), C = toy.map(L.city);
  const right = P.map(([i, j]) => L.northIndex(C[i], C[j]));
  eq('day score: all right', L.dayScore(toy, 'd', right.slice()).valueOf(), P.length);
  eq('day score: one wrong', L.dayScore(toy, 'd', right.map((r, k) => (k ? r : 1 - r))), P.length - 1);
  eq('day score: unfinished is null', L.dayScore(toy, 'd', right.slice(0, -1)), null);
}
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
const W = JSON.parse(readFileSync(process.env.WORLD || here + 'data/world.json', 'utf8'));
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
ok('every row is [name, country, lat, lon, pop, pools]', W.cities.every((r) => r.length === 6 && typeof r[0] === 'string'
  && r[0] && typeof r[1] === 'string' && Math.abs(r[2]) <= 90 && Math.abs(r[3]) <= 180 && r[4] > 0 && [1, 2, 3].includes(r[5])));
ok('one city per name and country', new Set(W.cities.map((r) => r[0] + '|' + r[1])).size === W.cities.length);
// Names as the world writes them (2026-11-14): asciiname had shown players "UEruemqi",
// "Koeln", "Lome". Each of these is GeoNames' own UTF-8 name for the city.
for (const [n, c] of [['Zürich', 'Switzerland'], ['Ürümqi', 'China'], ['Düsseldorf', 'Germany'], ['Łódź', 'Poland'],
  ['São Paulo', 'Brazil'], ['Lomé', 'Togo'], ['Bogotá', 'Colombia'], ['Iași', 'Romania']]) ok(`${n} is spelled as written`, !!by(n, c));
// (?<!q): Albuquerque is spelled that way.
ok('no asciiname transliterations left', !W.cities.some((r) => /^UE|(?<!q)ue(?:r|m|ss)|oeln|Zuer/.test(r[0])),
  W.cities.filter((r) => /^UE|(?<!q)ue(?:r|m|ss)|oeln|Zuer/.test(r[0])).map((r) => r[0]).join());
// ...unless English has its own name for the city (2026-11-21): the recap had read "Dushanbe
// is north of Sevilla", and players do not know Köln, Makkah or Ulan Bator by those names.
for (const [n, c] of [['Cologne', 'Germany'], ['Seville', 'Spain'], ['Mecca', 'Saudi Arabia'], ['Ulaanbaatar', 'Mongolia'],
  ['Washington, D.C.', 'United States'], ['Quebec City', 'Canada'], ['Montreal', 'Canada'], ['Nizhny Novgorod', 'Russia']])
  ok(`${n} has its English name`, !!by(n, c));
{
  const local = ['Köln', 'Sevilla', 'Makkah', 'Madinah', 'Ulan Bator', 'Hannover', 'Frankfurt am Main', 'Québec', 'Montréal', 'Nay Pyi Taw', 'Nizhniy Novgorod'];
  ok('no local name where English has its own', !W.cities.some((r) => local.includes(r[0])), W.cities.filter((r) => local.includes(r[0])).map((r) => r[0]).join());
}
ok('no scholarly transliteration marks (U+1E00-1EFF)', !W.cities.some((r) => /[\u1e00-\u1eff]/.test(r[0])));
ok('country codes were resolved to names', W.cities.every((r) => r[1].length > 2));
ok('both hemispheres are in the pool', W.cities.some((r) => r[2] < -30) && W.cities.some((r) => r[2] > 55));
ok('the land path is there and in the viewBox', /^M-?\d/.test(W.land) && W.land.length > 20000
  && W.land.match(/-?\d+(\.\d)?/g).every((v) => Math.abs(+v) <= 180));

// --- a day's ten, on the real pool -----------------------------------------------------
for (const day of ['2026-10-26', '2026-10-27', '2026-11-17', '2026-11-18', '2027-02-29', '2030-12-31', 'practice-1']) {
  const pool = L.poolFor(W.cities, day);
  const P = L.pairsFor(pool, day);
  const C = pool.map(L.city);
  eq(`${day}: ten rounds`, P.length, L.ROUNDS);
  ok(`${day}: no city twice`, new Set(P.flat()).size === 2 * P.length);
  ok(`${day}: every pair inside its own band`, P.every(([i, j], k) => L.fits(C[i], C[j], L.BANDS[k])),
    JSON.stringify(P.map(([i, j]) => [C[i].name, C[j].name])));
  ok(`${day}: north is not always on one side`, new Set(P.map(([i, j]) => L.northIndex(C[i], C[j]))).size === 2);
  eq(`${day}: the same day gives the same ten`, L.pairsFor(L.poolFor(W.cities, day), day), P);
}
const deal = (d) => { const p = L.poolFor(W.cities, d); return L.pairsFor(p, d).map(([i, j]) => [p[i], p[j]]); };
ok('different days give different tens', JSON.stringify(deal('2026-10-26')) !== JSON.stringify(deal('2026-10-27')));
// Days already served, pinned by name. Everyone gets the same ten on a day (the share text
// compares scores) and ?day= replays a past day against picks stored by round, so a change
// to the hash, the rng, a band or the search that re-deals a served day breaks both. These
// were read from the LIVE site on 2026-10-27 (world.json and north-logic.js byte-identical
// to these files). Names re-spelled 2026-11-14 (asciiname -> GeoNames' UTF-8 name, same
// rows in the same order; the two-year hash below proves the deal did not move). If world.json is deliberately regenerated, this is meant to fail: decide
// then what happens to the days already played. "Reproduces itself" above cannot see any of it.
const SERVED = {
  '2026-10-26': ['Peshawar|Paris', 'Bandar Abbas|Nashville', 'Haikou|Dakar', 'Shijiazhuang|Beersheba',
    'Delhi|Medina', 'São Paulo|Mbabane', "Mosul|Xi’an", 'Denver|Yinchuan', 'Algiers|Taiyuan', 'Tyumen|Gothenburg'],
  '2026-10-27': ['Wuxi|Ottawa', 'Jamshedpur|Baghdad', 'Wuhan|Tunis', 'Yuzhno-Sakhalinsk|Düsseldorf',
    'Yerevan|Nashville', 'Kremenchuk|Quebec City', 'Havana|Honolulu', 'Adıyaman|Pyongyang', 'Prague|Astana',
    'Luxembourg|Blagoveshchensk'],
  // Served since (bin/mutate survivors, 2026-11-11): the band and search constants were left
  // as "re-deal only future days" when two days were pinned, but every day since has been
  // played. Dealt by this north-logic.js and world.json, byte-identical to the live site
  // on 2026-11-11 and unchanged in git since 2026-10-27. 11-11 is served east of UTC.
  '2026-10-28': ["Honolulu|Dushanbe","Mainz|Yinchuan","Zürich|Philadelphia","Sanaa|Ho Chi Minh City","Santiago|Maseru","Ashgabat|Rabat","Grozny|Geneva","Changsha|10th of Ramadan City","Abidjan|Georgetown","Algiers|Şanlıurfa"],
  '2026-10-29': ["Tegucigalpa|Nairobi","Kuwait City|Seoul","Shijiazhuang|Florence","Astrakhan|Leipzig","Providence|Xining","Alexandria|Xi’an","Montevideo|Melbourne","Bishkek|Bucharest","Jinan|Seville","Ho Chi Minh City|Djibouti"],
  '2026-10-30': ["Las Vegas|Guangzhou","Lhasa|Diyarbakır","Doha|Haikou","Düsseldorf|Harbin","Hanover|Ulaanbaatar","Bishkek|Geneva","Busan|Tripoli","Rawalpindi|Oklahoma City","Nouakchott|Mumbai","Wuxi|Alexandria"],
  '2026-10-31': ["Yuzhno-Sakhalinsk|Damascus","Nassau|Kyoto","Edirne|Kabul","Petah Tikva|Incheon","Taiyuan|Istanbul","Dubai|Foshan","Bursa|San Jose","Little Rock|Jinan","Quito|Libreville","Bishkek|Marseille"],
  '2026-11-01': ["Zagreb|Suzhou","Paris|Tashkent","Yantai|Gaza City","Istanbul|Harbin","Nanning|Manama","Washington, D.C.|Antakya","Seoul|Bursa","Jeddah|Havana","Chattogram|Ta’if","Kabul|Gwangju"],
  '2026-11-02': ["Katowice|Tangshan","Oradea|Novosibirsk","Muscat|Guatemala City","Bratislava|Ürümqi","Oxford|Ulaanbaatar","Tunis|Srinagar","Nashville|Pyongyang","Rawalpindi|Yokohama","Qingdao|Latakia","New York City|Yerevan"],
  '2026-11-03': ["Milwaukee|Yangzhou","Nassau|Las Vegas","Jamshedpur|Fort-de-France","Jakarta|Mamoudzou","Xi’an|New Orleans","Ürümqi|Yerevan","Baku|Incheon","Lahore|Tripoli","Phoenix|Srinagar","Zhengzhou|Latakia"],
  '2026-11-04': ["Pune|Kyoto","Boston|Jalandhar","Managua|Bandar Seri Begawan","Xiamen|Kingston","Nairobi|Kuala Lumpur","Yinchuan|Plovdiv","Sofia|New York City","Santiago|Adelaide","Baghdad|Nanjing","Islamabad|Rabat"],
  '2026-11-05': ["Tangshan|Brussels","Ürümqi|Kyoto","Shijiazhuang|Ottawa","Jinan|Shymkent","London|Quebec City","Yokohama|Gaza City","Changzhou|Phoenix","San Jose|Aleppo","Seoul|Las Vegas","Xining|Nashville"],
  '2026-11-06': ["Hong Kong|Las Vegas","10th of Ramadan City|Haikou","Bridgetown|Juba","Srinagar|Philadelphia","Hangzhou|Damascus","Little Rock|Athens","Beijing|Şanlıurfa","Ahmedabad|Honolulu","Baghdad|Los Angeles","Deir ez-Zor|Busan"],
  '2026-11-07': ["Dublin|Deir ez-Zor","Vienna|Yantai","Yaoundé|Thanjavur","Fuzhou|Tripoli","Madrid|Nicosia","Quebec City|Cherkasy","Mashhad|Pyongyang","Barcelona|Grozny","Jeju City|Peshawar","Medina|Kunming"],
  '2026-11-08': ["Astana|Philadelphia","San Diego|Rome","San Francisco|Grozny","Doha|Wuhan","Tianjin|Milwaukee","Şanlıurfa|Anshan","Yerevan|Taiyuan","10th of Ramadan City|Suzhou","Jerusalem|Yangzhou","Bishkek|Skopje"],
  '2026-11-09': ["Lhasa|Salt Lake City","Aleppo|Xiamen","Islamabad|Shenyang","New Orleans|Shantou","Ashgabat|Little Rock","Rostov-on-Don|Brussels","Libreville|Mogadishu","Qingdao|Srinagar","Chicago|Pristina","Muscat|Dongguan"],
  '2026-11-10': ["Boston|Guiyang","Guatemala City|Manama","Abuja|Yangon","Gwangju|Tirana","Yaoundé|Panama City","Marseille|New York City","Dushanbe|Naples","Jinan|Little Rock","Yinchuan|Denver","Rostov-on-Don|Ulaanbaatar"],
  '2026-11-11': ["Panama City|Macau","Erzincan|Wuhan","Mashhad|Houston","Denver|Peshawar","Lviv|Novosibirsk","Los Angeles|Lanzhou","Dushanbe|Salt Lake City","Mainz|Volgograd","Little Rock|Baghdad","Hohhot|Tirana"],
};
for (const [day, want] of Object.entries(SERVED)) {
  eq(`${day}: the ten actually served, unchanged`, deal(day).map(([a, b]) => a[0] + '|' + b[0]), want);
}
// The deal is frozen, not just its served days (2026-11-11). Pinning only served days goes
// stale every midnight: on 10-27 the band constants were left as "re-deal only future days",
// and 15 days later those days had been played. A deliberate retune must start on a date not
// yet served and move the hash in the same commit — which the pool switch did (2026-11-16):
// every day from launch to the eve of POOL_SWITCH was hashed with the code and world.json as
// they were before it, and must still deal exactly that; two years from the switch are then
// pinned under the new pool.
const sha = async (days) => {
  const h = (await import('node:crypto')).createHash('sha256');
  for (const d of days) h.update(d + JSON.stringify(L.pairsFor(L.poolFor(W.cities, d), d)));
  return h.digest('hex');
};
{
  const before = []; for (let d = L.FIRST_DAY; d < L.POOL_SWITCH; d = L.nextDay(d)) before.push(d);
  eq('every launch-pool day deals what it dealt before the switch', [before.length, await sha(before)],
    [23, '7e6360770dd7ff5b2ed79984e7bb71360020753715df0129a81f757ac6d3037c']);
  const after = []; for (let d = L.POOL_SWITCH; after.length < 731; d = L.nextDay(d)) after.push(d);
  eq('two years of tens from the switch, unchanged', await sha(after), 'd13e6523449c7a79755f5b5c5d62f7e705251ffd3fffee6e0d0c5386ee563c19');
  const launch = L.poolFor(W.cities, '2026-11-17').map((r) => r.slice(0, 5));
  eq('the launch pool is the launch world.json row for row',
    (await import('node:crypto')).createHash('sha256').update(JSON.stringify(launch)).digest('hex'),
    '5ec6ea7500eee70d94c575766be7680d0d6183b8099221e1a849789987915413');
  // Re-pinned 2026-11-21 when 18 cities took their English names (Köln -> Cologne): every
  // column but the name is still the launch file's, byte for byte.
  eq('the launch pool, names aside, is unchanged since launch',
    (await import('node:crypto')).createHash('sha256').update(JSON.stringify(launch.map((r) => r.slice(1)))).digest('hex'),
    '867ef3e15b1583f5779ed16d1270e27f966e8a35d667544b5426020e1dee0380');
}
// --- the pool switch: famous cities in from POOL_SWITCH, the launch rule's oddities out ---
{
  const inPool = (d, n) => L.poolFor(W.cities, d).some((r) => r[0] === n);
  for (const n of ['Toronto', 'Milan', 'Osaka', 'Miami', 'Seattle', 'Auckland', 'Lyon', 'Manchester'])
    ok(`${n} is in the pool from the switch`, inPool(L.POOL_SWITCH, n) && inPool('practice-1', n) && !inPool('2026-11-17', n));
  for (const n of ['Thanjavur', 'Erzincan', 'Kremenchuk', 'Jamnagar'])
    ok(`${n} leaves the pool at the switch`, inPool('2026-11-17', n) && !inPool(L.POOL_SWITCH, n));
  // kept although their GeoNames id matched no Wikidata city article (under 30 = unmatched)
  for (const n of ['São Paulo', 'Hong Kong', 'Naples', 'Geneva', 'Shenzhen'])
    ok(`${n} stays in the pool`, inPool(L.POOL_SWITCH, n));
  ok('every capital is in both pools', W.cities.filter((r) => r[5] & 1 && ['Paris', 'Ottawa', 'Canberra', 'Abuja', 'Thimphu'].includes(r[0])).every((r) => r[5] === 3));
  ok('no borough of New York City', !W.cities.some((r) => r[0] === 'Manhattan'));
  const sizes = [L.poolFor(W.cities, '2026-11-17').length, L.poolFor(W.cities, L.POOL_SWITCH).length];
  ok('both pools a few hundred cities', sizes.every((n) => n >= 350 && n <= 550), JSON.stringify(sizes));
  ok('the switch is on a day no one had played when it shipped (2026-11-16)', L.POOL_SWITCH > '2026-11-17');
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

// --- the widening fallback, which the real pool never reaches (2026-11-19) -------------
// 13 survivors had been accepted as equivalent and the sweep says each changes a deal:
// the try count, the widen count and its factor only act once a band runs dry, and no
// day of the real pool ever runs one dry, so the frozen hashes above cannot see them.
// A deal is still a function of its date whatever the pool, so these are pinned too.
{
  // Band 0 is [10, 18]: a gap of 0.5 fits only at the SIXTH widening, [10/32, 18*32];
  // a gap of 0.2 would need a seventh, so that pool deals nothing.
  eq('a pair that fits only at the last widening is found', L.pairsFor([['P', 'X', 10, 0, 1], ['Q', 'Y', 10.5, 100, 1]], 'd', 1), [[1, 0]]);
  eq('...and one that would need a seventh is not', L.pairsFor([['P', 'X', 10, 0, 1], ['Q', 'Y', 10.2, 100, 1]], 'd', 1), []);
  // Five dry levels spend exactly 5 x 4000 tries before the sixth deals, so which way
  // round the pair comes out depends on that count; 20 seeds, so one lucky parity cannot hide it.
  eq('the last-widening pair, 20 seeds, each the way round it always was',
    'abcdefghijklmnopqrst'.split('').map((s) => L.pairsFor([['P', 'X', 10, 0, 1], ['Q', 'Y', 10.5, 100, 1]], s, 1)[0].join('')).join(''),
    '0110101010100101101001101010100101101010');
  // Round 1 fits as dealt; rounds 2-3 exhaust 4000 tries and widen, so which pair they land
  // on depends on exactly how many draws each level spent.
  const wide = [['A', 'X', 0, 0, 1], ['B', 'Y', 30, 60, 1], ['C', 'Z', -25, -80, 1], ['D', 'W', 52, 140, 1], ['E', 'V', 4, -150, 1], ['F', 'U', 70, 100, 1]];
  eq('a pool that has to widen deals the same ten as ever', ['a', 'b'].map((s) => L.pairsFor(wide, s, 3)),
    [[[5, 3], [0, 4], [1, 2]], [[5, 3], [4, 0], [2, 1]]]);
  const r = L.rng(L.hash('2026-11-19'));
  eq('rng: the stream is pinned', [r(), r(), r()], [0.041265806183218956, 0.9250363318715245, 0.16971850977279246]);
  // More rounds than bands: the rest stay in the last (hardest) band.
  const P = L.pairsFor(L.poolFor(W.cities, 'practice-1'), 'practice-1', L.BANDS.length + 2), C = L.poolFor(W.cities, 'practice-1').map(L.city);
  ok('more rounds than bands: all dealt, the extra ones in the last band',
    P.length === L.BANDS.length + 2 && P.slice(L.BANDS.length - 1).every(([i, j]) => L.fits(C[i], C[j], L.BANDS[L.BANDS.length - 1])), JSON.stringify(P.slice(-3)));
  eq('city: pop is the fifth column', L.city(['N', 'C', 1, 2, 345, 3]).pop, 345);
  eq('lonGap: -180 and 180 are one meridian', L.lonGap({ lon: -180 }, { lon: 180 }), 0);
  // app.js orders "X is north of Y" by northIndex; on a tie it names the left city first.
  eq('northIndex: a tie points left', L.northIndex({ lat: 12 }, { lat: 12 }), 0);
}

// --- the reveal map's window (2026-11-22) ------------------------------------------------
// 518 of the 3650 rounds dealt 2026-11-22..2027-11-21 pair cities more than 180° of
// longitude apart; they used to get the whole world with the cities at its two edges.
{
  const kobe = { lat: 34.69, lon: 135.18 }, fw = { lat: 32.73, lon: -97.32 };
  const v = L.mapView(kobe, fw), u = L.mapView(fw, kobe);
  eq('map: a Pacific pair is framed the short way (128° + 40)', Math.round(v.w), 168);
  eq('map: either order gives the same window', [u.x, u.w, u.ax, u.bx], [v.x, v.w, v.bx, v.ax]);
  eq('map: the western city is moved east of the dateline', [v.ax, Math.round(v.bx * 100) / 100], [135.18, 262.68]);
  ok('map: Pacific window straddles 180', v.x < 180 && v.x + v.w > 180, JSON.stringify(v));
  // a pair that does not cross keeps its old window exactly (golden from the pre-change code)
  eq('map: Rome/New York window unchanged', L.mapView(A, B), { x: -94, y: -72.925, w: 126.5, h: 63.25, ax: 12.5, bx: -74 });
  eq('map: a close pair zooms no tighter than 70°', L.mapView({ lat: 50, lon: -170 }, { lat: 40, lon: -169 }).x, -180);
  // every round of the coming year: both cities inside, and no window wider than 220°
  let bad = 0, widest = 0, d = '2026-11-22';
  for (let n = 0; n < 365; n++, d = L.nextDay(d)) {
    const p = L.poolFor(W.cities, d), C = p.map(L.city);
    for (const [i, j] of L.pairsFor(p, d)) {
      const m = L.mapView(C[i], C[j]); widest = Math.max(widest, m.w);
      const inside = (cx, lat) => cx > m.x && cx < m.x + m.w && -lat > m.y && -lat < m.y + m.h;
      if (!inside(m.ax, C[i].lat) || !inside(m.bx, C[j].lat) || Math.abs(m.ax - m.bx) > 180) bad++;
    }
  }
  eq('map: every city of the year sits inside its window, the short way round', bad, 0);
  ok('map: no window of the year is wider than 220°', widest <= 220, `widest ${widest}`);
}

// --- the magnifier for a close pair (2026-11-23) ------------------------------------------
// Honolulu 21.31 / Jeddah 21.49 was round 10 on 2026-11-23: 0.18° on a 70°-wide map is
// under a pixel at phone width, and the two lines drew as one.
{
  const hnl = { name: 'Honolulu', country: 'US', lat: 21.31, lon: -157.86 }, jed = { name: 'Jeddah', country: 'SA', lat: 21.49, lon: 39.19 };
  const v = L.mapView(hnl, jed), z = L.insetView(hnl, jed, v);
  ok('inset: a hair-breadth pair gets a magnifier', z !== null);
  // Rome/New York, 1.2° on a 126°-wide map, is 3 px apart at phone width: it gets one too
  ok('inset: Rome/New York (3 px apart on a phone) gets one', L.insetView(A, B) !== null);
  ok('inset: none for a wide gap', L.insetView({ lat: 50, lon: 0 }, { lat: 35, lon: 60 }) === null);
  ok('inset: the north line is drawn above the south one', z.yn < z.ys, JSON.stringify(z));
  ok('inset: the lines are pulled apart to INSET_SPREAD of the box', Math.abs((z.ys - z.yn) - L.INSET_SPREAD * z.h) < 1e-9);
  eq('inset: k is the magnification', z.k, Math.round((z.ys - z.yn) / 0.18));
  ok('inset: the box is inside the map', z.x >= v.x && z.y >= v.y && z.x + z.w <= v.x + v.w && z.y + z.h <= v.y + v.h, JSON.stringify([v, z]));
  // the lines sit in the upper half here, so the box goes at the bottom, away from Honolulu
  // (the south city, whose label hangs below its line)
  ok('inset: the box is in the half away from the lines', z.y > v.y + v.h / 2);
  const hx = v.ax;
  ok('inset: and on the other side from the south label', (hx > v.x + v.w / 2) === (z.x < v.x + v.w / 2), JSON.stringify({ hx, z }));
  const same = (u, w) => JSON.stringify(u) === JSON.stringify(w);
  ok('inset: either order gives the same box', same(L.insetView(jed, hnl), z) || (() => { const y = L.insetView(jed, hnl); return y.x === z.x && y.y === z.y && y.yn === z.yn; })());
  // labels where app.js put them before labelAt existed: Rome (north, east edge) ends at its
  // dot above its line; New York (south, west edge) starts at its dot below it
  const rv = L.mapView(A, B), fs = rv.w / 26, rl = L.labelAt(A, rv.ax, true, rv), nl = L.labelAt(B, rv.bx, false, rv);
  eq('label: Rome above its line, anchored at the end', [rl.anchor, rl.y], ['end', -41.9 - fs * 0.7]);
  eq('label: New York below its line, anchored at the start', [nl.anchor, nl.y], ['start', -40.7 + fs * 1.3]);
  eq('label: the box spans the text from the anchor', [rl.box[2], nl.box[0], Math.round(rl.box[2] - rl.box[0])], [rv.ax, rv.bx, Math.round(0.6 * fs * 'A 41.9°N'.length)]);
  // a pair in the southern hemisphere near the bottom clamp: lines low, box at the top
  const s1 = { name: 'S1', lat: -80.2, lon: -68.3 }, s2 = { name: 'S2', lat: -80, lon: 10 };
  const sv = L.mapView(s1, s2), sz = L.insetView(s1, s2, sv);
  ok('inset: lines in the lower half put the box at the top', sz && sz.y + sz.h < sv.y + sv.h / 2, JSON.stringify([sv, sz]));
  // every round of the coming year at phone width (350 px of map): no two lines closer than
  // 6 px without a box, and no box over either city or the label that shares its half
  // (labels as app.js places them: fs = w/26, ~0.6 fs per character, anchored by position)
  let bare = 0, hits = [], boxes = 0, d = '2026-11-23';
  for (let n = 0; n < 365; n++, d = L.nextDay(d)) {
    const p = L.poolFor(W.cities, d), C = p.map(L.city);
    for (const [i, j] of L.pairsFor(p, d)) {
      const a = C[i], b = C[j], m = L.mapView(a, b), q = L.insetView(a, b, m);
      if (!q) { if (Math.abs(a.lat - b.lat) * 350 / m.w < 6) bare++; continue; }
      boxes++;
      const north = L.northIndex(a, b), over = ([x0, y0, x1, y1]) => x1 > q.x && x0 < q.x + q.w && y1 > q.y && y0 < q.y + q.h;
      [[a, m.ax, 0], [b, m.bx, 1]].forEach(([c, cx, k]) => {
        const cy = -c.lat, r = m.w / 110;
        if (over([cx - r, cy - r, cx + r, cy + r])) hits.push([d, c.name, 'dot']);
        if (over(L.labelAt(c, cx, k === north, m).box)) hits.push([d, c.name, 'label']);
      });
    }
  }
  eq('inset: no round of the year leaves two lines under 6 px apart without a box', bare, 0);
  ok('inset: the year has boxes to check', boxes > 1000, `boxes ${boxes}`);
  eq('inset: no box of the year covers a city or its label', [hits.length, hits.slice(0, 5)], [0, []]);
}

console.log(`${fail ? 'FAIL' : 'ok'} north-logic: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
