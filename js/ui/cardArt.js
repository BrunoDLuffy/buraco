// cardArt.js — procedural SVG art for the Buraco deck, card backs and table felt.
//
// Pure string building: no DOM access, no external assets, works in browser and Node.
//
// Card ids: suit letter + 2-digit rank + copy letter, e.g. 'H13a' (K♥), 'S01b' (A♠).
// Jokers:   'X00a'..'X00d'.
//
// Public API
//   cardFaceSVG(id)            full card face, viewBox 0 0 200 280
//   cardBackSVG(style='blue')  card back ('blue' | 'red' | 'green' | 'black')
//   cardMiniSVG(id)            compact face for table melds, viewBox 0 0 100 140
//   suitPath(suit)             SVG path `d` for a suit symbol in a 0..100 box ('S','H','D','C', 'X' = star)
//   SUIT_COLORS                { S, H, D, C } fill colours
//   RANK_LABELS                { 1:'A', ..., 13:'K' }
//   tableFeltCSS(theme='green') CSS string for .table-rim / .table-felt (+ [data-felt] variants)
//   FELT_THEMES                { green, blue, wine } CSS background values

// ---------------------------------------------------------------------------
// Palette & constants
// ---------------------------------------------------------------------------

export const SUIT_COLORS = Object.freeze({ S: '#1d1d1f', H: '#c62828', D: '#c62828', C: '#1d1d1f' });

export const RANK_LABELS = Object.freeze({
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
  8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K',
});

const C = {
  ivory: '#fffdf6',
  edge: '#a7a092',
  red: '#c62828',
  redDark: '#8e1b1b',
  blue: '#24489b',
  blueDark: '#15306b',
  gold: '#e3a72f',
  goldLight: '#f6d77a',
  goldDark: '#9a6a12',
  black: '#1d1d1f',
  skin: '#f8dcbc',
  skinLine: '#6b4a2e',
  white: '#ffffff',
  green: '#2e7d32',
  purple: '#6a3d9a',
};

const SERIF = "'Times New Roman', Times, 'Liberation Serif', 'Noto Serif', serif";
const SANS = "'Arial Black', 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif";
const NS = 'http://www.w3.org/2000/svg';

// Unique id suffix so many inline SVGs on one page never share <defs> ids.
let uidSeq = 0;
const uid = (prefix) => `${prefix}-${(++uidSeq).toString(36)}`;

// Round numbers so generated markup stays compact.
const n = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------
// Suit shapes (0..100 box, all subpaths clockwise so nonzero fill never punches holes)
// ---------------------------------------------------------------------------

const SUIT_PATHS = {
  // Heart: two lobes into a sharp point
  H: 'M50 94C45 86 6 62 5 35C4 17 17 6 31 6C41 6 47 12 50 21C53 12 59 6 69 6C83 6 96 17 95 35C94 62 55 86 50 94Z',
  // Diamond: lozenge with gently concave sides
  D: 'M50 3C59 21 71 37 86 50C71 63 59 79 50 97C41 79 29 63 14 50C29 37 41 21 50 3Z',
  // Spade: inverted heart with flared stem
  S: 'M50 4C57 19 95 40 95 63C95 77 85 85 73 85C64 85 57 81 53 74C54 84 59 91 68 96L32 96C41 91 46 84 47 74C43 81 36 85 27 85C15 85 5 77 5 63C5 40 43 19 50 4Z',
  // Club: three lobes, a centre web and a flared stem
  C: 'M31 27A19 19 0 1 1 69 27A19 19 0 1 1 31 27Z' +
     'M9 59A19 19 0 1 1 47 59A19 19 0 1 1 9 59Z' +
     'M53 59A19 19 0 1 1 91 59A19 19 0 1 1 53 59Z' +
     'M50 36L69 66L31 66Z' +
     'M53 60C54 79 59 89 68 96L32 96C41 89 46 79 47 60Z',
  // Star (joker "suit")
  X: starPath(50, 52, 48, 20, 5),
};

/** SVG path `d` for a suit symbol in a 0..100 box. 'X' gives the joker star. */
export function suitPath(suit) {
  return SUIT_PATHS[suit] || SUIT_PATHS.S;
}

function starPath(cx, cy, ro, ri, points, rot = -90) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (i * 180) / points) * Math.PI) / 180;
    d += `${i ? 'L' : 'M'}${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`;
  }
  return d + 'Z';
}

