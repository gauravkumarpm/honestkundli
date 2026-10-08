/*
 * astro-engine.js -- birth chart engine for the browser.
 *
 * A faithful port of the Python engine in ../ephemeris.py and ../chart.py, with
 * Navamsa (D-9) and the 100-year annual timeline added. Runs from file:// with
 * no server, no dependencies and no network access.
 *
 * Accuracy (worst case vs JPL Horizons, 1930-2040, arcminutes):
 *   Moon 0.13  Sun 0.41  Venus 0.49  Pluto 0.65  Mercury 0.74  Mars 0.79
 *   Neptune 0.89  Uranus 1.64  Jupiter 6.03  Saturn 9.71
 *
 * PORTING NOTE: Python's % returns a non-negative result for a positive
 * divisor; JavaScript's keeps the sign of the dividend. Every angular
 * reduction here goes through mod() or norm360() for that reason -- a bare %
 * on a negative longitude is a bug.
 *
 * References: Meeus, "Astronomical Algorithms" 2nd ed. (Sun, Moon, nutation,
 * sidereal time, obliquity); Standish/JPL "Keplerian Elements for Approximate
 * Positions of the Major Planets", 1800-2050 fit (planets).
 */
'use strict';

var Astro = (function () {

  var DEG = Math.PI / 180.0;
  var J2000 = 2451545.0;

  function mod(a, n) { return ((a % n) + n) % n; }
  function norm360(x) { return mod(x, 360.0); }
  function sin(d) { return Math.sin(d * DEG); }
  function cos(d) { return Math.cos(d * DEG); }
  function tan(d) { return Math.tan(d * DEG); }

  /* Signed angular difference in (-180, 180]. */
  function angleDiff(a, b) { return mod(a - b + 180.0, 360.0) - 180.0; }

  // -------------------------------------------------------------------------
  // Time
  // -------------------------------------------------------------------------

  function julianDay(year, month, day, hour) {
    hour = hour || 0;
    if (month <= 2) { year -= 1; month += 12; }
    var a = Math.floor(year / 100.0);
    var b = 2 - a + Math.floor(a / 4.0);
    var jd = Math.floor(365.25 * (year + 4716)) +
             Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
    return jd + hour / 24.0;
  }

  function centuries(jd) { return (jd - J2000) / 36525.0; }

  /* TT - UT1 in seconds (Espenak/Meeus). */
  function deltaTSeconds(jd) {
    var y = 2000.0 + (jd - J2000) / 365.25;
    var t;
    if (y < 1900) { t = (y - 1900.0) / 100.0; return -2.44 + 87.24 * t + 9.308 * t * t; }
    if (y < 1920) {
      t = y - 1900.0;
      return -2.79 + 1.494119 * t - 0.0598939 * t * t +
             0.0061966 * Math.pow(t, 3) - 0.000197 * Math.pow(t, 4);
    }
    if (y < 1941) {
      t = y - 1920.0;
      return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * Math.pow(t, 3);
    }
    if (y < 1961) {
      t = y - 1950.0;
      return 29.07 + 0.407 * t - t * t / 233.0 + Math.pow(t, 3) / 2547.0;
    }
    if (y < 1986) {
      t = y - 1975.0;
      return 45.45 + 1.067 * t - t * t / 260.0 - Math.pow(t, 3) / 718.0;
    }
    if (y < 2005) {
      t = y - 2000.0;
      return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * Math.pow(t, 3) +
             0.000651814 * Math.pow(t, 4) + 0.00002373599 * Math.pow(t, 5);
    }
    if (y < 2050) { t = y - 2000.0; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
    if (y < 2150) {
      return -20.0 + 32.0 * Math.pow((y - 1820.0) / 100.0, 2) - 0.5628 * (2150.0 - y);
    }
    var u = (y - 1820.0) / 100.0;
    return -20.0 + 32.0 * u * u;
  }

  function toTT(jdUT) { return jdUT + deltaTSeconds(jdUT) / 86400.0; }

  // -------------------------------------------------------------------------
  // Obliquity, nutation, precession
  // -------------------------------------------------------------------------

  function meanObliquity(jd) {
    var t = centuries(jd);
    return 23.439291111 - 0.0130041667 * t - 1.6389e-7 * t * t +
           5.036111e-7 * Math.pow(t, 3);
  }

  function nutation(jd) {
    var t = centuries(jd);
    var omega = 125.04452 - 1934.136261 * t;
    var lSun = 280.4665 + 36000.7698 * t;
    var lMoon = 218.3165 + 481267.8813 * t;
    var dPsi = (-17.20 * sin(omega) - 1.32 * sin(2 * lSun) -
                0.23 * sin(2 * lMoon) + 0.21 * sin(2 * omega)) / 3600.0;
    var dEps = (9.20 * cos(omega) + 0.57 * cos(2 * lSun) +
                0.10 * cos(2 * lMoon) - 0.09 * cos(2 * omega)) / 3600.0;
    return { dPsi: dPsi, dEps: dEps };
  }

  function trueObliquity(jd) { return meanObliquity(jd) + nutation(jd).dEps; }

  /* General precession in longitude since J2000, degrees (IAU 2006).
     The Keplerian elements below are J2000-referred, so without this every
     planet drifts ~50"/yr away from 2000 -- identically, which silently
     rotates the whole chart rather than looking like a per-planet error. */
  function generalPrecession(jd) {
    var t = centuries(jd);
    return (5028.796195 * t + 1.1054348 * t * t) / 3600.0;
  }

  // -------------------------------------------------------------------------
  // Sun
  // -------------------------------------------------------------------------

  function sunLongitude(jdTT) {
    var t = centuries(jdTT);
    var l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
    var m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
    var c = (1.914602 - 0.004817 * t - 0.000014 * t * t) * sin(m) +
            (0.019993 - 0.000101 * t) * sin(2 * m) + 0.000289 * sin(3 * m);
    var omega = 125.04 - 1934.136 * t;
    return norm360(l0 + c - 0.00569 - 0.00478 * sin(omega));
  }

  // -------------------------------------------------------------------------
  // Moon -- Meeus table 47.A (D, M, M', F, coefficient in 1e-6 deg)
  // -------------------------------------------------------------------------

  var MOON_LON = [
    [0,0,1,0,6288774],[2,0,-1,0,1274027],[2,0,0,0,658314],[0,0,2,0,213618],
    [0,1,0,0,-185116],[0,0,0,2,-114332],[2,0,-2,0,58793],[2,-1,-1,0,57066],
    [2,0,1,0,53322],[2,-1,0,0,45758],[0,1,-1,0,-40923],[1,0,0,0,-34720],
    [0,1,1,0,-30383],[2,0,0,-2,15327],[0,0,1,2,-12528],[0,0,1,-2,10980],
    [4,0,-1,0,10675],[0,0,3,0,10034],[4,0,-2,0,8548],[2,1,-1,0,-7888],
    [2,1,0,0,-6766],[1,0,-1,0,-5163],[1,1,0,0,4987],[2,-1,1,0,4036],
    [2,0,2,0,3994],[4,0,0,0,3861],[2,0,-3,0,3665],[0,1,-2,0,-2689],
    [2,0,-1,2,-2602],[2,-1,-2,0,2390],[1,0,1,0,-2348],[2,-2,0,0,2236],
    [0,1,2,0,-2120],[0,2,0,0,-2069],[2,-2,-1,0,2048],[2,0,1,-2,-1773],
    [2,0,0,2,-1595],[4,-1,-1,0,1215],[0,0,2,2,-1110],[3,0,-1,0,-892],
    [2,1,1,0,-810],[4,-1,-2,0,759],[0,2,-1,0,-713],[2,2,-1,0,-700],
    [2,1,-2,0,691],[2,-1,0,-2,596],[4,0,1,0,549],[0,0,4,0,537],
    [4,-1,0,0,520],[1,0,-2,0,-487],[2,1,0,-2,-399],[0,0,2,-2,-381],
    [1,1,1,0,351],[3,0,-2,0,-340],[4,0,-3,0,330],[2,-1,2,0,327],
    [0,2,1,0,-323],[1,1,-1,0,299],[2,0,3,0,294]
  ];

  function moonArgs(jdTT) {
    var t = centuries(jdTT);
    return {
      t: t,
      lp: 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t +
          Math.pow(t, 3) / 538841.0 - Math.pow(t, 4) / 65194000.0,
      d: 297.8501921 + 445267.1114034 * t - 0.0018819 * t * t +
         Math.pow(t, 3) / 545868.0 - Math.pow(t, 4) / 113065000.0,
      m: 357.5291092 + 35999.0502909 * t - 0.0001536 * t * t +
         Math.pow(t, 3) / 24490000.0,
      mp: 134.9633964 + 477198.8675055 * t + 0.0087414 * t * t +
          Math.pow(t, 3) / 69699.0 - Math.pow(t, 4) / 14712000.0,
      f: 93.2720950 + 483202.0175233 * t - 0.0036539 * t * t -
         Math.pow(t, 3) / 3526000.0 + Math.pow(t, 4) / 863310000.0,
      e: 1.0 - 0.002516 * t - 0.0000074 * t * t
    };
  }

  function moonLongitude(jdTT) {
    var a = moonArgs(jdTT);
    var a1 = 119.75 + 131.849 * a.t;
    var a2 = 53.09 + 479264.290 * a.t;
    var total = 0.0;
    for (var i = 0; i < MOON_LON.length; i++) {
      var r = MOON_LON[i];
      var arg = r[0] * a.d + r[1] * a.m + r[2] * a.mp + r[3] * a.f;
      var term = r[4] * sin(arg);
      if (Math.abs(r[1]) === 1) term *= a.e;
      else if (Math.abs(r[1]) === 2) term *= a.e * a.e;
      total += term;
    }
    total += 3958 * sin(a1) + 1962 * sin(a.lp - a.f) + 318 * sin(a2);
    return norm360(a.lp + total / 1e6 + nutation(jdTT).dPsi);
  }

  function moonLatitude(jdTT) {
    var a = moonArgs(jdTT);
    var a1 = 119.75 + 131.849 * a.t;
    var a3 = 313.45 + 481266.484 * a.t;
    var D = a.d, M = a.m, Mp = a.mp, F = a.f, e = a.e;
    var b = 5128122 * sin(F) + 280602 * sin(Mp + F) + 277693 * sin(Mp - F) +
        173237 * sin(2 * D - F) + 55413 * sin(2 * D - Mp + F) +
        46271 * sin(2 * D - Mp - F) + 32573 * sin(2 * D + F) +
        17198 * sin(2 * Mp + F) + 9266 * sin(2 * D + Mp - F) +
        8822 * sin(2 * Mp - F) + 8216 * e * sin(2 * D - M - F) +
        4324 * sin(2 * D - 2 * Mp - F) + 4200 * sin(2 * D + Mp + F) -
        3359 * e * sin(2 * D + M - F) + 2463 * e * sin(2 * D - M - Mp + F) +
        2211 * e * sin(2 * D - M + F) + 2065 * e * sin(2 * D - M - Mp - F) -
        1870 * e * sin(M - Mp - F) + 1828 * sin(4 * D - Mp - F) -
        1794 * e * sin(M + F);
    b += -2235 * sin(a.lp) + 382 * sin(a3) + 175 * sin(a1 - F) + 175 * sin(a1 + F);
    return b / 1e6;
  }

  /* Mean ascending node = Rahu. Ketu is exactly opposite. Published
     panchangams use the mean node; the true node swings +/-1.6 deg. */
  function meanLunarNode(jdTT) {
    var t = centuries(jdTT);
    return norm360(125.0445479 - 1934.1362891 * t + 0.0020754 * t * t +
                   Math.pow(t, 3) / 467441.0 - Math.pow(t, 4) / 60616000.0);
  }

  // -------------------------------------------------------------------------
  // Planets -- Standish 1800-2050 fit
  // base = [a, e, I, L, longPeri, longNode]; rate = same per Julian century
  // -------------------------------------------------------------------------

  var ELEMENTS = {
    Mercury: [[0.38709927,0.20563593,7.00497902,252.25032350,77.45779628,48.33076593],
              [0.00000037,0.00001906,-0.00594749,149472.67411175,0.16047689,-0.12534081]],
    Venus:   [[0.72333566,0.00677672,3.39467605,181.97909950,131.60246718,76.67984255],
              [0.00000390,-0.00004107,-0.00078890,58517.81538729,0.00268329,-0.27769418]],
    Earth:   [[1.00000261,0.01671123,-0.00001531,100.46457166,102.93768193,0.0],
              [0.00000562,-0.00004392,-0.01294668,35999.37244981,0.32327364,0.0]],
    Mars:    [[1.52371034,0.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],
              [0.00001847,0.00007882,-0.00813131,19140.30268499,0.44441088,-0.29257343]],
    Jupiter: [[5.20288700,0.04838624,1.30439695,34.39644051,14.72847983,100.47390909],
              [-0.00011607,-0.00013253,-0.00183714,3034.74612775,0.21252668,0.20469106]],
    Saturn:  [[9.53667594,0.05386179,2.48599187,49.95424423,92.59887831,113.66242448],
              [-0.00125060,-0.00050991,0.00193609,1222.49362201,-0.41897216,-0.28867794]],
    Uranus:  [[19.18916464,0.04725744,0.77263783,313.23810451,170.95427630,74.01692503],
              [-0.00196176,-0.00004397,-0.00242939,428.48202785,0.40805281,0.04240589]],
    Neptune: [[30.06992276,0.00859048,1.77004347,-55.12002969,44.96476227,131.78422574],
              [0.00026291,0.00005105,0.00035372,218.45945325,-0.32241464,-0.00508664]],
    Pluto:   [[39.48211675,0.24882730,17.14001206,238.92903833,224.06891629,110.30393684],
              [-0.00031596,0.00005170,0.00004818,145.20780515,-0.04062942,-0.01183482]]
  };

  /* Worst-case longitude error in arcminutes vs JPL Horizons over 1930-2040,
     doubled as a margin. Used to flag bodies sitting on a boundary. */
  var UNCERTAINTY_ARCMIN = {
    Sun: 1.0, Moon: 1.0, Mercury: 2.0, Venus: 1.0, Mars: 2.0, Jupiter: 12.0,
    Saturn: 20.0, Uranus: 4.0, Neptune: 2.0, Pluto: 2.0, Rahu: 1.0, Ketu: 1.0
  };

  function solveKepler(mDeg, e) {
    var m = (mod(mDeg + 180.0, 360.0) - 180.0) * DEG;
    var ecc = m;
    for (var i = 0; i < 60; i++) {
      var step = (ecc - e * Math.sin(ecc) - m) / (1.0 - e * Math.cos(ecc));
      ecc -= step;
      if (Math.abs(step) < 1e-13) break;
    }
    return ecc;
  }

  function helioEcliptic(name, jdTT) {
    var el = ELEMENTS[name], base = el[0], rate = el[1];
    var t = centuries(jdTT);
    var a = base[0] + rate[0] * t;
    var e = base[1] + rate[1] * t;
    var inc = base[2] + rate[2] * t;
    var lon = base[3] + rate[3] * t;
    var peri = base[4] + rate[4] * t;
    var node = base[5] + rate[5] * t;

    var argPeri = peri - node;
    var ecc = solveKepler(lon - peri, e);
    var xp = a * (Math.cos(ecc) - e);
    var yp = a * Math.sqrt(Math.max(0.0, 1.0 - e * e)) * Math.sin(ecc);

    var cw = cos(argPeri), sw = sin(argPeri);
    var cn = cos(node), sn = sin(node);
    var ci = cos(inc), si = sin(inc);

    return {
      x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
      y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp
    };
  }

  function planetLongitude(name, jdTT) {
    var earth = helioEcliptic('Earth', jdTT);
    var p = helioEcliptic(name, jdTT);
    var dx = p.x - earth.x, dy = p.y - earth.y, dz = p.z - earth.z;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Light-time: the planet is seen where it was. 0.0057755183 d per AU.
    p = helioEcliptic(name, jdTT - 0.0057755183 * dist);
    dx = p.x - earth.x; dy = p.y - earth.y;
    var lon = Math.atan2(dy, dx) / DEG;
    return norm360(lon + generalPrecession(jdTT) + nutation(jdTT).dPsi);
  }

  function bodyLongitude(name, jdTT) {
    if (name === 'Sun') return sunLongitude(jdTT);
    if (name === 'Moon') return moonLongitude(jdTT);
    if (name === 'Rahu') return meanLunarNode(jdTT);
    if (name === 'Ketu') return norm360(meanLunarNode(jdTT) + 180.0);
    return planetLongitude(name, jdTT);
  }

  /* Degrees per day; negative is retrograde. */
  function dailyMotion(name, jdTT, span) {
    span = span || 0.5;
    var a = bodyLongitude(name, jdTT - span / 2.0);
    var b = bodyLongitude(name, jdTT + span / 2.0);
    return angleDiff(b, a) / span;
  }

  // -------------------------------------------------------------------------
  // Sidereal time, Ascendant, Midheaven
  // -------------------------------------------------------------------------

  function gmst(jdUT) {
    var t = centuries(jdUT);
    return norm360(280.46061837 + 360.98564736629 * (jdUT - J2000) +
                   0.000387933 * t * t - Math.pow(t, 3) / 38710000.0);
  }

  function localSiderealTime(jdUT, lonEast) {
    var eq = nutation(jdUT).dPsi * cos(trueObliquity(jdUT));
    return norm360(gmst(jdUT) + eq + lonEast);
  }

  function ascendant(jdUT, lat, lonEast) {
    var ramc = localSiderealTime(jdUT, lonEast);
    var eps = trueObliquity(jdUT);
    var la = Math.max(-66.5, Math.min(66.5, lat));
    var y = cos(ramc);
    var x = -(sin(ramc) * cos(eps) + Math.tan(la * DEG) * sin(eps));
    return norm360(Math.atan2(y, x) / DEG);
  }

  function midheaven(jdUT, lonEast) {
    var ramc = localSiderealTime(jdUT, lonEast);
    var eps = trueObliquity(jdUT);
    return norm360(Math.atan2(sin(ramc), cos(ramc) * cos(eps)) / DEG);
  }

  // -------------------------------------------------------------------------
  // Ayanamsa
  // -------------------------------------------------------------------------

  function lahiri(jd) { return 23.85301388888889 + generalPrecession(jd); }

  var AYANAMSA = {
    lahiri: lahiri,
    raman: function (jd) { return lahiri(jd) - 1.10166666; },
    kp: function (jd) { return lahiri(jd) - 0.06055555; }
  };

  // -------------------------------------------------------------------------
  // Reference tables
  // -------------------------------------------------------------------------

  var SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo',
               'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
  var SIGNS_SANSKRIT = ['Mesha','Vrishabha','Mithuna','Karka','Simha','Kanya',
                        'Tula','Vrishchika','Dhanu','Makara','Kumbha','Meena'];
  var SIGN_LORDS = ['Mars','Venus','Mercury','Moon','Sun','Mercury',
                    'Venus','Mars','Jupiter','Saturn','Saturn','Jupiter'];
  var ELEMENTS_BY_SIGN = ['Fire','Earth','Air','Water','Fire','Earth',
                          'Air','Water','Fire','Earth','Air','Water'];
  var MODALITIES = ['Cardinal','Fixed','Mutable','Cardinal','Fixed','Mutable',
                    'Cardinal','Fixed','Mutable','Cardinal','Fixed','Mutable'];

  var NAKSHATRAS = [
    ['Ashwini','Ketu'],['Bharani','Venus'],['Krittika','Sun'],['Rohini','Moon'],
    ['Mrigashira','Mars'],['Ardra','Rahu'],['Punarvasu','Jupiter'],
    ['Pushya','Saturn'],['Ashlesha','Mercury'],['Magha','Ketu'],
    ['Purva Phalguni','Venus'],['Uttara Phalguni','Sun'],['Hasta','Moon'],
    ['Chitra','Mars'],['Swati','Rahu'],['Vishakha','Jupiter'],
    ['Anuradha','Saturn'],['Jyeshtha','Mercury'],['Mula','Ketu'],
    ['Purva Ashadha','Venus'],['Uttara Ashadha','Sun'],['Shravana','Moon'],
    ['Dhanishta','Mars'],['Shatabhisha','Rahu'],['Purva Bhadrapada','Jupiter'],
    ['Uttara Bhadrapada','Saturn'],['Revati','Mercury']
  ];

  var DASHA_SEQUENCE = [['Ketu',7],['Venus',20],['Sun',6],['Moon',10],['Mars',7],
                        ['Rahu',18],['Jupiter',16],['Saturn',19],['Mercury',17]];

  var TITHI_NAMES = ['Pratipada','Dwitiya','Tritiya','Chaturthi','Panchami',
    'Shashthi','Saptami','Ashtami','Navami','Dashami','Ekadashi','Dwadashi',
    'Trayodashi','Chaturdashi','Purnima/Amavasya'];

  var YOGA_NAMES = ['Vishkambha','Priti','Ayushman','Saubhagya','Shobhana',
    'Atiganda','Sukarma','Dhriti','Shula','Ganda','Vriddhi','Dhruva','Vyaghata',
    'Harshana','Vajra','Siddhi','Vyatipata','Variyana','Parigha','Shiva',
    'Siddha','Sadhya','Shubha','Shukla','Brahma','Indra','Vaidhriti'];

  var KARANA_NAMES = ['Bava','Balava','Kaulava','Taitila','Gara','Vanija','Vishti'];

  var WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday',
                  'Saturday'];
  var WEEKDAY_LORDS = ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn'];

  var VEDIC_BODIES = ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn',
                      'Rahu','Ketu'];
  var WESTERN_BODIES = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn',
                        'Uranus','Neptune','Pluto'];

  var EXALTATION = { Sun:0, Moon:1, Mars:9, Mercury:5, Jupiter:3, Venus:11, Saturn:6 };
  var DEBILITATION = { Sun:6, Moon:7, Mars:3, Mercury:11, Jupiter:9, Venus:5, Saturn:0 };

  var ASPECTS = [['Conjunction',0.0,8.0],['Sextile',60.0,6.0],['Square',90.0,8.0],
                 ['Trine',120.0,8.0],['Opposition',180.0,8.0]];

  var NAKSHATRA_SPAN = 360.0 / 27.0;
  var PADA_SPAN = NAKSHATRA_SPAN / 4.0;

  // -------------------------------------------------------------------------
  // Zodiac division
  // -------------------------------------------------------------------------

  var SNAP = 1e-9;

  /* Split the zodiac into equal divisions; return [index, fractionThrough].
     The snap matters: 360/27 is not binary-representable, so a longitude that
     is exactly on a cusp can land a hair below it and report the previous
     division with fraction 0.99999 -- wrong nakshatra AND wrong pada. */
  function divide(longitude, divisions) {
    var x = norm360(longitude) * divisions / 360.0;
    var nearest = Math.round(x);
    if (Math.abs(x - nearest) < SNAP) x = nearest;
    var idx = mod(Math.floor(x), divisions);
    return [idx, x - Math.floor(x)];
  }

  function signIndex(lon) { return divide(lon, 12)[0]; }
  function degreesInSign(lon) { return divide(lon, 12)[1] * 30.0; }

  function nakshatraOf(sidereal) {
    var d = divide(sidereal, 27);
    var idx = d[0], frac = d[1];
    return {
      index: idx + 1,
      name: NAKSHATRAS[idx][0],
      lord: NAKSHATRAS[idx][1],
      pada: Math.min(4, Math.floor(frac * 4.0) + 1),
      degreesInto: frac * NAKSHATRA_SPAN,
      fraction: frac
    };
  }

  /* Navamsa (D-9): the zodiac in 108 parts of 3 deg 20', the Nth falling in
     sign N mod 12. That one rule reproduces the classical starting signs --
     movable from itself, fixed from the 9th, dual from the 5th. Position
     inside the navamsa is expanded to fill 30 deg, the usual convention. */
  function navamsaLongitude(sidereal) {
    var d = divide(sidereal, 108);
    return mod(d[0], 12) * 30.0 + d[1] * 30.0;
  }

  function dignity(body, lon) {
    var idx = signIndex(lon);
    if (SIGN_LORDS[idx] === body) return 'Own sign';
    if (EXALTATION[body] === idx) return 'Exalted';
    if (DEBILITATION[body] === idx) return 'Debilitated';
    return null;
  }

  // -------------------------------------------------------------------------
  // Houses
  // -------------------------------------------------------------------------

  function houseCusps(asc, mc, system) {
    var i, cusps;
    if (system === 'whole_sign') {
      var start = signIndex(asc) * 30.0;
      cusps = [];
      for (i = 0; i < 12; i++) cusps.push(norm360(start + 30.0 * i));
      return cusps;
    }
    if (system === 'equal') {
      cusps = [];
      for (i = 0; i < 12; i++) cusps.push(norm360(asc + 30.0 * i));
      return cusps;
    }
    if (system === 'porphyry') {
      var quad = mod(asc - mc, 360.0);
      var stepE = quad / 3.0;
      var stepW = (180.0 - quad) / 3.0;
      cusps = new Array(12);
      cusps[0] = norm360(asc);
      cusps[1] = norm360(asc + stepW);
      cusps[2] = norm360(asc + 2 * stepW);
      cusps[9] = norm360(mc);
      cusps[10] = norm360(mc + stepE);
      cusps[11] = norm360(mc + 2 * stepE);
      var pairs = [[0,6],[1,7],[2,8],[9,3],[10,4],[11,5]];
      for (i = 0; i < pairs.length; i++) {
        cusps[pairs[i][1]] = norm360(cusps[pairs[i][0]] + 180.0);
      }
      return cusps;
    }
    throw new Error('unknown house system: ' + system);
  }

  function houseOf(lon, cusps) {
    var l = norm360(lon);
    for (var i = 0; i < 12; i++) {
      var span = mod(cusps[(i + 1) % 12] - cusps[i], 360.0);
      var offset = mod(l - cusps[i], 360.0);
      if (offset < span || (span === 0 && offset === 0)) return i + 1;
    }
    return 12;
  }

  // -------------------------------------------------------------------------
  // Vimshottari dasha
  //
  // Dates are handled as epoch milliseconds built from Date.UTC and always read
  // back with getUTC*, so a naive local birth time never picks up the browser's
  // own timezone.
  // -------------------------------------------------------------------------

  var YEAR_MS = 365.25 * 86400000;

  function addYears(ms, years) { return ms + years * YEAR_MS; }

  function vimshottari(birthMs, moonSidereal, levels, spanYears) {
    levels = levels || 2;
    spanYears = spanYears || 120;
    var nak = nakshatraOf(moonSidereal);
    var startPos = 0;
    for (var i = 0; i < DASHA_SEQUENCE.length; i++) {
      if (DASHA_SEQUENCE[i][0] === nak.lord) { startPos = i; break; }
    }
    var totalYears = DASHA_SEQUENCE[startPos][1];
    var elapsed = nak.fraction * totalYears;
    var balance = totalYears - elapsed;

    var order = [];
    for (i = 0; i < 40; i++) order.push(DASHA_SEQUENCE[(startPos + i) % 9]);

    var periods = [], cursor = birthMs, accumulated = 0.0;
    for (i = 0; i < order.length; i++) {
      var years = (i === 0) ? balance : order[i][1];
      if (accumulated > spanYears) break;
      var end = addYears(cursor, years);
      var entry = {
        lord: order[i][0], start: cursor, end: end, years: years,
        partial: i === 0 && Math.abs(years - order[i][1]) > 1e-9
      };
      if (levels >= 2) {
        entry.sub = subPeriods(order[i][0], cursor, years, order[i][1],
                               entry.partial, levels - 1);
      }
      periods.push(entry);
      cursor = end;
      accumulated += years;
    }

    return {
      moonNakshatra: nak, startingLord: nak.lord,
      balanceYears: balance, elapsedYears: elapsed, periods: periods
    };
  }

  /* Antardashas within a mahadasha. Length is parentYears*subYears/120 and the
     sequence opens with the parent's own lord. For a partial first mahadasha
     the early sub-periods are already over at birth, so they are dropped and
     the one in progress is clipped to the birth moment. */
  function subPeriods(parentLord, parentStart, parentDuration, parentFullYears,
                      parentIsPartial, levels) {
    var startPos = 0;
    for (var i = 0; i < DASHA_SEQUENCE.length; i++) {
      if (DASHA_SEQUENCE[i][0] === parentLord) { startPos = i; break; }
    }
    var consumed = parentIsPartial ? parentFullYears - parentDuration : 0.0;
    var notionalStart = addYears(parentStart, -consumed);
    var cursorYears = 0.0, subs = [];

    for (i = 0; i < 9; i++) {
      var item = DASHA_SEQUENCE[(startPos + i) % 9];
      var length = parentFullYears * item[1] / 120.0;
      var sStart = addYears(notionalStart, cursorYears);
      var sEnd = addYears(notionalStart, cursorYears + length);
      cursorYears += length;
      if (sEnd <= parentStart) continue;
      var clipped = sStart < parentStart;
      var entry = {
        lord: item[0], start: Math.max(sStart, parentStart), end: sEnd,
        years: length, partial: clipped
      };
      if (levels >= 2) {
        entry.sub = subPeriods(item[0], entry.start,
                               (sEnd - entry.start) / YEAR_MS, length,
                               clipped, levels - 1);
      }
      subs.push(entry);
    }
    return subs;
  }

  function currentDasha(dasha, atMs, depth) {
    depth = depth || 3;
    var chain = [], nodes = dasha.periods;
    for (var d = 0; d < depth; d++) {
      var found = null;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].start <= atMs && atMs < nodes[i].end) { found = nodes[i]; break; }
      }
      if (!found) break;
      chain.push(found);
      nodes = found.sub || [];
      if (!nodes.length) break;
    }
    return chain;
  }

  // -------------------------------------------------------------------------
  // Panchang
  // -------------------------------------------------------------------------

  /* Takes SIDEREAL longitudes, as published panchangams do. Tithi and karana
     are Moon-Sun differences so the ayanamsa cancels, but yoga is the SUM --
     tropical input would shift it about two positions. */
  function panchang(sunSid, moonSid, weekdayIndex) {
    var sunLon = norm360(sunSid), moonLon = norm360(moonSid);
    var diff = mod(moonLon - sunLon, 360.0);

    var tithiNum = Math.floor(diff / 12.0) + 1;
    var paksha = tithiNum <= 15 ? 'Shukla' : 'Krishna';
    var nameIdx = (tithiNum - 1) % 15;
    var tithiName = TITHI_NAMES[nameIdx];
    if (nameIdx === 14) tithiName = paksha === 'Shukla' ? 'Purnima' : 'Amavasya';

    var yogaNum = Math.floor(mod(sunLon + moonLon, 360.0) / (360.0 / 27.0)) + 1;

    var karanaNum = Math.floor(diff / 6.0) + 1;
    var karanaName;
    if (karanaNum === 1) karanaName = 'Kimstughna';
    else if (karanaNum >= 58) karanaName = ['Shakuni','Chatushpada','Naga'][karanaNum - 58];
    else karanaName = KARANA_NAMES[(karanaNum - 2) % 7];

    return {
      tithiNumber: tithiNum, tithi: tithiName, paksha: paksha,
      tithiPercent: mod(diff, 12.0) / 12.0 * 100.0,
      vara: WEEKDAYS[weekdayIndex], varaLord: WEEKDAY_LORDS[weekdayIndex],
      yogaNumber: yogaNum, yoga: YOGA_NAMES[yogaNum - 1],
      karanaNumber: karanaNum, karana: karanaName,
      moonPhaseAngle: diff
    };
  }

  function moonPhaseName(elongation) {
    var e = mod(elongation, 360.0);
    var bands = [[11.25,'New Moon'],[78.75,'Waxing Crescent'],
      [101.25,'First Quarter'],[168.75,'Waxing Gibbous'],[191.25,'Full Moon'],
      [258.75,'Waning Gibbous'],[281.25,'Last Quarter'],
      [348.75,'Waning Crescent'],[360.0,'New Moon']];
    for (var i = 0; i < bands.length; i++) if (e < bands[i][0]) return bands[i][1];
    return 'New Moon';
  }

  function moonIllumination(elongation) {
    return (1.0 - Math.cos(elongation * DEG)) / 2.0;
  }

  // -------------------------------------------------------------------------
  // Aspects
  // -------------------------------------------------------------------------

  function findAspects(positions, bodies) {
    var names = bodies.filter(function (b) { return positions[b]; });
    var out = [];
    for (var i = 0; i < names.length; i++) {
      for (var j = i + 1; j < names.length; j++) {
        var a = names[i], b = names[j];
        var sep = Math.abs(angleDiff(positions[a].longitude, positions[b].longitude));
        for (var k = 0; k < ASPECTS.length; k++) {
          var name = ASPECTS[k][0], angle = ASPECTS[k][1], orb = ASPECTS[k][2];
          var delta = sep - angle;
          if (Math.abs(delta) <= orb) {
            var sa = positions[a].speed, sb = positions[b].speed;
            var fasterIsA = Math.abs(sa) >= Math.abs(sb);
            var rel = sa - sb;
            var growing = fasterIsA ? rel > 0 : rel < 0;
            out.push({
              body1: a, body2: b, aspect: name, exactAngle: angle,
              separation: sep, orb: Math.abs(delta),
              applying: (delta < 0) === Boolean(growing)
            });
            break;
          }
        }
      }
    }
    out.sort(function (p, q) { return p.orb - q.orb; });
    return out;
  }

  // -------------------------------------------------------------------------
  // Boundary warnings
  // -------------------------------------------------------------------------

  function boundaryWarnings(positions, ascSidereal) {
    var checks = [['sign',30.0],['nakshatra',NAKSHATRA_SPAN],['pada',PADA_SPAN]];
    var subjects = [];
    Object.keys(positions).forEach(function (b) {
      subjects.push([b, positions[b].sidereal,
                     (UNCERTAINTY_ARCMIN[b] || 2.0) / 60.0]);
    });
    // The Ascendant's margin is set by birth-time precision: the ecliptic rises
    // about 1 degree every 4 minutes.
    subjects.push(['Ascendant', ascSidereal, 0.25]);

    var out = [];
    subjects.forEach(function (s) {
      for (var i = 0; i < checks.length; i++) {
        var span = checks[i][1];
        var offset = mod(s[1], span);
        var distance = Math.min(offset, span - offset);
        if (distance <= s[2]) {
          out.push({ body: s[0], boundary: checks[i][0], distanceDeg: distance,
                     toleranceDeg: s[2] });
          break;
        }
      }
    });
    return out;
  }

  // -------------------------------------------------------------------------
  // Timezone -- historical offsets straight from the browser's IANA database
  // -------------------------------------------------------------------------

  function zoneOffsetMinutes(zone, utcMs) {
    var text = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, timeZoneName: 'longOffset'
    }).format(new Date(utcMs));
    var m = text.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!m) return 0;                        // bare "GMT" means +00:00
    var sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
  }

  /* Naive local wall-clock ms -> true UTC ms. Two passes settle the circular
     dependency (the offset depends on the instant we are solving for), which
     matters at DST transitions. */
  function localToUtc(naiveMs, zone) {
    var off = zoneOffsetMinutes(zone, naiveMs);
    var utc = naiveMs - off * 60000;
    off = zoneOffsetMinutes(zone, utc);
    return { utcMs: naiveMs - off * 60000, offsetMinutes: off };
  }

  function msToParts(ms) {
    var d = new Date(ms);
    return {
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      hour: d.getUTCHours(), minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(), weekday: d.getUTCDay()
    };
  }

  function partsToMs(y, mo, d, h, mi, s) {
    return Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0);
  }

  function jdFromMs(ms) {
    var p = msToParts(ms);
    return julianDay(p.year, p.month, p.day,
                     p.hour + p.minute / 60.0 + p.second / 3600.0);
  }

  function msFromJd(jd) {
    return Math.round((jd - 2440587.5) * 86400000);
  }

  // -------------------------------------------------------------------------
  // Chart
  // -------------------------------------------------------------------------

  var ALL_BODIES = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn',
                    'Uranus','Neptune','Pluto','Rahu','Ketu'];

  function buildChart(opts) {
    var ayanName = opts.ayanamsa || 'lahiri';
    var westSystem = opts.houseSystem || 'porphyry';

    var jdUT = jdFromMs(opts.utcMs);
    var jdTT = toTT(jdUT);
    var ayan = AYANAMSA[ayanName](jdTT);

    var positions = {};
    ALL_BODIES.forEach(function (body) {
      var tropical = bodyLongitude(body, jdTT);
      var speed = dailyMotion(body, jdTT);
      positions[body] = {
        longitude: norm360(tropical),
        sidereal: norm360(tropical - ayan),
        speed: speed,
        retrograde: speed < 0 && body !== 'Rahu' && body !== 'Ketu'
      };
    });
    positions.Moon.latitude = moonLatitude(jdTT);

    var ascTrop = ascendant(jdUT, opts.latitude, opts.longitude);
    var mcTrop = midheaven(jdUT, opts.longitude);
    var ascSid = norm360(ascTrop - ayan);
    var mcSid = norm360(mcTrop - ayan);

    var vedicCusps = houseCusps(ascSid, mcSid, 'whole_sign');
    var westCusps = houseCusps(ascTrop, mcTrop, westSystem);
    var navAsc = navamsaLongitude(ascSid);
    var navCusps = houseCusps(navAsc, navamsaLongitude(mcSid), 'whole_sign');

    Object.keys(positions).forEach(function (body) {
      var data = positions[body];
      data.houseVedic = houseOf(data.sidereal, vedicCusps);
      data.houseWestern = houseOf(data.longitude, westCusps);
      data.nakshatra = nakshatraOf(data.sidereal);
      data.dignity = dignity(body, data.sidereal);
      data.navamsa = navamsaLongitude(data.sidereal);
      data.houseNavamsa = houseOf(data.navamsa, navCusps);
      data.dignityNavamsa = dignity(body, data.navamsa);
      data.vargottama = signIndex(data.navamsa) === signIndex(data.sidereal);
    });

    var localParts = msToParts(opts.localMs);
    var pan = panchang(positions.Sun.sidereal, positions.Moon.sidereal,
                       localParts.weekday);
    pan.nakshatra = positions.Moon.nakshatra;

    var dasha = vimshottari(opts.localMs, positions.Moon.sidereal, 3, 120);

    var chart = {
      input: {
        localMs: opts.localMs, utcMs: opts.utcMs, tzLabel: opts.tzLabel,
        latitude: opts.latitude, longitude: opts.longitude, place: opts.place
      },
      jdUT: jdUT, jdTT: jdTT, deltaT: deltaTSeconds(jdUT),
      ayanamsaName: ayanName, ayanamsa: ayan,
      obliquity: trueObliquity(jdUT),
      siderealTime: localSiderealTime(jdUT, opts.longitude),
      positions: positions,
      ascendant: { longitude: ascTrop, sidereal: ascSid, navamsa: navAsc },
      midheaven: { longitude: mcTrop, sidereal: mcSid },
      houses: {
        vedic: vedicCusps, vedicSystem: 'whole_sign',
        western: westCusps, westernSystem: westSystem,
        navamsa: navCusps
      },
      panchang: pan,
      dasha: dasha,
      aspects: findAspects(positions, WESTERN_BODIES),
      boundaryWarnings: boundaryWarnings(positions, ascSid),
      moonPhase: moonPhaseName(pan.moonPhaseAngle),
      moonIllumination: moonIllumination(pan.moonPhaseAngle)
    };

    chart.timeline = annualTimeline(chart, opts.years || 100, opts.timezone);
    return chart;
  }

  // -------------------------------------------------------------------------
  // Annual timeline (Varshaphala + dasha + gochara)
  //
  // Everything here is computed, not narrated. No life events are asserted.
  // -------------------------------------------------------------------------

  var SIDEREAL_YEAR = 365.25636;

  /* Instant when the sidereal Sun returns to a target longitude, near a guess.
     Newton's method on the Sun's ~0.9856 deg/day motion; converges in 3-4
     passes. This is the Varsha Pravesha, the start of the astrological year. */
  function solarReturnJD(targetSidereal, guessJD, ayanFn) {
    var jd = guessJD;
    for (var i = 0; i < 12; i++) {
      var jdTT = toTT(jd);
      var current = norm360(sunLongitude(jdTT) - ayanFn(jdTT));
      var err = angleDiff(current, targetSidereal);
      if (Math.abs(err) < 1e-7) break;
      jd -= err / 0.9856;
    }
    return jd;
  }

  function periodsCovering(nodes, startMs, endMs) {
    var out = [];
    (nodes || []).forEach(function (n) {
      if (n.end > startMs && n.start < endMs) out.push(n);
    });
    return out;
  }

  function annualTimeline(chart, years, zone) {
    var ayanFn = AYANAMSA[chart.ayanamsaName];
    var natalSunSid = chart.positions.Sun.sidereal;
    var natalMoonSign = signIndex(chart.positions.Moon.sidereal);
    var natalAscSign = signIndex(chart.ascendant.sidereal);
    var lat = chart.input.latitude, lon = chart.input.longitude;
    var birthOffsetMin = (chart.input.localMs - chart.input.utcMs) / 60000;

    /* Local wall-clock time of a UT instant. The offset is re-resolved per year
       rather than reusing the birth offset, because a solar return decades later
       can land inside a DST period (or on the far side of a zone change) and
       would otherwise print an hour out. */
    function localMsOf(jd) {
      var utcMs = msFromJd(jd);
      var off = zone ? zoneOffsetMinutes(zone, utcMs) : birthOffsetMin;
      return utcMs + off * 60000;
    }

    // Solve every year boundary once; each row needs its own start and the next.
    var boundaries = [chart.jdUT];
    for (var a = 1; a <= years + 1; a++) {
      boundaries.push(solarReturnJD(natalSunSid,
                                    chart.jdUT + SIDEREAL_YEAR * a, ayanFn));
    }

    var rows = [];
    for (var age = 0; age <= years; age++) {
      var jdStart = boundaries[age];
      var startMs = age === 0 ? chart.input.localMs : localMsOf(jdStart);
      var endMs = localMsOf(boundaries[age + 1]);

      var jdTT = toTT(jdStart);
      var ayan = ayanFn(jdTT);

      // Varsha lagna: the ascendant at the moment the year begins.
      var varshaLagna = norm360(ascendant(jdStart, lat, lon) - ayan);

      // Muntha advances exactly one sign per completed year from the natal
      // ascendant, so its house from the natal lagna is (age mod 12) + 1.
      var munthaSign = mod(natalAscSign + age, 12);
      var munthaHouse = mod(age, 12) + 1;

      // Gochara: slow planets counted from the natal Moon sign.
      var satSign = signIndex(norm360(planetLongitude('Saturn', jdTT) - ayan));
      var jupSign = signIndex(norm360(planetLongitude('Jupiter', jdTT) - ayan));
      var satHouse = mod(satSign - natalMoonSign, 12) + 1;
      var jupHouse = mod(jupSign - natalMoonSign, 12) + 1;

      var sadeSati = null;
      if (satHouse === 12) sadeSati = 'Sade Sati - first phase (Saturn in 12th from Moon)';
      else if (satHouse === 1) sadeSati = 'Sade Sati - peak phase (Saturn over the Moon)';
      else if (satHouse === 2) sadeSati = 'Sade Sati - final phase (Saturn in 2nd from Moon)';

      var saturnNote = null;
      if (satHouse === 8) saturnNote = 'Ashtama Shani (Saturn in 8th from Moon)';
      else if (satHouse === 4 || satHouse === 10) {
        saturnNote = 'Kantaka Shani (Saturn in ' + satHouse + 'th from Moon)';
      }

      var mahas = periodsCovering(chart.dasha.periods, startMs, endMs);
      var antars = [];
      mahas.forEach(function (m) {
        antars = antars.concat(periodsCovering(m.sub, startMs, endMs));
      });

      var startParts = msToParts(startMs);
      rows.push({
        age: age,
        startMs: startMs,
        endMs: endMs,
        calendarYear: startParts.year,
        varshaPraveshaWeekday: WEEKDAYS[startParts.weekday],
        varshaPraveshaDayLord: WEEKDAY_LORDS[startParts.weekday],
        varshaLagnaSign: signIndex(varshaLagna),
        varshaLagna: varshaLagna,
        munthaSign: munthaSign,
        munthaHouse: munthaHouse,
        mahadashas: mahas.map(function (m) { return m.lord; }),
        antardashas: antars.map(function (a) {
          return { lord: a.lord, startMs: a.start, endMs: a.end };
        }),
        saturnSign: satSign, saturnHouseFromMoon: satHouse,
        jupiterSign: jupSign, jupiterHouseFromMoon: jupHouse,
        sadeSati: sadeSati,
        saturnNote: saturnNote
      });
    }
    return rows;
  }

  // -------------------------------------------------------------------------
  // Traditional significations, used to label the timeline.
  //
  // These are classical attributions to planets and houses. They are NOT
  // predictions and carry no evidential weight about any person.
  // -------------------------------------------------------------------------

  var PLANET_THEMES = {
    Sun: 'authority, recognition, self-direction, matters involving father or government',
    Moon: 'mind and mood, home and family, public contact, changeability',
    Mars: 'drive and initiative, competition, property, physical effort, siblings',
    Mercury: 'communication, commerce, study, analysis, short travel',
    Jupiter: 'expansion, teaching and mentoring, ethics, counsel, optimism',
    Venus: 'relationships, art and beauty, comfort, vehicles, refinement',
    Saturn: 'discipline, patience, sustained labour, structure, simplification',
    Rahu: 'ambition, unconventional or foreign directions, restlessness, novelty',
    Ketu: 'withdrawal, research and depth, detachment, letting things go'
  };

  /* Terse forms for the 101-row timeline, where the full sentences above do not
     fit without pushing the table off screen. */
  var PLANET_KEYWORDS = {
    Sun: 'authority, recognition',
    Moon: 'mind, home, public',
    Mars: 'drive, contest, property',
    Mercury: 'commerce, study, words',
    Jupiter: 'expansion, counsel',
    Venus: 'relationships, comfort',
    Saturn: 'discipline, slow labour',
    Rahu: 'ambition, the unfamiliar',
    Ketu: 'withdrawal, depth'
  };

  var HOUSE_KEYWORDS = [
    'self, vitality', 'wealth, family, speech', 'effort, siblings',
    'home, mother, land', 'creativity, children', 'service, competition',
    'partnership, trade', 'change, depth', 'fortune, teachers',
    'career, status', 'gains, networks', 'expenses, retreat'
  ];

  var HOUSE_THEMES = [
    'self, vitality, personal initiative',
    'wealth, family, speech, resources',
    'courage, effort, siblings, communication',
    'home, mother, land, inner comfort',
    'creativity, children, learning, expression',
    'service, competition, routine, obstacles',
    'partnership, marriage, trade, agreements',
    'change, depth, inheritance, transformation',
    'fortune, teachers, philosophy, long travel',
    'career, status, authority, public role',
    'gains, networks, aspirations fulfilled',
    'expenses, retreat, foreign matters, release'
  ];

  // -------------------------------------------------------------------------
  // Formatting helpers
  // -------------------------------------------------------------------------

  function formatDMS(value, withSeconds) {
    var sign = value < 0 ? '-' : '';
    value = Math.abs(value);
    var d = Math.floor(value);
    var rem = (value - d) * 60.0;
    var m = Math.floor(rem);
    var s = Math.round((rem - m) * 60.0);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; d += 1; }
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    if (withSeconds === false) return sign + d + '\u00b0 ' + pad(m) + "'";
    return sign + d + '\u00b0 ' + pad(m) + "' " + pad(s) + '"';
  }

  function formatPosition(lon) {
    return formatDMS(degreesInSign(lon)) + ' ' + SIGNS[signIndex(lon)];
  }

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct',
                'Nov','Dec'];

  function formatDate(ms) {
    var p = msToParts(ms);
    return (p.day < 10 ? '0' : '') + p.day + '-' + MONTHS[p.month - 1] + '-' + p.year;
  }

  function formatDateTime(ms) {
    var p = msToParts(ms);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return formatDate(ms) + ' ' + pad(p.hour) + ':' + pad(p.minute);
  }

  function humaniseYears(years) {
    var totalDays = years * 365.25;
    var y = Math.floor(totalDays / 365.25);
    var rem = totalDays - y * 365.25;
    var m = Math.floor(rem / 30.4375);
    var d = Math.round(rem - m * 30.4375);
    var parts = [];
    if (y) parts.push(y + 'y');
    if (m) parts.push(m + 'm');
    if (d && !y) parts.push(d + 'd');
    return parts.join(' ') || '0d';
  }

  return {
    // astronomy
    julianDay: julianDay, deltaTSeconds: deltaTSeconds, toTT: toTT,
    sunLongitude: sunLongitude, moonLongitude: moonLongitude,
    moonLatitude: moonLatitude, meanLunarNode: meanLunarNode,
    planetLongitude: planetLongitude, bodyLongitude: bodyLongitude,
    dailyMotion: dailyMotion, ascendant: ascendant, midheaven: midheaven,
    localSiderealTime: localSiderealTime, trueObliquity: trueObliquity,
    generalPrecession: generalPrecession, AYANAMSA: AYANAMSA,
    // chart layer
    buildChart: buildChart, signIndex: signIndex, degreesInSign: degreesInSign,
    nakshatraOf: nakshatraOf, navamsaLongitude: navamsaLongitude,
    houseCusps: houseCusps, houseOf: houseOf, vimshottari: vimshottari,
    currentDasha: currentDasha, panchang: panchang, dignity: dignity,
    solarReturnJD: solarReturnJD,
    // time helpers
    localToUtc: localToUtc, zoneOffsetMinutes: zoneOffsetMinutes,
    partsToMs: partsToMs, msToParts: msToParts, jdFromMs: jdFromMs,
    msFromJd: msFromJd,
    // tables
    SIGNS: SIGNS, SIGNS_SANSKRIT: SIGNS_SANSKRIT, SIGN_LORDS: SIGN_LORDS,
    ELEMENTS_BY_SIGN: ELEMENTS_BY_SIGN, MODALITIES: MODALITIES,
    NAKSHATRAS: NAKSHATRAS, VEDIC_BODIES: VEDIC_BODIES,
    WESTERN_BODIES: WESTERN_BODIES, WEEKDAYS: WEEKDAYS,
    PLANET_THEMES: PLANET_THEMES, HOUSE_THEMES: HOUSE_THEMES,
    PLANET_KEYWORDS: PLANET_KEYWORDS, HOUSE_KEYWORDS: HOUSE_KEYWORDS,
    DASHA_SEQUENCE: DASHA_SEQUENCE, UNCERTAINTY_ARCMIN: UNCERTAINTY_ARCMIN,
    // formatting
    formatDMS: formatDMS, formatPosition: formatPosition, formatDate: formatDate,
    formatDateTime: formatDateTime, humaniseYears: humaniseYears,
    mod: mod, norm360: norm360, angleDiff: angleDiff
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Astro;
