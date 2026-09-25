import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Layout } from 'antd';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useDisabledMenuKeys, useFilteredNavigation } from '../../hooks/useMenuAccess';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { actionForPath } from '../../navigation/actions';
import { NAVIGATION } from '../../navigation/model';
import { contextFromPath, lastSyndicKey, portalRedirect, resolvePersona } from '../../navigation/resolve';
import type { NavContext } from '../../navigation/resolve';
import { AccountNotLinked } from '../primitives/AccountNotLinked';
import { SkeletonDetail } from '../primitives/Skeleton';
import { AppHeader } from './AppHeader';
import { AppNavigation } from './AppNavigation';
import { BottomTabBar } from './BottomTabBar';
import { TenantSuspendedBanner } from '../TenantSuspendedBanner';
import { t } from '../../i18n/t';

/**
 * `<AppShell>` — coquille unique, montée AU NIVEAU ROUTE (REFONTE_UI_UX.md §4.1).
 *
 * `DashboardLayout` n'était pas un layout de route : il était importé et rendu
 * par **81 pages**, à l'intérieur de chaque `<ProtectedRoute>`. Trois
 * conséquences, toutes corrigées ici :
 *
 *   - la coquille entière était **démontée et remontée à chaque navigation** :
 *     le menu se refermait, l'état des accordéons était recalculé, la position
 *     de défilement perdue. Avec `<Outlet/>`, elle persiste ;
 *   - une barre d'onglets basse, un fil d'Ariane dérivé du routeur ou une
 *     transition entre écrans étaient impossibles ;
 *   - le code de coquille existait en trois exemplaires quasi identiques —
 *     `dashboard-layout` + `sidebar`, `TenantPortal/Layout`,
 *     `OwnerPortal/Layout` — soit environ 700 lignes dupliquées.
 *
 * La navigation est choisie par le **persona** résolu depuis `AuthContext`, pas
 * par l'arborescence de fichiers : c'est la même coquille pour le collaborateur,
 * le propriétaire et le locataire.
 *
 * Trois paliers, alignés sur le §3.4 :
 *   - **≥ 992 px** : sidebar fixe de 256 px, pas de barre d'onglets ;
 *   - **768-991 px** : rail de 72 px en icônes, plus le drawer au tap ;
 *   - **< 768 px** : barre d'onglets basse, drawer derrière « Plus ».
 */
