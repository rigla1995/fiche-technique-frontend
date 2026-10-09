// Factures fournisseur, étape F1 : les pièces jointes d'une facture d'approvisionnement — ouvrir, joindre, remplacer,
// supprimer (définitif). Ouverte depuis les pages Factures (activités et labo).
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../common/ConfirmDialog';
import { useVocabulaire } from '../../../hooks/useVocabulaire';
import ZonePieces from './ZonePieces';
import {
  PIECES_MAX, joindrePieces, libererFichiers, listerPieces, messageErreur, ouvrirPiece, remplacerPiece, supprimerPiece, taille,
  type FichierChoisi, type Piece,
} from './pieces';

interface Props {
  factureId: number;
  titre: string;
  accent?: string;
  onFermer: () => void;
  /** Nombre de pièces après une modification (pour la liste des factures). */
  onNombre: (n: number) => void;
}

const fmtDateHeure = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};
const icone = (t: Piece['type']) => (t === 'application/pdf' ? '📄' : '🖼️');

export default function FenetrePieces({ factureId, titre, accent = '#1e40af', onFermer, onNombre }: Props) {
  const voc = useVocabulaire();
  const { canWrite } = useAuth();
  const { confirm } = useConfirm();
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [modifiable, setModifiable] = useState(false);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [nouveaux, setNouveaux] = useState<FichierChoisi[]>([]);
  const [remplacement, setRemplacement] = useState<{ piece: Piece; fichiers: FichierChoisi[] } | null>(null);
  const [prepare, setPrepare] = useState(false);
  const setFichiersRemplacement: Dispatch<SetStateAction<FichierChoisi[]>> = (maj) =>
    setRemplacement((r) => (r ? { ...r, fichiers: typeof maj === 'function' ? maj(r.fichiers) : maj } : r));
  const fermerRemplacement = () => { libererFichiers(remplacement?.fichiers ?? []); setRemplacement(null); setPrepare(false); };
  // Vignettes des fichiers choisis libérées quand la fenêtre se ferme.
  const choisis = useRef<FichierChoisi[]>([]);
  useEffect(() => { choisis.current = [...nouveaux, ...(remplacement?.fichiers ?? [])]; }, [nouveaux, remplacement]);
  useEffect(() => () => libererFichiers(choisis.current), []);
  // Échap ferme (sauf pendant un envoi) ; le focus va au bouton de fermeture à l'ouverture.
  const fermer = useRef<HTMLButtonElement>(null);
  useEffect(() => { fermer.current?.focus(); }, []);
  // Onglet refusé par le navigateur : lien à toucher soi-même (adresse locale libérée au remplacement et à la fermeture).
  const [lien, setLien] = useState<{ url: string; nom: string } | null>(null);
  const lienCourant = useRef<string | null>(null);
  useEffect(() => () => { if (lienCourant.current) URL.revokeObjectURL(lienCourant.current); }, []);
  const montrerLien = (url: string | null, nom: string) => {
    if (lienCourant.current) URL.revokeObjectURL(lienCourant.current);
    lienCourant.current = url;
    setLien(url ? { url, nom } : null);
  };

  useEffect(() => {
    let annule = false;
    listerPieces(factureId)
      .then((r) => { if (!annule) { setPieces(r.pieces); setModifiable(r.modifiable); } })
      .catch((e) => { if (!annule) { setPieces([]); setErreur(messageErreur(e, 'Pièces indisponibles : réessayez.')); } });
    return () => { annule = true; };
  }, [factureId]);

  const apres = (liste: Piece[]) => { setPieces(liste); onNombre(liste.length); setErreur(''); };
  const peutEcrire = modifiable && canWrite;
  const places = Math.max(0, PIECES_MAX - (pieces?.length ?? 0));

  const ouvrir = async (p: Piece, telecharger = false) => {
    try { montrerLien(await ouvrirPiece(factureId, p, telecharger), p.nom); } catch (e) { setErreur(messageErreur(e, 'Ce fichier ne s\'ouvre pas : réessayez.')); }
  };
  const joindre = async () => {
    if (!nouveaux.length) return;
    setEnvoi(true);
    try { apres(await joindrePieces(factureId, nouveaux)); libererFichiers(nouveaux); setNouveaux([]); } catch (e) { setErreur(messageErreur(e, 'Envoi impossible : réessayez.')); }
    setEnvoi(false);
  };
  const remplacer = async () => {
    if (!remplacement?.fichiers.length) return;
    const ok = await confirm({
      title: 'Remplacer cette pièce ?',
      message: `« ${remplacement.piece.nom} » sera effacée définitivement et remplacée par « ${remplacement.fichiers[0].fichier.name} ».`,
      confirmLabel: 'Remplacer', tone: 'danger', icon: '🔁',
    });
    if (!ok) return;
    setEnvoi(true);
    try { apres(await remplacerPiece(factureId, remplacement.piece.id, remplacement.fichiers[0])); fermerRemplacement(); } catch (e) { setErreur(messageErreur(e, 'Remplacement impossible : réessayez.')); }
    setEnvoi(false);
  };
  const supprimer = async (p: Piece) => {
    const ok = await confirm({
      title: 'Supprimer cette pièce ?',
      message: `« ${p.nom} » sera effacée définitivement. Les lignes de la facture ne changent pas.`,
      confirmLabel: 'Supprimer', tone: 'danger',
    });
    if (!ok) return;
    setEnvoi(true);
    try { apres(await supprimerPiece(factureId, p.id)); } catch (e) { setErreur(messageErreur(e, 'Suppression impossible : réessayez.')); }
    setEnvoi(false);
  };

  return (
    <div className="modal-overlay" onClick={() => { if (!envoi) onFermer(); }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) { e.stopPropagation(); onFermer(); } }}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titre}>
        <div className="modal-header">
          <h2>📎 {titre}</h2>
          <button ref={fermer} className="modal-close" onClick={onFermer} disabled={envoi} aria-label="Fermer">×</button>
        </div>
        <div className="modal-body">
          {erreur && <div className="alert alert-error">{erreur}</div>}
          {lien && (
            <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>Votre navigateur n'a pas ouvert de nouvel onglet.</span>
              <a href={lien.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>Afficher « {lien.nom} »</a>
            </div>
          )}
          {pieces === null ? (
            <p className="text-muted">Chargement…</p>
          ) : pieces.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Aucune pièce : joignez la facture reçue {voc.du('fournisseur')} (PDF, scan ou photo).
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {pieces.map((p) => (
                <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.3rem' }}>{icone(p.type)}</span>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.84rem', wordBreak: 'break-word' }}>{p.nom}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {taille(p.taille)} · {fmtDateHeure(p.deposeLe)}{p.deposeParNom ? ` · ${p.deposeParNom}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {/* Une photo HEIC sans copie ne s'affiche pas dans Chrome ni Firefox : on la télécharge. */}
                      {(p.type === 'image/heic' || p.type === 'image/heif') && !p.avecApercu ? (
                        <button className="btn btn-primary btn-sm" onClick={() => ouvrir(p, true)} disabled={envoi}
                          style={{ background: accent, border: 'none' }} title="La photo d'origine, au format HEIC">Télécharger</button>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => ouvrir(p)} disabled={envoi}
                          style={{ background: accent, border: 'none' }}>Ouvrir</button>
                      )}
                      {(p.type === 'image/heic' || p.type === 'image/heif') && p.avecApercu && (
                        <button className="btn btn-ghost btn-sm" onClick={() => ouvrir(p, true)} disabled={envoi} title="La photo d'origine, au format HEIC">Original</button>
                      )}
                      {peutEcrire && (
                        <>
                          <button className="btn btn-ghost btn-sm" disabled={envoi}
                            onClick={() => { if (remplacement?.piece.id === p.id) fermerRemplacement(); else { fermerRemplacement(); setRemplacement({ piece: p, fichiers: [] }); } }}>Remplacer</button>
                          <button className="btn btn-ghost btn-sm" disabled={envoi} onClick={() => supprimer(p)}
                            style={{ color: 'var(--danger)' }}>Supprimer</button>
                        </>
                      )}
                    </div>
                  </div>
                  {remplacement?.piece.id === p.id && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <ZonePieces unique accent={accent} disabled={envoi} fichiers={remplacement.fichiers}
                        onChange={setFichiersRemplacement} onPreparation={setPrepare} />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={fermerRemplacement} disabled={envoi}>Annuler</button>
                        <button className="btn btn-primary btn-sm" onClick={remplacer} disabled={envoi || prepare || !remplacement.fichiers.length}
                          style={{ background: accent, border: 'none' }}>{envoi ? '…' : 'Remplacer'}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {pieces !== null && peutEcrire && places > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ZonePieces accent={accent} places={places} disabled={envoi} fichiers={nouveaux} onChange={setNouveaux} onPreparation={setPrepare} />
              {nouveaux.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary btn-sm" onClick={joindre} disabled={envoi || prepare} style={{ background: accent, border: 'none' }}>
                    {envoi ? 'Envoi…' : `Joindre ${nouveaux.length > 1 ? `les ${nouveaux.length} fichiers` : 'le fichier'}`}
                  </button>
                </div>
              )}
            </div>
          )}
          {pieces !== null && modifiable && !canWrite && (
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>Compte en lecture seule : les pièces se consultent, sans ajout ni suppression.</p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onFermer} disabled={envoi}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
