import { useEffect, useMemo, useRef, useState } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  /** libellé du filtre, ex : « Activités » */
  label: string;
  icon?: string;
  options: MultiSelectOption[];
  /** valeurs cochées ; liste vide = « tout » (aucun filtre appliqué) */
  selected: string[];
  onChange: (values: string[]) => void;
  accent?: string;
  /** au-delà de ce nombre d'options, une recherche interne s'affiche */
  searchThreshold?: number;
}

/**
 * Filtre multi-sélection générique (bouton + panneau à cases à cocher,
 * recherche interne, tout/aucun). Convention : sélection vide = pas de
 * filtre (toutes les valeurs) — le bouton l'affiche comme « Tous ».
 */
export default function MultiSelectFilter({
  label, icon, options, selected, onChange, accent = '#2563eb', searchThreshold = 8,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { if (!open) setSearch(''); }, [open]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  // Sélection pleine ≡ sélection vide (= aucun filtre) : une seule représentation.
  const emit = (values: string[]) => onChange(values.length >= options.length ? [] : values);

  const toggle = (value: string) => {
    emit(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const allSelected = selected.length === 0;
  const resume = allSelected
    ? 'Tous'
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? '1 sélection')
      : `${selected.length} sélections`;

  if (options.length === 0) return null;

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
          border: `1.5px solid ${allSelected ? '#e2e8f0' : accent}`,
          background: allSelected ? '#fff' : `${accent}14`,
          fontSize: '0.8rem', fontWeight: 600,
          color: allSelected ? '#475569' : accent,
          maxWidth: 230,
        }}
      >
        {icon && <span>{icon}</span>}
        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resume}</span>
        {!allSelected && (
          <span style={{ background: accent, color: '#fff', borderRadius: 20, fontSize: '0.66rem', fontWeight: 800, padding: '1px 7px' }}>{selected.length}</span>
        )}
        <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 12px 36px rgba(15,23,42,0.16)', minWidth: 240, maxWidth: 320,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{icon} {label}</span>
            <button type="button" onClick={() => onChange([])} style={miniBtn(accent)}>Tous (aucun filtre)</button>
          </div>
          {options.length > searchThreshold && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                style={{ width: '100%', padding: '6px 9px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem', fontFamily: 'inherit' }}
              />
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: '6px 0' }}>
            {visible.length === 0 && <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#94a3b8' }}>Aucun résultat.</div>}
            {visible.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <label key={o.value} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 14px',
                  cursor: 'pointer', fontSize: '0.82rem', color: checked ? '#1e293b' : '#475569',
                  fontWeight: checked ? 700 : 500, background: checked ? `${accent}0d` : 'transparent',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} style={{ accentColor: accent }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                </label>
              );
            })}
          </div>
          {!allSelected && (
            <div style={{ padding: '7px 12px', borderTop: '1px solid #f1f5f9', fontSize: '0.7rem', color: '#94a3b8' }}>
              Sans coche = tout est pris en compte.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const miniBtn = (color: string): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: '0.7rem', fontWeight: 700, color, padding: '2px 4px',
});
