import { useEffect, useState } from 'react';
import api from '../api/client';

// LabFlow Compta, étape S3b : constantes et lectures partagées par les écrans du comptable du client (page Gérants de
// LabFlow, « Ma comptabilité », « Comptabilité de … », demande d'ajout). Vocabulaire comptable fixe.

export type Niveau = 'consultation' | 'saisie' | 'complet';
// Niveaux validés par le client le 07/10 ; ils comptent sur les dossiers depuis S4a (Complet crée et modifie) ; la saisie viendra.
export const NIVEAUX: { valeur: Niveau; libelle: string; aide: string }[] = [
  { valeur: 'consultation', libelle: 'Consultation', aide: 'tout lire, sans rien écrire' },
  { valeur: 'saisie', libelle: 'Saisie', aide: 'saisir les pièces et les écritures, sans valider, clôturer ni configurer' },
  { valeur: 'complet', libelle: 'Complet', aide: 'tout, y compris valider, clôturer et configurer le dossier' },
];
export const libelleNiveau = (n: string) => NIVEAUX.find((x) => x.valeur === n)?.libelle || n;

// S4c (réponses 2 et 4 du client du 07/10) : les dossiers d'un accès — « tous » (ceux d'aujourd'hui et ceux à venir) ou
// la liste des identifiants des dossiers qui lui sont ouverts. Le serveur contrôle les identifiants.
export type DossiersAcces = 'tous' | number[];
// Un dossier de la comptabilité pour la liste à cocher (catalogue rendu par le serveur, archivés compris, classés après).
export interface DossierChoix { id: number; nom: string; matriculeFiscal: string | null; etat: 'actif' | 'archive'; source: 'saisi' | 'labflow' }
// Résumé d'un réglage pour une carte : « Tous les dossiers », « Aucun dossier ouvert » (à signaler), « 2 dossiers : A, B ».
// Sans réglage (serveur d'avant S4c encore servi), un accès voit tout.
export const resumeDossiers = (d: DossiersAcces | undefined, catalogue: DossierChoix[] = []): { texte: string; vide: boolean } => {
  if (!d || d === 'tous') return { texte: 'Tous les dossiers', vide: false };
  if (d.length === 0) return { texte: 'Aucun dossier ouvert', vide: true };
  const noms = d.map((id) => catalogue.find((x) => x.id === id)?.nom || `n° ${id}`);
  return { texte: `${d.length} dossier${d.length > 1 ? 's' : ''} : ${noms.slice(0, 3).join(', ')}${noms.length > 3 ? '…' : ''}`, vide: false };
};

// Module Comptabilité du compte connecté (GET /api/abonnements/module-compta) : actif, prix d'un gérant comptable
// supplémentaire (plein tarif, hors promotion), gérants achetés et plafond.
// totalMensuel : postes du module en place (module et gérants comptables), à plein tarif.
export interface ModuleCompta { actif: boolean; prixGerant: number; nbGerants: number; nbGerantsMax: number; totalMensuel: number }

export function useModuleCompta(): ModuleCompta | null {
  const [module, setModule] = useState<ModuleCompta | null>(null);
  useEffect(() => {
    let annule = false;
    api.get('/api/abonnements/module-compta')
      .then(({ data }) => {
        const d = data as Partial<ModuleCompta>;
        if (!annule) setModule({ actif: d.actif === true, prixGerant: Number(d.prixGerant) || 0, nbGerants: Number(d.nbGerants) || 0, nbGerantsMax: Number(d.nbGerantsMax) || 50, totalMensuel: Number(d.totalMensuel) || 0 });
      })
      .catch(() => { /* pas de module : rien à afficher */ });
    return () => { annule = true; };
  }, []);
  return module;
}

export const libelleGerantsCompta = (n: number) => `+${n} gérant${n > 1 ? 's' : ''} comptable${n > 1 ? 's' : ''}`;
