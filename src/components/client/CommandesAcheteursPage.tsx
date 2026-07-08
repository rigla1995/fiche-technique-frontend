import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import GuideButton from './GuideButton';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';

interface Commande {
  id: string;
  dateCommande: string;
  statut: 'en_attente' | 'validee' | 'annulee';
  source: 'client' | 'portail';
  acheteurNom: string;
  acheteurEntreprise: string | null;
  laboNom: string | null;
  remisePct: number;
  nbLignes: number;
  totalBrutTtc: number;
  factureId: number | null;
  factureNumero: string | null;
  factureTtc: number | null;
  motifAnnulation: string | null;
  createdByNom: string | null;
}

interface LigneDetail {
  designation: string; mode: 'unite' | 'lot'; quantite: number; tailleLot: number | null;
  quantiteUnites: number; prixTtc: number; tauxTva: number;
}
interface CommandeDetail extends Commande {
  notes: string | null;
  lignes: LigneDetail[];
  facture: { id: number; numero: string; montantBrutTtc: number; montantHt: number; montantTva: number; timbreFiscal: boolean; montantTimbre: number; montantTtc: number } | null;
}

interface AcheteurOpt { id: number; nom: string }

const STATUT_BADGE: Record<Commande['statut'], { label: string; bg: string; color: string }> = {
  en_attente: { label: '⏳ En attente', bg: '#fef3c7', color: '#92400e' },
  validee: { label: '✅ Validée', bg: '#dcfce7', color: '#166534' },
  annulee: { label: '✕ Annulée', bg: '#fee2e2', color: '#991b1b' },
};

const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit' };
const fmt = (n: number | null | undefined) => n != null ? `${Number(n).toFixed(3)} DT` : '—';
const fmtDate = (d: string) => { const [y, m, j] = d.split('-'); return `${j}/${m}/${y}`; };

interface Manquant { nom: string; unite: string; disponible: number; necessaire: number; manquant: number }
interface LaboOpt { id: number; nom: string }

