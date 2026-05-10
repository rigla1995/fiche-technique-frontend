import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { SupportDemande } from '../../types';

const TYPE_LABELS: Record<string, string> = {
  ingredient_manquant: '🧂 Ingrédient manquant',
  supplement:          '➕ Supplément',
  aide:                '💬 Aide',
};

const STATUT_COLORS: Record<string, { bg: string; color: string }> = {
  en_attente: { bg: '#fef9c3', color: '#854d0e' },
  validée:    { bg: '#dcfce7', color: '#166534' },
  refusée:    { bg: '#fee2e2', color: '#991b1b' },
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

function DemandeDetails({ d }: { d: SupportDemande }) {
  if (d.type === 'ingredient_manquant') {
    return (
      <div style={{ fontSize: 13, color: '#374151', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {d.domaineNom && <span><span style={{ color: '#9ca3af' }}>Domaine:</span> {d.domaineNom}</span>}
        {d.categorieNom && <span><span style={{ color: '#9ca3af' }}>Catégorie:</span> {d.categorieNom}</span>}
        {d.uniteNom && <span><span style={{ color: '#9ca3af' }}>Unité:</span> {d.uniteNom}</span>}
        {d.nomIngredient && <span style={{ fontWeight: 700 }}>"{d.nomIngredient}"</span>}
      </div>
    );
  }
  if (d.type === 'supplement') {
    const parts: string[] = [];
    if (d.nbActivitesSupp) parts.push(`+${d.nbActivitesSupp} activité(s)`);
    if (d.nbLabosSupp) parts.push(`+${d.nbLabosSupp} labo(s)`);
    if (d.nbGerantsSupp) parts.push(`+${d.nbGerantsSupp} gérant(s)`);
    return (
      <div style={{ fontSize: 13, color: '#374151', marginTop: 6 }}>
        {parts.join(' · ')}
      </div>
    );
  }
  if (d.description) {
    return (
      <div style={{ fontSize: 13, color: '#374151', marginTop: 6, fontStyle: 'italic' }}>
        "{d.description}"
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

  useEffect(() => { fetchDemandes(); }, [filterStatut, filterType]);

  const fetchDemandes = async () => {
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
  };

  const traiter = async (id: number, statut: 'validée' | 'refusée') => {
    setTraiting((t) => ({ ...t, [id]: true }));
    try {
      const res = await api.put(`/api/abonnements/admin/support/${id}`, {
        statut,
        notesAdmin: notes[id] || undefined,
      });
      setDemandes((prev) => prev.map((d) => (d.id === id ? res.data : d)));
    } catch (e: unknown) {
      alert((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur');
    } finally {
      setTraiting((t) => ({ ...t, [id]: false }));
    }
  };

  const toggleExpand = (id: number) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Demandes de support</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 0 }}>
            Traitez les demandes d'ingrédients, suppléments et aide des clients.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}
          >
            <option value="">Tous types</option>
            <option value="ingredient_manquant">Ingrédient manquant</option>
            <option value="supplement">Supplément</option>
            <option value="aide">Aide</option>
          </select>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff' }}
          >
            <option value="">Tous statuts</option>
            <option value="en_attente">En attente</option>
            <option value="validée">Validées</option>
            <option value="refusée">Refusées</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 60 }}>Chargement…</div>
      ) : demandes.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 60 }}>
          Aucune demande {filterStatut === 'en_attente' ? 'en attente' : ''}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {demandes.map((d) => {
            const sc = STATUT_COLORS[d.statut] || { bg: '#f3f4f6', color: '#374151' };
            const isPending = d.statut === 'en_attente';
            const isExpanded = expanded[d.id] || false;
            return (
              <div key={d.id} style={{
                background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
                padding: '16px 20px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                        {d.clientNom || `Client #${d.clientId}`}
                      </span>
                      {d.clientEmail && (
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{d.clientEmail}</span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#eef2ff', color: '#3730a3' }}>
                        {TYPE_LABELS[d.type] || d.type}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                        {d.statut}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDate(d.createdAt)}</span>
                    </div>
                    <DemandeDetails d={d} />
                    {d.notesAdmin && (
                      <div style={{ marginTop: 8, fontSize: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', color: '#374151' }}>
                        <strong>Note admin :</strong> {d.notesAdmin}
                      </div>
                    )}
                    {d.traiteLe && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#9ca3af' }}>
                        Traité le {fmtDate(d.traiteLe)}{d.traiteParNom ? ` par ${d.traiteParNom}` : ''}
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => toggleExpand(d.id)}
                        style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, cursor: 'pointer', color: '#374151', fontWeight: 600 }}
                      >
                        {isExpanded ? 'Annuler' : '✏️ Traiter'}
                      </button>
                    </div>
                  )}
                </div>

                {isPending && isExpanded && (
                  <div style={{ marginTop: 14, borderTop: '1px solid #f3f4f6', paddingTop: 14 }}>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12, color: '#374151', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                        Note (optionnel)
                      </label>
                      <textarea
                        rows={2}
                        value={notes[d.id] || ''}
                        onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                        placeholder="Message pour le client..."
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => traiter(d.id, 'validée')}
                        disabled={traiting[d.id]}
                        style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: traiting[d.id] ? 0.6 : 1 }}
                      >
                        {traiting[d.id] ? '…' : '✅ Valider'}
                      </button>
                      <button
                        onClick={() => traiter(d.id, 'refusée')}
                        disabled={traiting[d.id]}
                        style={{ padding: '8px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: traiting[d.id] ? 0.6 : 1 }}
                      >
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
