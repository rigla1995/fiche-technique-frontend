// Couche « ocr » de la lecture de la patente (lot 3, étape 7) : traitements de pixels.
// Fonctions PURES sur des tableaux, sans DOM ni tesseract : elles se testent par « node --test » et tournent telles
// quelles dans le navigateur (le canvas ne sert qu'à découper et à rééchantillonner — voir lireOcr.ts).
// Convention : 0 = encre noire, 255 = papier blanc.

/** Image en mémoire : RGBA (4 octets par pixel, comme ImageData) ou niveaux de gris (1 octet par pixel). */
export interface Pixels {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** Cadre en pixels, bornes comprises. */
export interface Cadre {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** `max` efface les encres colorées (tampons bleus) et garde le noir ; `rouge` contraste un texte blanc sur fond bleu. */
export type Canal = 'luminance' | 'max' | 'rouge';

/** RGBA → gris. La transparence est toujours aplatie sur fond blanc (une image couleur passée telle quelle ne se lit pas). */
export function gris(rgba: Pixels, canal: Canal = 'luminance'): Pixels {
  const n = rgba.width * rgba.height;
  const d = rgba.data;
  const data = new Uint8ClampedArray(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let r = d[p], v = d[p + 1], b = d[p + 2];
    const a = d[p + 3];
    if (a < 255) {
      const blanc = 255 - a;
      r = (r * a) / 255 + blanc; v = (v * a) / 255 + blanc; b = (b * a) / 255 + blanc;
    }
    data[i] = canal === 'max' ? Math.max(r, v, b) : canal === 'rouge' ? r : 0.299 * r + 0.587 * v + 0.114 * b;
  }
  return { data, width: rgba.width, height: rgba.height };
}

export function inverser(image: Pixels): Pixels {
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < data.length; i++) data[i] = 255 - image.data[i];
  return { data, width: image.width, height: image.height };
}

/** Étirement du contraste entre deux centiles (1 % et 99 % par défaut). */
export function etirer(image: Pixels, part = 0.01): Pixels {
  const g = image.data;
  const n = g.length;
  const histogramme = new Uint32Array(256);
  for (let i = 0; i < n; i++) histogramme[g[i]]++;
  let cumul = 0, bas = 0, haut = 255;
  for (let i = 0; i < 256; i++) { cumul += histogramme[i]; if (cumul >= n * part) { bas = i; break; } }
  cumul = 0;
  for (let i = 255; i >= 0; i--) { cumul += histogramme[i]; if (cumul >= n * part) { haut = i; break; } }
  const etendue = Math.max(1, haut - bas);
  const data = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) data[i] = ((g[i] - bas) * 255) / etendue;
  return { data, width: image.width, height: image.height };
}

/** Seuil d'Otsu : le niveau qui sépare le mieux l'encre du papier. */
export function seuilOtsu(image: Pixels): number {
  const g = image.data;
  const n = g.length;
  const histogramme = new Float64Array(256);
  for (let i = 0; i < n; i++) histogramme[g[i]]++;
  let somme = 0;
  for (let i = 0; i < 256; i++) somme += i * histogramme[i];
  let sommeFond = 0, poidsFond = 0, meilleur = 0, seuil = 128;
  for (let i = 0; i < 256; i++) {
    poidsFond += histogramme[i];
    if (!poidsFond) continue;
    const poidsForme = n - poidsFond;
    if (!poidsForme) break;
    sommeFond += i * histogramme[i];
    const ecart = sommeFond / poidsFond - (somme - sommeFond) / poidsForme;
    const variance = poidsFond * poidsForme * ecart * ecart;
    if (variance > meilleur) { meilleur = variance; seuil = i; }
  }
  return seuil;
}

/** Noir et blanc : au-dessus du seuil → 255, sinon 0. */
export function binariser(image: Pixels, seuil: number): Pixels {
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < data.length; i++) data[i] = image.data[i] > seuil ? 255 : 0;
  return { data, width: image.width, height: image.height };
}

/** Seuil local de Sauvola (images intégrales) : tient face à une ombre ou à un éclairage inégal. */
export function sauvola(image: Pixels, fenetre = 31, k = 0.2, R = 128): Pixels {
  const { data: g, width: w, height: h } = image;
  const W = w + 1;
  const I = new Float64Array(W * (h + 1)), I2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0, s2 = 0;
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x];
      s += v; s2 += v * v;
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + s;
      I2[(y + 1) * W + x + 1] = I2[y * W + x + 1] + s2;
    }
  }
  const r = fenetre >> 1;
  const data = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      const A = y0 * W + x0, B = y0 * W + x1 + 1, C = (y1 + 1) * W + x0, D = (y1 + 1) * W + x1 + 1;
      const s = I[D] - I[B] - I[C] + I[A];
      const s2 = I2[D] - I2[B] - I2[C] + I2[A];
      const moyenne = s / n, ecartType = Math.sqrt(Math.max(0, s2 / n - moyenne * moyenne));
      data[y * w + x] = g[y * w + x] > moyenne * (1 + k * (ecartType / R - 1)) ? 255 : 0;
    }
  }
  return { data, width: w, height: h };
}

