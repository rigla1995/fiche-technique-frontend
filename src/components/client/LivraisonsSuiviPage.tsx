import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { brandHeader, headerRow, dataRowStyle, totalRowStyle, brandFooter, finalize, FMT_DT } from '../../services/excelBrand';
import GuideButton from './GuideButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import Pagination from '../common/Pagination';
import { KpiCard, SortableTable, HBarList, type ColonneDef } from './dashboardV2Widgets';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import { nomOnglet } from '../../vocab/excel';

// Module Livreurs, étape L4 : suivi des livraisons — tous les passages des livreurs (livrées avec la facture signée,
// non livrées), bilan de la période (total, livrées, échecs, délai moyen expédition → livraison, encaissé), par livreur,
// motifs d'échec, filtres communs (HistoryFilterBar) et export Excel à la charte (lignes cochées surlignées en ambre).
const C = '#059669';
const CD = '#064e3b';
const CL = '#ecfdf5';
const CB = '#6ee7b7';
const PAGE_ACCENT = { border: CB, bg: CL, text: CD };
const PAR_PAGE = 15;

interface Ligne {
  id: number;
  le: string;
  livreurId: number | null;
  livreurNom: string;
  commandeId: string;
  commandeStatut: string;
  dateCommande: string;
  dateExpedition: string | null;
  acheteurId: number | null;
  acheteurNom: string;
  acheteurEntreprise: string | null;
  laboNom: string | null;
  factureNumero: string | null;
  montantTtc: number | null;
  resultat: 'livree' | 'echec';
  motif: string | null;
  motifLibelle: string | null;
  note: string | null;
  rapporteeDepot: boolean;
  receptionnaire: string | null;
  montantPercu: number | null;
  modePaiement: string | null;
  delaiJours: number | null;
  factureSignee: boolean;
}
interface Bilan { total: number; livrees: number; echecs: number; tauxEchecPct: number | null; delaiMoyenJours: number | null; encaisse: number }
interface Stats extends Bilan {
  parLivreur: (Bilan & { livreurId: number | null; livreurNom: string })[];
  motifs: { motif: string; libelle: string; nb: number }[];
}
interface LivreurOpt { id: number; nom: string; actif: boolean }
interface AcheteurOpt { id: number; nom: string }

const fmt = (n: number | null | undefined) => (n != null ? `${Number(n).toFixed(3)} DT` : '—');
const fmtDate = (d: string | null | undefined) => { if (!d) return '—'; const [y, m, j] = d.split('-'); return `${j}/${m}/${y}`; };
const fmtHeure = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const today = () => new Date().toISOString().slice(0, 10);
const jours = (n: number | null | undefined) => (n == null ? '—' : `${String(n).replace('.', ',')} j`);
const pct = (n: number | null | undefined) => (n == null ? '—' : `${String(n).replace('.', ',')} %`);

