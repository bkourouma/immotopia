import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Input, Modal, Select, Space, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  cancelStockCount,
  closeStockCount,
  createStockCount,
  createStockTransfer,
  getStockCount,
  justifyStockCountLine,
  listStockBalances,
  listStockCounts,
  removeStockCountLine,
  setAsideStockCountLine,
  setStockCountLine,
  validateStockCount
} from '../../services/finance-stock-inventaire-service';
import { setAsideUncountedLines } from '../../services/finance-stock-controle-service';
import {
  estEnEcart,
  formatQuantity,
  formatVariance,
  lignesNonComptees,
  lignesSansMotif
} from '../../types/finance-stock-inventaire-types';
import type { StockCount, StockCountLine, StockTransfer } from '../../types/finance-stock-inventaire-types';
import {
  STOCK_COUNT_KIND_LABELS,
  STOCK_COUNT_STATUS_DISPLAY,
  STOCK_REASON_LABELS,
  stockReasonDisplay,
  type RequesterFields,
  type StockCountKind,
  type StockCountStatus,
  type StockFieldContext,
  type StockLocationView,
  type StockWrite
} from '../../types/finance-stock-controle-types';
import { useStockFieldContext, STOCK_FIELD_CONTEXT_ENTITY } from '../../hooks/useStockFieldContext';
import { detailKey, entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import {
  ConfirmAction,
  DataCard,
  DataView,
  MoneyValue,
  PageHeader,
  StatCard,
  StateBlock,
  StatusTag
} from '../../components/primitives';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';
import { StockBlindBanner } from '../../components/finance/stock/StockBlindBanner';
import { StockPhotoCapture } from '../../components/finance/stock/StockPhotoCapture';
import { StockQuantityInput } from '../../components/finance/stock/StockQuantityInput';
import {
  StockReasonPicker,
  isStockReasonComplete,
  type StockReasonValue
} from '../../components/finance/stock/StockReasonPicker';
import { StockSlipPdfButton } from '../../components/finance/stock/StockSlipPdfButton';
import { StockTakerSelect } from '../../components/finance/stock/StockTakerSelect';
import { StockAttachmentList } from '../../components/finance/stock/StockAttachmentList';
import { DateMouvement } from '../../components/finance/stock/magasin/DateMouvement';
import { AlerteCoupure } from '../../components/finance/stock/magasin/MagasinBriques';
import { useEnvoiTerrain } from '../../components/finance/stock/magasin/useEnvoiTerrain';
import {
  CODES_DATE,
  CODES_MOTIF,
  CODES_PRENEUR,
  lireErreurStock
} from '../../components/finance/stock/magasin/stock-erreurs';
import { isModuleNotIncludedError } from '../../utils/module-not-included';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text, Paragraph } = Typography;

/**
 * E3 — Transferts entre lieux et inventaire physique (ecrans §7, lot 040).
 *
 * ---------------------------------------------------------------------------
 * Un transfert n'impute RIEN
 * ---------------------------------------------------------------------------
 *
 * Livrer du ciment sur un chantier *ressemble* à une dépense. Ce n'en est pas
 * une : la matière reste à l'actif de l'agence, simplement ailleurs, et le coût
 * du chantier ne bouge pas. Seule la SORTIE impute (principe P-7). L'écran
 * l'écrit en haut de l'onglet et sur le reçu du transfert ; `value` y est la
 * valeur **déplacée**, montrée seulement à qui voit les valeurs (B1).
 *
 * ---------------------------------------------------------------------------
 * L'inventaire : compter à l'aveugle, clore, justifier, valider à quatre yeux
 * ---------------------------------------------------------------------------
 *
 * - **Pendant le comptage (`DRAFT`), l'écran ne montre jamais la quantité
 *   attendue** (spec A2) : il ne lit aucun solde du lieu compté, et la saisie
 *   d'une ligne ne porte que l'article, la quantité comptée et l'identifiant
 *   de requête — **jamais de motif** (A2-R5).
 * - **À la clôture (`COUNTED`)**, attendu et écarts apparaissent ; chaque écart
 *   se justifie par un motif d'une liste fermée. « Justifié » se lit dans
 *   `justified`, calculé par le serveur (A4-R2). Les lignes non comptées
 *   s'écartent, une par une ou en groupe.
 * - **La validation** applique l'écart au stock actuel (A3) : les mouvements
 *   enregistrés depuis le comptage sont conservés. Elle est faite par une autre
 *   personne que les compteurs (A1), prévenue avant le clic par
 *   `CountView.validation`, calculé par le serveur.
 * - `variance` et les valeurs arrivent calculées ; l'écran ne refait aucune
 *   soustraction (P-4). Un écart n'est jamais rouge : ton `warning` tant qu'il
 *   n'est pas justifié, neutre ensuite (D2).
 *
 * ---------------------------------------------------------------------------
 * Points d'extension (lot 041, inventaire par WhatsApp)
 * ---------------------------------------------------------------------------
 *
 * L'en-tête d'un inventaire (`InventaireEnTete`, pastilles par
 * `pastillesDInventaire`) et la cellule d'article d'une ligne
 * (`InventaireLigneArticle`, pastilles et liens par `pastillesDeLigne`) sont
 * des composants à part : une pastille « Ouvert par WhatsApp » ou un badge
 * « WhatsApp » avec le lien de la photo de preuve s'y ajoutent sans toucher
 * aux tableaux.
 */

// ===========================================================================
// Petits outils
// ===========================================================================

function dateCourte(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).format(dateFormat('short'));
}

function dateEtHeure(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).format(dateFormat('dateTime'));
}

function libelleLieu(lieu: StockLocationView): string {
  return `${lieu.label} (${lieu.kind === 'WAREHOUSE' ? t('Magasin') : t('Lieu de chantier')})`;
}

/** Motif d'un retrait, d'une mise à l'écart ou d'un abandon : 3 à 500 caractères. */
const MOTIF_MIN = 3;
const MOTIF_MAX = 500;
function motifValide(texte: string): boolean {
  const longueur = texte.trim().length;
  return longueur >= MOTIF_MIN && longueur <= MOTIF_MAX;
}

/** Raison d'une validation sans second regard : 10 à 500 caractères (A1-R3). */
const RAISON_MIN = 10;

// ===========================================================================
// Points d'extension : en-tête d'un inventaire et article d'une ligne
// ===========================================================================

/** Pastilles de l'en-tête d'un inventaire. Le lot 041 y ajoute « Ouvert par WhatsApp ». */
export function pastillesDInventaire(comptage: StockCount): React.ReactNode[] {
  const affichage = STOCK_COUNT_STATUS_DISPLAY[comptage.status];
  const pastilles: React.ReactNode[] = [
    <StatusTag key="statut" status={comptage.status} tone={affichage.tone} label={affichage.label} />,
    <StatusTag key="nature" status={comptage.kind} tone="neutral" label={STOCK_COUNT_KIND_LABELS[comptage.kind]} />
  ];
  if (comptage.selfValidated) {
    pastilles.push(<StatusTag key="seul" status="SELF_VALIDATED" tone="info" label={t('Validé sans second regard')} />);
  }
  return pastilles;
}

export interface InventaireEnTeteProps {
  comptage: StockCount;
  onFermer: () => void;
  /** Pastilles ajoutées par un appelant (en plus de `pastillesDInventaire`). */
  pastilles?: React.ReactNode[];
}

export const InventaireEnTete: React.FC<InventaireEnTeteProps> = ({ comptage, onFermer, pastilles }) => (
  <Space align="center" wrap style={{ marginBlockEnd: 'var(--space-3)' }}>
    <Title level={4} style={{ margin: 0 }}>
      {t('Inventaire de « {{lieu}} » du {{date}}', {
        lieu: comptage.locationLabel,
        date: dateCourte(comptage.countedAt)
      })}
    </Title>
    {pastillesDInventaire(comptage)}
    {pastilles ?? null}
    <Button type="link" onClick={onFermer}>
      {t('Fermer cet inventaire')}
    </Button>
  </Space>
);

/**
 * Pastilles et mentions d'une ligne. Le lot 041 y ajoute le badge « WhatsApp »
 * et le lien vers la photo de preuve.
 */
export function pastillesDeLigne(ligne: StockCountLine, comptage: StockCount): React.ReactNode[] {
  const pastilles: React.ReactNode[] = [];
  if (ligne.notCounted) {
    pastilles.push(<StatusTag key="non-compte" status="NOT_COUNTED" tone="warning" label={t('Non compté')} />);
  }
  if (ligne.setAside) {
    pastilles.push(<StatusTag key="ecartee" status="SET_ASIDE" tone="neutral" label={t('Écartée')} />);
  }
  if (comptage.status === 'VALIDATED' && ligne.countedBlind === false) {
    pastilles.push(
      <Text key="sans-aveugle" type="secondary" style={{ display: 'block', fontSize: 13 }}>
        {t('Comptée par une personne qui voyait le stock')}
      </Text>
    );
  }
  return pastilles;
}

export const InventaireLigneArticle: React.FC<{
  ligne: StockCountLine;
  comptage: StockCount;
  pastilles?: React.ReactNode[];
}> = ({ ligne, comptage, pastilles }) => (
  <div>
    <span>
      {ligne.itemReference} — {ligne.itemLabel}
    </span>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {pastillesDeLigne(ligne, comptage)}
      {pastilles ?? null}
    </div>
  </div>
);

/** Le motif d'une ligne, tel qu'il s'affiche (ecrans §7.5). */
function MotifDeLigne({ ligne }: { ligne: StockCountLine }): React.ReactElement {
  if (ligne.setAside) {
    return <Text type="secondary">{t('Écartée : {{motif}}', { motif: ligne.setAside.reason })}</Text>;
  }
  if (ligne.notCounted) return <Text type="secondary">{t('Non compté')}</Text>;
  if (!estEnEcart(ligne)) return <Text type="secondary">{t('Aucun écart')}</Text>;
  if (!ligne.justified) return <Text type="warning">{t('Écart à justifier')}</Text>;
  const libelle = stockReasonDisplay(ligne.reasonCode, ligne.reasonCode ? null : ligne.reason);
  return (
    <span>
      {libelle}
      {ligne.reasonCode && ligne.reason ? (
        <Text type="secondary" style={{ display: 'block' }}>
          {ligne.reason}
        </Text>
      ) : null}
    </span>
  );
}

