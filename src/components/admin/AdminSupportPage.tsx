import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { SupportDemande } from '../../types';

const TYPE_INFO: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  ingredient_manquant: { label: 'Ingrédient manquant', icon: '🥕', color: '#92400e', bg: '#fef3c7' },
  supplement:          { label: 'Ajout de capacité',   icon: '➕', color: '#1e40af', bg: '#dbeafe' },
  aide:                { label: 'Besoin d\'aide',       icon: '💬', color: '#4c1d95', bg: '#ede9fe' },
};

const STATUT_INFO: Record<string, { label: string; bg: string; text: string; border: string }> = {
  en_attente: { label: 'En attente', bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  validée:    { label: 'Validée',    bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  refusée:    { label: 'Refusée',    bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function DemandeDetails({ d }: { d: SupportDemande }) {
  if (d.type === 'ingredient_manquant') {
    return (
      <div style={{ fontSize: '0.82rem', color: '#374151', marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {d.domaineNom && <span><span style={{ color: '#9ca3af' }}>Domaine :</span> {d.domaineNom}</span>}
        {d.categorieNom && <span><span style={{ color: '#9ca3af' }}>Catégorie :</span> {d.categorieNom}</span>}
        {d.uniteNom && <span><span style={{ color: '#9ca3af' }}>Unité :</span> {d.uniteNom}</span>}
        {d.nomIngredient && <span style={{ fontWeight: 700, color: '#0f172a' }}>"{d.nomIngredient}"</span>}
      </div>
    );
  }
  if (d.type === 'supplement') {
    const parts: string[] = [];
    if (d.nbActivitesSupp) parts.push(`+${d.nbActivitesSupp} activité${d.nbActivitesSupp > 1 ? 's' : ''}`);
    if (d.nbLabosSupp) parts.push(`+${d.nbLabosSupp} labo${d.nbLabosSupp > 1 ? 's' : ''}`);
    if (d.nbGerantsSupp) parts.push(`+${d.nbGerantsSupp} gérant${d.nbGerantsSupp > 1 ? 's' : ''}`);
    return (
      <div style={{ fontSize: '0.82rem', color: '#374151', marginTop: 8, fontWeight: 600 }}>
        {parts.join(' · ')}
      </div>
    );
  }
  if (d.description) {
    return (
      <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
        "{d.description.slice(0, 180)}{d.description.length > 180 ? '…' : ''}"
      </div>
    );
  }
  return null;
}

export default function AdminSupportPage() {
  const [demandes, setDemandes] = useState<SupportDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState('en_attente');
  const [filterType, setFilterType] = useState('');
  const [traiting, setTraiting] = useState<Record<number, boolean>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatut) params.set('statut', filterStatut);
      if (filterType) params.set('type', filterType);
      const res = await api.get(`/api/abonnements/admin/support?${params}`);
      setDemandes(res.data);
    } finally {
      setLoading(false);
    }
  }, [filterStatut, filterType]);

  useEffect(() => { fetchDemandes(); }, [fetchDemandes]);

  const traiter = async (id: number, statut: 'validée' | 'refusée') => {
    setTraiting((t) => ({ ...t, [id]: true }));
    try {
      const res = await api.put(`/api/abonnements/admin/support/${id}`, {
        statut,
        notesAdmin: notes[id] || undefined,
      });
      setDemandes((prev) => prev.map((d) => (d.id === id ? res.data : d)));
      setExpanded((e) => ({ ...e, [id]: false }));
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur');
    } finally {
      setTraiting((t) => ({ ...t, [id]: false }));
    }
  };

  const pendingCount = demandes.filter(d => d.statut === 'en_attente').length;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #1e40af 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(30,64,175,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💬</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Support clients</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: 0 }}>
            Traitez les demandes d'ingrédients, de capacité et d'aide
          </p>
        </div>
        {pendingCount > 0 && (
          <div style={{ background: '#fef3c7', borderRadius: 12, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.3rem' }}>⏳</span>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#92400e', lineHeight: 1 }}>{pendingCount}</div>
              <div style={{ fontSize: '0.72rem', color: '#a16207', fontWeight: 600 }}>en attente</div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filtres</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: '', label: 'Tous statuts' },
            { key: 'en_attente', label: '⏳ En attente' },
            { key: 'validée', label: '✅ Validées' },
            { key: 'refusée', label: '❌ Refusées' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilterStatut(key)}
              style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${filterStatut === key ? '#1e40af' : '#e2e8f0'}`, background: filterStatut === key ? '#1e40af' : '#fff', color: filterStatut === key ? '#fff' : '#374151', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.82rem', background: '#fff', color: '#374151' }}>
            <option value="">Tous types</option>
            <option value="ingredient_manquant">🥕 Ingrédient manquant</option>
            <option value="supplement">➕ Ajout de capacité</option>
            <option value="aide">💬 Besoin d'aide</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 60 }}>Chargement…</div>
      ) : demandes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: '#f8fafc', borderRadius: 16, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#374151' }}>Aucune demande trouvée</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {demandes.map((d) => {
            const s = STATUT_INFO[d.statut] || STATUT_INFO.en_attente;
            const t = TYPE_INFO[d.type] || { label: d.type, icon: '📝', color: '#374151', bg: '#f3f4f6' };
            const isPending = d.statut === 'en_attente';
            const isExpanded = expanded[d.id] || false;
            return (
              <div key={d.id} style={{
                background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${s.border}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Client + meta row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>
                          {d.clientNom || `Client #${d.clientId}`}
                        </span>
                        {d.clientEmail && (
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{d.clientEmail}</span>
                        )}
                        <span style={{ marginLeft: 4, fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: t.bg, color: t.color }}>
                          {t.icon} {t.label}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.text }}>
                          {s.label}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>{fmtDate(d.createdAt)}</span>
                      </div>
                      <DemandeDetails d={d} />
                      {d.notesAdmin && (
                        <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #4338ca' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Note admin</div>
                          <div style={{ fontSize: '0.82rem', color: '#374151' }}>{d.notesAdmin}</div>
                        </div>
                      )}
                      {d.traiteLe && (
                        <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>
                          Traité le {fmtDate(d.traiteLe)}{d.traiteParNom ? ` par ${d.traiteParNom}` : ''}
                        </div>
                      )}
                    </div>
                    {isPending && (
                      <button onClick={() => setExpanded((e) => ({ ...e, [d.id]: !e[d.id] }))}
                        style={{ padding: '7px 16px', borderRadius: 8, border: `1.5px solid ${isExpanded ? '#e2e8f0' : '#4338ca'}`, background: isExpanded ? '#f8fafc' : '#f5f3ff', color: isExpanded ? '#6b7280' : '#4338ca', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                        {isExpanded ? 'Annuler' : '✏️ Traiter'}
                      </button>
                    )}
                  </div>
                </div>

                {isPending && isExpanded && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 20px', background: '#fafafa' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Note pour le client (optionnel)</label>
                    <textarea
                      rows={2}
                      value={notes[d.id] || ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                      placeholder="Message visible par le client..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 12 }}
                    />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => traiter(d.id, 'validée')} disabled={traiting[d.id]}
                        style={{ flex: 1, padding: '9px', background: traiting[d.id] ? '#e5e7eb' : 'linear-gradient(135deg,#15803d,#16a34a)', color: traiting[d.id] ? '#9ca3af' : '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: '0.85rem', cursor: traiting[d.id] ? 'default' : 'pointer' }}>
                        {traiting[d.id] ? '…' : '✅ Valider'}
                      </button>
                      <button onClick={() => traiter(d.id, 'refusée')} disabled={traiting[d.id]}
                        style={{ flex: 1, padding: '9px', background: traiting[d.id] ? '#e5e7eb' : 'linear-gradient(135deg,#b91c1c,#dc2626)', color: traiting[d.id] ? '#9ca3af' : '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: '0.85rem', cursor: traiting[d.id] ? 'default' : 'pointer' }}>
                        {traiting[d.id] ? '…' : '❌ Refuser'}
                      </button>
                    </div>
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
