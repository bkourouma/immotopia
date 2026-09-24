import { renderHook } from '@testing-library/react';
import { NAVIGATION, SECTION_LABELS } from '../../navigation/model';
import type { PersonaId } from '../../navigation/model';
import {
  catalogForPersona,
  defaultMenuMap,
  menuKeyFor,
  menuKeysForPersona,
  personaForRoleKey,
  resolveMenuMap,
  PORTAL_OWNER_ROLE_KEY,
  PORTAL_RENTER_ROLE_KEY,
  PORTAL_PSEUDO_ROLES
} from '../../navigation/menu-catalog';
import { useFilteredNavigation } from '../../hooks/useMenuAccess';

/**
 * Le catalogue des menus est ce que l'écran « Rôles et permissions » donne à
 * régler, et ce que la coquille élague. Les deux doivent parler de la même
 * chose : un catalogue qui dériverait du modèle de navigation laisserait
 * l'administrateur régler des entrées qui n'existent plus, ou en oublier.
 */

const PERSONAS: PersonaId[] = ['super-admin', 'collaborateur', 'proprietaire', 'locataire'];

describe('catalogue des menus — fidélité au modèle de navigation', () => {
  it.each(PERSONAS)('couvre toutes les entrées de « %s », sans en inventer', persona => {
    const fromModel = NAVIGATION[persona].tree.flatMap(group => [
      menuKeyFor(persona, group.key),
      ...(group.children ?? []).map(leaf => menuKeyFor(persona, group.key, leaf.key))
    ]);

    expect(menuKeysForPersona(persona).sort()).toEqual(fromModel.sort());
  });

  it('découpe par les catégories de la sidebar, dans l’ordre de l’arbre', () => {
    const sections = catalogForPersona('collaborateur');

    expect(sections.map(s => s.label)).toEqual([
      // Le tableau de bord n'a pas de domaine : il reste isolé en tête.
      'Général',
      SECTION_LABELS.parc,
      SECTION_LABELS.locatif,
      SECTION_LABELS.finance,
      SECTION_LABELS.patrimoine,
      SECTION_LABELS.ventes,
      SECTION_LABELS.commercial,
      SECTION_LABELS.copropriete,
      SECTION_LABELS.parametrage
    ]);
  });

  it('préfixe les clés par le persona, pour que deux « Biens » ne se confondent pas', () => {
    expect(menuKeyFor('collaborateur', 'biens')).not.toEqual(menuKeyFor('proprietaire', 'biens'));
  });

  it('associe chaque rôle à la navigation qu’il obtient réellement', () => {
    expect(personaForRoleKey('PLATFORM_SUPER_ADMIN')).toBe('super-admin');
    expect(personaForRoleKey('TENANT_ADMIN')).toBe('collaborateur');
    expect(personaForRoleKey('TENANT_ACCOUNTANT')).toBe('collaborateur');
    expect(personaForRoleKey(PORTAL_OWNER_ROLE_KEY)).toBe('proprietaire');
    expect(personaForRoleKey(PORTAL_RENTER_ROLE_KEY)).toBe('locataire');
    expect(personaForRoleKey('ROLE_INCONNU')).toBeNull();
  });

  it('donne une navigation aux deux personas qui n’ont pas de ligne dans `roles`', () => {
    // C'est le manque que comble cet écran : propriétaire et locataire n'ont
    // pas de rôle RBAC, mais ils ont bel et bien des menus à régler.
    expect(PORTAL_PSEUDO_ROLES.map(r => r.persona).sort()).toEqual(['locataire', 'proprietaire']);
  });
});

