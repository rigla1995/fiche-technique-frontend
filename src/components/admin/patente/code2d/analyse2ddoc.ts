// Structure d'un code « 2D-DOC » tunisien (DataMatrix des extraits RNE et des cartes d'auto-entrepreneur), et ce que
// la fiche d'identité légale peut en reprendre. Fonctions pures (ni DOM, ni zxing, ni pdf.js), testées par
// scripts/patente-code2d.test.mjs.
//
//   en-tête de 26 caractères : « DC » | version « 04 » | autorité (4) | certificat (4) | date d'émission (4 hex)
//        | date de signature (4 hex) | type de document (2) | périmètre (2) | pays (2)
//   zone de message : une chaîne HEXADÉCIMALE de triplets « étiquette de 2 caractères ASCII + longueur sur 1 octet
//        + valeur en UTF-8 » (variante tunisienne : la norme française utilise C40 et des séparateurs GS/RS)
//   puis 0x1F et la signature (signature.ts).
// Les dates de l'en-tête sont des nombres de jours depuis le 01/01/2000 (« FFFF » : pas de date).
// Structure et étiquettes DÉDUITES de deux documents réels (un extrait RNE, une carte d'auto-entrepreneur) : elles
// ne viennent d'aucune norme publiée. Dans le code, les noms, adresses et qualités sont en arabe seulement.
import type { Cachet, ChampIdentite, ChampLu, LectureCode2d, TypeDocument } from '../types.ts';
import { texteChamp } from '../types.ts';
import type { MotifSignature } from './signature.ts';
import { CLES_PUBLIQUES, verifierSignature } from './signature.ts';

export interface Entete2dDoc {
  version: string;
  /** Autorité de certification (« TN01 ») et identifiant du certificat (« 0148 »). */
  autorite: string;
  certificat: string;
  /** Dates d'émission et de signature, « aaaa-mm-jj », ou null. */
  dateEmission: string | null;
  dateSignature: string | null;
  /** Type de document : « H1 » extrait RNE, « DP » carte d'auto-entrepreneur. */
  typeDocument: string;
  perimetre: string;
  pays: string;
}

export interface Donnee2dDoc {
  etiquette: string;
  valeur: string;
}

/**
 * Résultat de l'analyse. Échec avec `entete: null` : le texte n'est pas un code 2D-DOC (ou d'une version non prise
 * en charge). Échec avec un en-tête : la zone de message est tronquée ou mal formée.
 */
export type Analyse2dDoc =
  | { ok: true; entete: Entete2dDoc; donnees: Donnee2dDoc[]; donneesSignees: string; signature: string | null }
  | { ok: false; erreur: string; entete: Entete2dDoc | null; donneesSignees: string; signature: string | null };

const SEPARATEUR = '\x1f';
const LONGUEUR_ENTETE = 26;
const ENTETE = /^DC(\d{2})([0-9A-Z]{4})([0-9A-Z]{4})([0-9A-F]{4})([0-9A-F]{4})([0-9A-Z]{2})([0-9A-Z]{2})([A-Z]{2})$/;

/** Date de l'en-tête : 4 chiffres hexadécimaux, jours depuis le 01/01/2000 → « aaaa-mm-jj » ; « FFFF » → null. */
export function dateDepuisJours(hex: string): string | null {
  if (!/^[0-9A-F]{4}$/i.test(hex) || hex.toUpperCase() === 'FFFF') return null;
  return new Date(Date.UTC(2000, 0, 1) + parseInt(hex, 16) * 86_400_000).toISOString().slice(0, 10);
}

