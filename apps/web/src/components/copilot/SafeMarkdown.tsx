import React from 'react';

/**
 * Rendu Markdown minimal et sûr pour les réponses d'ImmoCopilot.
 *
 * Prend en charge : paragraphes, **gras**, *italique*, `code`, blocs de code
 * (```), listes à puces et numérotées. Tout le reste (liens, images, HTML,
 * titres) est rendu comme texte brut : la sortie est composée uniquement de
 * nœuds React, donc React échappe chaque caractère. Aucun
 * `dangerouslySetInnerHTML`.
 */

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)/;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let index = 0;
  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (match[1]) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (match[2]) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    } else {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    }
    rest = rest.slice(match.index + token.length);
  }
  return nodes;
}

type Block = { type: 'p'; lines: string[] } | { type: 'ul' | 'ol'; items: string[] } | { type: 'code'; text: string };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      i++; // fence de fermeture (ou fin du texte : bloc non fermé pendant le flux)
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      const type = bullet ? 'ul' : 'ol';
      const pattern = bullet ? BULLET : ORDERED;
      const items: string[] = [];
      let m: RegExpExecArray | null;
      while (i < lines.length && (m = pattern.exec(lines[i]))) {
        items.push(m[1]);
        i++;
      }
      blocks.push({ type, items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !BULLET.test(lines[i]) &&
      !ORDERED.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    blocks.push({ type: 'p', lines: para });
  }
  return blocks;
}

export interface SafeMarkdownProps {
  /** Texte Markdown (éventuellement partiel pendant le streaming). */
  text: string;
}

export function SafeMarkdown({ text }: SafeMarkdownProps): React.ReactElement {
  const blocks = parseBlocks(text);
  return (
    <div className="copilot-markdown">
      {blocks.map((block, b) => {
        const key = `b${b}`;
        if (block.type === 'code') {
          return (
            <pre key={key} style={{ margin: '0 0 8px', overflowX: 'auto' }}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === 'p') {
          return (
            <p key={key} style={{ margin: '0 0 8px' }}>
              {block.lines.map((l, n) => (
                <React.Fragment key={`${key}-${n}`}>
                  {n > 0 && <br />}
                  {renderInline(l, `${key}-${n}`)}
                </React.Fragment>
              ))}
            </p>
          );
        }
        const List = block.type;
        return (
          <List key={key} style={{ margin: '0 0 8px', paddingInlineStart: 20 }}>
            {block.items.map((item, n) => (
              <li key={`${key}-${n}`}>{renderInline(item, `${key}-${n}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

export default SafeMarkdown;
