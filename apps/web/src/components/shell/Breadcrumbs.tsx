import React, { useMemo } from 'react';
import { Breadcrumb, Button } from 'antd';
import { LeftOutlined } from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { isIdSegment, labelForSegment } from '../../navigation/route-labels';
import { TENANT_PORTAL_SEGMENTS } from '../../navigation/resolve';

/**
 * `<Breadcrumbs>` — dérivé du routeur (REFONTE_UI_UX.md §4.3).
 *
 * Le dépôt n'en avait aucun, pour une profondeur qui atteint cinq segments
 * (`/tenant/:tenantId/syndics/:syndicId/lots/:lotId/compte`).
 *
 * Deux règles du §4.3 sont appliquées ici :
 *   - les libellés viennent de la même table que le menu, jamais du composant
 *     d'écran ;
 *   - **sous 992 px, pas de fil complet** : la profondeur ne tient pas sur
 *     375 px. Il est réduit à une flèche « ‹ Retour à … » vers le parent
 *     immédiat, qui est aussi le geste attendu sur mobile.
 *
 * Les segments d'identifiant (UUID, entier) sont absorbés par le segment qui
 * les précède : « Baux › BAIL-2026-0184 » n'apporte rien de plus que « Baux »
 * tant que le titre de l'écran porte déjà la référence.
 */

export interface Crumb {
  label: string;
  to?: string;
}

/** Découpe un chemin en fil d'Ariane, en absorbant les identifiants. */
export function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [];
  let acc = '';

  segments.forEach((segment, index) => {
    acc += `/${segment}`;
    const isLast = index === segments.length - 1;

    // Le segment `tenant` recouvre deux espaces disjoints, et une table plate
    // segment -> libellé est structurellement incapable de les distinguer :
    //   /tenant/<uuid>/properties  -> préfixe d'agence, invisible pour l'usager
    //   /tenant/lease              -> racine du portail LOCATAIRE
    // Sans ce traitement, un locataire lit « Agence › Mon bail » — précisément
    // le mot que le §4.3 s'emploie à ne jamais lui montrer.
    if (segment === 'tenant') {
      const next = segments[index + 1];
      // Liste fermee plutot qu'heuristique sur la forme de l'identifiant :
      // voir TENANT_PORTAL_SEGMENTS.
      const isPortal = next === undefined || (TENANT_PORTAL_SEGMENTS as readonly string[]).includes(next);
      if (!isPortal) return;
      crumbs.push({ label: 'Accueil', to: isLast ? undefined : '/tenant' });
      return;
    }

    // Même collision, moins grave : `admin` désigne l'administration de la
    // plateforme (/admin/tenants) ou un préfixe technique côté agence
    // (/tenant/<id>/admin/maintenance/...). Dans le second cas il n'apporte
    // rien et ne doit pas apparaître.
    if (segment === 'admin' && segments[index + 1] === 'maintenance') return;

    if (isIdSegment(segment)) return;

    crumbs.push({ label: labelForSegment(segment), to: isLast ? undefined : acc });
  });

  return crumbs;
}

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDesktop } = useBreakpoint();

  const crumbs = useMemo(() => buildCrumbs(location.pathname), [location.pathname]);

  // Un seul niveau : le titre de l'écran suffit, le fil n'apprend rien.
  if (crumbs.length < 2) return null;

  if (!isDesktop) {
    const parent = crumbs[crumbs.length - 2];
    return (
      <Button
        type="text"
        size="small"
        icon={<LeftOutlined />}
        onClick={() => (parent.to ? navigate(parent.to) : navigate(-1))}
        style={{ paddingInline: 0, color: 'var(--text-secondary)' }}
      >
        {`Retour à ${parent.label}`}
      </Button>
    );
  }

  return (
    <nav aria-label="Fil d'Ariane">
      <Breadcrumb
        items={crumbs.map(c => ({
          title: c.to ? <Link to={c.to}>{c.label}</Link> : c.label
        }))}
      />
    </nav>
  );
};
