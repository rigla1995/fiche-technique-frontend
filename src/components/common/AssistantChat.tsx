import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api/client';
import HelpButton from './HelpButton';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface OnboardingEtape { key: string; titre: string; fait: boolean; detail: string | null }
export interface OnboardingEtat { complet: boolean; etapes: OnboardingEtape[]; aFaire: string | null }

// Questions suggérées selon la première étape non finalisée de la mise en route
const QUESTIONS_PAR_ETAPE: Record<string, string[]> = {
  capacites: [
    'Comment créer mes activités ?',
    'Comment créer mon labo ?',
    'Quelle est la différence entre une activité et un labo ?',
  ],
  referentiel: [
    'Par quoi commencer pour mon référentiel ?',
    'À quoi servent les familles et les catégories ?',
    'Comment créer mes unités ?',
  ],
  articles: [
    'Comment ajouter mes articles ?',
    'Comment importer mes articles en masse ?',
    'Comment affecter les articles à mes activités et labos ?',
  ],
  fournisseurs: [
    'Comment ajouter mes fournisseurs ?',
    'Comment importer mes fournisseurs depuis Excel ?',
    'À quoi servent les affectations d\'un fournisseur ?',
  ],
  produits: [
    'Comment créer un produit et sa fiche technique ?',
    'C\'est quoi un produit valorisé ?',
    'Comment est calculé le coût de revient d\'une recette ?',
  ],
  saisie: [
    'Comment saisir mon premier approvisionnement ?',
    'Comment saisir une vente ?',
    'Comment mon stock est-il calculé ?',
  ],
  acheteurs: [
    'Comment remplir mon carnet d\'acheteurs ?',
    'Comment importer mes acheteurs depuis Excel ?',
    'Comment configurer mes tarifs acheteurs ?',
  ],
};

interface Props {
  /** État de mise en route (pilote la carte de progression et les suggestions) */
  etat?: OnboardingEtat | null;
  /** Recalcule l'état après chaque réponse du bot (disparition dynamique) */
  onEtatRefresh?: () => Promise<OnboardingEtat | null> | void;
  /** Fermeture du panneau (bouton AssistantWidget) */
  onClose?: () => void;
}

/**
 * Chat de l'assistant IA LabFlow — contenu du panneau flottant présent sur
 * toutes les interfaces client/gérant (AssistantWidget). Si l'assistant n'est
 * pas activé pour le compte, un message l'explique à la place du chat.
 * La conversation est persistée côté serveur (GET/DELETE /conversation).
 */
