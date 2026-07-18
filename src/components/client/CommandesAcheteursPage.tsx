import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { brandHeader, headerRow, dataRowStyle, totalRowStyle, brandFooter, finalize, FMT_DT } from '../../services/excelBrand';
import GuideButton from './GuideButton';
import CommandeStepper from '../common/CommandeStepper';
import { useConfirm } from '../common/ConfirmDialog';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';

type Statut = 'en_attente' | 'expediee' | 'livree' | 'annulee';

interface Commande {
  id: string;
  dateCommande: string;
  dateExpedition: string | null;
  dateLivraison: string | null;
  statut: Statut;
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
  id: number; designation: string; quantite: number; quantiteUnites: number;
  prixHt: number; prixTtc: number; tauxTva: number;
}
interface HistoEtat { statut: Statut; dateEffet: string | null; motif: string | null; parNom: string | null; le: string }
interface CommandeDetail extends Commande {
  notes: string | null;
  lignes: LigneDetail[];
  historique: HistoEtat[];
  facture: { id: number; numero: string; montantBrutTtc: number; montantHt: number; montantTva: number; timbreFiscal: boolean; montantTimbre: number; montantTtc: number } | null;
}

interface AcheteurOpt { id: number; nom: string }

const STATUT_BADGE: Record<Statut, { label: string; bg: string; color: string }> = {
  en_attente: { label: '⏳ En attente', bg: '#fef3c7', color: '#92400e' },
  expediee: { label: '🚚 Expédiée', bg: '#dbeafe', color: '#1d4ed8' },
  livree: { label: '✅ Livrée', bg: '#dcfce7', color: '#166534' },
  annulee: { label: '✕ Annulée', bg: '#fee2e2', color: '#991b1b' },
};
// Fallback : un statut inattendu (ex. skew de déploiement) ne doit pas casser la page
const badgeOf = (s: string) => STATUT_BADGE[s as Statut] || { label: s, bg: '#f1f5f9', color: '#475569' };

const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit' };
const fmt = (n: number | null | undefined) => n != null ? `${Number(n).toFixed(3)} DT` : '—';
const fmtDate = (d: string | null | undefined) => { if (!d) return '—'; const [y, m, j] = d.split('-'); return `${j}/${m}/${y}`; };
const today = () => new Date().toISOString().slice(0, 10);

interface Manquant { nom: string; unite: string; disponible: number; necessaire: number; manquant: number }
interface LaboOpt { id: number; nom: string }

