// Lecture des LIGNES d'une facture fournisseur (étape F3 — labflow-reprise/achats-compta/PLAN-FACTURES.md §4 « La
// lecture »). Fonctions PURES, sur les rangées de la page (texte d'un PDF ou reconnaissance de caractères).
//   1. le titre du tableau (« Désignation | Qté | P.U. HT | TVA | Montant ») donne les colonnes ;
//   2. chaque rangée suivante est découpée en cellules (blancs larges), chaque cellule rangée sous sa colonne ;
//   3. une rangée sans nombre prolonge la désignation de la précédente quand elle en est la suite (« (carton 48) ») ;
//      un intertitre (« BOISSONS ») n'est collé à aucune ligne ;
//   4. le tableau s'arrête aux totaux (« Total HT », « Net à payer », récapitulatif de TVA…) — jamais sur une rangée qui
//      porte une quantité ou un prix (« Base pizza 5 kg » est une ligne) ;
//   5. contrôle de chaque ligne : quantité × prix − remise = montant ; s'il est faux, les nombres de la rangée sont
//      relus sans les colonnes (une cellule mal rangée sur une photo) ; une valeur manquante se déduit des deux autres ;
//   6. colonnes TTC seules (« P.U. TTC », « Montant TTC ») : ramenées en HT avec le taux de la ligne, à relire.
// Sans titre de colonnes (ticket de caisse : « LAIT 1L » puis « 2 x 1.350   2.700 »), la forme « quantité x prix »
// suffit. Une ligne lue n'est qu'une proposition : la fenêtre « Vérifier la facture » la fait relire et valider.
import { lireNombre, millime, nombresDeRangee } from './nombres.ts';
import { rangee } from './rangees.ts';
import type { GenreColonne, LigneLue, MiseEnPage, Mot, PageLue, Rangee, SourceLue } from './types.ts';

const plat = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

type Colonne = GenreColonne;
interface Cellule { mots: Mot[]; texte: string; x0: number; x1: number }
interface ColonneVue { genre: Colonne; x0: number; x1: number }

/** Cellules d'une rangée : mots séparés par un blanc de plus d'une hauteur de texte (l'espace entre deux mots d'une
 * image reconnue va jusqu'aux deux tiers de la hauteur ; deux colonnes sont plus éloignées). */
export function cellules(r: Rangee, facteur = 1): Cellule[] {
  const res: Cellule[] = [];
  let courant: Mot[] = [];
  const fermer = () => {
    if (!courant.length) return;
    res.push({ mots: courant, texte: courant.map((m) => m.t).join(' '), x0: courant[0].x0, x1: Math.max(...courant.map((m) => m.x1)) });
    courant = [];
  };
  for (const m of r.mots) {
    const prec = courant[courant.length - 1];
    if (prec && m.x0 - prec.x1 > facteur * r.hauteur) fermer();
    courant.push(m);
  }
  fermer();
  return res;
}

/**
 * Cellules d'une rangée de lignes : comme `cellules`, mais une cellule sans lettres qui porte plusieurs nombres (« 24,600
 * 19% », deux colonnes voisines trop serrées) est coupée en un nombre par cellule — « 1 234,567 » reste entier.
 */
export function cellulesDeLigne(r: Rangee): Cellule[] {
  return cellules(r).flatMap((c) => {
    if (c.mots.length < 2 || /\p{L}/u.test(c.texte)) return [c];
    const ns = nombresDeRangee(rangee(c.mots, r.page));
    if (ns.length < 2) return [c];
    return ns.map((n) => {
      const ms = c.mots.slice(n.de, n.a + 1);
      return { mots: ms, texte: ms.map((m) => m.t).join(' '), x0: ms[0].x0, x1: Math.max(...ms.map((m) => m.x1)) };
    });
  });
}

/**
 * Genre d'un titre de colonne, ou null. Tolère les titres collés et mal reconnus d'une image (« MontantHT », « Qté »
 * lu « Ote », « Tva) »). L'ordre compte : « P.U. TTC » et « Montant TTC » avant « P.U. » et « Montant », « Code
 * article » avant « Article ».
 */
