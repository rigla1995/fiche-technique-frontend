import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import HistoryFilterBar, { FilterField, FilterInput } from '../common/HistoryFilterBar';
import GuideButton from './GuideButton';
import { useConfirm } from '../common/ConfirmDialog';
import { controlerMatriculeFiscal } from '../admin/matriculeFiscal';
import LecturePatente, { NoteLu, PastilleLu } from '../admin/patente/LecturePatente';
import { valeurRecopiee } from '../admin/patente/fusion';
import type { ChampIdentite, ChampLu } from '../admin/patente/types';
import { IDENTITE_VIDE, type IdentiteLegale } from '../../utils/identiteLegale';
import type { Fournisseur, FournisseurApproActivite, Activite, Labo } from '../../types';

interface FournisseurFormData {
  nom: string;
  adresse: string;
  telephone: string;
  // Étape F2 (factures fournisseur) : identité légale — le matricule fiscal permet de reconnaître ses factures.
  raisonSociale: string;
  matriculeFiscal: string;
  email: string;
  ville: string;
  activiteIds: number[];
  laboIds: number[];
}

const empty: FournisseurFormData = { nom: '', adresse: '', telephone: '', raisonSociale: '', matriculeFiscal: '', email: '', ville: '', activiteIds: [], laboIds: [] };
// Champs de la fiche que la lecture de la patente sait remplir (les autres champs lus sont ignorés ici).
type ChampFiche = 'raisonSociale' | 'matriculeFiscal' | 'adresse' | 'ville';
const CHAMPS_PATENTE: ChampFiche[] = ['raisonSociale', 'matriculeFiscal', 'adresse', 'ville'];

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

const thStyle: React.CSSProperties = {
  fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase',
  padding: '12px 14px', color: '#fff', background: 'transparent',
};