/** L'écart d'une ligne : `warning` tant qu'il n'est pas justifié, neutre ensuite — jamais rouge. */
function EcartDeLigne({ ligne }: { ligne: StockCountLine }): React.ReactElement {
  if (ligne.notCounted) return <Text type="secondary">{t('— non compté')}</Text>;
  const aJustifier = estEnEcart(ligne) && !ligne.justified;
  return (
    <Text type={aJustifier ? 'warning' : undefined}>
      <strong>{formatVariance(ligne.variance, ligne.itemUnit)}</strong>
    </Text>
  );
}

// ===========================================================================
// Onglet « Transfert entre lieux » (ecrans §7.1)
// ===========================================================================

interface OngletTransfertProps {
  tenantId: string;
  contexte: StockFieldContext;
  valuesVisible: boolean;
  origineInitiale: string | undefined;
}

const OngletTransfert: React.FC<OngletTransfertProps> = ({ tenantId, contexte, valuesVisible, origineInitiale }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const envoi = useEnvoiTerrain();
  const lieux = contexte.locations.filter(lieu => lieu.isActive);

  const [origine, setOrigine] = useState<string | undefined>(
    lieux.some(lieu => lieu.id === origineInitiale) ? origineInitiale : undefined
  );
  const [arrivee, setArrivee] = useState<string | undefined>(undefined);
  const [article, setArticle] = useState<string | undefined>(undefined);
  const [quantite, setQuantite] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [demandeur, setDemandeur] = useState<RequesterFields>({});
  const [motif, setMotif] = useState<StockReasonValue>({ reasonCode: null, reason: '' });
  const [erreurPreneur, setErreurPreneur] = useState<string | null>(null);
  const [erreurMotif, setErreurMotif] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [dernier, setDernier] = useState<StockWrite<StockTransfer> | null>(null);
  const [rappel, setRappel] = useState<{ demandeur: string; motif: string } | null>(null);

  // L'identifiant de requête est tiré à l'ouverture du formulaire.
  const { preparer } = envoi;
  useEffect(() => {
    preparer();
  }, [preparer]);

  const optionsOrigine = lieux
    .filter(lieu => lieu.id !== arrivee)
    .map(lieu => ({ value: lieu.id, label: libelleLieu(lieu) }));
  const optionsArrivee = lieux
    .filter(lieu => lieu.id !== origine)
    .map(lieu => ({
      value: lieu.id,
      label: lieu.siteClosed ? `${libelleLieu(lieu)} ${t('(chantier clos)')}` : libelleLieu(lieu),
      disabled: lieu.siteClosed
    }));
  const optionsArticles = contexte.items.map(item => ({ value: item.id, label: `${item.reference} — ${item.label}` }));
  const uniteDe = (itemId: string | undefined) => contexte.items.find(item => item.id === itemId)?.unit ?? null;

  const lieuOrigine = lieux.find(lieu => lieu.id === origine) ?? null;
  const origineAveugleConnue = lieuOrigine?.countInProgress?.status === 'DRAFT';
  const soldes = useQuery({
    queryKey: queryKey('stock-balances', tenantId, { locationId: origine }),
    queryFn: () => listStockBalances(tenantId, { locationId: origine as string }),
    enabled: Boolean(origine) && !origineAveugleConnue,
    staleTime: STALE_TIME.list
  });
  const solde = (soldes.data?.data ?? []).find(candidat => candidat.itemId === article) ?? null;
  const origineAveugle =
    origineAveugleConnue ||
    Boolean(origine && soldes.data?.meta.blindLocationIds.includes(origine)) ||
    (solde !== null && solde.quantity === null);
  const disponible = solde?.quantity ?? 0;
  const depasse = !origineAveugle && quantite !== null && quantite > disponible;

  const demandeurPret = Boolean(
    demandeur.takerId || (!contexte.settings.requireTaker && (demandeur.requestedBy ?? '').trim())
  );
  const pret = Boolean(
    origine &&
    arrivee &&
    origine !== arrivee &&
    article &&
    quantite !== null &&
    quantite > 0 &&
    date &&
    demandeurPret &&
    isStockReasonComplete(motif)
  );

  const transferer = async () => {
    if (!pret || !date || !motif.reasonCode) return;
    setErreurPreneur(null);
    setErreurMotif(null);
    setErreurDate(null);
    const reasonCode = motif.reasonCode;
    const reponse = await envoi.envoyer(
      clientRequestId =>
        createStockTransfer(tenantId, {
          fromLocationId: origine as string,
          toLocationId: arrivee as string,
          itemId: article as string,
          quantity: quantite as number,
          transferDate: date.format('YYYY-MM-DD'),
          ...demandeur,
          reasonCode,
          reason: motif.reason,
          clientRequestId
        }),
      t('Le transfert n’a pas pu être enregistré.')
    );
    if (reponse.ok) {
      setDernier(reponse.resultat);
      setRappel({
        demandeur: demandeur.takerId
          ? (contexte.takers.find(preneur => preneur.id === demandeur.takerId)?.label ?? '')
          : (demandeur.requestedBy ?? '').trim(),
        motif: [STOCK_REASON_LABELS[reasonCode], motif.reason.trim()].filter(Boolean).join(' — ')
      });
      message.success(
        reponse.resultat.replayed
          ? t('Ce transfert était déjà enregistré.')
          : t('Transfert enregistré : la matière a changé de lieu.')
      );
      setQuantite(null);
      envoi.preparer();
      await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) });
      return;
    }
    const { erreur } = reponse;
    if (erreur.reseau) return;
    if (erreur.code && CODES_PRENEUR.includes(erreur.code)) setErreurPreneur(erreur.message);
    else if (erreur.code && CODES_MOTIF.includes(erreur.code)) setErreurMotif(erreur.message);
    else if (erreur.code && CODES_DATE.includes(erreur.code)) setErreurDate(erreur.message);
    else {
      if (erreur.code === 'STOCK_SITE_CLOSED') {
        void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
      }
      message.error(erreur.message);
    }
  };

  const sortante = dernier?.data.movements.find(mouvement => mouvement.isDecrease) ?? null;

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBlockEnd: 'var(--space-4)' }}
        message={t('Un transfert n’impute rien : ce n’est pas une dépense.')}
        description={t(
          'Déplacer de la matière vers le lieu d’un chantier ne la consomme pas. Elle reste à l’actif de l’agence, simplement ailleurs, et le coût du chantier ne bouge pas. Seule la sortie de stock impute un chantier.'
        )}
      />

      <Space wrap size="middle" align="start" style={{ marginBlockEnd: 'var(--space-3)' }}>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="transfert-origine">{t('Lieu d’origine')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="transfert-origine"
            style={{ width: 260, display: 'block' }}
            placeholder={t('Choisir le lieu d’origine')}
            value={origine}
            onChange={setOrigine}
            options={optionsOrigine}
            notFoundContent={t('Aucun lieu de stockage disponible')}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="transfert-arrivee">{t('Lieu d’arrivée')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="transfert-arrivee"
            style={{ width: 260, display: 'block' }}
            placeholder={t('Choisir le lieu d’arrivée')}
            value={arrivee}
            onChange={setArrivee}
            options={optionsArrivee}
            notFoundContent={t('Aucun lieu de stockage disponible')}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="transfert-article">{t('Article transféré')}</label>
          <Select
            id="transfert-article"
            style={{ width: 260, display: 'block' }}
            showSearch
            optionFilterProp="label"
            placeholder={t('Choisir un article')}
            value={article}
            onChange={setArticle}
            options={optionsArticles}
            notFoundContent={t('Aucun article disponible')}
          />
        </div>
        <div style={{ width: 200 }}>
          <label htmlFor="transfert-quantite">{t('Quantité')}</label>
          <StockQuantityInput
            id="transfert-quantite"
            aria-label={t('Quantité')}
            unit={uniteDe(article)}
            min={0}
            value={quantite}
            onChange={setQuantite}
          />
        </div>
        <div style={{ width: 260 }}>
          <label htmlFor="transfert-date">{t('Date du transfert')}</label>
          <DateMouvement
            id="transfert-date"
            value={date}
            onChange={valeur => {
              setDate(valeur);
              setErreurDate(null);
            }}
            backdatingLimitDays={contexte.settings.backdatingLimitDays}
            error={erreurDate}
          />
        </div>
      </Space>

      <div style={{ marginBlockEnd: 'var(--space-3)' }}>
        {article && origine ? (
          origineAveugle ? (
            <Text type="secondary">
              {t(
                'Lieu en cours de comptage : la quantité disponible n’est pas affichée. Le serveur refusera un transfert qui dépasse le stock.'
              )}
            </Text>
          ) : (
            <Text type="secondary">
              {t('Au lieu d’origine, il reste')}{' '}
              <strong>{formatQuantity(disponible, solde?.itemUnit ?? uniteDe(article))}</strong>
              {'. '}
              {t('C’est une prévenance de lecture : c’est le serveur qui refuse une quantité supérieure au stock.')}
            </Text>
          )
        ) : (
          <Text type="secondary">{t('Choisissez un lieu d’origine et un article pour voir ce qu’il y reste.')}</Text>
        )}
      </div>

      {depasse ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBlockEnd: 'var(--space-3)' }}
          message={t('La quantité dépasse ce qu’il reste au lieu d’origine.')}
          description={t(
            'Le serveur refusera ce transfert. Vérifiez la quantité, ou enregistrez d’abord la réception qui manque.'
          )}
        />
      ) : null}

      <div style={{ maxWidth: 560, marginBlockEnd: 'var(--space-3)' }}>
        <Text strong style={{ display: 'block', marginBlockEnd: 4 }}>
          {t('Qui demande ou emporte ce transfert ?')}
        </Text>
        <StockTakerSelect
          tenantId={tenantId}
          value={demandeur}
          onChange={valeur => {
            setErreurPreneur(null);
            setDemandeur(valeur);
          }}
          takers={contexte.takers}
          requireTaker={contexte.settings.requireTaker}
          canManageTakers={contexte.abilities.canManageTakers}
          people={contexte.people}
          error={erreurPreneur}
        />
      </div>

      <div style={{ maxWidth: 560, marginBlockEnd: 'var(--space-4)' }}>
        <Text strong style={{ display: 'block', marginBlockEnd: 4 }}>
          {t('Motif du transfert')}
        </Text>
        <StockReasonPicker
          codes={contexte.reasonCodes.transfer}
          value={motif}
          onChange={valeur => {
            setErreurMotif(null);
            setMotif(valeur);
          }}
        />
        {erreurMotif ? (
          <Text type="danger" role="alert">
            {erreurMotif}
          </Text>
        ) : null}
      </div>

      {envoi.coupure ? <AlerteCoupure onReessayer={() => void transferer()} disabled={envoi.enCours} /> : null}

      <Button type="primary" loading={envoi.enCours} disabled={!pret} onClick={() => void transferer()}>
        {t('Enregistrer le transfert')}
      </Button>

      {dernier ? (
        <div style={{ marginBlockStart: 'var(--space-5)' }}>
          <Title level={5}>{t('Dernier transfert enregistré')}</Title>
          <Paragraph>
            {t('{{quantite}} de « {{article}} », de « {{depuis}} » vers « {{vers}} ».', {
              quantite: formatQuantity(dernier.data.quantity, sortante?.itemUnit),
              article: sortante?.itemLabel ?? '',
              depuis: dernier.data.fromLocationLabel,
              vers: dernier.data.toLocationLabel
            })}
          </Paragraph>
          {rappel ? (
            <Paragraph type="secondary">{t('Demandeur : {{demandeur}} · Motif : {{motif}}', rappel)}</Paragraph>
          ) : null}
          {valuesVisible && dernier.data.value !== null ? (
            <StatCard
              label={t('Valeur déplacée')}
              value={<MoneyValue value={dernier.data.value} />}
              hint={t('Au coût moyen du lieu d’origine. Ce n’est pas une dépense, et aucun chantier n’a été imputé.')}
            />
          ) : null}
          <ul style={{ paddingInlineStart: 'var(--space-5)', marginBlockStart: 'var(--space-3)' }}>
            {dernier.data.movements.map(mouvement => (
              <li key={mouvement.id}>
                {mouvement.isDecrease
                  ? t('Sortie de « {{lieu}} »', { lieu: mouvement.locationLabel })
                  : t('Entrée à « {{lieu}} »', { lieu: mouvement.locationLabel })}{' '}
                : {formatQuantity(mouvement.quantity, mouvement.itemUnit)} —{' '}
                {mouvement.quantityAfter === null ? (
                  <Text type="secondary">{t('Masqué (comptage en cours)')}</Text>
                ) : (
                  t('il y reste {{quantite}}', {
                    quantite: formatQuantity(mouvement.quantityAfter, mouvement.itemUnit)
                  })
                )}
              </li>
            ))}
          </ul>
          {sortante ? (
            <div style={{ maxWidth: 560 }}>
              <Text strong>{t('Photo de la marchandise transférée')}</Text>
              <StockPhotoCapture
                tenantId={tenantId}
                target={{ type: 'MOVEMENT', id: sortante.id }}
                purposes={['GOODS_PHOTO']}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
};

// ===========================================================================
// Fenêtre « Ouvrir un inventaire » (ecrans §7.3)
// ===========================================================================

interface FenetreOuvertureProps {
  tenantId: string;
  contexte: StockFieldContext;
  open: boolean;
  lieuInitial?: string;
  natureInitiale?: StockCountKind;
  onFermer: () => void;
  onCree: (comptage: StockCount) => void;
}

function naturesPermises(lieu: StockLocationView | null): StockCountKind[] {
  if (!lieu) return ['REGULAR'];
  const natures: StockCountKind[] = ['REGULAR'];
  if (lieu.openingCountSuggested) natures.push('OPENING');
  if (lieu.kind === 'SITE') natures.push('CLOSING');
  return natures;
}

const FenetreOuverture: React.FC<FenetreOuvertureProps> = ({
  tenantId,
  contexte,
  open,
  lieuInitial,
  natureInitiale,
  onFermer,
  onCree
}) => {
  const lieux = contexte.locations.filter(lieu => lieu.isActive);
  const [lieuId, setLieuId] = useState<string | undefined>(undefined);
  const [nature, setNature] = useState<StockCountKind>('REGULAR');
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial = lieux.find(lieu => lieu.id === lieuInitial && !lieu.countInProgress) ?? null;
    setLieuId(initial?.id);
    setNature(natureInitiale && naturesPermises(initial).includes(natureInitiale) ? natureInitiale : 'REGULAR');
    setDate(dayjs());
    setErreur(null);
    setErreurDate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lieuInitial, natureInitiale]);

  const lieu = lieux.find(candidat => candidat.id === lieuId) ?? null;
  const natures = naturesPermises(lieu);

  const ouvrir = async () => {
    if (!lieuId || !date) return;
    setEnCours(true);
    setErreur(null);
    setErreurDate(null);
    try {
      const cree = await createStockCount(tenantId, {
        locationId: lieuId,
        countedAt: date.format('YYYY-MM-DD'),
        ...(nature !== 'REGULAR' ? { kind: nature } : {})
      });
      onCree(cree);
    } catch (err) {
      const lue = lireErreurStock(err, t('L’inventaire n’a pas pu être ouvert.'));
      if (lue.code === 'STOCK_OPENING_COUNT_NOT_ALLOWED') setNature('REGULAR');
      if (lue.code && CODES_DATE.includes(lue.code)) setErreurDate(lue.message);
      else setErreur(lue.message);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal
      title={t('Ouvrir un inventaire')}
      open={open}
      onCancel={() => {
        if (!enCours) onFermer();
      }}
      confirmLoading={enCours}
      onOk={() => void ouvrir()}
      okText={t('Ouvrir l’inventaire')}
      okButtonProps={{ disabled: !lieuId || !date }}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {erreur ? <Alert type="error" showIcon role="alert" message={erreur} /> : null}
        <div>
          <label htmlFor="comptage-lieu">{t('Lieu à compter')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="comptage-lieu"
            style={{ width: '100%' }}
            placeholder={t('Choisir un lieu de stockage')}
            value={lieuId}
            onChange={valeur => {
              setLieuId(valeur);
              const suivant = lieux.find(candidat => candidat.id === valeur) ?? null;
              if (!naturesPermises(suivant).includes(nature)) setNature('REGULAR');
            }}
            options={lieux.map(candidat => ({
              value: candidat.id,
              label: candidat.countInProgress
                ? `${libelleLieu(candidat)} — ${t('inventaire en cours')}`
                : libelleLieu(candidat),
              disabled: Boolean(candidat.countInProgress)
            }))}
            notFoundContent={t('Aucun lieu de stockage disponible')}
          />
          <Text type="secondary">
            {t(
              'Un seul comptage en brouillon par lieu : deux comptages simultanés du même dépôt produiraient deux vérités, et le second validé écraserait le premier sans que personne ne le voie.'
            )}
          </Text>
        </div>
        <div>
          <label htmlFor="comptage-nature">{t('Nature')}</label>
          <Select
            id="comptage-nature"
            style={{ width: '100%' }}
            value={nature}
            onChange={valeur => setNature(valeur)}
            options={natures.map(code => ({ value: code, label: STOCK_COUNT_KIND_LABELS[code] }))}
          />
        </div>
        <div>
          <label htmlFor="comptage-date">{t('Date du comptage')}</label>
          <DateMouvement
            id="comptage-date"
            value={date}
            onChange={valeur => {
              setDate(valeur);
              setErreurDate(null);
            }}
            backdatingLimitDays={contexte.settings.backdatingLimitDays}
            error={erreurDate}
          />
        </div>
        {lieu && lieu.toRecount.length > 0 ? (
          <Alert
            type="info"
            showIcon
            message={t('À recompter depuis le dernier inventaire : {{liste}}.', {
              liste: lieu.toRecount.map(item => item.itemLabel).join(', ')
            })}
          />
        ) : null}
        <Text type="secondary">
          {t('Le comptage se fait à l’aveugle : personne ne verra la quantité attendue avant sa clôture.')}
        </Text>
        {nature === 'OPENING' ? (
          <Text type="secondary">
            {t(
              'L’inventaire d’ouverture constate ce qui se trouve déjà sur le lieu. Un surplus y entre sans valeur : sa matière a déjà été payée par les factures du chantier.'
            )}{' '}
            {t('Les manques constatés se justifient comme dans tout inventaire.')}
          </Text>
        ) : null}
        {nature === 'CLOSING' ? (
          <Text type="secondary">
            {t('L’inventaire de clôture permet de clôturer le chantier quand du stock reste sur son lieu.')}{' '}
            {t('Il doit compter tous les articles présents sur le lieu.')}
          </Text>
        ) : null}
      </Space>
    </Modal>
  );
};

// ===========================================================================
// Fenêtre de motif (abandon, mise à l'écart)
// ===========================================================================

interface FenetreMotifProps {
  open: boolean;
  titre: string;
  texte: React.ReactNode;
  okText: string;
  danger?: boolean;
  placeholder?: string;
  onFermer: () => void;
  onValider: (motif: string) => Promise<void>;
}

const FenetreMotif: React.FC<FenetreMotifProps> = ({
  open,
  titre,
  texte,
  okText,
  danger,
  placeholder,
  onFermer,
  onValider
}) => {
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    if (open) setMotif('');
  }, [open]);
  return (
    <Modal
      title={titre}
      open={open}
      onCancel={() => {
        if (!enCours) onFermer();
      }}
      okText={okText}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !motifValide(motif), danger }}
      confirmLoading={enCours}
      onOk={async () => {
        setEnCours(true);
        try {
          await onValider(motif.trim());
        } finally {
          setEnCours(false);
        }
      }}
      destroyOnHidden
    >
      <Paragraph>{texte}</Paragraph>
      <label htmlFor="fenetre-motif">{t('Motif')}</label>
      <Input.TextArea
        id="fenetre-motif"
        value={motif}
        maxLength={MOTIF_MAX}
        showCount
        placeholder={placeholder}
        autoSize={{ minRows: 2, maxRows: 6 }}
        onChange={event => setMotif(event.target.value)}
      />
    </Modal>
  );
};

