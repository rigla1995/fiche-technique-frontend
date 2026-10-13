// Factures fournisseur, étape F3 (labflow-reprise/achats-compta/PLAN-FACTURES.md §2) : la page « Correspondances »
// (menu Fournisseurs). Ce que LabFlow a appris des factures validées, par fournisseur : telle ligne de facture (sa
// référence produit, sinon sa désignation) → tel article et sa conversion, ou « hors stock ». Corriger une
// correspondance change ce que la prochaine facture proposera ; l'oublier la fait redemander. Les factures déjà
// validées ne changent pas. Le gérant voit les fournisseurs de ses activités et labos.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import Pagination from '../common/Pagination';
import GuideButton from './GuideButton';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../common/ConfirmDialog';
import { messageErreur } from './factures/pieces';
import { NATURES, probablesPour } from './factures/lecture/correspondre';
import ChoixArticle from './factures/ChoixArticle';
import { telechargerClasseur } from '../../compta/classeurs';

interface Correspondance {
  id: number; fournisseurId: number; fournisseurNom: string; cle: string; designation: string; reference: string | null;
  uniteFacture: string | null; articleId: number | null; articleNom: string | null; uniteStock: string | null;
  horsStock: string | null; conversion: number; emplois: number; derniereFois: string; auteurNom?: string | null;
}
interface Article { id: number; name: string; unitName?: string }

