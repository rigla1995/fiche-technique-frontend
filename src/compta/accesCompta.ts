import { createContext, useContext } from 'react';

// Accès de la personne connectée aux comptabilités (GET /api/compta/acces), partagés par la mise en page de LabFlow
// Compta (fournisseur : AccesCompta.tsx) : le menu et les pages réservées se règlent sur les ACCÈS, plus sur le rôle
// (étape S3a — un comptable invité par un client, ou un collaborateur de cabinet, a le rôle « comptable » sans être
// titulaire d'un cabinet).
// etatAbonnement (S3b, D4) : état de l'abonnement du titulaire de la comptabilité ; niveau (S3c) : celui de la personne.
export interface CarteAcces {
  id: number; nom: string; etat: string; role: 'titulaire' | 'gerant'; lien: string | null;
  niveau?: 'consultation' | 'saisie' | 'complet';
  etatAbonnement?: 'actif' | 'lecture_seule' | 'bloque' | 'suspendu';
}
export interface AccesCompta { cabinets: CarteAcces[]; maComptabilite: CarteAcces[]; confiees: CarteAcces[] }

export interface ValeurAcces { acces: AccesCompta | null; erreur: boolean; recharger: () => void }
export const ContexteAcces = createContext<ValeurAcces>({ acces: null, erreur: false, recharger: () => {} });

export const useAccesCompta = () => useContext(ContexteAcces);

// Titulaire d'un cabinet : ses pages « Mon cabinet » et « Abonnement et factures ».
export const estTitulaireCabinet = (acces: AccesCompta | null) => !!acces?.cabinets.some((c) => c.role === 'titulaire');