// ===========================================================================
// Détail d'un inventaire
// ===========================================================================

interface DetailProps {
  tenantId: string;
  contexte: StockFieldContext;
  comptage: StockCount;
  valuesVisible: boolean;
  relire: () => Promise<void>;
}

/** Colonnes d'un tableau de lignes, selon l'état. */
function colonnesLignesInventaire(params: {
  comptage: StockCount;
  valuesVisible: boolean;
  actions?: (ligne: StockCountLine) => React.ReactNode;
}): ColumnsType<StockCountLine> {
  const { comptage, valuesVisible, actions } = params;
  const aveugle = comptage.status === 'DRAFT' || comptage.status === 'CANCELLED';
  const colonnes: ColumnsType<StockCountLine> = [
    {
      title: t('Article'),
      key: 'article',
      render: (_, ligne) => <InventaireLigneArticle ligne={ligne} comptage={comptage} />
    }
  ];
  if (!aveugle) {
    colonnes.push({
      // Figée à la saisie : ce que le système disait au moment où l'on a compté.
      title: t('Ce que le système disait'),
      key: 'attendu',
      align: 'end',
      render: (_, ligne) => formatQuantity(ligne.expectedQuantity, ligne.itemUnit)
    });
  }
  colonnes.push({
    title: t('Compté'),
    key: 'compte',
    align: 'end',
    render: (_, ligne) =>
      ligne.notCounted ? (
        <Text type="secondary">{t('— non compté')}</Text>
      ) : (
        formatQuantity(ligne.countedQuantity, ligne.itemUnit)
      )
  });
  if (!aveugle) {
    colonnes.push({
      title: t('Écart'),
      key: 'ecart',
      align: 'end',
      render: (_, ligne) => <EcartDeLigne ligne={ligne} />
    });
    if (valuesVisible) {
      colonnes.push({
        title: t('Valeur de l’écart'),
        key: 'valeur',
        align: 'end',
        render: (_, ligne) => (ligne.varianceValue === null ? null : <MoneyValue value={ligne.varianceValue} />)
      });
    }
  }
  colonnes.push({ title: t('Compté par'), key: 'par', render: (_, ligne) => ligne.countedByLabel ?? '—' });
  if (aveugle) {
    colonnes.push({ title: t('Saisi à'), key: 'saisi', render: (_, ligne) => dateEtHeure(ligne.countedAtServer) });
  } else {
    colonnes.push({ title: t('Motif'), key: 'motif', render: (_, ligne) => <MotifDeLigne ligne={ligne} /> });
    colonnes.push({
      title: t('Pièces jointes'),
      key: 'pieces',
      align: 'end',
      render: (_, ligne) => String(ligne.attachmentsCount)
    });
  }
  if (comptage.status === 'VALIDATED') {
    colonnes.push({
      title: t('Mouvements depuis le comptage'),
      key: 'depuis',
      align: 'end',
      render: (_, ligne) =>
        ligne.movementsSinceCapture === null ? (
          <Text type="secondary">{t('Non mesuré')}</Text>
        ) : (
          String(ligne.movementsSinceCapture)
        )
    });
  }
  if (actions) {
    colonnes.push({ title: t('Actions'), key: 'actions', align: 'end', render: (_, ligne) => actions(ligne) });
  }
  return colonnes;
}

