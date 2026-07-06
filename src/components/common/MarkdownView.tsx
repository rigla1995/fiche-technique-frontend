import type { CSSProperties, ReactNode } from 'react';

/**
 * Rendu du markdown du manuel d'utilisation (contenu stocké en base, éditable
 * depuis l'admin). Sous-ensemble supporté — garder en phase avec l'aide de
 * l'éditeur admin (AdminManuelPage) :
 *   ## Titre        ### Sous-titre
 *   **gras** *italique* `code` [texte](#slug|url)
 *   - liste         1. étapes numérotées
 *   | tableaux | pipe |
 *   :::astuce|attention|regle|exemple … :::
 *   :::formule Libellé  EXPRESSION  note: …  :::
 */

export type CalloutKind = 'astuce' | 'attention' | 'regle' | 'exemple';

export type Block =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; kind: CalloutKind; text: string }
  | { type: 'formule'; label: string; expr: string; note?: string }
  | { type: 'table'; header: string[]; rows: string[][] };

const isUl = (t: string) => /^- /.test(t);
const isOl = (t: string) => /^\d+[.)] /.test(t);
const isBlockStart = (t: string) =>
  !t || t.startsWith('## ') || t.startsWith('### ') || t.startsWith(':::') || isUl(t) || isOl(t) || t.startsWith('|');

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }
    if (trimmed.startsWith('## ')) { blocks.push({ type: 'h2', text: trimmed.slice(3) }); i++; continue; }
    if (trimmed.startsWith('### ')) { blocks.push({ type: 'h3', text: trimmed.slice(4) }); i++; continue; }

    const callout = trimmed.match(/^:::(astuce|attention|regle|exemple)\s*$/);
    if (callout) {
      const buf: string[] = [];
      let closed = false;
      i++;
      // Bloc non fermé : on s'arrête au prochain bloc structurant pour ne pas avaler le reste.
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l === ':::') { closed = true; break; }
        if (l.startsWith('## ') || l.startsWith('### ') || l.startsWith(':::')) break;
        buf.push(l); i++;
      }
      if (closed) i++;
      blocks.push({ type: 'callout', kind: callout[1] as CalloutKind, text: buf.join('\n').trim() });
      continue;
    }

    const formule = trimmed.match(/^:::formule\s+(.+)$/);
    if (formule) {
      const expr: string[] = [];
      let note: string | undefined;
      let closed = false;
      i++;
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l === ':::') { closed = true; break; }
        if (l.startsWith('## ') || l.startsWith('### ') || l.startsWith(':::')) break;
        if (/^note\s*:/i.test(l)) note = l.replace(/^note\s*:/i, '').trim();
        else if (l) expr.push(l);
        i++;
      }
      if (closed) i++;
      blocks.push({ type: 'formule', label: formule[1].trim(), expr: expr.join('\n'), note });
      continue;
    }

    if (isUl(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isUl(lines[i].trim())) { items.push(lines[i].trim().slice(2)); i++; }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (isOl(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isOl(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+[.)] /, '')); i++; }
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) { tbl.push(lines[i].trim()); i++; }
      // Sans ligne de séparation (|---|), ce n'est pas un tableau : rendu en paragraphe.
      if (tbl.length < 2 || !/^\|[\s:\-|]+\|$/.test(tbl[1])) {
        blocks.push({ type: 'p', text: tbl.join(' ') });
        continue;
      }
      const parseRow = (l: string) => l.slice(1, -1).split('|').map((c) => c.trim());
      const header = parseRow(tbl[0]);
      const rows = tbl.slice(2).filter((l) => !/^\|[\s:\-|]+\|$/.test(l)).map(parseRow);
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const buf: string[] = [];
    while (i < lines.length && !isBlockStart(lines[i].trim())) { buf.push(lines[i].trim()); i++; }
    // Ligne orpheline (::: isolé, | sans pipe final…) : on la saute pour ne pas boucler.
    if (buf.length === 0) { i++; continue; }
    blocks.push({ type: 'p', text: buf.join(' ') });
  }
  return blocks;
}

