import { renderHook } from '@testing-library/react';
import { getNavigation, getSectionLabels } from '../../navigation/model';
import type { PersonaId } from '../../navigation/model';
import {
  catalogForPersona,
  defaultMenuMap,
  isMenuKeyDisabled,
  legacyMenuKeysFor,
  menuKeyFor,
  menuKeysDeniedByPermissions,
  menuKeysForPersona,
  personaForRoleKey,
  resolveMenuMap,
  PORTAL_OWNER_ROLE_KEY,
  PORTAL_RENTER_ROLE_KEY,
  getPortalPseudoRoles
} from '../../navigation/menu-catalog';
import { useFilteredNavigation } from '../../hooks/useMenuAccess';

/**
 * Le catalogue des menus est ce que l'écran « Rôles et permissions » donne à
 * régler, et ce que la coquille élague. Les deux doivent parler de la même
 * chose : un catalogue qui dériverait du modèle de navigation laisserait
 * l'administrateur régler des entrées qui n'existent plus, ou en oublier.
 *
 * `NAVIGATION`, `SECTION_LABELS` et `PORTAL_PSEUDO_ROLES` sont désormais des
 * fonctions (`getNavigation`, `getSectionLabels`, `getPortalPseudoRoles`) :
 * elles lisent `t()` à l'appel plutôt qu'une fois pour toutes à l'import,
 * pour suivre un changement de langue en cours de session. La suite tourne en
 * français (`setupTests.ts`) ; ces alias évitent de réécrire chaque appel.
 */
const NAVIGATION = getNavigation();
const SECTION_LABELS = getSectionLabels();
const PORTAL_PSEUDO_ROLES = getPortalPseudoRoles();

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