export default function CommandesAcheteursPage() {
  const [searchParams] = useSearchParams();
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [acheteurs, setAcheteurs] = useState<AcheteurOpt[]>([]);
  const [labos, setLabos] = useState<LaboOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [statut, setStatut] = useState(searchParams.get('statut') || '');
  const [acheteurId, setAcheteurId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [detail, setDetail] = useState<CommandeDetail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Validation d'une commande portail : choix du labo source + timbre
  const [validerCmd, setValiderCmd] = useState<Commande | null>(null);
  const [validerLaboId, setValiderLaboId] = useState('');
  const [validerTimbre, setValiderTimbre] = useState(true);
  const [validerErr, setValiderErr] = useState('');
  const [validerManquants, setValiderManquants] = useState<Manquant[]>([]);
  const [validerSaving, setValiderSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (statut) qs.set('statut', statut);
    if (acheteurId) qs.set('acheteurId', acheteurId);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api.get(`/api/acheteurs/commandes?${qs}`)
      .then(({ data }) => setCommandes(data))
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, [statut, acheteurId, from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/api/acheteurs').then(({ data }) => setAcheteurs(data.acheteurs)).catch(() => {});
    api.get('/api/labo').then(({ data }) => {
      setLabos(data);
      if (data.length === 1) setValiderLaboId(String(data[0].id));
    }).catch(() => {});
  }, []);

  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    if (commandes.length === 0 || exporting) return;
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Ventes Acheteurs');
      ws.addRow(['LabFlow — Ventes & commandes acheteurs']).font = { bold: true, size: 14 };
      ws.addRow([`Exporté le ${new Date().toLocaleDateString('fr-FR')}${from || to ? ` · période ${from || '…'} → ${to || '…'}` : ''}`]);
      ws.addRow([]);
      const header = ws.addRow(['Date', 'Acheteur', 'Entreprise', 'Labo', 'Source', 'Statut', 'Lignes', 'Remise %', 'Brut TTC', 'Facture', 'Net TTC facturé', 'Motif annulation']);
      header.font = { bold: true };
      for (const c of commandes) {
        ws.addRow([
          c.dateCommande, c.acheteurNom, c.acheteurEntreprise || '', c.laboNom || '',
          c.source === 'portail' ? 'Portail' : 'Vente directe',
          c.statut === 'validee' ? 'Validée' : c.statut === 'en_attente' ? 'En attente' : 'Annulée',
          c.nbLignes, c.remisePct, c.totalBrutTtc,
          c.factureNumero || '', c.factureTtc ?? '', c.motifAnnulation || '',
        ]);
      }
      ws.columns.forEach((col) => { col.width = 16; });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = `ventes_acheteurs_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur lors de l\'export Excel');
    } finally {
      setExporting(false);
    }
  };

  const valider = async () => {
    if (!validerCmd || !validerLaboId) { setValiderErr('Choisissez le labo source'); return; }
    setValiderSaving(true); setValiderErr(''); setValiderManquants([]);
    try {
      const { data } = await api.post(`/api/acheteurs/commandes/${validerCmd.id}/valider`, {
        laboId: Number(validerLaboId), timbreFiscal: validerTimbre,
      });
      setValiderCmd(null);
      setFlash(`Commande validée — facture ${data.facture.numero} (${fmt(data.facture.montantTtc)})`);
      load();
    } catch (e: unknown) {
      const resp = (e as { response?: { status?: number; data?: { message?: string; manquants?: Manquant[] } } })?.response;
      if (resp?.status === 422 && resp.data?.manquants) {
        setValiderManquants(resp.data.manquants);
        setValiderErr('Stock labo insuffisant :');
      } else {
        setValiderErr(resp?.data?.message ?? 'Erreur lors de la validation');
      }
    } finally {
      setValiderSaving(false);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const { data } = await api.get(`/api/acheteurs/commandes/${id}`);
      setDetail(data);
    } catch { setError('Erreur de chargement du détail'); }
  };

  const ouvrirFacture = async (factureId: number) => {
    try {
      const res = await api.get(`/api/acheteurs/factures/${factureId}/pdf`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { setError('Erreur lors de l\'ouverture de la facture'); }
  };

  const annuler = async (c: Commande) => {
    const msgValidee = `Annuler la vente du ${fmtDate(c.dateCommande)} à ${c.acheteurNom} ?\n\nLe stock sera réintégré et la facture ${c.factureNumero || ''} supprimée.`;
    const msgAttente = `Refuser la commande du ${fmtDate(c.dateCommande)} de ${c.acheteurNom} ?${c.source === 'portail' ? '\n\nL\'acheteur sera prévenu par email.' : ''}`;
    const motif = window.prompt(`${c.statut === 'validee' ? msgValidee : msgAttente}\n\nMotif (optionnel) :`);
    if (motif === null) return;
    setBusyId(c.id); setError('');
    try {
      await api.post(`/api/acheteurs/commandes/${c.id}/annuler`, { motif });
      setFlash('Vente annulée — stock réintégré');
      load();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'annulation');
    } finally { setBusyId(null); }
  };

  const totalPeriode = commandes.filter(c => c.statut === 'validee').reduce((s, c) => s + (c.factureTtc ?? 0), 0);

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #8b5cf6 100%)`, borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(109,40,217,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📦</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Ventes Acheteurs</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Historique des ventes et commandes — factures téléchargeables
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>{fmt(totalPeriode)}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>CA validé (filtre)</div>
          </div>
          <button onClick={exportExcel} disabled={exporting || commandes.length === 0}
            title={commandes.length === 0 ? 'Rien à exporter' : 'Exporter la liste filtrée en Excel'}
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: exporting || commandes.length === 0 ? 'default' : 'pointer', opacity: exporting || commandes.length === 0 ? 0.6 : 1 }}>
            {exporting ? '…' : '📤 Exporter (Excel)'}
          </button>
          <Link to="/client/acheteurs/vente" style={{ background: '#fff', color: CD, borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: '0.85rem', textDecoration: 'none' }}>
            + Nouvelle vente
          </Link>
          <GuideButton section="acheteurs-ventes" />
        </div>
      </div>

      {flash && <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}><span>{flash}</span><button onClick={() => setFlash('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontWeight: 800 }}>✕</button></div>}
      {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}><span>{error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 800 }}>✕</button></div>}

      {/* Filtres */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={statut} onChange={e => setStatut(e.target.value)} style={inp}>
          <option value="">Tous les statuts</option>
          <option value="validee">Validées</option>
          <option value="en_attente">En attente</option>
          <option value="annulee">Annulées</option>
        </select>
        <select value={acheteurId} onChange={e => setAcheteurId(e.target.value)} style={{ ...inp, minWidth: 170 }}>
          <option value="">Tous les acheteurs</option>
          {acheteurs.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} />
        <span style={{ color: '#94a3b8' }}>→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} />
        {(statut || acheteurId || from || to) && (
          <button onClick={() => { setStatut(''); setAcheteurId(''); setFrom(''); setTo(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700, fontSize: '0.8rem' }}>
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* Liste */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
        ) : commandes.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>📦</div>
            <div style={{ fontWeight: 700, color: '#334155', marginBottom: 6 }}>Aucune vente</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Enregistrez votre première vente depuis <Link to="/client/acheteurs/vente" style={{ color: C, fontWeight: 700 }}>Nouvelle Vente</Link>.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                  {['Date', 'Acheteur', 'Labo', 'Lignes', 'Total TTC', 'Statut', 'Facture', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: CD, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commandes.map(c => {
                  const badge = STATUT_BADGE[c.statut];
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: c.statut === 'annulee' ? 0.6 : 1 }}>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtDate(c.dateCommande)}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{c.acheteurNom}</div>
                        {c.acheteurEntreprise && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{c.acheteurEntreprise}</div>}
                      </td>
                      <td style={{ padding: '9px 14px' }}>{c.laboNom || '—'}</td>
                      <td style={{ padding: '9px 14px' }}>{c.nbLignes}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 800, color: CD, whiteSpace: 'nowrap' }}>
                        {fmt(c.factureTtc ?? c.totalBrutTtc)}
                        {c.remisePct > 0 && <div style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 600 }}>remise {c.remisePct}%</div>}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <span title={c.motifAnnulation || undefined} style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>{badge.label}</span>
                        {c.source === 'portail' && (
                          <div style={{ fontSize: '0.68rem', color: C, fontWeight: 700, marginTop: 3 }}>🌐 portail</div>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                        {c.factureId ? (
                          <button onClick={() => ouvrirFacture(c.factureId!)} title="Ouvrir la facture PDF"
                            style={{ background: CL, border: `1px solid ${CB}`, color: CD, borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>
                            📄 {c.factureNumero}
                          </button>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openDetail(c.id)} title="Détail" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px' }}>👁️</button>
                        {c.statut === 'en_attente' && (
                          <button onClick={() => { setValiderCmd(c); setValiderErr(''); setValiderManquants([]); setValiderTimbre(true); }}
                            title="Valider (choisir le labo, déduire le stock, facturer)"
                            style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', marginRight: 4 }}>
                            ✅ Valider
                          </button>
                        )}
                        {(c.statut === 'validee' || c.statut === 'en_attente') && (
                          <button onClick={() => annuler(c)} disabled={busyId === c.id}
                            title={c.statut === 'validee' ? 'Annuler (réintègre le stock)' : 'Refuser la commande'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: '4px 6px' }}>
                            {busyId === c.id ? '…' : '↩️'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal validation commande portail */}
      {validerCmd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: CD }}>✅ Valider la commande</h2>
              <button onClick={() => setValiderCmd(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#475569', marginBottom: 16 }}>
              {validerCmd.acheteurNom} · {fmtDate(validerCmd.dateCommande)} · {validerCmd.nbLignes} ligne{validerCmd.nbLignes > 1 ? 's' : ''} · {fmt(validerCmd.totalBrutTtc)} brut
              {validerCmd.remisePct > 0 ? ` · remise ${validerCmd.remisePct}%` : ''}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 5 }}>Labo source (stock déduit) *</label>
              <select value={validerLaboId} onChange={e => setValiderLaboId(e.target.value)} style={{ ...inp, width: '100%', boxSizing: 'border-box' }}>
                <option value="">— Choisir —</option>
                {labos.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', fontWeight: 600, color: validerTimbre ? CD : '#64748b', cursor: 'pointer', marginBottom: 14 }}>
              <input type="checkbox" checked={validerTimbre} onChange={e => setValiderTimbre(e.target.checked)} style={{ accentColor: C }} />
              Timbre fiscal (1.000 DT)
            </label>
            {validerErr && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', fontWeight: 600 }}>
                ⚠️ {validerErr}
                {validerManquants.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {validerManquants.map((m, i) => (
                      <li key={i}>{m.nom} : dispo {m.disponible}, nécessaire {m.necessaire} (manque {m.manquant})</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setValiderCmd(null)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Fermer</button>
              <button onClick={valider} disabled={validerSaving || !validerLaboId}
                style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: validerLaboId ? 'linear-gradient(135deg,#166534,#16a34a)' : '#cbd5e1', color: '#fff', cursor: validerSaving ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                {validerSaving ? 'Validation…' : '✅ Valider et facturer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal détail */}
      {detail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: CD }}>
                Vente du {fmtDate(detail.dateCommande)} — {detail.acheteurNom}
              </h2>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              {detail.laboNom ? `Labo : ${detail.laboNom} · ` : ''}{STATUT_BADGE[detail.statut].label}
              {detail.motifAnnulation ? ` · Motif : ${detail.motifAnnulation}` : ''}
              {detail.notes ? ` · ${detail.notes}` : ''}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: 14 }}>
              <thead>
                <tr style={{ background: CL }}>
                  {['Désignation', 'Qté', 'Prix TTC', 'TVA', 'Total'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Désignation' ? 'left' : 'right', padding: '7px 10px', color: CD, fontSize: '0.72rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.lignes.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{l.designation}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                      {l.mode === 'lot' ? `${l.quantite} lot${l.quantite > 1 ? 's' : ''} (×${l.tailleLot})` : l.quantite}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(l.prixTtc)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{l.tauxTva} %</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{fmt(l.prixTtc * l.quantite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.facture && (
              <div style={{ background: CL, borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.82rem', color: CD }}>
                <strong>{detail.facture.numero}</strong>
                <span>HT {fmt(detail.facture.montantHt)}</span>
                <span>TVA {fmt(detail.facture.montantTva)}</span>
                {detail.facture.timbreFiscal && <span>Timbre {fmt(detail.facture.montantTimbre)}</span>}
                <strong style={{ marginLeft: 'auto' }}>TTC {fmt(detail.facture.montantTtc)}</strong>
                <button onClick={() => ouvrirFacture(detail.facture!.id)}
                  style={{ background: CD, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                  📄 PDF
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
