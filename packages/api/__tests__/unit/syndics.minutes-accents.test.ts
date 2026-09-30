/**
 * BUG-2026-09-30-080 : le compte rendu d'AG genere sans modele d'agence doit
 * etre en francais accentue, avec le type d'assemblee et les statuts de
 * resolution traduits, et mentionner les pouvoirs.
 */
import PizZip from 'pizzip';
import { buildMeetingMinutesDocx } from '../../src/lib/syndics/minutes-generator';

function extractText(buffer: Buffer): string {
  const xml = new PizZip(buffer).file('word/document.xml')!.asText();
  return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
}

const meeting = {
  id: 'm1',
  type: 'EXTRAORDINARY',
  scheduledAt: new Date('2026-02-20T09:00:00Z'),
  startTime: new Date('2026-02-20T09:00:00Z'),
  location: 'Salle polyvalente',
  quorum: 75,
  syndicate: { name: 'Résidence Les Flamboyants', address: 'Abidjan', tenantId: 'tenant-sans-modele' },
  agendaItems: [{ orderIndex: 1, title: 'Budget', discussions: [] }],
  resolutions: [
    {
      title: 'Budget prévisionnel',
      majorityRule: 'ARTICLE_25',
      result: 'APPROVED',
      votesFor: 6,
      votesAgainst: 1,
      votesAbstain: 0,
      tally: { sharesFor: 750, sharesAgainst: 150, sharesAbstain: 0, referenceShares: 1001 }
    },
    { title: 'Travaux', majorityRule: 'ARTICLE_24', result: 'REJECTED' }
  ],
  proxies: [
    {
      grantor: { firstName: 'Awa', lastName: 'Traoré' },
      representative: { firstName: 'Jean-Marc', lastName: 'Kouadio' }
    }
  ]
};

describe("compte rendu d'AG (générateur de secours)", () => {
  it('écrit un français accentué, sans code brut ni mot sans accent', async () => {
    const text = extractText(await buildMeetingMinutesDocx(meeting as never));

    expect(text).toContain('COMPTE RENDU D’ASSEMBLÉE GÉNÉRALE');
    expect(text).toContain('Copropriété : Résidence Les Flamboyants');
    expect(text).toContain('Type : Extraordinaire');
    expect(text).toContain('Règle de majorité : Article 25 - majorité absolue des tantièmes de tous les lots');
    expect(text).toContain('Tantièmes : pour 750, contre 150');
    expect(text).toContain('Résultat : Approuvée');
    expect(text).toContain('Résultat : Rejetée');

    for (const wrong of ['EXTRAORDINARY', 'APPROUVEE', 'REJETEE', 'Copropriete', 'Regle de', 'Tantiemes', 'seance']) {
      expect(text).not.toContain(wrong);
    }
  });

  it('mentionne les pouvoirs (mandant et mandataire)', async () => {
    const text = extractText(await buildMeetingMinutesDocx(meeting as never));
    expect(text).toContain('POUVOIRS');
    expect(text).toContain('Awa Traoré est représenté(e) par Jean-Marc Kouadio.');
  });

  it("indique explicitement l'absence de pouvoir", async () => {
    const text = extractText(await buildMeetingMinutesDocx({ ...meeting, proxies: [] } as never));
    expect(text).toContain('Aucun pouvoir enregistré.');
  });
});
