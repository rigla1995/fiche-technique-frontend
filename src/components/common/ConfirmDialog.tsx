import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Modal de confirmation maison remplaçant window.confirm / window.prompt dans
// toute l'application. Monté UNE fois via <ConfirmProvider> (App.tsx), consommé
// par le hook useConfirm() :
//
//   const { confirm, prompt } = useConfirm();
//   if (!(await confirm({ title: 'Supprimer ?', tone: 'danger' }))) return;
//   const motif = await prompt({ title: 'Refuser', inputLabel: 'Motif (optionnel)' });
//   if (motif === null) return; // annulé — mêmes sémantiques que window.prompt

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;      // texte (les \n sont respectés) ou JSX
  details?: string[];       // liste à puces sous le message
  confirmLabel?: string;    // défaut « Confirmer »
  cancelLabel?: string;     // défaut « Annuler »
  tone?: 'danger' | 'primary'; // danger = rouge (suppressions), primary = violet
  icon?: string;            // emoji ; défaut 🗑️ (danger) / ❓ (primary)
}

export interface PromptOptions extends ConfirmOptions {
  inputLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm doit être utilisé sous <ConfirmProvider>');
  return ctx;
}

interface Pending {
  opts: PromptOptions;
  withInput: boolean;
  resolve: (v: boolean | string | null) => void;
}

const TONES = {
  danger: { color: '#b91c1c', bg: '#fee2e2', gradient: 'linear-gradient(135deg, #b91c1c, #ef4444)', icon: '🗑️' },
  primary: { color: '#4c1d95', bg: '#ede9fe', gradient: 'linear-gradient(135deg, #4c1d95, #6d28d9)', icon: '❓' },
} as const;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState('');
  const pendingRef = useRef<Pending | null>(null);

  const open = useCallback((opts: PromptOptions, withInput: boolean) => {
    // Une seule demande à la fois : une demande concurrente annule la précédente
    pendingRef.current?.resolve(withInput ? null : false);
    return new Promise<boolean | string | null>((resolve) => {
      const p: Pending = { opts, withInput, resolve };
      pendingRef.current = p;
      setValue(opts.defaultValue ?? '');
      setPending(p);
    });
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => open(opts, false) as Promise<boolean>, [open]);
  const prompt = useCallback((opts: PromptOptions) => open(opts, true) as Promise<string | null>, [open]);

  const settle = useCallback((ok: boolean) => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    setPending(null);
    if (p.withInput) p.resolve(ok ? (document.getElementById('confirm-dialog-input') as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '' : null);
    else p.resolve(ok);
  }, []);

  // Échap = annuler (au niveau document : fonctionne même sans focus dans le modal)
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); settle(false); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [pending, settle]);

  const t = TONES[pending?.opts.tone === 'primary' ? 'primary' : 'danger'];

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      {pending && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) settle(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <style>{`@keyframes cdlg-pop { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: none; } }`}</style>
          <div role="dialog" aria-modal="true" aria-label={pending.opts.title}
            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, padding: '22px 24px', boxShadow: '0 24px 60px rgba(15,23,42,0.35)', animation: 'cdlg-pop 0.16s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem', flexShrink: 0 }}>
                {pending.opts.icon || t.icon}
              </span>
              <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>{pending.opts.title}</h2>
            </div>
            {pending.opts.message != null && pending.opts.message !== '' && (
              <div style={{ fontSize: '0.87rem', color: '#475569', whiteSpace: 'pre-line', lineHeight: 1.55, marginBottom: pending.opts.details?.length ? 8 : 14 }}>
                {pending.opts.message}
              </div>
            )}
            {(pending.opts.details?.length ?? 0) > 0 && (
              <ul style={{ margin: '0 0 14px', padding: '10px 14px 10px 30px', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pending.opts.details!.map((d, i) => (
                  <li key={i} style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>{d}</li>
                ))}
              </ul>
            )}
            {pending.withInput && (
              <div style={{ marginBottom: 14 }}>
                {pending.opts.inputLabel && (
                  <label htmlFor="confirm-dialog-input" style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                    {pending.opts.inputLabel}
                  </label>
                )}
                {pending.opts.multiline ? (
                  <textarea id="confirm-dialog-input" autoFocus rows={3} value={value} onChange={(e) => setValue(e.target.value)}
                    placeholder={pending.opts.placeholder}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.86rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                ) : (
                  <input id="confirm-dialog-input" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                    placeholder={pending.opts.placeholder}
                    onKeyDown={(e) => { if (e.key === 'Enter') settle(true); }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.86rem', fontFamily: 'inherit', outline: 'none' }} />
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => settle(false)}
                style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit' }}>
                {pending.opts.cancelLabel || 'Annuler'}
              </button>
              <button type="button" autoFocus={!pending.withInput} onClick={() => settle(true)}
                style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: t.gradient, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit', boxShadow: `0 4px 14px ${t.color}44` }}>
                {pending.opts.confirmLabel || 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