describe('états par défaut — déduits des permissions du rôle', () => {
  it('ouvre les entrées que les permissions autorisent, ferme les autres', () => {
    const comptable = new Set(['BILLING_VIEW', 'RENTAL_PAYMENTS_VIEW', 'RENTAL_INSTALLMENTS_VIEW']);
    const map = defaultMenuMap('collaborateur', comptable);

    expect(map[menuKeyFor('collaborateur', 'encaisser')]).toBe(true);
    expect(map[menuKeyFor('collaborateur', 'crm')]).toBe(false);
    expect(map[menuKeyFor('collaborateur', 'biens')]).toBe(false);
  });

  it('laisse ouvert ce qui n’est conditionné par rien', () => {
    const map = defaultMenuMap('collaborateur', new Set());
    expect(map[menuKeyFor('collaborateur', 'accueil')]).toBe(true);
  });

  it('ferme les sous-entrées d’un parent fermé', () => {
    const map = defaultMenuMap('collaborateur', new Set(['RENTAL_LEASES_VIEW']));
    expect(map[menuKeyFor('collaborateur', 'crm')]).toBe(false);
    expect(map[menuKeyFor('collaborateur', 'crm', 'crm-contacts')]).toBe(false);
  });

  it('ouvre tout aux personas de portail, qui n’ont aucune permission RBAC', () => {
    const map = defaultMenuMap('locataire', null);
    expect(Object.values(map).every(Boolean)).toBe(true);
  });

  it('fait gagner la décision enregistrée sur le défaut', () => {
    const permissions = new Set(['PROPERTIES_VIEW']);
    const biens = menuKeyFor('collaborateur', 'biens');
    const crm = menuKeyFor('collaborateur', 'crm');

    const map = resolveMenuMap('collaborateur', permissions, { [biens]: false, [crm]: true });

    expect(map[biens]).toBe(false);
    expect(map[crm]).toBe(true);
  });

  it('ignore une clé enregistrée qui ne correspond à aucun menu du persona', () => {
    // Un menu supprimé du modèle laisse des lignes en base : elles ne doivent
    // pas réapparaître dans l'écran sous forme d'entrée fantôme.
    const map = resolveMenuMap('locataire', null, { 'locataire.menu-disparu': false });
    expect(map['locataire.menu-disparu']).toBeUndefined();
  });
});

describe('navigation filtrée — ce que la coquille rend réellement', () => {
  const filter = (persona: PersonaId, disabled: string[]) =>
    renderHook(() => useFilteredNavigation(NAVIGATION[persona], new Set(disabled))).result.current;

  it('ne touche à rien quand aucun menu n’est coupé', () => {
    expect(filter('collaborateur', [])).toBe(NAVIGATION.collaborateur);
  });

  it('retire l’entrée coupée, et l’onglet qui y menait', () => {
    const nav = filter('collaborateur', [menuKeyFor('collaborateur', 'biens')]);

    expect(nav?.tree.some(group => group.key === 'biens')).toBe(false);
    expect(nav?.tabs.some(tab => tab.key === 'tab-biens')).toBe(false);
    // Les autres onglets survivent, « Plus » compris.
    expect(nav?.tabs.some(tab => tab.key === 'tab-plus')).toBe(true);
  });

  it('retire une sous-entrée sans faire tomber son parent', () => {
    const nav = filter('collaborateur', [menuKeyFor('collaborateur', 'crm', 'crm-deals')]);
    const crm = nav?.tree.find(group => group.key === 'crm');

    expect(crm).toBeDefined();
    expect(crm?.children?.some(leaf => leaf.key === 'crm-deals')).toBe(false);
    expect(crm?.children?.some(leaf => leaf.key === 'crm-contacts')).toBe(true);
  });

  it('fait tomber un parent dont toutes les sous-entrées sont coupées', () => {
    // Un accordéon vide promet un contenu qui n'existe plus : il vaut mieux
    // qu'il disparaisse.
    const children = NAVIGATION.collaborateur.tree.find(g => g.key === 'crm')?.children ?? [];
    const nav = filter(
      'collaborateur',
      children.map(leaf => menuKeyFor('collaborateur', 'crm', leaf.key))
    );

    expect(nav?.tree.some(group => group.key === 'crm')).toBe(false);
  });

  it('ne coupe rien chez un persona dont les clés ne sont pas visées', () => {
    // Couper « Biens » au collaborateur ne doit pas couper « Mes biens » au
    // propriétaire : c'est tout l'objet du préfixe de persona.
    const nav = filter('proprietaire', [menuKeyFor('collaborateur', 'biens')]);
    expect(nav?.tree.some(group => group.key === 'biens')).toBe(true);
  });
});
