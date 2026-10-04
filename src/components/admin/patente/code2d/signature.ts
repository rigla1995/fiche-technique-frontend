// Cachet électronique d'un code « 2D-DOC » tunisien : vérification de la signature, hors ligne, par WebCrypto.
// Fonctions pures (ni DOM, ni zxing, ni pdf.js), testées par scripts/patente-code2d.test.mjs.
//
// Le code porte : les données signées (texte ASCII : en-tête + zone de message), puis 0x1F, puis la signature.
// La signature est une ECDSA P-256 / SHA-256 au format DER, écrite en base64 SANS bourrage. Le certificat n'est pas
// dans le code : l'en-tête ne donne que ses identifiants (autorité « TN01 », certificat « 0148 »). La clé publique
// vient donc d'une table figée ici ; un certificat absent de la table donne « non vérifiable », jamais « faux ».
import type { Cachet } from '../types.ts';

/** Clés publiques connues, par « autorité/certificat » : SubjectPublicKeyInfo (P-256) en base64. */
export const CLES_PUBLIQUES: Readonly<Record<string, string>> = {
  // Clé retrouvée à partir de deux documents signés par ce certificat (essai du 04/10/2026). Une clé publique n'est
  // pas un secret. À comparer une fois avec le certificat officiel publié par TunTrust ou le RNE.
  'TN01/0148': 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAELdp8jGsVlShMpPM6WKjVVS6IJ1v0rGRBJVUHpVDPah5b/9DPdMaxjoN/z4gzO2Obd8G9mc3WKToXTxOZi2a91g==',
};

export type MotifSignature =
  | 'certificat_inconnu' // pas de clé pour ce certificat
  | 'verification_indisponible' // WebCrypto absent (page hors HTTPS) ou clé de la table inutilisable
  | 'signature_absente' // pas de séparateur 0x1F, ou rien après
  | 'signature_illisible' // ni base64, ni DER « r, s » de 32 octets
  | 'signature_fausse'; // la signature ne correspond pas aux données

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

/**
 * Signature ECDSA au format DER — SEQUENCE { INTEGER r, INTEGER s } — vers « r || s » sur 64 octets, la forme
 * qu'attend WebCrypto. null si la structure n'est pas celle d'une signature P-256.
 */
export function signatureBrute(der: Uint8Array): Uint8Array<ArrayBuffer> | null {
  let p = 0;
  if (der[p++] !== 0x30) return null;
  let longueur = der[p++];
  if (longueur === 0x81) longueur = der[p++];
  else if (longueur === undefined || longueur > 0x7f) return null;
  if (longueur !== der.length - p) return null;
  const brute = new Uint8Array(64);
  for (let k = 0; k < 2; k++) {
    if (der[p++] !== 0x02) return null;
    const n = der[p++];
    if (n === undefined || n === 0 || n > 0x7f || p + n > der.length) return null;
    const fin = p + n;
    while (p < fin - 1 && der[p] === 0) p++; // zéros de tête d'un INTEGER positif
    if (fin - p > 32) return null;
    brute.set(der.subarray(p, fin), k * 32 + 32 - (fin - p));
    p = fin;
  }
  return p === der.length ? brute : null;
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
  const nom = `${autorite}/${certificat}`;
  const cleB64 = Object.hasOwn(cles, nom) ? cles[nom] : '';
  if (!cleB64) return { etat: 'non_verifiable', motif: 'certificat_inconnu' };
  if (!signatureB64) return { etat: 'invalide', motif: 'signature_absente' };
  const der = octetsBase64(signatureB64);
  const brute = der && signatureBrute(der);
  if (!brute) return { etat: 'invalide', motif: 'signature_illisible' };
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
