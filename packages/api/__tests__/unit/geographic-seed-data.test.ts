import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadGeographicData } from '../../prisma/seeds/geographic-seed';

const DATA_PATH = path.join(__dirname, '../../prisma/seeds/data/ci-geographie.json');

describe('référentiel géographique (ci-geographie.json)', () => {
  const regions = loadGeographicData(DATA_PATH);
  const allCommunes = regions.flatMap(r => r.communes);

  it('compte 33 régions et 164 communes', () => {
    expect(regions).toHaveLength(33);
    expect(allCommunes).toHaveLength(164);
  });

  it.each(['Cocody', 'Yopougon', 'Treichville', 'Songon', 'Bingerville', 'Anyama'])('contient la commune %s', name => {
    expect(allCommunes).toContain(name);
  });

  it('ne répète aucun nom de commune dans une même région, ni aucun nom de région', () => {
    for (const r of regions) {
      expect(new Set(r.communes).size).toBe(r.communes.length);
    }
    expect(new Set(regions.map(r => r.region)).size).toBe(regions.length);
  });

  it('chaque région a un chef-lieu', () => {
    for (const r of regions) {
      expect(typeof r.chef_lieu).toBe('string');
      expect(r.chef_lieu.trim()).not.toBe('');
    }
  });

  it('refuse un fichier invalide avant toute écriture', () => {
    const tmp = path.join(os.tmpdir(), `geo-invalide-${process.pid}.json`);
    try {
      fs.writeFileSync(tmp, JSON.stringify({ region: 'X' }));
      expect(() => loadGeographicData(tmp)).toThrow(/tableau non vide/);
      fs.writeFileSync(tmp, JSON.stringify([{ region: 'X' }]));
      expect(() => loadGeographicData(tmp)).toThrow(/communes/);
      fs.writeFileSync(tmp, '{pas du json');
      expect(() => loadGeographicData(tmp)).toThrow(/Lecture impossible/);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});
