// Lecture de l'en-tête d'une facture (étape F2) : des rangées de la page aux valeurs de l'en-tête. Fonctions PURES.
// Ce qui est cherché : le fournisseur (matricule fiscal, nom, adresse, téléphone, email), le numéro et la date de la
// facture, ses totaux (HT, remise, FODEC, TVA par taux, timbre, TTC). Méthode, sans IA : des libellés connus (« Facture
// N° », « Date », « Total HT », « Net à payer »…), la valeur à DROITE du libellé, ou SOUS lui quand la facture les
// présente en tableau ; des contrôles (clé du matricule, date plausible, HT + FODEC + TVA + timbre = TTC).
// Le matricule et le nom du CLIENT, imprimés comme destinataire, ne sont jamais pris pour ceux du fournisseur.
import { cleAttendue, corrigerChiffres } from '../../../admin/patente/ocr/matricule.ts';
import { datesDuTexte, millime, nombresDeRangee } from './nombres.ts';
import type { NombreLu } from './nombres.ts';
import { motA, rangee, segments } from './rangees.ts';
import { nomComparable } from './rapprocher.ts';
import type { Destinataire, EnteteLu, PageLue, Rangee, SourceLue, TotauxLus, TvaLue, ValeurLue } from './types.ts';

/** Texte comparable : sans accents, en minuscules, espaces réduits. */
export const plat = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Toutes les rangées, page après page, avec leur place.
interface Place { r: Rangee; page: number; i: number; hauteurPage: number }
const toutes = (pages: readonly PageLue[]): Place[] =>
  pages.flatMap((p, k) => p.rangees.map((r, i) => ({ r, page: k + 1, i, hauteurPage: p.hauteur })));

// ── Matricule fiscal ────────────────────────────────────────────────────────────────────────────────────────────────

/** Matricule vu sur la page. `cle` : la lettre-clé est celle que donnent les 7 chiffres (calcul modulo 23). */
export interface MatriculeVu {
  valeur: string;
  identifiant: string;
  cle: boolean;
  complet: boolean;
  place: Place;
  x0: number;
  x1: number;
  /** Imprimé dans le bloc du client (« Client : », « Doit : », « Facturé à »). */
  duClient: boolean;
  /** Position dans le texte de la rangée. */
  index: number;
  /** Imprimé avec 6 chiffres (« 846003D/N/M/000 ») : le zéro de tête, omis par l'émetteur, a été remis. */
  sixChiffres: boolean;
}

const LIBELLE_MF = /(m\s?\.?\s?f\b|matricule|mat\s?\.?\s?fisc|identifiant\s+(fiscal|unique)|code\s+t\.?\s?v\.?\s?a|i\.?\s?f\.?\s?:|n[°ºo]?\s*fiscal|\bt\.?v\.?a\s*:)/i;
const BLOC_CLIENT = /((?<!\bm(?:r|me|\.)\s*)\b(clients?|doit|destinataire|acheteur)\b|\bfactur[ée]e?\s+[àa](?=\s|:|$)|\badress[ée]e?\s+[àa](?=\s|:|$)|\blivr[ée]e?\s+[àa](?=\s|:|$))/i;
const SEP = String.raw`\s?[/|\\.\- ]?\s?`;

function matriculesDeRangee(p: Place, ocr: boolean, libelleProche: boolean): Omit<MatriculeVu, 'duClient'>[] {
  const texte = p.r.texte.toUpperCase();
  // Pour une image, les chiffres confondus (O, I, S, B…) sont admis puis corrigés ; pour un PDF, des chiffres seulement.
  const D = ocr ? '[0-9OQDIL|SBGZT]' : '[0-9]';
  // Identifiant de 7 chiffres, ou de 6 : un ancien matricule s'imprime souvent sans son zéro de tête (« 846003D/N/M/000 »
  // pour 0846003D) ; la lettre-clé se calcule alors sur les 7 chiffres, zéro compris.
  const formes = [7, 6].flatMap((n) => [
    { n, complet: true, motif: new RegExp(String.raw`(?<![0-9A-Z])(${D}{${n}})\s?[/]?\s?([A-Z])${SEP}([A-Z])${SEP}([A-Z])${SEP}(${D}{3})(?![0-9])`, 'g') },
    // Forme courte (« 1234567A ») : seulement près d'un libellé de matricule, sinon un numéro quelconque passerait.
    ...(libelleProche ? [{ n, complet: false, motif: new RegExp(String.raw`(?<![0-9A-Z/])(${D}{${n}})\s?/?\s?([A-Z])(?![A-Z0-9])`, 'g') }] : []),
  ]);
  const candidats: (Omit<MatriculeVu, 'duClient'> & { longueur: number })[] = [];
  for (const { n, complet, motif } of formes) {
    for (const m of texte.matchAll(motif)) {
      const brut = corrigerChiffres(m[1]);
      const fin = complet ? `${m[3]}/${m[4]}/${corrigerChiffres(m[5])}` : null;
      if (!new RegExp(String.raw`^\d{${n}}$`).test(brut) || (fin && !/^\d{3}$/.test(fin.slice(4)))) continue;
      const identifiant = brut.padStart(7, '0');
      // Forme courte à 6 chiffres : seulement si sa lettre-clé est juste (sinon « Capital : 150000 D », un agrément…).
      if (n === 6 && !complet && cleAttendue(identifiant) !== m[2]) continue;
      const index = m.index ?? 0;
      const de = motA(p.r, index), a = motA(p.r, index + m[0].length - 1);
      candidats.push({
        valeur: fin ? `${identifiant}${m[2]}/${fin}` : `${identifiant}${m[2]}`, identifiant, cle: cleAttendue(identifiant) === m[2],
        complet, place: p, x0: p.r.mots[de].x0, x1: p.r.mots[a].x1, index, sixChiffres: n === 6, longueur: m[0].length,
      });
    }
  }
  // Deux lectures du même texte (« 846003D/N » vaut 846003D/N/M/000 à 6 chiffres, ou 8460030N à 7, D pris pour un 0) :
  // la forme complète d'abord, puis celle dont la lettre-clé est juste, puis 7 chiffres.
  candidats.sort((x, y) => Number(y.complet) - Number(x.complet) || Number(y.cle) - Number(x.cle) || Number(x.sixChiffres) - Number(y.sixChiffres));
  const res: Omit<MatriculeVu, 'duClient'>[] = [];
  const pris: [number, number][] = [];
  for (const { longueur, ...c } of candidats) {
    if (pris.some(([a, b]) => c.index < b && c.index + longueur > a)) continue;
    pris.push([c.index, c.index + longueur]);
    res.push(c);
  }
  return res.sort((x, y) => x.index - y.index);
}