/** La carte mobile d'une ligne : référence, quantité comptée ou écart, compteur. */
function CarteLigneInventaire(props: {
  ligne: StockCountLine;
  comptage: StockCount;
  action?: { label: string; onClick: () => void };
}): React.ReactElement {
  const { ligne, comptage, action } = props;
  const aveugle = comptage.status === 'DRAFT' || comptage.status === 'CANCELLED';
  return (
    <DataCard
      title={ligne.itemReference}
      aria-label={ligne.itemReference}
      subtitle={<InventaireLigneArticle ligne={ligne} comptage={comptage} />}
      highlight={
        aveugle || ligne.notCounted ? (
          formatQuantity(ligne.countedQuantity, ligne.itemUnit)
        ) : (
          <EcartDeLigne ligne={ligne} />
        )
      }
      fields={[
        ...(aveugle
          ? []
          : [
              { label: t('Ce que le système disait'), value: formatQuantity(ligne.expectedQuantity, ligne.itemUnit) },
              { label: t('Compté'), value: formatQuantity(ligne.countedQuantity, ligne.itemUnit) },
              { label: t('Motif'), value: <MotifDeLigne ligne={ligne} /> }
            ]),
        { label: t('Compté par'), value: ligne.countedByLabel ?? '—' },
        ...(aveugle ? [{ label: t('Saisi à'), value: dateEtHeure(ligne.countedAtServer) }] : [])
      ]}
      {...(action ? { primaryAction: action } : {})}
    />
  );
}

const TableauLignes: React.FC<{
  comptage: StockCount;
  lignes: StockCountLine[];
  valuesVisible: boolean;
  vide: string;
  actions?: (ligne: StockCountLine) => React.ReactNode;
  actionCarte?: (ligne: StockCountLine) => { label: string; onClick: () => void } | undefined;
  ariaLabel: string;
}> = ({ comptage, lignes, valuesVisible, vide, actions, actionCarte, ariaLabel }) => (
  <DataView<StockCountLine>
    paginated={false}
    scrollX={1100}
    items={lignes}
    total={lignes.length}
    page={1}
    pageSize={Math.max(lignes.length, 1)}
    onPageChange={() => {}}
    emptyDescription={vide}
    columns={colonnesLignesInventaire({ comptage, valuesVisible, actions })}
    rowKey={ligne => ligne.id}
    aria-label={ariaLabel}
    renderCard={ligne => <CarteLigneInventaire ligne={ligne} comptage={comptage} action={actionCarte?.(ligne)} />}
  />
);

const grille: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 'var(--space-3)',
  marginBlockEnd: 'var(--space-5)'
};

// --- DRAFT (ecrans §7.4) ---------------------------------------------------

