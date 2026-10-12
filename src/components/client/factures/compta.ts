// Factures d'appro → LabFlow Compta (étape F4 « Vers la comptabilité » — labflow-reprise/achats-compta/PLAN-FACTURES.md
// §4, ETAPE-F4.md). Une facture validée, ou saisie à la main avec sa pièce, part dans la comptabilité « Mon entreprise »
// (module Compta actif) : LabFlow y prépare l'écriture d'achat EN BROUILLARD ; le comptable la modifie et la valide.
import { useEffect, useState } from 'react';
import api from '../../../api/client';

/** L'écriture d'achat d'une facture dans LabFlow Compta. */
export interface EtatCompta { ecritureId: number; etat: 'brouillard' | 'validee'; numero: string | null; numeroProvisoire: string }
/** Ce que rend un enregistrement qui demandait l'envoi : l'écriture créée, ou le refus (la facture reste « à envoyer »). */
export interface ResultatCompta { compta?: EtatCompta; comptaRefus?: { code: string; message: string } }

/** Le module LabFlow Compta est-il actif pour le compte ? null pendant la lecture (la case reste cachée). */
export function useComptaActif(): boolean | null {
  const [actif, setActif] = useState<boolean | null>(null);
  useEffect(() => {
    let vivant = true;
    api.get('/api/factures/compta')
      .then(({ data }) => { if (vivant) setActif((data as { actif?: boolean }).actif === true); })
      .catch(() => { if (vivant) setActif(false); });
    return () => { vivant = false; };
  }, []);
  return actif;
}

/** POST /api/factures/:id/compta — « Envoyer à la comptabilité ». Lève l'erreur d'axios en cas de refus. */
export async function envoyerEnCompta(factureId: number) {
  const { data } = await api.post(`/api/factures/${factureId}/compta`);
  return data as { compta: EtatCompta; deja: boolean };
}

/** « brouillard B-000012 » ou « validée AC-2026-000003 ». */
export const texteEtatCompta = (c: EtatCompta) => (c.etat === 'validee' ? `validée ${c.numero ?? ''}`.trim() : `brouillard ${c.numeroProvisoire}`);

/** La phrase à ajouter au message de réussite d'un enregistrement qui demandait l'envoi ; vide sinon. */
export const phraseEnvoi = (r: ResultatCompta | null | undefined) => {
  if (r?.compta) return `Envoyée en comptabilité : écriture d'achat en ${texteEtatCompta(r.compta)}, à valider dans LabFlow Compta.`;
  if (r?.comptaRefus) return `Pas envoyée en comptabilité : ${r.comptaRefus.message} Vous pourrez l'envoyer depuis la page Factures.`;
  return '';
};
