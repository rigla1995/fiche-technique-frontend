import type { ModuleCompta } from './comptables';

// LabFlow Compta, étape S3b : gérants comptables supplémentaires dans la demande d'ajout de capacité du client (page des
// demandes). Ligne affichée seulement quand le module Comptabilité est actif ; prix à plein tarif (hors promotion).
// Rangé sous src/compta : vocabulaire comptable fixe.

export function LigneGerantsCompta({ module, valeur, changer }: { module: ModuleCompta; valeur: number; changer: (n: number) => void }) {
  const max = Math.max(0, module.nbGerantsMax - module.nbGerants);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#eef2ff', borderRadius: 10, border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 200px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>📒 Gérants comptables supplémentaires</div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
          Module Comptabilité, à plein tarif{module.prixGerant ? ` : ${module.prixGerant} DT / unité / mois` : ''} · actuellement {module.nbGerants}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" aria-label="Un gérant comptable de moins" onClick={() => changer(Math.max(0, valeur - 1))} disabled={valeur === 0}
          style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #e2e8f0', background: valeur === 0 ? '#f8fafc' : '#f1f5f9', color: valeur === 0 ? '#cbd5e1' : '#334155', fontSize: '1rem', cursor: valeur === 0 ? 'default' : 'pointer' }}>−</button>
        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'center' }}>{valeur}</span>
        <button type="button" aria-label="Un gérant comptable de plus" onClick={() => changer(Math.min(max, valeur + 1))} disabled={valeur >= max}
          style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid #4338ca', background: '#4338ca', color: '#fff', fontSize: '1rem', cursor: valeur >= max ? 'default' : 'pointer', opacity: valeur >= max ? 0.5 : 1 }}>+</button>
      </div>
      {valeur > 0 && module.prixGerant > 0 && (
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4338ca', minWidth: 60, textAlign: 'right' }}>+{(valeur * module.prixGerant).toFixed(0)} DT</span>
      )}
    </div>
  );
}
