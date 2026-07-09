import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import PortailShell from './PortailShell';

// Portail acheteur — suivi des commandes + factures.
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';

interface Commande {
  id: string;
  dateCommande: string;
  statut: 'en_attente' | 'validee' | 'annulee';
  remisePct: number;
  motifAnnulation: string | null;
  nbLignes: number;
  totalBrutTtc: number;
  factureId: number | null;
  factureNumero: string | null;
  factureTtc: number | null;
}
interface Detail extends Commande {
  notes: string | null;
  lignes: { designation: string; quantite: number; prixTtc: number }[];
}

const BADGE: Record<Commande['statut'], { label: string; bg: string; color: string }> = {
  en_attente: { label: '⏳ En attente', bg: '#fef3c7', color: '#92400e' },
  validee: { label: '✅ Validée', bg: '#dcfce7', color: '#166534' },
  annulee: { label: '✕ Annulée', bg: '#fee2e2', color: '#991b1b' },
};
const fmt = (n: number | null | undefined) => n != null ? `${Number(n).toFixed(3)} DT` : '—';
const fmtDate = (d: string) => { const [y, m, j] = d.split('-'); return `${j}/${m}/${y}`; };

export default function PortailCommandesPage() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    api.get('/api/portail/commandes')
      .then(({ data }) => setCommandes(data))
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (id: string) => {
    try {
      const { data } = await api.get(`/api/portail/commandes/${id}`);
      setDetail(data);
    } catch { setError('Erreur de chargement du détail'); }
  };

  const ouvrirFacture = async (factureId: number) => {
    try {
      const res = await api.get(`/api/portail/factures/${factureId}/pdf`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { setError('Erreur lors de l\'ouverture de la facture'); }
  };

  return (
    <PortailShell>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>Mes commandes</h1>
        <p style={{ color: '#64748b', fontSize: '0.86rem', margin: 0 }}>Suivi de vos commandes et téléchargement de vos factures.</p>
      </div>
      {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Chargement…</div>
      ) : commandes.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>📦</div>
          <div style={{ fontWeight: 800, color: '#334155', marginBottom: 6 }}>Aucune commande</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Passez votre première commande depuis le <Link to="/portail" style={{ color: C, fontWeight: 700 }}>catalogue</Link>.
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                  {['Date', 'Articles', 'Montant', 'Statut', 'Facture', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '10px 14px', color: CD, fontSize: '0.74rem', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commandes.map(c => {
                  const b = BADGE[c.statut];
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: c.statut === 'annulee' ? 0.6 : 1 }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtDate(c.dateCommande)}</td>
                      <td style={{ padding: '10px 14px' }}>{c.nbLignes} ligne{c.nbLignes > 1 ? 's' : ''}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: CD, whiteSpace: 'nowrap' }}>
                        {c.factureTtc != null ? fmt(c.factureTtc) : `≈ ${fmt(c.totalBrutTtc)}`}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span title={c.motifAnnulation || undefined} style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>{b.label}</span>
                        {c.statut === 'annulee' && c.motifAnnulation && (
                          <div style={{ fontSize: '0.7rem', color: '#991b1b', marginTop: 3 }}>{c.motifAnnulation}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {c.factureId ? (
                          <button onClick={() => ouvrirFacture(c.factureId!)}
                            style={{ background: CL, border: `1px solid ${CB}`, color: CD, borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>
                            📄 {c.factureNumero}
                          </button>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button onClick={() => openDetail(c.id)} title="Détail" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>👁️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: CD }}>Commande du {fmtDate(detail.dateCommande)}</h2>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 12 }}>
              {BADGE[detail.statut].label}{detail.notes ? ` · ${detail.notes}` : ''}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <tbody>
                {detail.lignes.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 4px', fontWeight: 600 }}>{l.designation}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', color: '#64748b' }}>{l.quantite}</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(l.prixTtc * l.quantite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.factureId && (
              <button onClick={() => ouvrirFacture(detail.factureId!)}
                style={{ marginTop: 14, background: CD, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                📄 Ouvrir la facture {detail.factureNumero}
              </button>
            )}
          </div>
        </div>
      )}
    </PortailShell>
  );
}