export default function LivraisonsSuiviPage() {
  const voc = useVocabulaire();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [livreurs, setLivreurs] = useState<LivreurOpt[]>([]);
  const [acheteurs, setAcheteurs] = useState<AcheteurOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [livreurId, setLivreurId] = useState('');
  const [resultat, setResultat] = useState('');
  const [acheteurId, setAcheteurId] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Chargement à chaque changement de filtre (la réponse d'un filtre dépassé est ignorée) ; un changement de filtre
  // ramène à la première page via les poignées ci-dessous (pas de setState synchrone dans un effet).
  useEffect(() => {
    let actif = true;
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (livreurId) qs.set('livreurId', livreurId);
    if (resultat) qs.set('resultat', resultat);
    if (acheteurId) qs.set('acheteurId', acheteurId);
    api.get(`/api/livreurs/livraisons?${qs}`)
      .then(({ data }) => {
        if (!actif) return;
        setLignes(data.lignes || []);
        setStats(data.stats || null);
        setSelectedIds(prev => prev.size === 0 ? prev : new Set(Array.from(prev).filter(id => (data.lignes as Ligne[]).some(l => l.id === id))));
        setLoading(false);
      })
      .catch(() => { if (actif) { setError('Erreur de chargement'); setLoading(false); } });
    return () => { actif = false; };
  }, [from, to, livreurId, resultat, acheteurId]);
  const filtrer = useCallback((set: (v: string) => void) => (v: string) => { set(v); setPage(1); }, []);
  useEffect(() => {
    api.get('/api/livreurs').then(({ data }) => setLivreurs((data.livreurs || []) as LivreurOpt[])).catch(() => {});
    api.get('/api/acheteurs').then(({ data }) => setAcheteurs(data.acheteurs || [])).catch(() => {});
  }, []);

  const ouvrirFactureSignee = async (commandeId: string) => {
    try {
      const res = await api.get(`/api/acheteurs/commandes/${commandeId}/livraison/piece`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { setError('Erreur lors de l\'ouverture de la facture signée'); }
  };

  const toggleSelect = (id: number) => setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allSelected = lignes.length > 0 && lignes.every(l => selectedIds.has(l.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set<number>() : new Set(lignes.map(l => l.id)));

  const exportExcel = async () => {
    if (lignes.length === 0 || exporting) return;
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(nomOnglet('Suivi des livraisons'));
      const COLS = 14;
      const periode = from || to ? `Période ${from ? fmtDate(from) : '…'} → ${to ? fmtDate(to) : '…'}` : 'Toutes dates';
      const headerIdx = await brandHeader(wb, ws, {
        titre: 'Suivi des livraisons',
        sousTitre: `Passages des livreurs — livraisons validées (facture signée) et non abouties`,
        meta: `${periode} · ${lignes.length} passage(s) · ${stats ? `${stats.livrees} livrée(s), ${stats.echecs} non livrée(s)` : ''} · exporté le ${new Date().toLocaleDateString('fr-FR')}`,
        colCount: COLS,
      });
      headerRow(ws, headerIdx,
        ['Date et heure', 'Livreur', voc.Nom('acheteur'), 'Entreprise', voc.Court('labo'), 'Facture', 'Montant TTC', 'Résultat', 'Motif', 'Note', `Rapportée ${voc.au('depot')}`, 'Réceptionnaire', 'Encaissé', 'Délai (j)'],
        { widths: [17, 18, 22, 18, 14, 13, 13, 12, 18, 30, 12, 18, 12, 9] });
      lignes.forEach((l, i) => {
        const row = ws.addRow([
          fmtHeure(l.le), l.livreurNom, l.acheteurNom, l.acheteurEntreprise || '', l.laboNom || '',
          l.factureNumero || '', l.montantTtc ?? '', l.resultat === 'livree' ? 'Livrée' : 'Non livrée',
          l.motifLibelle || '', l.note || '', l.resultat === 'echec' ? (l.rapporteeDepot ? 'Oui' : 'Non') : '',
          l.receptionnaire || '', l.montantPercu ?? '', l.delaiJours ?? '',
        ]);
        dataRowStyle(row, { index: i, selected: selectedIds.has(l.id), colCount: COLS });
        row.getCell(7).numFmt = FMT_DT;
        row.getCell(13).numFmt = FMT_DT;
      });
      const lastDataRow = ws.rowCount;
      const totalRow = ws.addRow(['Total — encaissé par les livreurs', '', '', '', '', '', '', '', '', '', '', '', stats?.encaisse ?? 0, '']);
      ws.mergeCells(totalRow.number, 1, totalRow.number, 12);
      totalRowStyle(totalRow, { colCount: COLS });
      totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
      totalRow.getCell(13).numFmt = FMT_DT;
      brandFooter(ws, COLS);
      finalize(ws, { headerRowIdx: headerIdx, colCount: COLS, lastDataRow });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = `suivi_livraisons_${today()}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur lors de l\'export Excel');
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const pageCourante = Math.min(page, totalPages);
  const affiches = lignes.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);

  // SortableTable travaille sur des enregistrements génériques (comme le tableau de bord)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const livCols: ColonneDef<any>[] = [
    { key: 'livreurNom', label: 'Livreur', align: 'left', fmt: (v) => <strong>{String(v)}</strong> },
    { key: 'livrees', label: 'Livrées', fmt: (v) => String(v) },
    { key: 'echecs', label: 'Non livrées', fmt: (v) => <span style={{ color: Number(v) > 0 ? '#9a3412' : undefined, fontWeight: Number(v) > 0 ? 700 : 400 }}>{String(v)}</span> },
    { key: 'tauxEchecPct', label: 'Taux d\'échec', fmt: (v) => pct(v as number | null) },
    { key: 'delaiMoyenJours', label: 'Délai moyen', fmt: (v) => jours(v as number | null) },
    { key: 'encaisse', label: 'Encaissé', fmt: (v) => <strong>{fmt(Number(v))}</strong> },
  ];
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', color: CD, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '9px 12px', verticalAlign: 'top' };

  return (
    <div className="page-content">
      <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 60%, #34d399 100%)`, borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(5,150,105,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📍</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Suivi des livraisons</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: '0.85rem', margin: 0 }}>
            Qui a livré quoi, en combien de temps, ce qui a coincé — tous les passages de vos livreurs, facture signée comprise
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          <Link to="/client/livreurs" style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>🏍️ Livreurs</Link>
          <GuideButton section="livreurs-suivi" />
        </div>
      </div>

      {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}><span>{error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 800 }}>✕</button></div>}

      {/* Bilan de la sélection courante (mêmes filtres que la liste) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard icon="🏍️" label="Passages" value={String(stats?.total ?? 0)} accent={C} sub={stats ? `${stats.livrees} livrée${stats.livrees > 1 ? 's' : ''} · ${stats.echecs} non livrée${stats.echecs > 1 ? 's' : ''}` : undefined} />
        <KpiCard icon="⚠️" label="Taux d'échec" value={pct(stats?.tauxEchecPct)} accent={stats?.tauxEchecPct ? '#ea580c' : '#16a34a'} sub="livraisons non abouties" />
        <KpiCard icon="⏱️" label="Délai moyen" value={jours(stats?.delaiMoyenJours)} accent="#2563eb" sub="expédition → livraison" />
        <KpiCard icon="💰" label="Encaissé par les livreurs" value={fmt(stats?.encaisse ?? 0)} accent="#b45309" sub="montants perçus déclarés" />
      </div>

      <HistoryFilterBar accent={C} accentDark={CD}
        subtitle={`${lignes.length} passage${lignes.length > 1 ? 's' : ''}${selectedIds.size > 0 ? ` · ${selectedIds.size} sélectionné${selectedIds.size > 1 ? 's' : ''} (surbrillance export)` : ''}`}
        onReset={(from || to || livreurId || resultat || acheteurId) ? () => { setFrom(''); setTo(''); setLivreurId(''); setResultat(''); setAcheteurId(''); setPage(1); } : undefined}
        onExportExcel={exportExcel} excelDisabled={exporting || lignes.length === 0} excelLabel="Exporter">
        <FilterField label="📅 Période — du"><FilterInput type="date" value={from} onChange={e => filtrer(setFrom)(e.target.value)} /></FilterField>
        <FilterField label="📅 Période — au"><FilterInput type="date" value={to} onChange={e => filtrer(setTo)(e.target.value)} /></FilterField>
        <FilterField label="🏍️ Livreur">
          <FilterSelect value={livreurId} onChange={e => filtrer(setLivreurId)(e.target.value)}>
            <option value="">— Tous —</option>
            {livreurs.map(l => <option key={l.id} value={l.id}>{l.nom}{l.actif ? '' : ' (désactivé)'}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="✅ Résultat">
          <FilterSelect value={resultat} onChange={e => filtrer(setResultat)(e.target.value)}>
            <option value="">— Tous —</option>
            <option value="livree">Livrées</option>
            <option value="echec">Non livrées</option>
          </FilterSelect>
        </FilterField>
        <FilterField label={`${voc.icon('acheteur')} ${voc.Nom('acheteur')}`}>
          <FilterSelect value={acheteurId} onChange={e => filtrer(setAcheteurId)(e.target.value)}>
            <option value="">— {voc.acc('acheteur', 'Tous', 'Toutes')} —</option>
            {acheteurs.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {stats && stats.total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 14, marginBottom: 16 }}>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: CD, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>🏍️ Par livreur</div>
            <SortableTable rows={stats.parLivreur as unknown as Record<string, unknown>[]} colonnes={livCols} defaultSort="livrees" maxHeight={260} />
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#9a3412', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>⚠️ Motifs des livraisons non abouties</div>
            {stats.motifs.length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '10px 0' }}>Aucun échec sur la sélection.</div>
              : <HBarList rows={stats.motifs} labelKey="libelle" valueKey="nb" color="#ea580c" max={5} fmt={(v) => `${v} échec${v > 1 ? 's' : ''}`} />}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
        ) : lignes.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>📍</div>
            <div style={{ fontWeight: 700, color: '#334155', marginBottom: 6 }}>Aucun passage de livreur</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Les livraisons validées ou déclarées non abouties par vos livreurs depuis leur téléphone apparaîtront ici.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                  <th style={{ width: 34, padding: '10px 6px 10px 14px', textAlign: 'left' }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} title="Tout sélectionner (surbrillance dans l'export Excel)" style={{ accentColor: C, cursor: 'pointer' }} />
                  </th>
                  {['Date', 'Livreur', voc.Nom('acheteur'), 'Facture', 'Résultat', 'Détail', 'Encaissé', 'Délai', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {affiches.map(l => {
                  const isSel = selectedIds.has(l.id);
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: isSel ? '#fffbeb' : undefined }}>
                      <td style={{ padding: '9px 6px 9px 14px' }}>
                        <input type="checkbox" checked={isSel} onChange={() => toggleSelect(l.id)} title="Sélectionner (surbrillance dans l'export Excel)" style={{ accentColor: C, cursor: 'pointer' }} />
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtHeure(l.le)}</td>
                      <td style={{ ...td, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>🏍️ {l.livreurNom}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{l.acheteurNom}</div>
                        {l.acheteurEntreprise && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{l.acheteurEntreprise}</div>}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <div>{l.factureNumero || '—'}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{fmt(l.montantTtc)}{l.commandeStatut === 'annulee' ? ' · annulée' : ''}</div>
                      </td>
                      <td style={td}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', background: l.resultat === 'livree' ? '#dcfce7' : '#ffedd5', color: l.resultat === 'livree' ? '#166534' : '#9a3412' }}>
                          {l.resultat === 'livree' ? '✅ Livrée' : '⚠️ Non livrée'}
                        </span>
                      </td>
                      <td style={{ ...td, maxWidth: 320 }}>
                        {l.resultat === 'livree' ? (
                          <span style={{ color: '#475569' }}>{l.receptionnaire ? `Réceptionnée par ${l.receptionnaire}` : 'Facture signée envoyée'}</span>
                        ) : (
                          <>
                            <div style={{ fontWeight: 700, color: '#9a3412' }}>{l.motifLibelle}{l.rapporteeDepot ? ` · rapportée ${voc.au('depot')}` : ' · non rapportée'}</div>
                            {l.note && <div style={{ fontSize: '0.78rem', color: '#475569', fontStyle: 'italic' }}>« {l.note} »</div>}
                          </>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: l.montantPercu ? 800 : 400, color: l.montantPercu ? '#b45309' : 'var(--text-muted)' }}>
                        {l.montantPercu != null ? `${fmt(l.montantPercu)}${l.modePaiement ? ` (${l.modePaiement})` : ''}` : '—'}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{jours(l.delaiJours)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {l.factureSignee && (
                          <button onClick={() => ouvrirFactureSignee(l.commandeId)} title="Ouvrir la facture signée"
                            style={{ background: '#fff', border: `1px solid ${CB}`, color: CD, borderRadius: 8, padding: '4px 9px', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}>📎</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination total={lignes.length} page={pageCourante} perPage={PAR_PAGE} onChange={setPage} accent={PAGE_ACCENT} />
          </div>
        )}
      </div>
    </div>
  );
}
