import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../../api/client';
import { useConfirm } from '../common/ConfirmDialog';
import Pagination from '../common/Pagination';

const PER_PAGE = 12;

// ── Types (contrat backend /admin/site/partenaires) ──────────────────────────

interface PartenaireSite {
  clientId: number;
  nom: string;
  email: string;
  logoSite: string | null; // data-URI
  sitePartenaireActif: boolean;
}

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/svg+xml';
// Au-delà de cette taille (data-URI encodé), le logo est redimensionné via canvas.
const MAX_LOGO_CHARS = 250 * 1024;
const RESIZE_MAX_WIDTH = 400;

// Fond damier léger pour visualiser la transparence des logos.
const damierStyle: React.CSSProperties = {
  background: 'repeating-conic-gradient(#eef2f7 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px',
};

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

// Redimensionne un data-URI image (max 400px de large) et l'exporte en PNG.
function resizeDataUri(dataUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) { resolve(dataUri); return; }
      const scale = Math.min(1, RESIZE_MAX_WIDTH / w);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas indisponible')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = dataUri;
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPartenairesSitePage() {
  const { confirm } = useConfirm();
  const [partenaires, setPartenaires] = useState<PartenaireSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Un seul input file caché pour toute la grille ; la cible est mémorisée en ref
  // (pas de re-render nécessaire entre le clic et le choix du fichier).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<number | null>(null);

  const fetchPartenaires = useCallback(async (withSpinner: boolean) => {
    if (withSpinner) setLoading(true);
    try {
      const { data } = await api.get('/admin/site/partenaires');
      setPartenaires(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError('Impossible de charger les partenaires — réessayez.');
    } finally {
      if (withSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPartenaires(true); }, [fetchPartenaires]);

  const updatePartenaire = async (clientId: number, body: { logoSite?: string | null; actif?: boolean }) => {
    setBusyId(clientId);
    setError(null);
    try {
      await api.put(`/admin/site/partenaires/${clientId}`, body);
      await fetchPartenaires(false);
    } catch {
      setError('La mise à jour du partenaire a échoué — réessayez.');
    } finally {
      setBusyId(null);
    }
  };

  const triggerUpload = (clientId: number) => {
    uploadTargetRef.current = clientId;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de re-sélectionner le même fichier
    const clientId = uploadTargetRef.current;
    uploadTargetRef.current = null;
    if (!file || clientId == null) return;
    setBusyId(clientId);
    setError(null);
    try {
      let dataUri = await readFileAsDataUri(file);
      if (dataUri.length > MAX_LOGO_CHARS) {
        try { dataUri = await resizeDataUri(dataUri); } catch { /* on tente l'envoi de l'original */ }
      }
      await api.put(`/admin/site/partenaires/${clientId}`, { logoSite: dataUri });
      await fetchPartenaires(false);
    } catch {
      setError('L\'upload du logo a échoué — vérifiez le fichier et réessayez.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveLogo = async (p: PartenaireSite) => {
    const ok = await confirm({
      title: 'Retirer le logo ?',
      message: `Le logo de ${p.nom} sera supprimé${p.sitePartenaireActif ? ' et il n\'apparaîtra plus sur le site vitrine' : ''}.`,
      tone: 'danger',
      confirmLabel: 'Retirer',
    });
    if (!ok) return;
    await updatePartenaire(p.clientId, { logoSite: null });
  };

  const handleToggle = (p: PartenaireSite) => updatePartenaire(p.clientId, { actif: !p.sitePartenaireActif });

  const actifs = useMemo(
    () => partenaires.filter((p) => p.sitePartenaireActif && p.logoSite),
    [partenaires],
  );

  const filtered = useMemo(() => {
    if (!search) return partenaires;
    const q = search.toLowerCase();
    return partenaires.filter((p) => p.nom.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  }, [partenaires, search]);

  // Pagination client-side (même schéma que les demandes d'accès / le manuel).
  useEffect(() => { setPage(1); }, [search]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PER_PAGE)));
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [filtered, safePage],
  );

  return (
    <div className="page">
      {/* Input file caché partagé */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChosen}
        style={{ display: 'none' }}
      />

      {/* ── Hero explicatif ─────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 55%, #0ea5e9 100%)',
        borderRadius: 18, padding: '20px 24px', marginBottom: 18,
        boxShadow: '0 8px 32px rgba(3,105,161,0.25)',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '8px 11px', fontSize: '1.3rem' }}>🤝</div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1 }}>Partenaires du site</h1>
          <p style={{ margin: '5px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5, maxWidth: 620 }}>
            Les clients activés ci-dessous peuvent apparaître dans la section « Ils nous font confiance » du site — ajoutez un logo puis activez la visibilité.
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#86efac', lineHeight: 1 }}>{actifs.length}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>Visibles</div>
        </div>
      </div>

      {/* ── Bandeau d'aperçu : logos actuellement visibles ──────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '14px 18px', marginBottom: 18, boxShadow: '0 2px 12px rgba(15,23,42,0.05)' }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
          👁 Aperçu — « Ils nous font confiance »
        </div>
        {actifs.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: '#94a3b8', padding: '10px 0' }}>
            Aucun logo visible pour le moment — activez un partenaire ci-dessous pour le voir apparaître ici.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'center', padding: '4px 2px' }}>
            {actifs.map((p) => (
              <div key={p.clientId} title={p.nom}
                style={{ flexShrink: 0, border: '1px solid #eef1f5', borderRadius: 10, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', ...damierStyle }}>
                <img src={p.logoSite!} alt={p.nom} style={{ height: 40, maxWidth: 130, objectFit: 'contain', display: 'block' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Recherche ───────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '12px 16px',
        marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        boxShadow: '0 2px 12px rgba(15,23,42,0.05)',
      }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', opacity: 0.55 }}>🔍</span>
          <input
            type="text"
            placeholder="Rechercher un client — nom, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 36px 10px 38px',
              borderRadius: 24, border: '1.5px solid #e2e8f0', outline: 'none',
              fontSize: '0.85rem', color: '#0f172a', background: '#f8fafc',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 'none', background: '#e2e8f0', color: '#475569', borderRadius: '50%', width: 20, height: 20, fontSize: 11, cursor: 'pointer', lineHeight: 1 }}
            >✕</button>
          )}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {filtered.length} client{filtered.length !== 1 ? 's' : ''}
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
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🤝</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Aucun client trouvé</div>
          <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            {partenaires.length === 0 ? 'Les clients activés apparaîtront ici.' : 'Ajustez la recherche.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {paged.map((p) => {
            const busy = busyId === p.clientId;
            const hasLogo = !!p.logoSite;
            return (
              <div key={p.clientId} style={{
                background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
                boxShadow: '0 2px 12px rgba(15,23,42,0.06)', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}>
                {/* Liseré visibilité */}
                <div style={{ height: 4, background: p.sitePartenaireActif ? 'linear-gradient(90deg,#0d9488,#14b8a6)' : '#e5e7eb' }} />

                {/* Identité */}
                <div style={{ padding: '14px 18px 10px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nom}>{p.nom}</div>
                    <div style={{ fontSize: '0.76rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.email}>{p.email}</div>
                  </div>
                  {p.sitePartenaireActif ? (
                    <span style={{ background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>👁 Visible</span>
                  ) : (
                    <span style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>Masqué</span>
                  )}
                </div>

                {/* Aperçu du logo */}
                <div style={{ margin: '0 18px 12px', border: '1px solid #eef1f5', borderRadius: 12, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...damierStyle }}>
                  {hasLogo ? (
                    <img src={p.logoSite!} alt={`Logo ${p.nom}`} style={{ maxHeight: 64, maxWidth: '85%', objectFit: 'contain', display: 'block' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                      <div style={{ fontSize: '1.3rem', marginBottom: 2 }}>🖼️</div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600 }}>Aucun logo</div>
                    </div>
                  )}
                </div>

                {/* Toggle visibilité */}
                <div style={{ padding: '0 18px 12px' }}>
                  <button
                    onClick={() => handleToggle(p)}
                    disabled={!hasLogo || busy}
                    title={!hasLogo ? 'Ajoutez d\'abord un logo pour pouvoir activer la visibilité' : undefined}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      background: p.sitePartenaireActif ? '#f0fdfa' : '#f8fafc',
                      border: `1px solid ${p.sitePartenaireActif ? '#99f6e4' : '#e2e8f0'}`,
                      borderRadius: 10, padding: '8px 12px',
                      cursor: !hasLogo || busy ? 'default' : 'pointer',
                      opacity: !hasLogo ? 0.55 : busy ? 0.7 : 1,
                    }}
                  >
                    <span style={{ width: 34, height: 18, borderRadius: 10, background: p.sitePartenaireActif ? '#0d9488' : '#cbd5e1', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
                      <span style={{ position: 'absolute', top: 2, left: p.sitePartenaireActif ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: p.sitePartenaireActif ? '#0f766e' : '#64748b' }}>
                      Visible sur le site
                    </span>
                  </button>
                </div>

                {/* Actions logo */}
                <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    disabled={busy}
                    onClick={() => triggerUpload(p.clientId)}
                    style={{ flex: 1, minWidth: 120, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                  >
                    {busy ? '…' : hasLogo ? '🖼️ Remplacer le logo' : '🖼️ Ajouter un logo'}
                  </button>
                  {hasLogo && (
                    <button
                      disabled={busy}
                      onClick={() => handleRemoveLogo(p)}
                      style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 12px', fontSize: '0.76rem', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                    >
                      🗑 Retirer le logo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <Pagination total={filtered.length} page={safePage} perPage={PER_PAGE} onChange={setPage} />
      )}
    </div>
  );
}
