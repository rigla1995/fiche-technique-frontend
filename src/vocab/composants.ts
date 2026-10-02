// Composants d'un domaine (lot 2b, spec §4.2) : Restaurant, Bar, Cuisine, Économat…, et les 4 composants
// « identité » (Activité, Labo, Gérant, Base acheteurs) créés avec le libellé du brouillon.
//   entreeComposant(c)                    entrée de lexique d'un composant (son libellé), pour l'accorder
//   entreeComposantVoc(voc, c)            idem dans le vocabulaire du compte (table identité) : voc.avec(entreeComposantVoc(voc, c)).mon('_')
//   libelleComposant(voc, c, n, casse)    libellé d'un composant dans le vocabulaire du compte
// Même règle au serveur et à l'écran : SOURCE UNIQUE, recopiée dans le backend (`src/utils/vocab.js`) par
// `node scripts/sync-vocab-back.mjs`. Module PUR : aucun import d'exécution, syntaxe TypeScript effaçable uniquement.
import type { Casse, EntreeLexique, Nombre, Vocab } from './vocab.ts';

/** Composant tel que le renvoie l'API (camelCase) ou tel que le lit une requête (colonnes snake_case). */
export interface ComposantLibelle {
  code?: string | null;
  libelle: string;
  libellePluriel?: string | null;
  libelle_pluriel?: string | null;
  /** 'm' | 'f' (migration 192) ; absent → masculin. */
  genre?: string | null;
  /**
   * true | false ; null, 'auto' ou absent → déduite de l'initiale (voyelle : oui ; y, h et consonne : non).
   * 'auto' est le synonyme de null admis par l'admin (domainesController.validateComposant) : jamais stocké,
   * mais un aperçu d'écran construit sur l'état du formulaire peut le porter.
   */
  elision?: boolean | 'auto' | null;
  typeTechnique?: string | null;
  type_technique?: string | null;
}

/**
 * Entrée de lexique d'un composant : son libellé, son pluriel (le libellé s'il est absent), son genre et son élision.
 * Une élision qui n'est pas un booléen (null, 'auto', absente) est « déduite » : « h » et « y » donnent non ; l'admin
 * la force pour un h muet (« Huilerie » : élision vraie → « mon huilerie ») ou pour un cas que la règle rate.
 */
export function entreeComposant(c: ComposantLibelle): EntreeLexique {
  return {
    sg: c.libelle,
    pl: c.libellePluriel || c.libelle_pluriel || c.libelle,
    g: c.genre === 'f' ? 'f' : 'm',
    el: typeof c.elision === 'boolean' ? c.elision : /^[aeiouàâäæéèêëîïôöœùûü]/i.test(c.libelle),
  };
}

// Le libellé stocké est-il celui du brouillon identité (singulier ET pluriel, comme le contrôle avant déploiement) ?
const brouillon = (c: ComposantLibelle, sg: string, pl: string): boolean =>
  c.libelle === sg && (c.libellePluriel ?? c.libelle_pluriel ?? null) === pl;

type TypeIdentite = 'activite' | 'labo' | 'gerant' | 'acheteurs';

// Table fermée des composants identité (code = type technique) au libellé du brouillon ; null pour tout autre
// composant, composant identité renommé par l'admin compris.
const identiteAuBrouillon = (c: ComposantLibelle): TypeIdentite | null => {
  const type = c.typeTechnique ?? c.type_technique ?? null;
  if (type === null || c.code !== type) return null;
  if (type === 'activite' && brouillon(c, 'Activité', 'Activités')) return 'activite';
  if (type === 'labo' && brouillon(c, 'Labo', 'Labos')) return 'labo';
  if (type === 'gerant' && brouillon(c, 'Gérant', 'Gérants')) return 'gerant';
  if (type === 'acheteurs' && brouillon(c, 'Base acheteurs', 'Base acheteurs')) return 'acheteurs';
  return null;
};

/**
 * Libellé d'un composant dans le vocabulaire du compte (`n` : nombre ou booléen, comme le moteur ; `casse` : 'Nom' par
 * défaut, la forme stockée).
 * - Composant identité (code = type technique) au libellé du brouillon → terme du lexique, table fermée :
 *   activite « Activité » / « Activités », labo « Labo » / « Labos », gerant « Gérant » / « Gérants » → voc[casse](clé, n) ;
 *   acheteurs « Base acheteurs » → `Base ${voc.court('acheteur', true)}`, invariable (même texte que l'écran Mon abonnement).
 * - Tout autre cas, composant identité renommé par l'admin compris → libellé du composant, dans la casse et le nombre
 *   demandés (avec le vocabulaire par défaut et la casse 'Nom' : `libelle` au singulier, `libellePluriel` au pluriel).
 */
export function libelleComposant(voc: Vocab, c: ComposantLibelle, n?: Nombre, casse: Casse = 'Nom'): string {
  const identite = identiteAuBrouillon(c);
  if (identite === 'activite') return voc[casse]('activite', n);
  if (identite === 'labo') return voc[casse]('labo', n);
  if (identite === 'gerant') return voc[casse]('gerant', n);
  if (identite === 'acheteurs') return `Base ${voc.court('acheteur', true)}`;
  return voc.avec(entreeComposant(c))[casse]('_', n);
}

/**
 * Entrée de lexique d'un composant DANS LE VOCABULAIRE DU COMPTE, pour l'accorder avec un déterminant :
 * `voc.avec(entreeComposantVoc(voc, c)).mon('_', n)` (seulement nom, Nom, mon et mes, spec §6.4). Même table fermée
 * que libelleComposant :
 * - composant identité au libellé du brouillon → le TERME du lexique : formes Nom / Pl, genre et élision du terme
 *   (Hôtellerie : « mon service », « ma cuisine centrale », « mon responsable de service ») ; « Base acheteurs » →
 *   `Base ${voc.court('acheteur', true)}`, invariable, féminin (« ma base clients professionnels ») ;
 * - tout autre composant, composant identité renommé compris → entreeComposant(c), son libellé.
 * Avec le vocabulaire par défaut, le rendu est celui de entreeComposant(c) pour les 4 composants identité tels que la
 * migration 192 les laisse (Activité et Base acheteurs au féminin).
 */
export function entreeComposantVoc(voc: Vocab, c: ComposantLibelle): EntreeLexique {
  const identite = identiteAuBrouillon(c);
  if (identite === 'activite') {
    return { sg: voc.Nom('activite'), pl: voc.Pl('activite'), g: voc.acc('activite', 'm', 'f') === 'f' ? 'f' : 'm', el: /^l'/.test(voc.le('activite')) };
  }
  if (identite === 'labo') {
    return { sg: voc.Nom('labo'), pl: voc.Pl('labo'), g: voc.acc('labo', 'm', 'f') === 'f' ? 'f' : 'm', el: /^l'/.test(voc.le('labo')) };
  }
  if (identite === 'gerant') {
    return { sg: voc.Nom('gerant'), pl: voc.Pl('gerant'), g: voc.acc('gerant', 'm', 'f') === 'f' ? 'f' : 'm', el: /^l'/.test(voc.le('gerant')) };
  }
  if (identite === 'acheteurs') {
    const base = `Base ${voc.court('acheteur', true)}`;
    return { sg: base, pl: base, g: 'f', el: false };
  }
  return entreeComposant(c);
}
