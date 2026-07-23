interface Props {
  section: string;
}

/**
 * Bouton « ? » du hero : ouvre le manuel d'utilisation à la bonne section
 * dans un NOUVEL onglet — l'utilisateur ne perd pas la page où il se trouve.
 */
export default function GuideButton({ section }: Props) {
  return (
    <a
      href={`/client/guide#${section}`}
      target="_blank"
      rel="noopener"
      title="Voir le guide (nouvel onglet)"
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
    </a>
  );
}
