import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { SupportDemande, DomaineActivite } from '../../types';

const TYPE_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  ingredient_manquant: { label: 'Ingrédient manquant', icon: '🥕', desc: 'Demander l\'ajout d\'un ingrédient absent du catalogue' },
  supplement:          { label: 'Ajout de capacité',   icon: '➕', desc: 'Demander l\'ajout d\'activités, labos ou gérants' },
  aide:                { label: 'Besoin d\'aide',       icon: '💬', desc: 'Nous décrire votre besoin ou signaler un problème' },
};

const STATUT: Record<string, { label: string; bg: string; text: string }> = {
  en_attente: { label: 'En attente',  bg: '#fef3c7', text: '#92400e' },
  validée:    { label: 'Validée',     bg: '#dcfce7', text: '#166534' },
  refusée:    { label: 'Refusée',     bg: '#fee2e2', text: '#991b1b' },
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

export default function SupportPage() {
  const [demandes, setDemandes] = useState<SupportDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<SupportDemande['type'] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [domaines, setDomaines] = useState<DomaineActivite[]>([]);

  // Ingredient form
  const [domaineId, setDomaineId] = useState('');
  const [categorieNom, setCategorieNom] = useState('');
  const [uniteNom, setUniteNom] = useState('');
  const [nomIngredient, setNomIngredient] = useState('');

  // Supplement form
  const [nbActivites, setNbActivites] = useState(0);
  const [nbLabos, setNbLabos] = useState(0);
  const [nbGerants, setNbGerants] = useState(0);

  // Aide form
  const [description, setDescription] = useState('');

  const fetchDemandes = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/abonnements/support');
      setDemandes(data);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchDemandes();
    api.get('/api/domaines').then(({ data }) => setDomaines(data)).catch(() => {});
  }, []);

  const resetForm = () => {
    setFormType(null); setDomaineId(''); setCategorieNom(''); setUniteNom(''); setNomIngredient('');
    setNbActivites(0); setNbLabos(0); setNbGerants(0); setDescription('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!formType) return;
    setError(null);
    setSaving(true);
    try {
      let body: Record<string, unknown> = { type: formType };
      if (formType === 'ingredient_manquant') {
        if (!nomIngredient.trim()) { setError('Nom de l\'ingrédient requis'); setSaving(false); return; }
        body = { ...body, domaineId: domaineId ? Number(domaineId) : null, categorieNom, uniteNom, nomIngredient: nomIngredient.trim() };
      } else if (formType === 'supplement') {
        if (nbActivites + nbLabos + nbGerants === 0) { setError('Indiquez au moins un supplément'); setSaving(false); return; }
        body = { ...body, nbActivitesSupp: nbActivites, nbLabosSupp: nbLabos, nbGerantsSupp: nbGerants };
      } else {
        if (!description.trim()) { setError('Description requise'); setSaving(false); return; }
        body = { ...body, description: description.trim() };
      }
      await api.post('/api/abonnements/support', body);
      setSuccess('Demande envoyée avec succès.');
      setShowForm(false);
      resetForm();
      fetchDemandes();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || 'Erreur lors de l\'envoi');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>💬 Support</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Faites vos demandes — nous répondons sous 24h</p>
        </div>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            + Nouvelle demande
          </button>
        )}
      </div>

      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#166534', fontWeight: 600 }}>
          ✓ {success}
        </div>
      )}

      {/* New request form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 18 }}>Nouvelle demande</div>

          {/* Type selection */}
          {!formType ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(TYPE_LABELS).map(([key, { label, icon, desc }]) => (
                <button key={key} onClick={() => setFormType(key as SupportDemande['type'])}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#f5f3ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{label}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{desc}</div>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 16 }}>→</span>
                </button>
              ))}
            </div>
          ) : (
            <div>
              {/* Back */}
              <button onClick={() => setFormType(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#6366f1', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 16, padding: 0 }}>
                ← Changer de type
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, padding: '10px 14px', background: '#f5f3ff', borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>{TYPE_LABELS[formType].icon}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95' }}>{TYPE_LABELS[formType].label}</span>
              </div>

              {/* Ingredient form */}
              {formType === 'ingredient_manquant' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={lbl}>Domaine d'activité</label>
                    <select value={domaineId} onChange={(e) => setDomaineId(e.target.value)} style={inp}>
                      <option value="">— Sélectionner —</option>
                      {domaines.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={lbl}>Catégorie</label>
                      <input value={categorieNom} onChange={(e) => setCategorieNom(e.target.value)} placeholder="ex: Produits laitiers" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Unité</label>
                      <input value={uniteNom} onChange={(e) => setUniteNom(e.target.value)} placeholder="ex: kg, L, pièce" style={inp} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Nom de l'ingrédient *</label>
                    <input value={nomIngredient} onChange={(e) => setNomIngredient(e.target.value)} placeholder="Nom exact de l'ingrédient" style={inp} />
                  </div>
                </div>
              )}

              {/* Supplement form */}
              {formType === 'supplement' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>Indiquez les suppléments souhaités. Votre demande sera examinée et un avenant vous sera envoyé.</p>
                  {[
                    { label: 'Activités supplémentaires', value: nbActivites, set: setNbActivites },
                    { label: 'Labos supplémentaires', value: nbLabos, set: setNbLabos },
                    { label: 'Gérants supplémentaires', value: nbGerants, set: setNbGerants },
                  ].map(({ label, value, set }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => set(Math.max(0, value - 1))} disabled={value === 0}
                          style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #e2e8f0', background: value === 0 ? '#f8fafc' : '#f1f5f9', color: value === 0 ? '#cbd5e1' : '#334155', fontSize: 16, cursor: value === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', minWidth: 20, textAlign: 'center' }}>{value}</span>
                        <button onClick={() => set(value + 1)}
                          style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #6366f1', background: '#6366f1', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Aide form */}
              {formType === 'aide' && (
                <div>
                  <label style={lbl}>Décrivez votre besoin *</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5}
                    placeholder="Décrivez votre besoin, le problème rencontré ou la fonctionnalité souhaitée…"
                    style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              )}

              {error && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#dc2626', marginTop: 10 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => { resetForm(); setShowForm(false); }}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Annuler
                </button>
                <button onClick={handleSubmit} disabled={saving}
                  style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg,#4338ca,#6366f1)', color: saving ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
                  {saving ? 'Envoi…' : 'Envoyer la demande'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Demandes list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Chargement…</div>
      ) : demandes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: '#f8fafc', borderRadius: 16, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Aucune demande pour le moment</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Cliquez sur "Nouvelle demande" pour nous contacter.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {demandes.map((d) => {
            const s = STATUT[d.statut] || STATUT.en_attente;
            const t = TYPE_LABELS[d.type];
            return (
              <div key={d.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: d.notesAdmin ? 10 : 0 }}>
                  <span style={{ fontSize: 20 }}>{t.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{fmtDate(d.createdAt)}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: s.bg, color: s.text }}>{s.label}</span>
                </div>
                {/* Details */}
                <div style={{ fontSize: 12, color: '#374151', marginTop: 8 }}>
                  {d.type === 'ingredient_manquant' && d.nomIngredient && (
                    <span>🥕 <strong>{d.nomIngredient}</strong>{d.categorieNom ? ` · ${d.categorieNom}` : ''}{d.uniteNom ? ` · ${d.uniteNom}` : ''}</span>
                  )}
                  {d.type === 'supplement' && (
                    <span>
                      {[d.nbActivitesSupp && `+${d.nbActivitesSupp} activité${(d.nbActivitesSupp||0) > 1?'s':''}`,
                        d.nbLabosSupp && `+${d.nbLabosSupp} labo${(d.nbLabosSupp||0) > 1?'s':''}`,
                        d.nbGerantsSupp && `+${d.nbGerantsSupp} gérant${(d.nbGerantsSupp||0) > 1?'s':''}`
                      ].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {d.type === 'aide' && d.description && (
                    <span style={{ color: '#64748b', fontStyle: 'italic' }}>{d.description.slice(0, 120)}{d.description.length > 120 ? '…' : ''}</span>
                  )}
                </div>
                {d.notesAdmin && (
                  <div style={{ marginTop: 10, background: '#f8fafc', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #6366f1' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Réponse de l'administration</div>
                    <div style={{ fontSize: 12, color: '#374151' }}>{d.notesAdmin}</div>
                    {d.traiteLe && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Le {fmtDate(d.traiteLe)}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
