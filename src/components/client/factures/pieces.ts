// Factures fournisseur, étape F1 (labflow-reprise/achats-compta/PLAN-FACTURES.md) : pièces jointes d'une facture
// d'approvisionnement — fichiers choisis (contrôle du type sur le contenu, copie JPEG d'une photo HEIC), envois et
// lecture. Le serveur refait tous les contrôles ; ceux d'ici évitent seulement un envoi inutile.
import api from '../../../api/client';

export const PIECES_MAX = 5;
export const OCTETS_MAX = 15 * 1024 * 1024;
/** Types proposés par le sélecteur (le téléphone propose aussi l'appareil photo). */
export const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif,.pdf';

export type TypePiece = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif' | 'image/avif';

/** Un fichier choisi, prêt à partir. */
export interface FichierChoisi {
  cle: string;
  fichier: File;
  type: TypePiece;
  /** Copie JPEG d'une photo HEIC (affichage) ; null sinon ou si la conversion a échoué. */
  apercu: Blob | null;
  /** Adresse locale d'une vignette (image, ou copie JPEG) ; null pour un PDF. */
  vignette: string | null;
}

/** Une pièce enregistrée (réponse du serveur). */
export interface Piece {
  id: number;
  ordre: number;
  nom: string;
  type: TypePiece;
  taille: number;
  avecApercu: boolean;
  deposeLe: string;
  deposeParNom: string | null;
}

const MARQUES_HEIC = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'];
const MARQUES_HEIF = ['mif1', 'msf1', 'mif2'];
const MARQUES_AVIF = ['avif', 'avis'];

/** Type d'un fichier d'après ses premiers octets (même règle que le serveur) ; null s'il n'est pas admis. */
export async function typeDuFichier(f: Blob): Promise<TypePiece | null> {
  const o = new Uint8Array(await f.slice(0, 64).arrayBuffer());
  if (o.length < 12) return null;
  const txt = (a: number, b: number) => String.fromCharCode(...o.slice(a, b));
  if (txt(0, 5) === '%PDF-') return 'application/pdf';
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  if (o[0] === 0x89 && txt(1, 4) === 'PNG' && o[4] === 0x0d && o[5] === 0x0a && o[6] === 0x1a && o[7] === 0x0a) return 'image/png';
  if (txt(0, 4) === 'RIFF' && txt(8, 12) === 'WEBP') return 'image/webp';
  if (txt(4, 8) === 'ftyp') {
    const taille = Math.min((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3], o.length, 64);
    const marques = [txt(8, 12)];
    for (let i = 16; i + 4 <= taille; i += 4) marques.push(txt(i, i + 4));
    if (marques.some((m) => MARQUES_HEIC.includes(m))) return 'image/heic';
    if (marques.some((m) => MARQUES_AVIF.includes(m))) return 'image/avif';
    if (marques.some((m) => MARQUES_HEIF.includes(m))) return 'image/heif';
  }
  return null;
}

export const estHeic = (t: TypePiece) => t === 'image/heic' || t === 'image/heif';

/** Côté le plus long de la copie JPEG d'une photo HEIC (lisible à l'écran, ~1 Mo) ; le serveur refuse une copie de plus
 * de 5 Mo (la photo d'origine, elle, est gardée telle quelle). */
const APERCU_COTE = 2500;
const APERCU_MAX = 5 * 1024 * 1024;

/** Copie JPEG réduite d'une photo HEIC, faite dans le navigateur (décodeur chargé à la demande, servi par LabFlow). */
async function copieJpeg(f: File): Promise<Blob | null> {
  try {
    const { heicTo } = await import('heic-to');
    const image = await heicTo({ blob: f, type: 'bitmap' });
    if (!(image instanceof ImageBitmap)) return null;
    const echelle = Math.min(1, APERCU_COTE / Math.max(image.width, image.height));
    const toile = document.createElement('canvas');
    toile.width = Math.max(1, Math.round(image.width * echelle));
    toile.height = Math.max(1, Math.round(image.height * echelle));
    const ctx = toile.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, toile.width, toile.height);
    ctx.drawImage(image, 0, 0, toile.width, toile.height);
    image.close();
    const jpeg = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', 0.85));
    return jpeg && jpeg.size <= APERCU_MAX ? jpeg : null;
  } catch {
    return null;
  }
}

let compteur = 0;

