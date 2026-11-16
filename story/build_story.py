#!/usr/bin/env python3
"""site/data/world.json -> site/story/story.json: what on the card tells you which city is further north?

    python3 build_story.py          # BUILD_OUT=... writes elsewhere (publish.sh compares)

The pairs are the game's own: pairsFor() from site/north-logic.js, re-done here for each
of the first year of daily tens (FIRST_DAY and the 364 days after it; every day's ten is
fixed by its date, so the future ones are already decided). test/story.test.mjs re-draws
them with the real JS and requires the same list.

The card shows a city and its country, nothing else. Three rules a player could play off
that (RULES below): pick the European city, pick the capital, pick the bigger city. Each
is asked the same way: in pairs where the rule picks one, how often is that one the
further north? The control that could kill each answer: the same rule run on a random
label. For "Europe" and "capital", as many random cities as the real label holds; for
"bigger", the populations shuffled among the cities. 1,000 times each, same pairs.

Europe is GeoNames' continent EU, less the Russian cities east of the Urals (60°E):
Novosibirsk is filed under Europe there, and no player would call it European.

The RNG is mulberry32, written out (the game's own), so neither the pairs nor the shuffles
depend on Python's random.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD = os.path.join(HERE, "site", "data", "world.json")
INFO = os.path.join(HERE, "data", "countryInfo.txt")
OUT = os.environ.get("BUILD_OUT", os.path.join(HERE, "site", "story", "story.json"))
N_SH, SEED, ROUNDS, N_DAYS = 1000, 20261116, 10, 365
FIRST_DAY = "2026-10-26"
POOL_SWITCH = "2026-11-18"  # north-logic.js: days before it deal from pool 1, the rest from pool 2
URALS = 60

# the game's own constants (site/north-logic.js)
BANDS = [[10, 18], [7, 12], [5, 9], [4, 7], [3, 5.5], [2, 4], [1.5, 3], [1, 2.2], [0.5, 1.5], [0.15, 0.9]]
MIN_LON_GAP = 35
M32 = 0xFFFFFFFF


def imul(a, b):
    return (a * b) & M32


def fnv_js(s):
    h = 0x811C9DC5
    b = s.encode("utf-16-le")
    for k in range(0, len(b), 2):
        h = imul(h ^ (b[k] | b[k + 1] << 8), 0x01000193)
    return h


def mulberry32(a):
    a &= M32

    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = a
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return nxt


def lon_gap(a, b):
    d = abs(a[3] - b[3]) % 360
    return 360 - d if d > 180 else d


def fits(a, b, lo, hi):
    d = abs(a[2] - b[2])
    return a[1] != b[1] and lo <= d <= hi and lon_gap(a, b) >= MIN_LON_GAP


def pairs_for(C, seed):
    r = mulberry32(fnv_js(seed))
    used, out = set(), []
    for k in range(ROUNDS):
        lo, hi = BANDS[min(k, len(BANDS) - 1)]
        pair = None
        for _ in range(6):
            if pair:
                break
            t = 0
            while t < 4000 and not pair:
                t += 1
                i, j = int(r() * len(C)), int(r() * len(C))
                if i == j or i in used or j in used:
                    continue
                if fits(C[i], C[j], lo, hi):
                    pair = (i, j)
            lo, hi = lo / 2, hi * 2
        if not pair:
            break
        used |= set(pair)
        out.append(pair)
    return out


def pool_pairs(C, d):
    """The day's pairs as indices into the whole of world.json's cities (poolFor, then pairsFor)."""
    bit = 1 if d < POOL_SWITCH else 2
    idx = [n for n, c in enumerate(C) if c[5] & bit]
    return [(idx[i], idx[j]) for i, j in pairs_for([C[n] for n in idx], d)]


def days():
    import datetime
    d0 = datetime.date.fromisoformat(FIRST_DAY)
    return [(d0 + datetime.timedelta(days=n)).isoformat() for n in range(N_DAYS)]


def label_rate(pairs, C, has):
    """pairs where exactly one city has the label -> (that one further north, n)"""
    won = n = 0
    for _, i, j in pairs:
        if has[i] == has[j]:
            continue
        n += 1
        won += (C[i][2] > C[j][2]) if has[i] else (C[j][2] > C[i][2])
    return won, n


def bigger_rate(pairs, C, pop):
    won = n = 0
    for _, i, j in pairs:
        if pop[i] == pop[j]:
            continue
        n += 1
        won += (pop[i] > pop[j]) == (C[i][2] > C[j][2])
    return won, n


def shuffle(xs, rnd):
    s = xs[:]
    for i in range(len(s) - 1, 0, -1):
        j = int(rnd() * (i + 1))
        s[i], s[j] = s[j], s[i]
    return s


def main():
    C = json.load(open(WORLD, encoding="utf-8"))["cities"]
    cont, cap = {}, {}
    for line in open(INFO, encoding="utf-8"):
        if line.strip() and not line.startswith("#"):
            f = line.rstrip("\n").split("\t")
            cont[f[4]], cap[f[4]] = f[8], f[5]
    conts = [("AS" if cont[c[1]] == "EU" and c[3] > URALS else cont[c[1]]) for c in C]
    eu = [x == "EU" for x in conts]
    capital = [cap[c[1]] == c[0] for c in C]
    pop = [c[4] for c in C]
    D = days()
    pairs = [[k, i, j] for di, d in enumerate(D) for k, (i, j) in enumerate(pool_pairs(C, d))]
    same = lambda p: conts[p[1]] == conts[p[2]]
    # [key, label, kind, pairs]
    rows = [["europe", "the city in Europe", "eu", pairs], ["capital", "the capital", "cap", pairs], ["bigger", "the bigger city", "pop", pairs]]
    rows += [[f"r{k + 1}", f"round {k + 1}", "eu", [p for p in pairs if p[0] == k]] for k in range(ROUNDS)]
    rows += [["across", "across two continents", "pop", [p for p in pairs if not same(p)]],
             ["within", "within one continent", "pop", [p for p in pairs if same(p)]]]
    real = {"eu": eu, "cap": capital, "pop": pop}
    rate = lambda kind, ps, v: (bigger_rate if kind == "pop" else label_rate)(ps, C, v)
    rnd = mulberry32(SEED)
    sh = {k: [] for k, *_ in rows}
    idx = list(range(len(C)))
    for _ in range(N_SH):
        draws = {}
        for kind in ("eu", "cap"):
            s = set(shuffle(idx, rnd)[:sum(real[kind])])
            draws[kind] = [i in s for i in idx]
        draws["pop"] = shuffle(pop, rnd)
        for k, _, kind, ps in rows:
            w, n = rate(kind, ps, draws[kind])
            sh[k].append(round(w / n, 6) if n else 0.5)
    check = {"n_pairs": len(pairs), "n_days": len(D), "n_cities": len(C), "n_used": len({i for p in pairs for i in p[1:]}),
             "n_eu": sum(eu), "n_cap": sum(capital)}
    for k, _, kind, ps in rows:
        w, n = rate(kind, ps, real[kind])
        r = w / n
        s = sorted(sh[k])
        check.update({f"{k}_won": w, f"{k}_n": n, f"{k}_rate": round(r, 6), f"{k}_med": s[N_SH // 2], f"{k}_min": s[0], f"{k}_max": s[-1],
                      f"{k}_high": sum(x >= r for x in s), f"{k}_low": sum(x <= r for x in s)})
    # of the cross-continent pairs the bigger-city rule loses, those it loses to a big Asian city against a smaller European one
    lost = [(i, j) if pop[i] > pop[j] else (j, i) for _, i, j in rows[-2][3]]
    lost = [(b, s) for b, s in lost if C[b][2] < C[s][2]]
    check["aseu_lost"] = sum(conts[b] == "AS" and conts[s] == "EU" for b, s in lost)
    out = {
        "source": "GeoNames cities15000 (CC BY 4.0) as the game ships it in site/data/world.json; continents and capitals from GeoNames countryInfo.txt",
        "first": D[0], "last": D[-1], "seed": SEED, "urals": URALS,
        "cities": [[c[0], c[1], conts[n], c[2], c[4], int(capital[n])] for n, c in enumerate(C)],
        "pairs": pairs,
        "rows": [{"key": k, "label": l, "kind": kind} for k, l, kind, _ in rows],
        "shuffles": sh, "check": check,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"  {len(pairs)} pairs over {len(D)} days, {check['n_used']} of {len(C)} cities used; {sum(eu)} European, {sum(capital)} capitals")
    for k, l, _, _ in rows:
        print(f"  {k:8} {l:24} {check[k+'_won']}/{check[k+'_n']} = {check[k+'_rate']:.3f}   random: {check[k+'_min']:.3f}..{check[k+'_max']:.3f} med {check[k+'_med']:.3f}; {check[k+'_high']} as high, {check[k+'_low']} as low")


if __name__ == "__main__":
    main()
