import { useState } from 'react';

export interface InvoiceLineItem {
  ingredientId: number;
  nom: string;
  unite: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number | null;
}

interface Props {
  lines: InvoiceLineItem[];
  date: string;
  fournisseurNom: string | null;
  refFacture: string | null;
  theme: 'activite' | 'labo';
  onConfirm: (timbreFiscal: boolean) => void;
  onCancel: () => void;
}

const TIMBRE = 1;

export default function InvoiceConfirmModal({ lines, date, fournisseurNom, refFacture, theme, onConfirm, onCancel }: Props) {
  const [timbreFiscal, setTimbreFiscal] = useState(true);

  const [y, m, d] = date.split('-');
  const dateLabel = `${d}/${m}/${y}`;
  const accent = theme === 'labo' ? '#0f766e' : '#d97706';
  const accentBg = theme === 'labo' ? '#f0fdf4' : '#fffbeb';
  const accentBorder = theme === 'labo' ? '#bbf7d0' : '#fde68a';

  const totalHT = lines.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  const totalTTC = lines.reduce((s, l) => {
    const ht = l.quantite * l.prixUnitaire;
    return s + ht * (1 + (l.tauxTva ?? 0) / 100);
  }, 0);
  const totalTTCWithTimbre = totalTTC + (timbreFiscal ? TIMBRE : 0);
  const hasTva = lines.some((l) => l.tauxTva != null && l.tauxTva > 0);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 620, width: '96%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, borderBottom: 'none', padding: '16px 20px' }}>
          <div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>Confirmation d'approvisionnement</h2>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', marginTop: 2 }}>
              {refFacture ? `Réf: ${refFacture}` : 'Sans référence facture'} &nbsp;·&nbsp; {dateLabel}
              {fournisseurNom && <> &nbsp;·&nbsp; {fournisseurNom}</>}
            </div>
          </div>
          <button className="modal-close" onClick={onCancel} style={{ color: '#fff' }}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '16px 20px', maxHeight: '55vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: accentBg, borderBottom: `2px solid ${accentBorder}` }}>
                {(['Article', 'Qté', 'Unité', 'Prix HT/u', hasTva ? 'TVA %' : null, hasTva ? 'Prix TTC/u' : null, 'Total HT', hasTva ? 'Total TTC' : null] as (string | null)[])
                  .filter(Boolean)
                  .map((h) => (
                    <th key={h!} style={{ padding: '7px 10px', fontWeight: 700, textAlign: h === 'Article' ? 'left' : 'right', color: accent, textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const ht = l.quantite * l.prixUnitaire;
                const tva = l.tauxTva ?? 0;
                const ttcUnit = l.prixUnitaire * (1 + tva / 100);
                const ttcTotal = ht * (1 + tva / 100);
                return (
                  <tr key={l.ingredientId} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{l.nom}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{l.quantite.toFixed(3)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>{l.unite}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{l.prixUnitaire.toFixed(3)}</td>
                    {hasTva && <td style={{ padding: '7px 10px', textAlign: 'right', color: '#0369a1' }}>{l.tauxTva != null ? `${l.tauxTva}%` : '—'}</td>}
                    {hasTva && <td style={{ padding: '7px 10px', textAlign: 'right' }}>{ttcUnit.toFixed(3)}</td>}
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{ht.toFixed(3)}</td>
                    {hasTva && <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>{ttcTotal.toFixed(3)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ background: accentBg, borderTop: `1px solid ${accentBorder}`, padding: '10px 20px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Timbre fiscal checkbox */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, color: '#374151', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={timbreFiscal}
              onChange={(e) => setTimbreFiscal(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: accent, cursor: 'pointer' }}
            />
            Timbre Fiscal
            <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.78rem' }}>
              {timbreFiscal ? `+ ${TIMBRE.toFixed(3)} DT` : '(désactivé)'}
            </span>
          </label>

          {/* Totals + buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 20, fontSize: '0.88rem', fontWeight: 700, flexWrap: 'wrap' }}>
              <span>Total HT : <span style={{ color: accent }}>{totalHT.toFixed(3)} DT</span></span>
              <span>
                Total TTC : <span style={{ color: accent }}>{totalTTCWithTimbre.toFixed(3)} DT</span>
                {timbreFiscal && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>(dont 1.000 DT timbre)</span>}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
              <button
                onClick={() => onConfirm(timbreFiscal)}
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
              >
                Confirmer l'appro
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
