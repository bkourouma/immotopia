import React from 'react';
import { BarChartOutlined, FileTextOutlined, TableOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { t } from '../../../i18n/t';
import type { CopilotArtifact } from '../../../types/copilot';

const ICONS = {
  table: <TableOutlined aria-hidden />,
  markdown: <FileTextOutlined aria-hidden />,
  chart: <BarChartOutlined aria-hidden />
} as const;

/** Pastille d'un message qui renvoie vers un artefact du panneau. */
export const ArtifactChip: React.FC<{
  title: string;
  kind: CopilotArtifact['kind'];
  onOpen?: () => void;
}> = ({ title, kind, onOpen }) => {
  const label = title || t('Résultat');
  if (!onOpen) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {ICONS[kind]} {label}
      </span>
    );
  }
  return (
    <Button icon={ICONS[kind]} onClick={onOpen} style={{ maxWidth: '100%', alignSelf: 'flex-start' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('Ouvrir : {{title}}', { title: label })}</span>
    </Button>
  );
};

export default ArtifactChip;
