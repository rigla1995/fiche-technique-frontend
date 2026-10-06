// LabFlow Compta (chantier Achats & Comptabilité, labflow-reprise/achats-compta/SPEC-SOCLE.md, D11) : une seule image
// d'écrans sert app.labflow-tn.com et compta.labflow-tn.com ; le produit affiché se décide au démarrage par le nom
// d'hôte. En local, `npm run dev:compta` (mode Vite « compta », port 5174) force LabFlow Compta.
export type Produit = 'labflow' | 'compta';

export const produitDeLHote = (hote: string, mode?: string): Produit =>
  mode === 'compta' || /^compta\./i.test(hote) ? 'compta' : 'labflow';

export const PRODUIT: Produit = produitDeLHote(window.location.hostname, import.meta.env.MODE);

// Adresse de LabFlow Compta vue depuis LabFlow (étape S2b : un compte « comptable » connecté sur app. y est renvoyé) :
// compta.<domaine> en production (app.labflow-tn.com → compta.labflow-tn.com) ; en local, VITE_URL_COMPTA ou le port
// 5174 de `npm run dev:compta`.
export const adresseCompta = (lieu: Pick<Location, 'protocol' | 'hostname'> = window.location): string => {
  const fixe = import.meta.env.VITE_URL_COMPTA as string | undefined;
  if (fixe) return fixe.replace(/\/$/, '');
  if (/^app\./i.test(lieu.hostname)) return `${lieu.protocol}//${lieu.hostname.replace(/^app\./i, 'compta.')}`;
  if (lieu.hostname === 'localhost' || lieu.hostname === '127.0.0.1') return `${lieu.protocol}//${lieu.hostname}:5174`;
  return `${lieu.protocol}//compta.${lieu.hostname}`;
};

// Adresse de LabFlow (Stock / Vente) vue depuis LabFlow Compta (étape S3a : passage sans ressaisie) : app.<domaine> en
// production (compta.labflow-tn.com → app.labflow-tn.com) ; en local, VITE_URL_APP ou le port 5173 de `npm run dev`.
export const adresseApp = (lieu: Pick<Location, 'protocol' | 'hostname'> = window.location): string => {
  const fixe = import.meta.env.VITE_URL_APP as string | undefined;
  if (fixe) return fixe.replace(/\/$/, '');
  if (/^compta\./i.test(lieu.hostname)) return `${lieu.protocol}//${lieu.hostname.replace(/^compta\./i, 'app.')}`;
  if (lieu.hostname === 'localhost' || lieu.hostname === '127.0.0.1') return `${lieu.protocol}//${lieu.hostname}:5173`;
  return `${lieu.protocol}//${lieu.hostname}`;
};
