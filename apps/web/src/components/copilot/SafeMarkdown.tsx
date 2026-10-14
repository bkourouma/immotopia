import React from 'react';

/**
 * Rendu Markdown minimal et sûr pour les réponses d'ImmoCopilot.
 *
 * Prend en charge : paragraphes, **gras**, *italique*, `code`, blocs de code
 * (```), listes à puces et numérotées, titres `#` à `###` (rendus en h3 à h5 :
 * la page porte déjà un h1/h2). Tout le reste (liens, images, HTML) est rendu comme texte brut : la sortie est composée uniquement de
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

type Block =
  | { type: 'h'; level: 3 | 4 | 5; text: string }
  | { type: 'p'; lines: string[] }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'code'; text: string };

const HEADING = /^\s{0,3}(#{1,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
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
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'h', level: (heading[1].length + 2) as 3 | 4 | 5, text: heading[2] });
      i++;
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
      !HEADING.test(lines[i]) &&
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
        if (block.type === 'h') {
          const Heading = `h${block.level}` as 'h3' | 'h4' | 'h5';
          const size = { 3: 18, 4: 16, 5: 14 }[block.level];
          return (
            <Heading
              key={key}
              dir="auto"
              style={{ margin: '12px 0 6px', fontSize: size, fontWeight: 600, lineHeight: 1.35 }}
            >
              {renderInline(block.text, key)}
            </Heading>
          );
        }
        if (block.type === 'p') {
          return (
            <p key={key} dir="auto" style={{ margin: '0 0 8px' }}>
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
          <List
            key={key}
            style={{
              margin: '0 0 8px',
              paddingInlineStart: 20,
              listStyleType: block.type === 'ul' ? 'disc' : 'decimal'
            }}
          >
            {block.items.map((item, n) => (
              <li key={`${key}-${n}`} dir="auto">
                {renderInline(item, `${key}-${n}`)}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

export default SafeMarkdown;
