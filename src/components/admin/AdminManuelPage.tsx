import { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../../api/client';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import MarkdownView from '../common/MarkdownView';
import Pagination from '../common/Pagination';
import { useConfirm } from '../common/ConfirmDialog';
import { rendreDefaut, rendreTexte, controlerChamps, messageFautes, vocDuDomaine } from './manuelBalises.ts';
import { useDomainesApercu, SelecteurDomaine, LegendeBalises, FautesBalises, BadgeSansBalises } from './BalisesAdmin';

// Lot 2c (spec backend docs/lot-2c-spec.md §6.1) : titres, parties et contenus peuvent porter des balises de
// vocabulaire. La liste les affiche rendus en vocabulaire LabFlow (I4) ; le formulaire montre le texte brut ;
// l'aperçu rend le texte AVANT MarkdownView, dans le domaine choisi ; les variantes par domaine s'éditent dans des
// onglets (routes /admin/manuel/variantes, R5.7.3).

const PER_PAGE = 20;

interface ManuelSection {
  id: number;
  slug: string;
  titre: string;
  icone: string | null;
  partie: string;
  ordre: number;
  contenu: string;
  motsCles: string | null;
  visibleGerant: boolean;
  actif: boolean;
  modifie: boolean;
  /** Un champ porte des mots du lexique en clair, sans balise (R5.7.2). */
  sansBalises?: boolean;
  /** LabFlow Compta, S2a : produit de la fiche (manuel de app. ou de compta.). */
  produit?: Produit;
  updatedAt: string;
}

type Produit = 'labflow' | 'compta';

interface Variante {
  id: number;
  sectionId: number;
  slug: string;
  domaineSlug: string;
  domaineExiste: boolean;
  domaineAvecEcart: boolean;
  titre: string | null;
  contenu: string;
  motsCles: string | null;
  statut: 'brouillon' | 'valide';
  aRevoir: boolean;
  updatedAt: string;
}

// Variante en cours d'édition dans la fenêtre ; `origine` null = nouvelle, pas encore enregistrée.
interface VarianteEdit {
  domaineSlug: string;
  titre: string;
  contenu: string;
  valide: boolean;
  origine: Variante | null;
}

const versEdit = (v: Variante): VarianteEdit => ({
  domaineSlug: v.domaineSlug, titre: v.titre ?? '', contenu: v.contenu, valide: v.statut === 'valide', origine: v,
});
const varianteModifiee = (e: VarianteEdit) => !e.origine
  || e.titre !== (e.origine.titre ?? '') || e.contenu !== e.origine.contenu || e.valide !== (e.origine.statut === 'valide');
const messageServeur = (e: unknown, defaut: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || defaut;

const emptyForm = {
  slug: '', titre: '', icone: '', partie: '', ordre: 0,
  contenu: '', motsCles: '', visibleGerant: true, actif: true, produit: 'labflow' as Produit,
};

const MD_HELP = '## Titre · ### Sous-titre · **gras** · *italique* · `code` · [lien](#slug) · - liste · 1. étapes · | tableau | · :::astuce / :::attention / :::regle / :::exemple … ::: · :::formule Libellé … note: … :::';

export default function AdminManuelPage() {
  const { confirm, alerte } = useConfirm();
  const domaines = useDomainesApercu();
  const [sections, setSections] = useState<ManuelSection[]>([]);
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ManuelSection | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formInitial, setFormInitial] = useState(emptyForm);
  const [edits, setEdits] = useState<VarianteEdit[]>([]);
  const [onglet, setOnglet] = useState(''); // '' = Commun, sinon slug du domaine de la variante
  const [apercuDomaine, setApercuDomaine] = useState(''); // '' = Restauration (défaut)
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [partieFilter, setPartieFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/admin/manuel').then(({ data }) => data as ManuelSection[]).catch(() => [] as ManuelSection[]),
      // Ancien serveur sans routes de variantes (404) : aucune variante.
      api.get('/admin/manuel/variantes')
        .then(({ data }) => (Array.isArray(data) ? data : []) as Variante[])
        .catch(() => [] as Variante[]),
    ])
      .then(([s, v]) => { setSections(s); setVariantes(v); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Titres et parties rendus en vocabulaire LabFlow : affichage, recherche, filtre, confirmations (R6.1.1).
  const affichees = useMemo(
    () => sections.map((s) => ({ ...s, titreAff: rendreDefaut(s.titre), partieAff: rendreDefaut(s.partie) })),
    [sections],
  );
  const parties = useMemo(() => {
    const seen: string[] = [];
    for (const s of affichees) if (!seen.includes(s.partieAff)) seen.push(s.partieAff);
    return seen;
  }, [affichees]);
  // Propositions de partie : le texte BRUT (balisé), avec son rendu par défaut (une partie tapée en clair
  // formerait un groupe à part hors restauration).
  const partiesBrutes = useMemo(() => {
    const seen: string[] = [];
    for (const s of sections) if (!seen.includes(s.partie)) seen.push(s.partie);
    return seen;
  }, [sections]);
  const variantesParSection = useMemo(() => {
    const map = new Map<number, Variante[]>();
    for (const v of variantes) {
      if (!map.has(v.sectionId)) map.set(v.sectionId, []);
      map.get(v.sectionId)!.push(v);
    }
    return map;
  }, [variantes]);

  const nomDomaine = (slug: string) => (slug ? domaines.find((d) => d.slug === slug)?.nom ?? slug : 'Restauration');

  const ouvrir = (s: ManuelSection | null, f: typeof emptyForm) => {
    setEditing(s);
    setForm(f); setFormInitial(f);
    setEdits(s ? (variantesParSection.get(s.id) || []).map(versEdit) : []);
    setOnglet(''); setApercuDomaine('');
    setErr(''); setPreview(false); setShowForm(true);
  };
  const openCreate = () => {
    const maxOrdre = sections.reduce((m, s) => Math.max(m, s.ordre), 0);
    ouvrir(null, { ...emptyForm, ordre: maxOrdre + 1 });
  };
  const openEdit = (s: ManuelSection) => ouvrir(s, {
    slug: s.slug, titre: s.titre, icone: s.icone || '', partie: s.partie, ordre: s.ordre,
    contenu: s.contenu, motsCles: s.motsCles || '', visibleGerant: s.visibleGerant, actif: s.actif,
    produit: s.produit ?? 'labflow',
  });

  // Onglet actif, aperçu et contrôle des balises de l'onglet (R6.1.2, R6.1.4, R6.1.5).
  const editActif = onglet ? edits.find((e) => e.domaineSlug === onglet) ?? null : null;
  const majEdit = (patch: Partial<VarianteEdit>) =>
    setEdits((es) => es.map((e) => (e.domaineSlug === onglet ? { ...e, ...patch } : e)));
  const slugApercu = editActif ? editActif.domaineSlug : apercuDomaine;
  const vocApercu = vocDuDomaine(domaines, slugApercu);
  const controleCommun = (f: typeof emptyForm) => controlerChamps(
    { titre: f.titre, partie: f.partie, contenu: f.contenu },
    { slug: f.slug, 'icône': f.icone, 'mots-clés': f.motsCles },
  );
  const controleVariante = (e: VarianteEdit) => controlerChamps({ 'titre de la variante': e.titre, contenu: e.contenu });
  const fautes = showForm ? (editActif ? controleVariante(editActif) : controleCommun(form)) : [];
  const domainesPourVariante = domaines.filter((d) => d.avecEcart && !edits.some((e) => e.domaineSlug === d.slug));

  const ajouterVariante = (slug: string) => {
    if (!slug) return;
    setEdits((es) => [...es, { domaineSlug: slug, titre: '', contenu: form.contenu, valide: false, origine: null }]);
    setOnglet(slug); setErr('');
  };

  const supprimerVariante = async () => {
    if (!editActif || !editing) return;
    const slug = editActif.domaineSlug;
    if (editActif.origine) {
      const ok = await confirm({
        title: `Supprimer la variante « ${nomDomaine(slug)} » de « ${rendreDefaut(editing.titre)} » ?`,
        message: 'Les comptes de ce domaine liront de nouveau le texte commun.',
        confirmLabel: 'Supprimer',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await api.delete(`/admin/manuel/${editing.id}/variantes/${encodeURIComponent(slug)}`);
      } catch {
        alerte({ title: 'Suppression impossible', message: 'La suppression de la variante a échoué.', tone: 'danger' });
        return;
      }
      load();
    }
    setEdits((es) => es.filter((e) => e.domaineSlug !== slug));
    setOnglet('');
  };

  const save = async () => {
    // Une fiche de LabFlow Compta n'a pas de variante par domaine (le serveur les refuse) : aucune n'est envoyée.
    const aEnregistrer = form.produit === 'compta' ? [] : edits.filter(varianteModifiee);
    const communModifie = !editing || JSON.stringify(form) !== JSON.stringify(formInitial);
    const sauverCommun = communModifie || aEnregistrer.length === 0;
    if (sauverCommun) {
      if (!form.slug.trim() || !form.titre.trim() || !form.partie.trim() || !form.contenu.trim()) {
        setOnglet(''); setErr('Slug, titre, partie et contenu sont requis.'); return;
      }
      const f = controleCommun(form);
      if (f.length) { setOnglet(''); setErr(messageFautes(f)); return; }
    }
    for (const e of aEnregistrer) {
      const f = controleVariante(e);
      const msg = !e.contenu.trim() ? 'le contenu est requis.' : messageFautes(f);
      if (msg) { setOnglet(e.domaineSlug); setErr(`Variante « ${nomDomaine(e.domaineSlug)} » : ${msg}`); return; }
    }
    setSaving(true); setErr('');
    if (sauverCommun) {
      const payload = {
        slug: form.slug.trim(), titre: form.titre.trim(), icone: form.icone.trim() || null,
        partie: form.partie.trim(), ordre: Number(form.ordre) || 0, contenu: form.contenu,
        motsCles: form.motsCles.trim() || null, visibleGerant: form.visibleGerant, actif: form.actif,
        produit: form.produit,
      };
      try {
        if (editing) await api.put(`/admin/manuel/${editing.id}`, payload);
        else await api.post('/admin/manuel', payload);
        setFormInitial(form);
      } catch (e: unknown) {
        setOnglet(''); setErr(messageServeur(e, 'Erreur lors de l\'enregistrement.'));
        setSaving(false); return;
      }
    }
    // Le texte commun d'abord : enregistrer une variante vaut relecture du texte commun du moment (R5.7.3).
    for (const e of aEnregistrer) {
      const titre = e.titre.trim();
      const statut = e.valide ? 'valide' : 'brouillon';
      try {
        await api.put(`/admin/manuel/${editing!.id}/variantes/${encodeURIComponent(e.domaineSlug)}`, {
          titre: titre || null, contenu: e.contenu, motsCles: e.origine?.motsCles ?? null, statut,
        });
      } catch (x: unknown) {
        setOnglet(e.domaineSlug);
        setErr(`Variante « ${nomDomaine(e.domaineSlug)} » : ${messageServeur(x, 'Erreur lors de l\'enregistrement.')}`);
        setSaving(false); load(); return;
      }
      // Enregistrée : plus rien à envoyer pour elle si une variante suivante échoue.
      setEdits((es) => es.map((x) => (x.domaineSlug !== e.domaineSlug ? x : {
        ...x, titre,
        origine: {
          ...(x.origine ?? {
            id: 0, sectionId: editing!.id, slug: editing!.slug, domaineSlug: e.domaineSlug,
            domaineExiste: true, domaineAvecEcart: true, motsCles: null, aRevoir: false, updatedAt: '',
          }),
          titre: titre || null, contenu: e.contenu, statut,
        },
      })));
    }
    setSaving(false); setShowForm(false); load();
  };

  const toggleActif = async (s: ManuelSection) => {
    await api.put(`/admin/manuel/${s.id}`, { actif: !s.actif }).catch(() => alerte({ title: 'Action impossible', message: 'La mise à jour a échoué.', tone: 'danger' }));
    load();
  };

  const restore = async (s: ManuelSection) => {
    const ok = await confirm({
      title: `Restaurer la version d'origine de « ${rendreDefaut(s.titre)} » ?`,
      message: 'Vos modifications de contenu seront perdues.',
      confirmLabel: 'Restaurer',
      tone: 'primary',
      icon: '♻️',
    });
    if (!ok) return;
    await api.post(`/admin/manuel/${s.id}/restore`).catch(() => alerte({ title: 'Action impossible', message: 'La restauration a échoué.', tone: 'danger' }));
    load();
  };

  const remove = async (s: ManuelSection) => {
    const ok = await confirm({
      title: `Supprimer la section « ${rendreDefaut(s.titre)} » du manuel ?`,
      message: variantesParSection.get(s.id)?.length ? 'Ses variantes par domaine seront aussi supprimées.' : undefined,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    await api.delete(`/admin/manuel/${s.id}`).catch(() => alerte({ title: 'Suppression impossible', message: 'La suppression a échoué.', tone: 'danger' }));
    load();
  };

  const filtered = affichees.filter((s) =>
    (!partieFilter || s.partieAff === partieFilter) &&
    (!search || `${s.titreAff} ${s.slug} ${s.partieAff} ${s.motsCles || ''}`.toLowerCase().includes(search.toLowerCase())));

  // Pagination sur la liste plate (une partie peut donc s'étaler sur deux pages)
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof paged>();
    for (const s of paged) {
      if (!map.has(s.partieAff)) map.set(s.partieAff, []);
      map.get(s.partieAff)!.push(s);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, safePage]);

  const activeCount = sections.filter((s) => s.actif).length;

  // Aperçu de l'onglet actif : texte rendu AVANT MarkdownView, qui ne reçoit jamais de balise (R6.1.2).
  const titreApercu = editActif ? (editActif.titre.trim() || form.titre) : form.titre;
  const contenuSaisi = editActif ? editActif.contenu : form.contenu;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0 }}>📖 Gestion du Manuel</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', margin: '4px 0 0' }}>
            Le manuel d'utilisation affiché aux clients et gérants ({activeCount} section{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''} / {sections.length}).
          </p>
        </div>
        <button onClick={openCreate} style={{ background: '#fff', color: '#2563eb', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>
          + Nouvelle section
        </button>
      </div>

      <HistoryFilterBar
        accent="#2563eb" accentDark="#1e40af"
        subtitle={`${filtered.length} section${filtered.length !== 1 ? 's' : ''}`}
        onReset={() => { setSearch(''); setPartieFilter(''); setPage(1); }} showReset={!!search || !!partieFilter}
      >
        <FilterField label="🔍 Recherche">
          <FilterInput value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Titre, slug, mots-clés…" />
        </FilterField>
        <FilterField label="📂 Partie">
          <FilterSelect value={partieFilter} onChange={(e) => { setPartieFilter(e.target.value); setPage(1); }}>
            <option value="">— Toutes —</option>
            {parties.map((p) => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {loading ? <div className="loading-text">Chargement…</div> : (
        <div style={{ display: 'grid', gap: 16 }}>
          {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>Aucune section.</div>}
          {grouped.map(([partie, items]) => (
            <div key={partie}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 8px' }}>{partie}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((s) => {
                  const nbVariantes = variantesParSection.get(s.id)?.length || 0;
                  return (
                  <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${s.actif ? '#2563eb' : '#cbd5e1'}`, borderRadius: 12, padding: '12px 16px', opacity: s.actif ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15 }}>{s.icone || '📄'}</span>
                          <span style={{ fontWeight: 800, color: 'var(--text)', fontSize: '0.92rem' }}>{s.titreAff}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', borderRadius: 20, padding: '2px 9px', fontFamily: 'monospace' }}>#{s.slug}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8' }}>ordre {s.ordre}</span>
                          {s.modifie && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 20, padding: '2px 9px' }}>modifié</span>}
                          {s.produit === 'compta' && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#3730a3', background: '#e0e7ff', borderRadius: 20, padding: '2px 9px' }}>LabFlow Compta</span>}
                          {s.sansBalises && <BadgeSansBalises />}
                          {nbVariantes > 0 && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0f766e', background: '#ccfbf1', borderRadius: 20, padding: '2px 9px' }}>{nbVariantes} variante{nbVariantes > 1 ? 's' : ''}</span>}
                          {!s.visibleGerant && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', borderRadius: 20, padding: '2px 9px' }}>masqué gérant</span>}
                          {!s.actif && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 20, padding: '2px 9px' }}>inactif</span>}
                        </div>
                        {s.motsCles && <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>🔑 {s.motsCles}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => toggleActif(s)} title={s.actif ? 'Désactiver' : 'Activer'} style={iconBtn}>{s.actif ? '🟢' : '⚪'}</button>
                        <button onClick={() => openEdit(s)} title="Modifier" style={iconBtn}>✏️</button>
                        {s.modifie && <button onClick={() => restore(s)} title="Restaurer la version d'origine" style={iconBtn}>↩️</button>}
                        <button onClick={() => remove(s)} title="Supprimer" style={iconBtn}>🗑</button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
          <Pagination total={filtered.length} page={safePage} perPage={PER_PAGE} onChange={setPage} />
        </div>
      )}

      {/* Modal édition */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,12,41,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 980, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', padding: '18px 24px', borderTopLeftRadius: 16, borderTopRightRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>{editing ? 'Modifier la section' : 'Nouvelle section'}</h2>
              <button onClick={() => setPreview(!preview)} style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 9, padding: '7px 14px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                {preview ? '✏️ Éditer' : '👁 Aperçu'}
              </button>
            </div>
            <div style={{ padding: '22px 24px' }}>
              {/* Onglets : texte commun, puis une variante par domaine (R6.1.5) */}
              {/* Une fiche de LabFlow Compta (vocabulaire comptable fixe) n'a pas de variante par domaine. */}
              {editing && form.produit !== 'compta' && (edits.length > 0 || domainesPourVariante.length > 0) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #e5e7eb', paddingBottom: 10, marginBottom: 4 }}>
                  <button onClick={() => { setOnglet(''); setErr(''); }} style={onglet === '' ? tabOn : tabOff}>Commun</button>
                  {edits.map((e) => (
                    <button key={e.domaineSlug} onClick={() => { setOnglet(e.domaineSlug); setErr(''); }} style={onglet === e.domaineSlug ? tabOn : tabOff}>
                      {nomDomaine(e.domaineSlug)} · {e.valide ? 'validée' : 'brouillon'}{e.origine?.aRevoir ? ' ⚠' : ''}{varianteModifiee(e) ? ' •' : ''}
                    </button>
                  ))}
                  {domainesPourVariante.length > 0 && (
                    <select value="" onChange={(e) => ajouterVariante(e.target.value)} style={{ ...tabOff, paddingRight: 8 }}>
                      <option value="">+ Variante pour…</option>
                      {domainesPourVariante.map((d) => <option key={d.slug} value={d.slug}>{d.nom}</option>)}
                    </select>
                  )}
                </div>
              )}

              {editActif ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    <span style={{ fontSize: '0.8rem', color: '#475569' }}>Variante du domaine <strong>{nomDomaine(editActif.domaineSlug)}</strong> : remplace le texte commun pour les comptes de ce domaine, une fois validée.</span>
                    {editActif.origine?.aRevoir && <span title="Le texte commun a changé depuis le dernier enregistrement de cette variante" style={{ ...badge, color: '#b45309', background: '#fef3c7' }}>à revoir</span>}
                    {editActif.origine && !editActif.origine.domaineExiste && <span style={{ ...badge, color: '#b91c1c', background: '#fee2e2' }}>domaine absent</span>}
                    {editActif.origine && editActif.origine.domaineExiste && !editActif.origine.domaineAvecEcart && <span title="Non servie tant que le domaine n'a pas de lexique propre" style={{ ...badge, color: '#475569', background: '#e2e8f0' }}>domaine sans lexique</span>}
                  </div>
                  <label style={lbl}>Titre de la variante (facultatif)</label>
                  <input value={editActif.titre} onChange={(e) => majEdit({ titre: e.target.value })} placeholder={`Vide : titre commun (« ${rendreDefaut(form.titre)} »)`} style={inp} />
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 2, minWidth: 200 }}>
                      <label style={lbl}>Titre *</label>
                      <input value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} placeholder="ex : Transferts labo → activités" style={inp} />
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <label style={lbl}>Slug * (ancre #)</label>
                      <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="ex : transferts" style={{ ...inp, fontFamily: 'monospace' }} />
                    </div>
                    <div style={{ width: 80 }}>
                      <label style={lbl}>Icône</label>
                      <input value={form.icone} onChange={(e) => setForm({ ...form, icone: e.target.value })} placeholder="🔁" style={inp} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 2, minWidth: 200 }}>
                      <label style={lbl}>Partie * (groupe de navigation)</label>
                      <input value={form.partie} onChange={(e) => setForm({ ...form, partie: e.target.value })} placeholder="ex : Stock & Appro" style={inp} list="manuel-parties" />
                      <datalist id="manuel-parties">
                        {partiesBrutes.map((p) => {
                          const rendu = rendreDefaut(p);
                          return <option key={p} value={p}>{rendu !== p ? rendu : undefined}</option>;
                        })}
                      </datalist>
                    </div>
                    <div style={{ width: 100 }}>
                      <label style={lbl}>Ordre</label>
                      <input type="number" value={form.ordre} onChange={(e) => setForm({ ...form, ordre: Number(e.target.value) })} style={inp} />
                    </div>
                    <div style={{ flex: 2, minWidth: 220 }}>
                      <label style={lbl}>Mots-clés (recherche, séparés par des virgules)</label>
                      <input value={form.motsCles} onChange={(e) => setForm({ ...form, motsCles: e.target.value })} placeholder="stock, transfert, labo…" style={inp} />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <label style={lbl}>Contenu * (markdown)</label>
                {form.produit !== 'compta' && <SelecteurDomaine domaines={domaines} value={slugApercu} onChange={setApercuDomaine} disabled={!!editActif} />}
              </div>
              {preview ? (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 9, padding: '16px 18px', minHeight: 280, maxHeight: 440, overflowY: 'auto', background: '#fff' }}>
                  {vocApercu ? (
                    <>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', marginBottom: 8 }}>
                        {rendreTexte(vocApercu, form.partie)} › {rendreTexte(vocApercu, titreApercu)}
                      </div>
                      <MarkdownView content={rendreTexte(vocApercu, contenuSaisi)} />
                    </>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Domaine absent : aperçu impossible tant que le domaine « {slugApercu} » n'existe pas.</div>
                  )}
                </div>
              ) : (
                <textarea
                  value={contenuSaisi}
                  onChange={(e) => (editActif ? majEdit({ contenu: e.target.value }) : setForm({ ...form, contenu: e.target.value }))}
                  rows={16}
                  placeholder={'## 🔁 Titre de la section\n\nParagraphe…\n\n- point 1\n- point 2\n\n:::astuce\nUne astuce utile.\n:::'}
                  style={{ ...inp, resize: 'vertical', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.82rem', lineHeight: 1.6 }}
                />
              )}
              <FautesBalises fautes={fautes} />
              <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.6 }}>{MD_HELP}</p>
              {form.produit === 'compta' ? (
                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#4338ca', lineHeight: 1.6 }}>Fiche de LabFlow Compta : vocabulaire comptable fixe, sans balise de vocabulaire ni variante par domaine.</p>
              ) : (
                <LegendeBalises voc={vocApercu} nomDomaine={nomDomaine(slugApercu)} />
              )}

              {editActif ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={editActif.valide} onChange={(e) => majEdit({ valide: e.target.checked })} />
                    Validée : servie aux comptes du domaine
                  </label>
                  <button onClick={supprimerVariante} style={{ background: '#fff', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 9, padding: '7px 14px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Supprimer la variante</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.actif} onChange={(e) => setForm({ ...form, actif: e.target.checked })} />
                    Active (visible dans le manuel)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.visibleGerant} onChange={(e) => setForm({ ...form, visibleGerant: e.target.checked })} />
                    Visible par les gérants
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
                    Manuel de
                    <select value={form.produit} onChange={(e) => setForm({ ...form, produit: e.target.value as Produit })}
                      style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                      <option value="labflow">LabFlow</option>
                      <option value="compta">LabFlow Compta</option>
                    </select>
                  </label>
                </div>
              )}

              {err && <div style={{ marginTop: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '0.84rem' }}>{err}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowForm(false)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 9, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
                <button onClick={save} disabled={saving} style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 22px', fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = { background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', fontSize: '0.9rem' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', margin: '12px 0 5px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: '0.9rem', fontFamily: 'inherit' };
const badge: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 700, borderRadius: 20, padding: '2px 9px' };
const tabOff: React.CSSProperties = { background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' };
const tabOn: React.CSSProperties = { ...tabOff, background: '#2563eb', color: '#fff', border: '1px solid #2563eb' };
