// ── Counter input ─────────────────────────────────────────────────────────────
// Compteur « − n + » partagé par le wizard client (AddClientModal) et l'édition
// de la composition (AbonnementsManagement). `max` (optionnel, null = illimité)
// verrouille le bouton + ; `disabled` gèle les deux boutons.

export interface CounterProps {
  label: string;
  sub?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number | null;
  disabled?: boolean;
}

export default function Counter({ label, sub, value, onChange, min = 0, max = null, disabled = false }: CounterProps) {
  const atMin = disabled || value <= min;
  const atMax = disabled || (max != null && value >= max);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: disabled ? 0.6 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>}
        {(min > 0 || max != null) && (
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
            {min > 0 ? `min ${min}` : ''}{min > 0 && max != null ? ' · ' : ''}{max != null ? `max ${max}` : ''}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={atMin}
          style={{
            width: 32, height: 32, borderRadius: '50%', border: '1.5px solid #e2e8f0',
            background: atMin ? '#f8fafc' : '#f1f5f9',
            color: atMin ? '#cbd5e1' : '#334155',
            fontSize: 18, cursor: atMin ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1,
          }}>−</button>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'center' }}>{value}</span>
        <button
          type="button"
          onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
          disabled={atMax}
          style={{
            width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${atMax ? '#e2e8f0' : '#6366f1'}`,
            background: atMax ? '#f8fafc' : '#6366f1', color: atMax ? '#cbd5e1' : '#fff',
            fontSize: 18, cursor: atMax ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, lineHeight: 1,
          }}>+</button>
      </div>
    </div>
  );
}
