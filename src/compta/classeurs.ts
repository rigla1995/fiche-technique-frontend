import api from '../api/client';

// LabFlow Compta, étape S5c « Les tiers et les imports » (labflow-reprise/achats-compta/PLAN-S5.md §4 ; SPEC-SOCLE D18) :
// les classeurs Excel des pages — téléchargement (modèles d'import, exports à la charte) et téléversement (imports en
// TOUT-OU-RIEN : le serveur contrôle toutes les lignes et n'écrit rien à la moindre erreur ; son rapport, une entrée par
// ligne fausse, s'affiche tel quel). Le serveur décide ; l'écran envoie et montre.
export const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export interface LigneImportFausse { ligne: number; repere: string; erreurs: string[] }
export interface RapportImport { message: string; code?: string; lignes: LigneImportFausse[]; nbLignes: number; nbErreurs: number }

// Téléchargement d'un classeur, nom du fichier lu dans la réponse (sinon `nomParDefaut`).
export const telechargerClasseur = async (chemin: string, nomParDefaut: string) => {
  const res = await api.get(chemin, { responseType: 'blob' });
  const cd = (res.headers['content-disposition'] as string | undefined) || '';
  const m = cd.match(/filename="?([^"]+)"?/);
  const url = window.URL.createObjectURL(new Blob([res.data as BlobPart], { type: TYPE_XLSX }));
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', m ? m[1] : nomParDefaut);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

// Téléversement d'un classeur (champ « fichier », champs texte en plus) ; la réponse du serveur telle quelle.
export const televerserClasseur = async <T,>(chemin: string, fichier: File, champs: Record<string, string> = {}): Promise<T> => {
  const form = new FormData();
  for (const [k, v] of Object.entries(champs)) form.append(k, v);
  form.append('fichier', fichier);
  const { data } = await api.post(chemin, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data as T;
};

// Le rapport ligne par ligne d'un import refusé (400 IMPORT_ERREURS), ou null pour tout autre refus.
export const rapportDe = (err: unknown): RapportImport | null => {
  const r = (err as { response?: { data?: Partial<RapportImport> } })?.response?.data;
  return r && Array.isArray(r.lignes) ? (r as RapportImport) : null;
};
export const estClasseur = (f: File) => /\.xlsx$/i.test(f.name);
