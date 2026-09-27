import { NAVIGATION, MORE_TAB_HREF, SECTION_LABELS } from '../../navigation/model';
import {
  contextFromPath,
  isCoOwnerPortalPath,
  isOwnerPortalPath,
  isTenantPortalPath,
  portalRedirect,
  resolveHref,
  resolvePersona
} from '../../navigation/resolve';
import { buildCrumbs } from '../../components/shell/Breadcrumbs';
import { ROUTE_LABELS, isIdSegment, labelForSegment } from '../../navigation/route-labels';

/**
 * Le modèle de navigation pilote les 100 écrans : sidebar, barre d'onglets et
 * fil d'Ariane en dérivent tous les trois. Une omission ici se paie partout,
 * d'où des tests d'intégrité sur le modèle lui-même et pas seulement sur les
 * fonctions qui le lisent.
 */

const TENANT = '8cab62a9-bddc-41d5-be02-712d345df2df';
const SYNDIC = '11111111-2222-3333-4444-555555555555';

describe('modèle de navigation — intégrité', () => {
  it('couvre les cinq personas qui ont une navigation', () => {
    // Le sixieme etat — compte rattache a rien — n'est pas un persona : il
    // n'a aucune destination, donc aucun menu.
    expect(Object.keys(NAVIGATION).sort()).toEqual([
      'collaborateur',
      'coproprietaire',
      'locataire',
      'proprietaire',
      'super-admin'
    ]);
  });

  it('respecte le nombre d’onglets par persona du §4.2', () => {
    expect(NAVIGATION['super-admin'].tabs).toHaveLength(0);
    expect(NAVIGATION.collaborateur.tabs).toHaveLength(5);
    expect(NAVIGATION.proprietaire.tabs).toHaveLength(5);
    expect(NAVIGATION.locataire.tabs).toHaveLength(4);
    expect(NAVIGATION.coproprietaire.tabs).toHaveLength(4);
  });

  it('donne au copropriétaire ses quatre destinations en lecture seule, et au bailleur un accès à sa copropriété', () => {
    expect(NAVIGATION.coproprietaire.tree.map(g => g.href)).toEqual([
      '/copropriete',
      '/copropriete/appels',
      '/copropriete/assemblees',
      '/copropriete/documents'
    ]);
    const plus = NAVIGATION.proprietaire.tree.find(g => g.key === 'plus');
    expect(plus?.children?.map(c => c.href)).toContain('/copropriete');
  });

  it('n’expose aucune ACTION comme destination', () => {
    const labels: string[] = [];
    for (const persona of Object.values(NAVIGATION)) {
      for (const group of persona.tree) {
        labels.push(group.label);
        group.children?.forEach(c => labels.push(c.label));
      }
    }
    // Les quatre actions du §4.3 doivent avoir quitté le menu.
    expect(labels).not.toContain('Ajouter une propriété');
    expect(labels).not.toContain('Nouveau contact');
    expect(labels).not.toContain('Nouveau bail');
    expect(labels).not.toContain('Nouveau ticket');
  });

  it('applique les suppressions actées du §4.3', () => {
    const hrefs: string[] = [];
    for (const persona of Object.values(NAVIGATION)) {
      for (const group of persona.tree) {
        if (group.href) hrefs.push(group.href);
        group.children?.forEach(c => hrefs.push(c.href));
      }
    }
    expect(hrefs).not.toContain('/properties/categories');
    expect(hrefs.some(h => h.endsWith('/clients'))).toBe(false);
    expect(hrefs.some(h => h.includes('/transactions'))).toBe(false);
    // /reports du back-office est supprimé ; /owner/reports est une autre page.
    expect(hrefs).not.toContain('/reports');
  });

  it('place « Baux » et « Encaisser » au premier niveau, pas sous un accordéon', () => {
    const primaires = NAVIGATION.collaborateur.tree.filter(g => g.zone === 'primary').map(g => g.label);
    expect(primaires).toEqual(['Tableau de bord', 'Biens', 'Baux', 'Encaisser']);
    // Le groupe que la refonte défait ne doit pas réapparaître.
    expect(NAVIGATION.collaborateur.tree.map(g => g.label)).not.toContain('Gestion locative');
  });

  it('marque la frontière « Plus » exigée par le §4.2', () => {
    const more = NAVIGATION.collaborateur.tree.filter(g => g.zone === 'more');
    expect(more.length).toBeGreaterThan(0);
    expect(more.map(g => g.label)).toContain('Syndic');
  });

  it('ramène le syndic à cinq entrées qui couvrent chacune leurs onglets', () => {
    const syndic = NAVIGATION.collaborateur.tree.find(g => g.key === 'syndic');
    expect(syndic?.children?.map(c => c.label)).toEqual([
      'Copropriétés',
      'Agences mandantes',
      'Copropriété',
      'Finances',
      'Assemblées et documents'
    ]);

    // Chaque écran de la copropriété allume exactement une entrée.
    const screens = [
      'lots',
      'prestataires',
      'profils-incidents',
      'budgets',
      'charges',
      'recouvrement',
      'finances',
      'comptabilite',
      'assemblees',
      'documents'
    ];
    for (const screen of screens) {
      const path = `/tenant/:tenantId/syndics/:syndicId/${screen}`;
      const owners = (syndic?.children ?? []).filter(c => c.href === path || c.activeFor?.includes(path));
      expect({ screen, owners: owners.length }).toEqual({ screen, owners: 1 });
    }
  });

  it('découpe la finance en cinq groupes courts dont chaque écran allume exactement une entrée', () => {
    const finance = NAVIGATION.collaborateur.tree.filter(g => g.section === 'finance');
    expect(finance.map(g => g.label)).toEqual([
      'Caisse et comptabilité',
      'Clients et propriétaires',
      'Achats et fournisseurs',
      'Chantiers et stock',
      "Main-d'œuvre"
    ]);
    expect(finance.map(g => g.children?.map(c => c.label))).toEqual([
      ['Caisse et trésorerie', 'Saisie et validation', 'Comptabilité'],
      ['Facturation et balances', 'Reversements et commissions'],
      ['Fournisseurs et commandes', 'Retenues de garantie'],
      ['Suivi des chantiers', 'Gestion du stock'],
      ['Salaires', 'Tâcherons']
    ]);

    // Chaque écran de liste de la finance — les vingt-trois de l'ancien
    // accordéon, plus les factures fournisseurs — allume exactement une
    // entrée, dans quelque groupe que ce soit.
    const leaves = NAVIGATION.collaborateur.tree.flatMap(g => g.children ?? []);
    const screens = [
      'caisse',
      'pieces-de-caisse',
      'tresorerie',
      'validation',
      'importation',
      'comptabilite',
      'facturation',
      'balance-clients',
      'balance-agee',
      'owner-accounts',
      'associations',
      'commissions',
      'fournisseurs',
      'factures-fournisseurs',
      'bons-de-commande',
      'fournisseurs/balance',
      'retenues',
      'chantiers',
      'tableau-de-bord-chantiers',
      'baux-terrain',
      'stock',
      'stock/inventaire',
      'stock/parametrage',
      'salaires',
      'tacherons'
    ];
    for (const screen of screens) {
      const path = `/tenant/:tenantId/finance/${screen}`;
      const owners = leaves.filter(c => c.href === path || c.activeFor?.includes(path));
      expect({ screen, owners: owners.length }).toEqual({ screen, owners: 1 });
    }
  });

  it('rattache les fiches de détail de la finance à l’entrée de leur liste', () => {
    // Même règle que la sidebar : la destination la plus longue qui préfixe
    // le chemin courant gagne.
    const flat = NAVIGATION.collaborateur.tree.flatMap(g =>
      (g.children ?? []).flatMap(c => [c.href, ...(c.activeFor ?? [])].map(href => ({ key: c.key, href })))
    );
    const activeKey = (pathname: string) => {
      let best: { key: string; length: number } | null = null;
      for (const entry of flat) {
        const path = resolveHref(entry.href, { tenantId: TENANT })?.split('?')[0];
        if (!path) continue;
        const matches = pathname === path || pathname.startsWith(`${path}/`);
        if (matches && (!best || path.length > best.length)) best = { key: entry.key, length: path.length };
      }
      return best?.key;
    };
    const base = `/tenant/${TENANT}/finance`;

    expect(activeKey(`${base}/chantiers/42`)).toBe('finance-chantiers');
    expect(activeKey(`${base}/chantiers/42/budget`)).toBe('finance-chantiers');
    expect(activeKey(`${base}/chantiers/42/stock`)).toBe('finance-chantiers');
    expect(activeKey(`${base}/chantiers/42/cloture`)).toBe('finance-chantiers');
    expect(activeKey(`${base}/baux-terrain/7`)).toBe('finance-chantiers');
    expect(activeKey(`${base}/stock/inventaire`)).toBe('finance-stock');
    expect(activeKey(`${base}/bons-de-commande/nouveau`)).toBe('finance-fournisseurs');
    expect(activeKey(`${base}/fournisseurs/balance`)).toBe('finance-fournisseurs');
    // La pièce de caisse s'ouvre sous sa propre adresse (`pieces-de-caisse`),
    // mais reste un document de caisse : elle allume l'entrée de l'onglet
    // Caisse, pas celle des chantiers d'où elle est parfois ouverte.
    expect(activeKey(`${base}/pieces-de-caisse`)).toBe('finance-tresorerie');
    expect(activeKey(`${base}/owner-accounts/9`)).toBe('finance-owner-accounts');
    expect(activeKey(`${base}/associations/3`)).toBe('finance-owner-accounts');
    expect(activeKey(`${base}/salaires/5`)).toBe('finance-salaires');
    expect(activeKey(`${base}/tacherons/5`)).toBe('finance-tacherons');
  });

  it('coiffe chaque entrée d’un domaine, sauf l’accueil', () => {
    // L'accueil n'a pas de domaine : un intertitre au-dessus d'une entrée
    // unique qui s'appelle déjà « Tableau de bord » ne dirait rien de plus.
    const sansDomaine = NAVIGATION.collaborateur.tree.filter(g => !g.section).map(g => g.label);
    expect(sansDomaine).toEqual(['Tableau de bord']);
  });

  it('n’emploie que des domaines déclarés', () => {
    for (const persona of Object.values(NAVIGATION)) {
      for (const group of persona.tree) {
        if (group.section) expect(SECTION_LABELS[group.section]).toBeTruthy();
      }
    }
  });

  it('garde les entrées d’un même domaine contiguës', () => {
    // Un domaine discontinu produirait deux intertitres de même clé : le menu
    // dirait deux fois la même chose à deux endroits, et React verrait deux
    // nœuds de même clé.
    for (const persona of Object.values(NAVIGATION)) {
      const dejaVus = new Set<string>();
      let courant: string | undefined;
      for (const group of persona.tree) {
        if (group.section !== courant && group.section) {
          expect(dejaVus.has(group.section)).toBe(false);
          dejaVus.add(group.section);
        }
        courant = group.section;
      }
    }
  });

  it('coiffe le portail propriétaire de ses deux domaines', () => {
    const domaines = NAVIGATION.proprietaire.tree.map(g => g.section);
    // Biens, Revenus et Mon compte (lot 3) sous « portefeuille » ; Incidents sous « bâtiments ».
    expect(domaines).toEqual([undefined, 'portefeuille', 'portefeuille', 'portefeuille', 'batiments', undefined]);
    // « Plus » reste sans intertitre : un titre au-dessus d'un groupe qui porte
    // deja ce nom nommerait deux fois la meme chose.
    expect(NAVIGATION.proprietaire.tree.filter(g => !g.section).map(g => g.label)).toEqual(['Tableau de bord', 'Plus']);
  });

  it('fait de « Gestion locative » un titre, jamais un parent', () => {
    expect(Object.values(SECTION_LABELS)).toContain('Gestion locative');
    const locatif = NAVIGATION.collaborateur.tree.filter(g => g.section === 'locatif');
    expect(locatif.map(g => g.label)).toEqual(['Baux', 'Encaisser']);
    // Les deux gardent leur href : ce sont des destinations de premier niveau,
    // pas des accordeons qui rajoutent un tap (§4.3).
    expect(locatif.every(g => Boolean(g.href))).toBe(true);
  });

  it('donne la même icône à la même destination dans l’onglet et dans l’arbre', () => {
    for (const persona of Object.values(NAVIGATION)) {
      for (const tab of persona.tabs) {
        if (tab.href === MORE_TAB_HREF) continue;
        const group = persona.tree.find(g => g.href === tab.href);
        if (!group) continue;
        // Deux icônes différentes pour une même destination font dire deux
        // choses au même symbole d'une moitié de l'interface à l'autre.
        expect(JSON.stringify(group.icon)).toBe(JSON.stringify(tab.icon));
      }
    }
  });

  it('n’emploie que des clés uniques par persona', () => {
    for (const persona of Object.values(NAVIGATION)) {
      const keys: string[] = [];
      persona.tree.forEach(g => {
        keys.push(g.key);
        g.children?.forEach(c => keys.push(c.key));
      });
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('resolveHref', () => {
  it('refuse une destination d’agence tant que l’agence est inconnue', () => {
    // Sans cela, la sidebar produit littéralement /tenant/undefined/properties.
    expect(resolveHref('/tenant/:tenantId/properties', {})).toBeNull();
  });

  it('interpole l’agence quand elle est connue', () => {
    expect(resolveHref('/tenant/:tenantId/properties', { tenantId: TENANT })).toBe(`/tenant/${TENANT}/properties`);
  });

  it('replie le module syndic sur la liste quand aucune copropriété n’est active', () => {
    expect(resolveHref('/tenant/:tenantId/syndics/:syndicId/charges', { tenantId: TENANT })).toBe(
      `/tenant/${TENANT}/syndics?openSyndicSection=charges`
    );
  });

  it('utilise la dernière copropriété consultée quand elle existe', () => {
    expect(resolveHref('/tenant/:tenantId/syndics/:syndicId/charges', { tenantId: TENANT, syndicId: SYNDIC })).toBe(
      `/tenant/${TENANT}/syndics/${SYNDIC}/charges`
    );
  });

  it('laisse passer le déclencheur « Plus », qui n’est pas une destination', () => {
    expect(resolveHref(MORE_TAB_HREF, {})).toBe(MORE_TAB_HREF);
  });
});

describe('resolvePersona', () => {
  const base = { hasTenantMembership: false, isLoadingMembership: false };

  it('classe les cinq personas', () => {
    expect(resolvePersona({ ...base, globalRole: 'SUPER_ADMIN' })).toBe('super-admin');
    expect(resolvePersona({ ...base, hasTenantMembership: true })).toBe('collaborateur');
    expect(resolvePersona({ ...base, clientType: 'OWNER' })).toBe('proprietaire');
    expect(resolvePersona({ ...base, clientType: 'RENTER' })).toBe('locataire');
    expect(resolvePersona({ ...base, clientType: 'CO_OWNER' })).toBe('coproprietaire');
    expect(resolvePersona(base)).toBe('non-rattache');
  });

  it('ne tranche pas tant que l’appartenance charge', () => {
    // Afficher le menu public à un collaborateur, même une seconde, est pire
    // que de n'afficher aucun menu.
    expect(resolvePersona({ ...base, isLoadingMembership: true })).toBeNull();
  });
});

describe('contextFromPath', () => {
  it('extrait agence et copropriété', () => {
    expect(contextFromPath(`/tenant/${TENANT}/syndics/${SYNDIC}/lots`)).toEqual({
      tenantId: TENANT,
      syndicId: SYNDIC
    });
    expect(contextFromPath(`/tenant/${TENANT}/properties`)).toEqual({ tenantId: TENANT });
    expect(contextFromPath('/dashboard')).toEqual({});
  });
});

describe('fil d’Ariane', () => {
  it('absorbe les identifiants et masque le préfixe d’agence', () => {
    expect(buildCrumbs(`/tenant/${TENANT}/rental/leases`).map(c => c.label)).toEqual(['Gestion locative', 'Baux']);
  });

  it('ne dit jamais « Agence » à un locataire', () => {
    // Le segment `tenant` recouvre le préfixe d'agence ET la racine du portail
    // locataire : sans distinction, on lit « Agence › Mon bail ».
    expect(buildCrumbs('/tenant/lease').map(c => c.label)).toEqual(['Accueil', 'Mon bail']);
    expect(buildCrumbs('/tenant/payments').map(c => c.label)).toEqual(['Accueil', 'Paiements']);
  });

  it('efface le préfixe technique `admin` côté agence', () => {
    expect(buildCrumbs(`/tenant/${TENANT}/admin/maintenance/tickets`).map(c => c.label)).toEqual([
      'Maintenance',
      'Tickets'
    ]);
    // Mais le conserve côté plateforme, où il désigne une vraie section.
    expect(buildCrumbs('/admin/tenants').map(c => c.label)).toEqual(['Administration', 'Agences']);
  });

  it('dit « Encaisser » là où l’onglet dit « Encaisser »', () => {
    const labels = buildCrumbs(`/tenant/${TENANT}/rental/installments`).map(c => c.label);
    expect(labels).toContain('Encaisser');
    expect(labels).not.toContain('Échéances');
  });

  it('nomme les écrans de la finance comme leurs onglets, accents compris', () => {
    expect(buildCrumbs(`/tenant/${TENANT}/finance/balance-agee`).map(c => c.label)).toEqual([
      'Finance',
      'Balance âgée'
    ]);
    expect(buildCrumbs(`/tenant/${TENANT}/finance/pieces-de-caisse`).map(c => c.label)).toEqual([
      'Finance',
      'Pièce de caisse'
    ]);
    expect(buildCrumbs(`/tenant/${TENANT}/finance/chantiers/42/cloture`).map(c => c.label)).toEqual([
      'Finance',
      'Chantiers',
      'Lots et clôture'
    ]);
    expect(buildCrumbs(`/tenant/${TENANT}/finance/stock/parametrage`).map(c => c.label)).toEqual([
      'Finance',
      'Stock',
      'Articles et lieux'
    ]);
  });

  it('ne rend rien pour un seul niveau', () => {
    expect(buildCrumbs('/dashboard')).toHaveLength(1);
  });
});

describe('table de libellés', () => {
  it('reconnaît les identifiants', () => {
    expect(isIdSegment(TENANT)).toBe(true);
    expect(isIdSegment('42')).toBe(true);
    expect(isIdSegment('leases')).toBe(false);
  });

  it('rend visible un segment inconnu au lieu de le masquer', () => {
    expect(labelForSegment('segment-inedit')).toBe('Segment inedit');
    expect(ROUTE_LABELS.leases).toBe('Baux');
  });
});

describe('gardes de portail', () => {
  it('distingue le portail locataire du préfixe d’agence', () => {
    expect(isTenantPortalPath('/tenant')).toBe(true);
    expect(isTenantPortalPath('/tenant/lease')).toBe(true);
    expect(isTenantPortalPath(`/tenant/${TENANT}/properties`)).toBe(false);
    expect(isOwnerPortalPath('/owner/revenues')).toBe(true);
    expect(isOwnerPortalPath('/dashboard')).toBe(false);
  });

  it('renvoie un locataire hors du portail propriétaire', () => {
    // OwnerPortal/Layout n'avait AUCUNE garde : un RENTER atteignant /owner
    // obtenait la coquille proprietaire.
    expect(portalRedirect('/owner/revenues', 'RENTER')).toBe('/tenant');
    expect(portalRedirect('/tenant/lease', 'RENTER')).toBeNull();
  });

  it('renvoie un propriétaire hors du portail locataire', () => {
    expect(portalRedirect('/tenant/lease', 'OWNER')).toBe('/owner');
    expect(portalRedirect('/owner/revenues', 'OWNER')).toBeNull();
  });

  it('renvoie au tableau de bord qui n’est ni l’un ni l’autre', () => {
    expect(portalRedirect('/owner', null)).toBe('/dashboard');
    expect(portalRedirect('/tenant', undefined)).toBe('/dashboard');
  });

  it('garde le copropriétaire dans son portail, et y laisse entrer bailleur et locataire', () => {
    expect(isCoOwnerPortalPath('/copropriete')).toBe(true);
    expect(isCoOwnerPortalPath('/copropriete/appels')).toBe(true);
    expect(isCoOwnerPortalPath('/coproprietes')).toBe(false);
    expect(portalRedirect('/copropriete/appels', 'CO_OWNER')).toBeNull();
    expect(portalRedirect('/owner', 'CO_OWNER')).toBe('/copropriete');
    expect(portalRedirect('/tenant/lease', 'CO_OWNER')).toBe('/copropriete');
    // Un bailleur ou un locataire peut AUSSI être copropriétaire : c'est l'API
    // qui tranche, l'écran affiche son refus le cas échéant.
    expect(portalRedirect('/copropriete', 'OWNER')).toBeNull();
    expect(portalRedirect('/copropriete', 'RENTER')).toBeNull();
    expect(portalRedirect('/copropriete', null)).toBe('/dashboard');
  });

  it('ne touche pas aux écrans hors portail', () => {
    expect(portalRedirect(`/tenant/${TENANT}/rental/leases`, 'RENTER')).toBeNull();
    expect(portalRedirect('/dashboard', 'OWNER')).toBeNull();
  });
});

describe('compte non rattaché', () => {
  it('n’est pas un persona : il n’a aucune navigation', () => {
    // L'ancien persona « public » avait deux entrees de menu, dont aucune ne
    // menait nulle part depuis la suppression de la vitrine.
    expect(Object.keys(NAVIGATION)).not.toContain('public');
    expect(Object.keys(NAVIGATION)).not.toContain('non-rattache');
  });

  it('est distingué du chargement en cours', () => {
    const base = { hasTenantMembership: false, isLoadingMembership: false };
    expect(resolvePersona(base)).toBe('non-rattache');
    expect(resolvePersona({ ...base, isLoadingMembership: true })).toBeNull();
  });
});
