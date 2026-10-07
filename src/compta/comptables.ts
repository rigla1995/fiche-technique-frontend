import { useEffect, useState } from 'react';
import api from '../api/client';

// LabFlow Compta, étape S3b : constantes et lectures partagées par les écrans du comptable du client (page Gérants de
// LabFlow, « Ma comptabilité », « Comptabilité de … », demande d'ajout). Vocabulaire comptable fixe.

export type Niveau = 'consultation' | 'saisie' | 'complet';
// Niveaux validés par le client le 07/10 ; ils prendront effet avec les dossiers et la saisie.
export const NIVEAUX: { valeur: Niveau; libelle: string; aide: string }[] = [
  { valeur: 'consultation', libelle: 'Consultation', aide: 'tout lire, sans rien écrire' },
  { valeur: 'saisie', libelle: 'Saisie', aide: 'saisir les pièces et les écritures, sans valider, clôturer ni configurer' },
  { valeur: 'complet', libelle: 'Complet', aide: 'tout, y compris valider, clôturer et configurer le dossier' },
];
export const libelleNiveau = (n: string) => NIVEAUX.find((x) => x.valeur === n)?.libelle || n;

// Module Comptabilité du compte connecté (GET /api/abonnements/module-compta) : actif, prix d'un gérant comptable
// supplémentaire (plein tarif, hors promotion), gérants achetés et plafond.
export interface ModuleCompta { actif: boolean; prixGerant: number; nbGerants: number; nbGerantsMax: number }

export function useModuleCompta(): ModuleCompta | null {
  const [module, setModule] = useState<ModuleCompta | null>(null);
  useEffect(() => {
    let annule = false;
    api.get('/api/abonnements/module-compta')
      .then(({ data }) => {
        const d = data as Partial<ModuleCompta>;
        if (!annule) setModule({ actif: d.actif === true, prixGerant: Number(d.prixGerant) || 0, nbGerants: Number(d.nbGerants) || 0, nbGerantsMax: Number(d.nbGerantsMax) || 50 });
      })
      .catch(() => { /* pas de module : rien à afficher */ });
    return () => { annule = true; };
  }, []);
  return module;
}

export const libelleGerantsCompta = (n: number) => `+${n} gérant${n > 1 ? 's' : ''} comptable${n > 1 ? 's' : ''}`;
