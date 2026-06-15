import { Link } from 'react-router-dom';

interface Props {
  section: string;
}

export default function GuideButton({ section }: Props) {
  return (
    <Link
      to={`/client/guide#${section}`}
      title="Voir le guide"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.20)',
        border: '1.5px solid rgba(255,255,255,0.5)',
        color: '#fff',
        fontWeight: 800,
        fontSize: '0.9rem',
        textDecoration: 'none',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.35)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.20)'; }}
    >
      ?
    </Link>
  );
}