/** Contrôle et prépare un fichier choisi ; { erreur } s'il est refusé. */
export async function preparerFichier(f: File): Promise<FichierChoisi | { erreur: string }> {
  if (f.size === 0) return { erreur: `« ${f.name} » est vide.` };
  if (f.size > OCTETS_MAX) return { erreur: `« ${f.name} » est trop volumineux : 15 Mo au plus.` };
  const type = await typeDuFichier(f);
  if (!type) return { erreur: `« ${f.name} » n'est ni un PDF ni une photo (JPEG, PNG, WebP, HEIC).` };
  const apercu = estHeic(type) ? await copieJpeg(f) : null;
  // Pas de vignette pour un PDF, ni pour une photo HEIC sans copie (Chrome et Firefox ne l'affichent pas).
  const vignette = type === 'application/pdf' || (estHeic(type) && !apercu) ? null : URL.createObjectURL(apercu ?? f);
  compteur += 1;
  return { cle: `${Date.now()}-${compteur}`, fichier: f, type, apercu, vignette };
}

/** Libère les vignettes d'une liste de fichiers choisis (à appeler quand on la vide ou qu'on la quitte). */
export function libererFichiers(fichiers: FichierChoisi[]) {
  for (const f of fichiers) if (f.vignette) URL.revokeObjectURL(f.vignette);
}

/** Taille lisible (Ko / Mo). */
export const taille = (octets: number) => (octets >= 1024 * 1024
  ? `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`
  : `${Math.max(1, Math.round(octets / 1024))} Ko`);

/** Corps multipart : `donnees` (avec le rang de l'original de chaque copie JPEG), `pieces`, `apercus`. */
function formulaire(donnees: Record<string, unknown>, fichiers: FichierChoisi[]): FormData {
  const fd = new FormData();
  const apercuDe: number[] = [];
  fichiers.forEach((f, i) => { if (f.apercu) apercuDe.push(i); });
  fd.append('donnees', JSON.stringify({ ...donnees, apercuDe }));
  for (const f of fichiers) fd.append('pieces', f.fichier, f.fichier.name);
  for (const f of fichiers) {
    if (f.apercu) fd.append('apercus', f.apercu, `${f.fichier.name.replace(/\.[^.]*$/, '')}.jpg`);
  }
  return fd;
}
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

export interface LigneFacture { articleId: number; quantite: number; prixUnitaire: number; tauxTva: number | null }
export interface FactureAEnregistrer {
  cible: { type: 'activite' | 'labo'; id: number };
  dateAppro: string;
  fournisseurId: number | null;
  refFacture: string;
  timbreFiscal: boolean;
  /** Étape F2 : montant du timbre (1, 1,5 ou 2 D ; 1 par défaut). */
  timbreMontant?: number;
  lignes: LigneFacture[];
  confirmerDoublon?: boolean;
  /** Étape F2 : ce que la lecture de la facture a proposé (gardé sur la facture, pour comparer plus tard). */
  lecture?: LectureEnvoyee | null;
}
/** Résumé de la lecture envoyé au serveur (le serveur ne garde que ces champs). */
export interface LectureEnvoyee {
  source: 'pdf' | 'ocr';
  matricule: string | null;
  nom: string | null;
  numero: string | null;
  date: string | null;
  totaux: { ht: number | null; tva: number | null; timbre: number | null; ttc: number | null; fodec: number | null; remise: number | null };
  fournisseur: 'reconnu' | 'propose' | 'nouveau' | 'choisi' | null;
  duree: number | null;
}
export interface FactureSemblable { id: number | null; dateFacture: string; lieuNom: string | null; montantTTC: number | null; memeFacture: boolean }

/** POST /api/appros/facture : toutes les lignes et les pièces, ou rien. */
export async function enregistrerFacture(f: FactureAEnregistrer, fichiers: FichierChoisi[]) {
  const { data } = await api.post('/api/appros/facture', formulaire({ ...f }, fichiers), MULTIPART);
  return data as { factureId: number; ajoutee: boolean; nbLignes: number; nbPieces: number };
}

export async function listerPieces(factureId: number) {
  const { data } = await api.get(`/api/factures/${factureId}/pieces`);
  return data as { factureId: number; modifiable: boolean; pieces: Piece[] };
}
export async function joindrePieces(factureId: number, fichiers: FichierChoisi[]) {
  const { data } = await api.post(`/api/factures/${factureId}/pieces`, formulaire({}, fichiers), MULTIPART);
  return (data as { pieces: Piece[] }).pieces;
}
export async function remplacerPiece(factureId: number, pieceId: number, fichier: FichierChoisi) {
  const { data } = await api.put(`/api/factures/${factureId}/pieces/${pieceId}`, formulaire({}, [fichier]), MULTIPART);
  return (data as { pieces: Piece[] }).pieces;
}
export async function supprimerPiece(factureId: number, pieceId: number) {
  const { data } = await api.delete(`/api/factures/${factureId}/pieces/${pieceId}`);
  return (data as { pieces: Piece[] }).pieces;
}

