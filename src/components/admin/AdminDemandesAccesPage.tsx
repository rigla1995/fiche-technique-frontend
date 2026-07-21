import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';
import AddClientModal from './AddClientModal';
import Pagination from '../common/Pagination';
import { useConfirm } from '../common/ConfirmDialog';

// ── Types (contrat backend /admin/site/demandes-acces) ───────────────────────

type DemandeStatut = 'nouvelle' | 'contactee' | 'convertie' | 'refusee';

interface DemandeAcces {
  id: number;
  nom: string;
  email: string;
  telephone: string | null;
  ville: string | null;
  typeActivite: string | null;
  nbPointsVente: number | null;
  aLabo: boolean | null;
  interetB2b: boolean | null;
  message: string | null;
  configCalculateur: Record<string, unknown> | string | null;
  statut: DemandeStatut;
  convertedClientId: number | null;
  notesAdmin: string | null;
  traiteParNom: string | null;
  traiteLe: string | null;
  createdAt: string;
}

interface DemandeUpdateBody {
  statut?: DemandeStatut;
  notesAdmin?: string;
  convertedClientId?: number;
}

// ── Constantes d'affichage ───────────────────────────────────────────────────

const STATUT_INFO: Record<DemandeStatut, { label: string; icon: string; color: string; bg: string; text: string; border: string }> = {
  nouvelle:  { label: 'Nouvelles',  icon: '⏳', color: '#d97706', bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  contactee: { label: 'Contactées', icon: '📞', color: '#2563eb', bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  convertie: { label: 'Converties', icon: '✅', color: '#16a34a', bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  refusee:   { label: 'Refusées',   icon: '✕',  color: '#dc2626', bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
};

const STATUT_SINGULIER: Record<DemandeStatut, string> = {
  nouvelle: 'Nouvelle', contactee: 'Contactée', convertie: 'Convertie', refusee: 'Refusée',
};

const TYPE_ACTIVITE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe_bar: 'Café / bar',
  patisserie_boulangerie: 'Pâtisserie / boulangerie',
  boucherie: 'Boucherie',
  traiteur: 'Traiteur',
  labo_depot: 'Labo / dépôt',
  autre: 'Autre',
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const MESSAGE_TRUNCATE = 140;
const PER_PAGE = 9;

// Config calculateur : peut arriver en objet ou en JSON string — on normalise.
function configEntries(cfg: DemandeAcces['configCalculateur']): [string, unknown][] {
  let val: unknown = cfg;
  if (typeof val === 'string') {
    try { val = JSON.parse(val); } catch { return []; }
  }
  if (!val || typeof val !== 'object' || Array.isArray(val)) return [];
  return Object.entries(val as Record<string, unknown>);
}

function fmtConfigVal(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function prettifyKey(k: string): string {
  const s = k.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Pastille d'info neutre (téléphone, ville, points de vente…)
function InfoPill({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '0.76rem', color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span>{icon}</span>{children}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDemandesAccesPage() {
  const { prompt } = useConfirm();
  const [demandes, setDemandes] = useState<DemandeAcces[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filtre par défaut « Toutes » ('') : la liste s'ouvre sur l'ensemble des
  // demandes (la notification « demande reçue » y mène aussi, cf. Header).
  const [filterStatut, setFilterStatut] = useState<DemandeStatut | ''>('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [convertTarget, setConvertTarget] = useState<DemandeAcces | null>(null);

  // withSpinner : seul le chargement initial affiche le spinner plein-page ;
  // les rafraîchissements post-action sont silencieux (pas de flicker).
  const fetchDemandes = useCallback(async (withSpinner: boolean) => {
    if (withSpinner) setLoading(true);
    try {
      const { data } = await api.get('/admin/site/demandes-acces');
      setDemandes(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError('Impossible de charger les demandes d\'accès — réessayez.');
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDemandes(true); }, [fetchDemandes]);
  useEffect(() => { setPage(1); }, [filterStatut]);

  const counts = useMemo(() => {
    const c: Record<DemandeStatut, number> = { nouvelle: 0, contactee: 0, convertie: 0, refusee: 0 };
    for (const d of demandes) if (c[d.statut] !== undefined) c[d.statut]++;
    return c;
  }, [demandes]);

  const applyUpdate = async (id: number, body: DemandeUpdateBody) => {
    setActioningId(id);
    setError(null);
    try {
      await api.put(`/admin/site/demandes-acces/${id}`, body);
      await fetchDemandes(false);
    } catch {
      setError('La mise à jour de la demande a échoué — réessayez.');
    } finally {
      setActioningId(null);
    }
  };

  const handleContactee = (d: DemandeAcces) => applyUpdate(d.id, { statut: 'contactee' });

  const handleRefuse = async (d: DemandeAcces) => {
    const note = await prompt({
      title: 'Refuser la demande',
      message: `La demande d'accès de ${d.nom} sera marquée comme refusée.`,
      inputLabel: 'Note interne (optionnelle)',
      placeholder: 'Raison du refus…',
      multiline: true,
      tone: 'danger',
      icon: '✕',
      confirmLabel: 'Refuser',
    });
    if (note === null) return; // annulé
    const body: DemandeUpdateBody = { statut: 'refusee' };
    if (note.trim()) body.notesAdmin = note.trim();
    await applyUpdate(d.id, body);
  };

  // Conversion : le wizard AddClientModal est pré-rempli avec la demande ;
  // à la création, on marque la demande convertie (avec l'id client si connu).
  const handleConverted = async (demande: DemandeAcces, createdClientId?: number) => {
    const body: DemandeUpdateBody = { statut: 'convertie' };
    if (typeof createdClientId === 'number') body.convertedClientId = createdClientId;
    await applyUpdate(demande.id, body);
  };

  const toggleExpanded = (id: number) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const filtered = useMemo(
    () => (filterStatut ? demandes.filter((d) => d.statut === filterStatut) : demandes),
    [demandes, filterStatut],
  );
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const paged = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const filterPills: { value: DemandeStatut | ''; label: string; count: number; color: string }[] = [
    { value: '', label: 'Toutes', count: demandes.length, color: '#0369a1' },
    ...(Object.keys(STATUT_INFO) as DemandeStatut[]).map((s) => ({
      value: s as DemandeStatut | '',
      label: `${STATUT_INFO[s].icon} ${STATUT_INFO[s].label}`,
      count: counts[s],
      color: STATUT_INFO[s].color,
    })),
  ];

  return (
    <>
      {convertTarget && (
        <AddClientModal
          initialValues={{
            nom: convertTarget.nom,
            email: convertTarget.email,
            telephone: convertTarget.telephone ?? undefined,
          }}
          onClose={() => setConvertTarget(null)}
          onCreated={(createdClientId) => {
            const d = convertTarget;
            setConvertTarget(null);
            handleConverted(d, createdClientId);
          }}
        />
      )}

      <div className="page">
        {/* ── Hero : compteurs ─────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)',
          borderRadius: 18, padding: '20px 24px', marginBottom: 18,
          boxShadow: '0 8px 32px rgba(3,105,161,0.25)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '8px 11px', fontSize: '1.3rem' }}>🌐</div>
          <div style={{ minWidth: 180 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1 }}>Demandes d'accès</h1>
            <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.78)' }}>
              Prospects reçus via le site vitrine LabFlow
            </p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { label: 'Total', value: demandes.length, color: 'rgba(255,255,255,0.95)' },
              { label: 'Nouvelles', value: counts.nouvelle, color: '#fde047' },
              { label: 'Contactées', value: counts.contactee, color: '#93c5fd' },
              { label: 'Converties', value: counts.convertie, color: '#86efac' },
              { label: 'Refusées', value: counts.refusee, color: '#fca5a5' },
            ].map((s) => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', textAlign: 'center', minWidth: 72 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Filtres statut (pills) ───────────────────────────────────── */}
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '12px 16px',
          marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          boxShadow: '0 2px 12px rgba(15,23,42,0.05)',
        }}>
          {filterPills.map(({ value, label, count, color }) => {
            const active = filterStatut === value;
            return (
              <button
                key={value || 'toutes'}
                onClick={() => setFilterStatut(value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 22,
                  border: `1.5px solid ${active ? color : '#e5e7eb'}`,
                  background: active ? color : '#fff',
                  color: active ? '#fff' : '#475569',
                  fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {label}
                <span style={{
                  fontSize: '0.7rem', fontWeight: 800, padding: '1px 7px', borderRadius: 10,
                  background: active ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                  color: active ? '#fff' : '#64748b',
                }}>{count}</span>
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="loading-text">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 56, background: '#f8fafc', borderRadius: 16, border: '1px dashed #e2e8f0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Aucune demande</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
              {demandes.length === 0
                ? 'Les demandes d\'accès envoyées depuis le site vitrine apparaîtront ici.'
                : 'Aucune demande pour ce statut — changez de filtre.'}
            </div>
          </div>
        ) : (
          <>
            {/* ── Grille de cards ─────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {paged.map((d) => {
                const s = STATUT_INFO[d.statut] || STATUT_INFO.nouvelle;
                const typeLabel = d.typeActivite ? (TYPE_ACTIVITE_LABELS[d.typeActivite] || d.typeActivite) : null;
                const isExpanded = expanded.has(d.id);
                const needsTruncate = (d.message || '').length > MESSAGE_TRUNCATE;
                const shownMessage = d.message
                  ? (needsTruncate && !isExpanded ? `${d.message.slice(0, MESSAGE_TRUNCATE).trimEnd()}…` : d.message)
                  : null;
                const cfg = configEntries(d.configCalculateur);
                const busy = actioningId === d.id;
                const canContact = d.statut === 'nouvelle';
                const canConvert = d.statut === 'nouvelle' || d.statut === 'contactee';
                const canRefuse = d.statut === 'nouvelle' || d.statut === 'contactee';
                return (
                  <div key={d.id} style={{
                    background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
                    boxShadow: '0 2px 12px rgba(15,23,42,0.06)', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                  }}>
                    {/* Liseré de statut */}
                    <div style={{ height: 4, background: s.border }} />

                    {/* Identité + statut */}
                    <div style={{ padding: '14px 18px 10px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.nom}>{d.nom}</div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.email}>{d.email}</div>
                      </div>
                      <span style={{ background: s.bg, color: s.text, fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {s.icon} {STATUT_SINGULIER[d.statut]}
                      </span>
                    </div>

                    {/* Pastilles d'infos */}
                    <div style={{ padding: '0 18px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {typeLabel && (
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#4338ca', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '3px 9px' }}>
                          🏷️ {typeLabel}
                        </span>
                      )}
                      {d.telephone && <InfoPill icon="📱">{d.telephone}</InfoPill>}
                      {d.ville && <InfoPill icon="📍">{d.ville}</InfoPill>}
                      {d.nbPointsVente != null && (
                        <InfoPill icon="🏪">{d.nbPointsVente} point{d.nbPointsVente > 1 ? 's' : ''} de vente</InfoPill>
                      )}
                      {d.aLabo != null && <InfoPill icon="🏭">Labo : {d.aLabo ? 'oui' : 'non'}</InfoPill>}
                      {d.interetB2b != null && <InfoPill icon="🤝">B2B : {d.interetB2b ? 'oui' : 'non'}</InfoPill>}
                    </div>

                    {/* Message du prospect */}
                    {shownMessage && (
                      <div style={{ margin: '0 18px 10px', background: '#f8fafc', border: '1px solid #eef1f5', borderRadius: 10, padding: '9px 12px' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Message</div>
                        <div style={{ fontSize: '0.82rem', color: '#374151', lineHeight: 1.55, whiteSpace: 'pre-line', fontStyle: 'italic' }}>{shownMessage}</div>
                        {needsTruncate && (
                          <button onClick={() => toggleExpanded(d.id)}
                            style={{ marginTop: 5, background: 'none', border: 'none', padding: 0, color: '#0369a1', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                            {isExpanded ? '▲ Réduire' : '▼ Voir tout'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Estimation du calculateur */}
                    {cfg.length > 0 && (
                      <div style={{ margin: '0 18px 10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '9px 12px' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>🧮 Estimation du prospect</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {cfg.map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.76rem' }}>
                              <span style={{ color: '#0c4a6e' }}>{prettifyKey(k)}</span>
                              <span style={{ fontWeight: 700, color: '#075985', textAlign: 'right' }}>{fmtConfigVal(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes admin */}
                    {d.notesAdmin && (
                      <div style={{ margin: '0 18px 10px', background: '#f8fafc', border: '1px solid #e5e7eb', borderLeft: '3px solid #4338ca', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Note admin</div>
                        <div style={{ fontSize: '0.8rem', color: '#374151' }}>{d.notesAdmin}</div>
                      </div>
                    )}

                    {/* Dates / traitement */}
                    <div style={{ padding: '0 18px 10px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <span>Reçue le {fmtDate(d.createdAt)}</span>
                      {d.traiteLe && (
                        <span style={{ marginLeft: 'auto' }}>
                          Traitée le {fmtDate(d.traiteLe)}{d.traiteParNom ? ` par ${d.traiteParNom}` : ''}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    {(canContact || canConvert || canRefuse) && (
                      <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {canContact && (
                          <button disabled={busy} onClick={() => handleContactee(d)}
                            style={{ flex: 1, minWidth: 110, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                            {busy ? '…' : '📞 Marquer contactée'}
                          </button>
                        )}
                        {canConvert && (
                          <button disabled={busy} onClick={() => setConvertTarget(d)}
                            style={{ flex: 1, minWidth: 120, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                            ➕ Convertir en client
                          </button>
                        )}
                        {canRefuse && (
                          <button disabled={busy} onClick={() => handleRefuse(d)}
                            style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 12px', fontSize: '0.76rem', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                            ✕ Refuser
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {filtered.length > PER_PAGE && (
              <div style={{ marginTop: 16, background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <Pagination total={filtered.length} page={safePage} perPage={PER_PAGE} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