const PAR_PAGE = 20;
const ACCENT = '#c2410c';
const fNb = (n: number) => String(Math.round(n * 1e6) / 1e6).replace('.', ',');
const fDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');
const nombre = (s: string) => { const v = Number(s.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

export default function CorrespondancesPage() {
  const voc = useVocabulaire();
  const { canWrite } = useAuth();
  const { confirm, alerte } = useConfirm();
  const [liste, setListe] = useState<Correspondance[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [fournisseur, setFournisseur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [edition, setEdition] = useState<{ id: number; choix: string; conversion: string; envoi: boolean } | null>(null);
  // Toutes les correspondances (du périmètre du gérant) dans un classeur à la charte des modèles — les filtres ne s'y
  // appliquent pas.
  const [exportEnCours, setExportEnCours] = useState(false);
  const exporter = async () => {
    setExportEnCours(true);
    try {
      await telechargerClasseur('/api/correspondances/export', `correspondances_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      await alerte({ title: 'Export impossible', message: 'Le fichier n\'a pas pu être préparé : réessayez.', tone: 'danger' });
    } finally {
      setExportEnCours(false);
    }
  };

  useEffect(() => {
    let vivant = true;
    api.get('/api/correspondances')
      .then(({ data }) => { if (vivant) setListe(data as Correspondance[]); })
      .catch((e) => { if (vivant) { setListe([]); setErreur(messageErreur(e, 'Correspondances indisponibles : rechargez la page.')); } });
    api.get('/api/articles').then(({ data }) => { if (vivant) setArticles(data as Article[]); }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  const fournisseurs = useMemo(() => [...new Map((liste ?? []).map((c) => [c.fournisseurId, c.fournisseurNom])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])), [liste]);
  const plat = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filtrees = (liste ?? []).filter((c) => (!fournisseur || String(c.fournisseurId) === fournisseur)
    && (!recherche.trim() || plat(`${c.designation} ${c.reference ?? ''} ${c.articleNom ?? ''}`).includes(plat(recherche.trim()))));
  const pagees = filtrees.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);
  const unite = (id: number) => articles.find((a) => a.id === id)?.unitName ?? '';
  // Choix d'un autre article : champ de recherche, suggestions = les plus proches de la désignation.
  const articlesConnus = useMemo(() => articles.map((a) => ({ id: a.id, nom: a.name, unite: a.unitName ?? '' })), [articles]);
  const classer = useMemo(() => probablesPour({ correspondances: [], achats: [], articles: articlesConnus }), [articlesConnus]);
  const libellesChoix = {
    unArticle: voc.un('article'), aucunArticle: `${voc.Aucun('article')} ${voc.acc('article', 'trouvé', 'trouvée')}`,
    horsStock: `Hors ${voc.nom('stock')}`, groupeHorsStock: `Hors ${voc.nom('stock')}`, aChoisir: '— À choisir —',
  };

  const enregistrer = async () => {
    if (!edition) return;
    // Rappel avant d'enregistrer : la correction ne touche que les prochaines factures (demande du client, 12/10).
    const c = (liste ?? []).find((x) => x.id === edition.id);
    const ok = await confirm({
      title: 'Corriger cette correspondance ?',
      message: `La correction vaut pour les prochaines factures${c ? ` de ${c.fournisseurNom}` : ''}. Les factures déjà validées ne changent pas : ni leur ${voc.nom('stock')}, ni la facture, ni l'historique. Pour en refaire une, supprimez-la dans Factures, puis déposez-la de nouveau.`,
      confirmLabel: 'Corriger', tone: 'info',
    });
    if (!ok) return;
    const corps = edition.choix.startsWith('a:')
      ? { articleId: Number(edition.choix.slice(2)), conversion: nombre(edition.conversion) }
      : { horsStock: edition.choix.slice(2) };
    setEdition({ ...edition, envoi: true });
    try {
      const { data } = await api.patch(`/api/correspondances/${edition.id}`, corps);
      const maj = data as Correspondance;
      setListe((l) => (l ?? []).map((c) => (c.id === edition.id ? { ...c, ...maj, fournisseurNom: c.fournisseurNom } : c)));
      setEdition(null);
    } catch (e) {
      setEdition({ ...edition, envoi: false });
      await alerte({ title: 'Correction impossible', message: messageErreur(e, 'La correspondance n\'a pas pu être corrigée.'), tone: 'danger' });
    }
  };

  const oublier = async (c: Correspondance) => {
    const ok = await confirm({
      title: 'Oublier cette correspondance ?',
      message: `« ${c.designation} » de ${c.fournisseurNom} ne sera plus reconnue : la prochaine facture redemandera ${voc.le('article')}. Les factures déjà validées ne changent pas.`,
      confirmLabel: 'Oublier', tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/correspondances/${c.id}`);
      setListe((l) => (l ?? []).filter((x) => x.id !== c.id));
    } catch (e) {
      await alerte({ title: 'Impossible d\'oublier', message: messageErreur(e, 'La correspondance n\'a pas pu être oubliée.'), tone: 'danger' });
    }
  };

  const cellule: React.CSSProperties = { padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.82rem', verticalAlign: 'top' };
  const valide = edition && (edition.choix.startsWith('h:') || (edition.choix.startsWith('a:') && nombre(edition.conversion) > 0));

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #78350f 0%, #92400e 55%, #f59e0b 100%)', borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(146,64,14,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🔗</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Correspondances</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', margin: 0 }}>
            Ce que LabFlow a appris de vos factures validées : chaque ligne {voc.du('fournisseur')} → {voc.votre('article')} et sa conversion
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/client/fournisseurs" style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', background: 'rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 12px' }}>← {voc.Pl('fournisseur')}</Link>
          <GuideButton section="fournisseurs" />
        </div>
      </div>

      <HistoryFilterBar accent="#ea580c" accentDark={ACCENT}
        subtitle={liste ? `${filtrees.length} correspondance${filtrees.length > 1 ? 's' : ''}` : 'Chargement…'}
        onReset={() => { setFournisseur(''); setRecherche(''); setPage(1); }} showReset={Boolean(fournisseur || recherche)}
        onExportExcel={exporter} excelLabel={exportEnCours ? 'Export…' : 'Exporter (Excel)'} excelDisabled={exportEnCours || !liste?.length}>
        <FilterField label={voc.Nom('fournisseur')}>
          <FilterSelect value={fournisseur} onChange={(e) => { setFournisseur(e.target.value); setPage(1); }}>
            <option value="">{voc.Tous('fournisseur')}</option>
            {fournisseurs.map(([id, nom]) => <option key={id} value={String(id)}>{nom}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="Recherche">
          <FilterInput value={recherche} placeholder={`Désignation, code ${voc.nom('fournisseur')}, ${voc.nom('article')}…`} onChange={(e) => { setRecherche(e.target.value); setPage(1); }} />
        </FilterField>
      </HistoryFilterBar>

      {erreur && <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>{erreur}</p>}
      {liste && liste.length === 0 && !erreur && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔗</div>
          Rien n'est encore appris. Déposez une facture en saisissant {voc.un('appro', false, 'court')}, puis « Vérifier la facture et enregistrer » :
          chaque ligne validée est retenue ici, et la prochaine facture {voc.du('fournisseur')} se reconnaîtra seule.
        </div>
      )}
      {filtrees.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fff7ed' }}>
                {['Ligne de la facture', `Code ${voc.nom('fournisseur')}`, voc.Nom('fournisseur'), `→ ${voc.Nom('article')} LabFlow`, 'Confirmée', ''].map((h) => (
                  <th key={h} style={{ ...cellule, textAlign: 'left', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: ACCENT, fontWeight: 800 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagees.map((c) => {
                const enEdition = edition?.id === c.id;
                return (
                  <tr key={c.id}>
                    <td style={cellule}>
                      <div style={{ fontWeight: 700 }}>{c.designation}</div>
                      {c.uniteFacture && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>unité : {c.uniteFacture}</div>}
                    </td>
                    {/* Code produit du fournisseur (colonne « Réf. » ou « Code » de sa facture) : il reconnaît la ligne ; sans code,
                        la ligne est reconnue par sa désignation. */}
                    <td style={cellule}>
                      {c.reference
                        ? <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>{c.reference}</span>
                        : <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>— reconnue par sa désignation</span>}
                    </td>
                    <td style={cellule}>{c.fournisseurNom}</td>
                    <td style={cellule}>
                      {enEdition && edition ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <ChoixArticle valeur={edition.choix} articles={classer(c.designation)} natures={NATURES} libelles={libellesChoix}
                            onChoix={(choix) => setEdition({ ...edition, choix })} style={{ flex: '1 1 220px', maxWidth: 320 }} />
                          {edition.choix.startsWith('a:') && (
                            <span style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              1 {c.uniteFacture || 'unité'} =
                              <input className="input" style={{ width: 70, padding: '4px 6px', fontSize: '0.8rem' }} inputMode="decimal" value={edition.conversion}
                                onChange={(e) => setEdition({ ...edition, conversion: e.target.value })} />
                              {unite(Number(edition.choix.slice(2)))}
                            </span>
                          )}
                        </div>
                      ) : c.horsStock ? (
                        <span style={{ color: '#3730a3' }}>{NATURES.find((n) => n.valeur === c.horsStock)?.libelle ?? `Hors ${voc.nom('stock')}`} <span style={{ color: 'var(--text-muted)' }}>(hors {voc.nom('stock')})</span></span>
                      ) : (
                        <>
                          <div style={{ fontWeight: 600 }}>{c.articleNom}</div>
                          {c.conversion !== 1 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>1 {c.uniteFacture || 'unité'} = {fNb(c.conversion)} {c.uniteStock}</div>}
                        </>
                      )}
                    </td>
                    <td style={{ ...cellule, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {c.emplois > 0 ? `${c.emplois} facture${c.emplois > 1 ? 's' : ''}` : 'corrigée à la main'}<div>{c.emplois > 0 ? 'dernière' : 'dernière facture'} le {fDate(c.derniereFois)}{c.auteurNom ? ` · ${c.auteurNom}` : ''}</div>
                    </td>
                    <td style={{ ...cellule, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {canWrite && (enEdition ? (
                        <>
                          <button className="btn btn-primary btn-sm" disabled={!valide || edition?.envoi} onClick={() => void enregistrer()} style={{ background: ACCENT, border: 'none', marginRight: 4 }}>
                            {edition?.envoi ? '…' : 'Enregistrer'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEdition(null)}>Annuler</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost btn-sm" title="Corriger" style={{ padding: '2px 6px' }}
                            onClick={() => setEdition({ id: c.id, choix: c.articleId ? `a:${c.articleId}` : `h:${c.horsStock}`, conversion: fNb(c.conversion), envoi: false })}>✏️</button>
                          <button className="btn btn-ghost btn-sm" title="Oublier" style={{ padding: '2px 6px', color: '#dc2626' }} onClick={() => void oublier(c)}>🗑️</button>
                        </>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination total={filtrees.length} page={page} perPage={PAR_PAGE} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