/** Matricules de la facture, avec, pour chacun, s'il est imprimé dans le bloc du client. */
export function matriculesVus(pages: readonly PageLue[], source: SourceLue): MatriculeVu[] {
  const places = toutes(pages);
  const vus: MatriculeVu[] = [];
  places.forEach((p, k) => {
    const prec = places[k - 1];
    const libelleProche = LIBELLE_MF.test(p.r.texte) || Boolean(prec && prec.page === p.page && LIBELLE_MF.test(prec.r.texte));
    for (const m of matriculesDeRangee(p, source === 'ocr', libelleProche)) {
      // Bloc du client : libellé sur la même rangée, à gauche du matricule, ou sur l'une des 6 rangées au-dessus, dans
      // la même colonne (un bloc d'adresse compte rarement plus de lignes).
      const avant = p.r.texte.slice(0, m.index);
      let duClient = BLOC_CLIENT.test(avant);
      for (let j = 1; !duClient && j <= 6; j++) {
        const q = places[k - j];
        if (!q || q.page !== p.page) break;
        const colonne = q.r.mots.filter((w) => w.x1 > m.x0 - 3 * p.r.hauteur && w.x0 < m.x1 + 3 * p.r.hauteur);
        if (colonne.some((_, n) => BLOC_CLIENT.test(colonne.slice(n, n + 3).map((x) => x.t).join(' ')))) duClient = true;
        // un autre libellé de fournisseur ou de facture, au-dessus, ferme la recherche
        if (/\b(fournisseur|vendeur|emetteur|émetteur)\b/i.test(q.r.texte)) break;
      }
      vus.push({ ...m, duClient });
    }
  });
  return vus;
}

const memeEntreprise = (a: string, b: string | null | undefined): boolean =>
  Boolean(b) && a.slice(0, 7) === String(b).replace(/[^0-9A-Z]/gi, '').slice(0, 7);

// ── Nom, adresse, téléphone, email du fournisseur ───────────────────────────────────────────────────────────────────

// Limite de mot qui connaît les lettres accentuées (« \b » de JavaScript s'arrête avant « é » : « SOCIÉTÉ » ne finissait
// pas par une limite de mot).
const B = String.raw`(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))`;
const motif = (r: RegExp): RegExp => new RegExp(r.source.replaceAll(String.raw`\b`, B), `${r.flags}u`);
const FORME = motif(/\b(soci[ée]t[ée]|st[ée]|s\.?\s?a\.?\s?r\.?\s?l|s\.?\s?u\.?\s?a\.?\s?r\.?\s?l|sarl|suarl|s\.a\b|sa\b|ets|[ée]tablissements?|entreprise|groupe|distribution|industries?|import|export)\b/i);
const PAS_UN_NOM = motif(/(\bch[èe]que|\besp[èe]ces\b|\bvirement\b|\br[èe]glement\b|\bpaiement\b|\btraite\b|\b[ée]ch[ée]ance\b|\bd[ée]signation\b|\barticle\b|\bunit[ée]\b|\bqt[ée]\b|\bquantit|\bprix\b|\bmontant\b|\btotal\b|\bremise\b|\br[ée]f\b|\br[ée]f[ée]rence\b|\btaux\b|\bfactur|\bdevis\b|\bbon\s+de\b|\bdate\b|\bn\s?[°º]|\bno\s*[:.]|\bnum[ée]ro\b|\bclient\b|\bcode\b|\bt[ée]l\b|\bt[ée]l[ée]phone|\bfax\b|\bgsm\b|\bmob(ile)?\b|\be-?mail\b|@|www\.|http|\bm\s?\.?\s?f\b|\bmatricule\b|\br\.?\s?c\b|\brib\b|\biban\b|\badresse\b|\bpage\s+\d|\bcapital\b|\btva\b|\bb\.?p\b|^\d|^(rue|av|avenue|route|zone|z\.?i|cit[ée]|km|lot|imm|r[ée]sidence)\b|\bdoit\b|\boriginal\b|\bduplicata\b|\bcopie\b)/i);
const lettres = (s: string): number => (s.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;

// Un nom de fournisseur n'est pas qu'une forme juridique (« SARL » seule, deuxième ligne d'un nom long).
const FORME_SEULE = /^(s\.?\s?a\.?\s?r\.?\s?l|s\.?\s?u\.?\s?a\.?\s?r\.?\s?l|s\.?a|ste|societe|ets)\.?$/;
const confiance = (s: Rangee): number => {
  const c = s.mots.map((m) => m.c).filter((v): v is number => typeof v === 'number');
  return c.length ? c.reduce((a, b) => a + b, 0) / c.length : 100;
};

// Étiquette de champ (« Commercial : », « Caisses: », « Livreur : ») : un nom d'entreprise ne porte pas de deux-points.
// Seule une étiquette de NOM (« Société : », « Raison sociale : ») le précède : on garde alors ce qui suit.
const ETIQUETTE_NOM = /^(soci[ée]t[ée]|st[ée]|raison\s+sociale|fournisseur|[ée]metteur|vendeur)\.?\s*$/i;
function sansEtiquette(s: Rangee): Rangee | null {
  const k = s.mots.findIndex((w) => w.t.includes(':'));
  if (k < 0) return s;
  const etiquette = s.mots.slice(0, k + 1).map((w) => w.t).join(' ');
  const apres = s.mots.slice(k + 1);
  if (!/:$/.test(etiquette) || !ETIQUETTE_NOM.test(etiquette.slice(0, -1).trim()) || !apres.length) return null;
  return rangee(apres, s.page);
}

// Reste de lecture devant le nom : symboles d'un logo (« © », « « »), ou début de mot coupé (« té. » pour « Sté. »).
const DEBUT_PARASITE = /^(?:[^\p{L}\p{N}]+|\p{Ll}{1,3}[.,]\s+(?=\p{Lu}))/u;
/** Nom du fournisseur tel qu'il est proposé : sans reste de lecture en tête. */
export function nomPropre(t: string): string {
  let s = t.replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 3; k++) {
    const u = s.replace(DEBUT_PARASITE, '').trim();
    if (u === s || lettres(u) < 3) break;
    s = u;
  }
  return s;
}

