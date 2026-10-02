import React, { useState } from 'react';
import { Alert, Button, Checkbox, Input, Radio, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DescripteurNature, LigneEvaluee } from '../../../lib/importation/types';
import { valeurInterpretee } from './import-logic';
import type { CompteursApercu, PolitiqueDoublons } from './import-logic';
import { AlerteEncodage } from './EtapeColonnes';
import type { EstimationQuota } from './quota';
import { t } from '../../../i18n/t';

const { Text } = Typography;

export type EtatQuota = 'sans' | 'chargement' | 'erreur' | 'ok';

export interface EtapeApercuProps {
  descripteur: DescripteurNature;
  /** Lignes après politique de doublons. */
  lignes: LigneEvaluee[];
  /** Case cochée par l'utilisateur, par numéro de ligne. */
  cochees: Map<number, boolean>;
  horsQuota: Set<number>;
  doublonsIgnores: Set<number>;
  compteurs: CompteursApercu;
  exemplesIgnores: number;
  politique: PolitiqueDoublons;
  onPolitique: (politique: PolitiqueDoublons) => void;
  seulementErreurs: boolean;
  onSeulementErreurs: (valeur: boolean) => void;
  etatQuota: EtatQuota;
  estimation: EstimationQuota | null;
  lectureSeule: boolean;
  /** Le fichier a été lu en Windows-1252 : les accents sont à vérifier. */
  avertirEncodage: boolean;
  onModifier: (numero: number, cle: string, valeur: string) => void;
  onBasculer: (numero: number, cochee: boolean) => void;
  onToutBasculer: (cochee: boolean) => void;
  onRevenir: () => void;
  onImporter: () => void;
}

function BandeauQuota(props: Pick<EtapeApercuProps, 'etatQuota' | 'estimation'>): React.ReactElement | null {
  const { etatQuota, estimation } = props;
  if (etatQuota === 'sans') return null;
  if (etatQuota === 'chargement') {
    return <Text type="secondary">{t('Estimation de la capacité de votre abonnement…')}</Text>;
  }
  if (etatQuota === 'erreur' || !estimation) {
    return (
      <Alert
        type="warning"
        showIcon
        message={t(
          'La capacité de votre abonnement n’a pas pu être lue : l’estimation est indisponible, le serveur contrôlera chaque ligne.'
        )}
      />
    );
  }
  const alerte = estimation.horsQuota.length > 0 || estimation.depassementFacture > 0;
  return (
    <Alert
      type={alerte ? 'warning' : 'info'}
      showIcon
      message={t('Capacité de l’abonnement')}
      description={estimation.message}
    />
  );
}

function CelluleEtat(props: { ligne: LigneEvaluee; horsQuota: boolean; doublonIgnore: boolean }): React.ReactElement {
  const { ligne, horsQuota, doublonIgnore } = props;
  if (ligne.erreurs.length > 0 && ligne.selectionnee) {
    return (
      <Space orientation="vertical" size={2}>
        <Text type="danger" strong style={{ fontSize: 12 }}>
          {t('En erreur')}
        </Text>
        {ligne.erreurs.map(motif => (
          <Text key={motif} type="danger" style={{ fontSize: 12 }}>
            {motif}
          </Text>
        ))}
      </Space>
    );
  }
  if (doublonIgnore) {
    return (
      <Space orientation="vertical" size={2}>
        <Tag color="warning">{t('Doublon ignoré')}</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {ligne.doublon}
        </Text>
      </Space>
    );
  }
  if (!ligne.selectionnee && !horsQuota) return <Tag>{t('Décochée')}</Tag>;
  if (horsQuota) return <Tag color="error">{t('Hors quota (estimation)')}</Tag>;
  if (ligne.doublon) {
    return (
      <Space orientation="vertical" size={2}>
        <Tag color="warning">{t('Doublon probable')}</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {ligne.doublon}
        </Text>
      </Space>
    );
  }
  return <Tag color="success">{t('Prête')}</Tag>;
}

interface SuiviEdition {
  /** La ligne dont une cellule a le focus : elle reste visible même devenue valide. */
  enEdition: number | null;
  onFocus: (numero: number) => void;
  onBlur: (numero: number) => void;
}

