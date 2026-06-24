import { useState, useRef, useEffect } from 'react';

const OPTIONS = [
  ['manuel', 'Manuel'],
  ['transfert', 'Transfert'],
  ['vente', 'Vente'],
  ['pt', 'PT'],
] as const;

interface Props {
  selected: Set<string>;
  onToggle: (key: string) => void;
  accent?: string;
}

// Champ déroulant multi-sélection (cases à cocher) pour filtrer par type d'appro.
export default function TypeApproFilter({ selected, onToggle, accent = '#1e40af' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const count = selected.size;
  const label = count === 0 ? 'Tous les types' : OPTIONS.filter(([k]) => selected.has(k)).map(([, l]) => l).join(', ');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${count ? accent : '#cbd5e1'}`,
          background: '#fff', color: '#334155', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
          minWidth: 150, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{label}</span>
        <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 30, background: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, minWidth: 170,
        }}>
          {OPTIONS.map(([key, lbl]) => (
            <label
              key={key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', color: '#334155' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <input type="checkbox" checked={selected.has(key)} onChange={() => onToggle(key)} style={{ accentColor: accent, cursor: 'pointer' }} />
              {lbl}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
