import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SafeMarkdown } from '../../components/copilot/SafeMarkdown';

describe('SafeMarkdown', () => {
  it('rend gras, italique, code et listes', () => {
    const { container } = render(
      <SafeMarkdown text={'Un **gras** et un *italique* avec `code`.\n\n- un\n- deux\n\n1. premier\n2. second'} />
    );
    expect(container.querySelector('strong')?.textContent).toBe('gras');
    expect(container.querySelector('em')?.textContent).toBe('italique');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
  });

  it('rend <script> comme du texte', () => {
    const { container } = render(<SafeMarkdown text={'<script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });

  it('rend <img onerror> comme du texte', () => {
    const { container } = render(<SafeMarkdown text={'<img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });

  it('ne produit ni lien ni image pour la syntaxe Markdown', () => {
    const { container } = render(<SafeMarkdown text={'[clic](javascript:alert(1)) ![x](http://a/b.png)'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('[clic](javascript:alert(1))');
  });

  it('rend un bloc de code sans interpréter son contenu', () => {
    const { container } = render(<SafeMarkdown text={'```\n**pas gras**\n```'} />);
    expect(container.querySelector('pre code')?.textContent).toBe('**pas gras**');
    expect(container.querySelector('strong')).toBeNull();
  });
});

describe('SafeMarkdown — titres', () => {
  it('rend # à ### en h3 à h5, sans afficher les dièses', () => {
    const { container } = render(<SafeMarkdown text={'# Un\n\n## Synthèse\n### Détail **net**\n\ntexte'} />);
    expect(container.querySelector('h3')?.textContent).toBe('Un');
    expect(container.querySelector('h4')?.textContent).toBe('Synthèse');
    expect(container.querySelector('h5')?.textContent).toBe('Détail net');
    expect(container.querySelector('h5 strong')?.textContent).toBe('net');
    expect(container.textContent).not.toContain('#');
  });

  it('ne rend pas titre un dièse collé, une 4e profondeur ou un dièse en milieu de ligne', () => {
    const { container } = render(<SafeMarkdown text={'#hashtag\n\n#### quatre\n\nabc ## milieu'} />);
    expect(container.querySelector('h3, h4, h5')).toBeNull();
    expect(container.textContent).toContain('#hashtag');
    expect(container.textContent).toContain('#### quatre');
  });

  it('un titre HTML reste du texte : aucun élément ni attribut injecté', () => {
    const { container } = render(
      <SafeMarkdown
        text={'## <img src=x onerror=alert(1)>\n### <script>alert(1)</script>\n# [x](javascript:alert(1))'}
      />
    );
    expect(container.querySelector('img, script, a')).toBeNull();
    expect(container.querySelector('h4')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(container.querySelector('h5')?.textContent).toBe('<script>alert(1)</script>');
    expect(container.innerHTML).not.toMatch(/<(img|script|a)\b/i);
  });

  it('un titre interrompt un paragraphe et une liste', () => {
    const { container } = render(<SafeMarkdown text={'ligne\n## Titre\n- a\n## Autre'} />);
    expect(container.querySelectorAll('h4')).toHaveLength(2);
    expect(container.querySelectorAll('li')).toHaveLength(1);
  });
});
