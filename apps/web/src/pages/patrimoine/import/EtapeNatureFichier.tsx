import React from 'react';
import { Alert, Button, Radio, Space, Typography, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { LIMITES_IMPORT } from '../../../lib/importation/fichier';
import type { DescripteurNature } from '../../../lib/importation/types';
import { t } from '../../../i18n/t';

const { Text, Paragraph } = Typography;

interface EtapeNatureProps {
  descripteurs: DescripteurNature[];
  natureCle: string | null;
  onChoisir: (cle: string) => void;
  chargementEnCours: boolean;
  erreurChargement: boolean;
  onReessayer: () => void;
  onContinuer: () => void;
}

/** Étape 1 — la nature : Biens ou Valorisations. */
export const EtapeNature: React.FC<EtapeNatureProps> = props => {
  const { descripteurs, natureCle, onChoisir, chargementEnCours, erreurChargement, onReessayer, onContinuer } = props;
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%', maxWidth: 640 }}>
      <Alert
        type="info"
        showIcon
        message={t('Les baux et les locataires ne s’importent pas ici.')}
        description={t('Cet import crée des biens et leurs valorisations, rien d’autre.')}
      />
      <Radio.Group
        value={natureCle ?? undefined}
        onChange={evenement => onChoisir(evenement.target.value as string)}
        aria-label={t('Ce que le fichier contient')}
      >
        <Space orientation="vertical" size="middle">
          {descripteurs.map(nature => (
            <Radio key={nature.cle} value={nature.cle}>
              <Text strong>{t(nature.libelle)}</Text>
              <Paragraph type="secondary" style={{ marginBlockEnd: 0, maxWidth: 560 }}>
                {t(nature.description)}
              </Paragraph>
            </Radio>
          ))}
        </Space>
      </Radio.Group>

      {erreurChargement ? (
        <Alert
          type="error"
          showIcon
          message={t('Les listes de référence n’ont pas pu être chargées.')}
          action={
            <Button size="small" onClick={onReessayer}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}

      <Button
        type="primary"
        disabled={natureCle === null || chargementEnCours || erreurChargement}
        loading={natureCle !== null && chargementEnCours}
        onClick={onContinuer}
      >
        {t('Continuer')}
      </Button>
    </Space>
  );
};

interface EtapeFichierProps {
  descripteur: DescripteurNature;
  lectureEnCours: boolean;
  erreurLecture: string | null;
  onFichier: (fichier: File) => void;
  onTelechargerGabarit: () => void;
  onRevenir: () => void;
}

/** Étape 2 — le fichier : gabarit, formats, limites, dépôt. */
export const EtapeFichier: React.FC<EtapeFichierProps> = props => {
  const { descripteur, lectureEnCours, erreurLecture, onFichier, onTelechargerGabarit, onRevenir } = props;
  const proprietes: UploadProps = {
    accept: '.xlsx,.csv',
    multiple: false,
    showUploadList: false,
    // `false` : rien n'est envoyé, le fichier reste dans le navigateur.
    beforeUpload: fichier => {
      onFichier(fichier as File);
      return false;
    }
  };
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%', maxWidth: 640 }}>
      <Text>{t('Nature choisie : {{nature}}', { nature: t(descripteur.libelle) })}</Text>
      <Button icon={<DownloadOutlined />} onClick={onTelechargerGabarit}>
        {t('Télécharger le gabarit Excel')}
      </Button>
      <Paragraph type="secondary" style={{ marginBlockEnd: 0 }}>
        {t('Formats acceptés : .xlsx et .csv (séparateur ; ou , — encodage UTF-8).')}{' '}
        {t('Taille maximale : {{taille}} Mo, {{lignes}} lignes.', {
          taille: Math.round(LIMITES_IMPORT.tailleMaxOctets / (1024 * 1024)),
          lignes: LIMITES_IMPORT.lignesMax.toLocaleString('fr-FR')
        })}
      </Paragraph>

      {erreurLecture ? <Alert type="error" showIcon role="alert" message={erreurLecture} /> : null}

      <Upload.Dragger {...proprietes} disabled={lectureEnCours}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{t('Déposer le fichier, ou cliquer pour le choisir')}</p>
        <p className="ant-upload-hint">{t('Le fichier reste sur ce poste : il est lu ici et n’est jamais envoyé.')}</p>
      </Upload.Dragger>
      {lectureEnCours ? (
        <Text type="secondary" aria-live="polite">
          {t('Lecture du fichier…')}
        </Text>
      ) : null}
      <Button disabled={lectureEnCours} onClick={onRevenir}>
        {t('Revenir à la nature')}
      </Button>
    </Space>
  );
};
