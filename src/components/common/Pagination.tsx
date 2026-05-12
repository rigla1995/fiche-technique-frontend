interface PaginationProps {
  total: number;
  page: number;
  perPage?: number;
  onChange: (page: number) => void;
}

export default function Pagination({ total, page, perPage = 10, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border)', background: '#f8fafc', borderRadius: '0 0 10px 10px' }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        {from}–{to} sur <strong>{total}</strong>
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          style={btnStyle(page === 1)}
        >
          ← Préc.
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce<(number | '…')[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} style={{ padding: '5px 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>…</span>
            ) : (
              <button key={p} onClick={() => onChange(p as number)} style={btnStyle(false, p === page)}>
                {p}
              </button>
            )
          )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          style={btnStyle(page === totalPages)}
        >
          Suiv. →
        </button>
      </div>
    </div>
  );
}

const btnStyle = (disabled: boolean, active = false): React.CSSProperties => ({
  padding: '5px 10px',
  borderRadius: 6,
  border: active ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
  background: active ? '#eef2ff' : disabled ? '#f8fafc' : '#fff',
  color: active ? '#4338ca' : disabled ? '#cbd5e1' : '#374151',
  fontSize: '0.8rem',
  fontWeight: active ? 700 : 500,
  cursor: disabled ? 'default' : 'pointer',
  minWidth: 34,
  textAlign: 'center',
});
