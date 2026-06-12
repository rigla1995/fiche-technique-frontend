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
const fmtDT = (n: number) => n.toFixed(3);

const HEADER_H = 62;

const TH: CSSProperties = {
  padding: '5px 8px',
  fontSize: '0.64rem',
  fontWeight: 800,
  color: '#2563eb',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
  borderBottom: '2px solid #e5e7eb',
  background: '#f8fafc',
  textAlign: 'right',
};
const THLeft: CSSProperties = { ...TH, textAlign: 'left' };

const TD: CSSProperties = {
  padding: '6px 8px',
  fontSize: '0.74rem',
  color: '#374151',
  whiteSpace: 'nowrap',
  textAlign: 'right',
  borderBottom: '1px solid #f1f5f9',
};
const TDLeft: CSSProperties = { ...TD, textAlign: 'left', fontWeight: 700, color: '#1e293b', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' };
const TDAccent: CSSProperties = { ...TD, fontWeight: 700, color: '#1e293b' };

const TFoot: CSSProperties = {
  padding: '6px 8px',
  fontSize: '0.74rem',
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
    /* Outer wrapper: full column height but transparent to pointer events above the panel */
    <div style={{
      position: 'fixed',
      top: HEADER_H,
      bottom: 0,
      right: 0,
      width: 420,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      zIndex: 1100,
      pointerEvents: 'none',
    }}>
    <div
      style={{
        background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.13)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: `calc(100vh - ${HEADER_H}px)`,
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid #e5e7eb',
        background: '#f8fafc',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Aperçu saisie
        </span>
        <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>
          {lines.length} article{lines.length > 1 ? 's' : ''} · temps réel
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={THLeft}>Article</th>
              <th style={TH}>Qté</th>
              <th style={TH}>HT/u</th>
              <th style={TH}>TVA</th>
              <th style={TH}>TTC/u</th>
              <th style={TH}>Tot. TTC</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td style={TDLeft} title={`${line.nom} (${line.unite})`}>
                  {line.nom}
                  <span style={{ fontWeight: 400, fontSize: '0.65rem', color: '#94a3b8', marginLeft: 4 }}>
                    {line.unite}
                  </span>
                </td>
                <td style={TD}>{fmtQty(line.quantite)}</td>
                <td style={TD}>{fmtDT(line.prixHT)}</td>
                <td style={TD}>{line.tva != null ? `${line.tva}%` : '—'}</td>
                <td style={TDAccent}>{fmtDT(line.prixTTCPerUnit)}</td>
                <td style={TDAccent}>{fmtDT(line.totalTTC)} DT</td>
              </tr>
            ))}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <td style={TFootLeft} colSpan={4}>Total</td>
                <td style={TFoot}>{fmtDT(grandHT)} DT</td>
                <td style={TFootBlue}>{fmtDT(grandTTC)} DT</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
    </div>
  );
}
