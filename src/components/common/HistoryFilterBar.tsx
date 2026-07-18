import { useId, isValidElement, cloneElement } from 'react';
import type { ReactNode, CSSProperties, InputHTMLAttributes, SelectHTMLAttributes, ReactElement } from 'react';

// ── Barre de filtres partagée des pages d'historique (appro / pertes / transferts /
//    inventaires, espaces activité & labo). Accent paramétré (bleu activité / violet labo).
//    Structure : en-tête « Filtres » · grille de champs neutres · pied d'actions hiérarchisé.

const LABEL_STYLE: CSSProperties = {
  fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
  color: 'var(--text-muted)', display: 'block', marginBottom: 5,
};

// Champ de contrôle neutre ; l'accent au focus/hover est géré par la classe .hist-ctrl (index.css).
export const filterControlStyle: CSSProperties = {
  height: 36, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', fontSize: '0.84rem', padding: '0 10px', width: '100%', boxSizing: 'border-box', fontWeight: 500,
};

export function FilterField({ label, children, span }: { label: ReactNode; children: ReactNode; span?: boolean }) {
  // Associe le label au champ (htmlFor/id) pour l'accessibilité, sans envelopper le contrôle
  // (le TypeApproFilter contient déjà des <label> internes → pas de <label> imbriqué).
  const autoId = useId();
  let control = children;
  let forId: string | undefined;
  if (isValidElement(children)) {
    const existing = (children.props as { id?: string }).id;
    forId = existing ?? autoId;
    if (!existing) control = cloneElement(children as ReactElement<{ id?: string }>, { id: autoId });
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...(span ? { gridColumn: '1 / -1' } : null) }}>
      <label htmlFor={forId} style={LABEL_STYLE}>{label}</label>
      {control}
    </div>
  );
}

export function FilterInput({ style, className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`hist-ctrl${className ? ' ' + className : ''}`} style={{ ...filterControlStyle, ...style }} />;
}

export function FilterSelect({ style, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={`hist-ctrl${className ? ' ' + className : ''}`} style={{ ...filterControlStyle, cursor: 'pointer', ...style }} />;
}

const XlsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <rect width="24" height="24" rx="3" fill="#217346" />
    <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37" />
    <path d="M14 2V8H20L14 2Z" fill="#107C41" />
    <text x="7" y="18" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">XLS</text>
  </svg>
);

interface HistoryFilterBarProps {
  accent: string;             // couleur d'accent de l'espace (bleu activité / violet labo)
  accentDark?: string;        // variante foncée pour textes/contours
  title?: string;             // défaut « Filtres »
  subtitle?: ReactNode;       // hint à droite de l'en-tête (ex. nb de résultats)
  children: ReactNode;        // les <FilterField> de la page
  onSearch?: () => void;      // si absent → mode « filtres en direct » (pas de bouton Rechercher)
  searching?: boolean;
  searchDisabled?: boolean;   // désactiver sans afficher « Chargement… » (ex. aucun labo sélectionné)
  searchLabel?: string;       // défaut « Rechercher »
  onReset?: () => void;
  showReset?: boolean;        // afficher le bouton réinitialiser (défaut true si onReset)
  onExportExcel?: () => void;
  excelLabel?: string;        // défaut « Exporter XLS »
  excelDisabled?: boolean;
  actions?: ReactNode;        // boutons additionnels dans le pied à droite (ex. « + Nouveau »)
  /** Variante compacte (écrans admin, panneaux étroits) : pas d'en-tête ni de
      pied — champs et actions sur une même rangée, chrome allégé. */
  compact?: boolean;
}