export interface SansFilets {
  image: Pixels;
  /** Ordonnée du filet horizontal le plus BAS (les valeurs du tableau sont imprimées à cheval dessus), ou null. */
  filetBas: number | null;
  /** Épaisseur au-delà de laquelle un trait n'est plus un filet mais un jambage de caractère. */
  epaisseur: number;
}

/**
 * Retire les filets d'un tableau sur une image noir et blanc. Un pixel est un filet s'il appartient à une longue trace
 * ET si le trait y est fin : plus épais, c'est un jambage de caractère qui traverse le filet, on le garde. Le calcul
 * par traces supporte une photo un peu de travers (le filet change de rangée de pixels).
 */
export function retirerFilets(bin: Pixels): SansFilets {
  const { data, width: w, height: h } = bin;
  const sortie = Uint8ClampedArray.from(data);
  const noir = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 0;
  const epaisseurVerticale = (x: number, y: number): number => {
    let a = y, b = y;
    while (noir(x, a - 1)) a--;
    while (noir(x, b + 1)) b++;
    return b - a + 1;
  };
  // Filets horizontaux.
  const longueurMin = Math.max(40, 0.06 * w);
  const traces: number[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!noir(x, y)) { x++; continue; }
      let fin = x;
      while (noir(fin + 1, y)) fin++;
      if (fin - x + 1 > longueurMin) for (let k = x; k <= fin; k++) traces.push(y * w + k);
      x = fin + 1;
    }
  }
  const epaisseurs = traces.map((p) => epaisseurVerticale(p % w, (p / w) | 0));
  const tri = [...epaisseurs].sort((a, b) => a - b);
  const epaisseur = (tri[Math.floor(tri.length / 2)] || 3) + 2;
  traces.forEach((p, i) => { if (epaisseurs[i] <= epaisseur) sortie[p] = 255; });
  const parRangee = new Uint32Array(h);
  for (const p of traces) parRangee[(p / w) | 0]++;
  let filetBas: number | null = null;
  for (let y = h - 1; y >= 0; y--) {
    if (parRangee[y] > 0.15 * w) {
      let a = y;
      while (a > 0 && parRangee[a - 1] > 0.15 * w) a--;
      filetBas = (a + y) / 2;
      break;
    }
  }
  // Filets verticaux, sur l'image déjà débarrassée des filets horizontaux (l'effacement se lit au fur et à mesure).
  const noir2 = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && sortie[y * w + x] === 0;
  const epaisseurHorizontale = (x: number, y: number): number => {
    let a = x, b = x;
    while (noir2(a - 1, y)) a--;
    while (noir2(b + 1, y)) b++;
    return b - a + 1;
  };
  const hauteurMin = 0.4 * h;
  const tracesV: number[] = [];
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!noir2(x, y)) { y++; continue; }
      let fin = y;
      while (noir2(x, fin + 1)) fin++;
      if (fin - y + 1 > hauteurMin) for (let k = y; k <= fin; k++) tracesV.push(k * w + x);
      y = fin + 1;
    }
  }
  const triV = tracesV.map((p) => epaisseurHorizontale(p % w, (p / w) | 0)).sort((a, b) => a - b);
  const epaisseurV = (triV[Math.floor(triV.length / 2)] || 3) + 2;
  for (const p of tracesV) if (epaisseurHorizontale(p % w, (p / w) | 0) <= epaisseurV) sortie[p] = 255;
  return { image: { data: sortie, width: w, height: h }, filetBas, epaisseur };
}

export interface Glyphes {
  /** Image blanche où ne restent que les glyphes gardés. */
  image: Pixels;
  /** Cadres des glyphes gardés, de gauche à droite. */
  glyphes: Cadre[];
  hauteurGlyphe: number;
}

/**
 * Composantes connexes (8 voisins) : ne garde que les « caractères », de hauteur proche de la hauteur courante, ce qui
 * élimine les restes de filets et la poussière. Si l'on connaît le filet du bas, seules les composantes À CHEVAL sur lui
 * sont des valeurs : le texte d'une autre rangée, entré par un cadrage trop large, est écarté.
 */
