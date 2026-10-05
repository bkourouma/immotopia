import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, App, Button, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  enableSiteStock,
  getSiteStockReconciliationWithMeta,
  getSiteStockStatus
} from '../../services/finance-stock-rapprochement-service';
import type { SiteStockReconciliationLine } from '../../types/finance-stock-rapprochement-types';
import { detailKey, STALE_TIME } from '../../lib/query-keys';
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
import { StockQuantityCell } from '../../components/finance/stock/StockQuantityCell';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text, Paragraph } = Typography;

/**
 * Le stock d'un chantier — bascule au stock et rapprochement acheté /
 * consommé / restant. Lot 5, quatrième et dernier sous-lot (PRD E9, besoin S7,
 * principe P-7 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot5-rapprochement.ts`).
 *
 * Chemin supposé : `/tenant/:tenantId/finance/chantiers/:siteId/stock`.
 * `tenantId` et `siteId` sont lus dans le CHEMIN (`useParams`), jamais en
 * paramètre de requête — le défaut relevé deux fois au lot 2.
 *
 * ---------------------------------------------------------------------------
 * Fichiers-registres, hors du territoire de cet agent
 * ---------------------------------------------------------------------------
 *
 * **Cet écran n'est câblé nulle part.** `App.tsx`, `navigation/model.tsx`,
 * `dev/atelier/Atelier.tsx`, `dev/atelier/mock-api.ts` et `ChantierDetail.tsx`
 * sont réservés au superviseur, qui pose la route et le lien depuis la fiche du
 * chantier à l'intégration. Extraits prêts à coller :
 *
 * ```tsx
 * // App.tsx — à côté de ClotureChantier, avec le même commentaire de chunk
 * const StockChantier = lazy(() =>
 *   import('./pages/finance/StockChantier').then(m => ({ default: m.StockChantier }))
 * );
 * <Route path="/tenant/:tenantId/finance/chantiers/:siteId/stock" element={<StockChantier />} />
 * ```
 *
 * ```tsx
 * // ChantierDetail.tsx — dans `secondaryActions` du <PageHeader>, après « Lots et clôture »
 * {
 *   key: 'stock',
 *   label: 'Stock du chantier',
 *   onClick: () => navigate(`/tenant/${tenantId}/finance/chantiers/${siteId}/stock`)
 * }
 * ```
 *
 * ```ts
 * // dev/atelier/mock-api.ts
 * import { repondreStockRapprochement } from './finance-mock-stock-rapprochement';
 * // dans la liste `for (const repondre of [...])` :
 * repondreStockRapprochement
 * ```
 *
 * ```ts
 * // dev/atelier/Atelier.tsx — cinq scènes, décrites dans le mock
 * const STOCK_NON_BASCULE = 'tenant/' + AGENCE + '/finance/chantiers/chantier-non-bascule-01/stock';
 * const STOCK_NON_BASCULE_CONSOMME = 'tenant/' + AGENCE + '/finance/chantiers/chantier-non-bascule-consomme-01/stock';
 * const STOCK_ECART = 'tenant/' + AGENCE + '/finance/chantiers/chantier-ecart-01/stock';
 * const STOCK_TRANSFERTS = 'tenant/' + AGENCE + '/finance/chantiers/chantier-transferts-01/stock';
 * const STOCK_SANS_ECART = 'tenant/' + AGENCE + '/finance/chantiers/chantier-sans-ecart-01/stock';
 * ```
 *
 * ---------------------------------------------------------------------------
 * 1. La bascule est IRRÉVERSIBLE, et la confirmation le dit sans détour
 * ---------------------------------------------------------------------------
 *
 * Aucune route ne revient en arrière, pas même pour un administrateur : rejouer
 * l'imputation de toutes les factures postérieures et défaire celle de toutes
 * les sorties ferait bouger le coût du chantier sous les pieds de celui qui le
 * regarde. Une agence qui bascule un chantier par erreur n'a qu'un recours : ne
 * plus s'en servir.
 *
 * L'écran écrit donc **ce qui change** — à partir de la bascule, les factures
 * de matériaux de ce chantier n'entrent plus dans son coût, et c'est la sortie
 * de magasin qui les y fera entrer — et il l'écrit DEUX FOIS : sur la page,
 * avant qu'on approche du bouton, et dans la confirmation, avant qu'on la
 * valide.
 *
 * ---------------------------------------------------------------------------
 * 2. Aucune date n'est envoyée
 * ---------------------------------------------------------------------------
 *
 * Le corps de la bascule est vide. Le schéma serveur est `z.object({}).strict()`
 * et refuse `enabledAt` en 400 : une date choisie par l'appelant permettrait
 * d'antidater la bascule et de reclasser après coup des factures déjà
 * imputées. Il n'y a donc **aucun sélecteur de date sur cet écran**, et le
 * service ne peut pas en envoyer.
 *
 * ---------------------------------------------------------------------------
 * 3. Les deux entrées ne se mélangent jamais — le cœur de l'écran
 * ---------------------------------------------------------------------------
 *
 * « Entré depuis une facture » et « Venu d'un autre lieu » sont **deux colonnes
 * distinctes, deux libellés distincts, deux indicateurs distincts**. Seule la
 * première se confronte au facturé.
 *
 * Les confondre rendait l'écart négatif sur un chantier approvisionné depuis un
 * magasin central — le cas le plus courant : aucune facture à son nom, donc
 * `invoicedAmount` à zéro, et un écart qui affichait l'opposé de tout ce qu'on
 * lui avait livré. C'est la correction que le contrat gelé raconte, et l'écran
 * ne la défait pas.
 *
 * ---------------------------------------------------------------------------
 * 4. L'écart est MONTRÉ, jamais jugé
 * ---------------------------------------------------------------------------
 *
 * Des frais de transport que la facture portait et une quantité facturée qui
 * n'est jamais arrivée se ressemblent dans une soustraction. **Aucun mot de cet
 * écran ne qualifie l'écart** : ni « perte », ni « vol », ni « anomalie », ni
 * « manquant ». Il n'a même pas de couleur d'alerte — un rouge est déjà un
 * verdict. Les deux lectures sont présentées côte à côte, et aucune n'est
 * choisie : c'est à un humain de trancher, pas à une soustraction.
 *
 * ---------------------------------------------------------------------------
 * 5. Un chantier non basculé montre quand même ce qu'il a consommé
 * ---------------------------------------------------------------------------
 *
 * Rien n'empêche un magasin central de sortir vers un chantier qui n'est pas
 * passé au stock, et ces sorties ont bel et bien imputé son coût. Seuls le
 * facturé et l'écart valent zéro — il n'y a pas de période à confronter —, et
 * l'écran l'écrit sous chacun des deux plutôt que de laisser lire un zéro
 * comme un rapprochement réussi.
 *
 * ---------------------------------------------------------------------------
 * 6. Aucun montant n'est calculé ici, et les quantités ne sont pas des montants
 * ---------------------------------------------------------------------------
 *
 * Tous les chiffres arrivent tout faits (principe P-4) : pas une addition, pas
 * une soustraction, pas un total de colonne recomposé.
 *
 * Les quantités passent par `quantite()`, **jamais par `<MoneyValue>`** : la
 * précision du stock est `Decimal(16,4)` et le formateur monétaire arrondit à
 * l'unité. Un quart de mètre cube s'afficherait « 0 ».
 *
 * **Vocabulaire (P-1 du PRD).** Un chantier *passe au stock*, une marchandise
 * *entre*, *vient d'un autre lieu*, est *consommée* ou *reste* — jamais
 * « débit » ni « crédit ».
 */