const DetailBrouillon: React.FC<DetailProps> = ({ tenantId, contexte, comptage, valuesVisible, relire }) => {
  const { message } = App.useApp();
  const envoi = useEnvoiTerrain();
  const { canCount, canValidateCount } = contexte.abilities;
  const [itemId, setItemId] = useState<string | undefined>(undefined);
  const [quantite, setQuantite] = useState<number | null>(null);
  const [incomplet, setIncomplet] = useState<Array<{ itemId: string; itemLabel: string }>>([]);
  const [abandonOuvert, setAbandonOuvert] = useState(false);

  const { preparer } = envoi;
  useEffect(() => {
    preparer();
  }, [preparer]);

  const uniteDe = (id: string | undefined) => contexte.items.find(item => item.id === id)?.unit ?? null;
  const lignePrete = Boolean(itemId && quantite !== null && quantite >= 0);

  const enregistrerLigne = async () => {
    if (!itemId || quantite === null) return;
    const article = itemId;
    const compte = quantite;
    const reponse = await envoi.envoyer(
      clientRequestId =>
        setStockCountLine(tenantId, comptage.id, { itemId: article, countedQuantity: compte, clientRequestId }),
      t('La ligne de comptage n’a pas pu être enregistrée.')
    );
    if (reponse.ok) {
      message.success(t('Comptage de l’article enregistré.'));
      setItemId(undefined);
      setQuantite(null);
      setIncomplet(previous => previous.filter(item => item.itemId !== article));
      envoi.preparer();
      await relire();
      return;
    }
    if (!reponse.erreur.reseau) message.error(reponse.erreur.message);
  };

  const retirerLigne = async (ligne: StockCountLine) => {
    try {
      await removeStockCountLine(tenantId, comptage.id, ligne.itemId);
      await relire();
      message.success(t('Ligne « {{itemReference}} » retirée du comptage.', { itemReference: ligne.itemReference }));
    } catch (err) {
      message.error(lireErreurStock(err, t('La ligne n’a pas pu être retirée.')).message);
    }
  };

  const clore = async () => {
    try {
      await closeStockCount(tenantId, comptage.id);
      setIncomplet([]);
      await relire();
      message.success(t('Comptage clos : les écarts sont visibles.'));
    } catch (err) {
      const lue = lireErreurStock(err, t('Le comptage n’a pas pu être clos.'));
      if (lue.code === 'STOCK_COUNT_INCOMPLETE') setIncomplet(lue.items);
      else message.error(lue.message);
    }
  };

  const abandonner = async (motif: string) => {
    try {
      await cancelStockCount(tenantId, comptage.id, motif);
      setAbandonOuvert(false);
      await relire();
      message.success(t('Inventaire abandonné.'));
    } catch (err) {
      message.error(lireErreurStock(err, t('L’inventaire n’a pas pu être abandonné.')).message);
    }
  };

  return (
    <>
      <div style={{ marginBlockEnd: 'var(--space-4)' }}>
        <StockBlindBanner variant="count" />
      </div>
      <div style={grille}>
        <StatCard label={t('Articles comptés')} value={String(comptage.linesCount)} />
        <StatCard
          label={t('Compteurs')}
          value={String(comptage.counters.length)}
          hint={comptage.counters.map(compteur => compteur.label).join(', ') || undefined}
        />
      </div>
      {canValidateCount ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBlockEnd: 'var(--space-4)' }}
          message={t(
            'Vous voyez le stock de ce lieu : les lignes que vous saisirez seront marquées « comptées sans aveugle » sur le procès-verbal.'
          )}
        />
      ) : null}

      {incomplet.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          role="alert"
          style={{ marginBlockEnd: 'var(--space-4)' }}
          message={t(
            'Un inventaire d’ouverture ou de clôture doit compter tous les articles présents sur le lieu. Il reste à compter : {{liste}}.',
            { liste: incomplet.map(item => item.itemLabel).join(', ') }
          )}
          description={
            <Space wrap>
              {incomplet.map(item => (
                <Button key={item.itemId} size="small" onClick={() => setItemId(item.itemId)}>
                  {t('Compter {{article}}', { article: item.itemLabel })}
                </Button>
              ))}
            </Space>
          }
        />
      ) : null}

      {canCount ? (
        <div
          style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            marginBlockEnd: 'var(--space-5)'
          }}
        >
          <Title level={5} style={{ marginBlockStart: 0 }}>
            {t('Saisir le comptage d’un article')}
          </Title>
          <Space wrap size="middle" align="end">
            <div>
              <label htmlFor="ligne-article">{t('Article compté')}</label>
              <Select
                id="ligne-article"
                style={{ width: 280, display: 'block' }}
                showSearch
                optionFilterProp="label"
                placeholder={t('Choisir un article')}
                value={itemId}
                onChange={setItemId}
                options={contexte.items.map(item => ({ value: item.id, label: `${item.reference} — ${item.label}` }))}
                notFoundContent={t('Aucun article disponible')}
              />
            </div>
            <div style={{ width: 200 }}>
              <label htmlFor="ligne-quantite">{t('Quantité comptée')}</label>
              {/* Le zéro est un résultat de comptage : « on a regardé, il n'y a rien ». */}
              <StockQuantityInput
                id="ligne-quantite"
                aria-label={t('Quantité comptée')}
                unit={uniteDe(itemId)}
                min={0}
                value={quantite}
                onChange={setQuantite}
              />
            </div>
            <Button
              type="primary"
              loading={envoi.enCours}
              disabled={!lignePrete}
              onClick={() => void enregistrerLigne()}
            >
              {t('Enregistrer le comptage')}
            </Button>
          </Space>
          {envoi.coupure ? (
            <div style={{ marginBlockStart: 'var(--space-3)' }}>
              <AlerteCoupure onReessayer={() => void enregistrerLigne()} disabled={envoi.enCours} />
            </div>
          ) : null}
          <Paragraph type="secondary" style={{ marginBlockStart: 'var(--space-3)', marginBlockEnd: 0 }}>
            {t(
              'Saisir le même article une seconde fois remplace son comptage. Le motif d’un écart se donne après la clôture du comptage.'
            )}
          </Paragraph>
        </div>
      ) : null}

      <TableauLignes
        comptage={comptage}
        lignes={comptage.lines}
        valuesVisible={valuesVisible}
        ariaLabel={t('Lignes du comptage')}
        vide={t('Ce comptage ne porte encore aucune ligne. Saisissez le premier article compté.')}
        actions={
          canCount
            ? ligne => (
                <Space>
                  <Button
                    type="link"
                    onClick={() => {
                      setItemId(ligne.itemId);
                      setQuantite(ligne.countedQuantity);
                    }}
                  >
                    {t('Reprendre')}
                  </Button>
                  <ConfirmAction
                    title={t('Retirer « {{itemReference}} » du comptage ?', { itemReference: ligne.itemReference })}
                    description={t(
                      'La ligne disparaît du comptage. Le stock n’est pas touché : rien n’a encore été ajusté tant que l’inventaire n’est pas validé.'
                    )}
                    okText={t('Confirmer le retrait')}
                    danger
                    onConfirm={() => retirerLigne(ligne)}
                  >
                    <Button type="link" danger>
                      {t('Retirer')}
                    </Button>
                  </ConfirmAction>
                </Space>
              )
            : undefined
        }
        actionCarte={
          canCount
            ? ligne => ({
                label: t('Reprendre'),
                onClick: () => {
                  setItemId(ligne.itemId);
                  setQuantite(ligne.countedQuantity);
                }
              })
            : undefined
        }
      />

      <Space wrap style={{ marginBlockStart: 'var(--space-5)' }}>
        {canCount ? (
          <ConfirmAction
            title={t('Clore le comptage de {{lieu}} ?', { lieu: comptage.locationLabel })}
            description={t(
              '{{n}} article(s) compté(s). Les articles qui ont du stock ici et que personne n’a comptés apparaîtront comme « non comptés » : une personne habilitée devra les écarter. Après la clôture, les quantités ne se modifient plus et les écarts s’affichent.',
              { n: comptage.linesCount }
            )}
            okText={t('Clore le comptage')}
            onConfirm={clore}
            disabled={comptage.lines.length === 0}
          >
            <Button type="primary" disabled={comptage.lines.length === 0}>
              {t('Clore le comptage')}
            </Button>
          </ConfirmAction>
        ) : null}
        {canValidateCount ? (
          <Button danger onClick={() => setAbandonOuvert(true)}>
            {t('Abandonner l’inventaire')}
          </Button>
        ) : null}
      </Space>

      <FenetreMotif
        open={abandonOuvert}
        titre={t('Abandonner cet inventaire ?')}
        texte={t(
          'Un inventaire abandonné ne s’ajuste pas, et ses quantités attendues ne sont pas affichées à l’écran. S’il a déjà des lignes, l’abandon est signalé aux responsables du stock et ses quantités restent dans le journal d’activité. Le lieu pourra être compté à nouveau.'
        )}
        okText={t('Abandonner l’inventaire')}
        danger
        onFermer={() => setAbandonOuvert(false)}
        onValider={abandonner}
      />
    </>
  );
};

// --- COUNTED (ecrans §7.5, §7.6) -------------------------------------------

const DetailClos: React.FC<DetailProps> = ({ tenantId, contexte, comptage, valuesVisible, relire }) => {
  const { message } = App.useApp();
  const { canCount, canValidateCount } = contexte.abilities;
  const [aJustifier, setAJustifier] = useState<StockCountLine | null>(null);
  const [motif, setMotif] = useState<StockReasonValue>({ reasonCode: null, reason: '' });
  const [justificationEnCours, setJustificationEnCours] = useState(false);
  const [aEcarter, setAEcarter] = useState<{ itemId: string; itemLabel: string } | null>(null);
  const [toutEcarter, setToutEcarter] = useState(false);

  const sansMotif = lignesSansMotif(comptage);
  const nonComptees = lignesNonComptees(comptage);
  const enEcart = comptage.lines.filter(estEnEcart);

  const ouvrirJustification = (ligne: StockCountLine) => {
    setAJustifier(ligne);
    setMotif({ reasonCode: ligne.reasonCode, reason: ligne.reasonCode ? (ligne.reason ?? '') : '' });
  };

  const justifier = async () => {
    if (!aJustifier || !motif.reasonCode) return;
    setJustificationEnCours(true);
    try {
      await justifyStockCountLine(tenantId, comptage.id, aJustifier.itemId, {
        reasonCode: motif.reasonCode,
        reason: motif.reason
      });
      setAJustifier(null);
      await relire();
      message.success(t('Motif enregistré.'));
    } catch (err) {
      message.error(lireErreurStock(err, t('Le motif n’a pas pu être enregistré.')).message);
    } finally {
      setJustificationEnCours(false);
    }
  };

  const ecarter = async (motifEcart: string) => {
    if (!aEcarter) return;
    try {
      await setAsideStockCountLine(tenantId, comptage.id, aEcarter.itemId, motifEcart);
      setAEcarter(null);
      await relire();
      message.success(t('Ligne écartée.'));
    } catch (err) {
      message.error(lireErreurStock(err, t('La ligne n’a pas pu être écartée.')).message);
    }
  };

  const ecarterNonComptees = async (motifEcart: string) => {
    try {
      await setAsideUncountedLines(tenantId, comptage.id, motifEcart);
      setToutEcarter(false);
      await relire();
      message.success(t('Articles non comptés écartés.'));
    } catch (err) {
      message.error(lireErreurStock(err, t('Les articles non comptés n’ont pas pu être écartés.')).message);
    }
  };

  const actionsLigne = (ligne: StockCountLine) => {
    if (ligne.setAside) return null;
    const peutJustifier = (canCount || canValidateCount) && estEnEcart(ligne);
    return (
      <Space wrap>
        {peutJustifier ? (
          <Button type="link" onClick={() => ouvrirJustification(ligne)}>
            {ligne.justified ? t('Modifier le motif') : t('Justifier')}
          </Button>
        ) : null}
        {canValidateCount && (estEnEcart(ligne) || ligne.notCounted) ? (
          <Button type="link" onClick={() => setAEcarter({ itemId: ligne.itemId, itemLabel: ligne.itemLabel })}>
            {t('Écarter la ligne')}
          </Button>
        ) : null}
      </Space>
    );
  };

  return (
    <>
      <Alert
        type="warning"
        showIcon
        style={{ marginBlockEnd: 'var(--space-4)' }}
        message={t(
          'Comptage clos le {{date}} par {{nom}} : les écarts sont visibles. Chaque écart doit être justifié avant la validation.',
          { date: dateCourte(comptage.closedAt), nom: comptage.closedByLabel ?? '' }
        )}
      />
      <div style={grille}>
        <StatCard label={t('Articles comptés')} value={String(comptage.linesCount)} />
        <StatCard
          label={t('Lignes en écart')}
          value={String(comptage.varianceCount ?? enEcart.length)}
          tone={enEcart.length > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label={t('Écarts à justifier')}
          value={String(sansMotif.length)}
          tone={sansMotif.length > 0 ? 'warning' : 'neutral'}
        />
        <StatCard label={t('Non comptés')} value={String(nonComptees.length)} />
        {valuesVisible && comptage.varianceValueNet !== null ? (
          <StatCard
            label={t('Valeur estimée de l’écart')}
            value={<MoneyValue value={comptage.varianceValueNet} />}
            hint={t('Estimée au coût moyen actuel ; figée à la validation.')}
          />
        ) : null}
      </div>

      {canValidateCount && nonComptees.length > 0 ? (
        <Button style={{ marginBlockEnd: 'var(--space-3)' }} onClick={() => setToutEcarter(true)}>
          {t('Écarter tous les articles non comptés')}
        </Button>
      ) : null}

      <TableauLignes
        comptage={comptage}
        lignes={comptage.lines}
        valuesVisible={valuesVisible}
        ariaLabel={t('Lignes du comptage')}
        vide={t('Ce comptage ne porte aucune ligne.')}
        actions={actionsLigne}
        actionCarte={ligne =>
          !ligne.setAside && (canCount || canValidateCount) && estEnEcart(ligne)
            ? {
                label: ligne.justified ? t('Modifier le motif') : t('Justifier'),
                onClick: () => ouvrirJustification(ligne)
              }
            : undefined
        }
      />
      <Paragraph type="secondary" style={{ marginBlockStart: 'var(--space-3)' }}>
        {t('Un motif décrit ce que vous constatez. Il ne met personne en cause, et aucune retenue n’en découle.')}
      </Paragraph>
      {canValidateCount ? (
        <Paragraph type="secondary">
          {t('Écarter une ligne n’efface pas son écart : il reste compté dans le contrôle de l’inventaire.')}
        </Paragraph>
      ) : null}

      {canValidateCount ? (
        <BlocValidation
          tenantId={tenantId}
          comptage={comptage}
          sansMotif={sansMotif}
          nonComptees={nonComptees}
          relire={relire}
          onEcarter={item => setAEcarter(item)}
        />
      ) : null}

      <Modal
        title={aJustifier ? t('Justifier l’écart de {{article}}', { article: aJustifier.itemLabel }) : ''}
        open={Boolean(aJustifier)}
        onCancel={() => {
          if (!justificationEnCours) setAJustifier(null);
        }}
        okText={t('Enregistrer le motif')}
        cancelText={t('Annuler')}
        okButtonProps={{ disabled: !isStockReasonComplete(motif) }}
        confirmLoading={justificationEnCours}
        onOk={() => void justifier()}
        destroyOnHidden
      >
        {aJustifier ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Text>
              {t('Attendu : {{attendu}} · Compté : {{compte}} · Écart : {{ecart}}', {
                attendu: formatQuantity(aJustifier.expectedQuantity, aJustifier.itemUnit),
                compte: formatQuantity(aJustifier.countedQuantity, aJustifier.itemUnit),
                ecart: formatVariance(aJustifier.variance, aJustifier.itemUnit)
              })}
            </Text>
            <StockReasonPicker codes={contexte.reasonCodes.count} value={motif} onChange={setMotif} />
            <StockPhotoCapture
              tenantId={tenantId}
              target={{ type: 'COUNT_LINE', id: aJustifier.id }}
              purposes={['GOODS_PHOTO', 'OTHER']}
            />
          </Space>
        ) : null}
      </Modal>

      <FenetreMotif
        open={Boolean(aEcarter)}
        titre={t('Écarter cette ligne ?')}
        texte={t(
          'Elle ne sera pas ajustée et figurera au procès-verbal dans les lignes écartées. Faites recompter l’article dans un nouvel inventaire.'
        )}
        okText={t('Écarter la ligne')}
        onFermer={() => setAEcarter(null)}
        onValider={ecarter}
      />
      <FenetreMotif
        open={toutEcarter}
        titre={t('Écarter les {{n}} articles non comptés ?', { n: nonComptees.length })}
        texte={t(
          'Ils ne seront pas ajustés, figureront au procès-verbal et seront à recompter. La mise à l’écart est signalée aux responsables du stock.'
        )}
        placeholder={t('Ex. Inventaire tournant : seuls les ciments étaient à compter')}
        okText={t('Écarter les articles non comptés')}
        onFermer={() => setToutEcarter(false)}
        onValider={ecarterNonComptees}
      />
    </>
  );
};

