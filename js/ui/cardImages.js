// Converte a arte SVG das cartas em URLs de imagem (data URI), com cache.
// Usar <img> isola cada SVG (sem conflito de ids) e deixa o navegador reaproveitar a imagem.

import { cardFaceSVG, cardBackSVG, cardMiniSVG } from './cardArt.js';

const cache = new Map();
const toUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

function cached(key, make) {
  let url = cache.get(key);
  if (!url) {
    url = toUrl(make());
    cache.set(key, url);
  }
  return url;
}

export const faceUrl = (id) => cached('f' + id, () => cardFaceSVG(id));
export const miniUrl = (id) => cached('m' + id, () => cardMiniSVG(id));
export const backUrl = (style = 'blue') => cached('b' + style, () => cardBackSVG(style));
