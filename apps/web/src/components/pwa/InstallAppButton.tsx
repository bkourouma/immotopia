import React from 'react';
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { promptInstall, useInstallState } from '../../pwa/install';
import { t } from '../../i18n/t';

/**
 * « Installer l'application » : ne s'affiche que si l'installation est
 * réellement possible (navigateur prêt, application pas déjà installée).
 * Sur iPhone/iPad, une consigne remplace le bouton.
 */
export const InstallAppButton: React.FC<{ block?: boolean }> = ({ block }) => {
  const state = useInstallState();

  if (state === 'prompt') {
    return (
      <Button block={block} icon={<DownloadOutlined />} onClick={() => void promptInstall()}>
        {t("Installer l'application")}
      </Button>
    );
  }
  if (state === 'ios') {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #64748b)', textAlign: 'center' }}>
        {t("Sur iPhone : touchez Partager, puis « Sur l'écran d'accueil ».")}
      </p>
    );
  }
  return null;
};