export function genreDeTitre(texte: string): Colonne | null {
  const t = plat(texte).replace(/[:()[\]|"“”'`’]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const pu = /(^|\s)p\.?\s?u(\b|h|t|\.)|prix\s*u|^prix\b|^pu/;
  if (/^(n\s?[°ºo]\.?|no\.?|#|n)$/.test(t)) return 'num';
  if (/t\.?\s?t\.?\s?c/.test(t)) return pu.test(t) ? 'puttc' : 'ttc';
  if (/^(code|ref|refe|reference)\b|^ref\.|\b(code|ref)\b/.test(t)) return 'ref';
  if (/(designat|libelle|descript|article|produit|intitule|nature)/.test(t)) return 'des';
  if (/(remise|escompte|ristourne|^rem\b|^%\s?r\b|^r\s?%)/.test(t)) return 'remise';
  if (/(t\.?\s?v\.?\s?a|taux|taxe)/.test(t)) return 'tva';
  if (pu.test(t)) return 'pu';
  if (/(^|\s)(qte|qt|quantit|qty|nbre|nombre|colis)|^[qo0]t[e]s?\.?$/.test(t)) return 'qte';
  if (/(montant|total|^mt\b|valeur)/.test(t)) return 'montant';
  if (/^(u|um|u\.?\s?m|cond|conditionnement|uv)\.?$/.test(t) || (t.length <= 9 && /unit/.test(t))) return 'unite';
  return null;
}

/** Une cellule faite d'un nombre (pas un titre) : chiffres sans mot. */
const estNombre = (c: Cellule) => !/\p{L}{2,}/u.test(c.texte) && /\d/.test(c.texte);

/**
 * Colonnes du tableau si `r` en est le titre : au moins la désignation et une colonne chiffrée, et aucun nombre (une
 * ligne « Yaourt nature 125 g | colis | 3 | … » porte des mots de titre, mais aussi des nombres).
 */
export function colonnesDuTitre(r: Rangee): ColonneVue[] | null {
  const cs = cellules(r);
  if (cs.some(estNombre)) return null;
  const vues: ColonneVue[] = [];
  for (const c of cs) {
    // « N° » collé au titre suivant (« N° Désignation ») : une colonne à part.
    if (c.mots.length > 1 && genreDeTitre(c.mots[0].t) === 'num') {
      const reste = c.mots.slice(1);
      const g = genreDeTitre(reste.map((m) => m.t).join(' '));
      if (g) {
        vues.push({ genre: 'num', x0: c.mots[0].x0, x1: c.mots[0].x1 });
        vues.push({ genre: g, x0: reste[0].x0, x1: Math.max(...reste.map((m) => m.x1)) });
        continue;
      }
    }
    const genre = genreDeTitre(c.texte);
    if (genre) { vues.push({ genre, x0: c.x0, x1: c.x1 }); continue; }
    // Deux titres serrés dans une même cellule (« Qté P.U. ») : mot par mot.
    for (const m of c.mots) {
      const g = genreDeTitre(m.t);
      if (g) vues.push({ genre: g, x0: m.x0, x1: m.x1 });
    }
  }
  const genres = new Set(vues.map((v) => v.genre));
  if (!genres.has('des')) return null;
  if (!['qte', 'pu', 'puttc', 'montant', 'ttc', 'tva'].some((g) => genres.has(g as Colonne))) return null;
  // Un même genre deux fois (« Prix » puis « Prix total ») : le second titre « pu » devient le montant.
  const vus = new Set<Colonne>();
  for (const v of vues) {
    if (vus.has(v.genre) && v.genre === 'pu' && !genres.has('montant')) v.genre = 'montant';
    vus.add(v.genre);
  }
  return vues.sort((a, b) => a.x0 - b.x0);
}

/** Colonne d'une cellule : celle dont le titre la recouvre le plus, sinon la plus proche. */
function colonneDe(c: Cellule, colonnes: ColonneVue[]): ColonneVue {
  let meilleure = colonnes[0];
  let score = -Infinity;
  for (const col of colonnes) {
    const recouvrement = Math.min(c.x1, col.x1) - Math.max(c.x0, col.x0);
    const s = recouvrement > 0 ? recouvrement : -Math.min(Math.abs(c.x0 - col.x1), Math.abs(col.x0 - c.x1));
    if (s > score) { score = s; meilleure = col; }
  }
  return meilleure;
}

// Fin du tableau : une rangée de totaux, le récapitulatif de TVA, la somme « arrêtée », un report de page — appliqué
// aux seules rangées sans quantité ni prix.
const FIN = /^(total|totaux|sous[\s-]?total|net\s*a\s*pay|net\s*h\.?t|montant\s*(h\.?t|t\.?t\.?c|total|net|a\s*payer)|arrete|timbre|base\b|taux\b|tva\b|t\.v\.a\b|remise\b|escompte|report|a\s*reporter|fodec|avance|retenue|solde|cachet|signature|merci|mode\s+de\s+r)/;
const MOT_FIN = /\b(total\s*(h\.?t|t\.?t\.?c|net|brut)?|net\s*a\s*pay\w*|arrete\w*|timbre|a\s*reporter)\b/;
// Une désignation qui n'en est pas une (un total rangé sous la colonne Désignation).
const PAS_UNE_DESIGNATION = /^(total|totaux|sous[\s-]?total|net\s*a\s*pay|montant\s*(h\.?t|t\.?t\.?c|total|net|a\s*payer)|arrete)/;

const UNITE_SEULE = /^(kg|g|gr|l|lt|ml|cl|u|pc|pcs|pi[eè]ce?s?|sac|sacs|carton|ctn|crt|pack|bidon|bouteille|btl|boite|bte|paquet|pqt|plateau|botte|rouleau|casier|caisse|colis|fardeau|douzaine|dz|unite|unit)\.?$/i;

/** Nombre d'une cellule (« 1 234,567 », « 19 % », « 5% », « 8,700) » d'une image) ; null si ce n'en est pas un (une
 * cellule qui porte un mot, « TVA 7% », n'est pas un nombre). */
function nombreDe(texte: string): number | null {
  const sans = texte.replace(/\s*(%|dt|tnd|d)\s*$/i, '');
  if (/\p{L}{2,}/u.test(sans)) return null;
  const t = sans.replace(/^[^\d-]+|[^\d]+$/g, '').trim();
  if (!/^-?\d/.test(t)) return null;
  return lireNombre(t);
}
/** Un pourcentage (taux de TVA, remise) : « 19 % », ou un petit nombre sans millimes sous un titre de taux. */
const estPourcent = (texte: string, genre: Colonne) => /%/.test(texte) || ((genre === 'tva' || genre === 'remise') && !/[.,]\d{3}\D*$/.test(texte));
const TAUX_TUNISIENS = [0, 6, 7, 12, 13, 19];

interface Brute {
  des: string[];
  /** Rangées de la désignation qui font la clé d'apprentissage : toutes, sauf une rangée suivante de lot ou de date
   * (elle change d'une facture à l'autre). */
  desCle: string[];
  ref: string[];
  unite: string[];
  qte: number | null;
  pu: number | null;
  puTtc: number | null;
  remise: number | null;
  tva: number | null;
  montant: number | null;
  ttc: number | null;
  nombres: { valeur: number; pourcent: boolean }[];
  rangees: Rangee[];
}

const vide = (): Brute => ({ des: [], desCle: [], ref: [], unite: [], qte: null, pu: null, puTtc: null, remise: null, tva: null, montant: null, ttc: null, nombres: [], rangees: [] });

/** Les nombres d'une rangée, hors désignation et hors colonnes TTC (une désignation porte souvent « 25 kg »). */
function nombresHorsDesignation(r: Rangee, colonnes: ColonneVue[] | null): { valeur: number; pourcent: boolean }[] {
  if (!colonnes) return nombresDeRangee(r).map((n) => ({ valeur: n.valeur, pourcent: n.pourcent }));
  const res: { valeur: number; pourcent: boolean }[] = [];
  for (const c of cellulesDeLigne(r)) {
    const col = colonneDe(c, colonnes);
    if (col.genre === 'des' || col.genre === 'ref' || col.genre === 'num' || col.genre === 'ttc' || col.genre === 'puttc') continue;
    const v = nombreDe(c.texte);
    if (v !== null) res.push({ valeur: v, pourcent: estPourcent(c.texte, col.genre) });
  }
  return res;
}

/**
 * Explique les nombres d'une rangée sans les colonnes : le montant est le dernier ; on cherche deux nombres dont le
 * produit (moins une remise lue en %) le donne ; un pourcentage restant (ou 0, 7, 13, 19…) est la TVA.
 */
export function deduire(nombres: { valeur: number; pourcent: boolean }[], tolerance: number):
  { qte: number; pu: number; remise: number | null; tva: number | null; montant: number } | null {
  const montants = nombres.filter((n) => !n.pourcent);
  if (montants.length < 3) return null;
  const montant = montants[montants.length - 1].valeur;
  const autres = montants.slice(0, -1);
  const pourcents = nombres.filter((n) => n.pourcent).map((n) => n.valeur);
  const remises = [null, ...pourcents.filter((p) => p > 0 && p < 100)];
  for (let i = autres.length - 2; i >= 0; i--) {
    for (let j = autres.length - 1; j > i; j--) {
      for (const r of remises) {
        const [q, p] = [autres[i].valeur, autres[j].valeur];
        if (!(q > 0) || !(p >= 0)) continue;
        if (Math.abs(q * p * (1 - (r ?? 0) / 100) - montant) <= tolerance) {
          const restants = pourcents.filter((x) => x !== r);
          const libres = autres.filter((_, k) => k !== i && k !== j).map((n) => n.valeur).filter((v) => TAUX_TUNISIENS.includes(v));
          const tva = restants.find((x) => TAUX_TUNISIENS.includes(x)) ?? libres[libres.length - 1] ?? null;
          return { qte: q, pu: p, remise: r, tva, montant };
        }
      }
    }
  }
  return null;
}

const cadreDe = (rangees: Rangee[]) => ({
  page: rangees[0].page,
  x0: Math.min(...rangees.flatMap((r) => r.mots.map((m) => m.x0))),
  y0: Math.min(...rangees.map((r) => r.y0)),
  x1: Math.max(...rangees.flatMap((r) => r.mots.map((m) => m.x1))),
  y1: Math.max(...rangees.map((r) => r.y1)),
});

function finaliser(b: Brute, source: SourceLue): LigneLue | null {
  const designation = b.des.join(' ').replace(/\s+/g, ' ').trim();
  if (!/\p{L}{2,}/u.test(designation)) return null;
  if (PAS_UNE_DESIGNATION.test(plat(designation))) return null;
  const tolerance = source === 'pdf' ? 0.0015 : 0.011;
  let { qte, pu, remise, tva, montant } = b;
  let aRelire = source === 'ocr';
  const juste = (q: number | null, p: number | null, r: number | null, m: number | null) =>
    q !== null && p !== null && m !== null && Math.abs(q * p * (1 - (r ?? 0) / 100) - m) <= Math.max(tolerance, Math.abs(m) * 0.00002);
  if (!juste(qte, pu, remise, montant)) {
    const d = deduire(b.nombres, tolerance);
    if (d) ({ qte, pu, remise, montant } = d);
    if (d && tva === null) tva = d.tva;
  }
  if (tva !== null && !(tva >= 0 && tva <= 30)) tva = null;
  // P.U. HT imprimé avec un montant TTC : le montant HT est quantité × prix (exact) ; le TTC ne sert que de contrôle.
  if (montant === null && b.ttc !== null && qte !== null && pu !== null) {
    montant = millime(qte * pu * (1 - (remise ?? 0) / 100));
    if (tva !== null && Math.abs(montant * (1 + tva / 100) - b.ttc) > Math.max(0.011, Math.abs(b.ttc) * 0.001)) aRelire = true;
  }
  // Colonnes TTC seules : ramenées en HT avec le taux de la ligne (sinon la fenêtre le fera avec le taux de la facture).
  const luEnTtc = montant === null && b.ttc !== null;
  if (luEnTtc) {
    aRelire = true;
    if (tva !== null) {
      montant = millime((b.ttc as number) / (1 + tva / 100));
      if (pu === null && b.puTtc !== null) pu = millime(b.puTtc / (1 + tva / 100));
    }
  } else if (pu === null && b.puTtc !== null && tva !== null) {
    pu = millime(b.puTtc / (1 + tva / 100));
    aRelire = true;
  }
  // Une valeur manquante se déduit des deux autres (à relire).
  if (montant === null && qte !== null && pu !== null && !luEnTtc) { montant = millime(qte * pu * (1 - (remise ?? 0) / 100)); aRelire = true; }
  if (pu === null && qte !== null && qte > 0 && montant !== null && (remise ?? 0) < 100) { pu = millime(montant / qte / (1 - (remise ?? 0) / 100)); aRelire = true; }
  if (qte === null && pu !== null && pu > 0 && montant !== null && (remise ?? 0) < 100) {
    const q = millime(montant / pu / (1 - (remise ?? 0) / 100));
    if (q >= 0.001 && juste(q, pu, remise, montant)) { qte = q; aRelire = true; }
  }
  if (montant === null && qte === null && pu === null && b.ttc === null) return null;
  const controle = qte !== null && pu !== null && montant !== null ? juste(qte, pu, remise, montant) : null;
  if (controle === false) aRelire = true;
  const unite = b.unite.join(' ').trim() || null;
  const reference = b.ref.join(' ').trim() || null;
  const cle = (b.desCle.length ? b.desCle.join(' ') : designation).replace(/\s+/g, ' ').trim();
  return {
    designation: designation.slice(0, 300), designationCle: cle.slice(0, 300),
    reference: reference ? reference.slice(0, 60) : null, unite: unite ? unite.slice(0, 30) : null,
    quantite: qte, prixUnitaire: pu, remise: remise && remise > 0 ? remise : null, tauxTva: tva, montant, controle, aRelire,
    luEnTtc, montantTtc: luEnTtc ? b.ttc : null, prixTtc: luEnTtc ? b.puTtc : null,
    cadre: cadreDe(b.rangees),
  };
}

/**
 * La rangée `suite` (sa désignation) prolonge-t-elle la désignation d'avant ? Jamais à une hauteur de texte ou plus (un
 * intertitre « BOISSONS » est séparé comme une ligne) ; oui juste dessous dans un PDF (moins d'une demi-hauteur : la
 * même cellule, « SAC 25 KG » sous « FARINE PATISSIERE » — sur une image, les positions lues ne sont pas assez sûres :
 * un débris de lecture se collerait) ou quand elle en a l'air (« (carton 48) », « de tournesol »). `chiffres` : une
 * suite qui porte un chiffre (« Carton 48 ») en est une — pas quand la suite est elle-même une ligne chiffrée.
 */
const prolonge = (precedente: string, suite: string, blanc: number, h: number, chiffres: boolean, pdf: boolean) => blanc < 0.9 * h
  && ((pdf && blanc < 0.5 * h) || /^[\p{Ll}(\d-]/u.test(suite.trim()) || (chiffres && /\d/.test(suite))
    || /\b(de|du|des|d|a|au|aux|en|et|pour|avec|sans)$|[,(-]$/.test(plat(precedente)));

/** Rangée de lot ou de date sous une désignation : hors de la clé apprise (elle change à chaque livraison). */
const LOT_OU_DATE = /\b(lot|dlc|ddm|dluo|exp|peremption|fab)\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{2}[/.-]20\d{2}\b/;

// Rangées sautées sans arrêter le tableau : une remise, un escompte ou un sous-total entre deux lignes, le report en
// haut d'une page suivante.
const SAUTEE = /^(sous[\s-]?total|remise\b|escompte|ristourne|report\b)/;
// Un total ou une taxe arrête le tableau même chiffré (« Total | 17 | 213,500 », « TVA 7% | 213,500 | 14,945 »).
const TOTAL_OU_TAXE = /^(total|totaux|sous[\s-]?total|net\s*a\s*pay|net\s*h\.?t|montant\s*(h\.?t|t\.?t\.?c|total|net|a\s*payer)|arrete|timbre|taux\b|tva\b|t\.v\.a\b|fodec|retenue|a\s*reporter)/;

/** Jeton d'une colonne N° ou Réf. collé à la désignation sur une image : un numéro, un code (chiffres et lettres). */
const estCode = (t: string, genre: Colonne) => (genre === 'num'
  ? /^[\p{L}\d]{1,3}\.?$/u.test(t) && (/\d/.test(t) || t === t.toUpperCase())
  : /\d/.test(t) && /^[\p{L}\d.\-/]{1,14}$/u.test(t));

/** Lignes d'un tableau à titres de colonnes, à partir de la rangée `debut` (le titre) d'une page. */
function lignesSousTitre(page: PageLue, debut: number, colonnes: ColonneVue[], source: SourceLue): { lignes: LigneLue[]; fin: number } {
  const lignes: LigneLue[] = [];
  let courante: Brute | null = null;
  let enAttente: Brute | null = null; // désignation seule, en attente de ses nombres (rangée suivante)
  const pousser = () => {
    if (courante) { const l = finaliser(courante, source); if (l) lignes.push(l); }
    courante = null;
  };
  const xFinTableau = Math.max(...colonnes.map((c) => c.x1));
  const xDebutTableau = Math.min(...colonnes.map((c) => c.x0));
  const colDes = colonnes.find((c) => c.genre === 'des');
  const colGauche = colDes ? colonnes.filter((c) => (c.genre === 'num' || c.genre === 'ref') && c.x1 <= colDes.x0).pop() : undefined;
  let i = debut + 1;
  for (; i < page.rangees.length; i++) {
    const r = page.rangees[i];
    const t = plat(r.texte);
    if (colonnesDuTitre(r)) break; // un autre tableau (ou le titre répété)
    // Rangée hors du tableau (texte loin à gauche ou à droite des colonnes) : ignorée.
    if (r.mots.every((m) => m.x1 < xDebutTableau - 2 * r.hauteur || m.x0 > xFinTableau + 2 * r.hauteur)) continue;
    const cs = cellulesDeLigne(r);
    // Numéro de ligne (ou référence) collé à la désignation : seulement des jetons de code qui COMMENCENT dans
    // l'emprise de la colonne de gauche et finissent avant le milieu des deux titres ; la désignation garde ses lettres.
    if (colDes && colGauche) {
      const limite = (colGauche.x1 + colDes.x0) / 2;
      for (let k = 0; k < cs.length; k++) {
        const c = cs[k];
        if (colonneDe(c, colonnes).genre !== 'des') continue;
        const avant: Mot[] = [];
        for (const m of c.mots) {
          if (avant.length < 2 && m.x0 < colGauche.x1 + 0.5 * r.hauteur && m.x1 <= limite + 0.2 * r.hauteur && estCode(m.t, colGauche.genre)) avant.push(m);
          else break;
        }
        const apres = c.mots.slice(avant.length);
        if (!avant.length || !apres.length || !/\p{L}{2,}/u.test(apres.map((m) => m.t).join(' '))) continue;
        cs.splice(k, 1,
          { mots: avant, texte: avant.map((m) => m.t).join(' '), x0: colGauche.x0, x1: colGauche.x1 },
          { mots: apres, texte: apres.map((m) => m.t).join(' '), x0: apres[0].x0, x1: Math.max(...apres.map((m) => m.x1)) });
        k++;
      }
    }
    const b = vide();
    b.rangees.push(r);
    for (const c of cs) {
      const col = colonneDe(c, colonnes);
      const v = nombreDe(c.texte);
      // Titre « Désignation » centré : une cellule de lettres qui commence après le titre N°/Réf. est une désignation
      // (« Oeufs », plus proche du titre N° que du sien), pas un code.
      const genre = colGauche && col === colGauche && c.x0 > colGauche.x1 && /\p{L}{2,}/u.test(c.texte) && !estCode(c.texte, colGauche.genre)
        ? 'des' : col.genre;
      switch (genre) {
        case 'des': b.des.push(c.texte); break;
        case 'ref': b.ref.push(c.texte); break;
        case 'num': break;
        // Un nombre sous « Unité » est un nombre mal rangé (titre voisin non lu) : le calcul le replacera.
        case 'unite': if (v === null || /\p{L}{2,}/u.test(c.texte)) b.unite.push(c.texte); break;
        case 'qte':
          if (v !== null) b.qte = v;
          else if (UNITE_SEULE.test(c.texte)) b.unite.push(c.texte);
          else { const m = c.texte.match(/^([\d.,]+)\s*(\p{L}+\.?)$/u); if (m) { b.qte = lireNombre(m[1]); b.unite.push(m[2]); } }
          break;
        case 'pu': if (v !== null) b.pu = v; break;
        case 'puttc': if (v !== null) b.puTtc = v; break;
        case 'remise': if (v !== null && estPourcent(c.texte, 'remise')) b.remise = v; break;
        case 'tva': if (v !== null && estPourcent(c.texte, 'tva')) b.tva = v; break;
        case 'montant': if (v !== null) b.montant = v; break;
        case 'ttc': if (v !== null) b.ttc = v; break;
      }
    }
    // Fin du tableau : une rangée de totaux SANS quantité ni prix (une désignation « Base pizza… » reste une ligne), ou
    // un total ou une taxe même chiffrés ; une remise ou un sous-total entre deux lignes est sauté.
    const chiffree = b.qte !== null || b.pu !== null || b.puTtc !== null;
    const premier = plat(cs[0]?.texte ?? '');
    const finLue = FIN.test(premier) || cs.some((c) => colonneDe(c, colonnes).genre !== 'des' && FIN.test(plat(c.texte)))
      || (MOT_FIN.test(t) && !cs.some((c) => colonneDe(c, colonnes).genre === 'des' && !MOT_FIN.test(plat(c.texte))));
    if ((finLue && !chiffree) || TOTAL_OU_TAXE.test(premier)) {
      if (SAUTEE.test(premier)) continue;
      break;
    }
    b.nombres = nombresHorsDesignation(r, colonnes);
    const aDesNombres = [b.qte, b.pu, b.montant, b.ttc, b.puTtc].some((x) => x !== null);
    const aUneDesignation = b.des.some((d) => /\p{L}/u.test(d));
    const texteDes = b.des.join(' ');
    if (aUneDesignation) b.desCle = [texteDes];
    const blancSous = (avant: Brute) => r.y0 - avant.rangees[avant.rangees.length - 1].y1;
    if (aUneDesignation && aDesNombres) {
      pousser();
      // Une désignation en attente n'est collée que si cette rangée en est la suite ; sinon c'était un intertitre.
      if (enAttente && prolonge(enAttente.des.join(' '), texteDes, blancSous(enAttente), r.hauteur, false, source === 'pdf')) {
        b.des.unshift(...enAttente.des); b.ref.unshift(...enAttente.ref); b.rangees.unshift(...enAttente.rangees);
        b.desCle = [...enAttente.desCle, ...(LOT_OU_DATE.test(plat(texteDes)) ? [] : [texteDes])];
      }
      enAttente = null;
      courante = b;
    } else if (aUneDesignation) {
      // Suite de la désignation précédente (rangée proche, qui la prolonge), sinon une ligne dont les nombres suivent.
      const prec = courante as Brute | null;
      if (prec && !b.ref.length && prolonge(prec.des.join(' '), texteDes, blancSous(prec), r.hauteur, true, source === 'pdf')) {
        prec.des.push(...b.des);
        if (!LOT_OU_DATE.test(plat(texteDes))) prec.desCle.push(texteDes);
        prec.rangees.push(r);
      } else {
        pousser();
        enAttente = b;
      }
    } else if (aDesNombres && enAttente) {
      b.des = enAttente.des; b.desCle = enAttente.desCle; b.ref = [...enAttente.ref, ...b.ref]; b.rangees.unshift(...enAttente.rangees);
      enAttente = null;
      pousser();
      courante = b;
    }
  }
  pousser();
  return { lignes, fin: i };
}

// Ticket de caisse : « 2 x 1.350 » (quantité x prix), le montant au bout, la désignation sur la rangée au-dessus.
const QTE_X_PRIX = /^(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d[\d.,]*)/i;

function lignesDeTicket(page: PageLue, source: SourceLue): LigneLue[] {
  const lignes: LigneLue[] = [];
  page.rangees.forEach((r, i) => {
    const m = plat(r.texte).match(QTE_X_PRIX);
    if (!m) return;
    const q = lireNombre(m[1]);
    const pu = lireNombre(m[2]);
    const ns = nombresDeRangee(r).filter((n) => !n.pourcent);
    const montant = ns.length >= 3 ? ns[ns.length - 1].valeur : null;
    const avant = page.rangees[i - 1];
    if (!avant || QTE_X_PRIX.test(plat(avant.texte))) return;
    const b = vide();
    b.des = [avant.texte];
    b.desCle = [avant.texte];
    b.qte = q; b.pu = pu; b.montant = montant;
    b.nombres = ns.map((n) => ({ valeur: n.valeur, pourcent: false }));
    b.rangees = [avant, r];
    const l = finaliser(b, source);
    if (l) lignes.push(l);
  });
  return lignes;
}

// Rangées qui ne sont jamais des lignes de facture (coordonnées, identifiants, mentions).
const PAS_UNE_LIGNE = /\b(tel|fax|gsm|mob|e-?mail|m\.?\s?f\b|matricule|code\s+t\.?v\.?a|r\.?\s?c\b|rib|iban|capital|adresse|date|facture|client|page)\b|@/;

/**
 * Sans titre de colonnes lisible (photo) : une rangée est une ligne si elle porte une désignation (après un éventuel n°
 * ou code) puis des nombres dont deux, multipliés (moins une remise lue en %), donnent le dernier. Seules ces lignes
 * vérifiées sont gardées.
 */
function lignesSansTitre(page: PageLue, source: SourceLue): LigneLue[] {
  const lignes: LigneLue[] = [];
  const tolerance = source === 'pdf' ? 0.0015 : 0.011;
  for (const r of page.rangees) {
    const t = plat(r.texte);
    if (FIN.test(t) || MOT_FIN.test(t) || PAS_UNE_LIGNE.test(t)) continue;
    const cs = cellulesDeLigne(r);
    const debut = cs.findIndex((c) => /\p{L}{2,}/u.test(c.texte));
    if (debut < 0 || cs.slice(0, debut).some((c) => !/^[\p{L}\d.\-/]{1,14}$/u.test(c.texte))) continue;
    let k = debut;
    while (k < cs.length && /\p{L}{2,}/u.test(cs[k].texte)) k++;
    const des = cs.slice(debut, k);
    if (!des.length || k >= cs.length) continue;
    const nombres = cs.slice(k).map((c) => ({ v: nombreDe(c.texte), pourcent: /%/.test(c.texte) })).filter((x) => x.v !== null)
      .map((x) => ({ valeur: x.v as number, pourcent: x.pourcent }));
    const d = deduire(nombres, tolerance);
    if (!d) continue;
    const b = vide();
    b.des = des.map((c) => c.texte);
    b.desCle = [b.des.join(' ')];
    b.ref = cs.slice(0, debut).filter((c) => /\p{L}/u.test(c.texte) || c.texte.replace(/\D/g, '').length > 2).map((c) => c.texte);
    b.qte = d.qte; b.pu = d.pu; b.remise = d.remise; b.tva = d.tva; b.montant = d.montant;
    b.nombres = nombres;
    b.rangees = [r];
    const l = finaliser(b, source);
    if (l?.controle) lignes.push(l);
  }
  return lignes;
}

// ── Étape F5 : la mise en page apprise d'un fournisseur ─────────────────────────────────────────────────────────────

/** Genres de colonnes admis dans une mise en page (le serveur contrôle la même liste). */
export const GENRES_COLONNES: readonly Colonne[] = ['num', 'ref', 'des', 'unite', 'qte', 'pu', 'puttc', 'remise', 'tva', 'montant', 'ttc'];

/** Colonnes connues ramenées à la page lue (unités de la page) — par le cadre de la page droite pour une image, au milieu
 * de sa hauteur. */
const colonnesConnues = (m: MiseEnPage, page: PageLue): ColonneVue[] => m.colonnes.map((c) => {
  const x0 = page.cadre ? page.cadre.depuisFraction(c.x0, 0.5).x : c.x0 * page.largeur;
  const x1 = page.cadre ? page.cadre.depuisFraction(c.x1, 0.5).x : c.x1 * page.largeur;
  return { genre: c.genre, x0: Math.min(x0, x1), x1: Math.max(x0, x1) };
}).sort((a, b) => a.x0 - b.x0);

/** Colonnes d'un titre lu, complétées par les colonnes connues : un genre absent du titre (mal reconnu) est ajouté s'il ne
 * recouvre aucune colonne lue. */
function completerColonnes(lues: ColonneVue[], connues: ColonneVue[]): ColonneVue[] {
  const genres = new Set(lues.map((c) => c.genre));
  const ajout = connues.filter((c) => !genres.has(c.genre) && !lues.some((l) => Math.min(l.x1, c.x1) - Math.max(l.x0, c.x0) > 0));
  return ajout.length ? [...lues, ...ajout].sort((a, b) => a.x0 - b.x0) : lues;
}

/** Première rangée qui ressemble à une ligne de facture (des lettres, puis des nombres, ni total ni coordonnées). */
function debutDesLignes(page: PageLue): number {
  return page.rangees.findIndex((r) => {
    const t = plat(r.texte);
    if (FIN.test(t) || MOT_FIN.test(t) || PAS_UNE_LIGNE.test(t) || TOTAL_OU_TAXE.test(t)) return false;
    const cs = cellulesDeLigne(r);
    return cs.some((c) => /\p{L}{3,}/u.test(c.texte)) && cs.filter(estNombre).length >= 2;
  });
}

/** Le cadre de la page est la feuille (texte d'un PDF, feuille recadrée d'une photo, scan) : une mise en page s'y apprend
 * et s'y applique. */
const cadreFeuille = (page: PageLue) => !page.cadre || page.cadre.feuille;

/** Mise en page lue : les colonnes du premier tableau dont des lignes ont été lues, en fractions du cadre de la page (à la
 * hauteur `y` du titre). */
function miseEnPageVue(page: PageLue, colonnes: ColonneVue[], y: number): MiseEnPage | null {
  if (!page.largeur || colonnes.length < 2 || !cadreFeuille(page)) return null;
  const fraction = (x: number) => (page.cadre ? page.cadre.versFraction(x, y).x : x / page.largeur);
  return { colonnes: colonnes.map((c) => ({ genre: c.genre, x0: Math.max(0, fraction(c.x0)), x1: Math.min(1, fraction(c.x1)) })) };
}

/**
 * Lignes de la facture, toutes pages lues, dans l'ordre, et la mise en page vue (étape F5 : à apprendre). `modele` : la
 * mise en page connue du fournisseur — elle complète un titre mal lu, ou remplace un titre illisible.
 */
export function lireTableaux(pages: readonly PageLue[], source: SourceLue, modele: MiseEnPage | null = null): { lignes: LigneLue[]; miseEnPage: MiseEnPage | null; modeleEmploye: boolean } {
  const res: LigneLue[] = [];
  let vue: MiseEnPage | null = null;
  let employe = false;
  for (const page of pages) {
    // Photo non recadrée (table autour) : les fractions de la feuille y tomberaient à côté — la mise en page n'y sert pas.
    const connues = modele && cadreFeuille(page) ? colonnesConnues(modele, page) : null;
    let trouve = false;
    for (let i = 0; i < page.rangees.length; i++) {
      const titre = colonnesDuTitre(page.rangees[i]);
      if (!titre) continue;
      const colonnes = connues ? completerColonnes(titre, connues) : titre;
      if (colonnes !== titre) employe = true;
      const { lignes, fin } = lignesSousTitre(page, i, colonnes, source);
      if (lignes.length) {
        res.push(...lignes);
        trouve = true;
        if (!vue) vue = miseEnPageVue(page, titre, (page.rangees[i].y0 + page.rangees[i].y1) / 2);
      }
      i = fin - 1;
    }
    // Titre illisible, fournisseur connu : le tableau se lit avec ses colonnes apprises.
    if (!trouve && connues) {
      const debut = debutDesLignes(page);
      if (debut >= 0) {
        const { lignes } = lignesSousTitre(page, debut - 1, connues, source);
        if (lignes.length) { res.push(...lignes); trouve = true; employe = true; }
      }
    }
    if (!trouve) {
      const ticket = lignesDeTicket(page, source);
      res.push(...(ticket.length ? ticket : lignesSansTitre(page, source)));
    }
  }
  return { lignes: res, miseEnPage: vue, modeleEmploye: employe };
}

/** Lignes de la facture, toutes pages lues, dans l'ordre. */
export function lireLignes(pages: readonly PageLue[], source: SourceLue, modele: MiseEnPage | null = null): LigneLue[] {
  return lireTableaux(pages, source, modele).lignes;
}

/** Rangée faite d'une cellule (aide aux tests). */
export const rangeeDe = (mots: Mot[], page = 1): Rangee => rangee(mots, page);