function construireColonnes(props: EtapeApercuProps, suivi: SuiviEdition): ColumnsType<LigneEvaluee> {
  const { descripteur, cochees, onBasculer, onModifier, onToutBasculer } = props;
  const valeurs = [...cochees.values()];
  return [
    {
      title: (
        <Checkbox
          checked={valeurs.length > 0 && valeurs.every(Boolean)}
          indeterminate={valeurs.some(Boolean) && !valeurs.every(Boolean)}
          onChange={evenement => onToutBasculer(evenement.target.checked)}
          aria-label={t('Tout cocher')}
        />
      ),
      key: 'selection',
      width: 56,
      render: (_valeur, ligne) => (
        <Checkbox
          checked={cochees.get(ligne.numero) ?? false}
          onChange={evenement => onBasculer(ligne.numero, evenement.target.checked)}
          aria-label={t('Importer la ligne {{numero}}', { numero: ligne.numero })}
        />
      )
    },
    {
      title: t('Ligne'),
      key: 'numero',
      width: 72,
      render: (_valeur, ligne) => <Text type="secondary">{ligne.numero}</Text>
    },
    ...descripteur.champs.map(champ => ({
      title: champ.obligatoire ? `${t(champ.libelle)} *` : t(champ.libelle),
      key: champ.cle,
      width: 220,
      render: (_valeur: unknown, ligne: LigneEvaluee) => {
        const cellule = ligne.cellules[champ.cle];
        const interpretee = valeurInterpretee(champ.type, cellule);
        return (
          <div>
            <Input
              size="small"
              status={cellule?.erreur ? 'error' : undefined}
              value={cellule?.texte ?? ''}
              onChange={evenement => onModifier(ligne.numero, champ.cle, evenement.target.value)}
              onFocus={() => suivi.onFocus(ligne.numero)}
              onBlur={() => suivi.onBlur(ligne.numero)}
              aria-label={t('{{champ}}, ligne {{numero}}', { champ: t(champ.libelle), numero: ligne.numero })}
            />
            {cellule?.libelleResolu && cellule.libelleResolu !== cellule.texte ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t(cellule.libelleResolu)}
              </Text>
            ) : null}
            {interpretee !== null ? (
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                {t('Lu : {{valeur}}', { valeur: interpretee })}
              </Text>
            ) : null}
          </div>
        );
      }
    })),
    {
      title: t('État'),
      key: 'etat',
      width: 280,
      render: (_valeur, ligne) => (
        <CelluleEtat
          ligne={ligne}
          horsQuota={props.horsQuota.has(ligne.numero)}
          doublonIgnore={props.doublonsIgnores.has(ligne.numero)}
        />
      )
    }
  ];
}

/** Étape 4 — l'aperçu : cellules modifiables, erreurs, doublons, quota. */
export const EtapeApercu: React.FC<EtapeApercuProps> = props => {
  const { compteurs, lignes, seulementErreurs, lectureSeule } = props;
  const [enEdition, setEnEdition] = useState<number | null>(null);
  const suivi: SuiviEdition = {
    enEdition,
    onFocus: numero => setEnEdition(numero),
    onBlur: numero => setEnEdition(actuel => (actuel === numero ? null : actuel))
  };
  const visibles = seulementErreurs
    ? lignes.filter(l => (l.selectionnee && l.erreurs.length > 0) || l.numero === enEdition)
    : lignes;
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message={t('Chaque cellule se corrige ici. Une ligne décochée n’est pas importée.')}
        description={
          <span aria-live="polite">
            {t(
              '{{pretes}} prête(s), {{enErreur}} en erreur, {{doublons}} doublon(s) probable(s), {{ignorees}} ignorée(s), {{horsQuota}} hors quota.',
              { ...compteurs }
            )}
            {props.exemplesIgnores > 0
              ? ` ${t('Ligne d’exemple ignorée : {{nombre}}', { nombre: props.exemplesIgnores })}`
              : ''}
          </span>
        }
      />

      {props.avertirEncodage ? <AlerteEncodage /> : null}

      {props.descripteur.doublonImpossible ? (
        <Alert type="warning" showIcon message={t(props.descripteur.doublonImpossible)} />
      ) : null}

      <div>
        <Text strong id="politique-doublons">
          {t('Doublons probables')}
        </Text>
        <div>
          <Radio.Group
            value={props.politique}
            onChange={evenement => props.onPolitique(evenement.target.value as PolitiqueDoublons)}
            aria-labelledby="politique-doublons"
          >
            <Space orientation="vertical">
              <Radio value="ignorer">{t('Ignorer les doublons')}</Radio>
              <Radio value="refuser">
                {t('Les refuser : la ligne reste en erreur tant qu’elle n’est pas corrigée ou décochée')}
              </Radio>
            </Space>
          </Radio.Group>
        </div>
      </div>

      <BandeauQuota etatQuota={props.etatQuota} estimation={props.estimation} />

      {lectureSeule ? (
        <Alert
          type="error"
          showIcon
          role="alert"
          message={t(
            'Votre abonnement est en lecture seule : l’import est impossible tant qu’il n’est pas régularisé.'
          )}
        />
      ) : null}

      <Checkbox checked={seulementErreurs} onChange={e => props.onSeulementErreurs(e.target.checked)}>
        {t('N’afficher que les lignes en erreur')}
      </Checkbox>

      <Table
        size="small"
        rowKey={ligne => String(ligne.numero)}
        dataSource={visibles}
        columns={construireColonnes(props, suivi)}
        pagination={{ pageSize: 25, showSizeChanger: false }}
        scroll={{ x: 'max-content' }}
      />

      <Space>
        <Button onClick={props.onRevenir}>{t('Revenir aux colonnes')}</Button>
        <Button
          type="primary"
          disabled={compteurs.pretes === 0 || lectureSeule || props.etatQuota === 'chargement'}
          onClick={props.onImporter}
        >
          {t('Importer {{nombre}} ligne(s)', { nombre: compteurs.pretes })}
        </Button>
      </Space>
    </Space>
  );
};
