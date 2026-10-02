import React from 'react';
import { Alert, Button, Descriptions, Progress, Space, Table, Typography } from 'antd';
import type { CompteRenduImport } from '../../../lib/importation/execution';
import { libelleStatut } from '../../../lib/importation/rapport';
import type { LigneRapport } from '../../../lib/importation/rapport';
import { t } from '../../../i18n/t';

const { Text } = Typography;

interface EtapeImportProps {
  progression: { traitees: number; total: number } | null;
  arretDemande: boolean;
  onArreter: () => void;
}

/** Étape 5 — l'import : progression annoncée poliment, arrêt possible. */
export const EtapeImport: React.FC<EtapeImportProps> = ({ progression, arretDemande, onArreter }) => (
  <Space orientation="vertical" size="middle" style={{ width: '100%', maxWidth: 720 }}>
    <div aria-live="polite">
      <Text>
        {t('Import en cours : {{traitees}} sur {{total}}.', {
          traitees: progression?.traitees ?? 0,
          total: progression?.total ?? 0
        })}
      </Text>
      <Progress
        percent={
          !progression || progression.total === 0 ? 0 : Math.round((progression.traitees / progression.total) * 100)
        }
        status="active"
      />
    </div>
    <Button danger disabled={arretDemande} onClick={onArreter}>
      {t('Arrêter l’import')}
    </Button>
    {arretDemande ? <Text type="secondary">{t('Arrêt demandé : la ligne en cours se termine.')}</Text> : null}
  </Space>
);

export interface CompteursRapport {
  importees: number;
  ignorees: number;
  enErreur: number;
  refusees: number;
  partielles: number;
  horsQuota: number;
  nonTraitees: number;
}

/** Les compteurs du rapport : chaque ligne a exactement un statut. */
export function compterRapport(lignes: LigneRapport[]): CompteursRapport {
  const compte = (statut: LigneRapport['statut']) => lignes.filter(l => l.statut === statut).length;
  return {
    importees: compte('importee'),
    ignorees: compte('ignoree'),
    enErreur: compte('en_erreur'),
    refusees: compte('refusee_serveur'),
    partielles: compte('partielle'),
    horsQuota: compte('hors_quota'),
    nonTraitees: compte('non_traitee')
  };
}

interface EtapeRapportProps {
  lignes: LigneRapport[];
  compteRendu: CompteRenduImport | null;
  nbARelancer: number;
  /** Une relecture des listes est en cours : les boutons de reprise attendent. */
  occupe?: boolean;
  onTelecharger: () => void;
  onRelancer: () => void;
  onRevenir: () => void;
  onRecommencer: () => void;
}

/** Étape 6 — le rapport. */
export const EtapeRapport: React.FC<EtapeRapportProps> = props => {
  const { lignes, compteRendu } = props;
  const c = compterRapport(lignes);
  const incertaines = new Set(
    (compteRendu?.echouees ?? [])
      .filter(e => e.relancable === false && e.code === 'REPONSE_INCERTAINE')
      .map(e => e.numero)
  );
  const aExpliquer = lignes.filter(
    l => l.statut === 'refusee_serveur' || l.statut === 'partielle' || l.statut === 'non_traitee'
  );
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%', maxWidth: 900 }}>
      {compteRendu?.interrompue ? (
        <Alert
          type="warning"
          showIcon
          message={
            compteRendu.interrompue === 'utilisateur'
              ? t('Import arrêté à votre demande : les lignes restantes n’ont pas été traitées.')
              : t(
                  'Import arrêté : la limite de requêtes du serveur est atteinte (1 000 requêtes par 15 minutes) : attendez quelques minutes puis cliquez sur « Relancer ».'
                )
          }
        />
      ) : null}

      <Descriptions size="small" column={2} bordered title={t('Rapport')}>
        <Descriptions.Item label={t('Importées')}>{c.importees}</Descriptions.Item>
        <Descriptions.Item label={t('Ignorées')}>{c.ignorees}</Descriptions.Item>
        <Descriptions.Item label={t('En erreur')}>{c.enErreur}</Descriptions.Item>
        <Descriptions.Item label={t('Refusées par le serveur')}>{c.refusees}</Descriptions.Item>
        <Descriptions.Item label={t('Partielles')}>{c.partielles}</Descriptions.Item>
        <Descriptions.Item label={t('Hors quota')}>{c.horsQuota}</Descriptions.Item>
        <Descriptions.Item label={t('Non traitées')}>{c.nonTraitees}</Descriptions.Item>
      </Descriptions>

      {aExpliquer.length > 0 ? (
        <Table
          size="small"
          rowKey={ligne => String(ligne.numero)}
          dataSource={aExpliquer}
          pagination={{ pageSize: 25, showSizeChanger: false }}
          columns={[
            { title: t('Ligne'), dataIndex: 'numero', key: 'numero', width: 90 },
            { title: t('Statut'), key: 'statut', width: 180, render: (_v, l: LigneRapport) => libelleStatut(l.statut) },
            {
              title: t('Motif'),
              key: 'motif',
              render: (_v, l: LigneRapport) => (
                <div>
                  <Text>{l.motif}</Text>
                  {incertaines.has(l.numero) ? (
                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      {t(
                        'Réponse du serveur non reçue : l’élément a peut-être été créé. Vérifiez la liste avant de le recréer.'
                      )}
                    </Text>
                  ) : null}
                </div>
              )
            }
          ]}
        />
      ) : null}

      {c.importees > 0 ? (
        <Alert type="success" showIcon message={t('{{nombre}} ligne(s) importée(s).', { nombre: c.importees })} />
      ) : null}

      <Space wrap>
        <Button type="primary" onClick={props.onTelecharger}>
          {t('Télécharger le rapport (CSV)')}
        </Button>
        {props.nbARelancer > 0 ? (
          <Button onClick={props.onRelancer}>
            {t('Relancer les lignes refusées ({{nombre}})', { nombre: props.nbARelancer })}
          </Button>
        ) : null}
        <Button disabled={props.occupe} loading={props.occupe} onClick={props.onRevenir}>
          {t('Revenir à l’aperçu')}
        </Button>
        <Button disabled={props.occupe} onClick={props.onRecommencer}>
          {t('Importer un autre fichier')}
        </Button>
      </Space>
    </Space>
  );
};