export default function FournisseursPage() {
  const { canWrite } = useAuth();
  const voc = useVocabulaire();
  const { alerte } = useConfirm();

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item?: Fournisseur } | null>(null);
  const [form, setForm] = useState<FournisseurFormData>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [foPage, setFoPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Fournisseur | null>(null);
  // Lecture de la patente du fournisseur : pastilles « lu » et dernier champ où le curseur s'est posé (recopie).
  const [lus, setLus] = useState<Partial<Record<ChampIdentite, ChampLu>>>({});
  const [champActif, setChampActif] = useState<ChampFiche | null>(null);
  const [lecture, setLecture] = useState(false);

  const FOURN_PAGE_SIZE = 10;

  const load = async () => {
    setLoading(true);
    try {
      const [fr, ac, lb] = await Promise.all([
        api.get('/api/entreprise/fournisseurs'),
        api.get('/api/entreprise/activites'),
        api.get('/api/labo'),
      ]);
      setFournisseurs(fr.data as Fournisseur[]);
      setActivites(ac.data as Activite[]);
      setLabos(lb.data as Labo[]);
    } catch {
      setFournisseurs([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    const defaultForm: FournisseurFormData = { ...empty, activiteIds: activites.map((a) => a.id) };
    setForm(defaultForm);
    setError('');
    setLus({});
    setModal({ mode: 'create' });
  };

  const openEdit = (f: Fournisseur) => {
    setForm({
      nom: f.nom, adresse: f.adresse ?? '', telephone: f.telephone ?? '', raisonSociale: f.raisonSociale ?? '', matriculeFiscal: f.matriculeFiscal ?? '',
      email: f.email ?? '', ville: f.ville ?? '', activiteIds: f.activiteIds, laboIds: f.laboIds ?? [],
    });
    setError('');
    setLus({});
    setModal({ mode: 'edit', item: f });
  };

  const toggleActivite = (id: number) =>
    setForm((prev) => ({ ...prev, activiteIds: prev.activiteIds.includes(id) ? prev.activiteIds.filter((x) => x !== id) : [...prev.activiteIds, id] }));

  const toggleLabo = (id: number) =>
    setForm((prev) => ({ ...prev, laboIds: prev.laboIds.includes(id) ? prev.laboIds.filter((x) => x !== id) : [...prev.laboIds, id] }));

  // Un champ retouché à la main n'est plus « lu ».
  const setChamp = (k: keyof FournisseurFormData, v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (lus[k as ChampIdentite]) setLus((l) => { const reste = { ...l }; delete reste[k as ChampIdentite]; return reste; });
  };
  // La patente remplit les champs VIDES de la fiche (le nom aussi, s'il est vide : la raison sociale lue).
  const identite: IdentiteLegale = {
    ...IDENTITE_VIDE, raisonSociale: form.raisonSociale || null, matriculeFiscal: form.matriculeFiscal || null, adresse: form.adresse || null, ville: form.ville || null,
  };
  const remplirDepuisPatente = (champs: Partial<IdentiteLegale>, nouveaux: Partial<Record<ChampIdentite, ChampLu>>) => {
    const retenus = CHAMPS_PATENTE.filter((c) => champs[c]);
    if (!retenus.length) return;
    setForm((p) => {
      const suivant = { ...p };
      for (const c of retenus) suivant[c] = c === 'matriculeFiscal' ? controlerMatriculeFiscal(champs[c]).valeur : String(champs[c]);
      if (!p.nom.trim() && champs.raisonSociale) suivant.nom = champs.raisonSociale;
      return suivant;
    });
    setLus((l) => ({ ...l, ...Object.fromEntries(retenus.map((c) => [c, nouveaux[c]])) }));
  };
  const recopier = (ligne: string) => {
    if (!champActif) return;
    const valeur = valeurRecopiee(champActif, ligne);
    setChamp(champActif, champActif === 'matriculeFiscal' ? controlerMatriculeFiscal(valeur).valeur : valeur);
  };
  const mf = controlerMatriculeFiscal(form.matriculeFiscal);

  const save = async () => {
    if (!form.nom.trim()) { setError('Le nom est requis.'); return; }
    if (!mf.ok) { setError(mf.erreur ?? 'Matricule fiscal invalide.'); return; }
    setSaving(true);
    setError('');
    try {
      const activiteIds = form.activiteIds;
      const laboIds = form.laboIds;
      const payload = {
        nom: form.nom.trim(), adresse: form.adresse.trim() || null, telephone: form.telephone.trim() || null,
        raisonSociale: form.raisonSociale.trim() || null, matriculeFiscal: form.matriculeFiscal.trim() || null,
        email: form.email.trim() || null, ville: form.ville.trim() || null, activiteIds, laboIds,
      };

      const base = '/api/entreprise/fournisseurs';
      if (modal?.mode === 'edit' && modal.item) {
        await api.put(`${base}/${modal.item.id}`, payload);
      } else {
        await api.post(base, payload);
        window.dispatchEvent(new Event('fournisseur-created'));
      }
      setModal(null);
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Erreur serveur');
    }
    setSaving(false);
  };

  const handleDelete = async (f: Fournisseur) => {
    try {
      const base = '/api/entreprise/fournisseurs';
      await api.delete(`${base}/${f.id}`);
      setDeleteConfirm(null);
      load();
    } catch (e: unknown) {
      // Étape F2 : le serveur refuse de supprimer un fournisseur cité par des appros ou des factures.
      setDeleteConfirm(null);
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      await alerte({ title: 'Suppression impossible', message: msg ?? 'Erreur serveur', tone: 'danger' });
      load();
    }
  };

  const activiteLabel = (id: number) => activites.find((a) => a.id === id)?.nom ?? `#${id}`;
  const laboLabel = (id: number) => labos.find((l) => l.id === id)?.nom ?? `${voc.Court('labo')} #${id}`;

  const nonLaboFournisseurs = fournisseurs.filter((f) => !f.isLabo);
  const laboFournisseurs = fournisseurs.filter((f) => f.isLabo);
  const filteredFournisseurs = search.trim()
    ? nonLaboFournisseurs.filter((f) =>
        f.nom.toLowerCase().includes(search.toLowerCase()) ||
        (f.telephone ?? '').includes(search) ||
        (f.adresse ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (f.raisonSociale ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (f.ville ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (!!f.matriculeFiscal && /[0-9]/.test(search) && f.matriculeFiscal.toUpperCase().replace(/[^0-9A-Z]/g, '').includes(search.toUpperCase().replace(/[^0-9A-Z]/g, '')))
      )
    : nonLaboFournisseurs;
  const foTotalPages = Math.max(1, Math.ceil(filteredFournisseurs.length / FOURN_PAGE_SIZE));
  const pagedFournisseurs = filteredFournisseurs.slice((foPage - 1) * FOURN_PAGE_SIZE, foPage * FOURN_PAGE_SIZE);

  return (
    <div className="page">
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #78350f 0%, #92400e 55%, #f59e0b 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(146,64,14,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏪</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              {voc.Pl('fournisseur')}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Gérez {voc.votre('fournisseur', true)} et leurs associations
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{fournisseurs.length}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{voc.Pl('fournisseur')}</div>
          </div>
          <GuideButton section="fournisseurs" />
        </div>
      </div>

      {/* Filtres en direct */}
      <HistoryFilterBar
        accent="#ea580c"
        accentDark="#c2410c"
        subtitle={`${voc.n('fournisseur', filteredFournisseurs.length)}${search ? ` (${voc.acc('fournisseur', 'filtré', 'filtrée', filteredFournisseurs.length)})` : ''}`}
        onReset={() => { setSearch(''); setFoPage(1); }}
        showReset={!!search}
        actions={canWrite && (
          <>
            <Link to="/client/fournisseurs/import"
              style={{
                height: 36, display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8,
                color: '#c2410c', fontWeight: 700, padding: '0 14px',
                fontSize: '0.83rem', whiteSpace: 'nowrap', textDecoration: 'none',
              }}
            >
              📥 Ajout Dynamique
            </Link>
            <button
              onClick={openCreate}
              style={{
                height: 36, display: 'inline-flex', alignItems: 'center',
                background: 'linear-gradient(135deg, #92400e, #ea580c)',
                boxShadow: '0 4px 14px rgba(146,64,14,0.3)',
                borderRadius: 8, border: 'none',
                color: '#fff', fontWeight: 800, padding: '0 18px',
                cursor: 'pointer', fontSize: '0.83rem', whiteSpace: 'nowrap',
              }}
            >
              + {voc.Nouveau('fournisseur')}
            </button>
          </>
        )}
      >
        <FilterField label="Recherche" span>
          <FilterInput
            type="text" placeholder="Nom, matricule, téléphone, ville…" value={search}
            onChange={(e) => { setSearch(e.target.value); setFoPage(1); }}
          />
        </FilterField>
      </HistoryFilterBar>

      {loading ? (
        <p className="text-muted">Chargement…</p>
      ) : fournisseurs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🚚</div>
          <p style={{ fontSize: '0.95rem' }}>{voc.Aucun('fournisseur')} {voc.acc('fournisseur', 'enregistré', 'enregistrée')}. Créez-en {voc.acc('fournisseur', 'un', 'une')} pour pouvoir l'associer {voc.au('appro', true)}.</p>
        </div>
      ) : (
        <>
          {/* Labo fournisseurs (entreprise only, auto-managed) */}
          {laboFournisseurs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>
                {voc.icon('labo')} {voc.Pl('fournisseur')} {voc.Court('labo')} (auto-{voc.acc('fournisseur', 'gérés', 'gérées')})
              </h2>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)' }}>
                      <th style={thStyle}>Nom</th>
                      <th style={thStyle}>Téléphone</th>
                      <th style={thStyle}>{voc.Pl('activite')} {voc.acc('activite', 'liés', 'liées')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laboFournisseurs.map((f, idx) => (
                      <tr key={f.id} style={{ background: idx % 2 === 0 ? 'var(--surface)' : 'rgba(234,88,12,0.03)', borderLeft: '4px solid #ea580c' }}>
                        <td style={{ fontWeight: 700, padding: '10px 14px' }}>{voc.icon('labo')} {f.nom}</td>
                        <td style={{ color: 'var(--text-muted)', padding: '10px 14px' }}>{f.telephone ?? '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div className="fournisseur-card-acts">
                            {f.activiteIds.length === 0
                              ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                              : f.activiteIds.map((id) => <span key={id} className="act-chip">{activiteLabel(id)}</span>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Regular fournisseurs */}
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)' }}>
                  <th style={thStyle}>Nom</th>
                  <th style={thStyle}>Téléphone</th>
                  <th style={thStyle}>Adresse</th>
                  <th style={thStyle}>{voc.Pl('activite')} {voc.acc('activite', 'liés', 'liées')}</th>
                  <th style={thStyle}>{voc.Court('labo', true)} {voc.acc('labo', 'liés', 'liées')}</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>{voc.Court('appro', true)}</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {pagedFournisseurs.map((f, idx) => (
                  <tr
                    key={f.id}
                    style={{
                      background: idx % 2 === 0 ? 'var(--surface)' : 'rgba(234,88,12,0.03)',
                      borderLeft: '4px solid #ea580c',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(234,88,12,0.07)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface)' : 'rgba(234,88,12,0.03)')}
                  >
                    <td style={{ fontWeight: 700, padding: '10px 14px' }}>
                      {f.nom}
                      {(f.matriculeFiscal || (f.raisonSociale && f.raisonSociale !== f.nom)) && (
                        <div style={{ fontSize: '0.74rem', fontWeight: 500, color: 'var(--text-muted)', marginTop: 2 }}>
                          {f.raisonSociale && f.raisonSociale !== f.nom ? f.raisonSociale : ''}
                          {f.matriculeFiscal ? `${f.raisonSociale && f.raisonSociale !== f.nom ? ' · ' : ''}MF ${f.matriculeFiscal}` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', padding: '10px 14px' }}>{f.telephone ?? '—'}{f.email && <div style={{ fontSize: '0.74rem' }}>{f.email}</div>}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 14px' }}>{[f.adresse, f.ville && !(f.adresse ?? '').toLowerCase().includes(f.ville.toLowerCase()) ? f.ville : null].filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div className="fournisseur-card-acts">
                        {f.activiteIds.length === 0
                          ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                          : f.activiteIds.map((id) => <span key={id} className="act-chip">{activiteLabel(id)}</span>)}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div className="fournisseur-card-acts">
                        {(f.laboIds ?? []).length === 0
                          ? <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                          : (f.laboIds ?? []).map((id) => <span key={id} className="act-chip" style={{ background: '#ede9fe', color: '#7c3aed', borderColor: '#c4b5fd' }}>{voc.icon('labo')} {laboLabel(id)}</span>)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                      {(f.approCount ?? 0) === 0 ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <div>
                          <span style={{
                            display: 'inline-block', background: '#fff7ed', color: '#c2410c',
                            border: '1px solid #fed7aa', borderRadius: 20,
                            padding: '2px 10px', fontSize: '0.82rem', fontWeight: 800,
                          }}>
                            {f.approCount}
                          </span>
                          {(f.approByActivite ?? []).length > 0 && (
                            <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                              {(f.approByActivite as FournisseurApproActivite[]).map((a) => (
                                <span key={a.activiteId} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  background: '#eff6ff', color: '#1d4ed8',
                                  border: '1px solid #bfdbfe', borderRadius: 12,
                                  padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700,
                                }}>
                                  {a.nom} <span style={{ fontWeight: 900 }}>{a.count}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', padding: '10px 14px' }}>
                      {canWrite && (
                        <button
                          onClick={() => openEdit(f)}
                          style={{
                            marginRight: 6, background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.2)',
                            borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem',
                            color: '#ea580c', fontWeight: 700,
                          }}
                        >✏️</button>
                      )}
                      {canWrite && !f.hasAppros && (
                        <button
                          onClick={() => setDeleteConfirm(f)}
                          style={{
                            background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.18)',
                            borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: '0.85rem',
                            color: 'var(--danger)', fontWeight: 700,
                          }}
                        >🗑️</button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredFournisseurs.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 24px' }}>
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
                      <div>{search ? 'Aucun résultat.' : `${voc.Aucun('fournisseur')}. Cliquez sur "+ ${voc.Nouveau('fournisseur')}".`}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {foTotalPages > 1 && (
              <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{voc.n('fournisseur', filteredFournisseurs.length)}{search ? ` (${voc.acc('fournisseur', 'filtré', 'filtrée', filteredFournisseurs.length)})` : ''}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" disabled={foPage === 1} onClick={() => setFoPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{foPage} / {foTotalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={foPage === foTotalPages} onClick={() => setFoPage((p) => Math.min(foTotalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)', borderRadius: '12px 12px 0 0', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>⚠️ Confirmer la suppression</h2>
              <button onClick={() => setDeleteConfirm(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.95rem' }}>
                Voulez-vous vraiment supprimer {voc.le('fournisseur')} <strong>"{deleteConfirm.nom}"</strong> ?
              </p>
              <p style={{ margin: '10px 0 0', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                Cette action est irréversible.
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Annuler</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, padding: '10px 22px', cursor: 'pointer' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)', borderRadius: '12px 12px 0 0', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                {modal.mode === 'create' ? voc.Nouveau('fournisseur') : `Modifier ${voc.le('fournisseur')}`}
              </h2>
              <button
                onClick={() => setModal(null)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}
              >×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <LecturePatente valeur={identite} disabled={saving || !canWrite} champActif={champActif} onRemplir={remplirDepuisPatente} onRecopier={recopier} onLecture={setLecture} />
              <div>
                <label style={labelStyle}>Nom *</label>
                <input className="input" style={{ width: '100%' }} placeholder={`Nom ${voc.du('fournisseur')}`} value={form.nom} onChange={(e) => setChamp('nom', e.target.value)} onFocus={() => setChampActif(null)} />
              </div>
              <div>
                <label style={labelStyle}>Raison sociale<PastilleLu lu={lus.raisonSociale} /></label>
                <input className="input" style={{ width: '100%' }} placeholder="Telle qu'imprimée sur ses factures (optionnel)" value={form.raisonSociale} onChange={(e) => setChamp('raisonSociale', e.target.value)} onFocus={() => setChampActif('raisonSociale')} maxLength={200} />
                <NoteLu lu={lus.raisonSociale} />
              </div>
              <div>
                <label style={labelStyle}>Matricule fiscal<PastilleLu lu={lus.matriculeFiscal} /></label>
                <input className="input" style={{ width: '100%' }} placeholder="1234567A/A/M/000 (optionnel)" value={form.matriculeFiscal} onChange={(e) => setChamp('matriculeFiscal', e.target.value)} onFocus={() => setChampActif('matriculeFiscal')} maxLength={40} />
                <NoteLu lu={lus.matriculeFiscal} />
                {form.matriculeFiscal.trim() && (!mf.ok || mf.avertissement)
                  ? <div style={{ fontSize: '0.76rem', marginTop: 3, color: mf.ok ? '#b45309' : 'var(--danger)' }}>{mf.ok ? mf.avertissement : mf.erreur}</div>
                  : <div style={{ fontSize: '0.74rem', marginTop: 3, color: 'var(--text-muted)' }}>Les factures déposées seront reconnues par ce matricule.</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input className="input" style={{ width: '100%' }} placeholder="+216 …" value={form.telephone} onChange={(e) => setChamp('telephone', e.target.value)} onFocus={() => setChampActif(null)} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input className="input" style={{ width: '100%' }} type="email" placeholder="contact@… (optionnel)" value={form.email} onChange={(e) => setChamp('email', e.target.value)} onFocus={() => setChampActif(null)} maxLength={200} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Adresse<PastilleLu lu={lus.adresse} /></label>
                  <input className="input" style={{ width: '100%' }} placeholder="Adresse (optionnel)" value={form.adresse} onChange={(e) => setChamp('adresse', e.target.value)} onFocus={() => setChampActif('adresse')} />
                  <NoteLu lu={lus.adresse} />
                </div>
                <div>
                  <label style={labelStyle}>Ville<PastilleLu lu={lus.ville} /></label>
                  <input className="input" style={{ width: '100%' }} placeholder="Ville (optionnel)" value={form.ville} onChange={(e) => setChamp('ville', e.target.value)} onFocus={() => setChampActif('ville')} maxLength={100} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{voc.Pl('activite')} {voc.acc('activite', 'liés', 'liées')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                  {activites.length === 0
                    ? <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{voc.Aucun('activite')}</span>
                    : activites.map((a) => (
                      <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={form.activiteIds.includes(a.id)} onChange={() => toggleActivite(a.id)} />
                        {a.nom}
                      </label>
                    ))}
                </div>
              </div>
              {labos.length > 0 && (
                <div>
                  <label style={labelStyle}>{voc.Court('labo', true)} {voc.acc('labo', 'liés', 'liées')}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                    {labos.map((l) => (
                      <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input type="checkbox" checked={form.laboIds.includes(l.id)} onChange={() => toggleLabo(l.id)} />
                        {voc.icon('labo')} {l.nom} {l.refLabo ? <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({l.refLabo})</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Annuler</button>
              <button
                onClick={save}
                disabled={saving || !canWrite || lecture}
                style={{
                  background: 'linear-gradient(135deg, #ea580c, #f97316)',
                  boxShadow: '0 4px 14px rgba(234,88,12,0.35)',
                  borderRadius: 10, border: 'none', color: '#fff',
                  fontWeight: 800, padding: '10px 22px', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
