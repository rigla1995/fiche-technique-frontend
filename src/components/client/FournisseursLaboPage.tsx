import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { Labo, Fournisseur } from '../../types';

interface NewFournisseurForm {
  nom: string;
  telephone: string;
  adresse: string;
}

const emptyNew: NewFournisseurForm = { nom: '', telephone: '', adresse: '' };

export default function FournisseursLaboPage() {
  const [labos, setLabos] = useState<Labo[]>([]);
  const [allFournisseurs, setAllFournisseurs] = useState<Fournisseur[]>([]);
  // Map of laboId → set of assigned fournisseurIds (local pending state)
  const [assignments, setAssignments] = useState<Record<number, Set<number>>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Per-labo "add new fournisseur" form
  const [newForm, setNewForm] = useState<Record<number, NewFournisseurForm>>({});
  const [newSaving, setNewSaving] = useState<Record<number, boolean>>({});
  const [newError, setNewError] = useState<Record<number, string>>({});
  const [showNewForm, setShowNewForm] = useState<Record<number, boolean>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [lb, fr] = await Promise.all([
        api.get('/api/labo'),
        api.get('/api/entreprise/fournisseurs'),
      ]);
      const laboList = lb.data as Labo[];
      const fournisseurList = (fr.data as Fournisseur[]).filter((f) => !f.isLabo);
      setLabos(laboList);
      setAllFournisseurs(fournisseurList);

      // Build initial assignment state from laboIds on each fournisseur
      const map: Record<number, Set<number>> = {};
      for (const labo of laboList) {
        map[labo.id] = new Set(
          fournisseurList.filter((f) => f.laboIds.includes(labo.id)).map((f) => f.id)
        );
      }
      setAssignments(map);
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = (laboId: number, fournisseurId: number) => {
    setAssignments((prev) => {
      const cur = new Set(prev[laboId] ?? []);
      if (cur.has(fournisseurId)) cur.delete(fournisseurId);
      else cur.add(fournisseurId);
      return { ...prev, [laboId]: cur };
    });
  };

  const saveAssignments = async (laboId: number) => {
    setSaving((p) => ({ ...p, [laboId]: true }));
    try {
      await api.put(`/api/labo/${laboId}/fournisseurs/sync`, {
        fournisseurIds: [...(assignments[laboId] ?? [])],
      });
      await load();
      window.dispatchEvent(new Event('labos-changed'));
    } catch { /* ignore */ }
    setSaving((p) => ({ ...p, [laboId]: false }));
  };

  const openNewForm = (laboId: number) => {
    setNewForm((p) => ({ ...p, [laboId]: { ...emptyNew } }));
    setNewError((p) => ({ ...p, [laboId]: '' }));
    setShowNewForm((p) => ({ ...p, [laboId]: true }));
  };

  const closeNewForm = (laboId: number) => {
    setShowNewForm((p) => ({ ...p, [laboId]: false }));
  };

  const saveNewFournisseur = async (laboId: number) => {
    const form = newForm[laboId];
    if (!form?.nom?.trim()) {
      setNewError((p) => ({ ...p, [laboId]: 'Le nom est requis.' }));
      return;
    }
    setNewSaving((p) => ({ ...p, [laboId]: true }));
    setNewError((p) => ({ ...p, [laboId]: '' }));
    try {
      await api.post('/api/entreprise/fournisseurs', {
        nom: form.nom.trim(),
        adresse: form.adresse.trim() || null,
        telephone: form.telephone.trim() || null,
        activiteIds: [],
        laboIds: [laboId],
      });
      setShowNewForm((p) => ({ ...p, [laboId]: false }));
      await load();
      window.dispatchEvent(new Event('labos-changed'));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setNewError((p) => ({ ...p, [laboId]: msg ?? 'Erreur serveur' }));
    }
    setNewSaving((p) => ({ ...p, [laboId]: false }));
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  if (loading) return <div className="page"><p className="text-muted">Chargement…</p></div>;

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏭</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Fournisseurs Labo</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Assignez des fournisseurs à chaque labo. Ces fournisseurs seront disponibles lors des approvisionnements du stock labo.
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{labos.length}</div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Labos</div>
        </div>
      </div>

      {labos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🏭</div>
          <p style={{ fontSize: '0.95rem' }}>Aucun labo enregistré.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {labos.map((labo) => {
            const assigned = assignments[labo.id] ?? new Set();
            const isSaving = saving[labo.id] ?? false;
            const isShowingNew = showNewForm[labo.id] ?? false;
            const form = newForm[labo.id] ?? emptyNew;
            const isNewSaving = newSaving[labo.id] ?? false;
            const err = newError[labo.id] ?? '';

            return (
              <div key={labo.id} style={{
                background: 'var(--surface)',
                borderRadius: 14, padding: 20,
                border: '1px solid var(--border)',
                borderLeft: '4px solid #ea580c',
                boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              }}>
                {/* Labo card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text)' }}>🏭 {labo.nom}</h2>
                    {labo.refLabo && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Réf: {labo.refLabo}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => openNewForm(labo.id)}
                      style={{
                        background: 'rgba(234,88,12,0.08)', border: '1px solid rgba(234,88,12,0.25)',
                        borderRadius: 8, color: '#ea580c', fontWeight: 700,
                        padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem',
                      }}
                    >
                      + Nouveau fournisseur
                    </button>
                    <button
                      onClick={() => saveAssignments(labo.id)}
                      disabled={isSaving}
                      style={{
                        background: 'linear-gradient(135deg, #ea580c, #f97316)',
                        boxShadow: '0 4px 14px rgba(234,88,12,0.35)',
                        borderRadius: 8, border: 'none', color: '#fff',
                        fontWeight: 800, padding: '6px 16px',
                        cursor: isSaving ? 'not-allowed' : 'pointer',
                        opacity: isSaving ? 0.7 : 1, fontSize: '0.82rem',
                      }}
                    >
                      {isSaving ? '…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>

                {/* Add new fournisseur inline form */}
                {isShowingNew && (
                  <div style={{
                    background: 'var(--surface)', borderRadius: 10, padding: 14, marginBottom: 16,
                    border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ flex: '1 1 160px' }}>
                        <label style={labelStyle}>Nom *</label>
                        <input
                          className="input"
                          style={{ width: '100%' }}
                          placeholder="Nom du fournisseur"
                          value={form.nom}
                          onChange={(e) => setNewForm((p) => ({ ...p, [labo.id]: { ...form, nom: e.target.value } }))}
                        />
                      </div>
                      <div style={{ flex: '1 1 130px' }}>
                        <label style={labelStyle}>Téléphone</label>
                        <input
                          className="input"
                          style={{ width: '100%' }}
                          placeholder="+216 …"
                          value={form.telephone}
                          onChange={(e) => setNewForm((p) => ({ ...p, [labo.id]: { ...form, telephone: e.target.value } }))}
                        />
                      </div>
                      <div style={{ flex: '2 1 200px' }}>
                        <label style={labelStyle}>Adresse</label>
                        <input
                          className="input"
                          style={{ width: '100%' }}
                          placeholder="Adresse (optionnel)"
                          value={form.adresse}
                          onChange={(e) => setNewForm((p) => ({ ...p, [labo.id]: { ...form, adresse: e.target.value } }))}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => closeNewForm(labo.id)}>Annuler</button>
                        <button
                          onClick={() => saveNewFournisseur(labo.id)}
                          disabled={isNewSaving}
                          style={{
                            background: 'linear-gradient(135deg, #ea580c, #f97316)',
                            boxShadow: '0 4px 14px rgba(234,88,12,0.3)',
                            borderRadius: 8, border: 'none', color: '#fff',
                            fontWeight: 800, padding: '6px 14px',
                            cursor: isNewSaving ? 'not-allowed' : 'pointer',
                            opacity: isNewSaving ? 0.7 : 1, fontSize: '0.82rem',
                          }}
                        >
                          {isNewSaving ? '…' : 'Ajouter'}
                        </button>
                      </div>
                    </div>
                    {err && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: 6 }}>{err}</p>}
                  </div>
                )}

                {/* Fournisseur checklist */}
                {allFournisseurs.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Aucun fournisseur disponible. Créez-en un via "+ Nouveau fournisseur" ci-dessus.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {allFournisseurs.map((f) => {
                      const checked = assigned.has(f.id);
                      return (
                        <label
                          key={f.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                            padding: '6px 12px', borderRadius: 8, fontSize: '0.88rem',
                            border: `1px solid ${checked ? '#ea580c' : 'var(--border)'}`,
                            background: checked ? 'rgba(234,88,12,0.08)' : 'var(--bg)',
                            fontWeight: checked ? 700 : 400,
                            color: checked ? '#ea580c' : 'var(--text)',
                            transition: 'all 0.15s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(labo.id, f.id)}
                          />
                          <span>{f.nom}</span>
                          {f.telephone && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{f.telephone}</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}

                <div style={{ marginTop: 14, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {assigned.size} fournisseur{assigned.size !== 1 ? 's' : ''} assigné{assigned.size !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
