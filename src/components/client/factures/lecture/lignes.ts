// Lecture des LIGNES d'une facture fournisseur (étape F3 — labflow-reprise/achats-compta/PLAN-FACTURES.md §4 « La
// lecture »). Fonctions PURES, sur les rangées de la page (texte d'un PDF ou reconnaissance de caractères).
//   1. le titre du tableau (« Désignation | Qté | P.U. HT | TVA | Montant ») donne les colonnes ;
//   2. chaque rangée suivante est découpée en cellules (blancs larges), chaque cellule rangée sous sa colonne ;
//   3. une rangée sans nombre prolonge la désignation de la précédente (désignation sur deux lignes) ;
//   4. le tableau s'arrête aux totaux (« Total HT », « Net à payer », récapitulatif de TVA…) ;
//   5. contrôle de chaque ligne : quantité × prix − remise = montant ; s'il est faux, les nombres de la rangée sont
//      relus sans les colonnes (une cellule mal rangée sur une photo) ; une valeur manquante se déduit des deux autres.
// Sans titre de colonnes (ticket de caisse : « LAIT 1L » puis « 2 x 1.350   2.700 »), la forme « quantité x prix »
// suffit. Une ligne lue n'est qu'une proposition : la fenêtre « Vérifier la facture » la fait relire et valider.
import { lireNombre, millime, nombresDeRangee } from './nombres.ts';
import { rangee } from './rangees.ts';
import type { LigneLue, Mot, PageLue, Rangee, SourceLue } from './types.ts';

const plat = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

type Colonne = 'num' | 'ref' | 'des' | 'unite' | 'qte' | 'pu' | 'remise' | 'tva' | 'montant' | 'ttc';
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
 * lu « Ote », « Tva) »). L'ordre compte : « Montant TTC » avant « Montant », « Code article » avant « Article ».
 */