/** Texte lu dans le DataMatrix → en-tête, données (étiquette, valeur), données signées, signature. Ne lève rien. */
export function analyser2dDoc(texte: string): Analyse2dDoc {
  const brut = typeof texte === 'string' ? texte : '';
  const coupe = brut.indexOf(SEPARATEUR);
  const donneesSignees = coupe >= 0 ? brut.slice(0, coupe) : brut;
  const signature = coupe >= 0 ? brut.slice(coupe + 1).trim() || null : null;
  const echec = (erreur: string, entete: Entete2dDoc | null = null): Analyse2dDoc => ({
    ok: false, erreur, entete, donneesSignees, signature,
  });

  if (!donneesSignees.startsWith('DC')) return echec("ce n'est pas un code 2D-DOC (marqueur « DC » absent)");
  const m = ENTETE.exec(donneesSignees.slice(0, LONGUEUR_ENTETE));
  if (!m) return echec(donneesSignees.length < LONGUEUR_ENTETE ? 'en-tête tronqué' : 'en-tête illisible');
  if (m[1] !== '04') return echec(`version ${m[1]} non prise en charge`);
  const entete: Entete2dDoc = {
    version: m[1], autorite: m[2], certificat: m[3],
    dateEmission: dateDepuisJours(m[4]), dateSignature: dateDepuisJours(m[5]),
    typeDocument: m[6], perimetre: m[7], pays: m[8],
  };

  const hex = donneesSignees.slice(LONGUEUR_ENTETE);
  if (!/^(?:[0-9A-F]{2})*$/i.test(hex)) return echec('zone de message tronquée ou non hexadécimale', entete);
  const octets = new Uint8Array(hex.length / 2);
  for (let k = 0; k < octets.length; k++) octets[k] = parseInt(hex.slice(2 * k, 2 * k + 2), 16);

  const decodeur = new TextDecoder('utf-8');
  const donnees: Donnee2dDoc[] = [];
  let i = 0;
  while (i < octets.length) {
    if (i + 3 > octets.length) return echec('zone de message tronquée', entete);
    const etiquette = String.fromCharCode(octets[i], octets[i + 1]);
    if (!/^[0-9A-Z]{2}$/.test(etiquette)) return echec('étiquette de donnée illisible', entete);
    const fin = i + 3 + octets[i + 2];
    if (fin > octets.length) return echec(`donnée « ${etiquette} » tronquée`, entete);
    donnees.push({ etiquette, valeur: decodeur.decode(octets.subarray(i + 3, fin)) });
    i = fin; // la boucle ne se termine que sur la fin exacte de la zone : aucun octet résiduel
  }
  return { ok: true, entete, donnees, donneesSignees, signature };
}

// ---------------------------------------------------------------------------------------------------------------
// Du code à la fiche
// ---------------------------------------------------------------------------------------------------------------

const TYPES_DOCUMENT: Readonly<Record<string, TypeDocument>> = { H1: 'extrait_rne', DP: 'carte_auto_entrepreneur' };

// Étiquettes vues avec une valeur en lettres latines. Les autres (noms, adresse, siège, activité) sont en arabe.
const ETIQUETTE_IDENTIFIANT = '37';
const ETIQUETTE_DENOMINATION = 'YE';
const ETIQUETTE_QUALITE = '0J';
const ETIQUETTES_DATE = ['Y9', 'SD'];
const LIBELLES: Readonly<Record<string, string>> = {
  [ETIQUETTE_IDENTIFIANT]: 'Identifiant unique',
  [ETIQUETTE_DENOMINATION]: 'Dénomination',
  Y8: "N° d'extrait",
  Y9: 'Date',
  SD: 'Date',
  BI: 'Capital social',
};

// Qualité du représentant : le code ne la donne qu'en arabe. Petite table fixe, arabe → français.
const QUALITES: Readonly<Record<string, string>> = { 'وكيل': 'Gérant' };

const IDENTIFIANT_UNIQUE = /^\d{7}[A-Z]$/;
// Extrait RNE : l'identifiant unique n'est que le début du matricule fiscal. Sur une carte d'auto-entrepreneur,
// l'identifiant EST le matricule : pas de note.
const NOTE_MATRICULE = "racine seulement : le complément (/A/M/000) figure sur la carte d'identification fiscale";

// Raison d'un cachet qui n'est pas « valide », telle que l'écran l'affiche (Cachet.motif) : quelques mots, sans jargon.
const MOTIFS: Readonly<Record<MotifSignature, string>> = {
  certificat_inconnu: 'certificat inconnu',
  verification_indisponible: 'vérification impossible sur ce navigateur',
  signature_absente: 'signature absente',
  signature_illisible: 'signature illisible',
  signature_fausse: 'signature incorrecte',
};

/** « aaaa-mm-jj » ou « jj-mm-aaaa » → « jj/mm/aaaa » ; toute autre forme reste telle quelle. */
const dateFr = (v: string): string => {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const fr = /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  return fr ? `${fr[1]}/${fr[2]}/${fr[3]}` : v;
};