// Le nom du fournisseur se répète souvent (bandeau du logo, pied de page « Société : X, adresse… ») ; un mot de logo,
// non. Répété : les deux tiers de ses mots significatifs se retrouvent au DÉBUT d'une autre rangée — avant la première
// coordonnée (adresse, téléphone, e-mail, site, matricule, nombre…), sans autre étiquette que « Société : » —, hors du
// bloc du client. Une localité reprise dans l'adresse du pied de page, ou une marque dans l'e-mail, ne compte pas.
const COORDONNEE = motif(/\b(t[ée]l|fax|gsm|mob|e-?mail|courriel|www|http|site|m\s?\.?\s?f|matricule|mat\s?\.?\s?fisc|code\s+t\.?\s?v\.?\s?a|r\.?\s?c|registre|rib|iban|capital|adresse|si[èe]ge|rue|avenue|av|route|km|cit[ée]|zone|z\.?i|souk|march[ée]|immeuble|r[ée]sidence|b\.?p)\b|@|\d{3,}/i);
function debutDeRangee(q: Rangee): string | null {
  if (BLOC_CLIENT.test(q.texte) || /\blivr/i.test(q.texte)) return null;
  const coupe = q.texte.search(COORDONNEE);
  let t = (coupe < 0 ? q.texte : q.texte.slice(0, coupe)).trim();
  const deuxPoints = t.indexOf(':');
  if (deuxPoints >= 0) {
    if (!ETIQUETTE_NOM.test(t.slice(0, deuxPoints).trim())) return null;
    t = t.slice(deuxPoints + 1);
  }
  return t;
}
function repete(pages: readonly PageLue[], s: Rangee, r: Rangee): boolean {
  const mots = [...new Set(nomComparable(s.texte).split(' ').filter((m) => m.length >= 3))];
  if (!mots.length || (mots.length === 1 && mots[0].length < 4)) return false;
  const requis = mots.length === 1 ? 1 : Math.ceil((2 * mots.length) / 3);
  return pages.some((p) => p.rangees.some((q) => {
    if (q === r) return false;
    const debut = debutDeRangee(q);
    if (!debut) return false;
    const autres = new Set(nomComparable(debut).split(' '));
    return mots.filter((m) => autres.has(m)).length >= requis;
  }));
}
// Une adresse (« Souk municipal - Rue … ») n'est pas un nom, même répétée en pied de page.
const ADRESSE = motif(/\b(rue|avenue|av|route|km|cit[ée]|zone|z\.?i|souk|march[ée]|immeuble|imm|r[ée]sidence|lot|bloc|[ée]tage|b\.?p)\b/i);