/** A suit symbol of `size` centred at (cx, cy), optionally upside-down. */
function pip(suit, cx, cy, size, fill, flip = false, extra = '') {
  const s = n(size / 100);
  const h = n(size / 2);
  const t = flip
    ? `translate(${n(cx)} ${n(cy)}) rotate(180) translate(${-h} ${-h}) scale(${s})`
    : `translate(${n(cx - h)} ${n(cy - h)}) scale(${s})`;
  return `<path d="${suitPath(suit)}" transform="${t}" fill="${fill}"${extra}/>`;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseId(id) {
  const s = String(id || '');
  const suit = s[0];
  const rank = parseInt(s.slice(1, 3), 10) || 0;
  return { suit, rank, copy: s[3] || 'a', joker: suit === 'X' };
}

// Jokers 'a'/'c' are red-ish, 'b'/'d' dark.
const jokerIsRed = (copy) => copy === 'a' || copy === 'c';

const svgOpen = (w, h, label, extra = '') =>
  `<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}"${extra}>`;

const SUIT_NAMES = { S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' };
const RANK_NAMES = { 1: 'Ás', 11: 'Valete', 12: 'Dama', 13: 'Rei' };
function ariaName({ suit, rank, joker }) {
  if (joker) return 'Coringa';
  return `${RANK_NAMES[rank] || rank} de ${SUIT_NAMES[suit] || ''}`;
}

// ---------------------------------------------------------------------------
// Card face (200 × 280)
// ---------------------------------------------------------------------------

const W = 200, H = 280;

/** Card body: ivory rounded rectangle with a fine border. */
function cardBody(w, h, r) {
  return `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${r}" fill="${C.ivory}" stroke="${C.edge}" stroke-width="2"/>`;
}

/** Big corner index: rank text over a suit pip, filling roughly the left 30% × top 40%. */
// Wide glyphs are condensed with textLength so the index never exceeds ~46 units
// (the left 25% strip of a fanned card), whatever fallback font the device uses.
const WIDE_GLYPHS = new Set(['A', 'K', 'Q', '10', 'JK']);
function rankText(label, x, y, size, color, maxW) {
  const fit = WIDE_GLYPHS.has(label) ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" font-family="${SERIF}" font-weight="700" font-size="${size}" ` +
    `text-anchor="middle" fill="${color}"${fit}>${label}</text>`;
}

function cornerIndex(label, suit, color, { x = 25, y = 64, size = 66, pipY = 93, pipSize = 40 } = {}) {
  return rankText(label, x, y, size, color, 44) +
    pip(suit, x, pipY, pipSize, color);
}

/** Index at top-left plus the same index rotated 180° at bottom-right. */
function bothIndices(label, suit, color, opts) {
  const g = cornerIndex(label, suit, color, opts);
  return `<g>${g}</g><g transform="rotate(180 ${W / 2} ${H / 2})">${g}</g>`;
}

// Pip layouts: [column, row] with column -1/0/1 and row 0..1 (top→bottom).
const T = 1 / 3, S6 = 1 / 6;
const PIP_LAYOUTS = {
  2: [[0, 0], [0, 1]],
  3: [[0, 0], [0, 0.5], [0, 1]],
  4: [[-1, 0], [1, 0], [-1, 1], [1, 1]],
  5: [[-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
  6: [[-1, 0], [1, 0], [-1, 0.5], [1, 0.5], [-1, 1], [1, 1]],
  7: [[-1, 0], [1, 0], [0, 0.25], [-1, 0.5], [1, 0.5], [-1, 1], [1, 1]],
  8: [[-1, 0], [1, 0], [0, 0.25], [-1, 0.5], [1, 0.5], [0, 0.75], [-1, 1], [1, 1]],
  9: [[-1, 0], [1, 0], [-1, T], [1, T], [0, 0.5], [-1, 2 * T], [1, 2 * T], [-1, 1], [1, 1]],
  10: [[-1, 0], [1, 0], [0, S6], [-1, T], [1, T], [-1, 2 * T], [1, 2 * T], [0, 5 * S6], [-1, 1], [1, 1]],
};

// The pip field sits in the central band between the two big indices.
const PIP_FIELD = { cx: 100, dx: 27, top: 40, bottom: 240, size: 33 };

function numberPips(rank, suit, color) {
  const f = PIP_FIELD;
  return PIP_LAYOUTS[rank].map(([col, row]) => {
    const x = f.cx + col * f.dx;
    const y = f.top + row * (f.bottom - f.top);
    // Pips in the lower half point down, like a real deck; the centre one stays upright.
    return pip(suit, x, y, f.size, color, row > 0.5);
  }).join('');
}

/** Ace: one large ornamented suit inside a fine decorative ring. */
function acePip(suit, color) {
  const size = suit === 'S' ? 92 : 84;
  const ring = `<circle cx="100" cy="140" r="64" fill="none" stroke="${color}" stroke-opacity=".22" stroke-width="1.2"/>` +
    `<circle cx="100" cy="140" r="58" fill="none" stroke="${color}" stroke-opacity=".28" stroke-width="2.5" stroke-dasharray="1 5.07" stroke-linecap="round"/>`;
  // Small flourishes on the ring's compass points
  const dots = [[100, 76], [164, 140], [100, 204], [36, 140]]
    .map(([x, y]) => pip('D', x, y, 9, color, false, ' fill-opacity=".45"')).join('');
  // Inner white inlay: the same shape scaled down, outlined
  const inner = suit === 'C' ? '' : pip(suit, 100, 140, size * 0.72, 'none', false,
    ` stroke="${C.white}" stroke-width="${n(2.2 / (size * 0.72 / 100))}" stroke-opacity=".9"`);
  let extra = '';
  if (suit === 'S') {
    // Traditional ornate ace of spades: gold heart-shaped centre jewel
    extra = pip('D', 100, 132, 14, C.gold, false, ` stroke="${C.goldDark}" stroke-width="6"`);
  }
  return ring + dots + pip(suit, 100, 140, size, color) + inner + extra;
}

// --- Court cards -----------------------------------------------------------

// Robe colours per suit (classic red / royal blue / gold / black palette).
const COURT_COLORS = {
  S: { p: C.blue, s: C.red, pd: C.blueDark },
  H: { p: C.red, s: C.blue, pd: C.redDark },
  D: { p: C.red, s: C.black, pd: C.redDark },
  C: { p: C.blue, s: C.black, pd: C.blueDark },
};

// Panel (frame) geometry: centred band, clear of both indices.
const PANEL = { x: 54, y: 10, w: 92, h: 260 };

/** Draw one half of a double-headed court figure (top half; mirrored for the bottom). */
function courtHalf(rank, suit) {
  const col = COURT_COLORS[suit];
  const sc = SUIT_COLORS[suit];
  const ink = `stroke="${C.black}" stroke-width="1" stroke-linejoin="round"`;
  const out = [];


  // Held attribute (behind the body)
  if (rank === 13) {
    // King: sword on the right
    out.push(
      `<path d="M126 40L129 46V112H123V46Z" fill="#dfe5ea" ${ink}/>`,
      `<line x1="126" y1="48" x2="126" y2="108" stroke="#9aa6b0" stroke-width="1"/>`,
      `<rect x="117" y="104" width="18" height="5" rx="2" fill="${C.gold}" stroke="${C.goldDark}" stroke-width="1"/>`,
      `<rect x="123.5" y="109" width="5" height="14" fill="${col.s}" ${ink}/>`,
      `<circle cx="126" cy="125" r="3.4" fill="${C.gold}" stroke="${C.goldDark}" stroke-width="1"/>`,
    );
  } else if (rank === 11) {
    // Jack: halberd on the left
    out.push(
      `<rect x="72.5" y="36" width="3.4" height="104" fill="#8a5a2b" ${ink}/>`,
      `<path d="M74 26L78 36H70Z" fill="#dfe5ea" ${ink}/>`,
      `<path d="M75.9 40C86 40 89 47 88 56C83 52 79 51 75.9 52Z" fill="#dfe5ea" ${ink}/>`,
      `<path d="M72.5 42C67 43 65 47 66 52C68 49 70 48 72.5 48Z" fill="#dfe5ea" ${ink}/>`,
    );
  }

  // Robe / shoulders
  out.push(`<path d="M65 140V119C65 104 80 95 100 95C120 95 135 104 135 119V140Z" fill="${col.p}" ${ink}/>`);
  // Decorative front panel with gold studs
  out.push(`<path d="M91 97H109L113 140H87Z" fill="${col.s}" ${ink}/>`);
  for (let y = 108; y < 140; y += 10) out.push(`<circle cx="100" cy="${y}" r="2.3" fill="${C.gold}"/>`);
  // Shoulder trim (gold piping)
  out.push(`<path d="M68 128C70 112 78 104 90 100M132 128C130 112 122 104 110 100" fill="none" stroke="${C.gold}" stroke-width="2.4"/>`);
  out.push(`<path d="M67 134H87M113 134H133" stroke="${C.gold}" stroke-width="2" stroke-dasharray="3 2"/>`);

  // Neck
  out.push(`<rect x="95" y="80" width="10" height="17" fill="${C.skin}" stroke="${C.skinLine}" stroke-width=".8"/>`);

  // Collar
  if (rank === 13) {
    // Ermine collar
    out.push(`<path d="M76 101C88 110 112 110 124 101L119 95C110 101 90 101 81 95Z" fill="${C.white}" ${ink}/>`);
    for (const x of [86, 95, 105, 114]) out.push(`<path d="M${x} 102.5l1 2.6l-1 -.6l-1 .6z" fill="${C.black}"/>`);
  } else {
    // Ruffled lace collar
    let d = 'M80 98';
    for (let i = 0; i < 8; i++) d += `a2.5 2.5 0 0 0 5 0`;
    out.push(`<path d="${d}L114 103C106 108 94 108 86 103Z" fill="${C.white}" ${ink}/>`);
    if (rank === 12) out.push(`<path d="M88 104Q100 114 112 104" fill="none" stroke="${C.gold}" stroke-width="2"/><circle cx="100" cy="110" r="2.6" fill="${C.red}" stroke="${C.goldDark}" stroke-width=".8"/>`);
  }

  // Hair behind the head
  if (rank === 12) {
    out.push(`<path d="M85 64C83 50 91 47 100 47C109 47 117 50 115 64C116 76 119 88 121 98L111 96C112 88 110 80 109 76H91C90 80 88 88 89 96L79 98C81 88 84 76 85 64Z" fill="#e9b949" ${ink}/>`);
  } else if (rank === 11) {
    out.push(`<path d="M86 62C86 54 92 50 100 50C108 50 114 54 114 62C116 70 116 78 112 84H88C84 78 84 70 86 62Z" fill="#8d5a2b" ${ink}/>`);
  } else {
    out.push(`<path d="M86 60C86 52 92 49 100 49C108 49 114 52 114 60C116 70 115 78 112 82H88C85 78 84 70 86 60Z" fill="#c98a2b" ${ink}/>`);
  }

  // Face
  out.push(`<ellipse cx="100" cy="69" rx="12.5" ry="14" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="1"/>`);
  // Eyes, brows, nose
  out.push(
    `<path d="M93 66.5h4M103 66.5h4" stroke="${C.black}" stroke-width="1.1" stroke-linecap="round"/>`,
    `<circle cx="95.2" cy="68.7" r="1.25" fill="${C.black}"/><circle cx="104.8" cy="68.7" r="1.25" fill="${C.black}"/>`,
    `<path d="M100 69.5L98 75.5H101" fill="none" stroke="${C.skinLine}" stroke-width=".9" stroke-linecap="round"/>`,
  );
  if (rank === 13) {
    // Beard and moustache
    out.push(
      `<path d="M87.6 70C87.5 86 94 93 100 95C106 93 112.5 86 112.4 70C109 79 105 81 100 81C95 81 91 79 87.6 70Z" fill="#c98a2b" ${ink}/>`,
      `<path d="M93 79C96 76 99 77 100 78C101 77 104 76 107 79C104 80 102 80 100 79.4C98 80 96 80 93 79Z" fill="#a8701f"/>`,
    );
  } else {
    out.push(`<path d="M96.5 79.3Q100 81.5 103.5 79.3" fill="none" stroke="${C.red}" stroke-width="1.6" stroke-linecap="round"/>`);
    out.push(`<circle cx="93" cy="74" r="2.2" fill="${C.red}" fill-opacity=".18"/><circle cx="107" cy="74" r="2.2" fill="${C.red}" fill-opacity=".18"/>`);
    if (rank === 11) out.push(`<path d="M95 77.5Q100 75.8 105 77.5" fill="none" stroke="#6d4320" stroke-width="1.3" stroke-linecap="round"/>`);
  }

  // Headwear
  if (rank === 13) {
    out.push(
      `<path d="M86 59L84.5 39L92.5 47L100 34L107.5 47L115.5 39L114 59Z" fill="${C.gold}" stroke="${C.goldDark}" stroke-width="1.2" stroke-linejoin="round"/>`,
      `<rect x="85.5" y="53" width="29" height="6.5" rx="1.5" fill="${col.s}" stroke="${C.goldDark}" stroke-width="1"/>`,
      `<circle cx="84.5" cy="38.5" r="2.4" fill="${C.goldLight}" stroke="${C.goldDark}" stroke-width=".8"/>`,
      `<circle cx="100" cy="33" r="2.8" fill="${C.goldLight}" stroke="${C.goldDark}" stroke-width=".8"/>`,
      `<circle cx="115.5" cy="38.5" r="2.4" fill="${C.goldLight}" stroke="${C.goldDark}" stroke-width=".8"/>`,
      `<circle cx="100" cy="56.2" r="2.2" fill="${C.white}"/><circle cx="91" cy="56.2" r="1.5" fill="${C.goldLight}"/><circle cx="109" cy="56.2" r="1.5" fill="${C.goldLight}"/>`,
      `<path d="M100 40l2.4 5h-4.8z" fill="${col.p}"/>`,
    );
  } else if (rank === 12) {
    out.push(
      `<path d="M87 58L90 48L95 53L100 42L105 53L110 48L113 58Q100 55 87 58Z" fill="${C.gold}" stroke="${C.goldDark}" stroke-width="1.1" stroke-linejoin="round"/>`,
      `<circle cx="100" cy="51" r="2.2" fill="${col.p}" stroke="${C.goldDark}" stroke-width=".6"/>`,
      `<circle cx="100" cy="40.5" r="2" fill="${C.goldLight}" stroke="${C.goldDark}" stroke-width=".6"/>`,
    );
    // Queen's flower held at the right
    out.push(
      `<path d="M124 132C124 118 126 108 124 96" fill="none" stroke="${C.green}" stroke-width="2"/>`,
      `<path d="M124 116C130 112 133 113 134 110C129 109 126 111 124 116Z" fill="${C.green}"/>`,
    );
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      out.push(`<circle cx="${n(124 + 5 * Math.cos(a))}" cy="${n(92 + 5 * Math.sin(a))}" r="3.6" fill="${C.red}" stroke="${C.redDark}" stroke-width=".7"/>`);
    }
    out.push(`<circle cx="124" cy="92" r="2.6" fill="${C.goldLight}" stroke="${C.goldDark}" stroke-width=".6"/>`);
    out.push(`<circle cx="122" cy="122" r="4" fill="${C.skin}" stroke="${C.skinLine}" stroke-width=".9"/>`);
  } else {
    // Jack's beret with a feather
    out.push(
      `<path d="M112 51C120 43 129 42 136 46C130 48 122 53 115 57Z" fill="${C.white}" ${ink}/>`,
      `<path d="M114 54C121 48 128 46 134 46" fill="none" stroke="${C.black}" stroke-width=".7"/>`,
      `<path d="M83 61C82 49 96 43 108 45C116 46 120 51 118 57C108 59 94 60 83 61Z" fill="${col.s}" ${ink}/>`,
      `<path d="M83.5 60C94 58.5 108 57.5 118 56.5" fill="none" stroke="${C.gold}" stroke-width="2.6"/>`,
      `<circle cx="103" cy="52" r="2.2" fill="${C.goldLight}" stroke="${C.goldDark}" stroke-width=".7"/>`,
    );
    out.push(`<circle cx="74.2" cy="114" r="4" fill="${C.skin}" stroke="${C.skinLine}" stroke-width=".9"/>`);
  }
  if (rank === 13) out.push(`<circle cx="126" cy="117" r="4" fill="${C.skin}" stroke="${C.skinLine}" stroke-width=".9"/>`);

  // Scale the bust up to fill the panel, then add the suit emblem in the corner
  // opposite the held attribute, plus a faint tint wash.
  const ex = rank === 13 ? PANEL.x + 13 : PANEL.x + PANEL.w - 13;
  return `<path d="M${PANEL.x} 140V${PANEL.y}H${PANEL.x + PANEL.w}V140Z" fill="${col.p}" fill-opacity=".07"/>` +
    `<g transform="translate(100 140) scale(1.12) translate(-100 -140)">${out.join('')}</g>` +
    pip(suit, ex, PANEL.y + 15, 16, sc);
}

function courtFigure(rank, suit, prefix) {
  const col = COURT_COLORS[suit];
  const clip = `${prefix}-clip`;
  const { x, y, w, h } = PANEL;
  const half = courtHalf(rank, suit);
  return `<defs><clipPath id="${clip}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/></clipPath></defs>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#fbf3df"/>` +
    `<g clip-path="url(#${clip})">${half}<g transform="rotate(180 100 140)">${half}</g></g>` +
    // Divider between the two heads: diagonal sash, as on traditional double-headed courts
    `<path d="M${x} 146L${x + w} 134" stroke="${C.goldDark}" stroke-width="1.6"/>` +
    // Double frame
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="none" stroke="${C.goldDark}" stroke-width="2"/>` +
    `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="3" fill="none" stroke="${col.p}" stroke-width="1" stroke-opacity=".7"/>`;
}

// --- Joker -----------------------------------------------------------------

function jokerArt(red, prefix) {
  const ink = `stroke="${C.black}" stroke-width="1.1" stroke-linejoin="round"`;
  const [c1, c2, c3] = red ? [C.red, C.blue, C.gold] : [C.purple, C.green, C.gold];
  const out = [];

  // Sunburst behind the jester
  let rays = '';
  for (let i = 0; i < 24; i++) {
    const a0 = (i * 15) * Math.PI / 180, a1 = ((i * 15) + 7.5) * Math.PI / 180;
    if (i % 2) continue;
    rays += `M100 146L${n(100 + 80 * Math.cos(a0))} ${n(146 + 80 * Math.sin(a0))}L${n(100 + 80 * Math.cos(a1))} ${n(146 + 80 * Math.sin(a1))}Z`;
  }
  const clip = `${prefix}-jclip`;
  out.push(`<defs><clipPath id="${clip}"><circle cx="100" cy="146" r="70"/></clipPath>` +
    `<radialGradient id="${prefix}-jg"><stop offset="0" stop-color="${C.goldLight}" stop-opacity=".9"/><stop offset="1" stop-color="${C.goldLight}" stop-opacity="0"/></radialGradient></defs>`);
  out.push(`<circle cx="100" cy="146" r="70" fill="url(#${prefix}-jg)"/>`);
  out.push(`<path d="${rays}" fill="${C.gold}" fill-opacity=".22" clip-path="url(#${clip})"/>`);

  const figStart = out.length;
  // Body: motley tunic split in two colours with gold diamonds down the middle
  out.push(`<path d="M80 178H100V236H66Z" fill="${c1}" ${ink}/><path d="M100 178H120L134 236H100Z" fill="${c2}" ${ink}/>`);
  for (let y = 188; y < 236; y += 14) out.push(pip('D', 100, y, 13, c3, false, ` stroke="${C.goldDark}" stroke-width="5"`));
  // Arms with bells
  out.push(`<path d="M80 180L62 206L68 211L84 192Z" fill="${c2}" ${ink}/><path d="M120 180L138 206L132 211L116 192Z" fill="${c1}" ${ink}/>`);
  out.push(`<circle cx="64" cy="210" r="4.5" fill="${C.skin}" stroke="${C.skinLine}"/><circle cx="136" cy="210" r="4.5" fill="${C.skin}" stroke="${C.skinLine}"/>`);

  // Ruffled collar: alternating triangles
  let ruff = '';
  for (let i = 0; i < 8; i++) {
    const x0 = 76 + i * 6;
    ruff += `<path d="M${x0} 168L${x0 + 6} 168L${x0 + 3} 184Z" fill="${[c1, c3, c2][i % 3]}" ${ink}/>`;
  }
  out.push(`<rect x="94" y="160" width="12" height="10" fill="${C.skin}"/>`, ruff);

  // Head
  out.push(`<circle cx="100" cy="148" r="19" fill="${C.skin}" stroke="${C.skinLine}" stroke-width="1.2"/>`);
  // Face: happy closed eyes, rosy cheeks, red nose, wide grin
  out.push(
    `<path d="M90 145q3.5 -4 7 0M103 145q3.5 -4 7 0" fill="none" stroke="${C.black}" stroke-width="1.6" stroke-linecap="round"/>`,
    `<circle cx="89" cy="153" r="3.4" fill="${C.red}" fill-opacity=".3"/><circle cx="111" cy="153" r="3.4" fill="${C.red}" fill-opacity=".3"/>`,
    `<path d="M91 156Q100 166 109 156Q100 160 91 156Z" fill="${C.redDark}" stroke="${C.black}" stroke-width="1" stroke-linejoin="round"/>`,
    `<circle cx="100" cy="151" r="3" fill="${C.red}"/>`,
    pip('D', 95, 139, 5, C.black), pip('D', 105, 139, 5, C.black),
  );

  // Three-pointed jester hat with bells
  out.push(
    `<path d="M82 140C76 120 70 104 62 92C78 98 90 112 96 132Z" fill="${c1}" ${ink}/>`,
    `<path d="M118 140C124 120 130 104 138 92C122 98 110 112 104 132Z" fill="${c2}" ${ink}/>`,
    `<path d="M88 136C88 112 92 90 100 70C108 90 112 112 112 136Z" fill="${c3}" ${ink}/>`,
    `<path d="M81 141C86 132 114 132 119 141L117 133C112 127 88 127 83 133Z" fill="${C.white}" ${ink}/>`,
  );
  for (const [bx, by] of [[62, 92], [100, 70], [138, 92]]) {
    out.push(`<circle cx="${bx}" cy="${by}" r="5.2" fill="${C.goldLight}" stroke="${C.goldDark}" stroke-width="1.2"/><path d="M${bx - 2} ${by + 1.5}h4" stroke="${C.goldDark}" stroke-width="1"/>`);
  }

  // Enlarge the whole jester a little around its head
  const fig = out.splice(figStart).join('');
  out.push(`<g transform="translate(100 150) scale(1.14) translate(-100 -150)">${fig}</g>`);

  // Sparkles
  for (const [sx, sy, sr] of [[74, 60, 7], [128, 62, 5], [70, 248, 5], [134, 246, 7], [60, 168, 4], [142, 172, 4]]) {
    out.push(`<path d="${starPath(sx, sy, sr, sr * 0.42, 5)}" fill="${C.gold}" stroke="${C.goldDark}" stroke-width=".6"/>`);
  }

  // "CORINGA" running down the right side (and rotated on the left)
  const word = `<text x="0" y="0" transform="translate(166 18) rotate(90)" font-family="${SERIF}" font-weight="700" ` +
    `font-size="21" letter-spacing="4.5" fill="${red ? C.red : C.black}">CORINGA</text>`;
  out.push(word, `<g transform="rotate(180 100 140)">${word}</g>`);
  return out.join('');
}

/** Joker corner index: "JK" over a star. */
function jokerIndex(color) {
  const g = rankText('JK', 25, 60, 58, color, 44) + pip('X', 25, 91, 42, color);
  return `<g>${g}</g><g transform="rotate(180 100 140)">${g}</g>`;
}

/**
 * Full card face as a self-contained SVG string (viewBox 0 0 200 280).
 * @param {string} id e.g. 'H13a', 'S01b', 'X00c'
 * @returns {string}
 */
export function cardFaceSVG(id) {
  const card = parseId(id);
  const prefix = uid(`c${String(id).replace(/[^\w-]/g, '')}`);
  let body;
  if (card.joker) {
    const red = jokerIsRed(card.copy);
    body = jokerArt(red, prefix) + jokerIndex(red ? C.red : C.black);
  } else {
    const { suit, rank } = card;
    const color = SUIT_COLORS[suit] || C.black;
    const label = RANK_LABELS[rank] || '?';
    let center;
    if (rank === 1) center = acePip(suit, color);
    else if (rank >= 11) center = courtFigure(rank, suit, prefix);
    else center = numberPips(rank, suit, color);
    body = center + bothIndices(label, suit, color);
  }
  return svgOpen(W, H, ariaName(card)) + cardBody(W, H, 14) + body + '</svg>';
}

// ---------------------------------------------------------------------------
// Card backs
// ---------------------------------------------------------------------------

const BACK_STYLES = {
  blue: { base: '#1d3f8f', line: '#7fa2ea', dark: '#122a63', accent: '#f1d27a' },
  red: { base: '#a3171f', line: '#ef8c8f', dark: '#6d0e14', accent: '#f1d27a' },
  green: { base: '#1d6b3a', line: '#86d39f', dark: '#0f4523', accent: '#f1d27a' },
  black: { base: '#25262b', line: '#8b8f9c', dark: '#111215', accent: '#d9b866' },
};

/**
 * Card back as a self-contained SVG string (viewBox 0 0 200 280).
 * @param {'blue'|'red'|'green'|'black'} [style='blue']
 */
export function cardBackSVG(style = 'blue') {
  const k = BACK_STYLES[style] || BACK_STYLES.blue;
  const p = uid(`back-${style}`);
  const pat = `${p}-lat`;
  const gr = `${p}-glow`;
  const defs =
    `<defs>` +
    // Diamond lattice: a square tile rotated 45°, with rosettes at crossings
    `<pattern id="${pat}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45 100 140)">` +
    `<rect width="14" height="14" fill="${k.base}"/>` +
    `<path d="M0 0H14M0 0V14" stroke="${k.line}" stroke-width="1.1" stroke-opacity=".75"/>` +
    `<path d="M0 7H14M7 0V14" stroke="${k.dark}" stroke-width=".8" stroke-opacity=".6"/>` +
    `<circle cx="0" cy="0" r="1.9" fill="${k.line}"/><circle cx="14" cy="0" r="1.9" fill="${k.line}"/>` +
    `<circle cx="0" cy="14" r="1.9" fill="${k.line}"/><circle cx="14" cy="14" r="1.9" fill="${k.line}"/>` +
    `<rect x="5.6" y="5.6" width="2.8" height="2.8" fill="${k.accent}" fill-opacity=".55"/>` +
    `</pattern>` +
    `<radialGradient id="${gr}" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>` +
    `</defs>`;

  // Central medallion: oval with beaded ring and the four suits in white
  const beads = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return `<circle cx="${n(100 + 42 * Math.cos(a))}" cy="${n(140 + 54 * Math.sin(a))}" r="1.6" fill="${k.accent}"/>`;
  }).join('');
  const suits = [['S', 100, 112], ['H', 128, 140], ['C', 100, 168], ['D', 72, 140]]
    .map(([s, x, y]) => pip(s, x, y, 20, C.white)).join('');
  const medallion =
    `<ellipse cx="100" cy="140" rx="50" ry="63" fill="${k.dark}" stroke="${C.white}" stroke-width="3"/>` +
    `<ellipse cx="100" cy="140" rx="46" ry="58.5" fill="${k.base}" stroke="${k.accent}" stroke-width="1"/>` +
    beads +
    `<ellipse cx="100" cy="140" rx="35" ry="45" fill="none" stroke="${k.line}" stroke-width="1" stroke-opacity=".7"/>` +
    suits +
    pip('D', 100, 140, 14, k.accent);

  // Corner fans
  const corner = (x, y, rot) =>
    `<g transform="translate(${x} ${y}) rotate(${rot})">` +
    `<path d="M0 0H26A26 26 0 0 1 0 26Z" fill="${k.dark}" stroke="${C.white}" stroke-width="1.5"/>` +
    `<path d="M0 0H16A16 16 0 0 1 0 16Z" fill="none" stroke="${k.accent}" stroke-width="1"/>` +
    `<circle cx="7" cy="7" r="2.6" fill="${k.accent}"/></g>`;

  return svgOpen(W, H, 'Verso da carta') + defs +
    `<rect x="1" y="1" width="198" height="278" rx="14" fill="${C.white}" stroke="${C.edge}" stroke-width="2"/>` +
    `<rect x="11" y="11" width="178" height="258" rx="8" fill="url(#${pat}) ${k.base}"/>` +
    `<rect x="11" y="11" width="178" height="258" rx="8" fill="url(#${gr}) transparent"/>` +
    `<rect x="17" y="17" width="166" height="246" rx="5" fill="none" stroke="${C.white}" stroke-width="2.2" stroke-opacity=".9"/>` +
    `<rect x="21" y="21" width="158" height="238" rx="3" fill="none" stroke="${k.accent}" stroke-width="1" stroke-opacity=".8"/>` +
    corner(21, 21, 0) + corner(179, 21, 90) + corner(179, 259, 180) + corner(21, 259, 270) +
    medallion +
    `<rect x="11" y="11" width="178" height="258" rx="8" fill="none" stroke="${k.dark}" stroke-width="1.5"/>` +
    '</svg>';
}

// ---------------------------------------------------------------------------
// Mini card (100 × 140) for table melds
// ---------------------------------------------------------------------------

/**
 * Compact card for heavily overlapped melds: huge rank + suit in the left strip.
 * @param {string} id
 */
export function cardMiniSVG(id) {
  const card = parseId(id);
  const w = 100, h = 140;
  let color, label, suit;
  if (card.joker) {
    color = jokerIsRed(card.copy) ? C.red : C.black;
    label = 'JK';
    suit = 'X';
  } else {
    suit = card.suit;
    color = SUIT_COLORS[suit] || C.black;
    label = RANK_LABELS[card.rank] || '?';
  }
  const wide = label.length > 1;
  const fit = wide ? ` textLength="${label === 'JK' ? 44 : 46}" lengthAdjust="spacingAndGlyphs"` : '';
  const court = !card.joker && card.rank >= 11;
  // Courts and jokers get a gold accent bar on the right so they stand out when fully shown.
  const accent = court || card.joker
    ? `<rect x="88" y="10" width="5" height="120" rx="2.5" fill="${C.gold}" fill-opacity=".8"/>`
    : '';
  const big = card.joker
    ? pip('X', 70, 104, 46, C.gold, false, ` stroke="${C.goldDark}" stroke-width="3"`)
    : pip(suit, 68, 104, 48, color, false, ' fill-opacity=".2"');
  return svgOpen(w, h, ariaName(card)) +
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="9" fill="${C.ivory}" stroke="${C.edge}" stroke-width="2"/>` +
    big + accent +
    `<text x="27" y="52" font-family="${SERIF}" font-weight="700" font-size="${wide ? 50 : 56}" text-anchor="middle" fill="${color}"${fit}>${label}</text>` +
    pip(suit, 27, 78, 38, color) +
    '</svg>';
}

// ---------------------------------------------------------------------------
// Table felt
// ---------------------------------------------------------------------------

// Fine felt grain: fractal noise rendered as a tiling SVG (alpha-only speckle).
const NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E" +
  "%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E" +
  "%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 -.12'/%3E%3C/filter%3E" +
  "%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Soft diagonal weave so the felt doesn't look like flat plastic.
const WEAVE =
  'repeating-linear-gradient(45deg, rgba(255,255,255,.018) 0 2px, rgba(0,0,0,.018) 2px 4px)';

function felt(center, mid, edge) {
  return `${NOISE_URI}, ${WEAVE}, radial-gradient(ellipse at 50% 42%, ${center} 0%, ${mid} 55%, ${edge} 100%)`;
}

/** CSS `background` values for the table felt, by theme. */
export const FELT_THEMES = Object.freeze({
  green: felt('#2f8f4e', '#1d6b37', '#0b3b1d'),
  blue: felt('#2f6ea8', '#1d4f84', '#0c2849'),
  wine: felt('#9a2f45', '#702034', '#3a0d19'),
});

const WOOD =
  'repeating-linear-gradient(92deg, rgba(255,255,255,.05) 0 3px, rgba(0,0,0,.06) 3px 7px, rgba(255,255,255,0) 7px 13px),' +
  ' repeating-linear-gradient(88deg, rgba(60,25,5,.25) 0 1px, rgba(0,0,0,0) 1px 19px),' +
  ' linear-gradient(180deg, #8a4f24 0%, #6b3716 45%, #4e260d 100%)';

/**
 * CSS for the game table. Use `.table-rim` (wooden frame) around `.table-felt`.
 * Switch felt colour with `data-felt="green|blue|wine"` on any ancestor (or the
 * element itself), or set `--felt-bg` directly to a FELT_THEMES value.
 * @param {'green'|'blue'|'wine'} [theme='green'] default theme for :root
 */
export function tableFeltCSS(theme = 'green') {
  const def = FELT_THEMES[theme] || FELT_THEMES.green;
  const variants = Object.entries(FELT_THEMES)
    .map(([name, bg]) => `[data-felt="${name}"]{--felt-bg:${bg};}`)
    .join('\n');
  return `:root{
  --felt-bg:${def};
  --wood-bg:${WOOD};
  --felt-shadow:inset 0 0 0 1px rgba(0,0,0,.35), inset 0 2px 30px rgba(0,0,0,.45), inset 0 0 120px rgba(0,0,0,.35);
}
${variants}
.table-felt{
  background:var(--felt-bg);
  background-size:180px 180px, auto, cover;
  box-shadow:var(--felt-shadow);
  border-radius:18px;
}
.table-rim{
  padding:12px;
  border-radius:28px;
  background:var(--wood-bg);
  box-shadow:0 10px 30px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,220,170,.35), inset 0 -2px 4px rgba(0,0,0,.45);
}
.table-rim > .table-felt{border-radius:18px;}`;
}
