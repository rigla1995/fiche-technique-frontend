// Cachet électronique d'un code « 2D-DOC » tunisien : vérification de la signature, hors ligne, par WebCrypto.
// Fonctions pures (ni DOM, ni zxing, ni pdf.js), testées par scripts/patente-code2d.test.mjs.
//
// Le code porte : les données signées (texte ASCII : en-tête + zone de message), puis 0x1F, puis la signature.
// La signature est une ECDSA P-256 / SHA-256 au format DER, écrite en base64 SANS bourrage. Le certificat n'est pas
// dans le code : l'en-tête ne donne que ses identifiants (autorité « TN01 », certificat « 0148 »). La clé publique
// vient donc d'une table figée ici.
// Ordre des contrôles : la signature d'abord, le certificat ensuite. Un code sans signature, ou dont la signature
// n'a pas la forme d'une signature, est « invalide » QUEL QUE SOIT le certificat annoncé : changer un caractère du
// certificat dans l'en-tête ne suffit pas à faire passer un code modifié pour « non vérifiable ». Un certificat
// absent de la table, avec une signature bien formée, donne « non vérifiable », jamais « faux ».
// « Bien formée » dépend de ce qu'on sait. Certificat inconnu : sa courbe l'est aussi, seule la forme est jugée — DER
// strict de deux entiers non nuls d'au plus 66 octets (P-521, la plus grande courbe courante) ; un futur certificat
// sur une autre courbe que P-256 ne fait donc pas passer ses documents authentiques pour « invalides ». Clé connue
// (P-256) : s'ajoutent la limite de 32 octets et l'intervalle [1, n-1].
import type { Cachet } from '../types.ts';

/** Clés publiques connues, par « autorité/certificat » : SubjectPublicKeyInfo (P-256) en base64. */
export const CLES_PUBLIQUES: Readonly<Record<string, string>> = {
  // Clé retrouvée à partir de deux documents signés par ce certificat (essai du 04/10/2026). Une clé publique n'est
  // pas un secret. À comparer une fois avec le certificat officiel publié par TunTrust ou le RNE.
  'TN01/0148': 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAELdp8jGsVlShMpPM6WKjVVS6IJ1v0rGRBJVUHpVDPah5b/9DPdMaxjoN/z4gzO2Obd8G9mc3WKToXTxOZi2a91g==',
};

export type MotifSignature =
  | 'certificat_inconnu' // signature bien formée, mais pas de clé pour ce certificat
  | 'verification_indisponible' // WebCrypto absent (page hors HTTPS) ou clé de la table inutilisable
  | 'signature_absente' // pas de séparateur 0x1F, ou rien après
  | 'signature_illisible' // ni base64, ni DER strict « r, s » d'au plus 66 octets (32 sous une clé P-256 connue)
  | 'signature_fausse'; // r ou s nul, ou hors de [1, n-1] sous une clé connue, ou signature qui ne correspond pas aux données

export interface VerificationSignature {
  etat: Cachet['etat'];
  /** Pourquoi la signature n'est pas « valide » ; null quand elle l'est. */
  motif: MotifSignature | null;
}

/** Base64 (avec ou sans bourrage) → octets ; null si le texte n'est pas du base64. */
export function octetsBase64(b64: string): Uint8Array<ArrayBuffer> | null {
  const s = b64.replace(/\s+/g, '').replace(/=+$/, '');
  if (!s || !/^[A-Za-z0-9+/]+$/.test(s) || s.length % 4 === 1) return null;
  try {
    const binaire = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets;
  } catch {
    return null;
  }
}

// Taille d'un entier de signature, en octets : 32 pour P-256 (la courbe des clés connues) ; 66 pour P-521, la plus
// grande courbe courante, limite de forme quand le certificat — donc la courbe — n'est pas connu.
const OCTETS_P256 = 32;
const OCTETS_MAX = 66;

/**
 * Signature ECDSA au format DER — SEQUENCE { INTEGER r, INTEGER s } — vers ses deux entiers, sans zéro de tête.
 * null si la structure n'est pas celle d'une signature, ou si un entier dépasse `octetsMax`.
 * DER STRICT : une seule écriture par signature. Sont refusés une longueur qui ne tombe pas juste, la forme longue
 * là où un octet suffit (elle n'est admise, « 0x81 » puis un octet, qu'à partir de 128 octets : deux entiers de
 * P-521), un entier vide, un entier « négatif » (bit de poids fort sans zéro de tête), un zéro de tête superflu,
 * tout octet en trop ou en moins.
 */