export default function CommandesAcheteursPage() {
  const { prompt } = useConfirm();
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

  // Expédition d'une commande en attente : labo + quantités ajustables (une
  // ligne peut être retirée : quantité 0 envoyée au serveur) + remise + timbre + date
  const [expCmd, setExpCmd] = useState<Commande | null>(null);
  const [expLignes, setExpLignes] = useState<{ id: number; designation: string; quantite: string; prixTtc: number; retiree: boolean }[]>([]);
  const [expLignesLoading, setExpLignesLoading] = useState(false);
  const [expLaboId, setExpLaboId] = useState('');
  const [expTimbre, setExpTimbre] = useState(true);
  const [expRemise, setExpRemise] = useState('0');
  const [expDate, setExpDate] = useState(today());
  const [expErr, setExpErr] = useState('');
  const [expManquants, setExpManquants] = useState<Manquant[]>([]);
  const [expSaving, setExpSaving] = useState(false);

  // Livraison d'une commande expédiée
  const [livCmd, setLivCmd] = useState<Commande | null>(null);
  const [livDate, setLivDate] = useState(today());
  const [livErr, setLivErr] = useState('');
  const [livSaving, setLivSaving] = useState(false);

  // Sélection de lignes — purement visuelle : l'export contient TOUTES les lignes
  // filtrées, les lignes cochées sont simplement surlignées (ambre) dans le fichier.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (statut) qs.set('statut', statut);
    if (acheteurId) qs.set('acheteurId', acheteurId);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api.get(`/api/acheteurs/commandes?${qs}`)
      .then(({ data }) => {
        setCommandes(data);
        // La sélection (surbrillance export) ne conserve que des lignes encore listées
        setSelectedIds(prev => prev.size === 0 ? prev
          : new Set(Array.from(prev).filter(id => (data as Commande[]).some(c => c.id === id))));
      })
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, [statut, acheteurId, from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/api/acheteurs').then(({ data }) => setAcheteurs(data.acheteurs)).catch(() => {});
    api.get('/api/labo').then(({ data }) => {
      setLabos(data);
      if (data.length === 1) setExpLaboId(String(data[0].id));
    }).catch(() => {});
  }, []);

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = commandes.length > 0 && commandes.every(c => selectedIds.has(c.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set<string>() : new Set(commandes.map(c => c.id)));

  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    if (commandes.length === 0 || exporting) return;
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Ventes Acheteurs');
      const COLS = 14;
      const periode = from || to ? `Période ${from ? fmtDate(from) : '…'} → ${to ? fmtDate(to) : '…'}` : 'Toutes dates';
      const headerIdx = await brandHeader(wb, ws, {
        titre: 'Ventes & commandes acheteurs',
        sousTitre: 'Suivi des commandes — expéditions, livraisons et facturation',
        meta: `${periode} · ${commandes.length} ligne(s) · exporté le ${new Date().toLocaleDateString('fr-FR')}`,
        colCount: COLS,
      });
      headerRow(ws, headerIdx,
        ['Date', 'Acheteur', 'Entreprise', 'Labo', 'Source', 'Statut', 'Expédiée le', 'Livrée le', 'Lignes', 'Remise %', 'Brut TTC', 'Facture', 'Net TTC facturé', 'Motif annulation'],
        { widths: [12, 22, 18, 15, 13, 12, 12, 12, 8, 10, 14, 13, 15, 24] });
      commandes.forEach((c, i) => {
        const row = ws.addRow([
          fmtDate(c.dateCommande), c.acheteurNom, c.acheteurEntreprise || '', c.laboNom || '',
          c.source === 'portail' ? 'Portail' : 'Vente directe',
          badgeOf(c.statut).label.replace(/^\S+\s/, ''),
          c.dateExpedition ? fmtDate(c.dateExpedition) : '', c.dateLivraison ? fmtDate(c.dateLivraison) : '',
          c.nbLignes, c.remisePct, c.totalBrutTtc,
          c.factureNumero || '', c.factureTtc ?? '', c.motifAnnulation || '',
        ]);
        dataRowStyle(row, { index: i, selected: selectedIds.has(c.id), colCount: COLS });
        row.getCell(11).numFmt = FMT_DT;
        row.getCell(13).numFmt = FMT_DT;
      });
      const lastDataRow = ws.rowCount;
      const totalRow = ws.addRow(['Total — CA TTC facturé (expédiées/livrées)', '', '', '', '', '', '', '', '', '', '', '', totalPeriode, '']);
      ws.mergeCells(totalRow.number, 1, totalRow.number, 12);
      totalRowStyle(totalRow, { colCount: COLS });
      totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
      totalRow.getCell(13).numFmt = FMT_DT;
      brandFooter(ws, COLS);
      finalize(ws, { headerRowIdx: headerIdx, colCount: COLS, lastDataRow });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = `ventes_acheteurs_${today()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur lors de l\'export Excel');
    } finally {
      setExporting(false);
    }
  };

  const expReqSeq = useRef(0);
  const openExpedier = async (c: Commande) => {
    setExpCmd(c); setExpErr(''); setExpManquants([]); setExpTimbre(true);
    setExpRemise(String(c.remisePct || 0)); setExpDate(today());
    // Labo réinitialisé à chaque ouverture (pas d'héritage silencieux de l'expédition précédente)
    setExpLaboId(labos.length === 1 ? String(labos[0].id) : '');
    setExpLignes([]); setExpLignesLoading(true);
    const seq = ++expReqSeq.current;
    try {
      const { data } = await api.get(`/api/acheteurs/commandes/${c.id}`);
      if (seq !== expReqSeq.current) return; // une autre commande a été ouverte entre-temps
      setExpLignes((data.lignes as LigneDetail[]).map(l => ({ id: l.id, designation: l.designation, quantite: String(l.quantite), prixTtc: l.prixTtc, retiree: false })));
    } catch { if (seq === expReqSeq.current) setExpErr('Erreur de chargement des lignes — fermez et rouvrez la commande'); }
    finally { if (seq === expReqSeq.current) setExpLignesLoading(false); }
  };

  const expedier = async () => {
    if (!expCmd || !expLaboId) { setExpErr('Choisissez le labo source'); return; }
    const remise = expRemise === '' ? 0 : Number(String(expRemise).replace(',', '.'));
    if (!Number.isFinite(remise) || remise < 0 || remise > 100) { setExpErr('Remise invalide (0 à 100)'); return; }
    if (expLignes.length === 0) { setExpErr('Lignes non chargées — fermez et rouvrez la commande'); return; }
    if (expLignes.every(l => l.retiree)) { setExpErr('Toutes les lignes sont retirées — refusez plutôt la commande (↩️)'); return; }
    const quantites: { ligneId: number; quantite: number }[] = [];
    for (const l of expLignes) {
      if (l.retiree) { quantites.push({ ligneId: l.id, quantite: 0 }); continue; }
      const q = Number(String(l.quantite).replace(',', '.'));
      if (!Number.isFinite(q) || Math.round(q * 1000) / 1000 <= 0) { setExpErr(`Quantité invalide pour « ${l.designation} »`); return; }
      quantites.push({ ligneId: l.id, quantite: q });
    }
    setExpSaving(true); setExpErr(''); setExpManquants([]);
    try {
      const { data } = await api.post(`/api/acheteurs/commandes/${expCmd.id}/expedier`, {
        laboId: Number(expLaboId), timbreFiscal: expTimbre, remisePct: remise,
        dateExpedition: expDate, quantites,
      });
      setExpCmd(null);
      setFlash(`Commande expédiée — facture ${data.facture.numero} (${fmt(data.facture.montantTtc)})`);
      load();
    } catch (e: unknown) {
      const resp = (e as { response?: { status?: number; data?: { message?: string; manquants?: Manquant[] } } })?.response;
      if (resp?.status === 422 && resp.data?.manquants) {
        setExpManquants(resp.data.manquants);
        setExpErr('Stock labo insuffisant :');
      } else {
        setExpErr(resp?.data?.message ?? 'Erreur lors de l\'expédition');
      }
    } finally {
      setExpSaving(false);
    }
  };

  const livrer = async () => {
    if (!livCmd) return;
    setLivSaving(true); setLivErr('');
    try {
      await api.post(`/api/acheteurs/commandes/${livCmd.id}/livrer`, { dateLivraison: livDate });
      setLivCmd(null);
      setFlash('Commande livrée');
      load();
    } catch (e: unknown) {
      setLivErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de la livraison');
    } finally {
      setLivSaving(false);
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
    const enAttente = c.statut === 'en_attente';
    const motif = await prompt({
      title: enAttente ? 'Refuser la commande ?' : 'Annuler la commande ?',
      message: enAttente
        ? `Commande du ${fmtDate(c.dateCommande)} de ${c.acheteurNom}.${c.source === 'portail' ? '\n\nL\'acheteur sera prévenu par email.' : ''}`
        : `Commande du ${fmtDate(c.dateCommande)} à ${c.acheteurNom}.\n\nLe stock sera réintégré et la facture ${c.factureNumero || ''} supprimée.`,
      inputLabel: 'Motif (optionnel)',
      multiline: true,
      tone: 'danger',
      icon: '↩️',
      confirmLabel: enAttente ? 'Refuser la commande' : 'Annuler la commande',
      cancelLabel: 'Retour',
    });
    if (motif === null) return;
    setBusyId(c.id); setError('');
    try {
      const { data } = await api.post(`/api/acheteurs/commandes/${c.id}/annuler`, { motif });
      setFlash(data.message || 'Commande annulée');
      load();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'annulation');
    } finally { setBusyId(null); }
  };

  const totalPeriode = commandes.filter(c => c.statut === 'expediee' || c.statut === 'livree').reduce((s, c) => s + (c.factureTtc ?? 0), 0);

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
            En attente → expédiée (stock déduit + facture) → livrée — historique complet par commande
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>{fmt(totalPeriode)}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>CA facturé (filtre)</div>
          </div>
          {selectedIds.size > 0 && (
            <span title="Lignes surlignées dans l'export Excel" style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fde68a' }}>
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
          )}
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
          <option value="en_attente">En attente</option>
          <option value="expediee">Expédiées</option>
          <option value="livree">Livrées</option>
          <option value="annulee">Annulées</option>
        </select>
        <select value={acheteurId} onChange={e => setAcheteurId(e.target.value)} style={{ ...inp, minWidth: 170 }}>
          <option value="">Tous les acheteurs</option>
          {acheteurs.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
          <option value="supprimes">🗑️ Acheteurs supprimés</option>
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
                  <th style={{ width: 34, padding: '10px 6px 10px 14px', textAlign: 'left' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      title="Tout sélectionner (surbrillance dans l'export Excel)"
                      style={{ accentColor: C, cursor: 'pointer' }} />
                  </th>
                  {['Date', 'Acheteur', 'Labo', 'Lignes', 'Total TTC', 'Statut', 'Facture', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: CD, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commandes.map(c => {
                  const badge = badgeOf(c.statut);
                  const isSel = selectedIds.has(c.id);
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: c.statut === 'annulee' ? 0.6 : 1, background: isSel ? '#fffbeb' : undefined }}>
                      <td style={{ padding: '9px 6px 9px 14px' }}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelect(c.id)}
                          title="Sélectionner (surbrillance dans l'export Excel)"
                          style={{ accentColor: C, cursor: 'pointer' }} />
                      </td>
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
                        {c.statut === 'expediee' && c.dateExpedition && (
                          <div style={{ fontSize: '0.68rem', color: '#1d4ed8', fontWeight: 600, marginTop: 3 }}>le {fmtDate(c.dateExpedition)}</div>
                        )}
                        {c.statut === 'livree' && c.dateLivraison && (
                          <div style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 600, marginTop: 3 }}>le {fmtDate(c.dateLivraison)}</div>
                        )}
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
                          <button onClick={() => openExpedier(c)}
                            title="Expédier (ajuster les quantités, déduire le stock, facturer)"
                            style={{ background: '#dbeafe', border: '1px solid #93c5fd', color: '#1d4ed8', borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', marginRight: 4 }}>
                            🚚 Expédier
                          </button>
                        )}
                        {c.statut === 'expediee' && (
                          <button onClick={() => { setLivCmd(c); setLivErr(''); setLivDate(today()); }}
                            title="Marquer comme livrée"
                            style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', marginRight: 4 }}>
                            ✅ Livrer
                          </button>
                        )}
                        {c.statut !== 'annulee' && (
                          <button onClick={() => annuler(c)} disabled={busyId === c.id}
                            title={c.statut === 'en_attente' ? 'Refuser la commande' : 'Annuler (réintègre le stock)'}
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

      {/* Modal expédition (commande en attente) */}
      {expCmd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: CD }}>🚚 Expédier la commande</h2>
              <button onClick={() => setExpCmd(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#475569', marginBottom: 14 }}>
              {expCmd.acheteurNom} · commandée le {fmtDate(expCmd.dateCommande)} — le stock est déduit et la facture générée à l'expédition.
            </div>

            {/* Quantités ajustables + retrait de lignes */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 6 }}>Lignes — ajustez les quantités ou retirez ce qui ne part pas</div>
              {expLignesLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Chargement…</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: CL }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: CD, fontSize: '0.7rem' }}>Article</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', color: CD, fontSize: '0.7rem' }}>Qté expédiée</th>
                      <th style={{ textAlign: 'right', padding: '6px 10px', color: CD, fontSize: '0.7rem' }}>PU TTC</th>
                      <th style={{ width: 34 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {expLignes.map((l, i) => {
                      const derniere = !l.retiree && expLignes.filter(x => !x.retiree).length === 1;
                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: l.retiree ? 0.55 : 1 }}>
                          <td style={{ padding: '6px 10px', fontWeight: 600, textDecoration: l.retiree ? 'line-through' : 'none', color: l.retiree ? '#94a3b8' : undefined }}>{l.designation}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                            {l.retiree ? (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b91c1c' }}>retirée</span>
                            ) : (
                              <input value={l.quantite}
                                onChange={e => setExpLignes(prev => prev.map((x, xi) => xi === i ? { ...x, quantite: e.target.value } : x))}
                                style={{ ...inp, width: 76, textAlign: 'right', padding: '5px 8px' }} />
                            )}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', textDecoration: l.retiree ? 'line-through' : 'none', color: l.retiree ? '#94a3b8' : undefined }}>{fmt(l.prixTtc)}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                            {l.retiree ? (
                              <button onClick={() => setExpLignes(prev => prev.map((x, xi) => xi === i ? { ...x, retiree: false } : x))}
                                title="Rétablir la ligne"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: CD }}>↩️</button>
                            ) : (
                              <button onClick={() => setExpLignes(prev => prev.map((x, xi) => xi === i ? { ...x, retiree: true } : x))}
                                disabled={derniere}
                                title={derniere ? 'Impossible de retirer la dernière ligne — refusez plutôt la commande' : 'Retirer cette ligne de la commande'}
                                style={{ background: 'none', border: 'none', cursor: derniere ? 'default' : 'pointer', fontSize: '0.9rem', color: derniere ? '#e2e8f0' : '#ef4444', fontWeight: 800 }}>✕</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 5 }}>Labo source (stock déduit) *</label>
                <select value={expLaboId} onChange={e => setExpLaboId(e.target.value)} style={{ ...inp, width: '100%', boxSizing: 'border-box' }}>
                  <option value="">— Choisir —</option>
                  {labos.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 5 }}>Date d'expédition</label>
                <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)}
                  min={expCmd.dateCommande} max={today()} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 5 }}>Remise % (cette commande)</label>
                <input value={expRemise} onChange={e => setExpRemise(e.target.value)} placeholder="0"
                  style={{ ...inp, width: 80, textAlign: 'right' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', fontWeight: 600, color: expTimbre ? CD : '#64748b', cursor: 'pointer', marginTop: 16 }}>
                <input type="checkbox" checked={expTimbre} onChange={e => setExpTimbre(e.target.checked)} style={{ accentColor: C }} />
                Timbre fiscal (1.000 DT)
              </label>
            </div>
            {expErr && (
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', fontWeight: 600 }}>
                ⚠️ {expErr}
                {expManquants.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {expManquants.map((m, i) => (
                      <li key={i}>{m.nom} : dispo {m.disponible}, nécessaire {m.necessaire} (manque {m.manquant})</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setExpCmd(null)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Fermer</button>
              <button onClick={expedier} disabled={expSaving || !expLaboId || expLignesLoading || expLignes.length === 0}
                style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: expLaboId ? 'linear-gradient(135deg,#1e40af,#3b82f6)' : '#cbd5e1', color: '#fff', cursor: expSaving ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                {expSaving ? 'Expédition…' : '🚚 Expédier et facturer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal livraison (commande expédiée) */}
      {livCmd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: CD }}>✅ Marquer comme livrée</h2>
              <button onClick={() => setLivCmd(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#475569', marginBottom: 14 }}>
              {livCmd.acheteurNom} · expédiée le {fmtDate(livCmd.dateExpedition)}{livCmd.factureNumero ? ` · ${livCmd.factureNumero}` : ''}
            </div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 5 }}>Date de livraison</label>
            <input type="date" value={livDate} onChange={e => setLivDate(e.target.value)}
              min={livCmd.dateExpedition || undefined} style={{ ...inp, marginBottom: 14 }} />
            {livErr && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', fontWeight: 600 }}>⚠️ {livErr}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setLivCmd(null)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Fermer</button>
              <button onClick={livrer} disabled={livSaving}
                style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#166534,#16a34a)', color: '#fff', cursor: livSaving ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                {livSaving ? '…' : '✅ Confirmer la livraison'}
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
                Commande du {fmtDate(detail.dateCommande)} — {detail.acheteurNom}
              </h2>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              {detail.laboNom ? `Labo : ${detail.laboNom} · ` : ''}{badgeOf(detail.statut).label}
              {detail.dateExpedition ? ` · Expédiée le ${fmtDate(detail.dateExpedition)}` : ''}
              {detail.dateLivraison ? ` · Livrée le ${fmtDate(detail.dateLivraison)}` : ''}
              {detail.motifAnnulation ? ` · Motif : ${detail.motifAnnulation}` : ''}
              {detail.notes ? ` · ${detail.notes}` : ''}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: 14 }}>
              <thead>
                <tr style={{ background: CL }}>
                  {['Désignation', 'Qté', 'PU HT', 'TVA', 'Total HT'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Désignation' ? 'left' : 'right', padding: '7px 10px', color: CD, fontSize: '0.72rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.lignes.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 600 }}>{l.designation}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{l.quantite}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmt(l.prixHt)}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right' }}>{l.tauxTva} %</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{fmt(l.prixHt * l.quantite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.facture && (
              <div style={{ background: CL, borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.82rem', color: CD, marginBottom: 14 }}>
                <strong>{detail.facture.numero}</strong>
                {detail.remisePct > 0 && <span style={{ color: '#b91c1c' }}>Remise {detail.remisePct}%</span>}
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
            {/* Suivi de la commande — stepper d'états */}
            <div style={{ background: '#fbfaff', border: '1px solid #ede9fe', borderRadius: 12, padding: '16px 12px 14px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: CD, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Suivi de la commande</div>
              <CommandeStepper statut={detail.statut} historique={detail.historique || []} dateCommande={detail.dateCommande} showAuteur />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