export default function AssistantChat({ etat, onEtatRefresh, onClose }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/ai-assistant/status');
      setEnabled(res.data.enabled);
      return res.data.enabled;
    } catch {
      setEnabled(false);
      return false;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get('/api/ai-assistant/conversation');
      setMessages(res.data.messages ?? []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    checkStatus().then((ok) => { if (ok) loadHistory(); else setLoadingHistory(false); });
  }, [checkStatus, loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError(null);
    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const res = await api.post('/api/ai-assistant/chat', { message: text });
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
      // La mise en route a pu avancer entre-temps : recalcul (le bot se retire tout seul)
      onEtatRefresh?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur de communication avec l\'IA';
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearHistory = async () => {
    if (clearing || messages.length === 0) return;
    setClearing(true);
    try {
      await api.delete('/api/ai-assistant/conversation');
      setMessages([]);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* En-tête */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'linear-gradient(135deg,#4f46e5,#8b5cf6)', color: '#fff' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🤖</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 7 }}>
            Assistant IA LabFlow <HelpButton section="assistant-ia" variant="solid" size={20} tip="Voir le guide" />
          </div>
          <div style={{ fontSize: 10.5, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Votre guide de mise en route, pas à pas</div>
        </div>
        {enabled === true && messages.length > 0 && (
          <button onClick={clearHistory} disabled={clearing} title="Effacer la conversation"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, width: 28, height: 28, cursor: clearing ? 'not-allowed' : 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            🗑️
          </button>
        )}
        <button onClick={onClose} title="Fermer"
          style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ✕
        </button>
      </div>

      {enabled === null || (enabled && loadingHistory) ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#64748b', fontSize: 14 }}>
          Chargement…
        </div>
      ) : !enabled ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 44 }}>🤖</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Assistant IA non activé</div>
          <div style={{ fontSize: 13, color: '#64748b', maxWidth: 300, lineHeight: 1.6 }}>
            L'assistant IA n'est pas encore activé pour votre compte : il pourra analyser vos données
            (stock, ventes, pertes…) et répondre à vos questions sur LabFlow.
            Contactez votre administrateur pour l'activer.
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 12px 8px' }}>
            {/* 🎉 Mise en route terminée pendant la session : le bot se retire */}
            {etat?.complet && (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>🎉</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#166534', marginBottom: 4 }}>Mise en route terminée !</div>
                <div style={{ fontSize: 12, color: '#15803d', lineHeight: 1.5 }}>
                  Votre configuration est complète — ce guide va se retirer. Vous retrouvez toutes les
                  procédures dans le 📖 Manuel d'utilisation (et les boutons « ? » de chaque page).
                </div>
              </div>
            )}

            {/* Carte de progression de la mise en route + questions de l'étape en cours */}
            {etat && !etat.complet && etat.etapes.length > 0 && (
              <div style={{ background: '#fbfaff', border: '1px solid #e0e7ff', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  🚀 Votre mise en route — {etat.etapes.filter((e) => e.fait).length}/{etat.etapes.length} étapes
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  {etat.etapes.map((e) => {
                    const enCours = e.key === etat.aFaire;
                    return (
                      <div key={e.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', opacity: e.fait ? 0.65 : 1 }}>
                        <span style={{ fontSize: 13, lineHeight: '18px', flexShrink: 0 }}>{e.fait ? '✅' : enCours ? '🔄' : '⬜'}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: enCours ? 800 : 600, color: enCours ? '#312e81' : '#334155', lineHeight: 1.35 }}>{e.titre}</div>
                          {e.detail && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{e.detail}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {etat.aFaire && QUESTIONS_PAR_ETAPE[etat.aFaire] && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e0e7ff' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6366f1', marginBottom: 6 }}>Questions utiles pour cette étape :</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {QUESTIONS_PAR_ETAPE[etat.aFaire].map((q) => (
                        <button key={q}
                          onClick={() => { setInput(q); inputRef.current?.focus(); }}
                          style={{ fontSize: 11.5, padding: '6px 11px', borderRadius: 20, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', cursor: 'pointer', fontWeight: 600, textAlign: 'left' }}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {messages.length === 0 && !sending && !etat && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: '#94a3b8', textAlign: 'center' }}>
                <div style={{ fontSize: 32 }}>💬</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>Commencez la conversation</div>
              </div>
            )}
            {messages.length === 0 && !sending && etat && !etat.complet && (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12.5, lineHeight: 1.6, padding: '4px 12px' }}>
                👋 Je suis votre guide de mise en route : posez-moi vos questions (ou cliquez sur une
                suggestion ci-dessus), je vous accompagne étape par étape.
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  gap: 10,
                  alignItems: 'flex-end',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: msg.role === 'user' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'linear-gradient(135deg,#f1f5f9,#e2e8f0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14,
                }}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div style={{
                  maxWidth: '82%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#f8fafc',
                  border: msg.role === 'assistant' ? '1px solid #e2e8f0' : 'none',
                  color: msg.role === 'user' ? '#fff' : '#0f172a',
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#f1f5f9,#e2e8f0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🤖</div>
                <div style={{ padding: '10px 16px', borderRadius: '16px 16px 16px 4px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', height: 16 }}>
                    {[0, 1, 2].map((i) => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={{ fontSize: 12, color: '#ef4444', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Saisie */}
          <div style={{ flexShrink: 0, borderTop: '1px solid #e2e8f0', background: '#fff', padding: '8px 12px 10px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                placeholder="Posez votre question…"
                rows={1}
                style={{
                  flex: 1, resize: 'none', border: '1px solid #e2e8f0', borderRadius: 12,
                  padding: '10px 14px', fontSize: 13, outline: 'none',
                  fontFamily: 'inherit', lineHeight: 1.5,
                  minHeight: 42, maxHeight: 120, overflowY: 'auto',
                  background: sending ? '#f8fafc' : '#fff',
                  color: '#0f172a',
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                }}
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                style={{
                  width: 42, height: 42, borderRadius: 12, border: 'none', flexShrink: 0,
                  background: !input.trim() || sending ? '#e2e8f0' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  color: !input.trim() || sending ? '#94a3b8' : '#fff',
                  cursor: !input.trim() || sending ? 'not-allowed' : 'pointer',
                  fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
              >
                ↑
              </button>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>
              L'assistant peut se tromper — vérifiez les chiffres importants · Données issues de votre compte LabFlow
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
