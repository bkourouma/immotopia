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