// --- Validation (ecrans §7.6) ----------------------------------------------

const BlocValidation: React.FC<{
  tenantId: string;
  comptage: StockCount;
  sansMotif: StockCountLine[];
  nonComptees: StockCountLine[];
  relire: () => Promise<void>;
  onEcarter: (item: { itemId: string; itemLabel: string }) => void;
}> = ({ tenantId, comptage, sansMotif, nonComptees, relire, onEcarter }) => {
  const { message } = App.useApp();
  const [enCours, setEnCours] = useState(false);
  const [refusQuatreYeux, setRefusQuatreYeux] = useState(false);
  const [negatifs, setNegatifs] = useState<Array<{ itemId: string; itemLabel: string }>>([]);
  const [derogationOuverte, setDerogationOuverte] = useState(false);
  const [raison, setRaison] = useState('');

  const callerIsCounter = Boolean(comptage.validation?.callerIsCounter);
  const derogationPossible = callerIsCounter && Boolean(comptage.validation?.selfValidationAllowed);
  const ferme =
    sansMotif.length > 0 || nonComptees.length > 0 || refusQuatreYeux || (callerIsCounter && !derogationPossible);

  const valider = async (raisonDerogation?: string) => {
    setEnCours(true);
    try {
      await validateStockCount(tenantId, comptage.id, raisonDerogation);
      setDerogationOuverte(false);
      await relire();
      message.success(t('Inventaire validé : les écarts sont devenus des ajustements de stock.'));
    } catch (err) {
      const lue = lireErreurStock(err, t('L’inventaire n’a pas pu être validé.'));
      if (lue.code === 'STOCK_COUNT_SELF_VALIDATION_FORBIDDEN') {
        setRefusQuatreYeux(true);
        setDerogationOuverte(false);
      } else if (lue.code === 'STOCK_COUNT_SELF_VALIDATION_REASON_REQUIRED') {
        setDerogationOuverte(true);
      } else if (lue.code === 'STOCK_COUNT_NEGATIVE_AFTER_MOVEMENTS') {
        setNegatifs(lue.items);
      } else if (lue.code === 'STOCK_COUNT_UNJUSTIFIED_VARIANCE' || lue.code === 'STOCK_COUNT_UNCOUNTED_LINES') {
        await relire();
        message.warning(lue.message);
      } else {
        message.error(lue.message);
      }
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div style={{ marginBlockStart: 'var(--space-5)' }}>
      <Title level={5}>{t('Valider l’inventaire')}</Title>

      {sansMotif.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBlockEnd: 'var(--space-3)' }}
          message={t('{{n}} écart(s) reste(nt) à justifier : la validation est impossible.', { n: sansMotif.length })}
          description={
            <>
              <div>
                {t(
                  'Chaque écart doit recevoir un motif avant la validation : choisissez ce qui décrit le mieux ce que vous constatez.'
                )}
              </div>
              <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}>
                {sansMotif.map(ligne => (
                  <li key={ligne.id}>
                    {ligne.itemReference} — {ligne.itemLabel} : {formatVariance(ligne.variance, ligne.itemUnit)}
                  </li>
                ))}
              </ul>
            </>
          }
        />
      ) : null}

      {nonComptees.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBlockEnd: 'var(--space-3)' }}
          message={t('{{n}} article(s) non compté(s) à écarter avant la validation.', { n: nonComptees.length })}
        />
      ) : null}

      {refusQuatreYeux ? (
        <Alert
          type="info"
          showIcon
          role="alert"
          style={{ marginBlockEnd: 'var(--space-3)' }}
          message={t('Vous avez compté cet inventaire : une autre personne habilitée de l’agence doit le valider.')}
        />
      ) : callerIsCounter ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBlockEnd: 'var(--space-3)' }}
          message={t('Vous avez compté des lignes de cet inventaire')}
          description={
            derogationPossible
              ? t(
                  'Personne d’autre dans l’agence ne peut valider cet inventaire. Vous pouvez le valider en indiquant pourquoi : la validation sera signalée.'
                )
              : t('Une autre personne habilitée de l’agence doit le valider.')
          }
        />
      ) : null}

      {negatifs.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          role="alert"
          style={{ marginBlockEnd: 'var(--space-3)' }}
          message={t(
            'Des mouvements enregistrés depuis le comptage ont fait baisser le stock de ces articles plus que ce qui a été compté : {{liste}}. Écartez ces lignes et faites-les recompter dans un nouvel inventaire.',
            { liste: negatifs.map(item => item.itemLabel).join(', ') }
          )}
          description={
            <Space wrap>
              {negatifs.map(item => (
                <Button key={item.itemId} size="small" onClick={() => onEcarter(item)}>
                  {t('Écarter la ligne {{article}}', { article: item.itemLabel })}
                </Button>
              ))}
            </Space>
          }
        />
      ) : null}

      {ferme ? (
        <Button type="primary" disabled>
          {t('Valider l’inventaire')}
        </Button>
      ) : derogationPossible ? (
        <Button
          type="primary"
          loading={enCours}
          onClick={() => {
            setRaison('');
            setDerogationOuverte(true);
          }}
        >
          {t('Valider l’inventaire')}
        </Button>
      ) : (
        <ConfirmAction
          title={t('Valider l’inventaire de « {{locationLabel}} » ?', { locationLabel: comptage.locationLabel })}
          description={t(
            'Chaque écart justifié devient un ajustement, appliqué au stock actuel du lieu. Les mouvements enregistrés depuis le comptage sont conservés. Un inventaire validé ne s’annule pas : une erreur se corrige par un nouvel inventaire. Aucun chantier n’est imputé.'
          )}
          okText={t('Confirmer la validation')}
          onConfirm={() => valider()}
        >
          <Button type="primary" loading={enCours}>
            {t('Valider l’inventaire')}
          </Button>
        </ConfirmAction>
      )}

      <Modal
        title={t('Valider sans second regard')}
        open={derogationOuverte}
        onCancel={() => {
          if (!enCours) setDerogationOuverte(false);
        }}
        okText={t('Valider l’inventaire')}
        cancelText={t('Annuler')}
        okButtonProps={{ disabled: raison.trim().length < RAISON_MIN || raison.trim().length > MOTIF_MAX }}
        confirmLoading={enCours}
        onOk={() => void valider(raison)}
        destroyOnHidden
      >
        <Paragraph>
          {t(
            'Personne d’autre dans l’agence ne peut valider cet inventaire. Vous pouvez le valider vous-même : la validation sera signalée dans le procès-verbal, le journal d’activité et les alertes.'
          )}
        </Paragraph>
        <label htmlFor="raison-derogation">{t('Pourquoi validez-vous seul ?')}</label>
        <Input.TextArea
          id="raison-derogation"
          value={raison}
          maxLength={MOTIF_MAX}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
          onChange={event => setRaison(event.target.value)}
        />
      </Modal>
    </div>
  );
};