export function genreDeTitre(texte: string): Colonne | null {
  const t = plat(texte).replace(/[:()[\]|"“”'`’]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/^(n\s?[°ºo]\.?|no\.?|#|n)$/.test(t)) return 'num';
  if (/t\.?\s?t\.?\s?c/.test(t)) return 'ttc';
  if (/^(code|ref|refe|reference)\b|^ref\.|\b(code|ref)\b/.test(t)) return 'ref';
  if (/(designat|libelle|descript|article|produit|intitule|nature)/.test(t)) return 'des';
  if (/(remise|escompte|ristourne|^rem\b|^%\s?r\b|^r\s?%)/.test(t)) return 'remise';
  if (/(t\.?\s?v\.?\s?a|taux|taxe)/.test(t)) return 'tva';
  if (/(^|\s)p\.?\s?u(\b|h|\.)|prix\s*u|^prix$|^pu/.test(t)) return 'pu';
  if (/(^|\s)(qte|qt|quantit|qty|nbre|nombre|colis)|^[qo0]t[e]s?\.?$/.test(t)) return 'qte';
  if (/(montant|total|^mt\b|valeur)/.test(t)) return 'montant';
  if (/^(u|um|u\.?\s?m|cond|conditionnement|uv)\.?$/.test(t) || (t.length <= 9 && /unit/.test(t))) return 'unite';
  return null;
}

/** Colonnes du tableau si `r` en est le titre : au moins la désignation et une colonne chiffrée. */
export function colonnesDuTitre(r: Rangee): ColonneVue[] | null {
  const vues: ColonneVue[] = [];
  for (const c of cellules(r)) {
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
  if (!['qte', 'pu', 'montant', 'tva'].some((g) => genres.has(g as Colonne))) return null;
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

// Fin du tableau : une rangée de totaux, le récapitulatif de TVA, la somme « arrêtée », un report de page.
const FIN = /^(total|totaux|sous[\s-]?total|net\s*a\s*pay|net\s*h\.?t|montant\s*(h\.?t|t\.?t\.?c|total|net|a\s*payer)|arrete|timbre|base\b|taux\b|tva\s*\d|t\.v\.a\b|remise\s*(globale|totale)|report|a\s*reporter|fodec|avance|retenue|solde|cachet|signature|merci|mode\s+de\s+r)/;
const MOT_FIN = /\b(total\s*(h\.?t|t\.?t\.?c|net|brut)?|net\s*a\s*pay\w*|arrete\w*|timbre|a\s*reporter)\b/;

const UNITE_SEULE = /^(kg|g|gr|l|lt|ml|cl|u|pc|pcs|pi[eè]ce?s?|sac|sacs|carton|ctn|crt|pack|bidon|bouteille|btl|boite|bte|paquet|pqt|plateau|botte|rouleau|casier|caisse|colis|fardeau|douzaine|dz|unite|unit)\.?$/i;

/** Nombre d'une cellule (« 1 234,567 », « 19 % », « 5% », « 8,700) » d'une image) ; null si ce n'en est pas un. */
function nombreDe(texte: string): number | null {
  const t = texte.replace(/\s*(%|dt|tnd|d)\s*$/i, '').replace(/^[^\d-]+|[^\d]+$/g, '').trim();
  if (!/^-?\d/.test(t)) return null;
  return lireNombre(t);
}
/** Un pourcentage (taux de TVA, remise) : « 19 % », ou un petit nombre sans millimes sous un titre de taux. */
const estPourcent = (texte: string, genre: Colonne) => /%/.test(texte) || ((genre === 'tva' || genre === 'remise') && !/[.,]\d{3}\D*$/.test(texte));
const TAUX_TUNISIENS = [0, 6, 7, 12, 13, 19];

interface Brute {
  des: string[];
  ref: string[];
  unite: string[];
  qte: number | null;
  pu: number | null;
  remise: number | null;
  tva: number | null;
  montant: number | null;
  ttc: number | null;
  nombres: { valeur: number; pourcent: boolean }[];
  rangees: Rangee[];
}

const vide = (): Brute => ({ des: [], ref: [], unite: [], qte: null, pu: null, remise: null, tva: null, montant: null, ttc: null, nombres: [], rangees: [] });

/** Les nombres d'une rangée, hors désignation (une désignation porte souvent « 25 kg », « 1,5 L »). */
function nombresHorsDesignation(r: Rangee, colonnes: ColonneVue[] | null): { valeur: number; pourcent: boolean }[] {
  if (!colonnes) return nombresDeRangee(r).map((n) => ({ valeur: n.valeur, pourcent: n.pourcent }));
  const res: { valeur: number; pourcent: boolean }[] = [];
  for (const c of cellulesDeLigne(r)) {
    const col = colonneDe(c, colonnes);
    if (col.genre === 'des' || col.genre === 'ref' || col.genre === 'num') continue;
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
  if (FIN.test(plat(designation))) return null;
  const tolerance = source === 'pdf' ? 0.0015 : 0.011;
  let { qte, pu, remise, tva, montant } = b;
  let aRelire = source === 'ocr';
  const juste = (q: number | null, p: number | null, r: number | null, m: number | null) =>
    q !== null && p !== null && m !== null && Math.abs(q * p * (1 - (r ?? 0) / 100) - m) <= Math.max(tolerance, m * 0.00002);
  if (!juste(qte, pu, remise, montant)) {
    const d = deduire(b.nombres, tolerance);
    if (d) ({ qte, pu, remise, montant } = d);
    if (d && tva === null) tva = d.tva;
  }
  // Une valeur manquante se déduit des deux autres (à relire).
  if (montant === null && qte !== null && pu !== null) { montant = millime(qte * pu * (1 - (remise ?? 0) / 100)); aRelire = true; }
  if (pu === null && qte !== null && qte > 0 && montant !== null) { pu = millime(montant / qte / (1 - (remise ?? 0) / 100)); aRelire = true; }
  if (qte === null && pu !== null && pu > 0 && montant !== null) {
    const q = millime(montant / pu / (1 - (remise ?? 0) / 100));
    if (q >= 0.001 && juste(q, pu, remise, montant)) { qte = q; aRelire = true; }
  }
  if (montant === null && qte === null && pu === null) return null;
  if (tva !== null && !(tva >= 0 && tva <= 30)) tva = null;
  const controle = qte !== null && pu !== null && montant !== null ? juste(qte, pu, remise, montant) : null;
  if (controle === false) aRelire = true;
  const unite = b.unite.join(' ').trim() || null;
  const reference = b.ref.join(' ').trim() || null;
  return {
    designation: designation.slice(0, 300), reference: reference ? reference.slice(0, 60) : null, unite: unite ? unite.slice(0, 30) : null,
    quantite: qte, prixUnitaire: pu, remise: remise && remise > 0 ? remise : null, tauxTva: tva, montant, controle, aRelire,
    cadre: cadreDe(b.rangees),
  };
}

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
  let i = debut + 1;
  for (; i < page.rangees.length; i++) {
    const r = page.rangees[i];
    const t = plat(r.texte);
    if (colonnesDuTitre(r)) break; // un autre tableau (ou le titre répété)
    const cs = cellulesDeLigne(r);
    const premier = plat(cs[0]?.texte ?? '');
    if (FIN.test(premier) || cs.some((c) => colonneDe(c, colonnes).genre !== 'des' && FIN.test(plat(c.texte)))) break;
    if (MOT_FIN.test(t) && !cs.some((c) => colonneDe(c, colonnes).genre === 'des' && !MOT_FIN.test(plat(c.texte)))) break;
    // Rangée hors du tableau (texte loin à gauche ou à droite des colonnes) : ignorée.
    if (r.mots.every((m) => m.x1 < xDebutTableau - 2 * r.hauteur || m.x0 > xFinTableau + 2 * r.hauteur)) continue;
    const b = vide();
    b.rangees.push(r);
    // Numéro de ligne (ou référence) collé à la désignation sur une image : les mots qui finissent avant le titre
    // « Désignation » vont à la colonne de gauche.
    const colDes = colonnes.find((c) => c.genre === 'des');
    const colGauche = colDes ? colonnes.filter((c) => (c.genre === 'num' || c.genre === 'ref') && c.x1 <= colDes.x0).pop() : undefined;
    if (colDes && colGauche) {
      for (let k = 0; k < cs.length; k++) {
        const c = cs[k];
        if (colonneDe(c, colonnes).genre !== 'des') continue;
        const avant = c.mots.filter((m) => m.x1 < colDes.x0);
        if (!avant.length || avant.length === c.mots.length) continue;
        const apres = c.mots.slice(avant.length);
        cs.splice(k, 1,
          { mots: avant, texte: avant.map((m) => m.t).join(' '), x0: colGauche.x0, x1: colGauche.x1 },
          { mots: apres, texte: apres.map((m) => m.t).join(' '), x0: apres[0].x0, x1: Math.max(...apres.map((m) => m.x1)) });
        k++;
      }
    }
    for (const c of cs) {
      const col = colonneDe(c, colonnes);
      const v = nombreDe(c.texte);
      switch (col.genre) {
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
        case 'remise': if (v !== null && estPourcent(c.texte, 'remise')) b.remise = v; break;
        case 'tva': if (v !== null && estPourcent(c.texte, 'tva')) b.tva = v; break;
        case 'montant': if (v !== null) b.montant = v; break;
        case 'ttc': if (v !== null) b.ttc = v; break;
      }
    }
    b.nombres = nombresHorsDesignation(r, colonnes);
    const aDesNombres = [b.qte, b.pu, b.montant].some((x) => x !== null);
    const aUneDesignation = b.des.some((d) => /\p{L}/u.test(d));
    if (aUneDesignation && aDesNombres) {
      pousser();
      if (enAttente) { b.des.unshift(...enAttente.des); b.ref.unshift(...enAttente.ref); b.rangees.unshift(...enAttente.rangees); enAttente = null; }
      courante = b;
    } else if (aUneDesignation) {
      // Suite de la désignation précédente (rangée proche), sinon début d'une ligne dont les nombres suivent.
      const prec = courante as Brute | null;
      const derniere = prec?.rangees[prec.rangees.length - 1];
      if (prec && derniere && r.y0 - derniere.y1 < 0.9 * r.hauteur && !b.ref.length) {
        prec.des.push(...b.des);
        prec.rangees.push(r);
      } else {
        pousser();
        enAttente = b;
      }
    } else if (aDesNombres && enAttente) {
      b.des = enAttente.des; b.ref = [...enAttente.ref, ...b.ref]; b.rangees.unshift(...enAttente.rangees);
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
 * Sans titre de colonnes lisible (photo) : une rangée est une ligne si elle porte une désignation puis des nombres dont
 * deux, multipliés (moins une remise lue en %), donnent le dernier. Seules ces lignes vérifiées sont gardées.
 */
function lignesSansTitre(page: PageLue, source: SourceLue): LigneLue[] {
  const lignes: LigneLue[] = [];
  const tolerance = source === 'pdf' ? 0.0015 : 0.011;
  for (const r of page.rangees) {
    const t = plat(r.texte);
    if (FIN.test(t) || MOT_FIN.test(t) || PAS_UNE_LIGNE.test(t)) continue;
    const cs = cellulesDeLigne(r);
    const k = cs.findIndex((c) => !/\p{L}{2,}/u.test(c.texte));
    const des = (k < 0 ? cs : cs.slice(0, k)).filter((c) => /\p{L}{2,}/u.test(c.texte));
    if (!des.length || k < 0) continue;
    const nombres = cs.slice(k).map((c) => ({ v: nombreDe(c.texte), pourcent: /%/.test(c.texte) })).filter((x) => x.v !== null)
      .map((x) => ({ valeur: x.v as number, pourcent: x.pourcent }));
    const d = deduire(nombres, tolerance);
    if (!d) continue;
    const b = vide();
    b.des = des.map((c) => c.texte);
    b.qte = d.qte; b.pu = d.pu; b.remise = d.remise; b.tva = d.tva; b.montant = d.montant;
    b.nombres = nombres;
    b.rangees = [r];
    const l = finaliser(b, source);
    if (l?.controle) lignes.push(l);
  }
  return lignes;
}

/** Lignes de la facture, toutes pages lues, dans l'ordre. */
export function lireLignes(pages: readonly PageLue[], source: SourceLue): LigneLue[] {
  const res: LigneLue[] = [];
  for (const page of pages) {
    let trouve = false;
    for (let i = 0; i < page.rangees.length; i++) {
      const colonnes = colonnesDuTitre(page.rangees[i]);
      if (!colonnes) continue;
      const { lignes, fin } = lignesSousTitre(page, i, colonnes, source);
      if (lignes.length) { res.push(...lignes); trouve = true; }
      i = fin - 1;
    }
    if (!trouve) {
      const ticket = lignesDeTicket(page, source);
      res.push(...(ticket.length ? ticket : lignesSansTitre(page, source)));
    }
  }
  return res;
}

/** Rangée faite d'une cellule (aide aux tests). */
export const rangeeDe = (mots: Mot[], page = 1): Rangee => rangee(mots, page);
