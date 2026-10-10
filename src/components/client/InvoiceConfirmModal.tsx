import { useState } from 'react';
import { useVocabulaire } from '../../hooks/useVocabulaire';

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
  onConfirm: (timbreFiscal: boolean, timbreMontant: number) => void;
  onCancel: () => void;
  /** Factures fournisseur, étape F1 : nombre de fichiers joints (undefined : la saisie n'en propose pas). */
  nbPieces?: number;
  /** Étape F2 : timbre et totaux lus sur la facture déposée (null : pas de lecture). */
  timbreLu?: number | null;
  totauxLus?: { ht: number | null; ttc: number | null } | null;
}

// Timbre fiscal (LF 2026) : 1 D ; grandes surfaces 1,5 D (factures de 50 à 100 D) ou 2 D (au-delà).
const TIMBRES = [1, 1.5, 2];
// Même écriture que les montants de cette fenêtre (« 450.000 »).
const enDinars = (n: number) => n.toFixed(3);

export default function InvoiceConfirmModal({ lines, date, fournisseurNom, refFacture, theme, onConfirm, onCancel, nbPieces, timbreLu, totauxLus }: Props) {
  // Le timbre lu sur la facture règle la case et le montant ; sans lecture, 1 D coché comme avant.
  const [timbreFiscal, setTimbreFiscal] = useState(timbreLu !== 0);
  const [timbre, setTimbre] = useState(timbreLu != null && TIMBRES.includes(timbreLu) ? timbreLu : 1);
  const voc = useVocabulaire();

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
  const totalTTCWithTimbre = totalTTC + (timbreFiscal ? timbre : 0);
  // Comparaison avec le TTC lu sur la facture (au centime près : les arrondis des lignes peuvent différer d'un millime).
  const ttcLu = totauxLus?.ttc ?? null;
  const ecart = ttcLu == null ? null : Math.round((totalTTCWithTimbre - ttcLu) * 1000) / 1000;
  const hasTva = lines.some((l) => l.tauxTva != null && l.tauxTva > 0);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 620, width: '96%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, borderBottom: 'none', padding: '16px 20px' }}>
          <div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>Confirmation {voc.de('appro')}</h2>
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
                {([voc.Nom('article'), 'Qté', 'Unité', 'Prix HT/u', hasTva ? 'TVA %' : null, hasTva ? 'Prix TTC/u' : null, 'Total HT', hasTva ? 'Total TTC' : null] as (string | null)[])
                  .filter(Boolean)
                  .map((h) => (
                    <th key={h!} style={{ padding: '7px 10px', fontWeight: 700, textAlign: h === voc.Nom('article') ? 'left' : 'right', color: accent, textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.05em' }}>
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
          {nbPieces !== undefined && (
            <div style={{ fontSize: '0.8rem', color: nbPieces > 0 ? '#1d4ed8' : '#6b7280' }}>
              {nbPieces > 0
                ? `📎 ${nbPieces} fichier${nbPieces > 1 ? 's' : ''} de la facture ${nbPieces > 1 ? 'seront joints' : 'sera joint'}.`
                : '📎 Sans pièce jointe : vous pourrez joindre la facture plus tard, depuis la page Factures.'}
            </div>
          )}
          {/* Timbre fiscal : case et montant (étape F2 : 1, 1,5 ou 2 D, réglés d'après la facture lue) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, color: '#374151', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={timbreFiscal}
                onChange={(e) => setTimbreFiscal(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: accent, cursor: 'pointer' }}
              />
              Timbre Fiscal
              {!timbreFiscal && <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '0.78rem' }}>(désactivé)</span>}
            </label>
            {timbreFiscal && (
              <select value={String(timbre)} onChange={(e) => setTimbre(Number(e.target.value))} aria-label="Montant du timbre fiscal"
                style={{ fontSize: '0.78rem', padding: '2px 6px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}>
                {TIMBRES.map((m) => <option key={m} value={String(m)}>+ {enDinars(m)} DT</option>)}
              </select>
            )}
            {timbreLu != null && <span style={{ color: '#6b7280', fontSize: '0.74rem' }}>lu sur la facture : {timbreLu ? `${enDinars(timbreLu)} DT` : 'aucun'}</span>}
          </div>
          {ttcLu != null && ecart != null && (
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: Math.abs(ecart) <= 0.01 ? '#15803d' : '#b45309' }}>
              {Math.abs(ecart) <= 0.01
                ? `✓ Même total que la facture lue (${enDinars(ttcLu)} DT TTC).`
                : `⚠ La facture lue indique ${enDinars(ttcLu)} DT TTC : écart de ${enDinars(ecart)} DT avec votre saisie. Vérifiez les quantités, les prix et la TVA.`}
            </div>
          )}

          {/* Totals + buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 20, fontSize: '0.88rem', fontWeight: 700, flexWrap: 'wrap' }}>
              <span>Total HT : <span style={{ color: accent }}>{totalHT.toFixed(3)} DT</span></span>
              <span>
                Total TTC : <span style={{ color: accent }}>{totalTTCWithTimbre.toFixed(3)} DT</span>
                {timbreFiscal && <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#6b7280', marginLeft: 4 }}>(dont {enDinars(timbre)} DT timbre)</span>}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
              <button
                onClick={() => onConfirm(timbreFiscal, timbre)}
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
              >
                Confirmer {voc.le('appro', false, 'court')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
