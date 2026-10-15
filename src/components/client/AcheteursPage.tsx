import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import GuideButton from './GuideButton';
import { useConfirm } from '../common/ConfirmDialog';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import Pagination from '../common/Pagination';
import { useVocabulaire } from '../../hooks/useVocabulaire';
// D2 (15/10/2026) : un acheteur est un professionnel (B2B) ou un particulier (B2C) ; la patente d'un professionnel se lit
// avec le même lecteur que l'identité d'un client (admin) ou d'un fournisseur — dans le navigateur, rien n'est envoyé.
import LecturePatente, { NoteLu, PastilleLu } from '../admin/patente/LecturePatente';
import { valeurRecopiee } from '../admin/patente/fusion';
import type { ChampIdentite, ChampLu } from '../admin/patente/types';
import { IDENTITE_VIDE, type IdentiteLegale } from '../../utils/identiteLegale';
import { controlerMatriculeFiscal } from '../admin/matriculeFiscal';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';
const PAGE_ACCENT = { border: CB, bg: CL, text: CD };
const PAR_PAGE = 12;

type TypeAcheteur = 'b2b' | 'b2c' | 'a_preciser';

interface Acheteur {
  id: number;
  nom: string;
  entreprise: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  matriculeFiscal: string | null;
  rne: string | null;
  type: TypeAcheteur;
  notes: string | null;
  actif: boolean;
  compte: 'aucun' | 'invite' | 'actif';
}

interface FormState {
  type: '' | 'b2b' | 'b2c';
  nom: string; entreprise: string; email: string; telephone: string;
  adresse: string; matriculeFiscal: string; rne: string; notes: string; creerCompte: boolean;
}
const emptyForm = (): FormState => ({ type: '', nom: '', entreprise: '', email: '', telephone: '', adresse: '', matriculeFiscal: '', rne: '', notes: '', creerCompte: false });

// Champs de la fiche que la lecture de la patente sait remplir, et leur nom dans l'identité légale (lecteur).
type ChampFiche = 'entreprise' | 'matriculeFiscal' | 'rne' | 'adresse';
const VERS_IDENTITE: Record<ChampFiche, ChampIdentite> = { entreprise: 'raisonSociale', matriculeFiscal: 'matriculeFiscal', rne: 'rne', adresse: 'adresse' };
const DEPUIS_IDENTITE: Partial<Record<ChampIdentite, ChampFiche>> = { raisonSociale: 'entreprise', matriculeFiscal: 'matriculeFiscal', rne: 'rne', adresse: 'adresse' };

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 };

const COMPTE_BADGE: Record<Acheteur['compte'], { label: string; bg: string; color: string }> = {
  aucun: { label: 'Sans compte', bg: '#f1f5f9', color: '#64748b' },
  invite: { label: '✉️ Invité', bg: '#fef3c7', color: '#92400e' },
  actif: { label: '✅ Compte actif', bg: '#dcfce7', color: '#166534' },
};
const TYPE_BADGE: Record<TypeAcheteur, { label: string; bg: string; color: string }> = {
  b2b: { label: '🏢 Professionnel (B2B)', bg: '#e0e7ff', color: '#3730a3' },
  b2c: { label: '👤 Particulier (B2C)', bg: '#ccfbf1', color: '#115e59' },
  a_preciser: { label: '⚠️ Type à préciser', bg: '#fef3c7', color: '#92400e' },
};

// Avatar : initiales + dégradé stable par nom (même principe que le catalogue portail).
const AVATAR_PALETTE = [
  ['#6d28d9', '#8b5cf6'], ['#1d4ed8', '#3b82f6'], ['#0f766e', '#14b8a6'],
  ['#b45309', '#f59e0b'], ['#be185d', '#ec4899'], ['#4338ca', '#6366f1'],
  ['#166534', '#22c55e'], ['#9f1239', '#f43f5e'],
];
const hashOf = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const initialesDe = (nom: string) =>
  nom.trim().split(/\s+/).slice(0, 2).map(m => m.charAt(0).toUpperCase()).join('') || '?';

