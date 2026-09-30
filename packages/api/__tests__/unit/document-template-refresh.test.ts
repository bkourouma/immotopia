import {
  decideTemplateRefresh,
  PREVIOUS_SHIPPED_HASHES,
  type ExistingDefaultTemplate
} from '../../src/services/document-template-refresh';

const OLD = 'old-hash';
const NEW = 'new-hash';
const global = (hash: string): ExistingDefaultTemplate => ({
  tenant_id: null,
  is_default: true,
  file_hash_sha256: hash
});

describe('decideTemplateRefresh', () => {
  it('aucun modele par defaut : creation', () => {
    expect(decideTemplateRefresh(null, NEW)).toBe('CREATE');
  });

  it('modele livre identique : rien a faire (idempotent)', () => {
    expect(decideTemplateRefresh(global(NEW), NEW, [OLD])).toBe('UP_TO_DATE');
  });

  it('ancienne version livree : rafraichissement, puis plus rien au passage suivant', () => {
    expect(decideTemplateRefresh(global(OLD), NEW, [OLD])).toBe('REFRESH');
    expect(decideTemplateRefresh(global(NEW), NEW, [OLD])).toBe('UP_TO_DATE');
  });

  it("modele global d'empreinte inconnue (personnalise) : conserve", () => {
    expect(decideTemplateRefresh(global('perso'), NEW, [OLD])).toBe('KEEP_CUSTOM');
  });

  it('force : remplace un global inconnu', () => {
    expect(decideTemplateRefresh(global('perso'), NEW, [OLD], true)).toBe('REFRESH');
  });

  it("modele d'agence : jamais touche, meme ancien ou force", () => {
    const agency = { tenant_id: 'agency-1', is_default: true, file_hash_sha256: OLD };
    expect(decideTemplateRefresh(agency, NEW, [OLD])).toBe('KEEP_CUSTOM');
    expect(decideTemplateRefresh(agency, NEW, [OLD], true)).toBe('KEEP_CUSTOM');
  });

  it('les empreintes precedentes livrees sont des SHA-256 valides', () => {
    for (const hashes of Object.values(PREVIOUS_SHIPPED_HASHES)) {
      for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
