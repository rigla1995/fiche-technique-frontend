
export interface TransferLine {
  ingredientId: number;
  nom: string;
  unite: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number | null;
}

export interface TransferActiviteGroup {
  activiteId: number;
  activiteNom: string;
  lines: TransferLine[];
}

interface Props {
  groups: TransferActiviteGroup[];
  date: string;
  refFacture: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TransferConfirmModal({ groups, date, refFacture, onConfirm, onCancel }: Props) {
  const [y, m, d] = date.split('-');
  const dateLabel = `${d}/${m}/${y}`;

  const allLines = groups.flatMap((g) => g.lines);
  const hasTva = allLines.some((l) => l.tauxTva != null && l.tauxTva > 0);
  const grandHT = allLines.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  const grandTTC = allLines.reduce((s, l) => {
    const ht = l.quantite * l.prixUnitaire;
    return s + ht * (1 + (l.tauxTva ?? 0) / 100);
  }, 0);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 680, width: '96%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #3b0764, #7e22cecc)', borderBottom: 'none', padding: '16px 20px' }}>
          <div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>Confirmation de transfert</h2>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem', marginTop: 2 }}>
              Réf: {refFacture} &nbsp;·&nbsp; {dateLabel}
            </div>
          </div>
          <button className="modal-close" onClick={onCancel} style={{ color: '#fff' }}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '16px 20px', maxHeight: '60vh', overflowY: 'auto' }}>
          {groups.map((group) => {
            const groupHT = group.lines.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
            const groupTTC = group.lines.reduce((s, l) => {
              const ht = l.quantite * l.prixUnitaire;
              return s + ht * (1 + (l.tauxTva ?? 0) / 100);
            }, 0);
            return (
              <div key={group.activiteId} style={{ marginBottom: 20 }}>
                <div style={{ background: 'linear-gradient(90deg, #ede9fe, #faf5ff)', borderRadius: 8, padding: '6px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#4c1d95' }}>🏪 {group.activiteNom}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#7c3aed', fontWeight: 700 }}>
                    HT : {groupHT.toFixed(3)} DT
                    {hasTva && <> &nbsp;·&nbsp; TTC : {groupTTC.toFixed(3)} DT</>}
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f5f3ff', borderBottom: '2px solid #c4b5fd' }}>
                      {(['Article', 'Qté', hasTva ? 'Prix HT/u' : 'Prix/u', hasTva ? 'TVA %' : null, hasTva ? 'Prix TTC/u' : null, 'Total HT', hasTva ? 'Total TTC' : null] as (string | null)[])
                        .filter(Boolean)
                        .map((h) => (
                          <th key={h!} style={{ padding: '6px 10px', fontWeight: 700, textAlign: h === 'Article' ? 'left' : 'right', color: '#6d28d9', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((l, i) => {
                      const ht = l.quantite * l.prixUnitaire;
                      const tva = l.tauxTva ?? 0;
                      const ttcUnit = l.prixUnitaire * (1 + tva / 100);
                      const ttcTotal = ht * (1 + tva / 100);
                      return (
                        <tr key={l.ingredientId} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fdfaff' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                            {l.nom}
                            <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{l.unite}</span>
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{l.quantite.toFixed(3)}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>{l.prixUnitaire.toFixed(3)}</td>
                          {hasTva && <td style={{ padding: '6px 10px', textAlign: 'right', color: '#0369a1' }}>{l.tauxTva != null ? `${l.tauxTva}%` : '—'}</td>}
                          {hasTva && <td style={{ padding: '6px 10px', textAlign: 'right' }}>{ttcUnit.toFixed(3)}</td>}
                          <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>{ht.toFixed(3)}</td>
                          {hasTva && <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{ttcTotal.toFixed(3)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        <div style={{ background: '#f5f3ff', borderTop: '1px solid #c4b5fd', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 20, fontSize: '0.88rem', fontWeight: 700 }}>
            <span>Total HT : <span style={{ color: '#6d28d9' }}>{grandHT.toFixed(3)} DT</span></span>
            {hasTva && <span>Total TTC : <span style={{ color: '#059669' }}>{grandTTC.toFixed(3)} DT</span></span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
            <button onClick={onConfirm}
              style={{ background: 'linear-gradient(135deg, #3b0764, #7e22ce)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}>
              Confirmer le transfert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
