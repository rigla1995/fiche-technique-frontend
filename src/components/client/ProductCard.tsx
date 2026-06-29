import type { ReactNode } from 'react';
import type { Product } from '../../types';

interface NamedRef { id: number; nom: string }

// Bloc de chips d'assignation (Activités ou Labos), réutilisé tel quel pour les deux.
function AssignmentBlock({ label, items, assignedIds, togglingId, onToggle, canWrite }: {
  label: string;
  items: NamedRef[];
  assignedIds: Set<number>;
  togglingId: number | null;
  onToggle: (id: number) => void;
  canWrite: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {items.map((it) => {
          const assigned = assignedIds.has(it.id);
          const toggling = togglingId === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onToggle(it.id)}
              disabled={toggling || !canWrite}
              style={{
                fontSize: '0.68rem', fontWeight: 600, padding: '3px 9px', borderRadius: 20, cursor: canWrite ? 'pointer' : 'default',
                border: `1px solid ${assigned ? '#c7d2fe' : '#e2e8f0'}`,
                background: assigned ? '#eef2ff' : '#f8fafc',
                color: assigned ? '#3730a3' : '#94a3b8',
                opacity: toggling ? 0.5 : 1, transition: 'background 0.15s, color 0.15s',
              }}
            >
              {toggling ? '…' : (assigned ? '✓ ' : '') + it.nom}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Card produit unifiée (Vendables / Suppléments / PU / Composés valorisés).
export default function ProductCard({
  product, icon, iconGradient, badges, onVoir, voirSummary, actions,
  activities, assignedActiviteIds, togglingActiviteId, onToggleActivite,
  labos, assignedLaboIds, togglingLaboId, onToggleLabo, canWrite,
}: {
  product: Product;
  icon: string;
  iconGradient: string;
  badges?: ReactNode;
  onVoir: () => void;
  voirSummary?: string;
  voirDisabled?: boolean;
  actions: ReactNode;
  activities: NamedRef[];
  assignedActiviteIds: Set<number>;
  togglingActiviteId: number | null;
  onToggleActivite: (id: number) => void;
  labos: NamedRef[];
  assignedLaboIds: Set<number>;
  togglingLaboId: number | null;
  onToggleLabo: (id: number) => void;
  canWrite: boolean;
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: iconGradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', lineHeight: 1.3 }}>{product.name}</div>
          {product.refProduit && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Réf : {product.refProduit}</div>}
          {badges && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>{badges}</div>}
        </div>
      </div>

      <button
        onClick={onVoir}
        title="Voir la composition (articles + sous-produits)"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '9px 10px', borderRadius: 10, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}
      >
        <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>👁</span>
        <span>Voir composition</span>
        {voirSummary && <span style={{ fontWeight: 500, fontSize: '0.72rem', color: '#6366f1' }}>· {voirSummary}</span>}
      </button>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {actions}
      </div>

      <AssignmentBlock label="Activités" items={activities} assignedIds={assignedActiviteIds} togglingId={togglingActiviteId} onToggle={onToggleActivite} canWrite={canWrite} />
      <AssignmentBlock label="Labos" items={labos} assignedIds={assignedLaboIds} togglingId={togglingLaboId} onToggle={onToggleLabo} canWrite={canWrite} />
    </div>
  );
}