export default function HistoryFilterBar({
  accent, accentDark, title = 'Filtres', subtitle, children,
  onSearch, searching, searchDisabled, searchLabel = 'Rechercher',
  onReset, showReset = true,
  onExportExcel, excelLabel = 'Exporter XLS', excelDisabled,
  actions, compact = false,
}: HistoryFilterBarProps) {
  const dark = accentDark || accent;
  const hasFooter = !!((onReset && showReset) || onSearch || onExportExcel || actions);
  const outline = (disabled?: boolean): CSSProperties => ({
    height: 36, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '0 14px',
    fontSize: '0.82rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', background: 'var(--surface)',
    border: `1px solid ${disabled ? 'var(--border)' : accent}`, color: disabled ? 'var(--text-muted)' : dark,
    opacity: disabled ? 0.6 : 1, transition: 'all 0.12s',
  });

  if (compact) {
    // Rangée unique : champs (grille serrée) + actions/hint alignés à droite —
    // proportionné aux panneaux étroits et aux pages admin à 2 contrôles.
    return (
      <div className="hist-filter" style={{ ['--hist-accent']: accent, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 14, padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' } as CSSProperties}>
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
          {children}
        </div>
        {(subtitle != null || hasFooter) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', paddingBottom: 3 }}>
            {subtitle != null && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{subtitle}</span>}
            {onReset && showReset && (
              <button onClick={onReset} title="Réinitialiser les filtres"
                style={{ height: 30, display: 'inline-flex', alignItems: 'center', borderRadius: 8, padding: '0 10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                ✕
              </button>
            )}
            {onSearch && (
              <button onClick={onSearch} disabled={searching || searchDisabled}
                style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '0 12px', fontSize: '0.78rem', fontWeight: 700, cursor: (searching || searchDisabled) ? 'not-allowed' : 'pointer', background: accent, border: 'none', color: '#fff', opacity: (searching || searchDisabled) ? 0.7 : 1 }}>
                🔍 {searching ? '…' : searchLabel}
              </button>
            )}
            {onExportExcel && (
              <button onClick={onExportExcel} disabled={excelDisabled} style={{ ...outline(excelDisabled), height: 30, padding: '0 10px', fontSize: '0.78rem' }}>
                <XlsIcon /> {excelLabel}
              </button>
            )}
            {actions}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="hist-filter" style={{ ['--hist-accent']: accent, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' } as CSSProperties}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700, color: dark }}>
          <span style={{ width: 3, height: 14, borderRadius: 2, background: accent, display: 'inline-block' }} />
          {title}
        </span>
        {subtitle != null && <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
      </div>
      {/* Champs */}
      <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, alignItems: 'end' }}>
        {children}
      </div>
      {/* Actions (masqué si rien à afficher — mode filtres en direct sans reset) */}
      {hasFooter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg)', flexWrap: 'wrap' }}>
          {onReset && showReset && (
            <button onClick={onReset} style={{ height: 36, display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 8, padding: '0 12px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              ✕ Réinitialiser
            </button>
          )}
          <div style={{ flex: 1 }} />
          {onSearch && (
            <button onClick={onSearch} disabled={searching || searchDisabled}
              style={{ height: 36, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '0 18px', fontSize: '0.83rem', fontWeight: 700, cursor: (searching || searchDisabled) ? 'not-allowed' : 'pointer', background: accent, border: 'none', color: '#fff', opacity: (searching || searchDisabled) ? 0.7 : 1 }}>
              🔍 {searching ? 'Chargement…' : searchLabel}
            </button>
          )}
          {onExportExcel && (
            <button onClick={onExportExcel} disabled={excelDisabled} style={outline(excelDisabled)}>
              <XlsIcon /> {excelLabel}
            </button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

// ── Filtre « statut » segmenté (pills), pour aligner les écrans admin sur le même style.
export interface SegmentedOption { value: string; label: string; count?: number; color?: string; }
export function FilterSegmented({ options, value, onChange, accent = 'var(--primary)' }: {
  options: SegmentedOption[]; value: string; onChange: (v: string) => void; accent?: string;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = value === o.value;
        const c = o.color || accent;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 20,
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
              border: `1px solid ${on ? c : 'var(--border)'}`, background: on ? c : 'var(--surface)', color: on ? '#fff' : 'var(--text-muted)',
            }}>
            {o.label}
            {o.count != null && (
              <span style={{ fontSize: '0.68rem', fontWeight: 800, borderRadius: 10, padding: '1px 6px', background: on ? 'rgba(255,255,255,0.25)' : 'var(--bg)', color: on ? '#fff' : 'var(--text-muted)' }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
