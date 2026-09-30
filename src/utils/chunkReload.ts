// Après un déploiement, les fichiers de page de l'ancienne version (chunks Vite à nom
// haché) n'existent plus : un onglet resté ouvert échoue à les charger et l'import
// dynamique est rejeté. On recharge alors la page UNE fois pour prendre la nouvelle
// version — garde anti-boucle en sessionStorage (pas de second rechargement avant 60 s).

const CLE = 'labflow:rechargement-chunk';
const DELAI_MS = 60_000;
let lance = false;

/** L'erreur vient-elle du chargement d'un fichier de page (import dynamique / CSS préchargé) ? */
export const estErreurDeChunk = (error: unknown): boolean => {
  const e = error as { name?: string; message?: string } | null;
  const texte = `${e?.name ?? ''} ${e?.message ?? String(error ?? '')}`;
  // Chrome : « Failed to fetch dynamically imported module » · Firefox : « error loading
  // dynamically imported module » · Safari : « Importing a module script failed » ·
  // Vite : « Unable to preload CSS for … »
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS/i.test(texte);
};

/**
 * Recharge la page si aucun rechargement automatique n'a eu lieu dans la dernière minute.
 * @returns true si un rechargement est lancé, false sinon (déjà tenté, ou stockage indisponible).
 */
export const rechargerUneFois = (): boolean => {
  if (lance) return true;
  try {
    const dernier = Number(sessionStorage.getItem(CLE) || 0);
    if (Date.now() - dernier < DELAI_MS) return false;
    sessionStorage.setItem(CLE, String(Date.now()));
  } catch {
    return false; // sans garde anti-boucle, on ne recharge pas automatiquement
  }
  lance = true;
  window.location.reload();
  return true;
};