// --- VALIDATED (ecrans §7.7) -----------------------------------------------

const DetailValide: React.FC<DetailProps> = ({ tenantId, contexte, comptage, valuesVisible }) => {
  const actives = comptage.lines.filter(ligne => !ligne.setAside && !ligne.notCounted);
  const ecartees = comptage.lines.filter(ligne => ligne.setAside !== null);
  const nonComptees = comptage.lines.filter(ligne => ligne.notCounted && ligne.setAside === null);
  // Un inventaire validé avant le lot 040 n'a rien figé (`countedValue` vide,
  // comme le lisent les indicateurs) : ne jamais lui prêter « Figé à la
  // validation ». Une valeur absente le dit, plutôt que de disparaître.
  const fige = comptage.countedValue !== null;
  const NON_FIGEE = t('Non figée (inventaire antérieur au lot)');
  const valeur = (label: string, montant: number | null, hint?: string) => {
    if (!valuesVisible) return null;
    if (montant === null) return <StatCard label={label} value={<Text type="secondary">{NON_FIGEE}</Text>} />;
    return (
      <StatCard
        label={label}
        value={<MoneyValue value={montant} />}
        hint={fige ? (hint ?? t('Figé à la validation.')) : NON_FIGEE}
      />
    );
  };

  return (
    <>
      <Alert
        type="success"
        showIcon
        style={{ marginBlockEnd: 'var(--space-4)' }}
        message={t('Inventaire validé le {{date}} par {{nom}}. Les écarts sont devenus des ajustements de stock.', {
          date: dateCourte(comptage.validatedAt),
          nom: comptage.validatedByLabel ?? ''
        })}
        description={t(
          'Cet inventaire ne s’annule pas. Ses ajustements sont des mouvements de stock comme les autres, et les défaire demanderait de rejouer tout ce qui a suivi. Un comptage erroné se corrige par un second comptage sur le même lieu.'
        )}
      />
      {comptage.selfValidated ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBlockEnd: 'var(--space-4)' }}
          message={t('Validé sans second regard')}
          description={t(
            'Cet inventaire a été validé par une personne qui l’a aussi compté. Motif donné : « {{motif}} ».',
            {
              motif: comptage.selfValidationReason ?? ''
            }
          )}
        />
      ) : null}
      {comptage.kind === 'OPENING' ? (
        <Paragraph type="secondary">{t('Inventaire d’ouverture : les surplus sont entrés sans valeur.')}</Paragraph>
      ) : null}
      <div style={grille}>
        <StatCard label={t('Articles comptés')} value={String(comptage.linesCount)} />
        <StatCard label={t('Lignes en écart')} value={String(comptage.varianceCount ?? 0)} />
        <StatCard label={t('Non comptés')} value={String(comptage.uncountedLinesCount)} />
        {valeur(t('Valeur comptée'), comptage.countedValue)}
        {valeur(t('Écart brut'), comptage.varianceValueGross, t('Somme des écarts, manques et surplus confondus'))}
        {valeur(t('Écart net'), comptage.varianceValueNet)}
        {valeur(t('Écart des lignes écartées'), comptage.setAsideVarianceValue)}
      </div>
      <Space wrap style={{ marginBlockEnd: 'var(--space-4)' }}>
        <StockSlipPdfButton tenantId={tenantId} countId={comptage.id} number={comptage.slip?.number ?? null} />
      </Space>
      <TableauLignes
        comptage={comptage}
        lignes={actives}
        valuesVisible={valuesVisible}
        ariaLabel={t('Lignes du comptage')}
        vide={t('Aucune ligne ajustée.')}
      />
      {ecartees.length > 0 ? (
        <>
          <Title level={5} style={{ marginBlockStart: 'var(--space-5)' }}>
            {t('Lignes écartées')}
          </Title>
          <TableauLignes
            comptage={comptage}
            lignes={ecartees}
            valuesVisible={valuesVisible}
            ariaLabel={t('Lignes écartées')}
            vide=""
          />
        </>
      ) : null}
      {nonComptees.length > 0 ? (
        <>
          <Title level={5} style={{ marginBlockStart: 'var(--space-5)' }}>
            {t('Non comptés')}
          </Title>
          <TableauLignes
            comptage={comptage}
            lignes={nonComptees}
            valuesVisible={valuesVisible}
            ariaLabel={t('Non comptés')}
            vide=""
          />
        </>
      ) : null}
      {comptage.slip ? (
        <div style={{ marginBlockStart: 'var(--space-5)' }}>
          <Title level={5}>{t('Procès-verbal signé')}</Title>
          <StockAttachmentList
            tenantId={tenantId}
            targetType="SLIP"
            targetId={comptage.slip.id}
            canAdd={contexte.abilities.canValidateCount}
            purposes={['SIGNED_SLIP']}
          />
        </div>
      ) : null}
    </>
  );
};

// --- CANCELLED (ecrans §7.8) -----------------------------------------------

const DetailAbandonne: React.FC<DetailProps> = ({ comptage, valuesVisible }) => (
  <>
    <div
      role="status"
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        marginBlockEnd: 'var(--space-4)',
        background: 'var(--surface-sunken)'
      }}
    >
      {t(
        'Inventaire abandonné le {{date}}. Motif : {{motif}}. Les quantités attendues ne sont pas affichées ; elles restent consultables dans le journal d’activité de l’agence.',
        { date: dateCourte(comptage.cancelledAt), motif: comptage.cancelReason ?? '' }
      )}
    </div>
    <TableauLignes
      comptage={comptage}
      lignes={comptage.lines.filter(ligne => !ligne.notCounted)}
      valuesVisible={valuesVisible}
      ariaLabel={t('Lignes du comptage')}
      vide={t('Aucune ligne comptée.')}
    />
  </>
);

const DetailInventaire: React.FC<{
  tenantId: string;
  contexte: StockFieldContext;
  countId: string;
  valuesVisible: boolean;
  onFermer: () => void;
}> = ({ tenantId, contexte, countId, valuesVisible, onFermer }) => {
  const queryClient = useQueryClient();
  const lecture = useQuery({
    queryKey: detailKey('stock-counts', tenantId, countId),
    queryFn: () => getStockCount(tenantId, countId),
    staleTime: STALE_TIME.list
  });

  const relire = async () => {
    await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-counts', tenantId) });
    void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
  };

  if (lecture.isError) {
    return (
      <StateBlock
        variant="error"
        description={t('Impossible de charger cet inventaire.')}
        actions={[{ label: t('Réessayer'), onClick: () => void lecture.refetch(), primary: true }]}
      />
    );
  }
  const comptage = lecture.data;
  if (!comptage) return <StateBlock variant="loading" />;

  const props: DetailProps = { tenantId, contexte, comptage, valuesVisible, relire };
  return (
    <div style={{ marginBlockStart: 'var(--space-6)' }}>
      <InventaireEnTete comptage={comptage} onFermer={onFermer} />
      {comptage.status === 'DRAFT' ? <DetailBrouillon {...props} /> : null}
      {comptage.status === 'COUNTED' ? <DetailClos {...props} /> : null}
      {comptage.status === 'VALIDATED' ? <DetailValide {...props} /> : null}
      {comptage.status === 'CANCELLED' ? <DetailAbandonne {...props} /> : null}
    </div>
  );
};

// ===========================================================================
// Onglet « Inventaire physique » — la liste (ecrans §7.2)
// ===========================================================================

function actionDeListe(statut: StockCountStatus): string {
  if (statut === 'DRAFT') return t('Poursuivre le comptage');
  if (statut === 'COUNTED') return t('Justifier les écarts');
  return t('Consulter');
}

