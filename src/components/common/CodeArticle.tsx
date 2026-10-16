// D3 (16/10/2026) : le code d'un article (« FAR-0012 ») ou la référence d'un produit, en petit sous le nom — le même
// rendu partout où l'article paraît (référentiel, stock, transferts, inventaires, historiques, factures fournisseur).
// Rien n'est affiché sans code (fiches d'avant un rafraîchissement, produits transformés).
export default function CodeArticle({ code, inline, style }: { code?: string | null; inline?: boolean; style?: React.CSSProperties }) {
  if (!code) return null;
  return (
    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '0.68rem', color: '#64748b', letterSpacing: '0.02em', display: inline ? 'inline' : 'block', lineHeight: 1.3, ...style }}>
      {code}
    </span>
  );
}
