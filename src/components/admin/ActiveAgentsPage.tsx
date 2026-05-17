import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';

interface Agent {
  clientId: number;
  clientNom: string;
  clientEmail: string;
  enabled: boolean;
  telegramLinked: boolean;
  confidenceThreshold: number;
  messageCount: number;
  lastActivity: string | null;
  inviteLink: string | null;
  activatedAt: string | null;
}

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const ConfidenceBadge = ({ value }: { value: number }) => {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const bg = pct >= 80 ? '#dcfce7' : pct >= 60 ? '#fef3c7' : '#fee2e2';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: bg, color }}>
      {pct}% confiance
    </span>
  );
};

const StatusBadge = ({ enabled, telegramLinked }: { enabled: boolean; telegramLinked: boolean }) => {
  if (!enabled) return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: '#f1f5f9', color: '#64748b' }}>⭕ Inactif</span>;
  if (!telegramLinked) return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e' }}>⏳ En attente</span>;
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12, background: '#dcfce7', color: '#16a34a' }}>🟢 Actif</span>;
};

export default function ActiveAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [editingThreshold, setEditingThreshold] = useState<Record<number, string>>({});
  const [copiedLink, setCopiedLink] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [generatingInvite, setGeneratingInvite] = useState<number | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/ai-assistant/agents');
      setAgents(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const toggleAgent = async (agent: Agent) => {
    if (saving !== null) return;
    setSaving(agent.clientId);
    try {
      await api.put(`/api/ai-assistant/config/${agent.clientId}`, {
        enabled: !agent.enabled,
        confidenceThreshold: agent.confidenceThreshold,
      });
      setAgents(prev => prev.map(a => a.clientId === agent.clientId ? { ...a, enabled: !a.enabled } : a));
    } finally {
      setSaving(null);
    }
  };

  const saveThreshold = async (agent: Agent) => {
    const raw = editingThreshold[agent.clientId];
    if (!raw) return;
    const val = Math.min(1, Math.max(0, parseFloat(raw) / 100));
    if (isNaN(val)) return;
    setSaving(agent.clientId);
    try {
      await api.put(`/api/ai-assistant/config/${agent.clientId}`, {
        enabled: agent.enabled,
        confidenceThreshold: val,
      });
      setAgents(prev => prev.map(a => a.clientId === agent.clientId ? { ...a, confidenceThreshold: val } : a));
      setEditingThreshold(prev => { const n = { ...prev }; delete n[agent.clientId]; return n; });
    } finally {
      setSaving(null);
    }
  };

  const copyLink = (agent: Agent) => {
    if (!agent.inviteLink) return;
    navigator.clipboard.writeText(agent.inviteLink);
    setCopiedLink(agent.clientId);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const generateNewInvite = async (agent: Agent) => {
    setGeneratingInvite(agent.clientId);
    try {
      const res = await api.post(`/api/ai-assistant/config/${agent.clientId}/invite`);
      setAgents(prev => prev.map(a => a.clientId === agent.clientId ? { ...a, inviteLink: res.data.inviteLink, telegramLinked: false } : a));
    } finally {
      setGeneratingInvite(null);
    }
  };

  const filtered = agents.filter(a => {
    if (filter === 'active') return a.enabled && a.telegramLinked;
    if (filter === 'pending') return a.enabled && !a.telegramLinked;
    if (filter === 'inactive') return !a.enabled;
    return true;
  });

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.enabled && a.telegramLinked).length,
    pending: agents.filter(a => a.enabled && !a.telegramLinked).length,
    inactive: agents.filter(a => !a.enabled).length,
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>🤖 Agents IA actifs</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Gérez les agents Telegram IA par client — activation, seuil de confiance, lien d'invitation</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: stats.total, color: '#6366f1', bg: '#eef2ff', icon: '📋' },
          { label: 'Actifs', value: stats.active, color: '#16a34a', bg: '#dcfce7', icon: '🟢' },
          { label: 'En attente', value: stats.pending, color: '#f59e0b', bg: '#fef3c7', icon: '⏳' },
          { label: 'Inactifs', value: stats.inactive, color: '#94a3b8', bg: '#f1f5f9', icon: '⭕' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['all', 'Tous'], ['active', 'Actifs'], ['pending', 'En attente'], ['inactive', 'Inactifs']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600,
              background: filter === key ? '#6366f1' : '#f1f5f9',
              color: filter === key ? '#fff' : '#64748b',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
        <button onClick={fetchAgents} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 20, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, color: '#6366f1', fontWeight: 600, cursor: 'pointer' }}>
          🔄 Actualiser
        </button>
      </div>

      {/* Agents table */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#64748b', padding: 48, fontSize: 14 }}>Chargement…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 48, fontSize: 14 }}>Aucun agent trouvé</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(agent => {
            const isEditingThreshold = agent.clientId in editingThreshold;
            const isSaving = saving === agent.clientId;
            return (
              <div
                key={agent.clientId}
                style={{
                  background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
                  padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12,
                  opacity: isSaving ? 0.7 : 1, transition: 'opacity 0.15s',
                }}
              >
                {/* Row 1: identity + status + toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    🤖
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{agent.clientNom}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{agent.clientEmail}</div>
                  </div>
                  <StatusBadge enabled={agent.enabled} telegramLinked={agent.telegramLinked} />
                  <ConfidenceBadge value={agent.confidenceThreshold} />

                  {/* Toggle */}
                  <button
                    onClick={() => toggleAgent(agent)}
                    disabled={isSaving}
                    style={{
                      position: 'relative', width: 44, height: 24, borderRadius: 12,
                      background: agent.enabled ? '#6366f1' : '#e2e8f0',
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

                {/* Row 2: stats + confidence threshold editor */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    💬 <strong>{agent.messageCount}</strong> messages
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    🕐 Dernière activité : <strong>{fmtDate(agent.lastActivity)}</strong>
                  </div>

                  {/* Confidence threshold editor */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Seuil :</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={isEditingThreshold ? editingThreshold[agent.clientId] : Math.round(agent.confidenceThreshold * 100)}
                      onChange={e => setEditingThreshold(prev => ({ ...prev, [agent.clientId]: e.target.value }))}
                      style={{ width: 56, border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: 12, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                    {isEditingThreshold && (
                      <button
                        onClick={() => saveThreshold(agent)}
                        disabled={isSaving}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                      >
                        ✓ Sauver
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 3: Telegram invite link */}
                {agent.enabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 10, flexWrap: 'wrap' }}>
                    {agent.telegramLinked ? (
                      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✅ Client lié à Telegram</span>
                    ) : agent.inviteLink ? (
                      <>
                        <span style={{ fontSize: 12, color: '#64748b' }}>Lien d'invitation Telegram :</span>
                        <code style={{ fontSize: 11, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 8px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                          {agent.inviteLink}
                        </code>
                        <button
                          onClick={() => copyLink(agent)}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: copiedLink === agent.clientId ? '#dcfce7' : '#fff', color: copiedLink === agent.clientId ? '#16a34a' : '#374151', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
                        >
                          {copiedLink === agent.clientId ? '✅ Copié' : '📋 Copier'}
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>Aucun lien généré</span>
                    )}
                    <button
                      onClick={() => generateNewInvite(agent)}
                      disabled={generatingInvite === agent.clientId}
                      style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#6366f1', cursor: 'pointer', fontWeight: 600, marginLeft: 'auto', flexShrink: 0 }}
                    >
                      {generatingInvite === agent.clientId ? 'Génération…' : '🔗 Nouveau lien'}
                    </button>
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