describe('finance réorganisée — reprise des réglages enregistrés sur les anciennes clés', () => {
  const persona: PersonaId = 'collaborateur';
  const ancienne = (leaf?: string) => menuKeyFor(persona, 'finance', leaf);
  const financeGroups = NAVIGATION.collaborateur.tree.filter(g => g.section === 'finance');
  const groupKey = (label: string) => financeGroups.find(g => g.label === label)?.key ?? '';
  const caisseTresorerie = menuKeyFor(persona, groupKey('Caisse et comptabilité'), 'finance-tresorerie');
  const reversements = menuKeyFor(persona, groupKey('Clients et propriétaires'), 'finance-owner-accounts');

  /** Les vingt-trois feuilles de l'ancien groupe « Finance ». */
  const ANCIENNES_FEUILLES = [
    'finance-comptabilite',
    'finance-caisse',
    'finance-tresorerie',
    'finance-clients',
    'finance-clients-agee',
    'finance-agent-commissions',
    'finance-owner-accounts',
    'finance-facturation',
    'finance-tableau-de-bord-chantiers',
    'finance-bons-de-commande',
    'finance-baux-terrain',
    'finance-associations',
    'finance-salaires',
    'finance-tacherons',
    'finance-retenues',
    'finance-stock',
    'finance-stock-inventaire',
    'finance-stock-parametrage',
    'finance-fournisseurs',
    'finance-fournisseurs-balance',
    'finance-chantiers',
    'finance-validation',
    'finance-importation'
  ];

  it('fait reprendre chaque ancienne feuille par exactement une entrée actuelle', () => {
    const live = new Set(menuKeysForPersona(persona));
    const reprises = [...live].flatMap(key => legacyMenuKeysFor(key));

    for (const feuille of ANCIENNES_FEUILLES) {
      const cle = ancienne(feuille);
      expect({ cle, reprises: reprises.filter(k => k === cle).length }).toEqual({ cle, reprises: 1 });
    }
    // Chacun des cinq groupes reprend l'ancien groupe.
    for (const group of financeGroups) {
      expect(legacyMenuKeysFor(menuKeyFor(persona, group.key))).toEqual([ancienne()]);
    }
    // Une ancienne clé n'est plus une clé vivante : sinon deux entrées se
    // disputeraient la même décision.
    for (const cle of reprises) expect(live.has(cle)).toBe(false);
  });

  it('garde visible une entrée dont un seul des anciens écrans l’était', () => {
    const map = resolveMenuMap(persona, null, {
      [ancienne()]: true,
      [ancienne('finance-caisse')]: false,
      [ancienne('finance-tresorerie')]: true
    });
    expect(map[caisseTresorerie]).toBe(true);
  });

  it('ferme une entrée dont tous les anciens écrans étaient coupés', () => {
    const map = resolveMenuMap(persona, null, {
      [ancienne()]: true,
      [ancienne('finance-caisse')]: false,
      [ancienne('finance-tresorerie')]: false
    });
    expect(map[caisseTresorerie]).toBe(false);
  });

  it('ferme les cinq groupes quand l’ancien groupe « Finance » était coupé', () => {
    const map = resolveMenuMap(persona, null, { [ancienne()]: false });
    for (const group of financeGroups) expect(map[menuKeyFor(persona, group.key)]).toBe(false);
  });

  it('fait gagner une décision prise sur la clé actuelle', () => {
    const map = resolveMenuMap(persona, null, {
      [ancienne('finance-caisse')]: true,
      [caisseTresorerie]: false
    });
    expect(map[caisseTresorerie]).toBe(false);
  });

  it('n’enlève par défaut aucun écran qu’un rôle voyait', () => {
    // Sans FINANCE_ACCOUNTS_READ, « Associations » restait visible : l'entrée
    // qui l'ouvre désormais doit l'être aussi. Idem pour « Trésorerie » sans
    // FINANCE_DOCUMENTS_CREATE (exigé par la seule Caisse).
    const map = defaultMenuMap(persona, new Set(['RENTAL_LEASES_VIEW']));
    expect(map[reversements]).toBe(true);
    expect(map[caisseTresorerie]).toBe(true);
    // Comptabilité, seule dans son entrée, garde son exigence.
    expect(map[menuKeyFor(persona, groupKey('Caisse et comptabilité'), 'finance-comptabilite')]).toBe(false);
  });

  it('masque dans la coquille ce que les anciennes clés coupaient', () => {
    const tout = [ancienne(), ...ANCIENNES_FEUILLES.map(ancienne)];
    const sansFinance = renderHook(() => useFilteredNavigation(NAVIGATION.collaborateur, new Set(tout))).result.current;
    expect(sansFinance?.tree.some(g => g.section === 'finance')).toBe(false);

    // Couper la seule Caisse laisse « Caisse et trésorerie » : la Trésorerie
    // restait visible.
    const sansCaisse = renderHook(() =>
      useFilteredNavigation(NAVIGATION.collaborateur, new Set([ancienne('finance-caisse')]))
    ).result.current;
    expect(isMenuKeyDisabled(caisseTresorerie, new Set([ancienne('finance-caisse')]))).toBe(false);
    const tresorerie = sansCaisse?.tree.find(g => g.key === groupKey('Caisse et comptabilité'));
    expect(tresorerie?.children?.some(c => c.key === 'finance-tresorerie')).toBe(true);
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

describe('Chantiers et stock — lot 040 (ecrans §2.3)', () => {
  const persona: PersonaId = 'collaborateur';
  const groupe = menuKeyFor(persona, 'finance-chantiers-stock');
  const stock = menuKeyFor(persona, 'finance-chantiers-stock', 'finance-stock');
  const chantiers = menuKeyFor(persona, 'finance-chantiers-stock', 'finance-chantiers');
  const MAGASINIER = [
    'STOCK_VIEW',
    'STOCK_RECEIVE',
    'STOCK_ISSUE',
    'STOCK_TRANSFER',
    'STOCK_COUNT',
    'STOCK_TAKERS_MANAGE'
  ];

  it('exige STOCK_VIEW pour la Gestion du stock et FINANCE_ACCOUNTS_READ pour le Suivi des chantiers', () => {
    const entree = catalogForPersona(persona)
      .flatMap(section => section.entries)
      .find(entry => entry.menuKey === groupe);
    expect(entree?.requires).toEqual(['STOCK_VIEW', 'FINANCE_ACCOUNTS_READ']);
    expect(entree?.children.find(child => child.menuKey === stock)?.requires).toEqual(['STOCK_VIEW']);
    expect(entree?.children.find(child => child.menuKey === chantiers)?.requires).toEqual(['FINANCE_ACCOUNTS_READ']);
  });

  it('un rôle aux seuls droits STOCK_* ouvre par défaut la Gestion du stock, pas le Suivi des chantiers', () => {
    const map = defaultMenuMap(persona, new Set(MAGASINIER));
    expect(map[groupe]).toBe(true);
    expect(map[stock]).toBe(true);
    expect(map[chantiers]).toBe(false);
  });

  it('un rôle avec FINANCE_ACCOUNTS_READ et STOCK_VIEW ouvre les deux', () => {
    const map = defaultMenuMap(persona, new Set(['FINANCE_ACCOUNTS_READ', 'STOCK_VIEW']));
    expect(map[groupe]).toBe(true);
    expect(map[stock]).toBe(true);
    expect(map[chantiers]).toBe(true);
  });

  it('la coquille rend au magasinier « Gestion du stock » sans « Suivi des chantiers »', () => {
    const denied = menuKeysDeniedByPermissions(persona, MAGASINIER);
    const nav = renderHook(() => useFilteredNavigation(NAVIGATION.collaborateur, new Set(denied))).result.current;
    const entree = nav?.tree.find(group => group.key === 'finance-chantiers-stock');
    expect(entree?.children?.map(child => child.key)).toEqual(['finance-stock']);
  });
});
