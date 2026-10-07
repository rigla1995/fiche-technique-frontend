// LabFlow Compta : styles partagés des boutons et des champs de ses pages (étape S3c ; repris à l'identique de la page
// Gérants de l'étape S3b). Fichier sans composant : le rechargement à chaud de Vite ne mêle pas styles et composants.
export const bouton = (fond: string, texte: string, bord: string): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 9, border: `1.5px solid ${bord}`, background: fond, color: texte, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' });
export const petit = (fond: string, texte: string, bord: string): React.CSSProperties => ({ padding: '6px 12px', background: fond, border: `1px solid ${bord}`, borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', color: texte, fontWeight: 700 });
export const pastille = (fond: string, texte: string): React.CSSProperties => ({ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: fond, color: texte });
export const rond: React.CSSProperties = { width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #4338ca', background: '#fff', color: '#4338ca', fontSize: '1rem', cursor: 'pointer' };
export const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
export const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