// ─── Inline : **gras**, *italique*, `code`, [texte](lien) ────────────────────
const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, onNavigate?: (slug: string) => void): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const tok = m[0];
    if (tok.startsWith('**')) {
      nodes.push(<strong key={k++} style={{ color: '#1e293b' }}>{renderInline(tok.slice(2, -2), onNavigate)}</strong>);
    } else if (tok.startsWith('`')) {
      nodes.push(<code key={k++} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 5, padding: '1px 5px', fontSize: '0.9em', color: '#334155' }}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (lm) {
        const [, label, href] = lm;
        if (href.startsWith('#')) {
          nodes.push(
            <a key={k++} href={href} style={linkStyle}
              onClick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(href.slice(1)); } }}>
              {label}
            </a>
          );
        } else {
          nodes.push(<a key={k++} href={href} target="_blank" rel="noreferrer" style={linkStyle}>{label}</a>);
        }
      } else {
        nodes.push(tok);
      }
    } else {
      nodes.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    }
    last = idx + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderMultiline(text: string, onNavigate?: (slug: string) => void): ReactNode {
  const parts = text.split('\n');
  return parts.map((l, idx) => (
    <span key={idx}>{idx > 0 && <br />}{renderInline(l, onNavigate)}</span>
  ));
}

// ─── Styles (charte reprise de l'ancien GuidePage) ───────────────────────────
const linkStyle: CSSProperties = { color: '#2563eb', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2 };
const liStyle: CSSProperties = { fontSize: '0.84rem', color: '#374151', lineHeight: 1.75, marginBottom: 4 };

const CALLOUTS: Record<CalloutKind, { bg: string; border: string; color: string; icon: string; label?: string }> = {
  astuce: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', icon: '💡' },
  attention: { bg: '#fff7ed', border: '#fed7aa', color: '#c2410c', icon: '⚠️' },
  regle: { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: '✅' },
  exemple: { bg: '#fefce8', border: '#fde68a', color: '#854d0e', icon: '📌', label: 'Exemple :' },
};

interface Props {
  content: string;
  /** navigation interne quand un lien [texte](#slug) est cliqué */
  onNavigate?: (slug: string) => void;
}

export default function MarkdownView({ content, onNavigate }: Props) {
  const blocks = parseBlocks(content);
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2':
            return <h2 key={i} style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b', marginBottom: 12, marginTop: i === 0 ? 0 : 26 }}>{renderInline(b.text, onNavigate)}</h2>;
          case 'h3':
            return <h3 key={i} style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2563eb', marginBottom: 8, marginTop: 24 }}>{renderInline(b.text, onNavigate)}</h3>;
          case 'p':
            return <p key={i} style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.75, margin: '0 0 10px' }}>{renderInline(b.text, onNavigate)}</p>;
          case 'ul':
            return (
              <ul key={i} style={{ paddingLeft: 20, margin: '0 0 12px' }}>
                {b.items.map((it, j) => <li key={j} style={liStyle}>{renderInline(it, onNavigate)}</li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} style={{ paddingLeft: 20, margin: '0 0 12px' }}>
                {b.items.map((it, j) => <li key={j} style={liStyle}>{renderInline(it, onNavigate)}</li>)}
              </ol>
            );
          case 'callout': {
            const c = CALLOUTS[b.kind];
            return (
              <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: c.color, display: 'flex', gap: 8 }}>
                <span>{c.icon}</span>
                <span>{c.label && <strong>{c.label} </strong>}{renderMultiline(b.text, onNavigate)}</span>
              </div>
            );
          }
          case 'formule':
            return (
              <div key={i} style={{ background: '#f1f5f9', borderRadius: 8, padding: '10px 14px', marginBottom: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{b.label}</div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.86rem', color: '#1e293b', fontWeight: 700, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{b.expr}</div>
                {b.note && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{b.note}</div>}
              </div>
            );
          case 'table':
            return (
              <div key={i} style={{ overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      {b.header.map((h, j) => (
                        <th key={j} style={{ textAlign: 'left', padding: '7px 10px', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#334155', fontWeight: 700 }}>{renderInline(h, onNavigate)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{renderInline(cell, onNavigate)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
