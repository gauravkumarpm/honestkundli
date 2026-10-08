/*
 * interpret.js -- the traditional/interpretive layer.
 *
 * Kept separate from astro-engine.js on purpose. The engine computes verifiable
 * astronomy; this file renders what the tradition SAYS about what the engine
 * computed. The two are different kinds of claim and should not sit in the same
 * file.
 *
 * Everything here is a faithful rendering of documented classical material:
 *   - Gochara (transit) readings from the Moon, per Phaladeepika / Brihat
 *     Jataka conventions
 *   - Ratna (gemstone) assignments per planet, with the tradition's own cautions
 *   - Lal Kitab upay/totka, restricted to the harmless observance and charity
 *     kind (donation, feeding animals, keeping an object). Remedies involving
 *     animal harm, ingesting anything, or replacing medical care are excluded
 *     deliberately -- not for squeamishness, but because a tool that hands
 *     someone a health "cure" can do real damage.
 *
 * None of it is evidence about any person. The narrative generator below is
 * explicitly built to describe a configuration, not to assert an event: there is
 * no code path here that outputs "you will" anything.
 */
'use strict';

var Interpret = (function () {

  var A = Astro;

  // -------------------------------------------------------------------------
  // Ordinals and small helpers
  // -------------------------------------------------------------------------

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function joinList(items) {
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  /* The Sun and the Moon take a definite article in English; the planets do not.
     "ruled by the Moon", but "ruled by Mars". */
  function theName(planet) {
    return (planet === 'Sun' || planet === 'Moon') ? 'the ' + planet : planet;
  }

  // -------------------------------------------------------------------------
  // Dasha character -- fuller than the keyword forms in the engine
  // -------------------------------------------------------------------------

  var DASHA_CHARACTER = {
    Sun: 'visibility, authority and questions of standing -- position, ' +
         'recognition, dealings with institutions and senior figures',
    Moon: 'the emotional and domestic register -- family, the home, the public ' +
          'mood, and a general changeability of circumstance',
    Mars: 'assertion and contest -- initiative, disputes, land and property, ' +
          'technical or physical work, and the appetite for direct action',
    Mercury: 'exchange and analysis -- trade, negotiation, writing, teaching, ' +
             'study, paperwork and frequent short movement',
    Jupiter: 'widening and counsel -- learning, mentorship, ethical questions, ' +
             'and an inclination to take a longer and more generous view',
    Venus: 'relationship and refinement -- partnership, comfort, art and taste, ' +
           'social life, and matters of value and negotiation',
    Saturn: 'consolidation through slow effort -- endurance, responsibility, ' +
            'structure, delay, and the paring back of what will not hold',
    Rahu: 'ambition pointed at the unfamiliar -- the foreign, the ' +
          'unconventional, sharp expansion, and a restlessness that resists ' +
          'settling',
    Ketu: 'detachment and depth -- withdrawal from what has run its course, ' +
          'research, specialisation, and a loosening of grip'
  };

  // -------------------------------------------------------------------------
  // Gochara: classical readings of a transit by house from the natal Moon.
  //
  // Traditionally favourable houses from the Moon are 3, 6 and 11 for Saturn,
  // and 2, 5, 7, 9 and 11 for Jupiter.
  // -------------------------------------------------------------------------

  var SATURN_FAVOURABLE = [3, 6, 11];
  var JUPITER_FAVOURABLE = [2, 5, 7, 9, 11];

  var SATURN_GOCHARA = {
    1: 'read as a demanding passage asking for plain living and patience',
    2: 'associated with attention to resources, family matters and speech',
    3: 'counted among Saturn\'s favourable positions, linked with stamina and ' +
       'effort rewarded',
    4: 'Kantaka Shani, traditionally a period of domestic friction and ' +
       'unsettled ground',
    5: 'read as a call for restraint in creative and speculative matters',
    6: 'counted favourable, linked with the wearing down of opposition',
    7: 'associated with weight placed on partnership and agreements',
    8: 'Ashtama Shani, read as a slow and inward-turning stretch',
    9: 'associated with tests of conviction and of guiding principle',
    10: 'Kantaka Shani in its second form, linked with heavy professional load',
    11: 'the most favoured of Saturn\'s positions, associated with steady gain',
    12: 'read as a period of withdrawal, expense and loosening of ties'
  };

  var JUPITER_GOCHARA = {
    1: 'read as a position of restlessness rather than ease',
    2: 'counted favourable, associated with resources and family support',
    3: 'read as a position asking effort before return',
    4: 'associated with domestic concern rather than expansion',
    5: 'counted favourable, associated with learning, children and creative work',
    6: 'read as a position of friction in routine matters',
    7: 'counted favourable, associated with partnership and standing',
    8: 'read as a position of obstruction to plans',
    9: 'counted among the most favoured, associated with fortune and guidance',
    10: 'read as a position of professional pressure',
    11: 'counted favourable, associated with gain and support from a network',
    12: 'read as a position of expense and of turning inward'
  };

  // -------------------------------------------------------------------------
  // Ratna (gemstones)
  //
  // metal/finger/day are the conventional prescriptions. "caution" carries the
  // tradition's OWN warnings, which are not uniform across texts.
  // -------------------------------------------------------------------------

  var GEMSTONES = {
    Sun: {
      stone: 'Ruby', local: 'Manik', substitutes: ['Red garnet', 'Sunstone'],
      metal: 'gold or copper', finger: 'ring finger', day: 'Sunday'
    },
    Moon: {
      stone: 'Natural pearl', local: 'Moti', substitutes: ['Moonstone'],
      metal: 'silver', finger: 'little finger', day: 'Monday'
    },
    Mars: {
      stone: 'Red coral', local: 'Moonga', substitutes: ['Carnelian'],
      metal: 'gold or copper', finger: 'ring finger', day: 'Tuesday'
    },
    Mercury: {
      stone: 'Emerald', local: 'Panna', substitutes: ['Green onyx', 'Peridot'],
      metal: 'gold or silver', finger: 'little finger', day: 'Wednesday'
    },
    Jupiter: {
      stone: 'Yellow sapphire', local: 'Pukhraj',
      substitutes: ['Yellow topaz', 'Citrine'],
      metal: 'gold', finger: 'index finger', day: 'Thursday'
    },
    Venus: {
      stone: 'Diamond', local: 'Heera',
      substitutes: ['White sapphire', 'White zircon'],
      metal: 'silver or platinum', finger: 'middle finger', day: 'Friday',
      caution: 'costly; the substitutes are the usual practical choice'
    },
    Saturn: {
      stone: 'Blue sapphire', local: 'Neelam',
      substitutes: ['Amethyst', 'Lapis lazuli'],
      metal: 'silver or iron alloy', finger: 'middle finger', day: 'Saturday',
      caution: 'the tradition itself treats Neelam as the riskiest stone and ' +
               'advises a trial period before wearing it'
    },
    Rahu: {
      stone: 'Hessonite', local: 'Gomed', substitutes: ['Orange zircon'],
      metal: 'silver', finger: 'middle finger', day: 'Saturday',
      caution: 'conventionally advised only after a trial period'
    },
    Ketu: {
      stone: "Cat's eye", local: 'Lehsunia', substitutes: ['Chrysoberyl'],
      metal: 'silver', finger: 'ring finger', day: 'Tuesday',
      caution: 'conventionally advised only after a trial period'
    }
  };

  // -------------------------------------------------------------------------
  // Lal Kitab upay / totka
  //
  // Restricted to donation, feeding and observance. Nothing here involves harm,
  // ingestion, or anything presented as a substitute for treatment or advice.
  // -------------------------------------------------------------------------

  var LAL_KITAB = {
    Sun: [
      'Offer water to the rising sun',
      'Donate wheat or jaggery on a Sunday',
      'Keep a copper coin or copper vessel at home',
      'Show deference to father and to elders in the family'
    ],
    Moon: [
      'Donate rice, milk or silver on a Monday',
      'Keep water in a silver vessel',
      'Serve and stay in contact with your mother or a mother figure',
      'Offer water at a place of worship'
    ],
    Mars: [
      'Offer sweetened bread (meethi roti) to a dog',
      'Donate red lentils or jaggery on a Tuesday',
      'Plant and tend a neem tree',
      'Keep sweet things at home rather than sharp iron on display'
    ],
    Mercury: [
      'Donate whole green gram (moong) on a Wednesday',
      'Feed green fodder to a cow',
      'Keep a green cloth or green stone with you',
      'Support a child\'s schooling or donate books'
    ],
    Jupiter: [
      'Donate split gram (chana dal), turmeric or saffron on a Thursday',
      'Water a peepal tree',
      'Feed cows',
      'Show deference to teachers and to those who have taught you'
    ],
    Venus: [
      'Donate white items -- rice, curd or ghee -- on a Friday',
      'Keep silver with you',
      'Maintain cleanliness and order in the home',
      'Support the welfare of women in your family or community'
    ],
    Saturn: [
      'Feed crows and street birds',
      'Donate mustard oil, black sesame or black gram (urad) on a Saturday',
      'Serve the elderly, the ill or those doing hard manual work',
      'Light a lamp under a peepal tree on a Saturday',
      'Keep an iron object, and avoid discarding iron carelessly'
    ],
    Rahu: [
      'Donate barley (jau)',
      'Set a coconut afloat in running water, where local rules permit',
      'Donate a dark blanket or warm clothing',
      'Keep a small square of silver with you',
      'Feed birds regularly'
    ],
    Ketu: [
      'Donate a black-and-white blanket',
      'Feed dogs, or support an animal shelter',
      'Donate sesame seeds',
      'Keep a dog, or care for one'
    ]
  };

  // -------------------------------------------------------------------------
  // Per-year narrative
  //
  // Describes a configuration. Deliberately never asserts an event: the
  // vocabulary is "the tradition reads", "is associated with", "is counted".
  // -------------------------------------------------------------------------

  function dignityClause(data) {
    if (!data.dignity) return '';
    if (data.dignity === 'Own sign') return ', in its own sign';
    if (data.dignity === 'Exalted') return ', exalted';
    if (data.dignity === 'Debilitated') return ', debilitated';
    return '';
  }

  function yearNarrative(row, chart) {
    var p = chart.positions;
    var startY = A.msToParts(row.startMs).year;
    var endY = A.msToParts(row.endMs).year;
    var span = startY === endY ? String(startY) : startY + '\u2013' +
               String(endY).slice(-2);
    var parts = [];

    // 1. Dasha frame.
    var mahaList = row.mahadashas;
    var maha = mahaList[0];
    var mData = p[maha];
    var lead = 'Age ' + row.age + ' (' + span + ') runs under the ' + maha +
      ' mahadasha';
    if (mahaList.length > 1) {
      lead += ', which gives way to ' + mahaList.slice(1).join(' then ') +
              ' during the year';
    }
    var antar = row.antardashas.map(function (a) { return a.lord; })
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    if (antar.length) {
      lead += ', with ' + joinList(antar) +
              (antar.length > 1 ? ' as successive antardashas' : ' as antardasha');
    }
    parts.push(lead + '.');

    // 2. Where the dasha lord actually sits in this chart.
    if (mData) {
      parts.push('In this chart ' + maha + ' occupies ' +
        A.SIGNS[A.signIndex(mData.sidereal)] + ' in the ' +
        ordinal(mData.houseVedic) + ' house' + dignityClause(mData) +
        ', so the tradition colours the period with ' + DASHA_CHARACTER[maha] +
        ', worked out through matters of ' +
        A.HOUSE_THEMES[mData.houseVedic - 1] + '.');
    }

    // 3. Antardasha sub-current.
    if (antar.length && p[antar[0]]) {
      var aData = p[antar[0]];
      parts.push('The ' + antar[0] + ' antardasha adds a sub-current of ' +
        A.PLANET_KEYWORDS[antar[0]] + ', from the ' +
        ordinal(aData.houseVedic) + ' house.');
    }

    // 4. Muntha.
    parts.push('Muntha has advanced to ' + A.SIGNS[row.munthaSign] + ', the ' +
      ordinal(row.munthaHouse) + ' from the birth ascendant, which places the ' +
      'year\'s emphasis on ' + A.HOUSE_THEMES[row.munthaHouse - 1] + '.');

    // 5. Annual ascendant.
    parts.push('The annual chart rises in ' + A.SIGNS[row.varshaLagnaSign] +
      ', ruled by ' + theName(A.SIGN_LORDS[row.varshaLagnaSign]) + '.');

    // 6. Saturn gochara.
    var satTxt = 'Saturn transits ' + A.SIGNS[row.saturnSign] + ', the ' +
      ordinal(row.saturnHouseFromMoon) + ' from the birth Moon, ' +
      SATURN_GOCHARA[row.saturnHouseFromMoon];
    if (row.sadeSati) {
      satTxt += ' -- this falls inside Sade Sati, the roughly seven-and-a-half ' +
        'year stretch when Saturn crosses the 12th, 1st and 2nd from the Moon';
    }
    parts.push(satTxt + '.');

    // 7. Jupiter gochara.
    parts.push('Jupiter is in ' + A.SIGNS[row.jupiterSign] + ', the ' +
      ordinal(row.jupiterHouseFromMoon) + ' from the Moon, ' +
      JUPITER_GOCHARA[row.jupiterHouseFromMoon] + '.');

    return parts.join(' ');
  }

  /* One-line gist for the collapsed view. */
  function yearGist(row) {
    var bits = [row.mahadashas.join('/') + ' period'];
    if (row.sadeSati) bits.push('Sade Sati');
    else if (row.saturnNote) bits.push(row.saturnNote.split(' (')[0]);
    if (JUPITER_FAVOURABLE.indexOf(row.jupiterHouseFromMoon) !== -1) {
      bits.push('Jupiter well placed');
    }
    if (SATURN_FAVOURABLE.indexOf(row.saturnHouseFromMoon) !== -1) {
      bits.push('Saturn well placed');
    }
    bits.push('Muntha in the ' + ordinal(row.munthaHouse));
    return bits.join('; ') + '.';
  }

  // -------------------------------------------------------------------------
  // Gemstones for a year
  // -------------------------------------------------------------------------

  function stoneLine(planet) {
    var g = GEMSTONES[planet];
    if (!g) return null;
    return {
      planet: planet,
      stone: g.stone,
      local: g.local,
      detail: g.stone + ' (' + g.local + ')',
      setting: g.metal + ', ' + g.finger + ', first worn on a ' + g.day,
      substitutes: g.substitutes.join(' or '),
      caution: g.caution || null
    };
  }

  function yearGemstones(row, chart) {
    var out = [];
    var seen = {};
    row.mahadashas.forEach(function (lord) {
      if (!seen[lord]) { seen[lord] = 1; out.push(stoneLine(lord)); }
    });
    var antar = row.antardashas.map(function (a) { return a.lord; });
    if (antar.length && !seen[antar[0]]) {
      seen[antar[0]] = 1;
      out.push(stoneLine(antar[0]));
    }
    return out.filter(Boolean);
  }

  function lagnaStone(chart) {
    var lord = A.SIGN_LORDS[A.signIndex(chart.ascendant.sidereal)];
    return stoneLine(lord);
  }

  // -------------------------------------------------------------------------
  // Lal Kitab remedies for a year
  // -------------------------------------------------------------------------

  function yearRemedies(row) {
    var out = [];
    var seen = {};
    function add(planet, why) {
      if (seen[planet]) return;
      seen[planet] = 1;
      out.push({ planet: planet, why: why, items: LAL_KITAB[planet] || [] });
    }
    row.mahadashas.forEach(function (lord) { add(lord, 'mahadasha lord'); });
    if (row.sadeSati) add('Saturn', 'Sade Sati in force');
    else if (row.saturnNote) add('Saturn', row.saturnNote.split(' (')[0]);
    var antar = row.antardashas.map(function (a) { return a.lord; });
    if (antar.length) add(antar[0], 'antardasha lord');
    return out;
  }

  // -------------------------------------------------------------------------
  // Question answering
  //
  // Deterministic lookup over the computed chart. Not a language model: it
  // matches keywords, pulls real values, and says so when it cannot help.
  // -------------------------------------------------------------------------

  var PLANET_ALIASES = {
    sun: 'Sun', surya: 'Sun', ravi: 'Sun',
    moon: 'Moon', chandra: 'Moon', chandrama: 'Moon',
    mars: 'Mars', mangal: 'Mars', mangala: 'Mars', kuja: 'Mars',
    mercury: 'Mercury', budh: 'Mercury', budha: 'Mercury',
    jupiter: 'Jupiter', guru: 'Jupiter', brihaspati: 'Jupiter', bruhaspati: 'Jupiter',
    venus: 'Venus', shukra: 'Venus', sukra: 'Venus',
    saturn: 'Saturn', shani: 'Saturn', sani: 'Saturn',
    rahu: 'Rahu', ketu: 'Ketu',
    uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto'
  };

  function findPlanet(text) {
    var keys = Object.keys(PLANET_ALIASES);
    for (var i = 0; i < keys.length; i++) {
      if (new RegExp('\\b' + keys[i] + '\\b').test(text)) {
        return PLANET_ALIASES[keys[i]];
      }
    }
    return null;
  }

  function describePlanet(chart, planet) {
    var d = chart.positions[planet];
    if (!d) return planet + ' is not among the bodies this chart computes.';
    var bits = [];
    bits.push('**' + planet + '** is at ' + A.formatPosition(d.sidereal) +
      ' (sidereal), in the ' + ordinal(d.houseVedic) + ' house.');
    bits.push('Nakshatra: ' + d.nakshatra.name + ', pada ' + d.nakshatra.pada +
      ', lord ' + d.nakshatra.lord + '.');
    bits.push('Navamsa (D-9): ' + A.SIGNS[A.signIndex(d.navamsa)] +
      ', ' + ordinal(d.houseNavamsa) + ' house.');
    var flags = [];
    if (d.retrograde) flags.push('retrograde');
    if (d.dignity) flags.push(d.dignity.toLowerCase());
    if (d.vargottama) flags.push('vargottama (same sign in D-1 and D-9)');
    if (flags.length) bits.push('Status: ' + joinList(flags) + '.');
    bits.push('Daily motion ' + (d.speed >= 0 ? '+' : '') +
      d.speed.toFixed(2) + '\u00b0.');
    if (GEMSTONES[planet]) {
      bits.push('Traditional stone: ' + GEMSTONES[planet].stone + ' (' +
        GEMSTONES[planet].local + ').');
    }
    return bits.join('\n');
  }

  function currentYearRow(chart, atMs) {
    for (var i = 0; i < chart.timeline.length; i++) {
      var r = chart.timeline[i];
      if (r.startMs <= atMs && atMs < r.endMs) return r;
    }
    return null;
  }

  function rowForYear(chart, year) {
    var best = null;
    chart.timeline.forEach(function (r) {
      if (A.msToParts(r.startMs).year === year) best = best || r;
    });
    if (!best) {
      // The astrological year straddles two calendar years; fall back to the
      // row whose span contains 1 July of that year.
      var probe = Date.UTC(year, 6, 1);
      best = currentYearRow(chart, probe);
    }
    return best;
  }

  function summariseRow(chart, r) {
    return yearNarrative(r, chart);
  }

  function sadeSatiSpans(chart) {
    var spans = [], run = null;
    chart.timeline.forEach(function (r) {
      if (r.sadeSati) {
        if (!run) run = { from: r, to: r };
        else run.to = r;
      } else if (run) { spans.push(run); run = null; }
    });
    if (run) spans.push(run);
    return spans;
  }

  /* Topic questions. These get the computed indications the tradition points at,
     plus an explicit statement that this is not a prediction. Health is handled
     separately and refused. */
  var TOPICS = {
    marriage: { houses: [7, 2, 11], planets: ['Venus', 'Jupiter'],
                label: 'marriage and partnership' },
    career: { houses: [10, 6, 11], planets: ['Saturn', 'Sun', 'Mercury'],
              label: 'career and professional standing' },
    money: { houses: [2, 11, 5], planets: ['Jupiter', 'Venus', 'Mercury'],
             label: 'money and resources' },
    children: { houses: [5], planets: ['Jupiter'], label: 'children' },
    education: { houses: [4, 5, 9], planets: ['Mercury', 'Jupiter'],
                 label: 'education and study' },
    property: { houses: [4], planets: ['Mars', 'Saturn'],
                label: 'property and land' },
    travel: { houses: [3, 9, 12], planets: ['Mercury', 'Rahu'],
              label: 'travel and relocation' },
    foreign: { houses: [12, 9], planets: ['Rahu'],
               label: 'foreign matters' }
  };

  function topicAnswer(chart, key) {
    var t = TOPICS[key];
    var lines = ['On **' + t.label + '**, the tradition looks at these places ' +
                 'in the chart. Here is what they actually contain:'];
    t.houses.forEach(function (h) {
      var occupants = [];
      A.VEDIC_BODIES.forEach(function (b) {
        if (chart.positions[b].houseVedic === h) occupants.push(b);
      });
      var signIdx = A.signIndex(chart.houses.vedic[h - 1]);
      lines.push('- ' + ordinal(h) + ' house (' + A.SIGNS[signIdx] +
        ', lord ' + A.SIGN_LORDS[signIdx] + '): ' +
        (occupants.length ? occupants.join(', ') : 'no planets') + '.');
    });
    t.planets.forEach(function (pl) {
      var d = chart.positions[pl];
      lines.push('- ' + pl + ': ' + A.SIGNS[A.signIndex(d.sidereal)] + ', ' +
        ordinal(d.houseVedic) + ' house' +
        (d.dignity ? ' (' + d.dignity.toLowerCase() + ')' : '') + '.');
    });
    lines.push('');
    lines.push('That is the configuration, not an outcome. I am not going to ' +
      'put a date on this: astrology has no demonstrated predictive validity, ' +
      'and a timing claim here would be invention dressed up as calculation.');
    return lines.join('\n');
  }

  var HELP = [
    'I answer from the chart just computed. I am a lookup over that data, not a ' +
    'language model and not a fortune teller -- every number I give you comes ' +
    'from the calculation on this page.',
    '',
    'Things I can answer:',
    '- **Placements**: "where is Saturn", "what is in my 7th house", ' +
    '"my moon sign", "my nakshatra", "which planets are retrograde", ' +
    '"anything vargottama"',
    '- **Dasha**: "what dasha am I in now", "dasha in 2030", "dasha at age 45"',
    '- **A specific year**: "tell me about 2031", "what about age 50"',
    '- **Sade Sati**: "when is my sade sati"',
    '- **Gemstones**: "which gemstone", "stone for Jupiter"',
    '- **Remedies**: "lal kitab remedies", "totka for Saturn"',
    '- **Birth panchang**: "my tithi", "my yoga", "my karana"',
    '- **Topics**: marriage, career, money, children, education, property, ' +
    'travel -- I will show you the relevant houses and planets, and I will not ' +
    'invent a date.'
  ].join('\n');

  function answerQuestion(chart, raw) {
    var q = (raw || '').toLowerCase().trim();
    if (!q) return HELP;

    var nowMs = Date.now();

    // --- health: refuse, and say why ---------------------------------------
    if (/\b(health|ill|illness|disease|sick|cancer|surgery|die|death|lifespan|how long will i live|maranga|ayush)\b/.test(q)) {
      return 'I will not read health or lifespan from a birth chart, and I would ' +
        'push back on anyone who does.\n\nThis is the one place astrology ' +
        'reliably causes harm: people delay real diagnosis and treatment ' +
        'because a chart told them something. If you have a health concern, ' +
        'a doctor can actually help you.\n\nI am glad to answer anything ' +
        'about the placements, dasha periods or transits in this chart.';
    }

    // --- help --------------------------------------------------------------
    if (/^(help|hi|hello|hey|what can you|options|\?)/.test(q)) return HELP;

    // --- gemstones ---------------------------------------------------------
    if (/\b(gem|gemstone|stone|ratna|ratan|neelam|pukhraj|moonga|panna|manik|moti|heera|gomed)\b/.test(q)) {
      var gp = findPlanet(q);
      var lines = [];
      if (gp && GEMSTONES[gp]) {
        var g = GEMSTONES[gp];
        lines.push('**' + gp + '** \u2192 ' + g.stone + ' (' + g.local + ').');
        lines.push('Conventional setting: ' + g.metal + ', ' + g.finger +
                   ', first worn on a ' + g.day + '.');
        lines.push('Substitutes: ' + g.substitutes.join(', ') + '.');
        if (g.caution) lines.push('Note from the tradition: ' + g.caution + '.');
      } else {
        var cur = A.currentDasha(chart.dasha, nowMs, 2);
        var ls = lagnaStone(chart);
        lines.push('Two selections the tradition makes:');
        lines.push('- **Lagna lord** (' + ls.planet + ', lifelong): ' +
                   ls.detail + ' \u2014 ' + ls.setting + '.');
        if (cur.length) {
          var ds = stoneLine(cur[0].lord);
          lines.push('- **Current mahadasha lord** (' + cur[0].lord + '): ' +
                     ds.detail + ' \u2014 ' + ds.setting + '.');
          if (ds.caution) lines.push('  Caution from the tradition: ' + ds.caution + '.');
        }
      }
      lines.push('');
      lines.push('Worth saying plainly: gemstones have no demonstrated effect, ' +
        'and the good ones cost real money. Treat this as a record of what the ' +
        'tradition prescribes, not a recommendation to spend.');
      return lines.join('\n');
    }

    // --- remedies ----------------------------------------------------------
    if (/\b(remedy|remedies|upay|upaay|totka|totke|lal kitab|laal kitab|daan|donate|puja|pooja)\b/.test(q)) {
      var rp = findPlanet(q);
      var out = [];
      if (rp && LAL_KITAB[rp]) {
        out.push('**Lal Kitab remedies associated with ' + rp + ':**');
        LAL_KITAB[rp].forEach(function (r) { out.push('- ' + r); });
      } else {
        var cd = A.currentDasha(chart.dasha, nowMs, 2);
        var lord = cd.length ? cd[0].lord : chart.dasha.startingLord;
        out.push('For the running **' + lord + '** mahadasha, Lal Kitab gives:');
        (LAL_KITAB[lord] || []).forEach(function (r) { out.push('- ' + r); });
        var sadeNow = currentYearRow(chart, nowMs);
        if (sadeNow && sadeNow.sadeSati) {
          out.push('');
          out.push('Sade Sati is also in force, for which the Saturn set applies:');
          LAL_KITAB.Saturn.forEach(function (r) { out.push('- ' + r); });
        }
      }
      out.push('');
      out.push('These are the harmless kind on purpose \u2014 donation, feeding ' +
        'animals, keeping an object. I have left out anything involving harm or ' +
        'anything that could be read as treatment. They are folk practice with ' +
        'no demonstrated effect; none of it substitutes for medical, legal or ' +
        'financial advice.');
      return out.join('\n');
    }

    // --- sade sati ---------------------------------------------------------
    if (/\bsade ?sati|sadhe ?sati|shani.*(period|transit)\b/.test(q)) {
      var spans = sadeSatiSpans(chart);
      if (!spans.length) return 'No Sade Sati falls inside the 100 years computed.';
      var sl = ['**Sade Sati** is Saturn crossing the 12th, 1st and 2nd from ' +
                'your birth Moon (' +
                A.SIGNS[A.signIndex(chart.positions.Moon.sidereal)] +
                '). Within the computed century:'];
      spans.forEach(function (s) {
        sl.push('- ages ' + s.from.age + '\u2013' + s.to.age + ' (' +
          A.formatDate(s.from.startMs) + ' to ' + A.formatDate(s.to.endMs) + ')');
      });
      sl.push('');
      sl.push('The tradition treats it as a demanding stretch calling for ' +
        'patience and plain living. It is a transit position, not a verdict.');
      return sl.join('\n');
    }

    // --- dasha -------------------------------------------------------------
    if (/\b(dasha|dasa|mahadasha|antardasha|bhukti|period)\b/.test(q)) {
      var mAge = q.match(/age\s*(\d{1,3})/);
      var mYear = q.match(/\b(1[89]\d\d|20\d\d|21\d\d)\b/);
      var targetMs = null, label = '';
      if (mAge) {
        var rowA = chart.timeline[parseInt(mAge[1], 10)];
        if (rowA) { targetMs = rowA.startMs; label = 'at age ' + mAge[1]; }
      } else if (mYear) {
        targetMs = Date.UTC(parseInt(mYear[1], 10), 6, 1);
        label = 'in ' + mYear[1];
      } else {
        targetMs = nowMs; label = 'right now';
      }
      if (targetMs === null) return 'That age is outside the 100 years computed.';
      var chain = A.currentDasha(chart.dasha, targetMs, 3);
      if (!chain.length) return 'That date falls outside the computed dasha span.';
      var dl = ['Dasha ' + label + ': **' +
                chain.map(function (c) { return c.lord; }).join(' / ') + '**'];
      chain.forEach(function (c, i) {
        dl.push('- ' + ['Mahadasha', 'Antardasha', 'Pratyantardasha'][i] + ': ' +
          c.lord + ', ' + A.formatDate(c.start) + ' to ' + A.formatDate(c.end) +
          ' (' + A.humaniseYears(c.years) + ')');
      });
      dl.push('');
      dl.push('The ' + chain[0].lord + ' period is associated with ' +
        DASHA_CHARACTER[chain[0].lord] + '.');
      return dl.join('\n');
    }

    // --- a specific year or age -------------------------------------------
    var yr = q.match(/\b(1[89]\d\d|20\d\d|21\d\d)\b/);
    var ag = q.match(/\bage\s*(\d{1,3})\b/);
    if (yr || ag) {
      var row = ag ? chart.timeline[parseInt(ag[1], 10)]
                   : rowForYear(chart, parseInt(yr[1], 10));
      if (!row) {
        return 'That falls outside the 100 years computed (ages 0 to 100, ' +
          A.msToParts(chart.timeline[0].startMs).year + ' to ' +
          A.msToParts(chart.timeline[100].startMs).year + ').';
      }
      return summariseRow(chart, row) + '\n\nThat is a description of the ' +
        'configuration, not a forecast.';
    }

    // --- house contents ----------------------------------------------------
    var hm = q.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:house|bhava)\b/) ||
             q.match(/\bhouse\s*(\d{1,2})\b/);
    if (hm) {
      var h = parseInt(hm[1], 10);
      if (h < 1 || h > 12) return 'Houses run 1 to 12.';
      var sIdx = A.signIndex(chart.houses.vedic[h - 1]);
      var occ = [];
      A.VEDIC_BODIES.forEach(function (b) {
        if (chart.positions[b].houseVedic === h) {
          occ.push(b + ' at ' + A.formatPosition(chart.positions[b].sidereal));
        }
      });
      return ['**' + ordinal(h) + ' house**: ' + A.SIGNS[sIdx] + ' (' +
        A.SIGNS_SANSKRIT[sIdx] + '), lord ' + A.SIGN_LORDS[sIdx] + '.',
        'Occupants: ' + (occ.length ? occ.join('; ') : 'none.'),
        'Traditional significations: ' + A.HOUSE_THEMES[h - 1] + '.'].join('\n');
    }

    // --- lagna / moon / sun quick asks ------------------------------------
    if (/\b(lagna|ascendant|rising|asc)\b/.test(q)) {
      var ai = A.signIndex(chart.ascendant.sidereal);
      return ['**Lagna**: ' + A.SIGNS[ai] + ' (' + A.SIGNS_SANSKRIT[ai] +
        '), at ' + A.formatPosition(chart.ascendant.sidereal) + '.',
        'Lagna lord: ' + A.SIGN_LORDS[ai] + ', in the ' +
        ordinal(chart.positions[A.SIGN_LORDS[ai]].houseVedic) + ' house.',
        'Navamsa lagna: ' + A.SIGNS[A.signIndex(chart.ascendant.navamsa)] + '.',
        '',
        'The Ascendant depends on the birth time: 4 minutes of error moves it ' +
        'about a degree.'].join('\n');
    }
    if (/\bnakshatra|star|birth star|janma\b/.test(q)) {
      var nk = chart.positions.Moon.nakshatra;
      return ['**Janma nakshatra**: ' + nk.name + ', pada ' + nk.pada +
        ', lord ' + nk.lord + '.',
        'The Moon is ' + (nk.fraction * 100).toFixed(1) + '% through it, which ' +
        'is what set the balance of the first mahadasha at birth (' +
        A.humaniseYears(chart.dasha.balanceYears) + ' of ' +
        chart.dasha.startingLord + ').'].join('\n');
    }
    if (/\b(retrograde|vakri)\b/.test(q)) {
      var retro = A.VEDIC_BODIES.filter(function (b) {
        return chart.positions[b].retrograde;
      });
      return retro.length
        ? 'Retrograde at birth: **' + retro.join(', ') + '**.'
        : 'No planet is retrograde in this chart.';
    }
    if (/\bvargottama\b/.test(q)) {
      var vg = A.VEDIC_BODIES.filter(function (b) {
        return chart.positions[b].vargottama;
      });
      return vg.length
        ? '**Vargottama** (same sign in D-1 and D-9): ' + vg.join(', ') +
          '. The tradition reads this as reinforced.'
        : 'Nothing is vargottama in this chart.';
    }
    if (/\b(navamsa|navamsha|d9|d-9)\b/.test(q)) {
      var nl = [];
      nl.push('**Navamsa lagna**: ' +
        A.SIGNS[A.signIndex(chart.ascendant.navamsa)] + '.');
      A.VEDIC_BODIES.forEach(function (b) {
        var d = chart.positions[b];
        nl.push('- ' + b + ': ' + A.SIGNS[A.signIndex(d.sidereal)] +
          ' \u2192 ' + A.SIGNS[A.signIndex(d.navamsa)] +
          ' (' + ordinal(d.houseNavamsa) + ' house)' +
          (d.vargottama ? ' \u2014 vargottama' : ''));
      });
      return nl.join('\n');
    }
    if (/\b(tithi|panchang|panchanga|yoga|karana|vara|weekday)\b/.test(q)) {
      var pa = chart.panchang;
      return ['**Panchang at birth**',
        '- Tithi: ' + pa.paksha + ' ' + pa.tithi + ' (' +
          Math.round(pa.tithiPercent) + '% elapsed)',
        '- Vara: ' + pa.vara + ', lord ' + pa.varaLord,
        '- Nakshatra: ' + pa.nakshatra.name + ', pada ' + pa.nakshatra.pada,
        '- Yoga: ' + pa.yoga,
        '- Karana: ' + pa.karana].join('\n');
    }
    if (/\bmuntha\b/.test(q)) {
      var cr = currentYearRow(chart, nowMs);
      return ['**Muntha** advances exactly one sign per year from the birth ' +
        'ascendant, and marks where the annual chart puts its emphasis.',
        cr ? 'This year (age ' + cr.age + ') it sits in ' +
          A.SIGNS[cr.munthaSign] + ', the ' + ordinal(cr.munthaHouse) +
          ' house: ' + A.HOUSE_THEMES[cr.munthaHouse - 1] + '.' : ''].join('\n');
    }
    if (/\bayanamsa|ayanamsha\b/.test(q)) {
      return 'Ayanamsa used: **' + A.formatDMS(chart.ayanamsa) + '** (' +
        chart.ayanamsaName + '). That is the offset subtracted from tropical ' +
        'longitudes to get the sidereal positions this chart uses.';
    }

    // --- topics ------------------------------------------------------------
    var topicKeys = {
      marriage: /\b(marriage|marry|married|spouse|wife|husband|partner|shaadi|vivah|relationship|love)\b/,
      career: /\b(career|job|work|profession|business|promotion|employment)\b/,
      money: /\b(money|wealth|finance|financial|income|rich|dhan|savings)\b/,
      children: /\b(child|children|kids|santan|progeny)\b/,
      education: /\b(education|study|studies|exam|college|degree|vidya)\b/,
      property: /\b(property|house|home|land|flat|real estate|vehicle)\b/,
      travel: /\b(travel|relocat|move abroad|migration|journey)\b/,
      foreign: /\b(foreign|abroad|overseas|visa|videsh)\b/
    };
    var tk = Object.keys(topicKeys);
    for (var i = 0; i < tk.length; i++) {
      if (topicKeys[tk[i]].test(q)) return topicAnswer(chart, tk[i]);
    }

    // --- a named planet ----------------------------------------------------
    var pl = findPlanet(q);
    if (pl) return describePlanet(chart, pl);

    // --- fallback ----------------------------------------------------------
    return 'I could not match that to anything in the chart.\n\n' + HELP;
  }

  return {
    yearNarrative: yearNarrative,
    yearGist: yearGist,
    yearGemstones: yearGemstones,
    yearRemedies: yearRemedies,
    lagnaStone: lagnaStone,
    stoneLine: stoneLine,
    answerQuestion: answerQuestion,
    ordinal: ordinal,
    GEMSTONES: GEMSTONES,
    LAL_KITAB: LAL_KITAB,
    DASHA_CHARACTER: DASHA_CHARACTER,
    SATURN_FAVOURABLE: SATURN_FAVOURABLE,
    JUPITER_FAVOURABLE: JUPITER_FAVOURABLE
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Interpret;