const OngletInventaire: React.FC<{
  tenantId: string;
  contexte: StockFieldContext;
  countId: string | null;
  onOuvrirDetail: (countId: string | null) => void;
  ouverture: { lieu?: string; nature?: StockCountKind } | null;
  onFermerOuverture: () => void;
}> = ({ tenantId, contexte, countId, onOuvrirDetail, ouverture, onFermerOuverture }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { canCount } = contexte.abilities;
  const [lieuFiltre, setLieuFiltre] = useState<string | undefined>(undefined);
  const [statutFiltre, setStatutFiltre] = useState<StockCountStatus | undefined>(undefined);
  const [natureFiltre, setNatureFiltre] = useState<StockCountKind | undefined>(undefined);
  const [fenetre, setFenetre] = useState<{ lieu?: string; nature?: StockCountKind } | null>(ouverture);

  useEffect(() => {
    if (ouverture) setFenetre(ouverture);
  }, [ouverture]);

  const filtres = { locationId: lieuFiltre, status: statutFiltre, kind: natureFiltre };
  const liste = useQuery({
    queryKey: queryKey('stock-counts', tenantId, filtres),
    queryFn: () => listStockCounts(tenantId, filtres),
    staleTime: STALE_TIME.list
  });
  const comptages = liste.data?.data ?? [];
  const valuesVisible = liste.data?.meta.valuesVisible ?? contexte.abilities.valuesVisible;

  const valeurEcart = (comptage: StockCount): React.ReactNode => {
    if (comptage.blind) return <Text type="secondary">{t('Masqué')}</Text>;
    if (comptage.varianceValueNet === null) return null;
    return (
      <span>
        <MoneyValue value={comptage.varianceValueNet} />
        {comptage.status === 'COUNTED' ? (
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {t('estimée')}
          </Text>
        ) : null}
      </span>
    );
  };

  const etat = (comptage: StockCount) => {
    const affichage = STOCK_COUNT_STATUS_DISPLAY[comptage.status];
    return (
      <Space size={4} wrap>
        <StatusTag status={comptage.status} tone={affichage.tone} label={affichage.label} />
        {comptage.selfValidated ? (
          <StatusTag status="SELF_VALIDATED" tone="info" label={t('Validé sans second regard')} />
        ) : null}
      </Space>
    );
  };

  const colonnes: ColumnsType<StockCount> = [
    { title: t('Lieu'), key: 'lieu', render: (_, c) => c.locationLabel },
    { title: t('Nature'), key: 'nature', render: (_, c) => STOCK_COUNT_KIND_LABELS[c.kind] },
    { title: t('Compté le'), key: 'date', render: (_, c) => dateCourte(c.countedAt) },
    { title: t('État'), key: 'etat', render: (_, c) => etat(c) },
    { title: t('Lignes'), key: 'lignes', align: 'end', render: (_, c) => c.linesCount },
    {
      title: t('Lignes en écart'),
      key: 'ecarts',
      align: 'end',
      render: (_, c) =>
        c.blind || c.varianceCount === null ? <Text type="secondary">{t('Masqué')}</Text> : c.varianceCount
    },
    ...(valuesVisible
      ? [
          {
            title: t('Valeur de l’écart'),
            key: 'valeur',
            align: 'end' as const,
            render: (_: unknown, c: StockCount) => valeurEcart(c)
          }
        ]
      : []),
    { title: t('Ouvert par'), key: 'auteur', render: (_, c) => c.createdByLabel },
    { title: t('Validé par'), key: 'validateur', render: (_, c) => c.validatedByLabel ?? '—' },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, c) => (
        <Button type="link" onClick={() => onOuvrirDetail(c.id)}>
          {actionDeListe(c.status)}
        </Button>
      )
    }
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBlockEnd: 'var(--space-4)' }}
        message={t(
          'Un inventaire se compte à l’aveugle, se clôt, se justifie, puis se valide par une autre personne que celle qui a compté. Rien ne bouge dans le stock avant la validation.'
        )}
      />
      <Space wrap size="middle" align="end" style={{ marginBlockEnd: 'var(--space-3)' }}>
        <div>
          <label htmlFor="comptages-lieu">{t('Lieu')}</label>
          <Select
            showSearch
            optionFilterProp="label"
            id="comptages-lieu"
            style={{ width: 260, display: 'block' }}
            allowClear
            placeholder={t('Tous les lieux')}
            value={lieuFiltre}
            onChange={valeur => setLieuFiltre(valeur ?? undefined)}
            options={contexte.locations.map(lieu => ({ value: lieu.id, label: libelleLieu(lieu) }))}
          />
        </div>
        <div>
          <label htmlFor="comptages-statut">{t('État')}</label>
          <Select
            id="comptages-statut"
            style={{ width: 200, display: 'block' }}
            allowClear
            placeholder={t('Tous les états')}
            value={statutFiltre}
            onChange={valeur => setStatutFiltre(valeur ?? undefined)}
            options={(['DRAFT', 'COUNTED', 'VALIDATED', 'CANCELLED'] as StockCountStatus[]).map(code => ({
              value: code,
              label: STOCK_COUNT_STATUS_DISPLAY[code].label
            }))}
          />
        </div>
        <div>
          <label htmlFor="comptages-nature">{t('Nature')}</label>
          <Select
            id="comptages-nature"
            style={{ width: 220, display: 'block' }}
            allowClear
            placeholder={t('Toutes les natures')}
            value={natureFiltre}
            onChange={valeur => setNatureFiltre(valeur ?? undefined)}
            options={(['REGULAR', 'OPENING', 'CLOSING'] as StockCountKind[]).map(code => ({
              value: code,
              label: STOCK_COUNT_KIND_LABELS[code]
            }))}
          />
        </div>
        {canCount ? (
          <Button type="primary" onClick={() => setFenetre({})}>
            {t('Ouvrir un inventaire')}
          </Button>
        ) : null}
      </Space>

      <DataView<StockCount>
        paginated={false}
        scrollX={1300}
        items={comptages}
        total={comptages.length}
        page={1}
        pageSize={Math.max(comptages.length, 1)}
        onPageChange={() => {}}
        loading={liste.isPending}
        isReloading={liste.isFetching && !liste.isPending}
        error={liste.isError ? t('Impossible de charger les inventaires.') : null}
        onRetry={() => void liste.refetch()}
        isFiltered={Boolean(lieuFiltre || statutFiltre || natureFiltre)}
        onClearFilters={() => {
          setLieuFiltre(undefined);
          setStatutFiltre(undefined);
          setNatureFiltre(undefined);
        }}
        emptyDescription={t('Aucun inventaire n’a encore été ouvert.')}
        emptyAction={canCount ? { label: t('Ouvrir un inventaire'), onClick: () => setFenetre({}) } : undefined}
        columns={colonnes}
        rowKey={c => c.id}
        aria-label={t('Inventaires')}
        renderCard={c => (
          <DataCard
            title={c.locationLabel}
            aria-label={c.locationLabel}
            subtitle={`${STOCK_COUNT_KIND_LABELS[c.kind]} · ${t('Compté le {{value}}', { value: dateCourte(c.countedAt) })}`}
            status={etat(c)}
            highlight={valuesVisible ? valeurEcart(c) : undefined}
            fields={[
              { label: t('Lignes'), value: String(c.linesCount) },
              {
                label: t('Lignes en écart'),
                value: c.blind || c.varianceCount === null ? t('Masqué') : String(c.varianceCount)
              },
              { label: t('Ouvert par'), value: c.createdByLabel }
            ]}
            primaryAction={{ label: actionDeListe(c.status), onClick: () => onOuvrirDetail(c.id) }}
          />
        )}
      />

      {countId ? (
        <DetailInventaire
          key={countId}
          tenantId={tenantId}
          contexte={contexte}
          countId={countId}
          valuesVisible={valuesVisible}
          onFermer={() => onOuvrirDetail(null)}
        />
      ) : null}

      <FenetreOuverture
        tenantId={tenantId}
        contexte={contexte}
        open={fenetre !== null}
        lieuInitial={fenetre?.lieu}
        natureInitiale={fenetre?.nature}
        onFermer={() => {
          setFenetre(null);
          onFermerOuverture();
        }}
        onCree={async cree => {
          setFenetre(null);
          onFermerOuverture();
          queryClient.setQueryData(detailKey('stock-counts', tenantId, cree.id), cree);
          await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-counts', tenantId) });
          void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
          message.success(t('Inventaire ouvert sur « {{locationLabel}} ».', { locationLabel: cree.locationLabel }));
          onOuvrirDetail(cree.id);
        }}
      />
    </>
  );
};

// ===========================================================================
// La page
// ===========================================================================

function estRefus(error: unknown): boolean {
  return (error as { response?: { status?: number } } | null)?.response?.status === 403;
}

export const StockInventaire: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const contexte = useStockFieldContext(tenantId);

  const countId = searchParams.get('inventaire');
  const ouvrir = searchParams.get('ouvrir');
  const lieuOuverture = searchParams.get('lieu') ?? undefined;
  const ouverture = useMemo(
    () =>
      ouvrir
        ? {
            lieu: lieuOuverture,
            nature: ouvrir === 'OPENING' || ouvrir === 'CLOSING' ? (ouvrir as StockCountKind) : undefined
          }
        : null,
    [ouvrir, lieuOuverture]
  );

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const enTete = (
    <PageHeader
      title={t('Transferts et inventaire du stock')}
      subtitle={t('Déplacer de la matière d’un lieu à un autre, et compter ce qui s’y trouve')}
    />
  );

  if (contexte.isPending) {
    return (
      <>
        {enTete}
        <StateBlock variant="loading" />
      </>
    );
  }
  if (contexte.isError || !contexte.data) {
    if (isModuleNotIncludedError(contexte.error)) return <ModuleNotIncluded />;
    return (
      <>
        {enTete}
        {estRefus(contexte.error) ? (
          <StateBlock
            variant="forbidden"
            title={t('Le stock ne vous est pas ouvert')}
            description={t(
              'Votre rôle ne comprend pas la consultation du stock. Demandez à l’administrateur de l’agence de vous attribuer le rôle Magasinier ou un rôle qui la comprend.'
            )}
          />
        ) : (
          <StateBlock
            variant="error"
            description={t('Impossible de charger le stock.')}
            actions={[{ label: t('Réessayer'), onClick: () => void contexte.refetch(), primary: true }]}
          />
        )}
      </>
    );
  }

  const donnees = contexte.data.data;
  const valuesVisible = contexte.data.meta.valuesVisible ?? donnees.abilities.valuesVisible;
  const { canTransfer } = donnees.abilities;

  const ongletDemande = searchParams.get('onglet');
  const onglet =
    ongletDemande === 'transfert' && canTransfer
      ? 'transfert'
      : ongletDemande === 'inventaire' || countId || ouvrir || !canTransfer
        ? 'inventaire'
        : 'transfert';

  const majParametres = (changements: Record<string, string | null>) => {
    const suivants = new URLSearchParams(searchParams);
    for (const [cle, valeur] of Object.entries(changements)) {
      if (valeur === null) suivants.delete(cle);
      else suivants.set(cle, valeur);
    }
    setSearchParams(suivants, { replace: true });
  };

  const onglets = [
    ...(canTransfer
      ? [
          {
            key: 'transfert',
            label: t('Transfert entre lieux'),
            children: (
              <OngletTransfert
                tenantId={tenantId}
                contexte={donnees}
                valuesVisible={valuesVisible}
                origineInitiale={searchParams.get('origine') ?? undefined}
              />
            )
          }
        ]
      : []),
    {
      key: 'inventaire',
      label: t('Inventaire physique'),
      children: (
        <OngletInventaire
          tenantId={tenantId}
          contexte={donnees}
          countId={countId}
          onOuvrirDetail={id => majParametres({ inventaire: id, onglet: 'inventaire' })}
          ouverture={ouverture}
          onFermerOuverture={() => majParametres({ ouvrir: null, lieu: null })}
        />
      )
    }
  ];

  return (
    <>
      {enTete}
      {!valuesVisible ? (
        <Text type="secondary" style={{ display: 'block', marginBlockEnd: 'var(--space-3)' }}>
          {t('Les valeurs du stock ne sont pas affichées pour votre rôle.')}
        </Text>
      ) : null}
      <Tabs activeKey={onglet} onChange={cle => majParametres({ onglet: cle })} items={onglets} />
    </>
  );
};

export default StockInventaire;
