import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Drawer, Layout } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { NAVIGATION } from '../../navigation/model';
import { contextFromPath, lastSyndicKey, resolvePersona } from '../../navigation/resolve';
import type { NavContext } from '../../navigation/resolve';
import { SkeletonDetail } from '../primitives/Skeleton';
import { AppHeader } from './AppHeader';
import { AppNavigation } from './AppNavigation';
import { BottomTabBar } from './BottomTabBar';

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
  const { user, tenantMembership, tenantClient, isLoadingMembership } = useAuth();
  const { isDesktop, isTablet } = useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerOnlyMore, setDrawerOnlyMore] = useState(false);

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

  const nav = persona ? NAVIGATION[persona] : null;

  // Tant que le persona n'est pas tranché, on rend la coquille sans menu
  // plutôt qu'un menu faux : afficher le menu public à un collaborateur, même
  // une seconde, est pire que de n'afficher aucun menu.
  const showSidebar = Boolean(nav) && isDesktop;
  const showRail = Boolean(nav) && isTablet;
  const showTabs = Boolean(nav) && !isDesktop && (nav?.tabs.length ?? 0) > 0;
  const canOpenDrawer = Boolean(nav) && !isDesktop;

  const sidebarWidth = showSidebar ? 256 : showRail ? 72 : 0;

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
          <Suspense fallback={<SkeletonDetail aria-label="Chargement de l'écran" />}>
            <Outlet />
          </Suspense>
        </Layout.Content>
      </Layout>

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
          title="Navigation"
          width={288}
          styles={{
            body: { padding: 0, background: 'var(--surface-inverse)' },
            header: { background: 'var(--surface-inverse)', borderBottom: 'none' }
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
