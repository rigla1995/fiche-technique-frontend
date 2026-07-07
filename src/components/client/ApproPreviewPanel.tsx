import { useState } from 'react';
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

// Style du créneau flottant partagé (bas droite, sous le header).
const SLOT_STYLE: CSSProperties = {
  position: 'fixed',
  bottom: 14,
  right: 14,
  zIndex: 1100,
  pointerEvents: 'none',
  top: HEADER_H + 14,
  width: 370,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
};

// ─────────────────────────────────────────────────────────────────────────────
// Panneau d'alerte de production PT — occupe le MÊME emplacement que l'aperçu
// de saisie : quantités saisies + composants manquants (sous-produits inclus).
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductionSaisie {
  nom: string;
  quantite: number;
}
export interface ComposantManquant {
  nom: string;
  sousPt: boolean;
  dispo: number;
  besoin: number;
  manque: number;
}

export function ProductionAlertPanel({ productions, manquants }: { productions: ProductionSaisie[]; manquants: ComposantManquant[] }) {
  const [minimized, setMinimized] = useState(false);
  if (manquants.length === 0) return <div style={SLOT_STYLE} />;

  if (minimized) {
    return (
      <div style={SLOT_STYLE}>
        <button
          onClick={() => setMinimized(false)}
          style={{
            pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
            margin: '0 0 0 auto', padding: '8px 14px',
            background: 'linear-gradient(135deg,#b91c1c,#ef4444)',
            border: 'none', borderRadius: 30, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(220,38,38,0.35)', color: '#fff',
          }}
        >
          <span style={{ fontSize: '0.85rem' }}>⚠️</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>
            {manquants.length} composant{manquants.length > 1 ? 's' : ''} manquant{manquants.length > 1 ? 's' : ''}
          </span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div style={SLOT_STYLE}>
      <div style={{
        pointerEvents: 'auto', background: '#fff', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(220,38,38,0.22), 0 2px 8px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column',
        maxHeight: `calc(100vh - ${HEADER_H}px - 28px)`, overflow: 'hidden',
        border: '1.5px solid #fca5a5',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px 8px', background: 'linear-gradient(135deg,#b91c1c 0%,#ef4444 100%)',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.85rem' }}>⚠️</span>
            <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Production impossible
            </span>
          </div>
          <button
            onClick={() => setMinimized(true)}
            title="Réduire"
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, padding: 0, color: '#fff',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {/* Productions saisies */}
          <div style={{ padding: '9px 14px 7px', borderBottom: '1px solid #fee2e2', background: '#fef2f2' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Production saisie
            </div>
            {productions.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.76rem', color: '#7f1d1d', padding: '1px 0' }}>
                <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                <span style={{ fontWeight: 800, flexShrink: 0 }}>× {fmtQty(p.quantite)}</span>
              </div>
            ))}
          </div>

          {/* Manquants */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fff1f2' }}>
                {['Composant', 'Dispo', 'Nécess.', 'Manque'].map((h, i) => (
                  <th key={h} style={{ padding: '7px 10px', fontSize: '0.60rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 0 ? 'left' : 'right', borderBottom: '1px solid #fecaca', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {manquants.map((m, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fffbfb' }}>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #fee2e2', maxWidth: 130, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#7f1d1d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nom}</div>
                    {m.sousPt && <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#7c3aed' }}>sous-produit</div>}
                  </td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #fee2e2', textAlign: 'right', fontSize: '0.74rem', color: '#7f1d1d', whiteSpace: 'nowrap' }}>{fmtQty(m.dispo)}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #fee2e2', textAlign: 'right', fontSize: '0.74rem', color: '#7f1d1d', whiteSpace: 'nowrap' }}>{fmtQty(m.besoin)}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #fee2e2', textAlign: 'right', fontSize: '0.76rem', fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>{fmtQty(m.manque)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: '9px 14px', background: '#fef2f2', borderTop: '2px solid #fecaca', flexShrink: 0 }}>
          <span style={{ fontSize: '0.70rem', color: '#991b1b', lineHeight: 1.5 }}>
            Complétez le stock des composants (appro, transfert ou production du sous-produit). L'aperçu de saisie s'affichera quand tout sera couvert.
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ApproPreviewPanel({ lines }: Props) {
  const [minimized, setMinimized] = useState(false);
  const visible = lines.length > 0;
  const grandTTC = lines.reduce((s, l) => s + l.totalTTC, 0);
  const hasTva = lines.some((l) => l.tva != null && l.tva > 0);

  const wrapStyle: CSSProperties = {
    position: 'fixed',
    bottom: 14,
    right: 14,
    zIndex: 1100,
    pointerEvents: 'none',
    top: HEADER_H + 14,
    width: 370,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
  };

  if (!visible) {
    return <div style={wrapStyle} />;
  }

  // ── Minimized pill ──
  if (minimized) {
    return (
      <div style={wrapStyle}>
        <button
          onClick={() => setMinimized(false)}
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '0 0 0 auto',
            padding: '8px 14px',
            background: 'linear-gradient(135deg,#1e40af,#2563eb)',
            border: 'none',
            borderRadius: 30,
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
            color: '#fff',
          }}
        >
          {/* clipboard icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/>
            <line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
          <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>
            {lines.length} article{lines.length > 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>·</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>{fmtDT(grandTTC)} DT</span>
          {/* chevron up */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
      </div>
    );
  }

  // ── Expanded panel ──
  return (
    <div style={wrapStyle}>
      <div style={{
        pointerEvents: 'auto',
        background: '#fff',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: `calc(100vh - ${HEADER_H}px - 28px)`,
        transform: 'translateX(0)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px 8px',
          background: 'linear-gradient(135deg,#1e40af 0%,#2563eb 100%)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: '12px 12px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/>
              <line x1="9" y1="16" x2="13" y2="16"/>
            </svg>
            <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Aperçu saisie
            </span>
            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
              {lines.length} article{lines.length > 1 ? 's' : ''}
            </span>
          </div>
          {/* Minimize button */}
          <button
            onClick={() => setMinimized(true)}
            title="Réduire"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              padding: 0,
              color: '#fff',
              transition: 'background 0.15s',
            }}
          >
            {/* chevron down */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '7px 14px', fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  Article
                </th>
                <th style={{ padding: '7px 10px', fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  Qté
                </th>
                <th style={{ padding: '7px 10px', fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  Prix/u{hasTva && <span style={{ color: '#2563eb', marginLeft: 2 }}>TTC</span>}
                </th>
                <th style={{ padding: '7px 14px', fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', maxWidth: 140, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {line.nom}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span>{line.unite}</span>
                      {line.tva != null && line.tva > 0 && (
                        <span style={{ background: '#dbeafe', color: '#2563eb', padding: '0 5px', borderRadius: 4, fontWeight: 700, fontSize: '0.60rem' }}>
                          TVA {line.tva}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: '0.74rem', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {fmtQty(line.quantite)}
                  </td>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: '0.74rem', color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {fmtDT(line.prixTTCPerUnit)}
                  </td>
                  <td style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>
                    {fmtDT(line.totalTTC)} <span style={{ fontSize: '0.60rem', color: '#94a3b8', fontWeight: 500 }}>DT</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer total */}
        <div style={{
          padding: '10px 14px',
          background: '#f1f5f9',
          borderTop: '2px solid #e2e8f0',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total TTC
          </span>
          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e40af' }}>
            {fmtDT(grandTTC)} <span style={{ fontSize: '0.70rem', fontWeight: 600 }}>DT</span>
          </span>
        </div>
      </div>
    </div>
  );
}
