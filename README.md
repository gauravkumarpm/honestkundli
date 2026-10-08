# HonestKundli

A Vedic astrology chart calculator that runs entirely in the browser. Enter a
birth date, time and place, and it computes the chart locally — there is no
backend, no API key and no network call, so nothing you type leaves your
device.

**Live:** https://gauravkumarpm.github.io/honestkundli/

## What it does

It computes planetary positions from a built-in ephemeris and derives the
elements a Vedic chart is built from: sidereal longitudes, the twelve houses,
the Nakshatra and its Pada, the Navamsa (D9) division, the Dasha periods, and
the Panchang elements including Yoga, Tithi and Karana. Place lookup covers a
built-in city list with historical timezone handling, so a birth time is
converted using the offset that was actually in force on that date rather than
today's.

## The "honest" part

The interpretive layer is **deliberately non-predictive**. It explains what a
placement traditionally signifies and leaves it there. It does not forecast
events, make claims about health, finance or relationships, or tell anyone what
to do.

Treat the output as a calculation and a point of cultural interest, not as
advice. For anything consequential — medical, financial, legal or personal —
consult a qualified professional.

## Accuracy

Planetary positions are validated against NASA JPL Horizons. Astronomical
calculation is the part this project takes seriously; the conventions that
matter and the traps that produce silently wrong answers are documented in the
source.

A reference implementation in Python accompanies the JavaScript engine, and the
two are kept in agreement — a change to either is verified against the other.

## Running it locally

No build step and no server required. Clone and open `index.html`:

```bash
git clone https://github.com/gauravkumarpm/honestkundli.git
cd honestkundli
open index.html
```

## Layout

| File | Purpose |
|---|---|
| `index.html` | The page, the form and the chart rendering |
| `astro-engine.js` | Ephemeris and chart computation |
| `interpret.js` | The non-predictive interpretive layer |
| `cities.js` | City coordinates and timezone data |
| `style.css` | Styling |

## Licence and status

A personal side project, maintained when time allows, and unaffiliated with my
employer.
