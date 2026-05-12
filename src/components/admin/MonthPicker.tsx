import { useState, useEffect, useRef } from 'react';

const MONTH_ABBR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const MONTH_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export function MonthPicker({
  value,
  onChange,
  isDisabled,
  borderColor = '#fde68a',
}: {
  value: string;
  onChange: (ym: string) => void;
  isDisabled: (ym: string) => boolean;
  borderColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => {
    if (value && value.length >= 7) return parseInt(value.slice(0, 4));
    return new Date().getFullYear();
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && value.length >= 7) setYear(parseInt(value.slice(0, 4)));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedLabel = value && value.length >= 7
    ? `${MONTH_FULL[parseInt(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`
    : '';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12,
          border: `1px solid ${open ? '#d97706' : borderColor}`,
          background: open ? '#fffbeb' : '#fff',
          color: value ? '#92400e' : '#9ca3af',
          cursor: 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontWeight: value ? 600 : 400,
          boxShadow: open ? '0 0 0 2px #fde68a' : 'none',
          transition: 'all 0.15s',
        }}
      >
        <span>{selectedLabel || 'Choisir un mois…'}</span>
        <span style={{ fontSize: 10, color: '#d97706', marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: '#fff', borderRadius: 10,
          border: '1px solid #fde68a',
          boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
          padding: '10px 10px 8px',
          minWidth: 200,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button type="button" onClick={() => setYear((y) => y - 1)}
              style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 7, background: '#f8fafc', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', padding: 0, fontWeight: 700 }}>
              ‹
            </button>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>{year}</span>
            <button type="button" onClick={() => setYear((y) => y + 1)}
              style={{ width: 26, height: 26, border: '1px solid #e2e8f0', borderRadius: 7, background: '#f8fafc', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', padding: 0, fontWeight: 700 }}>
              ›
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {MONTH_ABBR.map((label, i) => {
              const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
              const disabled = isDisabled(ym);
              const selected = value === ym;
              return (
                <button
                  type="button"
                  key={ym}
                  disabled={disabled}
                  onClick={() => { if (!disabled) { onChange(ym); setOpen(false); } }}
                  style={{
                    padding: '6px 2px',
                    borderRadius: 6,
                    border: selected ? '2px solid #d97706' : '1.5px solid transparent',
                    background: disabled ? '#f9fafb' : selected ? '#fef3c7' : '#f3f4f6',
                    color: disabled ? '#d1d5db' : selected ? '#92400e' : '#374151',
                    fontSize: 11,
                    fontWeight: selected ? 700 : 500,
                    cursor: disabled ? 'default' : 'pointer',
                    transition: 'background 0.1s',
                  }}
                  title={disabled ? 'Non disponible' : MONTH_FULL[i] + ' ' + year}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