function entiersSignature(der: Uint8Array, octetsMax: number): [Uint8Array, Uint8Array] | null {
  if (der[0] !== 0x30) return null;
  // SEQUENCE dont la longueur couvre exactement le reste : sur un octet sous 128, sinon « 0x81 » puis un octet.
  const longue = der[1] === 0x81;
  const longueur = longue ? der[2] : der[1];
  if (!(longue ? longueur >= 0x80 : longueur < 0x80)) return null;
  let p = longue ? 3 : 2;
  if (longueur !== der.length - p) return null;
  const entiers: Uint8Array[] = [];
  for (let k = 0; k < 2; k++) {
    if (der[p] !== 0x02) return null;
    const n = der[p + 1];
    const debut = p + 2;
    if (!(n >= 1)) return null; // entier vide ou absent (un entier qui déborde est refusé par la fin exacte, plus bas)
    if (der[debut] & 0x80) return null; // entier négatif
    const zeroDeTete = der[debut] === 0 && n > 1;
    if (zeroDeTete && !(der[debut + 1] & 0x80)) return null; // zéro de tête superflu
    const valeur = der.subarray(zeroDeTete ? debut + 1 : debut, debut + n);
    if (valeur.length > octetsMax) return null;
    entiers.push(valeur);
    p = debut + n;
  }
  return p === der.length ? [entiers[0], entiers[1]] : null;
}

/**
 * Signature ECDSA P-256 au format DER vers « r || s » sur 64 octets, la forme qu'attend WebCrypto. null si la
 * structure n'est pas celle d'une signature P-256 : DER strict (voir plus haut), entiers d'au plus 32 octets.
 */
export function signatureBrute(der: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const entiers = entiersSignature(der, OCTETS_P256);
  if (!entiers) return null;
  const brute = new Uint8Array(2 * OCTETS_P256);
  entiers.forEach((valeur, k) => brute.set(valeur, (k + 1) * OCTETS_P256 - valeur.length));
  return brute;
}

// Ordre n de la courbe P-256 : r et s d'une signature sont dans [1, n-1].
const ORDRE_P256 = Uint8Array.from(
  'ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'.match(/../g) ?? [],
  (octet) => parseInt(octet, 16),
);

/** Entier de 32 octets (gros-boutiste) dans [1, n-1] ? Hors de cet intervalle, aucune clé ne valide la signature. */
function dansLOrdre(entier: Uint8Array): boolean {
  if (entier.every((octet) => octet === 0)) return false;
  for (let i = 0; i < 32; i++) {
    if (entier[i] !== ORDRE_P256[i]) return entier[i] < ORDRE_P256[i];
  }
  return false; // égal à n
}

/**
 * Vérifie la signature d'un code 2D-DOC. `donneesSignees` : le texte du code avant le séparateur 0x1F ;
 * `signatureB64` : le texte après (null s'il n'y en a pas). `cles` : table des clés publiques, par défaut la table
 * intégrée (les tests passent la leur). Ne lève jamais d'exception.
 */
export async function verifierSignature(
  donneesSignees: string,
  signatureB64: string | null,
  autorite: string,
  certificat: string,
  cles: Readonly<Record<string, string>> = CLES_PUBLIQUES,
): Promise<VerificationSignature> {
  // 1. La signature elle-même, avant tout regard sur le certificat : absente, ou sans la forme d'une signature
  //    (quelle que soit la courbe), elle est « invalide ».
  if (typeof signatureB64 !== 'string' || !signatureB64.trim()) return { etat: 'invalide', motif: 'signature_absente' };
  const der = octetsBase64(signatureB64);
  const entiers = der && entiersSignature(der, OCTETS_MAX);
  if (!der || !entiers) return { etat: 'invalide', motif: 'signature_illisible' };
  // 2. Le certificat. Inconnu, sa courbe l'est aussi : seule la forme est jugée. Un entier nul n'est une signature
  //    sur aucune courbe ; deux entiers non nuls ne peuvent être ni confirmés ni démentis sans la clé.
  const nom = `${autorite}/${certificat}`;
  const cleB64 = Object.hasOwn(cles, nom) ? cles[nom] : '';
  if (!cleB64) {
    const nulle = entiers.some((entier) => entier.every((octet) => octet === 0));
    return nulle ? { etat: 'invalide', motif: 'signature_fausse' } : { etat: 'non_verifiable', motif: 'certificat_inconnu' };
  }
  // 3. Clé connue, donc P-256 : r et s tiennent sur 32 octets et sont dans [1, n-1].
  const brute = signatureBrute(der);
  if (!brute) return { etat: 'invalide', motif: 'signature_illisible' };
  if (!dansLOrdre(brute.subarray(0, 32)) || !dansLOrdre(brute.subarray(32))) return { etat: 'invalide', motif: 'signature_fausse' };
  try {
    // `crypto.subtle` n'existe que dans un contexte sécurisé (HTTPS ou localhost).
    const subtle = globalThis.crypto?.subtle;
    const spki = octetsBase64(cleB64);
    if (!subtle || !spki) return { etat: 'non_verifiable', motif: 'verification_indisponible' };
    const cle = await subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    // Les données signées sont de l'ASCII : un caractère hors ASCII donne d'autres octets, donc « invalide ».
    const donnees = new TextEncoder().encode(donneesSignees);
    const juste = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, cle, brute, donnees);
    return juste ? { etat: 'valide', motif: null } : { etat: 'invalide', motif: 'signature_fausse' };
  } catch {
    return { etat: 'non_verifiable', motif: 'verification_indisponible' };
  }
}
