import type { CSSProperties } from 'react';

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

const fmtQty = (n: number) => n.toFixed(3).replace(/\.?0+$/, '') || '0';
const fmtCur = (n: number) => n.toFixed(2);

const TH: CSSProperties = {
  padding: '6px 10px',
  fontSize: '0.68rem',
  fontWeight: 800,
  color: '#2563eb',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  borderBottom: '2px solid #e5e7eb',
  background: '#f8fafc',
  textAlign: 'right',
};
const THLeft: CSSProperties = { ...TH, textAlign: 'left' };
const TD: CSSProperties = {
  padding: '7px 10px',
  fontSize: '0.78rem',
  color: '#374151',
  whiteSpace: 'nowrap',
  textAlign: 'right',
  borderBottom: '1px solid #f1f5f9',
};
const TDLeft: CSSProperties = { ...TD, textAlign: 'left', fontWeight: 600, color: '#1e293b' };
const TDAccent: CSSProperties = { ...TD, fontWeight: 700, color: '#1e293b' };
const TFoot: CSSProperties = {
  padding: '7px 10px',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#1e293b',
  whiteSpace: 'nowrap',
  textAlign: 'right',
  background: '#f1f5f9',
  borderTop: '2px solid #e5e7eb',
};
const TFootBlue: CSSProperties = { ...TFoot, color: '#2563eb', fontWeight: 800 };
const TFootLeft: CSSProperties = { ...TFoot, textAlign: 'left' };

export default function ApproPreviewPanel({ lines }: Props) {
  const visible = lines.length > 0;
  const grandHT = lines.reduce((s, l) => s + l.totalHT, 0);
  const grandTTC = lines.reduce((s, l) => s + l.totalTTC, 0);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#fff',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.13)',
        zIndex: 1200,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: visible ? 'auto' : 'none',
        maxHeight: '40vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 16px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Aperçu saisie
        </span>
        <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
          {lines.length} article{lines.length > 1 ? 's' : ''} · mis à jour en temps réel
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={THLeft}>Article</th>
              <th style={TH}>Quantité</th>
              <th style={TH}>Prix HT/u</th>
              <th style={TH}>TVA</th>
              <th style={TH}>Prix TTC/u</th>
              <th style={TH}>Total HT</th>
              <th style={TH}>Total TTC</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td style={TDLeft}>
                  {line.nom}
                  <span style={{ fontWeight: 400, fontSize: '0.7rem', color: '#94a3b8', marginLeft: 5 }}>
                    {line.unite}
                  </span>
                </td>
                <td style={TD}>{fmtQty(line.quantite)} {line.unite}</td>
                <td style={TD}>{fmtCur(line.prixHT)} €</td>
                <td style={TD}>{line.tva != null ? `${line.tva}%` : '—'}</td>
                <td style={TDAccent}>{fmtCur(line.prixTTCPerUnit)} €</td>
                <td style={TD}>{fmtCur(line.totalHT)} €</td>
                <td style={TDAccent}>{fmtCur(line.totalTTC)} €</td>
              </tr>
            ))}
          </tbody>
          {lines.length > 1 && (
            <tfoot>
              <tr>
                <td style={TFootLeft} colSpan={5}>Total</td>
                <td style={TFoot}>{fmtCur(grandHT)} €</td>
                <td style={TFootBlue}>{fmtCur(grandTTC)} €</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