export const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, tenantMembership, tenantClient, isLoadingMembership } = useAuth();
  const { isDesktop, isTablet } = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerOnlyMore, setDrawerOnlyMore] = useState(false);

  // La coquille est le seul endroit d'où la position de défilement se gère :
  // elle survit aux changements d'écran depuis le Lot 1, les écrans non.
  useScrollRestoration();

  const persona = useMemo(
    () =>
      resolvePersona({
        globalRole: user?.globalRole,
        hasTenantMembership: Boolean(tenantMembership),
        clientType: tenantClient?.clientType,
        isLoadingMembership
      }),
    [user?.globalRole, tenantMembership, tenantClient?.clientType, isLoadingMembership]
  );

  /**
   * Contexte de résolution des `href`. L'agence vient de l'URL quand elle s'y
   * trouve, sinon de l'appartenance ; la copropriété vient de l'URL, sinon de
   * la dernière consultée — c'est ce qui rend le groupe Syndic contextuel.
   */
  const navContext: NavContext = useMemo(() => {
    const fromPath = contextFromPath(location.pathname);
    const tenantId = fromPath.tenantId ?? tenantMembership?.tenantId ?? null;
    let syndicId = fromPath.syndicId ?? null;
    if (!syndicId && tenantId) {
      try {
        syndicId = localStorage.getItem(lastSyndicKey(tenantId));
      } catch {
        // Navigation privée ou stockage refusé : le groupe Syndic se replie
        // sur la liste, ce qui reste utilisable.
        syndicId = null;
      }
    }
    return { tenantId, syndicId };
  }, [location.pathname, tenantMembership?.tenantId]);

  // Mémorise la copropriété consultée, pour que le menu y revienne.
  useEffect(() => {
    const fromPath = contextFromPath(location.pathname);
    if (!fromPath.tenantId || !fromPath.syndicId) return;
    try {
      localStorage.setItem(lastSyndicKey(fromPath.tenantId), fromPath.syndicId);
    } catch {
      /* stockage indisponible : sans conséquence fonctionnelle */
    }
  }, [location.pathname]);

  // Le drawer se referme à la navigation : le laisser ouvert masquerait
  // l'écran qu'on vient d'atteindre.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  /**
   * Garde de portail. `TenantPortal/Layout` la portait dans un `useEffect` ;
   * `OwnerPortal/Layout` n'en avait AUCUNE, si bien qu'un locataire atteignant
   * /owner obtenait la coquille proprietaire (§4.3). La coquille unique la pose
   * pour les deux, et par un `<Navigate>` plutot qu'un effet : rediriger apres
   * le rendu laisse voir un instant l'ecran qu'on n'aurait pas du atteindre.
   */
  const redirectTo = isLoadingMembership ? null : portalRedirect(location.pathname, tenantClient?.clientType);

  const personaNav = persona && persona !== 'non-rattache' ? NAVIGATION[persona] : null;

  /**
   * Menus coupes pour ce compte (Admin > Roles et permissions > Menus).
   * L'arbre du persona dit ce qui EXISTE ; cette carte dit ce que l'agence a
   * decide de montrer a ce role. Sans ce filtrage, l'ecran d'administration ne
   * serait qu'une declaration d'intention.
   */
  const disabledMenuKeys = useDisabledMenuKeys(navContext.tenantId);
  const nav = useFilteredNavigation(personaNav, disabledMenuKeys);

  // Tant que le persona n'est pas tranché, on rend la coquille sans menu
  // plutôt qu'un menu faux : afficher le menu public à un collaborateur, même
  // une seconde, est pire que de n'afficher aucun menu.
  const showSidebar = Boolean(nav) && isDesktop;
  const showRail = Boolean(nav) && isTablet;
  const showTabs = Boolean(nav) && !isDesktop && (nav?.tabs.length ?? 0) > 0;
  const canOpenDrawer = Boolean(nav) && !isDesktop;

  const sidebarWidth = showSidebar ? 256 : showRail ? 72 : 0;

  /**
   * Action primaire de l'ecran courant, rendue en FAB sous 992 px (§4.3).
   * Elle est portee par la coquille et non par l'ecran : le Lot 1 ne refond
   * aucun ecran, et le bouton primaire du <PageHeader> arrivera avec le lot
   * qui refond l'ecran concerne.
   */
  const action = actionForPath(location.pathname, navContext.tenantId);

  if (redirectTo) return <Navigate to={redirectTo} replace />;

  /**
   * Compte authentifie rattache a rien : ni agence, ni bail, ni bien. Ce n'est
   * pas un persona, c'est un etat de compte — il n'a aucune destination, donc
   * ni sidebar, ni barre d'onglets, ni action flottante. On rend l'ecran
   * dedie a la place de la coquille, quelle que soit la route demandee.
   */
  if (persona === 'non-rattache') return <AccountNotLinked />;

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
      {(showSidebar || showRail) && nav && (
        <AppNavigation persona={nav} context={navContext} variant={showRail ? 'rail' : 'sidebar'} />
      )}

      <Layout
        style={{
          marginInlineStart: sidebarWidth,
          background: 'var(--surface-page)',
          transitionProperty: 'margin-inline-start',
          transitionDuration: 'var(--duration-base)',
          transitionTimingFunction: 'var(--ease-standard)'
        }}
      >
        <TenantSuspendedBanner />
        <AppHeader
          onOpenNavigation={
            canOpenDrawer
              ? () => {
                  setDrawerOnlyMore(false);
                  setDrawerOpen(true);
                }
              : undefined
          }
        />

        <Layout.Content
          id="main"
          role="main"
          style={{
            padding: 'var(--page-padding)',
            // Réserve la hauteur de la barre d'onglets, sinon le dernier
            // élément d'une liste passe dessous.
            paddingBottom: showTabs
              ? 'calc(var(--control-h-lg) + var(--space-6) + env(safe-area-inset-bottom, 0px))'
              : 'var(--page-padding)'
          }}
        >
          {/* Le squelette remplace le `Spin` plein écran : la coquille est
              déjà peinte, seul le contenu manque (§5.6). */}
          <Suspense fallback={<SkeletonDetail aria-label={t("Chargement de l'écran")} />}>
            <Outlet />
          </Suspense>
        </Layout.Content>
      </Layout>

      {!isDesktop && action && (
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={action.icon}
          aria-label={action.label}
          onClick={() => navigate(action.href)}
          style={{
            position: 'fixed',
            insetInlineEnd: 'var(--space-4)',
            // Au-dessus de la barre d'onglets, jamais dessus.
            bottom: showTabs
              ? 'calc(var(--control-h-lg) + var(--space-4) + env(safe-area-inset-bottom, 0px))'
              : 'calc(var(--space-4) + env(safe-area-inset-bottom, 0px))',
            zIndex: 'var(--z-bottom-bar)' as unknown as number,
            width: 56,
            height: 56,
            boxShadow: 'var(--shadow-lg)'
          }}
        />
      )}

      {showTabs && nav && (
        <BottomTabBar
          tabs={nav.tabs}
          context={navContext}
          onOpenMore={() => {
            setDrawerOnlyMore(true);
            setDrawerOpen(true);
          }}
        />
      )}

      {nav && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          // Bouton de fermeture VISIBLE : `closable={false}` obligeait à taper
          // le masque, geste ni découvrable ni accessible au clavier (§4.2).
          closable
          title={t('Navigation')}
          width={288}
          styles={{
            body: { padding: 0, background: 'var(--surface-nav)' },
            header: { background: 'var(--surface-nav)', borderBottom: 'none' }
          }}
          classNames={{ header: 'app-drawer-header' }}
        >
          <AppNavigation
            persona={nav}
            context={navContext}
            variant="drawer"
            onlyMore={drawerOnlyMore}
            onNavigate={() => setDrawerOpen(false)}
          />
        </Drawer>
      )}
    </Layout>
  );
};