/**
 * Une quantité de stock, à quatre décimales au plus.
 *
 * **Jamais `formatMoney`** : il arrondit à l'unité, et 0,25 m³ deviendrait
 * « 0 ». Le minimum est à zéro décimale pour que 12 sacs restent « 12 » et non
 * « 12,0000 » — la précision est conservée, le bruit ne l'est pas.
 */
function quantite(valeur: number, unite: string): string {
  const nombre = valeur.toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  return unite ? `${nombre} ${unite}` : nombre;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

function messageErreur(err: unknown, secours: string): string {
  const reponse = (err as { response?: { data?: { message?: string } } })?.response;
  return reponse?.data?.message || secours;
}

/**
 * Une quantité, et sous elle la valeur que le serveur lui attribue.
 *
 * Lot 040 : une quantité `null` (lieu du chantier en comptage à l'aveugle)
 * s'affiche « Comptage en cours », et une valeur `null` n'est pas affichée —
 * jamais « 0 » ni « — » à la place d'un chiffre masqué.
 */
function CelluleFlux(props: { quantite: number | null; unite: string; valeur: number | null }): React.ReactElement {
  return (
    <div>
      <div>
        <StockQuantityCell quantity={props.quantite} unit={props.unite} />
      </div>
      {props.quantite !== null && props.valeur !== null ? (
        <Text type="secondary">
          <MoneyValue value={props.valeur} />
        </Text>
      ) : null}
    </div>
  );
}

export const StockChantier: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, siteId } = useParams<{ tenantId: string; siteId: string }>();
  const queryClient = useQueryClient();

  const [basculeEnCours, setBasculeEnCours] = useState(false);

  const {
    data: rapprochementLu,
    isPending: rapprochementEnAttente,
    error: erreurRapprochement,
    refetch: refetchRapprochement
  } = useQuery({
    queryKey: detailKey('site-stock-reconciliation', tenantId, siteId ?? ''),
    queryFn: () => getSiteStockReconciliationWithMeta(tenantId as string, siteId as string),
    enabled: Boolean(tenantId && siteId),
    staleTime: STALE_TIME.list
  });

  // Le lieu de stockage ne vient que d'ici. Son échec ne masque pas l'écran :
  // `stockEnabledAt` est porté par les DEUX lectures, et le rapprochement suffit
  // à savoir si le chantier est passé au stock.
  const {
    data: statut,
    isPending: statutEnAttente,
    error: erreurStatut
  } = useQuery({
    queryKey: detailKey('site-stock-status', tenantId, siteId ?? ''),
    queryFn: () => getSiteStockStatus(tenantId as string, siteId as string),
    enabled: Boolean(tenantId && siteId),
    staleTime: STALE_TIME.list
  });

  const rapprochement = rapprochementLu?.data;

  const invaliderTout = async () => {
    await queryClient.invalidateQueries({ queryKey: detailKey('site-stock-reconciliation', tenantId, siteId ?? '') });
    await queryClient.invalidateQueries({ queryKey: detailKey('site-stock-status', tenantId, siteId ?? '') });
  };

  /**
   * Le geste irréversible.
   *
   * **Aucun argument, aucune date** : le service envoie un corps vide, et le
   * serveur date la bascule de l'instant de la décision.
   */
  const basculer = async () => {
    if (!tenantId || !siteId) return;
    setBasculeEnCours(true);
    try {
      const nouveau = await enableSiteStock(tenantId, siteId);
      await invaliderTout();
      message.success(
        `${
          nouveau.stockLocationLabel
            ? t('Chantier passé au stock. Ses réceptions atterriront au lieu « {{stockLocationLabel}} ».', {
                stockLocationLabel: nouveau.stockLocationLabel
              })
            : t('Chantier passé au stock.')
        } ${t('Pensez à faire l’inventaire d’ouverture.')}`
      );
    } catch (err) {
      // « Le chantier « X » est déjà passé au stock », « Chantier clos » : le
      // serveur est la seule autorité, et son message dit ce qui s'est passé.
      message.error(messageErreur(err, t('Le passage au stock a échoué.')));
    } finally {
      setBasculeEnCours(false);
    }
  };

  if (!tenantId || !siteId) {
    return <StateBlock variant="empty" title={t('Aucun chantier sélectionné')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/chantiers` },
    { label: t('Chantiers'), to: `/tenant/${tenantId}/finance/chantiers` },
    ...(rapprochement
      ? [
          { label: rapprochement.siteLabel, to: `/tenant/${tenantId}/finance/chantiers/${siteId}` },
          { label: t('Stock du chantier') }
        ]
      : [{ label: t('Stock du chantier') }])
  ];

  if (erreurRapprochement) {
    return (
      <>
        <PageHeader title={t('Stock du chantier')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger le stock de ce chantier.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchRapprochement(), primary: true }]}
        />
      </>
    );
  }

  if (rapprochementEnAttente || !rapprochement) {
    return (
      <>
        <PageHeader title={t('Stock du chantier')} breadcrumbs={filAriane} />
        <StateBlock variant="loading" />
      </>
    );
  }

  const basculeeLe = rapprochement.stockEnabledAt;
  const basculee = Boolean(basculeeLe);
  const lieu = statut?.stockLocationLabel ?? null;

  const colonnes: ColumnsType<SiteStockReconciliationLine> = [
    { title: t('Référence'), key: 'reference', render: (_, ligne) => ligne.itemReference },
    { title: t('Désignation'), key: 'designation', render: (_, ligne) => ligne.itemLabel },
    {
      // Les deux entrées ne se mélangent jamais : deux colonnes, deux
      // libellés. Seule celle-ci se confronte au facturé.
      title: t('Entré depuis une facture'),
      key: 'recu',
      align: 'end',
      render: (_, ligne) => (
        <CelluleFlux quantite={ligne.receivedQuantity} unite={ligne.itemUnit} valeur={ligne.receivedValue} />
      )
    },
    {
      title: t("Venu d'un autre lieu"),
      key: 'transfere',
      align: 'end',
      render: (_, ligne) => (
        <CelluleFlux quantite={ligne.transferredInQuantity} unite={ligne.itemUnit} valeur={ligne.transferredInValue} />
      )
    },
    {
      title: t('Consommé'),
      key: 'consomme',
      align: 'end',
      render: (_, ligne) => (
        <CelluleFlux quantite={ligne.issuedQuantity} unite={ligne.itemUnit} valeur={ligne.issuedValue} />
      )
    },
    {
      // Lot 040 (A6) : deux colonnes descriptives, qui ne se soustraient de rien.
      title: t('Retourné au fournisseur'),
      key: 'retourne',
      align: 'end',
      render: (_, ligne) => (
        <CelluleFlux
          quantite={ligne.returnedToSupplierQuantity}
          unite={ligne.itemUnit}
          valeur={ligne.returnedToSupplierValue}
        />
      )
    },
    {
      title: t('Mis au rebut'),
      key: 'rebut',
      align: 'end',
      render: (_, ligne) => (
        <CelluleFlux quantite={ligne.scrappedQuantity} unite={ligne.itemUnit} valeur={ligne.scrappedValue} />
      )
    },
    {
      title: t('Restant'),
      key: 'restant',
      align: 'end',
      render: (_, ligne) => (
        <CelluleFlux quantite={ligne.remainingQuantity} unite={ligne.itemUnit} valeur={ligne.remainingValue} />
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('{{siteLabel}} — stock du chantier', { siteLabel: rapprochement.siteLabel })}
        breadcrumbs={filAriane}
        subtitle={
          basculee
            ? lieu
              ? t('Lieu de stockage : {{lieu}}', { lieu: lieu })
              : undefined
            : t("Ce chantier n'est pas encore passé au stock")
        }
        extra={
          <StatusTag
            status={basculee ? 'ACTIVE' : 'INACTIVE'}
            label={basculee ? t('Passé au stock') : t('Pas au stock')}
          />
        }
      />

      {erreurStatut && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 'var(--space-3)' }}
          message={t('Impossible de lire le lieu de stockage de ce chantier.')}
          description={t(
            "Les chiffres ci-dessous restent justes ; seul le nom du lieu où atterrissent les réceptions n'a pas pu être affiché."
          )}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* L'état : passé au stock ou non                                 */}
      {/* ------------------------------------------------------------- */}

      {basculee ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          message={t('Ce chantier est passé au stock le {{value}}.', { value: dateCourte(basculeeLe as string) })}
          description={
            <>
              <Paragraph style={{ marginBottom: 'var(--space-2)' }}>
                {t(
                  "Depuis cette date, les factures de matériaux rattachées à ce chantier n'entrent plus directement dans son coût : la marchandise entre en stock, et c'est la"
                )}{' '}
                <strong>sortie de magasin</strong>{' '}
                {t('qui la fait entrer dans le coût du chantier. Les factures imputées avant cette date le restent.')}
              </Paragraph>
              <Paragraph style={{ marginBottom: 0 }}>
                {lieu ? (
                  <>
                    {t('Les réceptions de ce chantier atterrissent au lieu')} <strong>« {lieu} »</strong>.
                  </>
                ) : statutEnAttente ? (
                  // En cours de lecture : ne pas annoncer une absence qu'on ne
                  // sait pas encore.
                  <Text type="secondary">{t('Lecture du lieu de stockage…')}</Text>
                ) : (
                  <Text type="secondary">{t("Le lieu de stockage de ce chantier n'a pas pu être lu.")}</Text>
                )}
              </Paragraph>
            </>
          }
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          message={t("Ce chantier n'est pas passé au stock.")}
          description={
            <>
              <Paragraph style={{ marginBottom: 'var(--space-2)' }}>
                {t("Ses factures de matériaux entrent aujourd'hui")} <strong>{t('directement dans son coût')}</strong>
                {t(
                  ", à leur validation. Le faire passer au stock change cela pour la suite : la marchandise facturée entrera en stock, et c'est la"
                )}{' '}
                <strong>sortie de magasin</strong> {t('qui la fera entrer dans le coût du chantier.')}
              </Paragraph>
              {/*
                Dit ICI, avant même que l'on approche du bouton, et redit dans
                la confirmation. Le prix d'une erreur est un chantier dont on
                ne peut plus se servir.
              */}
              <Paragraph style={{ marginBottom: 0 }}>
                <strong>{t('Ce geste est irréversible.')}</strong>{' '}
                {t(
                  "Aucun retour en arrière n'existe, pas même pour un administrateur : il faudrait rejouer l'imputation de toutes les factures postérieures et défaire celle de toutes les sorties, et le coût du chantier changerait sous les yeux de celui qui le regarde. Une agence qui bascule un chantier par erreur n'a qu'un recours : ne plus s'en servir."
                )}
              </Paragraph>
            </>
          }
        />
      )}

      {basculee && statut?.openingCountSuggested ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          message={t('Faites l’inventaire d’ouverture de ce lieu')}
          description={
            <>
              <Paragraph style={{ marginBottom: 'var(--space-2)' }}>
                {t(
                  'Il constate ce qui s’y trouve déjà. Les quantités trouvées entrent dans le stock sans valeur, puisque leurs factures ont déjà été imputées au chantier.'
                )}
              </Paragraph>
              {statut.stockLocationId ? (
                <Link
                  to={`/tenant/${tenantId}/finance/stock/inventaire?ouvrir=OPENING&lieu=${encodeURIComponent(
                    statut.stockLocationId
                  )}`}
                >
                  {t('Faire l’inventaire d’ouverture')}
                </Link>
              ) : null}
            </>
          }
        />
      ) : null}

      {!basculee && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <ConfirmAction
            title={t('Faire passer le chantier « {{siteLabel}} » au stock ?', { siteLabel: rapprochement.siteLabel })}
            description={
              <span>
                <strong>{t('Cette bascule est irréversible')}</strong>{' '}
                {t(
                  ": aucune route ne revient en arrière, pas même pour un administrateur. À partir de maintenant, les factures de matériaux de ce chantier n'entreront plus dans son coût — elles entreront en stock, et c'est la sortie de magasin qui les y fera entrer. Les factures déjà imputées le restent. Un lieu de stockage sera créé pour ce chantier s'il n'en a pas encore. Une agence qui bascule un chantier par erreur n'a qu'un recours : ne plus s'en servir."
                )}
              </span>
            }
            okText={t('Confirmer le passage au stock')}
            onConfirm={basculer}
          >
            <Button type="primary" loading={basculeEnCours}>
              {t('Faire passer ce chantier au stock')}
            </Button>
          </ConfirmAction>
          <Paragraph type="secondary" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
            {/* Aucun sélecteur de date : la bascule vaut à l'instant où elle
                est décidée, et le serveur refuse une date choisie. */}
            {t(
              "La bascule prend effet à l'instant où elle est confirmée. Il n'y a pas de date à choisir : une date saisie permettrait de reclasser après coup des factures déjà imputées."
            )}
          </Paragraph>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Les totaux — tous calculés par le serveur (P-4)                */}
      {/* ------------------------------------------------------------- */}

      <Title level={4}>{t('Acheté, consommé, restant')}</Title>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)'
        }}
      >
        <StatCard
          label={t('Facturé au chantier')}
          value={<MoneyValue value={rapprochement.invoicedAmount} />}
          hint={
            basculee
              ? t('Factures validées rattachées à ce chantier, depuis son passage au stock.')
              : // Zéro, et l'écran dit POURQUOI : sans bascule il n'y a pas de
                // période à confronter. Un zéro muet se lirait comme « rien
                // n'a été facturé », ce qui est autre chose.
                t(
                  "Ce chantier n'est pas passé au stock : il n'y a pas de période à confronter, donc aucune facture n'est rapprochée ici."
                )
          }
        />
        <StatCard
          label={t('Entré depuis une facture')}
          value={<MoneyValue value={rapprochement.receivedValue} />}
          hint={t(
            "Marchandise entrée au lieu du chantier à la réception d'une facture fournisseur. C'est la seule entrée qui se confronte au facturé."
          )}
        />
        <StatCard
          label={t("Venu d'un autre lieu")}
          value={<MoneyValue value={rapprochement.transferredInValue} />}
          // Jamais mêlé au reçu : une livraison interne n'est pas un achat.
          hint={t(
            "Livraisons reçues d'un magasin ou d'un autre chantier de l'agence. Cette marchandise a été payée ailleurs, ou ne l'a jamais été : elle n'entre pas dans l'écart."
          )}
        />
        <StatCard
          label={t('Consommé')}
          value={<MoneyValue value={rapprochement.issuedValue} />}
          hint={t(
            "Sorties imputées à ce chantier, depuis n'importe quel lieu. C'est la part de son coût qui vient du stock."
          )}
        />
        <StatCard
          label={t('Restant sur le chantier')}
          value={
            rapprochement.remainingValue === null ? (
              <StockQuantityCell quantity={null} />
            ) : (
              <MoneyValue value={rapprochement.remainingValue} />
            )
          }
          hint={t('Ce qui se trouve au lieu du chantier à cet instant.')}
        />
        <StatCard
          // Aucune couleur d'alerte, à aucun moment : un rouge serait déjà un
          // verdict, et cet écart ne se juge pas.
          label={t('Écart entre le facturé et le reçu')}
          value={<MoneyValue value={rapprochement.unreconciledAmount} />}
          tone="neutral"
          hint={
            basculee
              ? t('Ce que les fournisseurs ont facturé, moins ce qui est entré en stock depuis une facture.')
              : t(
                  "Ce chantier n'est pas passé au stock : sans période à confronter, cet écart n'est pas calculé, et ce zéro ne dit pas que les deux chiffres concordent."
                )
          }
        />
      </div>

      {/*
        L'écart expliqué — les DEUX lectures, et aucune n'est choisie. Le
        système ne sait pas les distinguer, et prétendre le contraire
        reviendrait à mettre en cause quelqu'un sur une soustraction.
      */}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 'var(--space-6)' }}
        message={t("Ce que l'écart dit, et ce qu'il ne dit pas")}
        description={
          <>
            <Paragraph style={{ marginBottom: 'var(--space-2)' }}>
              {t(
                "Il compare ce que les fournisseurs ont facturé à ce chantier depuis son passage au stock à ce qui est réellement entré en stock depuis une facture. Il peut venir de frais que la facture portait sans qu'ils entrent en stock — transport, manutention —"
              )}{' '}
              <strong>{t("comme d'une quantité facturée qui n'est jamais arrivée sur place")}</strong>. Une soustraction
              ne distingue pas les deux : cet écran montre le chiffre, et c'est à vous de dire lequel des deux cas vous
              avez sous les yeux.
            </Paragraph>
            <Paragraph style={{ marginBottom: 0 }}>
              {t("Les livraisons venues d'un autre lieu de l'agence")}{' '}
              <strong>{t("n'entrent pas dans ce calcul")}</strong>{' '}
              {t(
                ": elles ont été payées ailleurs, ou ne l'ont jamais été, et les compter réduirait l'écart sans qu'aucun fournisseur n'ait rien apporté."
              )}
            </Paragraph>
          </>
        }
      />

      {/* ------------------------------------------------------------- */}
      {/* Le détail, article par article                                 */}
      {/* ------------------------------------------------------------- */}

      <Title level={4}>{t('Article par article')}</Title>

      <Paragraph type="secondary">
        {t(
          "Les quantités sont exprimées dans l'unité de chaque article, et la valeur que le serveur leur attribue est rappelée dessous."
        )}{' '}
        <strong>{t('Ces colonnes ne se soustraient pas entre elles')}</strong>{' '}
        {t(
          ": le consommé compte les sorties vers ce chantier depuis n'importe quel lieu, tandis que l'entré, le venu d'ailleurs et le restant portent sur le seul lieu du chantier."
        )}
      </Paragraph>

      <DataView<SiteStockReconciliationLine>
        // Le contrat de `getSiteStockReconciliation` ne pagine pas : il rend le
        // rapprochement entier d'un chantier.
        paginated={false}
        scrollX={1400}
        items={rapprochement.lines}
        total={rapprochement.lines.length}
        page={1}
        pageSize={Math.max(rapprochement.lines.length, 1)}
        onPageChange={() => {}}
        emptyDescription={t('Aucun mouvement de stock ne concerne encore ce chantier.')}
        columns={colonnes}
        rowKey={ligne => ligne.itemId}
        aria-label={t('Articles du chantier')}
        renderCard={ligne => (
          <DataCard
            title={ligne.itemReference}
            aria-label={ligne.itemReference}
            subtitle={ligne.itemLabel}
            highlight={<StockQuantityCell quantity={ligne.remainingQuantity} unit={ligne.itemUnit} />}
            fields={[
              { label: t('Entré depuis une facture'), value: quantite(ligne.receivedQuantity, ligne.itemUnit) },
              { label: t("Venu d'un autre lieu"), value: quantite(ligne.transferredInQuantity, ligne.itemUnit) },
              { label: t('Consommé'), value: quantite(ligne.issuedQuantity, ligne.itemUnit) },
              {
                label: t('Retourné au fournisseur'),
                value: quantite(ligne.returnedToSupplierQuantity, ligne.itemUnit)
              },
              { label: t('Mis au rebut'), value: quantite(ligne.scrappedQuantity, ligne.itemUnit) },
              {
                label: t('Restant'),
                value: <StockQuantityCell quantity={ligne.remainingQuantity} unit={ligne.itemUnit} />
              }
            ]}
          />
        )}
      />

      <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)' }}>
        {t(
          "Tous les chiffres de cet écran sont calculés par le serveur. Aucun n'est saisi, et aucun n'est recomposé ici."
        )}
      </Paragraph>
    </>
  );
};

export default StockChantier;
