// Étape F4 : l'état d'une facture d'appro dans LabFlow Compta, sur sa carte (pages Factures, activités et labo) —
// « 📒 brouillard B-000012 » ou « 📒 validée AC-2026-000003 », sinon « 📒 Envoyer à la comptabilité » (module actif,
// compte modifiable, facture validée ou saisie à la main avec sa pièce). Dans l'en-tête de la carte, déjà un <button> :
// un span cliquable qui n'ouvre pas la carte.
import { useState } from 'react';
import type React from 'react';
import { useConfirm } from '../../common/ConfirmDialog';
import { messageErreur } from './pieces';
import { envoyerEnCompta, phraseEnvoi, texteEtatCompta, type EtatCompta } from './compta';

interface Props {
  factureId: number;
  compta: EtatCompta | null | undefined;
  /** Facture qui peut partir : saisie (pas un transfert), validée ou avec sa pièce. */
  envoyable: boolean;
  comptaActif: boolean | null;
  peutEcrire: boolean;
  onCompta: (c: EtatCompta) => void;
}

const pastille: React.CSSProperties = { marginLeft: 8, borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap' };

export default function EtatComptaFacture({ factureId, compta, envoyable, comptaActif, peutEcrire, onCompta }: Props) {
  const { alerte } = useConfirm();
  const [envoi, setEnvoi] = useState(false);
  if (compta) {
    const validee = compta.etat === 'validee';
    return (
      <span title={validee ? 'Écriture d\'achat validée par votre comptable dans LabFlow Compta' : 'Écriture d\'achat en brouillard dans LabFlow Compta : votre comptable la vérifie et la valide'}
        style={{ ...pastille, background: validee ? '#dcfce7' : '#fef3c7', color: validee ? '#166534' : '#92400e' }}>
        📒 En comptabilité : {texteEtatCompta(compta)}
      </span>
    );
  }
  if (!comptaActif || !peutEcrire || !envoyable) return null;
  const envoyer = async (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    try {
      const r = await envoyerEnCompta(factureId);
      onCompta(r.compta);
      void alerte({ title: 'Facture envoyée en comptabilité', message: phraseEnvoi(r), tone: 'primary' });
    } catch (err) {
      void alerte({ title: 'Pas envoyée en comptabilité', message: messageErreur(err, 'L\'envoi en comptabilité a échoué : réessayez.'), tone: 'danger' });
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <span role="button" tabIndex={0} aria-disabled={envoi} title="LabFlow prépare l'écriture d'achat en brouillard dans LabFlow Compta ; votre comptable la vérifie et la valide."
      onClick={(e) => void envoyer(e)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void envoyer(e); }}
      style={{ ...pastille, background: '#fff', border: '1px dashed #f59e0b', color: '#b45309', cursor: envoi ? 'wait' : 'pointer' }}>
      📒 {envoi ? 'Envoi…' : 'Envoyer à la comptabilité'}
    </span>
  );
}
