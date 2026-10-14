import React, { useMemo } from 'react';
import { Typography } from 'antd';
import { DownloadOutlined, SwapOutlined, UnorderedListOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { listStockMovements } from '../../../../services/finance-stock-mouvements-service';
import { StateBlock } from '../../../primitives/StateBlock';
import { GrosBouton, ListeChoix, type Pastille } from './MagasinBriques';
import { aujourdhuiIso } from './DateMouvement';
import { queryKey, STALE_TIME } from '../../../../lib/query-keys';
import { STOCK_MOVEMENT_TYPE_LABELS } from '../../../../types/finance-stock-mouvements-types';
import type {
  StockFieldContext,
  StockLocationView,
  StockMovementView
} from '../../../../types/finance-stock-controle-types';
import { t } from '../../../../i18n/t';

const { Text, Title } = Typography;

export type GesteMagasin = 'recevoir' | 'sortir' | 'compter' | 'transferer';

/** Pastilles d'un lieu dans la liste de choix (ecrans §6.2). */
export function pastillesDuLieu(lieu: StockLocationView): Pastille[] {
  const pastilles: Pastille[] = [];
  if (lieu.countInProgress?.status === 'DRAFT') {
    pastilles.push({ key: 'COUNT_DRAFT', tone: 'info', label: t('Comptage en cours') });
  } else if (lieu.countInProgress?.status === 'COUNTED') {
    pastilles.push({ key: 'COUNT_COUNTED', tone: 'warning', label: t('Comptage clos') });
  }
  if (lieu.siteClosed) pastilles.push({ key: 'SITE_CLOSED', tone: 'neutral', label: t('Chantier clos') });
  return pastilles;
}

/** Choix du lieu courant, gardé ensuite dans le navigateur. */
export const ChoixLieu: React.FC<{
  lieux: StockLocationView[];
  lieuId: string | null;
  onChoisir: (id: string) => void;
}> = ({ lieux, lieuId, onChoisir }) => (
  <section aria-label={t('Choisir le lieu')}>
    <Title level={4} style={{ fontSize: 20 }}>
      {t('Sur quel lieu travaillez-vous ?')}
    </Title>
    <ListeChoix
      aria-label={t('Lieux')}
      lignes={lieux
        .filter(lieu => lieu.isActive)
        .map(lieu => ({
          id: lieu.id,
          titre: lieu.label,
          sousTitre: lieu.siteLabel ?? undefined,
          pastilles: pastillesDuLieu(lieu),
          recherche: `${lieu.label} ${lieu.siteLabel ?? ''}`
        }))}
      selectionId={lieuId}
      onChoisir={onChoisir}
      vide={t('Aucun lieu de stockage actif.')}
    />
  </section>
);

/** Une ligne de « Aujourd'hui sur ce lieu » : un bon, ou un mouvement sans bon. */
interface LigneDuJour {
  key: string;
  slipId: string | null;
  titre: string;
  heure: string;
  nature: string;
  articles: number;
}

export function lignesDuJour(mouvements: StockMovementView[]): LigneDuJour[] {
  const parCle = new Map<string, LigneDuJour>();
  for (const mouvement of mouvements) {
    const cle = mouvement.slipId ?? mouvement.id;
    const existante = parCle.get(cle);
    if (existante) {
      existante.articles += 1;
      continue;
    }
    parCle.set(cle, {
      key: cle,
      slipId: mouvement.slipId,
      titre: mouvement.slipNumber ?? mouvement.itemLabel,
      heure: dayjs(mouvement.createdAt).format('HH:mm'),
      nature: STOCK_MOVEMENT_TYPE_LABELS[mouvement.type] ?? mouvement.type,
      articles: 1
    });
  }
  return [...parCle.values()];
}

export interface MagasinAccueilProps {
  tenantId: string;
  contexte: StockFieldContext;
  lieuId: string;
  onGeste: (geste: GesteMagasin) => void;
  onOuvrirBon: (slipId: string) => void;
}

/**
 * Accueil de l'écran Magasin (ecrans §6.2) : les gestes permis, repliés pour
 * ceux du second rang, et ce qui a été enregistré aujourd'hui sur le lieu.
 * Aucune valeur, aucun filtre par personne.
 */
export const MagasinAccueil: React.FC<MagasinAccueilProps> = ({ tenantId, contexte, lieuId, onGeste, onOuvrirBon }) => {
  const { canReceive, canIssue, canCount, canTransfer } = contexte.abilities;
  const aucunGeste = !canReceive && !canIssue && !canCount && !canTransfer;
  const jour = aujourdhuiIso();
  const filtres = { locationId: lieuId, from: jour, to: jour, limit: 20 };

  const duJour = useQuery({
    queryKey: queryKey('stock-movements', tenantId, filtres),
    queryFn: () => listStockMovements(tenantId, filtres),
    staleTime: STALE_TIME.list
  });
  const lignes = useMemo(() => lignesDuJour(duJour.data?.data ?? []), [duJour.data]);

  return (
    <div>
      {aucunGeste ? (
        <StateBlock
          variant="empty"
          title={t('Aucun geste de stock ne vous est ouvert')}
          description={t('Votre rôle permet de consulter le stock, pas de l’enregistrer.')}
        />
      ) : null}
      {canReceive ? (
        <GrosBouton
          icone={<DownloadOutlined />}
          titre={t('Recevoir')}
          sousTitre={t('Marchandise livrée')}
          onClick={() => onGeste('recevoir')}
        />
      ) : null}
      {canIssue ? (
        <GrosBouton
          icone={<UploadOutlined />}
          titre={t('Sortir')}
          sousTitre={t('Remettre à un chantier')}
          onClick={() => onGeste('sortir')}
        />
      ) : null}
      {canCount ? (
        <GrosBouton
          icone={<UnorderedListOutlined />}
          titre={t('Compter')}
          sousTitre={t('Inventaire du lieu')}
          onClick={() => onGeste('compter')}
        />
      ) : null}
      {canTransfer ? (
        <details style={{ marginBlockEnd: 'var(--space-4)' }}>
          <summary style={{ minHeight: 48, fontSize: 16, cursor: 'pointer', paddingBlock: 12 }}>
            {t('Autres gestes')}
          </summary>
          <GrosBouton
            icone={<SwapOutlined />}
            titre={t('Transférer vers un autre lieu')}
            sousTitre={t('Déplacer de la marchandise')}
            onClick={() => onGeste('transferer')}
          />
        </details>
      ) : null}

      <section aria-label={t('Aujourd’hui sur ce lieu')} style={{ marginBlockStart: 'var(--space-4)' }}>
        <Title level={5}>{t('Aujourd’hui sur ce lieu')}</Title>
        {duJour.isPending ? (
          <Text type="secondary">{t('Chargement…')}</Text>
        ) : duJour.isError ? (
          <Text type="secondary">{t('Les opérations du jour n’ont pas pu être lues.')}</Text>
        ) : lignes.length === 0 ? (
          <Text type="secondary">{t('Rien n’a encore été enregistré aujourd’hui sur ce lieu.')}</Text>
        ) : (
          <ListeChoix
            aria-label={t('Aujourd’hui sur ce lieu')}
            sansRecherche
            lignes={lignes.map(ligne => ({
              id: ligne.key,
              titre: ligne.titre,
              sousTitre: [ligne.heure, ligne.nature, t('{{n}} article(s)', { n: ligne.articles })].join(' · '),
              desactivee: !ligne.slipId
            }))}
            onChoisir={cle => {
              const ligne = lignes.find(candidate => candidate.key === cle);
              if (ligne?.slipId) onOuvrirBon(ligne.slipId);
            }}
          />
        )}
      </section>
    </div>
  );
};

export default MagasinAccueil;
