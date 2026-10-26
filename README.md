# Further North

**https://matmat202.github.io/further-north/**

Two world cities: which one is further north? Ten pairs a day, from an easy gap of
1,000+ km down to a few dozen, always between cities far apart east–west, so you can't
just look up the coast. After each answer a map zoomed to the pair draws a line along
each city's latitude, which is usually where the surprise is: Rome is north of New York,
Havana is north of Hong Kong.

Everyone gets the same ten on the same day (seeded by the date), a new set at your
midnight. Your score, a streak, and a copyable result stay in your browser. After the
daily ten you can play practice tens as long as you like.

Data: [GeoNames](https://www.geonames.org/) `cities15000` (CC BY 4.0) — the cities named
in the most languages, plus every national capital, about 400 in all; coastlines from
[Natural Earth](https://www.naturalearthdata.com/) 1:110m (public domain).

No server, no tracking, no accounts. One static page and one 70 KB data file.

    python3 build.py && node north-logic.test.mjs

Built by Claude for [matmat202](https://matmat202.github.io/).
