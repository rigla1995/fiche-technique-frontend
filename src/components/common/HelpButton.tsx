import { useNavigate } from 'react-router-dom';

interface Props {
  /** id de la section du manuel (voir SECTIONS dans GuidePage), ex: 'fiches-techniques' */
  section: string;
  /** infobulle au survol */
  tip?: string;
  size?: number;
  /** 'subtle' (clair, sur fond blanc) | 'solid' (sur fond foncé/héros) */
  variant?: 'subtle' | 'solid';
}

/**
 * Petit bouton « ? » d'aide contextuelle : ouvre le manuel d'utilisation
 * directement à la bonne section (/client/guide#<section>).
 */
export default function HelpButton({ section, tip = 'En savoir plus', size = 18, variant = 'subtle' }: Props) {
  const navigate = useNavigate();
  const solid = variant === 'solid';
  return (
    <button
      type="button"
      title={tip}
      aria-label={tip}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); navigate(`/client/guide#${section}`); }}
      style={{
        width: size, height: size, minWidth: size, borderRadius: '50%', padding: 0,
        border: solid ? '1px solid rgba(255,255,255,0.45)' : '1px solid #c7d2fe',
        background: solid ? 'rgba(255,255,255,0.18)' : '#eef2ff',
        color: solid ? '#fff' : '#4f46e5',
        fontSize: Math.round(size * 0.62), fontWeight: 800, lineHeight: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0, verticalAlign: 'middle',
        transition: 'transform 0.12s ease, background 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.18)'; e.currentTarget.style.background = solid ? 'rgba(255,255,255,0.3)' : '#e0e7ff'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = solid ? 'rgba(255,255,255,0.18)' : '#eef2ff'; }}
    >
      ?
    </button>
  );
}