export default function AcheteursPage() {
  const { confirm } = useConfirm();
  const voc = useVocabulaire();
  const [acheteurs, setAcheteurs] = useState<Acheteur[]>([]);
  const [quota, setQuota] = useState(0);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');

  // Filtres (bloc partagé, filtrage en direct)
  const [search, setSearch] = useState('');
  const [compteFilter, setCompteFilter] = useState('');
  const [actifFilter, setActifFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  // Formulaire UNIQUE ajout/édition (editingId : null = ajout)
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Acheteur | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // Lecture de la patente d'un professionnel : pastilles « lu », dernier champ où le curseur s'est posé (recopie), lecture en cours.
  const [lus, setLus] = useState<Partial<Record<ChampIdentite, ChampLu>>>({});
  const [champActif, setChampActif] = useState<ChampFiche | null>(null);
  const [lecture, setLecture] = useState(false);

  // Actions par carte (invitation / suppression)
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flash, setFlash] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/acheteurs')
      .then(({ data }) => { setAcheteurs(data.acheteurs); setQuota(data.quota); })
      .catch(() => setGlobalError('Erreur de chargement du carnet'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => acheteurs.filter(a => {
    const q = search.trim().toLowerCase();
    if (q && ![a.nom, a.entreprise, a.email, a.telephone].some(v => (v || '').toLowerCase().includes(q))) return false;
    if (compteFilter && a.compte !== compteFilter) return false;
    if (actifFilter === 'actifs' && !a.actif) return false;
    if (actifFilter === 'inactifs' && a.actif) return false;
    if (typeFilter && a.type !== typeFilter) return false;
    return true;
  }), [acheteurs, search, compteFilter, actifFilter, typeFilter]);
  const aPreciser = useMemo(() => acheteurs.filter(a => a.type === 'a_preciser').length, [acheteurs]);

  // Tout changement de filtre ramène à la première page
  useEffect(() => { setPage(1); }, [search, compteFilter, actifFilter, typeFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAR_PAGE));
  const pageCourante = Math.min(page, totalPages);
  const affiches = filtered.slice((pageCourante - 1) * PAR_PAGE, pageCourante * PAR_PAGE);

  const filtresActifs = !!(search.trim() || compteFilter || actifFilter || typeFilter);

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setFormError(''); setLus({}); setChampActif(null); setModalOpen(true); };
  const openEdit = (a: Acheteur) => {
    setEditing(a);
    setForm({
      type: a.type === 'a_preciser' ? '' : a.type,
      nom: a.nom, entreprise: a.entreprise || '', email: a.email || '', telephone: a.telephone || '',
      adresse: a.adresse || '', matriculeFiscal: a.matriculeFiscal || '', rne: a.rne || '', notes: a.notes || '', creerCompte: false,
    });
    setFormError(''); setLus({}); setChampActif(null); setModalOpen(true);
  };

  // Un champ retouché à la main n'est plus « lu ».
  const set = (k: keyof FormState) => (v: string | boolean) => {
    setForm(f => ({ ...f, [k]: v }));
    const ci = VERS_IDENTITE[k as ChampFiche];
    if (ci && lus[ci] && lus[ci].valeur !== v) setLus(l => { const reste = { ...l }; delete reste[ci]; return reste; });
  };
  // La patente remplit les champs VIDES de la fiche ; une ville lue complète l'adresse (la fiche n'a qu'un champ).
  const identite: IdentiteLegale = {
    ...IDENTITE_VIDE, raisonSociale: form.entreprise || null, matriculeFiscal: form.matriculeFiscal || null, rne: form.rne || null, adresse: form.adresse || null,
  };
  const remplirDepuisPatente = (champs: Partial<IdentiteLegale>, nouveaux: Partial<Record<ChampIdentite, ChampLu>>) => {
    const retenus = (Object.keys(DEPUIS_IDENTITE) as ChampIdentite[]).filter(c => champs[c]);
    if (!retenus.length && !champs.ville) return;
    setForm(p => {
      const suivant = { ...p };
      for (const c of retenus) {
        const cible = DEPUIS_IDENTITE[c] as ChampFiche;
        suivant[cible] = c === 'matriculeFiscal' ? controlerMatriculeFiscal(champs[c]).valeur : String(champs[c]);
      }
      const ville = String(champs.ville || '').trim();
      if (ville && !suivant.adresse.toLowerCase().includes(ville.toLowerCase())) suivant.adresse = suivant.adresse ? `${suivant.adresse}, ${ville}` : ville;
      return suivant;
    });
    setLus(l => ({ ...l, ...Object.fromEntries(retenus.map(c => [c, nouveaux[c]])) }));
  };
  const recopier = (ligne: string) => {
    if (!champActif) return;
    const valeur = valeurRecopiee(VERS_IDENTITE[champActif], ligne);
    set(champActif)(champActif === 'matriculeFiscal' ? controlerMatriculeFiscal(valeur).valeur : valeur);
  };
  const mf = controlerMatriculeFiscal(form.matriculeFiscal);

  const submit = async () => {
    if (!form.type) { setFormError('Choisissez le type : professionnel (B2B) ou particulier (B2C)'); return; }
    if (!form.nom.trim()) { setFormError(form.type === 'b2b' ? 'Le nom du contact est requis' : 'Le nom est requis'); return; }
    if (form.type === 'b2b') {
      const manquants = [[form.entreprise, 'la raison sociale'], [form.matriculeFiscal, 'le matricule fiscal'], [form.adresse, 'l\'adresse']]
        .filter(([v]) => !String(v).trim()).map(([, l]) => l);
      if (manquants.length) { setFormError(`Pour un professionnel (B2B), la raison sociale, le matricule fiscal et l'adresse sont obligatoires (manque : ${manquants.join(', ')})`); return; }
    }
    if (form.type === 'b2c' && !form.telephone.trim()) { setFormError('Pour un particulier (B2C), le téléphone est obligatoire'); return; }
    if (!editing && form.creerCompte && !form.email.trim()) { setFormError('Un email est requis pour créer un compte portail'); return; }
    setSaving(true); setFormError('');
    const payload = {
      type: form.type,
      nom: form.nom.trim(), entreprise: form.entreprise.trim(), email: form.email.trim(),
      telephone: form.telephone.trim(), adresse: form.adresse.trim(),
      matriculeFiscal: form.matriculeFiscal.trim(), rne: form.rne.trim(), notes: form.notes.trim(),
    };
    try {
      if (editing) {
        await api.put(`/api/acheteurs/${editing.id}`, payload);
        setFlash(`« ${form.nom.trim()} » mis à jour`);
      } else {
        const { data } = await api.post('/api/acheteurs', { ...payload, creerCompte: form.creerCompte });
        const w = (data.warnings || []) as string[];
        setFlash(`« ${form.nom.trim()} » ajouté${data.invitations ? ' · invitation envoyée' : ''}${w.length ? ` · ⚠️ ${w.join(' — ')}` : ''}`);
      }
      setModalOpen(false); load();
    } catch (e: unknown) {
      setFormError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const toggleActif = async (a: Acheteur) => {
    setBusyId(a.id);
    try {
      await api.put(`/api/acheteurs/${a.id}`, { actif: !a.actif });
      setAcheteurs(prev => prev.map(x => x.id === a.id ? { ...x, actif: !a.actif } : x));
    } catch { setGlobalError('Erreur lors de la mise à jour'); }
    finally { setBusyId(null); }
  };

  const inviter = async (a: Acheteur) => {
    setBusyId(a.id); setGlobalError('');
    try {
      const { data } = await api.post(`/api/acheteurs/${a.id}/inviter`);
      setFlash(data.message); load();
    } catch (e: unknown) {
      setGlobalError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'invitation');
    } finally { setBusyId(null); }
  };

  const supprimer = async (a: Acheteur) => {
    const ok = await confirm({
      title: `Supprimer « ${a.nom} » de votre carnet ?`,
      details: [
        `Ses commandes expédiées ou livrées et leurs factures sont CONSERVÉES dans l'historique (${voc.le('stock')} ne bouge pas).`,
        'Ses commandes encore en attente seront annulées.',
        ...(a.compte !== 'aucun' ? ['Son compte de connexion au portail sera supprimé.'] : []),
      ],
      tone: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok) return;
    setBusyId(a.id); setGlobalError('');
    try {
      await api.delete(`/api/acheteurs/${a.id}`);
      setFlash(`« ${a.nom} » supprimé — ses commandes et factures restent dans l'historique`); load();
    } catch (e: unknown) {
      setGlobalError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de la suppression');
    } finally { setBusyId(null); }
  };

  const quotaAtteint = quota > 0 && acheteurs.length >= quota;

  const actionBtn = (disabled = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff',
    fontSize: '0.76rem', fontWeight: 600, color: '#475569',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, transition: 'all 0.12s',
  });
  const typeBtn = (actif: boolean, couleur: string): React.CSSProperties => ({
    flex: 1, padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
    border: `2px solid ${actif ? couleur : '#e2e8f0'}`, background: actif ? `${couleur}14` : '#fff',
    color: actif ? couleur : '#334155', fontWeight: 800, fontSize: '0.88rem',
  });
  const champ = (k: ChampFiche, label: string, placeholder = '', obligatoire = false, pleineLargeur = false) => (
    <div style={pleineLargeur ? { gridColumn: '1 / -1' } : undefined}>
      <label style={lbl}>{label}{obligatoire ? ' *' : ''}<PastilleLu lu={lus[VERS_IDENTITE[k]]} /></label>
      <input value={form[k]} onChange={e => set(k)(e.target.value)} onFocus={() => setChampActif(k)} placeholder={placeholder} style={inp} />
      <NoteLu lu={lus[VERS_IDENTITE[k]]} />
    </div>
  );

  return (
    <div className="page-content">
      {/* Hover des cartes (les styles inline ne portent pas :hover) */}
      <style>{`
        .ach-card { transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s; }
        .ach-card:hover { box-shadow: 0 10px 28px rgba(76,29,149,0.14); transform: translateY(-2px); border-color: ${CB}; }
        .ach-act:hover { border-color: ${CB}; color: ${CD}; background: ${CL}; }
      `}</style>

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #8b5cf6 100%)`, borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(109,40,217,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: '1 1 300px', minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🤝</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Carnet {voc.de('acheteur', true, 'Nom')}</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Vos clients professionnels (B2B) et particuliers (B2C) — ajoutez-les, invitez-les et préparez {voc.votre('vente', true)} depuis {voc.le('stock')} {voc.compl('labo')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', whiteSpace: 'nowrap' }}>{acheteurs.length}<span style={{ fontSize: '0.85rem', fontWeight: 600, opacity: 0.7 }}> / {quota}</span></div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{voc.pl('acheteur')}</div>
          </div>
          <GuideButton section="acheteurs-carnet" />
        </div>
      </div>

      {flash && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{flash}</span>
          <button onClick={() => setFlash('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontWeight: 800 }}>✕</button>
        </div>
      )}
      {globalError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{globalError}</span>
          <button onClick={() => setGlobalError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 800 }}>✕</button>
        </div>
      )}
      {/* D2 : fiches d'avant, sans type — aucune facture ne peut leur être émise avant de le choisir */}
      {aPreciser > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>⚠️ {voc.n('acheteur', aPreciser)} à préciser : professionnel (B2B) ou particulier (B2C) ? Aucune facture ne peut leur être émise avant. Ouvrez la fiche (✏️) et choisissez.</span>
          {typeFilter !== 'a_preciser' && (
            <button onClick={() => setTypeFilter('a_preciser')} style={{ background: '#fff', border: '1px solid #fcd34d', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', color: '#92400e', fontWeight: 700, fontSize: '0.8rem' }}>Les afficher</button>
          )}
        </div>
      )}

      {/* Bloc filtres (composant partagé) + actions de création */}
      <HistoryFilterBar accent={C} accentDark={CD}
        subtitle={`${voc.n('acheteur', filtered.length)} ${voc.acc('acheteur', 'affiché', 'affichée', filtered.length)}`}
        onReset={filtresActifs ? () => { setSearch(''); setCompteFilter(''); setActifFilter(''); setTypeFilter(''); } : undefined}
        actions={
          <>
            <Link to="/client/acheteurs/import" style={{ height: 36, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 8, border: `1px solid ${CB}`, background: CL, color: C, fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
              📥 Ajout Dynamique
            </Link>
            <button onClick={openAdd} disabled={quotaAtteint}
              title={quotaAtteint ? 'Quota atteint — demandez une augmentation de capacité' : undefined}
              style={{ height: 36, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', borderRadius: 8, border: 'none', background: quotaAtteint ? '#cbd5e1' : `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: quotaAtteint ? 'not-allowed' : 'pointer', boxShadow: quotaAtteint ? 'none' : '0 4px 14px rgba(109,40,217,0.3)' }}>
              ➕ Ajouter {voc.un('acheteur')}
            </button>
          </>
        }>
        <FilterField label="🔍 Recherche">
          <FilterInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, entreprise, email, téléphone…" />
        </FilterField>
        <FilterField label="🏷️ Type">
          <FilterSelect value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">— Tous —</option>
            <option value="b2b">Professionnels (B2B)</option>
            <option value="b2c">Particuliers (B2C)</option>
            <option value="a_preciser">À préciser</option>
          </FilterSelect>
        </FilterField>
        <FilterField label="🔑 Compte portail">
          <FilterSelect value={compteFilter} onChange={e => setCompteFilter(e.target.value)}>
            <option value="">— Tous —</option>
            <option value="aucun">Sans compte</option>
            <option value="invite">Invités</option>
            <option value="actif">Comptes actifs</option>
          </FilterSelect>
        </FilterField>
        <FilterField label="⚡ État">
          <FilterSelect value={actifFilter} onChange={e => setActifFilter(e.target.value)}>
            <option value="">— Tous —</option>
            <option value="actifs">Actifs</option>
            <option value="inactifs">Désactivés</option>
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {/* Cartes */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🤝</div>
          <div style={{ fontWeight: 700, color: '#334155', marginBottom: 6 }}>
            {acheteurs.length === 0 ? 'Votre carnet est vide' : 'Aucun résultat'}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {acheteurs.length === 0 ? `Ajoutez ${voc.acc('acheteur', 'vos premiers', 'vos premières')} ${voc.pl('acheteur')} manuellement ou importez-les depuis Excel.` : 'Modifiez votre recherche ou vos filtres.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {affiches.map(a => {
              const badge = COMPTE_BADGE[a.compte];
              const typeBadge = TYPE_BADGE[a.type] || TYPE_BADGE.a_preciser;
              const busy = busyId === a.id;
              // Professionnel : la raison sociale en titre, le contact en dessous ; particulier : le nom seul.
              const titre = a.type === 'b2b' && a.entreprise ? a.entreprise : a.nom;
              const sousTitre = a.type === 'b2b' && a.entreprise ? `Contact : ${a.nom}` : a.type === 'b2c' ? 'Particulier' : (a.entreprise || '');
              const [g1, g2] = AVATAR_PALETTE[hashOf(titre) % AVATAR_PALETTE.length];
              return (
                <div key={a.id} className="ach-card" style={{ background: '#fff', border: '1px solid #ede9fe', borderRadius: 14, padding: 0, overflow: 'hidden', opacity: a.actif ? 1 : 0.6, display: 'flex', flexDirection: 'column' }}>
                  {/* Identité */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px 10px' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${g1}, ${g2})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem', flexShrink: 0, letterSpacing: '0.02em' }}>
                      {initialesDe(titre)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={titre}>{titre}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sousTitre || <span style={{ color: '#cbd5e1' }}>—</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>{badge.label}</span>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: typeBadge.bg, color: typeBadge.color, whiteSpace: 'nowrap' }}>{typeBadge.label}</span>
                    </div>
                  </div>

                  {/* Coordonnées */}
                  <div style={{ padding: '4px 16px 12px', display: 'grid', gap: 5, fontSize: '0.79rem', color: '#475569', flex: 1 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center', minWidth: 0 }}>
                      <span style={{ opacity: 0.7 }}>✉️</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.email || <span style={{ color: '#cbd5e1' }}>—</span>}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, minWidth: 0, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
                        <span style={{ opacity: 0.7 }}>📞</span>{a.telephone || <span style={{ color: '#cbd5e1' }}>—</span>}
                      </span>
                      {a.type !== 'b2c' && (
                        <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', minWidth: 0 }} title="Matricule fiscal">
                          <span style={{ opacity: 0.7 }}>🧾</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.matriculeFiscal || <span style={{ color: '#cbd5e1' }}>—</span>}</span>
                        </span>
                      )}
                      {a.type === 'b2b' && a.rne && (
                        <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', minWidth: 0 }} title="Identifiant RNE">
                          <span style={{ opacity: 0.7 }}>🏛️</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.rne}</span>
                        </span>
                      )}
                    </div>
                    {a.adresse && (
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center', minWidth: 0 }}>
                        <span style={{ opacity: 0.7 }}>📍</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.adresse}>{a.adresse}</span>
                      </div>
                    )}
                    {a.notes && (
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.notes}>
                        📝 {a.notes}
                      </div>
                    )}
                  </div>

                  {/* Pied : état + actions */}
                  <div style={{ borderTop: '1px solid #f1f5f9', background: '#fbfaff', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => toggleActif(a)} disabled={busy} title={a.actif ? `Désactiver ${voc.ce('acheteur')}` : `Activer ${voc.ce('acheteur')}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', background: a.actif ? '#059669' : '#cbd5e1', transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 2, left: a.actif ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: a.actif ? '#059669' : '#94a3b8' }}>{a.actif ? 'Actif' : 'Inactif'}</span>
                    </button>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button className="ach-act" onClick={() => openEdit(a)} title="Modifier" style={actionBtn()}>✏️</button>
                      {a.compte !== 'actif' && (
                        <button className="ach-act" onClick={() => inviter(a)} disabled={busy || !a.email}
                          title={!a.email ? 'Renseignez un email pour inviter' : a.compte === 'invite' ? 'Renvoyer l\'invitation' : 'Créer le compte et inviter'}
                          style={actionBtn(busy || !a.email)}>
                          {busy ? '…' : '✉️'}
                        </button>
                      )}
                      <button className="ach-act" onClick={() => supprimer(a)} disabled={busy} title="Supprimer" style={actionBtn(busy)}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <Pagination total={filtered.length} page={pageCourante} perPage={PAR_PAGE} onChange={setPage} accent={PAGE_ACCENT} />
          </div>
        </>
      )}

      {/* Formulaire unique ajout / édition */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: CD }}>
                {editing ? `✏️ ${editing.nom}` : `➕ Ajouter ${voc.un('acheteur')}`}
              </h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
            </div>

            {/* D2 : le type d'abord — il décide des champs obligatoires et de la facture */}
            {editing?.type === 'a_preciser' && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: '0.8rem', fontWeight: 600 }}>
                Cette fiche date d'avant : choisissez son type et complétez les champs obligatoires pour pouvoir lui émettre des factures.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <button type="button" onClick={() => set('type')('b2b')} style={typeBtn(form.type === 'b2b', '#4338ca')}>
                🏢 Professionnel (B2B)
                <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748b', marginTop: 3 }}>Raison sociale, matricule fiscal et adresse obligatoires — lecture de la patente possible</div>
              </button>
              <button type="button" onClick={() => set('type')('b2c')} style={typeBtn(form.type === 'b2c', '#0f766e')}>
                👤 Particulier (B2C)
                <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748b', marginTop: 3 }}>Nom et téléphone suffisent — repris sur la facture</div>
              </button>
            </div>

            {form.type === 'b2b' && (
              <div style={{ marginBottom: 12 }}>
                <LecturePatente valeur={identite} disabled={saving} champActif={champActif ? VERS_IDENTITE[champActif] : null} onRemplir={remplirDepuisPatente} onRecopier={recopier} onLecture={setLecture} />
              </div>
            )}
            {form.type && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {form.type === 'b2b' ? (
                  <>
                    {champ('entreprise', 'Raison sociale', 'Telle qu\'écrite sur la patente', true, true)}
                    <div>
                      <label style={lbl}>Matricule fiscal *<PastilleLu lu={lus.matriculeFiscal} /></label>
                      <input value={form.matriculeFiscal} onChange={e => set('matriculeFiscal')(e.target.value)} onFocus={() => setChampActif('matriculeFiscal')} placeholder="1234567A/A/M/000" style={inp} />
                      <NoteLu lu={lus.matriculeFiscal} />
                      {form.matriculeFiscal.trim() && (!mf.ok || mf.avertissement) && (
                        <div style={{ fontSize: '0.74rem', marginTop: 3, color: mf.ok ? '#b45309' : '#dc2626' }}>{mf.ok ? mf.avertissement : mf.erreur}</div>
                      )}
                    </div>
                    {champ('rne', 'Identifiant RNE', 'Registre national des entreprises')}
                    {champ('adresse', 'Adresse', 'Rue, numéro, ville', true, true)}
                    <div><label style={lbl}>Nom du contact *</label><input value={form.nom} onChange={e => set('nom')(e.target.value)} onFocus={() => setChampActif(null)} style={inp} /></div>
                    <div><label style={lbl}>Téléphone</label><input value={form.telephone} onChange={e => set('telephone')(e.target.value)} onFocus={() => setChampActif(null)} style={inp} /></div>
                  </>
                ) : (
                  <>
                    <div><label style={lbl}>Nom *</label><input value={form.nom} onChange={e => set('nom')(e.target.value)} style={inp} /></div>
                    <div><label style={lbl}>Téléphone *</label><input value={form.telephone} onChange={e => set('telephone')(e.target.value)} style={inp} /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Adresse</label><input value={form.adresse} onChange={e => set('adresse')(e.target.value)} style={inp} /></div>
                  </>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>Email {editing && editing.compte !== 'aucun' && <span style={{ color: '#94a3b8', fontWeight: 500 }}>(compte lié — non modifiable)</span>}</label>
                  <input type="email" value={form.email} onChange={e => set('email')(e.target.value)} onFocus={() => setChampActif(null)} style={inp} disabled={!!editing && editing.compte !== 'aucun'} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Notes</label><textarea value={form.notes} onChange={e => set('notes')(e.target.value)} onFocus={() => setChampActif(null)} style={{ ...inp, minHeight: 60, resize: 'vertical' }} /></div>
                {!editing && (
                  <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: form.creerCompte ? C : '#64748b', cursor: 'pointer', background: form.creerCompte ? CL : '#f8fafc', border: `1.5px solid ${form.creerCompte ? CB : '#e2e8f0'}`, borderRadius: 10, padding: '10px 12px' }}>
                    <input type="checkbox" checked={form.creerCompte} onChange={e => set('creerCompte')(e.target.checked)} style={{ accentColor: C }} />
                    Créer le compte portail — une invitation est envoyée par email, {voc.le('acheteur')} pourra commander en ligne
                  </label>
                )}
              </div>
            )}
            {formError && <div style={{ color: '#dc2626', fontSize: '0.82rem', margin: '12px 0 0', fontWeight: 600 }}>{formError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={() => setModalOpen(false)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>Annuler</button>
              <button onClick={submit} disabled={saving || lecture || !form.type}
                style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', cursor: saving || lecture || !form.type ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.85rem', opacity: saving || lecture || !form.type ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
