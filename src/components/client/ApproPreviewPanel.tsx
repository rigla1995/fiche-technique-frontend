import React from 'react';

export interface PreviewLine {
  nom: string;
  unite: string;
  quantite: number;
  prixHT: number;
  tva: number | null;
  prixTTCPerUnit: number;
  totalHT: number;
  totalTTC: number;
}

interface Props {
  lines: PreviewLine[];
}

const fmt = (n: number, dec = 3) => n.toFixed(dec).replace(/\.?0+$/, '') || '0';
const fmtCur = (n: number) => n.toFixed(2);

export default function ApproPreviewPanel({ lines }: Props) {
  const visible = lines.length > 0;

  const grandHT = lines.reduce((s, l) => s + l.totalHT, 0);
  const grandTTC = lines.reduce((s, l) => s + l.totalTTC, 0);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 360,
        height: '100vh',
        background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.13)',
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 18px 12px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f8fafc',
      }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Aperçu saisie
        </div>
        <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>
          {lines.length} article{lines.length > 1 ? 's' : ''} · mis à jour en temps réel
        </div>
      </div>

      {/* Lines */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
        {lines.map((line, i) => {
          const hasTva = line.tva != null && line.tva > 0;
          return (
            <div
              key={i}
              style={{
                padding: '10px 18px',
                borderBottom: i < lines.length - 1 ? '1px solid #f1f5f9' : undefined,
              }}
            >
              {/* Article name */}
              <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#1e293b', marginBottom: 6 }}>
                {line.nom}
                <span style={{ fontWeight: 400, fontSize: '0.72rem', color: '#94a3b8', marginLeft: 6 }}>
                  {line.unite}
                </span>
              </div>

              {/* Grid of values */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.76rem' }}>
                <Row label="Quantité" value={`${fmt(line.quantite)} ${line.unite}`} />
                <Row label="Prix HT/u" value={`${fmtCur(line.prixHT)} €`} />
                {hasTva && <Row label="TVA" value={`${line.tva}%`} />}
                <Row label="Prix TTC/u" value={`${fmtCur(line.prixTTCPerUnit)} €`} accent />
                <Row label="Total HT" value={`${fmtCur(line.totalHT)} €`} />
                <Row label="Total TTC" value={`${fmtCur(line.totalTTC)} €`} accent />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer totals */}
      {lines.length > 1 && (
        <div style={{
          borderTop: '2px solid #e5e7eb',
          padding: '14px 18px',
          background: '#f8fafc',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 6 }}>
            <span style={{ color: '#6b7280', fontWeight: 600 }}>Total HT</span>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>{fmtCur(grandHT)} €</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: '#2563eb', fontWeight: 700 }}>Total TTC</span>
            <span style={{ fontWeight: 800, color: '#2563eb' }}>{fmtCur(grandTTC)} €</span>
          </div>
        </div>
      )}

      {lines.length === 1 && (
        <div style={{
          borderTop: '1px solid #e5e7eb',
          padding: '12px 18px',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.82rem',
        }}>
          <span style={{ color: '#2563eb', fontWeight: 700 }}>Total TTC</span>
          <span style={{ fontWeight: 800, color: '#2563eb' }}>{fmtCur(grandTTC)} €</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: accent ? 700 : 500, color: accent ? '#1e293b' : '#374151', textAlign: 'right' }}>
        {value}
      </span>
    </>
  );
}