/**
 * Ouvre une pièce dans un nouvel onglet (la photo HEIC : sa copie JPEG) ; `telecharger` : l'original en pièce jointe.
 * L'onglet est ouvert AVANT la lecture (sinon le navigateur bloque la fenêtre surgie après une attente). Si le navigateur
 * refuse tout onglet (bloqueur de fenêtres, certains téléphones), → l'adresse locale du fichier : l'appelant affiche un
 * lien que la personne touche elle-même (et la libère ensuite) ; sinon → null.
 */
export async function ouvrirPiece(factureId: number, piece: Piece, telecharger = false): Promise<string | null> {
  const onglet = telecharger ? null : window.open('', '_blank');
  try {
    const params = telecharger ? '?telecharger=1' : (piece.avecApercu ? '?apercu=1' : '');
    const res = await api.get(`/api/factures/${factureId}/pieces/${piece.id}/fichier${params}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    if (telecharger) {
      const a = document.createElement('a');
      a.href = url;
      a.download = piece.nom;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return null;
    }
    if (onglet) {
      onglet.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
      return null;
    }
    return url;
  } catch (e) {
    onglet?.close();
    // Lue en Blob, la réponse d'erreur cache son message : le relire pour l'afficher (404, 429…).
    const reponse = (e as { response?: { data?: unknown } }).response;
    if (reponse?.data instanceof Blob) {
      try { reponse.data = JSON.parse(await reponse.data.text()); } catch { /* corps non JSON : message par défaut */ }
    }
    throw e;
  }
}

/** Message d'une erreur de l'API (texte du serveur, sinon `defaut`). */
export const messageErreur = (e: unknown, defaut: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;
export const codeErreur = (e: unknown) =>
  (e as { response?: { data?: { code?: string } } })?.response?.data?.code ?? null;

const fmtJour = (iso: string) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
};

/**
 * Enregistre la facture ; si une facture du même fournisseur porte déjà ce numéro (409 FACTURE_EXISTANTE), demande
 * confirmation puis renvoie avec `confirmerDoublon` (saisie à la main : avertissement, pas un refus).
 * `confirmer` = la fonction `confirm` de useConfirm ; `ceFournisseur` = « ce fournisseur » dans le vocabulaire du compte.
 * → 'enregistree' | 'annulee'. Toute autre erreur est relancée.
 */
export async function enregistrerAvecConfirmation(
  f: FactureAEnregistrer,
  fichiers: FichierChoisi[],
  confirmer: (o: { title: string; message?: string; details?: string[]; confirmLabel?: string; tone?: 'danger' | 'primary' | 'info'; icon?: string }) => Promise<boolean>,
  ceFournisseur: string,
): Promise<'enregistree' | 'annulee'> {
  try {
    await enregistrerFacture(f, fichiers);
    return 'enregistree';
  } catch (e) {
    if (codeErreur(e) !== 'FACTURE_EXISTANTE') throw e;
    const existantes = (e as { response?: { data?: { factures?: FactureSemblable[] } } }).response?.data?.factures ?? [];
    const memeFacture = existantes.some((x) => x.memeFacture);
    const ok = await confirmer({
      title: 'Facture déjà saisie ?',
      message: `Une facture n° ${f.refFacture} de ${ceFournisseur} existe déjà.${memeFacture ? ' Même date, même lieu : vos lignes s\'y ajouteront.' : ''} Vérifiez que vous ne la saisissez pas deux fois.`,
      details: existantes.map((x) => `${fmtJour(x.dateFacture)}${x.lieuNom ? ` · ${x.lieuNom}` : ''}${x.montantTTC != null ? ` · ${x.montantTTC.toFixed(3)} DT TTC` : ''}`),
      confirmLabel: 'Enregistrer quand même',
      tone: 'primary',
      icon: '⚠️',
    });
    if (!ok) return 'annulee';
    await enregistrerFacture({ ...f, confirmerDoublon: true }, fichiers);
    return 'enregistree';
  }
}
