import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';

interface Agent {
  clientId: number;
  clientNom: string;
  clientEmail: string;
  reportEmail: string | null;
  enabled: boolean;
  telegramLinked: boolean;
  messengerLinked: boolean;
  messageCount: number;
  lastActivity: string | null;
  lastConfidence: number | null;
  avgConfidenceMonth: number | null;
  tokensMonth: number;
  tokensTotal: number;
  inviteLink: string | null;
  messengerInviteLink: string | null;
  activatedAt: string | null;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const confColor = (v: number | null) => {
  if (v == null) return { color: '#94a3b8', bg: '#f1f5f9' };
  const pct = v * 100;
  if (pct >= 80) return { color: '#16a34a', bg: '#dcfce7' };
  if (pct >= 60) return { color: '#f59e0b', bg: '#fef3c7' };
  return { color: '#ef4444', bg: '#fee2e2' };
};

const ConfBadge = ({ value, label }: { value: number | null; label: string }) => {
  const { color } = confColor(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 18, fontWeight: 800, color }}>
        {value != null ? `${Math.round(value * 100)}%` : '—'}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{label}</span>
      {value != null && (
        <div style={{ width: 40, height: 3, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: color }} />
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ enabled, telegramLinked, messengerLinked }: { enabled: boolean; telegramLinked: boolean; messengerLinked: boolean }) => {
  if (!enabled) return <span className="badge" style={{ background: '#f1f5f9', color: '#64748b' }}>⭕ Inactif</span>;
  const linked = telegramLinked || messengerLinked;
  if (!linked) return <span className="badge" style={{ background: '#fef3c7', color: '#92400e' }}>⏳ En attente</span>;
  return <span className="badge" style={{ background: '#dcfce7', color: '#16a34a' }}>🟢 Actif</span>;
};

export default function ActiveAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [generatingInvite, setGeneratingInvite] = useState<string | null>(null);
  const [messengerEmail, setMessengerEmail] = useState<Record<number, string>>({});

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get('/api/ai-assistant/agents');
      setAgents(res.data);
    } catch {
      setFetchError('Impossible de charger les agents. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const toggleAgent = async (agent: Agent) => {
    if (saving !== null) return;
    setSaving(agent.clientId);
    try {
      await api.put(`/api/ai-assistant/config/${agent.clientId}`, { enabled: !agent.enabled });
      setAgents(prev => prev.map(a => a.clientId === agent.clientId ? { ...a, enabled: !a.enabled } : a));
    } finally {
      setSaving(null);
    }
  };

  const copyLink = (key: string, link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const generateTelegramInvite = async (agent: Agent) => {
    const key = `tg-${agent.clientId}`;
    setGeneratingInvite(key);
    try {
      const res = await api.post(`/api/ai-assistant/config/${agent.clientId}/invite`);
      setAgents(prev => prev.map(a => a.clientId === agent.clientId ? { ...a, inviteLink: res.data.inviteLink, telegramLinked: false } : a));
    } finally {
      setGeneratingInvite(null);
    }
  };

  const generateMessengerInvite = async (agent: Agent) => {
    const key = `ms-${agent.clientId}`;
    setGeneratingInvite(key);
    try {
      const email = (messengerEmail[agent.clientId] ?? agent.reportEmail ?? agent.clientEmail ?? '').trim();
      const res = await api.post(`/api/ai-assistant/config/${agent.clientId}/messenger-invite`, { email });
      setAgents(prev => prev.map(a => a.clientId === agent.clientId
        ? { ...a, messengerInviteLink: res.data.messengerInviteLink, reportEmail: res.data.reportEmail ?? email, messengerLinked: false }
        : a));
    } finally {
      setGeneratingInvite(null);
    }
  };

  const filtered = agents.filter(a => {
    const linked = a.telegramLinked || a.messengerLinked;
    if (filter === 'active') return a.enabled && linked;
    if (filter === 'pending') return a.enabled && !linked;
    if (filter === 'inactive') return !a.enabled;
    return true;
  });

  const counts = {
    total: agents.length,
    active: agents.filter(a => a.enabled && (a.telegramLinked || a.messengerLinked)).length,
    pending: agents.filter(a => a.enabled && !a.telegramLinked && !a.messengerLinked).length,
    inactive: agents.filter(a => !a.enabled).length,
    tokensMonth: agents.reduce((s, a) => s + (a.tokensMonth || 0), 0),
  };

  return (
    <div className="page">
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #6366f1 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(49,46,129,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🤖</div>
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Agents IA actifs</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '4px 0 0' }}>
            Agents Telegram &amp; Messenger par client — activation, score de confiance, lien d'invitation
          </p>
        </div>
        <button onClick={fetchAgents} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          🔄 Actualiser
        </button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: counts.total, color: 'var(--primary)', icon: '📋' },
          { label: 'Actifs', value: counts.active, color: '#16a34a', icon: '🟢' },
          { label: 'En attente', value: counts.pending, color: '#f59e0b', icon: '⏳' },
          { label: 'Inactifs', value: counts.inactive, color: '#94a3b8', icon: '⭕' },
          { label: 'Tokens ce mois', value: counts.tokensMonth.toLocaleString('fr-FR'), color: counts.tokensMonth > 100000 ? '#ef4444' : '#6366f1', icon: '🔋' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: '1.3rem' }}>{s.icon}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['all', 'Tous'], ['active', 'Actifs'], ['pending', 'En attente'], ['inactive', 'Inactifs']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600,
              background: filter === key ? 'var(--primary)' : 'var(--bg-soft)',
              color: filter === key ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Agents list */}
      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : fetchError ? (
        <div className="empty-state" style={{ color: '#ef4444' }}>{fetchError}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">Aucun agent trouvé</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(agent => {
            const isSaving = saving === agent.clientId;
            return (
              <div
                key={agent.clientId}
                style={{
                  background: '#fff', borderRadius: 12, border: '1px solid var(--border)',
                  padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {/* Row 1: identity + status + toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    🤖
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{agent.clientNom}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agent.clientEmail}</div>
                  </div>

                  <StatusBadge enabled={agent.enabled} telegramLinked={agent.telegramLinked} messengerLinked={agent.messengerLinked} />

                  {/* Confidence scores */}
                  <div style={{ display: 'flex', gap: 20, padding: '8px 16px', background: 'var(--bg-soft)', borderRadius: 10 }}>
                    <ConfBadge value={agent.lastConfidence} label="Dernier message" />
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <ConfBadge value={agent.avgConfidenceMonth} label="Moy. ce mois" />
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={() => toggleAgent(agent)}
                    disabled={isSaving}
                    style={{
                      position: 'relative', width: 44, height: 24, borderRadius: 12,
                      background: agent.enabled ? 'var(--primary)' : '#e2e8f0',
                      border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer',
                      transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: agent.enabled ? 22 : 2,
                      width: 20, height: 20, borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
                    }} />
                  </button>
                </div>

                {/* Row 2: stats */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    💬 <strong style={{ color: 'var(--text)' }}>{agent.messageCount}</strong> messages
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span>🔋 Tokens ce mois : <strong style={{ color: agent.tokensMonth > 10000 ? '#f59e0b' : 'var(--text)' }}>{agent.tokensMonth.toLocaleString('fr-FR')}</strong></span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total : {agent.tokensTotal.toLocaleString('fr-FR')}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    🕐 Dernière activité : <strong style={{ color: 'var(--text)' }}>{fmtDate(agent.lastActivity)}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ✅ Activé le : <strong style={{ color: 'var(--text)' }}>{fmtDate(agent.activatedAt)}</strong>
                  </span>
                </div>

                {agent.enabled && (
                  <>
                    {/* Row 3: Telegram invite */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>✈️ Telegram</span>
                      {agent.telegramLinked ? (
                        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✅ Client lié</span>
                      ) : agent.inviteLink ? (
                        <>
                          <code style={{ fontSize: 11, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                            {agent.inviteLink}
                          </code>
                          <button
                            onClick={() => copyLink(`tg-${agent.clientId}`, agent.inviteLink!)}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: copiedLink === `tg-${agent.clientId}` ? '#dcfce7' : '#fff', color: copiedLink === `tg-${agent.clientId}` ? '#16a34a' : 'var(--text)', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
                          >
                            {copiedLink === `tg-${agent.clientId}` ? '✅ Copié' : '📋 Copier'}
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun lien</span>
                      )}
                      <button
                        onClick={() => generateTelegramInvite(agent)}
                        disabled={generatingInvite === `tg-${agent.clientId}`}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, marginLeft: 'auto', flexShrink: 0 }}
                      >
                        {generatingInvite === `tg-${agent.clientId}` ? 'Génération…' : '🔗 Nouveau lien'}
                      </button>
                    </div>

                    {/* Row 4: Messenger activation (email + invite) */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1877f2', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>💬 Messenger</span>
                        {agent.messengerLinked ? (
                          <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                            ✅ Client lié{agent.reportEmail ? ` · ${agent.reportEmail}` : ''}
                          </span>
                        ) : (
                          <>
                            <input
                              type="email"
                              value={messengerEmail[agent.clientId] ?? agent.reportEmail ?? agent.clientEmail ?? ''}
                              onChange={(e) => setMessengerEmail(prev => ({ ...prev, [agent.clientId]: e.target.value }))}
                              placeholder="email d'activation (Messenger)"
                              title="Email où envoyer le lien d'activation — par défaut l'email du client, modifiable (ex. Messenger personnel du propriétaire)"
                              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', flex: 1, minWidth: 180, maxWidth: 300 }}
                            />
                            <button
                              onClick={() => generateMessengerInvite(agent)}
                              disabled={generatingInvite === `ms-${agent.clientId}`}
                              style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1877f2', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}
                            >
                              {generatingInvite === `ms-${agent.clientId}` ? 'Envoi…' : '📨 Activer & envoyer'}
                            </button>
                          </>
                        )}
                      </div>
                      {!agent.messengerLinked && agent.messengerInviteLink && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <code style={{ fontSize: 11, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                            {agent.messengerInviteLink}
                          </code>
                          <button
                            onClick={() => copyLink(`ms-${agent.clientId}`, agent.messengerInviteLink!)}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: copiedLink === `ms-${agent.clientId}` ? '#dcfce7' : '#fff', color: copiedLink === `ms-${agent.clientId}` ? '#16a34a' : 'var(--text)', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
                          >
                            {copiedLink === `ms-${agent.clientId}` ? '✅ Copié' : '📋 Copier'}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
