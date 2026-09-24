import React, { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { Skeleton, Typography } from 'antd';
import {
  AccountBookOutlined,
  AlertOutlined,
  ApartmentOutlined,
  BankOutlined,
  CalendarOutlined,
  FolderOutlined,
  IdcardOutlined,
  SendOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined
} from '@ant-design/icons';
import { WorkspaceTabs } from './WorkspaceTabs';
import type { WorkspaceTabItem } from './WorkspaceTabs';
import { getSyndicate } from '../../services/syndic-service';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

/**
 * `<SyndicWorkspaceLayout>` — en-tête + barre d'onglets communs aux trois
 * familles d'écrans Syndic (Copropriété, Finances, Assemblées et documents).
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
    <div>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Text
          style={{
            display: 'block',
            fontSize: 'var(--font-size-caption)',
            fontWeight: 'var(--font-weight-caption)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-tertiary)'
          }}
        >
          {FAMILY_LABELS[family]}
        </Text>
        {loading ? (
          <Skeleton.Input active size="small" style={{ marginTop: 'var(--space-1)', maxWidth: 280 }} />
        ) : (
          <Title level={3} style={{ margin: 0 }}>
            {name ?? t('Copropriété')}
          </Title>
        )}
      </div>

      <div style={{ marginBottom: 'var(--space-5)' }}>
        <WorkspaceTabs items={tabs} ariaLabel={t('Sections de la copropriété')} />
      </div>

      <Outlet />
    </div>
  );
};