function nomFournisseur(pages: readonly PageLue[], client: Destinataire, ancre: MatriculeVu | null): { nom: Rangee; place: Place } | null {
  const page = pages[0];
  if (!page) return null;
  const nomsClient = (client.noms ?? []).filter((n): n is string => Boolean(n && n.trim())).map(plat);
  const candidats: { s: Rangee; place: Place; score: number }[] = [];
  // Le nom est AU-DESSUS du tableau des lignes : on s'arrête à son titre (« Désignation | Qté | … »).
  // Titre non lu (photo) : la première rangée qui porte deux montants au millime ouvre le tableau.
  const titre = debutTableau(page);
  // Taille plafonnée à trois fois celle du texte courant (`courant`) : un mot de logo (4 ou 5 fois plus haut) ne gagne
  // pas par sa seule taille ; un vrai nom, rarement plus de 2 à 2,5 fois plus grand, n'est pas touché.
  const tailles = page.rangees.map((r) => r.hauteur).sort((a, b) => a - b);
  const courant = tailles[Math.floor(tailles.length / 2)] ?? Infinity;
  const admissible = (q: Rangee): boolean => {
    const t = q.texte.trim();
    return lettres(t) >= 3 && lettres(t) >= t.replace(/\s/g, '').length * 0.5 && !PAS_UN_NOM.test(t) && confiance(q) >= 50;
  };
  page.rangees.forEach((r, i) => {
    if (r.y1 > page.hauteur * 0.36 || (titre >= 0 && i >= titre)) return;
    // Rangée qui suit un libellé « Client : » (même colonne) : c'est le client.
    const prec = page.rangees[i - 1];
    for (const brut of segments(r)) {
      const s = sansEtiquette(brut);
      if (!s) continue;
      const t = s.texte.trim();
      if (!admissible(s) || FORME_SEULE.test(plat(t))) continue;
      const p = plat(t);
      if (nomsClient.some((n) => n.length >= 4 && (p.includes(n) || n.includes(p)))) continue;
      if (prec && segments(prec).some((q) => BLOC_CLIENT.test(q.texte) && q.mots[0].x0 < s.mots[s.mots.length - 1].x1 && q.mots[q.mots.length - 1].x1 > s.mots[0].x0)) continue;
      // Taille du texte, puis trois indices qui départagent un nom d'un grand mot de logo ou d'une adresse : une forme
      // juridique, le bloc du matricule du fournisseur juste dessous (même colonne), le nom répété ailleurs.
      const auDessusDuMf = Boolean(ancre && ancre.place.page === 1 && i < ancre.place.i && ancre.place.i - i <= 8
        && s.mots[0].x0 < ancre.x1 + 2 * s.hauteur && s.mots[s.mots.length - 1].x1 > ancre.x0 - 2 * s.hauteur);
      // Un mot isolé, sans forme juridique et jamais répété (« Volcap » d'un logo) : plafonné à deux fois le texte courant
      // et compté moins — sur une photo floue, le matricule peut manquer à la première lecture, et avec lui un indice.
      const forme = FORME.test(t), rep = repete(pages, s, r);
      const logo = !forme && !rep && nomComparable(t).split(' ').filter(Boolean).length <= 1;
      const score = Math.min(s.hauteur, (logo ? 2 : 3) * courant) * (logo ? 0.7 : 1) * (forme ? 1.35 : 1) * (auDessusDuMf ? 1.5 : 1)
        * (rep ? 1.6 : 1) * (ADRESSE.test(t) ? 0.6 : 1) * (1 - 0.3 * (r.y0 / page.hauteur));
      candidats.push({ s, place: { r, page: 1, i, hauteurPage: page.hauteur }, score });
    }
  });
  // Sans nom en tête, la rangée au-dessus du matricule lu (pied de page « SOCIETE X — MF … »).
  if (!candidats.length && ancre) {
    const q = pages[ancre.place.page - 1]?.rangees[ancre.place.i - 1];
    const t = q ? segments(q)[0] : null;
    if (t && admissible(t)) return { nom: t, place: { ...ancre.place, r: q as Rangee, i: ancre.place.i - 1 } };
    return null;
  }
  candidats.sort((a, b) => b.score - a.score);
  const meilleur = candidats[0];
  if (!meilleur) return null;
  // Nom long imprimé sur deux lignes : la rangée voisine, même taille de texte, même marge gauche, le complète (un
  // titre d'une autre colonne, « FACTURE », peut s'intercaler : on regarde deux rangées après, une avant).
  const s = meilleur.s;
  // Même taille à 15 % près (la ligne de localité, juste dessous et un peu plus petite, n'est pas la suite du nom) ; à
  // 30 % quand la première ligne appelle une suite (« SOCIÉTÉ MÉDITERRANÉENNE DE ») — tailles lues moins sûres sur une image.
  const appelleUneSuite = (t: string): boolean => /(?:^|\s)(de|du|des|d'|et|&|la|le|les|pour|en|-|—)$/i.test(t.trim());
  const voisin = (q: Rangee, dessous: boolean): boolean => Math.abs(q.hauteur - s.hauteur)
      <= (appelleUneSuite((dessous ? s : q).texte) ? 0.3 : 0.15) * s.hauteur
    && Math.abs(q.mots[0].x0 - s.mots[0].x0) <= 2 * s.hauteur
    && (dessous ? q.y0 - s.y1 : s.y0 - q.y1) < 1.2 * s.hauteur
    && lettres(q.texte) >= 2 && !PAS_UN_NOM.test(q.texte) && !q.texte.includes(':') && !ADRESSE.test(q.texte);
  for (let j = meilleur.place.i + 1; j <= meilleur.place.i + 2 && j < page.rangees.length; j++) {
    const suite = page.rangees[j];
    const complement = segments(suite).find((q) => voisin(q, true));
    if (complement) return { nom: rangee([...s.mots, ...complement.mots], 1), place: { ...meilleur.place, r: suite, i: j } };
  }
  for (let j = meilleur.place.i - 1; j >= Math.max(0, meilleur.place.i - 2); j--) {
    const debutNom = segments(page.rangees[j]).find((q) => voisin(q, false) && !FORME_SEULE.test(plat(q.texte)) && admissible(q));
    if (debutNom) return { nom: rangee([...debutNom.mots, ...s.mots], 1), place: meilleur.place };
  }
  return { nom: s, place: meilleur.place };
}

const TEL = /(?:t[ée]l(?:[ée]phone)?|gsm|mob(?:ile)?|fixe|fax)\s*\.?\s*:?\s*((?:\+?216[\s.]?)?\d{2}[\s.]?\d{3}[\s.]?\d{3})/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

function coordonnees(pages: readonly PageLue[], nom: { nom: Rangee; place: Place } | null) {
  let adresse: string | null = null;
  let telephone: string | null = null;
  let email: string | null = null;
  const page = pages[0];
  if (!page) return { adresse, telephone, email };
  const x0 = nom ? nom.nom.mots[0].x0 : 0;
  const x1 = nom ? nom.nom.mots[nom.nom.mots.length - 1].x1 : page.largeur / 2;
  const debut = nom ? nom.place.i + 1 : 0;
  const morceaux: string[] = [];
  for (let i = debut; i < Math.min(page.rangees.length, debut + 6); i++) {
    const r = page.rangees[i];
    if (r.y0 > page.hauteur * 0.45) break;
    // Seule la colonne du fournisseur compte (le bloc du client est souvent à droite).
    const seg = segments(r).find((s) => s.mots[0].x0 < x1 + r.hauteur && s.mots[s.mots.length - 1].x1 > x0 - r.hauteur);
    if (!seg) continue;
    // Le bloc d'adresse s'arrête au client, ou au premier titre de l'en-tête de la facture (« N° Facture | Date »).
    if (BLOC_CLIENT.test(seg.texte) || /factur|\bdate\b|\bn\s?[°º]|\bcode\b|\bmode\b|\br[ée]f\b|\btotal\b|d[ée]signation/i.test(seg.texte)) break;
    const tel = seg.texte.match(TEL);
    if (tel && !telephone) telephone = tel[1].replace(/[\s.]/g, '');
    const mail = seg.texte.match(EMAIL);
    if (mail && !email) email = mail[0];
    // Ni une coordonnée sans valeur (« Email : » vide), ni une rangée mal lue (texte arabe, logo).
    if (!tel && !mail && !LIBELLE_MF.test(seg.texte) && !/\b(r\.?\s?c|rib|capital|site|www|e-?mail|courriel)\b/i.test(seg.texte)
      && confiance(seg) >= 50 && morceaux.length < 2 && lettres(seg.texte) >= 3) {
      morceaux.push(seg.texte.replace(/^(adresse|si[èe]ge)\s*:?\s*/i, '').trim());
    }
  }
  if (morceaux.length) adresse = morceaux.join(', ');
  // Téléphone et email parfois en pied de page seulement.
  if (!telephone || !email) {
    for (const p of toutes(pages)) {
      if (!telephone) { const t = p.r.texte.match(TEL); if (t && !BLOC_CLIENT.test(p.r.texte)) telephone = t[1].replace(/[\s.]/g, ''); }
      if (!email) { const m = p.r.texte.match(EMAIL); if (m && !BLOC_CLIENT.test(p.r.texte)) email = m[0]; }
    }
  }
  return { adresse, telephone, email };
}

// ── Numéro et date ──────────────────────────────────────────────────────────────────────────────────────────────────

const VAL = String.raw`([A-Z0-9][A-Z0-9\-/._]*\d[A-Z0-9\-/._]*|\d)`;
const NUMEROS: RegExp[] = [
  new RegExp(String.raw`factures?\s*(?:d'achat\s*)?(?:n\s?[°ºo*'"]|num(?:[ée]ro)?\.?|#)\s*\.?\s*:?\s*${VAL}`, 'i'),
  new RegExp(String.raw`(?:n\s?[°ºo*'"]|num(?:[ée]ro)?)\s*\.?\s*(?:de\s+(?:la\s+)?)?facture\s*:?\s*${VAL}`, 'i'),
  new RegExp(String.raw`facture\s*:\s*${VAL}`, 'i'),
];
const NUMERO_TITRE = /(factures?\s*(n\s?[°ºo*'"]|num)|(n\s?[°ºo*'"]|num[ée]ro)\s*\.?\s*(de\s+(la\s+)?)?facture|^\s*n\s?[°ºo]\s*\.?\s*$)/i;
const NUMERO_SEUL = new RegExp(String.raw`^\s*(?:n\s?[°ºo*'"]|num(?:[ée]ro)?)\s*\.?\s*:?\s*${VAL}`, 'i');
const REFERENCE = new RegExp(String.raw`r[ée]f(?:[ée]rence)?\.?\s*(?:facture)?\s*:\s*${VAL}`, 'i');
// Bon de livraison sans facture (« BON LIVRAISON N° : BL2624133 ») : son numéro sert de référence, en dernier recours.
const NUMERO_BL = new RegExp(String.raw`(?:bons?\s*(?:de\s*)?livraisons?|(?<![\p{L}\p{N}])b\s?\.?\s?l\.?)\s*(?:n\s?[°ºo*'"]|num(?:[ée]ro)?\.?|#)\s*\.?\s*:?\s*${VAL}`, 'iu');
// « Votre réf », « Réf commande », « Réf BL », « Réf client » : la référence de quelqu'un d'autre, pas le n° de la facture.
const AUTRE_REFERENCE = /(votre|v\/|n\/)\s*r[ée]f|r[ée]f(?:[ée]rence)?\.?\s*(commande|cmd|bl|bon|client|devis|livraison)/i;
const nettoyerNumero = (s: string): string => s.replace(/[.:,;_-]+$/, '').trim();
// « FV-2026- 00437 » (une espace lue après un séparateur) : recollé avant la recherche du numéro.
const recolle = (t: string): string => t
  .replace(/(\d)\s+([-/])\s*(?=\d)(?!\d{1,2}[/.-]\d{1,2})/g, '$1$2')
  .replace(/([-/])\s+(?=\d)(?!\d{1,2}[/.-]\d{1,2})/g, '$1');
/** Numéro lu ; `incomplet` : il finissait par un séparateur (« FV-2026- ») — la suite n'a pas été lue ; `bl` : c'est
 * celui d'un bon de livraison (aucun numéro de facture lu). */
interface NumeroLu { valeur: string; incomplet: boolean; bl?: boolean }
const estDate = (s: string): boolean => datesDuTexte(s).some((d) => d.index === 0 && d.fin >= s.length - 1);

/** Valeur placée SOUS un titre de colonne (rangées suivantes, même page, mots qui chevauchent le titre). */
function sous(pages: readonly PageLue[], p: Place, x0: number, x1: number, accepte: (t: string) => boolean): string | null {
  const page = pages[p.page - 1];
  for (let j = p.i + 1; j <= p.i + 2 && j < page.rangees.length; j++) {
    const r = page.rangees[j];
    const marge = r.hauteur;
    const mots = r.mots.filter((w) => w.x1 > x0 - marge && w.x0 < x1 + marge);
    if (!mots.length) continue;
    const t = mots.map((w) => w.t).join(' ');
    if (accepte(t)) return t;
  }
  return null;
}

/** Index de la première rangée du tableau des lignes d'une page (titre « Désignation | Qté… », ou première rangée à deux
 * montants au millime) ; Infinity s'il n'y en a pas. L'en-tête est au-dessus. */
function debutTableau(page: PageLue): number {
  const titre = page.rangees.findIndex((r) => TITRE_LIGNES.test(plat(r.texte)));
  const COORDONNEES = /t[ée]l|fax|gsm|mob|r\.?\s?c\b|capital|rib|iban|m\.?\s?f\b|matricule/i;
  const chiffreeSeule = (r: Rangee) => !COORDONNEES.test(r.texte) && nombresDeRangee(r).filter((n) => /[.,]\d{3}$/.test(n.brut)).length >= 2;
  const chiffree = page.rangees.findIndex((r, i) => chiffreeSeule(r) && Boolean(page.rangees[i + 1]) && chiffreeSeule(page.rangees[i + 1]));
  return [titre, chiffree].filter((i) => i >= 0).reduce((a, b) => Math.min(a, b), Infinity);
}

function numeroFacture(pages: readonly PageLue[]): NumeroLu | null {
  const places = toutes(pages);
  const tableaux = pages.map(debutTableau);
  const valide = (v: string | undefined): NumeroLu | null => {
    if (!v) return null;
    const n = nettoyerNumero(v);
    return n && n.length <= 40 && /\d/.test(n) && !estDate(n) && !/^du$/i.test(n) ? { valeur: n, incomplet: /[-/]$/.test(v.trim()) } : null;
  };
  for (const motif of NUMEROS) {
    for (const p of places) {
      for (const s of segments(p.r)) {
        const v = valide(recolle(s.texte).match(motif)?.[1]);
        if (v) return v;
      }
    }
  }
  // « N° : FV-2026-00437 » sous un titre « FACTURE » (cadre de l'en-tête), dans la même colonne.
  for (const p of places) {
    if (p.i >= tableaux[p.page - 1]) continue;
    for (const s of segments(p.r)) {
      const v = valide(recolle(s.texte).match(NUMERO_SEUL)?.[1]);
      if (!v) continue;
      const page = pages[p.page - 1];
      for (let j = p.i - 1; j >= Math.max(0, p.i - 3); j--) {
        const titre = page.rangees[j].mots.filter((w) => w.x1 > s.mots[0].x0 - 3 * s.hauteur && w.x0 < s.mots[s.mots.length - 1].x1 + 3 * s.hauteur);
        if (titre.some((w) => /^factures?$/i.test(w.t))) return v;
      }
    }
  }
  // Titre de colonne (« N° Facture | Date | Client ») : la valeur est dessous — seulement AU-DESSUS du tableau des lignes
  // (sa colonne « N° » numérote les lignes) ; sous un « N° » seul, un numéro de 1 à 3 chiffres n'est pas pris.
  for (const p of places) {
    if (p.i >= tableaux[p.page - 1]) continue;
    for (const s of segments(p.r)) {
      if (!NUMERO_TITRE.test(s.texte) || /\d/.test(s.texte.replace(NUMERO_TITRE, ''))) continue;
      const v = sous(pages, p, s.mots[0].x0, s.mots[s.mots.length - 1].x1, (t) => Boolean(valide(t.split(' ')[0])));
      if (v) return valide(v.split(' ')[0]);
    }
  }
  for (const p of places) {
    const m = p.r.texte.match(REFERENCE);
    // Le libellé qui précède la valeur, et quelques caractères avant lui (« Votre réf ») — pas toute la rangée.
    const debut = m?.index ?? 0;
    if (!m || AUTRE_REFERENCE.test(p.r.texte.slice(Math.max(0, debut - 8), debut + m[0].length - m[1].length))) continue;
    const v = valide(m[1]);
    if (v) return v;
  }
  // Bon de livraison : son numéro, seulement si le document EN EST UN (une facture cite souvent « selon BL N° … »).
  if (estBonDeLivraison(pages)) {
    for (const p of places) {
      if (p.i >= tableaux[p.page - 1]) continue;
      for (const s of segments(p.r)) {
        const v = valide(recolle(s.texte).match(NUMERO_BL)?.[1]);
        if (v) return { ...v, bl: true };
      }
    }
  }
  return null;
}

// Document qui est un bon de livraison : titre « Bon (de) livraison » au-dessus du tableau des lignes, et nulle part le
// mot « facture ».
const TITRE_BL = /\bbons?\s*(?:de\s*)?livraisons?\b/i;
function estBonDeLivraison(pages: readonly PageLue[]): boolean {
  if (pages.some((p) => p.rangees.some((r) => /factur/i.test(r.texte)))) return false;
  return pages.some((p) => {
    const tableau = debutTableau(p);
    return p.rangees.some((r, i) => i < tableau && TITRE_BL.test(r.texte));
  });
}

// Dates qui ne sont pas celle de la facture : échéance, livraison, édition ou impression du document…
const PAS_LA_DATE = /([ée]ch[ée]ance|livraison|naissance|impression|imprim[ée]|[ée]dition|[ée]dit[ée]|g[ée]n[ée]r[ée]|valid|commande|bl\b|bon\s+de|p[ée]riode|jusqu|r[èe]glement|paiement)/i;
const PAS_LA_DATE_BL = /([ée]ch[ée]ance|naissance|impression|imprim[ée]|[ée]dition|[ée]dit[ée]|g[ée]n[ée]r[ée]|valid|commande|p[ée]riode|jusqu|r[èe]glement|paiement)/i;
// Une heure à côté d'une date sans libellé « date » : un horodatage (impression, envoi), pas la date de la facture.
const HEURE = /\b\d{1,2}\s?[:h]\s?\d{2}\b/i;

// Bon de livraison : une date sans rien autour d'abord ; à défaut, la sienne (« Bon de livraison N° 12 du … »).
const dateFacture = (pages: readonly PageLue[], bl = false): string | null =>
  dateSauf(pages, PAS_LA_DATE) ?? (bl ? dateSauf(pages, PAS_LA_DATE_BL) : null);

function dateSauf(pages: readonly PageLue[], pasLaDate: RegExp): string | null {
  const places = toutes(pages);
  // 1. Libellé explicite : « Date (de la facture) : 03/10/2026 ».
  for (const p of places) {
    for (const s of segments(p.r, 3)) {
      const t = s.texte;
      const libelle = t.search(/\bdate\b/i);
      if (libelle < 0 || pasLaDate.test(t)) continue;
      const d = datesDuTexte(t).find((x) => x.index > libelle);
      if (d) return d.iso;
    }
  }
  // 2. Titre de colonne « Date », valeur dessous — au-dessus du tableau des lignes (dont la colonne « Date » est celle
  // des bons de livraison d'une facture récapitulative).
  const tableaux = pages.map(debutTableau);
  for (const p of places) {
    if (p.i >= tableaux[p.page - 1]) continue;
    for (const s of segments(p.r)) {
      if (!/^\s*date(\s+(de\s+(la\s+)?)?facture)?\s*:?\s*$/i.test(s.texte)) continue;
      const v = sous(pages, p, s.mots[0].x0, s.mots[s.mots.length - 1].x1, (t) => datesDuTexte(t).length > 0);
      if (v) return datesDuTexte(v)[0].iso;
    }
  }
  // 3. « Facture N° 12 du 03/10/2026 », « Tunis, le 03/10/2026 » ; 4. première date du haut de la première page. Une date
  // accompagnée d'une heure n'est prise qu'en dernier recours (horodatage d'impression, ou ticket de caisse).
  const page = pages[0];
  for (const avecHeure of [false, true]) {
    for (const p of places) {
      for (const s of segments(p.r, 3)) {
        const t = s.texte;
        const libelle = t.search(/\bdu\b|\ble\b/i);
        if (libelle < 0 || pasLaDate.test(t) || (!avecHeure && HEURE.test(t))) continue;
        const d = datesDuTexte(t).find((x) => x.index > libelle);
        if (d) return d.iso;
      }
    }
    for (const r of page?.rangees ?? []) {
      if (r.y0 > page.hauteur * 0.45) break;
      if (pasLaDate.test(r.texte) || (!avecHeure && HEURE.test(r.texte))) continue;
      const d = datesDuTexte(r.texte)[0];
      if (d) return d.iso;
    }
  }
  return null;
}

// ── Totaux ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type CleTotal = 'ht' | 'remise' | 'fodec' | 'tva' | 'timbre' | 'ttc';
// Ordre des essais sur le texte « à plat » (sans accents, minuscules). Le premier libellé qui couvre une position la garde.
const LIBELLES: [CleTotal, RegExp][] = [
  ['ttc', /\b(?:total|montant|net)\s*(?:total\s*)?(?:a\s*payer\s*)?t\s?\.?\s?t\s?\.?\s?c\b\.?|\bnet\s*a\s*pay(?:er|e)\b|\btotal\s*a\s*payer\b|\btotal\s*general\b|\bmontant\s*total\b(?!\s*(?:h\s?\.?\s?t\b|hors))|\btotal\s*facture\b/g],
  ['ht', /\b(?:total|montant|net|base)\s*(?:net\s*)?(?:h\s?\.?\s?t\b\.?|hors\s*taxes?)(?:\s*net\b)?|\bnet\s*h\s?\.?\s?t\b\.?|\btotal\s*brut\b|(?<!brut\s{0,3})\bhors\s*taxes?\b/g],
  ['remise', /\bremise\b|\bescompte\b/g],
  ['fodec', /\bfodec\b/g],
  ['timbre', /\b(?:droit\s*de\s*)?timbre(?:\s*fiscal)?\b/g],
  // « TVA » seule (« TVA 156,322 », titre de colonne des totaux) ; jamais « Code TVA », ni « TVA 19 % » (taux, lu à part).
  ['tva', /\b(?:total|montant)\s*(?:de\s*la\s*)?t\s?\.?\s?v\s?\.?\s?a\b\.?|(?<!code\s{0,3})\bt\.?\s?v\.?\s?a\b\.?(?!\s*(?:\(?\d{1,2}(?:[.,]\d+)?\s*%|intracom|n\s?[°o]|:?\s*\d{7}))/g],
];

interface LibelleTrouve { cle: CleTotal; de: number; a: number; x0: number; x1: number; prio: number }
// « Total TTC » l'emporte sur « Net à payer » (qui peut être APRÈS une retenue à la source) et « Total général ».
const TTC_EXPLICITE = /t\s?\.?\s?t\s?\.?\s?c/;

function libellesDeRangee(r: Rangee): LibelleTrouve[] {
  const t = plat(r.texte);
  // plat() ne change pas la longueur d'un texte latin sans espaces doubles : la rangée est déjà jointe par une espace.
  if (t.length !== r.texte.length) return [];
  const trouves: LibelleTrouve[] = [];
  const couvert = (i: number) => trouves.some((l) => i >= r.debuts[l.de] && i <= r.debuts[l.a] + r.mots[l.a].t.length);
  for (const [cle, motif] of LIBELLES) {
    for (const m of t.matchAll(motif)) {
      const i = m.index ?? 0;
      if (couvert(i)) continue;
      const de = motA(r, i), a = motA(r, i + Math.max(0, m[0].trimEnd().length - 1));
      // « Hors taxe » seul (« HORS TAXE 321,200 », total d'un bon de livraison) cède devant un « Total HT ».
      const faible = (cle === 'ttc' && !TTC_EXPLICITE.test(m[0])) || (cle === 'ht' && /^hors/.test(m[0]));
      trouves.push({ cle, de, a, x0: r.mots[de].x0, x1: r.mots[a].x1, prio: faible ? 1 : 2 });
    }
  }
  return trouves.sort((x, y) => x.de - y.de);
}

// Titres de colonnes du tableau des lignes de la facture.
const TITRE_LIGNES = /\b(designation|libelle|quantite|qte|article|produit|p\.?\s?u\b|prix\s+unit)/;
const TAUX_TVA =/t\s?\.?\s?v\s?\.?\s?a\s*(?:a\s*)?\(?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/;

function totaux(pages: readonly PageLue[], source: SourceLue): TotauxLus {
  const valeurs: Partial<Record<CleTotal, number>> = {};
  // Montants pris SOUS un titre de colonne : moins sûrs qu'un libellé suivi de son montant, ils ne servent qu'à défaut.
  const dessousLus: Partial<Record<CleTotal, number>> = {};
  // Priorité du libellé retenu pour chaque montant (le plus bas de la page l'emporte à priorité égale).
  const prios: Partial<Record<CleTotal, number>> = {};
  const prioDessous: Partial<Record<CleTotal, number>> = {};
  // Tous les montants lus sous un libellé de TTC (« Total TTC », « Net à payer »…), dans l'ordre de la page.
  const candidatsTtc: number[] = [];
  const poser = (cible: Partial<Record<CleTotal, number>>, p: Partial<Record<CleTotal, number>>, l: LibelleTrouve, v: number) => {
    if (l.cle === 'ttc') candidatsTtc.push(v);
    if ((p[l.cle] ?? 0) > l.prio) return;
    cible[l.cle] = v;
    p[l.cle] = l.prio;
  };
  const parTaux = new Map<number, TvaLue>();
  const places = toutes(pages);
  places.forEach((p, k) => {
    const r = p.r;
    const libelles = libellesDeRangee(r);
    const nombres = nombresDeRangee(r).filter((n) => !n.pourcent);
    // TVA d'un taux : « TVA 19 % 1 000,000 190,000 » (base puis montant) ou « TVA 19% : 190,000 ».
    const taux = plat(r.texte).match(TAUX_TVA);
    if (taux && !libelles.some((l) => l.cle === 'ttc' || l.cle === 'ht')) {
      const v = Number(taux[1].replace(',', '.'));
      const apres = nombres.filter((n) => n.x0 > (r.mots[motA(r, (taux.index ?? 0) + taux[0].length - 1)]?.x1 ?? 0) - 1);
      if (v <= 30 && apres.length) {
        parTaux.set(v, { taux: v, base: apres.length >= 2 ? apres[apres.length - 2].valeur : null, montant: apres[apres.length - 1].valeur });
      }
      return;
    }
    if (!libelles.length) return;
    if (nombres.length) {
      libelles.forEach((l, n) => {
        const fin = libelles[n + 1]?.de ?? Infinity;
        const siens = nombres.filter((x) => x.de > l.a && x.de < fin);
        if (siens.length) poser(valeurs, prios, l, Math.abs(siens[siens.length - 1].valeur));
      });
      return;
    }
    // Titres de colonnes sans montant (« Total HT | TVA | Timbre | Net à payer ») : les montants sont dessous, chacun
    // sous son titre (une rangée de bruit d'une photo peut s'intercaler : on regarde les deux suivantes).
    // (Le titre du récapitulatif de TVA, « Taux | Base HT | Montant TVA », est lu plus bas, à part.)
    if (libelles.length < 2 || TITRE_LIGNES.test(plat(r.texte)) || /\btaux\b/.test(plat(r.texte))) return;
    const montantsDe = (q: Place | undefined) => (q && q.page === p.page ? nombresDeRangee(q.r).filter((n) => !n.pourcent) : []);
    const dessous = [montantsDe(places[k + 1]), montantsDe(places[k + 2])].find((ns) => ns.length >= Math.min(2, libelles.length)) ?? [];
    for (const l of libelles) {
      const centre = (l.x0 + l.x1) / 2;
      const proche = dessous
        .map((n) => ({ n, d: Math.abs((n.x0 + n.x1) / 2 - centre) }))
        .sort((a, b) => a.d - b.d)[0];
      if (proche && proche.d < Math.max(l.x1 - l.x0, 4 * r.hauteur)) poser(dessousLus, prioDessous, l, Math.abs(proche.n.valeur));
    }
  });
  // Tableau récapitulatif de la TVA (« Taux | Base | Montant ») : rangées qui commencent par un taux.
  places.forEach((p, k) => {
    const t = plat(p.r.texte);
    // Le titre du tableau des LIGNES (« Désignation | Qté | Taux TVA | Montant ») n'en est pas un.
    if (!/\btaux\b/.test(t) || !/\b(base|tva|montant)\b/.test(t) || TITRE_LIGNES.test(t)) return;
    for (let j = k + 1; j <= k + 6 && j < places.length && places[j].page === p.page; j++) {
      // Le récapitulatif est souvent à gauche des totaux, sur les mêmes rangées : seuls comptent ses montants à lui.
      const totalVoisin = libellesDeRangee(places[j].r)[0];
      const ns: NombreLu[] = nombresDeRangee(places[j].r).filter((n) => !totalVoisin || n.de < totalVoisin.de);
      if (ns.length < 2) break;
      const premier = ns[0];
      const v = premier.valeur;
      if (premier.de !== 0) break; // une rangée du récapitulatif commence par son taux
      if (!(premier.pourcent || [0, 6, 7, 12, 13, 19].includes(v)) || v > 30) break;
      const reste = ns.slice(1).filter((n) => !n.pourcent);
      if (!reste.length) break;
      parTaux.set(v, { taux: v, base: reste.length >= 2 ? reste[0].valeur : null, montant: reste[reste.length - 1].valeur });
    }
  });
  const liste = [...parTaux.values()].sort((a, b) => a.taux - b.taux);
  for (const k of Object.keys(dessousLus) as CleTotal[]) if (valeurs[k] === undefined) valeurs[k] = dessousLus[k];
  const tvaLue = valeurs.tva ?? (liste.length && liste.every((x) => x.montant !== null) ? millime(liste.reduce((s, x) => s + (x.montant ?? 0), 0)) : null);
  const ht = valeurs.ht ?? null;
  let timbre = valeurs.timbre !== undefined && valeurs.timbre <= 10 ? valeurs.timbre : null;
  const fodec = valeurs.fodec ?? null;
  const tolerance = source === 'pdf' ? 0.0015 : 0.011;
  // « Total TTC 1190,000 » avant le timbre puis « Net à payer 1191,000 », ou « Total TTC » puis un « Net à payer » diminué
  // d'une retenue à la source : le TTC est le montant qui recoupe les autres ; à défaut, le libellé le plus explicite.
  const somme = ht !== null && tvaLue !== null ? ht + (fodec ?? 0) + tvaLue + (timbre ?? 0) : null;
  const recoupe = somme === null ? undefined : candidatsTtc.filter((v) => Math.abs(v - somme) <= tolerance).pop();
  const ttc = recoupe ?? valeurs.ttc ?? null;
  // Aucune TVA imprimée, et HT (+ FODEC + timbre) = TTC : document exonéré (bon de livraison, produits sans TVA) — TVA 0.
  const tva = tvaLue === null && ht !== null && ttc !== null && Math.abs(ttc - (ht + (fodec ?? 0) + (timbre ?? 0))) <= tolerance ? 0 : tvaLue;
  let coherents: boolean | null = null;
  if (ht !== null && tva !== null && ttc !== null) coherents = Math.abs(ht + (fodec ?? 0) + tva + (timbre ?? 0) - ttc) <= tolerance;
  // « Aucun timbre » : seulement pour un document SANS TVA (bon de livraison, produits exonérés) dont les totaux se
  // recoupent sans timbre, où le mot « timbre » n'apparaît nulle part (même avec un montant illisible) et où aucun autre
  // montant « à payer » ne diffère du TTC. Une facture tunisienne porte presque toujours un timbre : sinon, on ne conclut rien.
  if (coherents && tva === 0 && timbre === null && valeurs.timbre === undefined && ttc !== null
    && !places.some((p) => /timb/i.test(p.r.texte)) && candidatsTtc.every((v) => Math.abs(v - ttc) <= tolerance)) timbre = 0;
  return { ht, remise: valeurs.remise ?? null, fodec, tva, timbre, ttc, parTaux: liste, coherents };
}

// ── Assemblage ──────────────────────────────────────────────────────────────────────────────────────────────────────

const lu = <T>(valeur: T, source: SourceLue, note?: string, fragile = false): ValeurLue<T> => {
  const aRelire = source === 'ocr' || fragile;
  return note ? { valeur, aRelire, note } : { valeur, aRelire };
};

const aujourdHui = (): string => new Date().toISOString().slice(0, 10);
const ilYA = (jours: number): string => new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);
const enLettres = (n: number): string => n.toFixed(3).replace('.', ',');

/** Lit l'en-tête d'une facture à partir de ses pages. `client` : ce que l'on sait du client (jamais pris pour le fournisseur). */
export function lireEntete(pages: readonly PageLue[], source: SourceLue, client: Destinataire = {}): EnteteLu {
  const avertissements: string[] = [];

  // Fournisseur : par son matricule, en écartant celui du client.
  const vus = matriculesVus(pages, source);
  const fournisseur = vus.filter((m) => !memeEntreprise(m.identifiant, client.matricule) && !m.duClient);
  // À valeur égale, la plus complète et à clé cohérente d'abord, puis la plus haute dans la page.
  const choisi = [...fournisseur].sort((a, b) => Number(b.cle) - Number(a.cle) || Number(b.complet) - Number(a.complet)
    || a.place.page - b.place.page || a.place.i - b.place.i)[0] ?? null;
  let matricule: ValeurLue<string> | null = null;
  if (choisi) {
    const autres = new Set(fournisseur.filter((m) => m.identifiant !== choisi.identifiant).map((m) => m.valeur));
    const notes: string[] = [];
    if (choisi.sixChiffres) notes.push(`imprimé sans le zéro de tête (${choisi.valeur.slice(1, 8)}) : complété`);
    if (!choisi.cle) notes.push('lettre-clé à vérifier : elle ne correspond pas aux 7 chiffres');
    if (!choisi.complet) notes.push('forme courte (sans /TVA/catégorie/établissement)');
    if (autres.size) notes.push(`autre${autres.size > 1 ? 's' : ''} matricule${autres.size > 1 ? 's' : ''} lu${autres.size > 1 ? 's' : ''} : ${[...autres].join(', ')}`);
    matricule = lu(choisi.valeur, source, notes.join(' ; ') || undefined, !choisi.cle || autres.size > 0);
  } else if (vus.length) {
    avertissements.push("Seul le matricule fiscal du client a été lu : celui de l'émetteur de la facture n'apparaît pas, ou n'a pas été reconnu.");
  } else {
    avertissements.push("Aucun matricule fiscal lu : la facture est rapprochée par le nom de l'émetteur, à vérifier.");
  }

  const nomTrouve = nomFournisseur(pages, client, choisi);
  const nom = nomTrouve ? lu(nomPropre(nomTrouve.nom.texte), source) : null;
  const { adresse, telephone, email } = coordonnees(pages, nomTrouve);

  const numeroBrut = numeroFacture(pages);
  const notesNumero = [
    ...(numeroBrut?.bl ? ['n° du bon de livraison'] : []),
    ...(numeroBrut?.incomplet ? ['numéro peut-être incomplet : relisez-le sur la facture'] : []),
  ];
  const numero = numeroBrut
    ? lu(numeroBrut.valeur, source, notesNumero.join(' ; ') || undefined, numeroBrut.incomplet)
    : null;
  if (!numero) avertissements.push('Numéro de facture non lu : saisissez-le.');

  const dateBrute = dateFacture(pages, Boolean(numeroBrut?.bl));
  let date: ValeurLue<string> | null = null;
  if (dateBrute) {
    if (dateBrute > aujourdHui()) date = lu(dateBrute, source, 'date à venir : à vérifier', true);
    else if (dateBrute < ilYA(366)) date = lu(dateBrute, source, "facture de plus d'un an : à vérifier", true);
    else date = lu(dateBrute, source);
  } else {
    avertissements.push('Date de la facture non lue.');
  }

  const t = totaux(pages, source);
  if (t.coherents === false && t.ht !== null && t.ttc !== null && t.tva !== null) {
    const somme = millime(t.ht + (t.fodec ?? 0) + t.tva + (t.timbre ?? 0));
    avertissements.push(`Totaux lus incohérents : HT${t.fodec !== null ? ' + FODEC' : ''} + TVA${t.timbre !== null ? ' + timbre' : ''} = ${enLettres(somme)}, TTC lu ${enLettres(t.ttc)}. À relire.`);
  }

  return {
    source,
    matricule,
    nom,
    adresse: adresse ? lu(adresse, source, undefined, true) : null,
    telephone: telephone ? lu(telephone, source) : null,
    email: email ? lu(email, source) : null,
    numero,
    date,
    totaux: t,
    lignes: pages.flatMap((p) => p.rangees.map((r) => r.texte)).filter(Boolean),
    avertissements,
  };
}
