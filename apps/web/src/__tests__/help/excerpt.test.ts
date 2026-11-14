import { describe, expect, it } from 'vitest';
import { helpEntryToPlainText } from '../../help/excerpt';

describe('helpEntryToPlainText', () => {
  it('assemble les sections separees par une ligne vide', () => {
    const text = helpEntryToPlainText({
      id: 'locatif.a',
      kind: 'page',
      title: 'Baux',
      summary: 'Liste des baux.',
      purpose: 'Suivre les contrats.',
      howToRead: {
        columns: [{ key: 'n', label: 'Numero', description: 'Reference du bail' }],
        statuses: [{ value: 'ACTIVE', label: 'Actif', description: 'Bail en cours' }],
        notes: ['Note un']
      },
      steps: [{ title: 'Ouvrir', detail: 'Cliquer sur Nouveau' }, { title: 'Valider' }],
      consequences: ['Le bail est cree'],
      faq: [{ q: 'Et apres ?', a: 'Rien.' }]
    });
    expect(text).toBe(
      [
        'Baux',
        'Liste des baux.',
        'Suivre les contrats.',
        'Numero : Reference du bail',
        'Actif : Bail en cours',
        'Note un',
        '1. Ouvrir : Cliquer sur Nouveau\n2. Valider',
        'Le bail est cree',
        'Et apres ?\nRien.'
      ].join('\n\n')
    );
  });

  it('omet les sections absentes et ne tronque pas', () => {
    const long = 'x'.repeat(6000);
    const text = helpEntryToPlainText({ id: 'locatif.b', kind: 'section', title: 'T', summary: long });
    expect(text).toBe(`T\n\n${long}`);
  });
});
