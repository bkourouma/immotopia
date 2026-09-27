import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AccountBookOutlined,
  AlertOutlined,
  ApartmentOutlined,
  BankOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  FolderOutlined,
  IdcardOutlined,
  SendOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined
} from '@ant-design/icons';
import { WorkspaceLayout } from './WorkspaceLayout';
import type { WorkspaceTabItem } from './WorkspaceTabs';
import { getSyndicate } from '../../services/syndic-service';
import { t } from '../../i18n/t';

/**
 * `<SyndicWorkspaceLayout>` — en-tête + barre d'onglets communs aux trois
 * familles d'écrans Syndic (Copropriété, Finances, Assemblées et documents).
 * Le rendu est celui de `<WorkspaceLayout>`, partagé avec la finance ; ce
 * composant n'y ajoute que le nom de la copropriété et ses onglets.
 *
 * Posé comme route de layout autour de plusieurs `<Route>` existantes dans
 * `App.tsx` : les URL ne changent pas, seul un bandeau apparaît au-dessus de
 * chaque écran. `<Outlet/>` rend l'écran réel, qui garde son propre
 * `<PageHeader>` — celui-ci ne fait que situer : dans quelle copropriété, dans
 * quelle famille d'onglets.
 *
 * Lecture seule : `getSyndicate` n'est appelé que pour afficher le nom, jamais
 * pour muter quoi que ce soit.
 */

type SyndicWorkspaceFamily = 'copropriete' | 'finances' | 'assemblees-documents';

const FAMILY_LABELS: Record<SyndicWorkspaceFamily, string> = {
  copropriete: t('Copropriété'),
  finances: t('Finances'),
  'assemblees-documents': t('Assemblées et documents')
};

function buildTabs(family: SyndicWorkspaceFamily, tenantId: string, syndicId: string): WorkspaceTabItem[] {
  const base = `/tenant/${tenantId}/syndics/${syndicId}`;
  switch (family) {
    case 'copropriete':
      return [
        { key: 'fiche', label: t('Fiche'), href: base, icon: <IdcardOutlined /> },
        { key: 'lots', label: t('Lots'), href: `${base}/lots`, icon: <ApartmentOutlined /> },
        { key: 'prestataires', label: t('Prestataires'), href: `${base}/prestataires`, icon: <ToolOutlined /> },
        {
          key: 'profils-incidents',
          label: t('Profils et incidents'),
          href: `${base}/profils-incidents`,
          icon: <TeamOutlined />
        }
      ];
    case 'finances':
      return [
        { key: 'budgets', label: t('Budgets'), href: `${base}/budgets`, icon: <WalletOutlined /> },
        { key: 'charges', label: t('Appels de charges'), href: `${base}/charges`, icon: <SendOutlined /> },
        {
          key: 'programmation',
          label: t('Programmation'),
          href: `${base}/programmation`,
          icon: <ClockCircleOutlined />
        },
        {
          key: 'suivi-mensuel',
          label: t('Suivi mensuel'),
          href: `${base}/suivi-mensuel`,
          icon: <CalendarOutlined />
        },
        {
          key: 'quittances',
          label: t('Quittances'),
          href: `${base}/quittances`,
          icon: <FolderOutlined />
        },
        { key: 'recouvrement', label: t('Recouvrement'), href: `${base}/recouvrement`, icon: <AlertOutlined /> },
        { key: 'tresorerie', label: t('Trésorerie'), href: `${base}/finances`, icon: <BankOutlined /> },
        {
          key: 'comptabilite',
          label: t('Comptabilité'),
          href: `${base}/comptabilite`,
          icon: <AccountBookOutlined />
        }
      ];
    case 'assemblees-documents':
      return [
        {
          key: 'assemblees',
          label: t('Assemblées générales'),
          href: `${base}/assemblees`,
          icon: <CalendarOutlined />
        },
        { key: 'documents', label: t('Documents'), href: `${base}/documents`, icon: <FolderOutlined /> }
      ];
    default:
      return [];
  }
}

export interface SyndicWorkspaceLayoutProps {
  family: SyndicWorkspaceFamily;
}

export const SyndicWorkspaceLayout: React.FC<SyndicWorkspaceLayoutProps> = ({ family }) => {
  const { tenantId, syndicId } = useParams<{ tenantId: string; syndicId: string }>();
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId || !syndicId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getSyndicate(tenantId, syndicId)
      .then(syndicate => {
        if (!cancelled) setName(syndicate.name);
      })
      .catch(() => {
        // L'écran rendu par <Outlet/> porte déjà sa propre gestion d'erreur
        // (Alert, retry...) : le bandeau se contente de ne pas afficher de nom
        // plutôt que de dupliquer un message d'erreur.
        if (!cancelled) setName(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, syndicId]);

  const tabs = tenantId && syndicId ? buildTabs(family, tenantId, syndicId) : [];

  return (
    <WorkspaceLayout
      eyebrow={FAMILY_LABELS[family]}
      title={name ?? t('Copropriété')}
      titleLoading={loading}
      tabs={tabs}
      tabsLabel={t('Sections de la copropriété')}
    />
  );
};