/**
 * Texte lu dans le DataMatrix → cachet, champs de la fiche, lignes lisibles, avertissements.
 * null si le texte n'est pas un code 2D-DOC. `cles` : table des clés publiques (par défaut la table intégrée).
 * Ne lève rien. Selon l'état du cachet :
 *   - « invalide » : RIEN n'est repris du code — ni champ, ni ligne, ni type de document, ni avertissement (l'écran
 *     en affiche un seul, d'après l'état du cachet ; la raison est dans `cachet.motif`) ;
 *   - « non_verifiable » : les champs sont proposés, tous « à relire » ; la raison est dans `cachet.motif`, pas dans
 *     les avertissements (un seul message à l'écran) ;
 *   - « valide » : les champs sont sûrs pour les deux types de document connus (H1, DP) ; pour un autre type, ils
 *     sont « à relire », le sens des étiquettes n'étant établi que pour ces deux-là.
 */
export async function interpreterCode2d(
  texte: string,
  cles: Readonly<Record<string, string>> = CLES_PUBLIQUES,
): Promise<LectureCode2d | null> {
  const analyse = analyser2dDoc(texte);
  const { entete } = analyse;
  if (!entete) return null;

  const { etat, motif } = await verifierSignature(analyse.donneesSignees, analyse.signature, entete.autorite, entete.certificat, cles);
  const donnees = analyse.ok ? analyse.donnees : [];
  // Valeur imprimable d'une étiquette ('' si elle est absente ou en arabe) : toute valeur passe par texteChamp.
  const valeurDe = (etiquette: string): string => texteChamp(donnees.find((d) => d.etiquette === etiquette)?.valeur);

  const identifiantLu = valeurDe(ETIQUETTE_IDENTIFIANT).toUpperCase();
  const identifiant = IDENTIFIANT_UNIQUE.test(identifiantLu) ? identifiantLu : null;
  const cachet: Cachet = {
    etat,
    autorite: entete.autorite,
    certificat: entete.certificat,
    typeDocument: entete.typeDocument,
    emisLe: entete.dateEmission ? dateFr(entete.dateEmission) : null,
    identifiant,
  };
  if (motif) cachet.motif = MOTIFS[motif];
  if (etat === 'invalide') return { document: 'inconnu', champs: {}, lignes: [], avertissements: [], cachet };

  const document: TypeDocument = TYPES_DOCUMENT[entete.typeDocument] ?? 'inconnu';
  const aRelire = etat !== 'valide' || document === 'inconnu';
  const champ = (valeur: string, note?: string): ChampLu =>
    note ? { valeur, source: 'cachet', aRelire, note } : { valeur, source: 'cachet', aRelire };
  const qualiteArabe = donnees.find((d) => d.etiquette === ETIQUETTE_QUALITE)?.valeur.normalize('NFC').replace(/\s+/g, ' ').trim();
  const qualite = texteChamp(qualiteArabe && Object.hasOwn(QUALITES, qualiteArabe) ? QUALITES[qualiteArabe] : '');

  const avertissements: string[] = [];
  if (!analyse.ok) avertissements.push("Le contenu du cachet électronique n'a pas pu être lu.");

  const champs: Partial<Record<ChampIdentite, ChampLu>> = {};
  if (identifiant) {
    champs.matriculeFiscal = champ(identifiant, document === 'extrait_rne' ? NOTE_MATRICULE : undefined);
    champs.rne = champ(identifiant);
  } else if (analyse.ok && document !== 'inconnu') {
    avertissements.push("Le cachet électronique ne donne pas d'identifiant unique.");
  }
  const denomination = valeurDe(ETIQUETTE_DENOMINATION);
  if (denomination) champs.raisonSociale = champ(denomination);
  if (document === 'carte_auto_entrepreneur') champs.formeJuridique = champ('AUTO_ENTREPRENEUR');
  if (qualite) champs.representantQualite = champ(qualite);

  // Contenu lisible du code : une ligne par donnée en lettres latines, dans l'ordre du code.
  const lignes: string[] = [];
  for (const { etiquette, valeur } of donnees) {
    if (etiquette === ETIQUETTE_QUALITE && qualite) {
      lignes.push(`Qualité du représentant : ${qualite}`);
      continue;
    }
    const lisible = texteChamp(valeur);
    if (!lisible) continue;
    const libelle = LIBELLES[etiquette] ?? `Donnée « ${etiquette} »`;
    lignes.push(`${libelle} : ${ETIQUETTES_DATE.includes(etiquette) ? dateFr(lisible) : lisible}`);
  }

  return { document, champs, lignes, avertissements, cachet };
}
