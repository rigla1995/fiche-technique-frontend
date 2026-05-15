import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';
import type { SupportDemande } from '../../types';
import { useNotifications } from '../../context/NotificationContext';
import { generateAvenantPdf } from '../../utils/contractPdf';

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

interface SupplPricing {
  prixActiviteSup: number;
  prixLaboSup: number;
  prixGerantSup: number;
  currentMensuel: number;
  nbActivites: number;
  nbLabos: number;
  nbGerants: number;
}

interface CatItem { id: number; name: string }
interface UniteItem { id: number; name: string }
interface DomaineItem { id: number; nom: string }

// ── Details popup ─────────────────────────────────────────────────────────────
function DetailsPopup({
  demande,
  onClose,
  onAction,
}: {
  demande: SupportDemande;
  onClose: () => void;
  onAction: (id: number, statut: 'validée' | 'refusée', extra?: Record<string, unknown>) => Promise<void>;
}) {
  const isPending = demande.statut === 'en_attente';
  const canValidate = isPending && (demande.type === 'supplement' || demande.type === 'ingredient_manquant');
  const s = STATUT_INFO[demande.statut] || STATUT_INFO.en_attente;
  const t = TYPE_INFO[demande.type] || { label: demande.type, icon: '📝', color: '#374151', bg: '#f3f4f6' };

  // Supplement pricing
  const [pricing, setPricing] = useState<SupplPricing | null>(null);
  // Avenant PDF (generated client-side from pricing)
  const [avenantPdfBase64, setAvenantPdfBase64] = useState<string | null>(null);
  // Editable ingredient fields
  const [ingNom, setIngNom] = useState(demande.nomIngredient || '');
  const [ingCatNom, setIngCatNom] = useState(demande.categorieNom || '');
  const [ingUniteNom, setIngUniteNom] = useState(demande.uniteNom || '');
  const [ingDomaineId, setIngDomaineId] = useState(demande.domaineId ? String(demande.domaineId) : '');
  const [domaines, setDomaines] = useState<DomaineItem[]>([]);
  const [categories, setCategories] = useState<CatItem[]>([]);
  const [unites, setUnites] = useState<UniteItem[]>([]);
  // Notes admin
  const [notesAdmin, setNotesAdmin] = useState(demande.notesAdmin || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (demande.type === 'supplement') {
      api.get(`/api/abonnements/client/${demande.clientId}/supplement-pricing`)
        .then(({ data }) => setPricing(data)).catch(() => {});
    }
    if (demande.type === 'ingredient_manquant') {
      api.get('/api/domaines').then(({ data }) => setDomaines(data)).catch(() => {});
      api.get('/api/categories').then(({ data }) => setCategories(data)).catch(() => {});
      api.get('/api/unites?all=true').then(({ data }) => setUnites(data)).catch(() => {});
    }
  }, [demande.clientId, demande.type]);

  // Generate avenant PDF client-side once pricing is loaded
  useEffect(() => {
    if (!pricing) return;
    const nbAAdded = demande.nbActivitesSupp || 0;
    const nbLAdded = demande.nbLabosSupp     || 0;
    const nbGAdded = demande.nbGerantsSupp   || 0;
    const delta = nbAAdded * (pricing.prixActiviteSup || 0)
                + nbLAdded * (pricing.prixLaboSup     || 0)
                + nbGAdded * (pricing.prixGerantSup   || 0);
    const base64 = generateAvenantPdf({
      clientNom:       demande.clientNom   || 'Client',
      clientEmail:     demande.clientEmail || '',
      nbActivitesAdded: nbAAdded,
      nbLabosAdded:     nbLAdded,
      nbGerantsAdded:   nbGAdded,
      nbActivites: (pricing.nbActivites || 1) + nbAAdded,
      nbLabos:     (pricing.nbLabos     || 0) + nbLAdded,
      nbGerants:   (pricing.nbGerants   || 0) + nbGAdded,
      ancienMensuel:   pricing.currentMensuel || 0,
      nouveauMensuel:  (pricing.currentMensuel || 0) + delta,
      appName: 'Fiche Technique',
      dateAvenant: new Date().toISOString(),
    });
    setAvenantPdfBase64(base64);
  }, [pricing, demande]);

  const handleAction = async (statut: 'validée' | 'refusée') => {
    setSaving(true);
    setError('');
    try {
      const extra: Record<string, unknown> = {};
      if (demande.type === 'ingredient_manquant') {
        extra.nomIngredient = ingNom.trim();
        extra.categorieNom = ingCatNom.trim();
        extra.uniteNom = ingUniteNom.trim();
        if (ingDomaineId) extra.domaineId = Number(ingDomaineId);
      }
      await onAction(demande.id, statut, { ...extra, notesAdmin: notesAdmin.trim() || null });
      onClose();
    } catch {
      setError('Erreur lors de la mise à jour.');
    }
    setSaving(false);
  };

  const pricingDelta = pricing
    ? (demande.nbActivitesSupp || 0) * pricing.prixActiviteSup
      + (demande.nbLabosSupp || 0) * pricing.prixLaboSup
      + (demande.nbGerantsSupp || 0) * pricing.prixGerantSup
    : null;
  const newTotal = pricing && pricingDelta !== null ? pricing.currentMensuel + pricingDelta : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #1e40af 100%)', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.4rem' }}>{t.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>{t.label}</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{fmtDate(demande.createdAt)}</div>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: s.bg, color: s.text }}>{s.label}</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontSize: '1rem', cursor: 'pointer', padding: '4px 8px', marginLeft: 4 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Bloc info client */}
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Client</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.83rem' }}>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Nom : </span><span style={{ fontWeight: 700, color: '#0f172a' }}>{demande.clientNom || '—'}</span></div>
              <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Email : </span><span style={{ color: '#1e40af' }}>{demande.clientEmail || '—'}</span></div>
              <div style={{ gridColumn: '1/-1' }}>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>Créé par : </span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{demande.createdByNom || demande.clientNom || '—'}</span>
                {demande.createdBy != null && demande.createdBy !== demande.clientId && (
                  <span style={{ marginLeft: 6, fontSize: '0.72rem', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, padding: '1px 7px', fontWeight: 700 }}>gérant</span>
                )}
              </div>
            </div>
          </div>

          {/* Bloc détails */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Détails de la demande
            </div>
            <div style={{ padding: '16px' }}>

              {/* Supplement */}
              {demande.type === 'supplement' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {pricing && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', fontSize: '0.82rem' }}>
                      <div style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: 6 }}>Abonnement actuel</div>
                      <div style={{ color: '#1e40af' }}>
                        {pricing.nbActivites} activité{pricing.nbActivites !== 1 ? 's' : ''}
                        {pricing.nbLabos > 0 ? ` · ${pricing.nbLabos} labo${pricing.nbLabos !== 1 ? 's' : ''}` : ''}
                        {pricing.nbGerants > 0 ? ` · ${pricing.nbGerants} gérant${pricing.nbGerants !== 1 ? 's' : ''}` : ''}
                        <span style={{ fontWeight: 700, marginLeft: 8 }}>{pricing.currentMensuel} DT/mois</span>
                      </div>
                    </div>
                  )}
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 700, color: '#166534', marginBottom: 6 }}>Ajout demandé</div>
                    {[
                      demande.nbActivitesSupp && `+${demande.nbActivitesSupp} activité${(demande.nbActivitesSupp || 0) > 1 ? 's' : ''}`,
                      demande.nbLabosSupp && `+${demande.nbLabosSupp} labo${(demande.nbLabosSupp || 0) > 1 ? 's' : ''}`,
                      demande.nbGerantsSupp && `+${demande.nbGerantsSupp} gérant${(demande.nbGerantsSupp || 0) > 1 ? 's' : ''}`,
                    ].filter(Boolean).map((part, i) => <div key={i} style={{ color: '#15803d', fontWeight: 600 }}>{part}</div>)}
                  </div>
                  {newTotal !== null && pricingDelta !== null && (
                    <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #ddd6fe', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 700, color: '#6d28d9' }}>Nouveau total mensuel</div>
                        <div style={{ color: '#7c3aed', fontSize: '0.75rem', marginTop: 2 }}>+{pricingDelta.toFixed(0)} DT/mois</div>
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#4c1d95' }}>{newTotal.toFixed(0)} DT<span style={{ fontSize: '0.75rem', fontWeight: 500 }}>/mois</span></div>
                    </div>
                  )}
                  {/* Avenant PDF download */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                    <span style={{ fontSize: '1rem' }}>📄</span>
                    <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 600, flex: 1 }}>Contrat avenant</span>
                    {avenantPdfBase64 ? (
                      <button onClick={() => { const a = document.createElement('a'); a.href = `data:application/pdf;base64,${avenantPdfBase64}`; a.download = `avenant-${(demande.clientNom || String(demande.clientId)).replace(/\s+/g, '-').toLowerCase()}.pdf`; a.click(); }}
                        style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4338ca', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '5px 14px', cursor: 'pointer' }}>
                        ⬇ Télécharger
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Génération…</span>
                    )}
                  </div>
                  {isPending && (
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
                      ✉️ Ce contrat avenant sera envoyé par email au client lors de la validation.
                    </div>
                  )}
                </div>
              )}

              {/* Besoin d'aide */}
              {demande.type === 'aide' && (
                <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 14px', fontSize: '0.85rem', color: '#374151', fontStyle: 'italic', lineHeight: 1.6 }}>
                  {demande.description || '—'}
                </div>
              )}

              {/* Ingrédient manquant */}
              {demande.type === 'ingredient_manquant' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={lbl}>Nom de l'ingrédient {isPending && '*'}</label>
                    {isPending
                      ? <input value={ingNom} onChange={(e) => setIngNom(e.target.value)} style={inp} />
                      : <div style={readOnly}>{ingNom || '—'}</div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={lbl}>Catégorie</label>
                      {isPending
                        ? <input value={ingCatNom} onChange={(e) => setIngCatNom(e.target.value)} list="cats-list" style={inp} placeholder="Ex. Légumes & Salades" />
                        : <div style={readOnly}>{ingCatNom || '—'}</div>}
                      {isPending && (
                        <datalist id="cats-list">
                          {categories.map((c) => <option key={c.id} value={c.name} />)}
                        </datalist>
                      )}
                    </div>
                    <div>
                      <label style={lbl}>Unité</label>
                      {isPending
                        ? <input value={ingUniteNom} onChange={(e) => setIngUniteNom(e.target.value)} list="units-list" style={inp} placeholder="Ex. kg" />
                        : <div style={readOnly}>{ingUniteNom || '—'}</div>}
                      {isPending && (
                        <datalist id="units-list">
                          {unites.map((u) => <option key={u.id} value={u.name} />)}
                        </datalist>
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Domaine</label>
                    {isPending
                      ? (
                        <select value={ingDomaineId} onChange={(e) => setIngDomaineId(e.target.value)} style={inp}>
                          <option value="">— Sélectionner —</option>
                          {domaines.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
                        </select>
                      )
                      : <div style={readOnly}>{demande.domaineNom || '—'}</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes admin */}
          <div>
            <label style={lbl}>Note / Réponse admin</label>
            {isPending
              ? <textarea value={notesAdmin} onChange={(e) => setNotesAdmin(e.target.value)} rows={3} placeholder="Message optionnel au client…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
              : demande.notesAdmin
                ? <div style={{ ...readOnly, fontStyle: 'italic' }}>{demande.notesAdmin}</div>
                : <div style={{ ...readOnly, color: '#94a3b8' }}>—</div>}
          </div>

          {demande.traiteLe && (
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>
              Traité le {fmtDate(demande.traiteLe)}{demande.traiteParNom ? ` par ${demande.traiteParNom}` : ''}
            </div>
          )}

          {error && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#dc2626' }}>{error}</div>}
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '10px 20px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
            Fermer
          </button>
          {canValidate && (
            <>
              <button onClick={() => handleAction('refusée')} disabled={saving}
                style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : '#fee2e2', color: saving ? '#9ca3af' : '#991b1b', fontWeight: 700, fontSize: '0.85rem', cursor: saving ? 'default' : 'pointer' }}>
                {saving ? '…' : '✕ Refuser'}
              </button>
              <button onClick={() => handleAction('validée')} disabled={saving}
                style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg, #15803d, #16a34a)', color: saving ? '#9ca3af' : '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: saving ? 'default' : 'pointer', boxShadow: saving ? 'none' : '0 4px 12px rgba(22,163,74,0.35)' }}>
                {saving ? '…' : '✓ Valider'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { fontSize: '0.68rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#fff' };
const readOnly: React.CSSProperties = { padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#374151', background: '#f8fafc' };

// ── Avatar helper ─────────────────────────────────────────────────────────────
const PALETTE = ['#dbeafe:#1d4ed8','#dcfce7:#166534','#fce7f3:#9d174d','#ede9fe:#6d28d9','#fff7ed:#c2410c','#e0f2fe:#075985'];
function getAvatar(nom: string, selected: boolean) {
  const initials = nom.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const p = PALETTE[(nom.charCodeAt(0) || 0) % PALETTE.length].split(':');
  return { initials, bg: selected ? '#e0e7ff' : p[0], color: selected ? '#4f46e5' : p[1] };
}

const PAGE_SIZE = 5;

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminSupportPage() {
  const { clearAllFromDB } = useNotifications();
  const [demandes, setDemandes] = useState<SupportDemande[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('en_attente');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);
  const [detailDemande, setDetailDemande] = useState<SupportDemande | null>(null);

  const fetchDemandes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/abonnements/admin/support');
      setDemandes(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDemandes(); clearAllFromDB(); }, [fetchDemandes, clearAllFromDB]);
  useEffect(() => { setPage(1); }, [selectedClientId, filterStatut, filterType]);

  const handleAction = async (id: number, statut: 'validée' | 'refusée', extra: Record<string, unknown> = {}) => {
    await api.put(`/api/abonnements/admin/support/${id}`, { statut, ...extra });
    setDemandes(prev => prev.map(d => d.id === id ? { ...d, statut, notesAdmin: (extra.notesAdmin as string) || d.notesAdmin, traiteLe: new Date().toISOString() } : d));
  };

  const clients = useMemo(() => {
    const map = new Map<number, { id: number; nom: string; email: string; total: number; pending: number }>();
    for (const d of demandes) {
      if (!map.has(d.clientId)) map.set(d.clientId, { id: d.clientId, nom: d.clientNom || `Client #${d.clientId}`, email: d.clientEmail || '', total: 0, pending: 0 });
      const c = map.get(d.clientId)!;
      c.total++;
      if (d.statut === 'en_attente') c.pending++;
    }
    return Array.from(map.values()).sort((a, b) => b.pending - a.pending || a.nom.localeCompare(b.nom, 'fr'));
  }, [demandes]);

  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c => c.nom.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [clients, search]);

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;

  const clientDemandes = useMemo(() => {
    if (selectedClientId === null) return [];
    return demandes.filter(d => {
      if (d.clientId !== selectedClientId) return false;
      if (filterStatut && d.statut !== filterStatut) return false;
      if (filterType && d.type !== filterType) return false;
      return true;
    });
  }, [demandes, selectedClientId, filterStatut, filterType]);

  const totalPages = Math.max(1, Math.ceil(clientDemandes.length / PAGE_SIZE));
  const pagedDemandes = clientDemandes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pendingTotal = demandes.filter(d => d.statut === 'en_attente').length;

  return (
    <>
      {detailDemande && (
        <DetailsPopup
          demande={detailDemande}
          onClose={() => setDetailDemande(null)}
          onAction={handleAction}
        />
      )}

      <div style={{ display: 'flex', gap: 20, minHeight: 600 }}>
        {/* ── Left: client list ─────────────────────────────────────── */}
        <div style={{ flex: '0 0 360px', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 24px rgba(30,27,75,0.10)' }}>
          <div style={{ padding: '18px 18px 14px', background: 'linear-gradient(135deg,#18181b 0%,#27272a 55%,#52525b 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💬</div>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#fff' }}>Demandes clients</h2>
                <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{clients.length} clients · {demandes.length} demandes</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 12 }}>
              {[
                { label: 'Total', value: demandes.length, color: 'rgba(255,255,255,0.9)', bg: 'rgba(255,255,255,0.1)' },
                { label: 'En attente', value: pendingTotal, color: '#fde047', bg: 'rgba(253,224,71,0.15)' },
                { label: 'Traitées', value: demandes.length - pendingTotal, color: '#86efac', bg: 'rgba(134,239,172,0.15)' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '7px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: s.color, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, pointerEvents: 'none' }}>🔍</span>
              <input placeholder="Rechercher un client…" value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', fontSize: 12, outline: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Chargement...</div>
            ) : filteredClients.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#9ca3af' }}>Aucun client</div>
              </div>
            ) : filteredClients.map((c) => {
              const isSel = selectedClientId === c.id;
              const av = getAvatar(c.nom, isSel);
              return (
                <div key={c.id} onClick={() => setSelectedClientId(isSel ? null : c.id)}
                  style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', borderLeft: `3px solid ${isSel ? '#1e40af' : 'transparent'}`, background: isSel ? '#eff6ff' : 'transparent' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: isSel ? '#dbeafe' : av.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: isSel ? '#1e40af' : av.color, flexShrink: 0 }}>{av.initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#e0f2fe', color: '#0369a1' }}>{c.total} dem.</span>
                      {c.pending > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>⏳ {c.pending}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: detail ─────────────────────────────────────────── */}
        <div style={{ flex: 1, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}>
          {!selectedClient ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, gap: 12 }}>
              <div style={{ fontSize: 48 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>Sélectionner un client</div>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Cliquez sur un client pour voir ses demandes</div>
            </div>
          ) : (
            <div style={{ padding: 24 }}>
              {/* Hero */}
              {(() => {
                const av = getAvatar(selectedClient.nom, false);
                return (
                  <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 55%,#1e40af 100%)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 13, background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{av.initials}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{selectedClient.nom}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{selectedClient.email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { label: 'Demandes', value: String(selectedClient.total) },
                        { label: 'En attente', value: String(selectedClient.pending) },
                      ].map(s => (
                        <div key={s.label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{s.value}</div>
                          <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Filters */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Statut</span>
                {([['', 'Tous'], ['en_attente', '⏳ En attente'], ['validée', '✅ Validée'], ['refusée', '❌ Refusée']] as [string, string][]).map(([v, label]) => {
                  const active = filterStatut === v;
                  const color = v === 'en_attente' ? '#d97706' : v === 'validée' ? '#16a34a' : v === 'refusée' ? '#dc2626' : '#64748b';
                  return (
                    <button key={v} onClick={() => setFilterStatut(v)}
                      style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? color : '#e2e8f0'}`, background: active ? color + '18' : '#fff', color: active ? color : '#94a3b8' }}>
                      {label}
                    </button>
                  );
                })}
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: 8, marginRight: 2 }}>Type</span>
                {([['', 'Tous'], ['ingredient_manquant', ''], ['supplement', ''], ['aide', '']] as [string, string][]).map(([v]) => {
                  const info = v ? TYPE_INFO[v] : null;
                  const active = filterType === v;
                  return (
                    <button key={v} onClick={() => setFilterType(v)}
                      style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${active ? (info?.color || '#64748b') : '#e2e8f0'}`, background: active ? (info?.bg || '#f1f5f9') : '#fff', color: active ? (info?.color || '#64748b') : '#94a3b8' }}>
                      {info ? `${info.icon} ${info.label}` : 'Tous'}
                    </button>
                  );
                })}
                {(filterStatut || filterType) && (
                  <button onClick={() => { setFilterStatut(''); setFilterType(''); }}
                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✕</button>
                )}
              </div>

              {/* Demande cards */}
              {clientDemandes.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>Aucune demande trouvée</div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pagedDemandes.map((d) => {
                      const s = STATUT_INFO[d.statut] || STATUT_INFO.en_attente;
                      const t = TYPE_INFO[d.type] || { label: d.type, icon: '📝', color: '#374151', bg: '#f3f4f6' };
                      return (
                        <div key={d.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', borderLeft: `4px solid ${s.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: t.bg, color: t.color }}>{t.icon} {t.label}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.text }}>{s.label}</span>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>{fmtDate(d.createdAt)}</span>
                            {d.createdByNom && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: d.createdBy !== d.clientId ? '#166534' : '#374151', background: d.createdBy !== d.clientId ? '#f0fdf4' : '#f8fafc', border: `1px solid ${d.createdBy !== d.clientId ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 6, padding: '2px 8px' }}>
                                {d.createdByNom}{d.createdBy !== d.clientId ? ' (gérant)' : ''}
                              </span>
                            )}
                            <button onClick={() => setDetailDemande(d)}
                              style={{ padding: '4px 14px', borderRadius: 8, border: '1.5px solid #1e40af', background: '#eff6ff', color: '#1e40af', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                              Détails
                            </button>
                          </div>
                          {d.notesAdmin && (
                            <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', borderLeft: '3px solid #4338ca' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>Note admin</div>
                              <div style={{ fontSize: '0.82rem', color: '#374151' }}>{d.notesAdmin}</div>
                            </div>
                          )}
                          {d.traiteLe && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#94a3b8' }}>Traité le {fmtDate(d.traiteLe)}{d.traiteParNom ? ` par ${d.traiteParNom}` : ''}</div>}
                        </div>
                      );
                    })}
                  </div>
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
                      <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === 1 ? '#f8fafc' : '#fff', color: page === 1 ? '#cbd5e1' : '#374151', fontWeight: 600, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer' }}>← Précédent</button>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Page {page} / {totalPages}</span>
                      <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: page === totalPages ? '#f8fafc' : '#fff', color: page === totalPages ? '#cbd5e1' : '#374151', fontWeight: 600, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer' }}>Suivant →</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
