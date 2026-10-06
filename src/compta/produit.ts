// LabFlow Compta (chantier Achats & Comptabilité, labflow-reprise/achats-compta/SPEC-SOCLE.md, D11) : une seule image
// d'écrans sert app.labflow-tn.com et compta.labflow-tn.com ; le produit affiché se décide au démarrage par le nom
// d'hôte. En local, `npm run dev:compta` (mode Vite « compta », port 5174) force LabFlow Compta.
export type Produit = 'labflow' | 'compta';

export const produitDeLHote = (hote: string, mode?: string): Produit =>
  mode === 'compta' || /^compta\./i.test(hote) ? 'compta' : 'labflow';

export const PRODUIT: Produit = produitDeLHote(window.location.hostname, import.meta.env.MODE);