export function garderGlyphes(bin: Pixels, filetBas: number | null = null, tolerance = 4): Glyphes {
  const { data, width: w, height: h } = bin;
  const etiquette = new Int32Array(w * h).fill(-1);
  const composantes: (Cadre & { n: number; haut: number; large: number })[] = [];
  const pile: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (data[i] !== 0 || etiquette[i] !== -1) continue;
    const id = composantes.length;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
    etiquette[i] = id;
    pile.push(i);
    while (pile.length) {
      const p = pile.pop() as number;
      const x = p % w, y = (p / w) | 0;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (data[q] === 0 && etiquette[q] === -1) { etiquette[q] = id; pile.push(q); }
        }
      }
    }
    composantes.push({ x0, y0, x1, y1, n, haut: y1 - y0 + 1, large: x1 - x0 + 1 });
  }
  const aCheval = (c: Cadre): boolean => filetBas == null || (c.y0 <= filetBas + tolerance && c.y1 >= filetBas - tolerance);
  const hauteurs = composantes.filter((c) => c.n > 30 && c.large > 4 && c.haut > 8 && aCheval(c)).map((c) => c.haut).sort((a, b) => a - b);
  const hauteurGlyphe = hauteurs.length ? hauteurs[Math.floor(hauteurs.length * 0.75)] : 20;
  const garde = composantes.map((c) => aCheval(c) && c.large >= 0.12 * hauteurGlyphe && c.haut >= 0.7 * hauteurGlyphe
    && c.haut <= 1.5 * hauteurGlyphe && c.large <= 4 * hauteurGlyphe && !(c.large < 0.12 * c.haut && c.haut > 1.2 * hauteurGlyphe));
  const sortie = new Uint8ClampedArray(w * h).fill(255);
  for (let i = 0; i < w * h; i++) if (etiquette[i] >= 0 && garde[etiquette[i]]) sortie[i] = 0;
  const glyphes = composantes.filter((_, i) => garde[i]).map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 })).sort((a, b) => a.x0 - b.x0);
  return { image: { data: sortie, width: w, height: h }, glyphes, hauteurGlyphe };
}

/** Bande du matricule en gris (canal max) → glyphes des valeurs : noir et blanc, filets retirés, glyphes à cheval sur le filet. */
export function nettoyerBande(bande: Pixels, binarisation: 'otsu' | 'sauvola'): Glyphes {
  const bin = binarisation === 'sauvola'
    ? sauvola(bande, Math.max(15, Math.round(bande.height * 0.35)) | 1, 0.25)
    : binariser(bande, seuilOtsu(bande));
  const sansFilets = retirerFilets(bin);
  return garderGlyphes(sansFilets.image, sansFilets.filetBas, sansFilets.epaisseur + 2);
}

/** Glyphes rangés de gauche à droite, coupés aux plus grands espaces : `nombre` jetons (les valeurs d'une rangée). */
export function couperEnJetons(glyphes: Cadre[], nombre: number): Cadre[][] {
  const tries = [...glyphes].sort((a, b) => a.x0 - b.x0);
  const coupes = tries.slice(1)
    .map((g, i) => ({ i: i + 1, espace: g.x0 - tries[i].x1 }))
    .sort((a, b) => b.espace - a.espace)
    .slice(0, nombre - 1)
    .map((c) => c.i)
    .sort((a, b) => a - b);
  const jetons: Cadre[][] = [];
  let debut = 0;
  for (const fin of [...coupes, tries.length]) { jetons.push(tries.slice(debut, fin)); debut = fin; }
  return jetons;
}

/** Recadre l'image nettoyée sur un groupe de glyphes, avec une marge blanche (tesseract lit mal un glyphe collé au bord). */
export function decouperGlyphes(image: Pixels, glyphes: Cadre[], marge = 25): Pixels {
  const X0 = Math.min(...glyphes.map((c) => c.x0)), X1 = Math.max(...glyphes.map((c) => c.x1));
  const Y0 = Math.min(...glyphes.map((c) => c.y0)), Y1 = Math.max(...glyphes.map((c) => c.y1));
  const width = X1 - X0 + 1 + 2 * marge, height = Y1 - Y0 + 1 + 2 * marge;
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      if (image.data[y * image.width + x] === 0) data[(y - Y0 + marge) * width + (x - X0 + marge)] = 0;
    }
  }
  return { data, width, height };
}

/** Gris → RGBA opaque (pour repasser par un canvas). */
export function versRgba(image: Pixels): Uint8ClampedArray<ArrayBuffer> {
  const n = image.width * image.height;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    data[p] = data[p + 1] = data[p + 2] = image.data[i];
    data[p + 3] = 255;
  }
  return data;
}
