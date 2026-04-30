import { useNavigate, useParams } from 'react-router-dom';

interface ErrorConfig {
  code: number;
  icon: string;
  title: string;
  subtitle: string;
  gradient: string;
  accent: string;
}

const ERRORS: Record<string, ErrorConfig> = {
  '401': {
    code: 401,
    icon: '🔐',
    title: 'Non autorisé',
    subtitle: 'Vous devez être connecté pour accéder à cette page. Veuillez vous identifier.',
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    accent: '#2563eb',
  },
  '403': {
    code: 403,
    icon: '🚫',
    title: 'Accès refusé',
    subtitle: "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource.",
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)',
    accent: '#ea580c',
  },
  '404': {
    code: 404,
    icon: '🔍',
    title: 'Page introuvable',
    subtitle: "Cette page n'existe pas ou a été déplacée. Vérifiez l'URL ou retournez à l'accueil.",
    gradient: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
    accent: '#475569',
  },
  '500': {
    code: 500,
    icon: '⚙️',
    title: 'Erreur serveur',
    subtitle: 'Une erreur interne est survenue. Notre équipe a été notifiée. Réessayez dans quelques instants.',
    gradient: 'linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)',
    accent: '#dc2626',
  },
  '503': {
    code: 503,
    icon: '🛠️',
    title: 'Service indisponible',
    subtitle: 'Le service est temporairement indisponible pour maintenance. Réessayez dans quelques minutes.',
    gradient: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
    accent: '#7c3aed',
  },
};

const DEFAULT_ERROR: ErrorConfig = {
  code: 0,
  icon: '❌',
  title: 'Une erreur est survenue',
  subtitle: 'Une erreur inattendue s\'est produite. Veuillez réessayer.',
  gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
  accent: '#334155',
};

interface ErrorPageProps {
  code?: number;
  message?: string;
}

export default function ErrorPage({ code: propCode, message }: ErrorPageProps) {
  const { code: paramCode } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const codeStr = String(propCode ?? paramCode ?? '');
  const config = ERRORS[codeStr] ?? DEFAULT_ERROR;

  const handleBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg, #f8fafc)',
      padding: '24px',
    }}>
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>

        {/* Animated code badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 120,
          height: 120,
          borderRadius: 32,
          background: config.gradient,
          boxShadow: `0 20px 60px ${config.accent}40, 0 4px 16px ${config.accent}30`,
          marginBottom: 32,
          fontSize: '3.2rem',
          lineHeight: 1,
          animation: 'errorBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          {config.icon}
        </div>

        {/* Error code */}
        {config.code > 0 && (
          <div style={{
            fontSize: '5rem',
            fontWeight: 900,
            lineHeight: 1,
            marginBottom: 8,
            background: config.gradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-3px',
          }}>
            {config.code}
          </div>
        )}

        {/* Title */}
        <h1 style={{
          fontSize: '1.6rem',
          fontWeight: 800,
          color: 'var(--text, #1a1a2e)',
          marginBottom: 12,
          letterSpacing: '-0.5px',
        }}>
          {config.title}
        </h1>

        {/* Subtitle / message */}
        <p style={{
          fontSize: '0.95rem',
          color: 'var(--text-muted, #64748b)',
          lineHeight: 1.7,
          marginBottom: 36,
          maxWidth: 400,
          margin: '0 auto 36px',
        }}>
          {message ?? config.subtitle}
        </p>

        {/* Separator line */}
        <div style={{
          width: 60,
          height: 3,
          borderRadius: 2,
          background: config.gradient,
          margin: '0 auto 36px',
        }} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleBack}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 24px', borderRadius: 10,
              background: config.gradient,
              color: '#fff', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.9rem',
              boxShadow: `0 4px 16px ${config.accent}40`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${config.accent}50`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = '';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 16px ${config.accent}40`;
            }}
          >
            ← Retour
          </button>

          <button
            onClick={() => navigate('/')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '11px 24px', borderRadius: 10,
              background: 'var(--surface, #fff)',
              color: 'var(--text, #1a1a2e)',
              border: '1.5px solid var(--border, #e5e7eb)',
              cursor: 'pointer',
              fontWeight: 600, fontSize: '0.9rem',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg, #f8fafc)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface, #fff)'; }}
          >
            🏠 Accueil
          </button>
        </div>

        {/* Decorative background dots */}
        <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: -1 }}>
          {[...Array(6)].map((_, k) => (
            <div key={k} style={{
              position: 'absolute',
              borderRadius: '50%',
              background: config.accent + '10',
              width: `${[240, 160, 120, 80, 200, 100][k]}px`,
              height: `${[240, 160, 120, 80, 200, 100][k]}px`,
              top: `${[10, 60, 30, 80, 5, 55][k]}%`,
              left: `${[5, 80, 45, 15, 65, 30][k]}%`,
              transform: 'translate(-50%, -50%)',
              filter: 'blur(1px)',
            }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes errorBounce {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
