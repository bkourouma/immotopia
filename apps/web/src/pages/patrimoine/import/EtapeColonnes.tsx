import React from 'react';
import { Alert, Button, Descriptions, Select, Space, Table, Typography } from 'antd';
import { champsObligatoiresManquants } from '../../../lib/importation/rapprochement';
import type { FichierLu } from '../../../lib/importation/fichier';
import type { DescripteurNature } from '../../../lib/importation/types';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface EtapeColonnesProps {
  descripteur: DescripteurNature;
  feuille: FichierLu;
  nomFichier: string;
  exemplesIgnores: number;
  rapprochement: Array<string | null>;
  onRapprocher: (rapprochement: Array<string | null>) => void;
  preparationEnCours: boolean;
  /** Le fichier a été lu en Windows-1252 : les accents sont à vérifier. */
  avertirEncodage: boolean;
  onChangerFichier: () => void;
  onPrevisualiser: () => void;
}

/** FR-010 : un CSV qui n'est pas en UTF-8 est lu en Windows-1252, et les accents peuvent mentir. */
export const AlerteEncodage: React.FC = () => (
  <Alert
    type="warning"
    showIcon
    message={t('Ce fichier n’est pas en UTF-8 : il a été lu en Windows-1252. Vérifiez les accents dans l’aperçu.')}
  />
);

/** Libère le champ `valeur` là où il était déjà pris : un champ ne sert qu'une fois. */
export function affecterColonne(
  precedent: Array<string | null>,
  index: number,
  valeur: string | null
): Array<string | null> {
  return precedent.map((cle, position) => {
    if (position === index) return valeur;
    return valeur && cle === valeur ? null : cle;
  });
}

/** Étape 3 — le rapprochement colonne du fichier ↔ champ du document. */
export const EtapeColonnes: React.FC<EtapeColonnesProps> = props => {
  const { descripteur, feuille, nomFichier, exemplesIgnores, rapprochement, onRapprocher } = props;
  const manquants = champsObligatoiresManquants(descripteur, rapprochement);
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label={t('Fichier')}>{nomFichier}</Descriptions.Item>
        <Descriptions.Item label={t('Feuille lue')}>{feuille.nomFeuille}</Descriptions.Item>
        <Descriptions.Item label={t('Lignes trouvées')}>{feuille.lignes.length}</Descriptions.Item>
      </Descriptions>

      {props.avertirEncodage ? <AlerteEncodage /> : null}

      {exemplesIgnores > 0 ? (
        <Alert type="info" showIcon message={t('Ligne d’exemple ignorée : {{nombre}}', { nombre: exemplesIgnores })} />
      ) : null}

      {manquants.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message={t('Champs obligatoires non rapprochés')}
          description={manquants.map(champ => t(champ.libelle)).join(' · ')}
        />
      ) : null}

      <Table
        size="small"
        pagination={false}
        rowKey={ligne => String(ligne.index)}
        dataSource={feuille.colonnes.map((entete, index) => ({ entete, index }))}
        columns={[
          { title: t('Colonne du fichier'), dataIndex: 'entete', key: 'entete' },
          {
            title: t('Exemple'),
            key: 'exemple',
            render: (_valeur, ligne: { index: number }) => (
              <Text type="secondary">{feuille.lignes[0]?.cellules[ligne.index] ?? ''}</Text>
            )
          },
          {
            title: t('Champ du document'),
            key: 'champ',
            render: (_valeur, ligne: { index: number; entete: string }) => {
              const choisi = rapprochement[ligne.index];
              const champ = descripteur.champs.find(candidat => candidat.cle === choisi);
              return (
                <div>
                  <Select
                    style={{ width: '100%', minWidth: 220 }}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder={t('Ne pas importer cette colonne')}
                    aria-label={t('Champ pour la colonne {{colonne}}', { colonne: ligne.entete })}
                    value={choisi ?? undefined}
                    onChange={valeur => onRapprocher(affecterColonne(rapprochement, ligne.index, valeur ?? null))}
                    options={descripteur.champs.map(candidat => ({
                      value: candidat.cle,
                      label: candidat.obligatoire ? `${t(candidat.libelle)} *` : t(candidat.libelle)
                    }))}
                  />
                  {champ?.aide ? (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      {t(champ.aide)}
                    </Text>
                  ) : null}
                </div>
              );
            }
          }
        ]}
      />

      <Space>
        <Button onClick={props.onChangerFichier}>{t('Changer de fichier')}</Button>
        <Button
          type="primary"
          disabled={manquants.length > 0 || feuille.lignes.length === 0}
          loading={props.preparationEnCours}
          onClick={props.onPrevisualiser}
        >
          {t('Prévisualiser')}
        </Button>
      </Space>
    </Space>
  );
};
