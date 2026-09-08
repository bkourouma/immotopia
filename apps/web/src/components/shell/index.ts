/**
 * Coquille applicative (REFONTE_UI_UX.md §4.1).
 *
 * Montée au niveau route, avec `<Outlet/>` : elle persiste d'un écran à
 * l'autre, là où `DashboardLayout` était remonté par chacune des 81 pages.
 */
export { AppShell } from './AppShell';
export { AppHeader } from './AppHeader';
export { AppNavigation } from './AppNavigation';
export { BottomTabBar } from './BottomTabBar';
export { Breadcrumbs, buildCrumbs } from './Breadcrumbs';
export type { Crumb } from './Breadcrumbs';
