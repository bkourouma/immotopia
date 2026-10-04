import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, App, Button, DatePicker, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  capitalizeSiteLot,
  closeSite,
  createSiteLot,
  deleteSiteLot,
  getSiteClosureBlockers,
  getSiteCostBreakdown,
  reopenSite,
  setLotAllocationMethod,
  updateSiteLot
} from '../../services/finance-site-closing-service';
import {
  ALLOCATION_METHOD_LABELS,
  ALLOCATION_METHOD_REQUIREMENTS,
  OWNERSHIP_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  PropertyOwnershipType,
  PropertyType
} from '../../types/finance-site-closing-types';
import type {
  SiteClosure,
  SiteClosureBlocker,
  SiteLot,
  SiteLotAllocationMethod
} from '../../types/finance-site-closing-types';
import { detailKey, STALE_TIME } from '../../lib/query-keys';
import {
  ConfirmAction,
  DataCard,
  DataView,
  MoneyValue,
  PageHeader,
  StatCard,
  StateBlock,
  StatusTag,
  useConfirmAction
} from '../../components/primitives';
import { t } from '../../i18n/t';

import { activeLocale, formatNumber } from '../../i18n/format';
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

/**
 * Lots, coût de revient et clôture d'un chantier — lot 4, sixième et dernier
 * sous-lot (PRD E6, besoins P16 et P17 ; contrat gelé
 * `packages/api/src/lib/finance/types-lot4-closing.ts`).
 *
 * Chemin supposé : `/tenant/:tenantId/finance/chantiers/:siteId/cloture`. Le
 * chantier est dans le CHEMIN, pas en paramètre de requête — le défaut relevé
 * deux fois au lot 2.
 *
 * **Cet écran n'est pas câblé.** `App.tsx`, `navigation/model.tsx`,
 * `dev/atelier/Atelier.tsx` et `dev/atelier/mock-api.ts` sont des
 * fichiers-registres réservés au superviseur, qui les branche à l'intégration.
 * Le lien depuis la fiche du chantier (`ChantierDetail.tsx`, qui appartient à
 * un autre sous-lot) est posé par lui également. Extraits prêts à coller :
 *
 * ```tsx
 * // App.tsx
 * import { ClotureChantier } from './pages/finance/ClotureChantier';
 * <Route path="finance/chantiers/:siteId/cloture" element={<ClotureChantier />} />
 * ```
 *
 * ```ts
 * // dev/atelier/mock-api.ts
 * import { repondreSiteClosing } from './finance-mock-site-closing';
 * // dans la liste `for (const repondre of [...])` :
 * repondreSiteClosing
 * ```
 *
 * ```ts
 * // dev/atelier/Atelier.tsx — cinq scènes, décrites dans le mock
 * const CLOTURE_OUVERT = 'tenant/' + AGENCE + '/finance/chantiers/chantier-ouvert-01/cloture';
 * const CLOTURE_CLOS = 'tenant/' + AGENCE + '/finance/chantiers/chantier-clos-01/cloture';
 * const CLOTURE_BLOQUE = 'tenant/' + AGENCE + '/finance/chantiers/chantier-bloque-01/cloture';
 * const CLOTURE_SANS_CLE = 'tenant/' + AGENCE + '/finance/chantiers/chantier-sans-cle-01/cloture';
 * const CLOTURE_SANS_LOT = 'tenant/' + AGENCE + '/finance/chantiers/chantier-sans-lot-01/cloture';
 * ```
 *
 * ---------------------------------------------------------------------------
 * Le point qui, mal lu, coûte de l'argent : estimation ou définitif
 * ---------------------------------------------------------------------------
 *
 * Sur un chantier OUVERT, le coût de revient d'un lot est une **estimation** :
 * c'est sa part du coût réel à l'instant de la lecture, et une facture validée
 * demain la fera bouger. Sur un chantier CLOS, c'est sa part du coût figé, et
 * elle ne bougera plus.
 *
 * Les deux arrivent dans le même champ. L'écran l'écrit donc en toutes lettres,
 * en haut, dans deux mentions différentes selon l'état — il ne le laisse pas
 * deviner. Quelqu'un qui fixe un prix de vente sur une estimation en la croyant
 * définitive perd de l'argent, et c'est le genre d'erreur qu'on ne découvre
 * qu'à la signature.
 *
 * ---------------------------------------------------------------------------
 * Les bloqueurs se lisent AVANT d'essayer
 * ---------------------------------------------------------------------------
 *
 * `getSiteClosureBlockers` les liste, avec leur nombre, et le serveur applique
 * exactement les mêmes à la clôture (même fonction côté serveur — ce serait
 * cruel de les lister puis d'en appliquer d'autres). Le geste de clôture est
 * donc désactivé tant qu'il en reste un, et la liste est affichée : se heurter
 * à un refus sec après avoir cliqué n'apprend rien sur ce qu'il faut faire.
 *
 * ---------------------------------------------------------------------------
 * Trois refus expliqués plutôt que grisés sans raison
 * ---------------------------------------------------------------------------
 *
 * **La réouverture est refusée dès qu'un lot a basculé.** Un bien existe
 * désormais, avec une valeur d'acquisition tirée d'un coût qu'on s'apprêterait
 * à faire bouger. Défaire la bascule voudrait dire supprimer un bien qui vit
 * peut-être déjà sa vie — loué, publié, rattaché à un bail. L'écran le dit.
 *
 * **La correction, la suppression d'un lot et le changement de clé sont
 * refusés dès qu'UN lot du chantier a basculé** — pas seulement celui qu'on
 * touche. C'est une règle du serveur (`assertNoCapitalizedLotTx`) plus large
 * que ce que le contrat gelé annonce, et l'écran l'annonce telle qu'elle est
 * appliquée.
 *
 * **L'ajout d'un lot est refusé sur un chantier clos** : découper après coup ce
 * qu'on a déclaré fini rouvrirait la question du coût de revient de lots déjà
 * basculés.
 *
 * ---------------------------------------------------------------------------
 * La bascule au patrimoine crée un bien réel
 * ---------------------------------------------------------------------------
 *
 * Elle écrit un `Property` et une `AssetValuation` portant le coût de revient
 * du lot pour valeur d'acquisition, et un lot ne bascule qu'une fois. La
 * confirmation dit donc ce qu'elle crée ET avec quelle valeur d'acquisition.
 *
 * Les champs du bien sont **saisis**, jamais devinés depuis le chantier : un
 * chantier a une zone, pas une adresse postale, et une villa n'est pas un
 * terrain nu. `propertyType` et `ownershipType` sont des énumérations Postgres
 * présentées en liste de choix avec des libellés français — un champ libre
 * produirait un 400 illisible.
 *
 * ---------------------------------------------------------------------------
 * Aucun montant, aucun pourcentage n'est calculé ici
 * ---------------------------------------------------------------------------
 *
 * `sharePercent`, `costPrice`, `totalCost` et `unallocatedCost` arrivent tout
 * faits (principe P-4). **La seule exception** est la somme des quotes-parts
 * SAISIES, affichée en direct pendant la saisie : elle n'est pas encore une
 * donnée du serveur, et sans elle on ne saurait pas de combien on s'écarte de
 * cent. Elle est sommée sur les valeurs ARRONDIES à deux décimales, comme le
 * serveur le fait — sommer les valeurs brutes laisserait passer
 * 33,333 + 33,333 + 33,334 = 100 alors que les valeurs stockées font 99,99.
 *
 * L'écran n'empêche pas de saisir une quote-part isolée qui ne mène pas à cent :
 * le serveur n'exige les cent qu'à la POSE de la clé, précisément pour qu'on
 * puisse reconfigurer.
 *
 * **Vocabulaire (P-1 du PRD).** On *ajoute* un lot, on *répartit* un coût, on
 * *clôture* un chantier, on le *rouvre*, on *bascule* un lot au patrimoine —
 * jamais « débit » ni « crédit ».
 */

/** Arrondi à deux décimales, la précision à laquelle le serveur stocke et somme. */
function arrondiDeuxDecimales(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

function pourcentage(valeur: number): string {
  return `${valeur.toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
}

function surfaceOuTiret(valeur: number | null): string {
  if (valeur === null || valeur === undefined) return '—';
  return `${valeur.toLocaleString(activeLocale(), { maximumFractionDigits: 2 })} m²`;
}

function messageErreur(err: unknown, secours: string): string {
  const reponse = (err as { response?: { data?: { message?: string } } })?.response;
  return reponse?.data?.message || secours;
}

const CLES: SiteLotAllocationMethod[] = ['SURFACE', 'EQUAL', 'MANUAL'];

interface FormulaireBien {
  internalReference: string;
  propertyType: PropertyType | undefined;
  ownershipType: PropertyOwnershipType | undefined;
  title: string;
  description: string;
  address: string;
  acquisitionDate: Dayjs | null;
}

function formulaireBienVide(): FormulaireBien {
  return {
    internalReference: '',
    // Ni type ni mode de détention présélectionnés : une villa n'est pas un
    // terrain nu, et le chantier ne sait pas lequel des deux il produit.
    // Proposer une valeur par défaut la ferait accepter sans y penser.
    propertyType: undefined,
    ownershipType: undefined,
    title: '',
    description: '',
    // La seule valeur préremplie, et elle ne vient pas du chantier : la date
    // du jour, qu'on corrige d'un clic.
    acquisitionDate: dayjs(),
    address: ''
  };
}

const BLOQUEURS_DE_STOCK: ReadonlyArray<SiteClosureBlocker['documentType']> = [
  'STOCK_COUNT',
  'STOCK_RESIDUAL',
  'STOCK_CLOSING_COUNT_MISSING'
];

/** Lot 040 (A7-R3) : un bloqueur porté par le stock du chantier, pas par une pièce. */
function estBloqueurDeStock(bloqueur: SiteClosureBlocker): boolean {
  return BLOQUEURS_DE_STOCK.includes(bloqueur.documentType);
}

/** Rang dans l'ordre du parcours : l'inventaire en cours, l'inventaire de clôture, puis le transfert du reste. */
const RANG_DU_PARCOURS: Partial<Record<NonNullable<SiteClosureBlocker['documentType']>, number>> = {
  STOCK_COUNT: 1,
  STOCK_CLOSING_COUNT_MISSING: 2,
  STOCK_RESIDUAL: 3
};

/**
 * Les bloqueurs dans l'ordre du parcours (spec A7-R3) : les pièces d'abord,
 * dans l'ordre du serveur, puis les bloqueurs de stock — l'inventaire de
 * clôture avant le transfert de ce qui reste.
 */
function ordonnerBloqueurs(liste: SiteClosureBlocker[]): SiteClosureBlocker[] {
  return liste
    .map((bloqueur, index) => ({ bloqueur, index }))
    .sort((a, b) => {
      const rangA = (a.bloqueur.documentType && RANG_DU_PARCOURS[a.bloqueur.documentType]) || 0;
      const rangB = (b.bloqueur.documentType && RANG_DU_PARCOURS[b.bloqueur.documentType]) || 0;
      return rangA - rangB || a.index - b.index;
    })
    .map(entree => entree.bloqueur);
}

/**
 * Ce qui reste sur le lieu du chantier (`STOCK_RESIDUAL`, `count` = nombre
 * d'articles), dit après le message du serveur — ou rien pour un autre
 * bloqueur.
 *
 * `count` vaut `null` quand le lieu est en comptage à l'aveugle pour
 * l'appelant (lot 040, spec §8.2) : ce nombre lui dirait combien d'articles il
 * reste à trouver. Le bloqueur se lit alors sans nombre.
 */
function detailDuReste(bloqueur: SiteClosureBlocker): string | null {
  if (bloqueur.documentType !== 'STOCK_RESIDUAL') return null;
  if (bloqueur.count === null) return t('Nombre d’articles masqué (comptage en cours).');
  if (bloqueur.count === 1) return t('1 article encore en stock.');
  if (bloqueur.count > 1) {
    return t('{{nombre}} articles encore en stock.', { nombre: formatNumber(bloqueur.count) });
  }
  return null;
}

/** Le lien d'action d'un bloqueur de stock (ecrans §10.3), ou rien. */
function actionDeBloqueur(
  tenantId: string | undefined,
  bloqueur: SiteClosureBlocker
): { label: string; to: string } | null {
  const cible = bloqueur.documentIds?.[0];
  if (!tenantId || !cible) return null;
  const inventaire = `/tenant/${tenantId}/finance/stock/inventaire`;
  const id = encodeURIComponent(cible);
  switch (bloqueur.documentType) {
    case 'STOCK_COUNT':
      return { label: t('Ouvrir l’inventaire'), to: `${inventaire}?inventaire=${id}` };
    case 'STOCK_RESIDUAL':
      return { label: t('Transférer le reste vers un magasin'), to: `${inventaire}?onglet=transfert&origine=${id}` };
    case 'STOCK_CLOSING_COUNT_MISSING':
      return { label: t('Faire l’inventaire de clôture'), to: `${inventaire}?ouvrir=CLOSING&lieu=${id}` };
    default:
      return null;
  }
}

export const ClotureChantier: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, siteId } = useParams<{ tenantId: string; siteId: string }>();
  const queryClient = useQueryClient();
  const confirmerAction = useConfirmAction();

  const {
    data: repartition,
    isPending: repartitionEnAttente,
    error: erreurRepartition,
    refetch: refetchRepartition
  } = useQuery({
    queryKey: detailKey('site-cost-breakdown', tenantId, siteId ?? ''),
    queryFn: () => getSiteCostBreakdown(tenantId as string, siteId as string),
    enabled: Boolean(tenantId && siteId),
    staleTime: STALE_TIME.list
  });

  const { data: bloqueurs, error: erreurBloqueurs } = useQuery({
    queryKey: detailKey('site-closure-blockers', tenantId, siteId ?? ''),
    queryFn: () => getSiteClosureBlockers(tenantId as string, siteId as string),
    enabled: Boolean(tenantId && siteId),
    staleTime: STALE_TIME.list
  });

  // ---------------------------------------------------------------------
  // Saisie
  // ---------------------------------------------------------------------

  const [nouveauNom, setNouveauNom] = useState('');
  const [nouvelleSurface, setNouvelleSurface] = useState<number | null>(null);
  const [nouvelleQuotePart, setNouvelleQuotePart] = useState<number | null>(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const [lotCorrige, setLotCorrige] = useState<SiteLot | null>(null);
  const [correctionNom, setCorrectionNom] = useState('');
  const [correctionSurface, setCorrectionSurface] = useState<number | null>(null);
  const [correctionQuotePart, setCorrectionQuotePart] = useState<number | null>(null);
  const [correctionEnCours, setCorrectionEnCours] = useState(false);

  const [cleChoisie, setCleChoisie] = useState<SiteLotAllocationMethod | undefined>(undefined);
  const [cleEnCours, setCleEnCours] = useState(false);

  const [lotABasculer, setLotABasculer] = useState<SiteLot | null>(null);
  const [formulaireBien, setFormulaireBien] = useState<FormulaireBien>(formulaireBienVide);
  const [basculeEnCours, setBasculeEnCours] = useState(false);

  /** Renseigné juste après une clôture ou une réouverture — aucune lecture ne le rend. */
  const [dernierGesteCloture, setDernierGesteCloture] = useState<SiteClosure | null>(null);

  const lots = useMemo(() => repartition?.lots ?? [], [repartition]);
  const unLotABascule = useMemo(() => lots.some(lot => lot.propertyId !== null), [lots]);

  /**
   * La SEULE valeur calculée à l'écran (voir l'en-tête) : la somme des
   * quotes-parts saisies, celles déjà enregistrées comme celle en cours de
   * frappe. Sommée sur les valeurs arrondies, comme le serveur.
   */
  const sommeQuotesParts = useMemo(() => {
    let somme = 0;
    for (const lot of lots) {
      const valeur = lotCorrige?.id === lot.id ? correctionQuotePart : lot.manualSharePercent;
      somme += arrondiDeuxDecimales(valeur ?? 0);
    }
    somme += arrondiDeuxDecimales(nouvelleQuotePart ?? 0);
    return arrondiDeuxDecimales(somme);
  }, [lots, lotCorrige, correctionQuotePart, nouvelleQuotePart]);

  const invaliderTout = async () => {
    await queryClient.invalidateQueries({ queryKey: detailKey('site-cost-breakdown', tenantId, siteId ?? '') });
    await queryClient.invalidateQueries({ queryKey: detailKey('site-closure-blockers', tenantId, siteId ?? '') });
  };

  // ---------------------------------------------------------------------
  // Gestes
  // ---------------------------------------------------------------------

  const ajouterLot = async () => {
    if (!tenantId || !siteId || !nouveauNom.trim()) return;
    setAjoutEnCours(true);
    try {
      await createSiteLot(tenantId, siteId, {
        name: nouveauNom.trim(),
        surfaceArea: nouvelleSurface,
        manualSharePercent: nouvelleQuotePart
      });
      await invaliderTout();
      message.success(t('Lot « {{value}} » ajouté.', { value: nouveauNom.trim() }));
      setNouveauNom('');
      setNouvelleSurface(null);
      setNouvelleQuotePart(null);
    } catch (err) {
      message.error(messageErreur(err, t("L'ajout du lot a échoué.")));
    } finally {
      setAjoutEnCours(false);
    }
  };

  const ouvrirCorrection = (lot: SiteLot) => {
    setLotCorrige(lot);
    setCorrectionNom(lot.name);
    setCorrectionSurface(lot.surfaceArea);
    setCorrectionQuotePart(lot.manualSharePercent);
  };

  const enregistrerCorrection = async () => {
    if (!tenantId || !siteId || !lotCorrige) return;
    setCorrectionEnCours(true);
    try {
      // Les trois champs partent ensemble : c'est un formulaire de correction
      // complet, et `null` y veut dire « efface », jamais « ne touche pas ».
      await updateSiteLot(tenantId, siteId, lotCorrige.id, {
        name: correctionNom.trim(),
        surfaceArea: correctionSurface,
        manualSharePercent: correctionQuotePart
      });
      await invaliderTout();
      message.success(t('Lot « {{value}} » corrigé.', { value: correctionNom.trim() }));
      setLotCorrige(null);
    } catch (err) {
      message.error(messageErreur(err, t('La correction du lot a échoué.')));
    } finally {
      setCorrectionEnCours(false);
    }
  };

  const supprimerLot = async (lot: SiteLot) => {
    if (!tenantId || !siteId) return;
    try {
      await deleteSiteLot(tenantId, siteId, lot.id);
      await invaliderTout();
      message.success(t('Lot « {{name}} » supprimé.', { name: lot.name }));
    } catch (err) {
      message.error(messageErreur(err, t('La suppression du lot a échoué.')));
    }
  };

  const appliquerCle = async () => {
    if (!tenantId || !siteId || !cleChoisie) return;
    setCleEnCours(true);
    try {
      await setLotAllocationMethod(tenantId, siteId, cleChoisie);
      await invaliderTout();
      message.success(t('Clé de répartition : {{value}}.', { value: ALLOCATION_METHOD_LABELS[cleChoisie] }));
    } catch (err) {
      // Le serveur refuse une clé que les lots ne supportent pas, et son
      // message nomme les lots fautifs : il est relayé tel quel.
      message.error(messageErreur(err, t("La clé de répartition n'a pas pu être posée.")));
    } finally {
      setCleEnCours(false);
    }
  };

  const cloturer = async () => {
    if (!tenantId || !siteId) return;
    try {
      const closure = await closeSite(tenantId, siteId);
      setDernierGesteCloture(closure);
      await invaliderTout();
      message.success(t('Chantier clôturé : son coût est figé.'));
    } catch (err) {
      message.error(messageErreur(err, t('La clôture a échoué.')));
    }
  };

  const rouvrir = async () => {
    if (!tenantId || !siteId) return;
    try {
      await reopenSite(tenantId, siteId);
      setDernierGesteCloture(null);
      await invaliderTout();
      message.success(t('Chantier rouvert : son coût redevient dérivé des imputations.'));
    } catch (err) {
      message.error(messageErreur(err, t('La réouverture a échoué.')));
    }
  };

  const ouvrirBascule = (lot: SiteLot) => {
    setLotABasculer(lot);
    setFormulaireBien(formulaireBienVide());
  };

  const basculer = async () => {
    if (!tenantId || !siteId || !lotABasculer) return;
    if (!formulaireBien.acquisitionDate || !formulaireBien.propertyType || !formulaireBien.ownershipType) return;
    setBasculeEnCours(true);
    try {
      const cree = await capitalizeSiteLot(tenantId, siteId, lotABasculer.id, {
        internalReference: formulaireBien.internalReference.trim(),
        propertyType: formulaireBien.propertyType,
        ownershipType: formulaireBien.ownershipType,
        title: formulaireBien.title.trim(),
        description: formulaireBien.description,
        address: formulaireBien.address.trim(),
        acquisitionDate: formulaireBien.acquisitionDate.format('YYYY-MM-DD')
      });
      await invaliderTout();
      message.success(
        t('Bien « {{propertyInternalReference}} » créé au patrimoine.', {
          propertyInternalReference: cree.propertyInternalReference
        })
      );
      setLotABasculer(null);
    } catch (err) {
      message.error(messageErreur(err, t('La bascule au patrimoine a échoué.')));
    } finally {
      setBasculeEnCours(false);
    }
  };

  // ---------------------------------------------------------------------

  if (!tenantId || !siteId) {
    return <StateBlock variant="empty" title={t('Aucun chantier sélectionné')} />;
  }

  const filAriane = [
    { label: t('Finance'), to: `/tenant/${tenantId}/finance/chantiers` },
    { label: t('Chantiers'), to: `/tenant/${tenantId}/finance/chantiers` },
    ...(repartition
      ? [
          { label: repartition.siteLabel, to: `/tenant/${tenantId}/finance/chantiers/${siteId}` },
          { label: t('Lots et clôture') }
        ]
      : [{ label: t('Lots et clôture') }])
  ];

  if (erreurRepartition) {
    return (
      <>
        <PageHeader title={t('Lots et clôture du chantier')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger le coût de revient de ce chantier.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetchRepartition(), primary: true }]}
        />
      </>
    );
  }

  if (repartitionEnAttente || !repartition) {
    return (
      <>
        <PageHeader title={t('Lots et clôture du chantier')} breadcrumbs={filAriane} />
        <StateBlock variant="loading" />
      </>
    );
  }

  const clos = repartition.isClosed;
  const listeBloqueurs = ordonnerBloqueurs(bloqueurs ?? []);
  const nombreBloqueurs = listeBloqueurs.length;
  // Lot 040 : un bloqueur de stock compte des articles (`STOCK_RESIDUAL`) ou
  // un lieu, pas des pièces — il n'entre pas dans le total des pièces.
  const totalPiecesBloquantes = listeBloqueurs
    .filter(bloqueur => !estBloqueurDeStock(bloqueur))
    .reduce((somme, bloqueur) => somme + (bloqueur.count ?? 0), 0);
  const parcoursDeStock =
    listeBloqueurs.some(bloqueur => bloqueur.documentType === 'STOCK_CLOSING_COUNT_MISSING') &&
    listeBloqueurs.some(bloqueur => bloqueur.documentType === 'STOCK_RESIDUAL');

  const colonnesLots: ColumnsType<SiteLot> = [
    { title: t('Lot'), key: 'lot', render: (_, lot) => lot.name },
    { title: t('Surface'), key: 'surface', align: 'end', render: (_, lot) => surfaceOuTiret(lot.surfaceArea) },
    {
      title: t('Quote-part saisie'),
      key: 'quotePart',
      align: 'end',
      render: (_, lot) => (lot.manualSharePercent === null ? '—' : pourcentage(lot.manualSharePercent))
    },
    // Dérivée par le serveur depuis la clé : jamais recalculée ici.
    { title: t('Part'), key: 'part', align: 'end', render: (_, lot) => pourcentage(lot.sharePercent) },
    {
      title: t('Coût de revient'),
      key: 'cout',
      align: 'end',
      render: (_, lot) => (
        <strong>
          <MoneyValue value={lot.costPrice} />
        </strong>
      )
    },
    {
      title: t('Au patrimoine'),
      key: 'patrimoine',
      // Le libellé du bien, jamais son identifiant.
      render: (_, lot) => lot.propertyLabel ?? '—'
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, lot) => actionsDuLot(lot)
    }
  ];

  function actionsDuLot(lot: SiteLot): React.ReactNode {
    if (lot.propertyId) {
      return <Text type="secondary">{t('Basculé au patrimoine')}</Text>;
    }

    if (clos) {
      return (
        <Button type="link" onClick={() => ouvrirBascule(lot)}>
          {t('Basculer au patrimoine')}
        </Button>
      );
    }

    if (unLotABascule) {
      return <Text type="secondary">{t('Figé : un lot de ce chantier a basculé')}</Text>;
    }

    return (
      <Space>
        <Button type="link" onClick={() => ouvrirCorrection(lot)}>
          {t('Corriger')}
        </Button>
        <ConfirmAction
          title={t('Supprimer le lot « {{name}} » ?', { name: lot.name })}
          description={t(
            'Le coût de revient de tous les autres lots sera recalculé. Le serveur refuse ce geste si un lot de ce chantier a déjà basculé au patrimoine.'
          )}
          okText={t('Confirmer la suppression')}
          danger
          onConfirm={() => supprimerLot(lot)}
        >
          <Button type="link" danger>
            {t('Supprimer')}
          </Button>
        </ConfirmAction>
      </Space>
    );
  }

  /**
   * Les mêmes gestes que la colonne « Actions », en version carte : sous
   * 992 px, `<DataView>` ne rend que des cartes, et un lot sans action y
   * deviendrait impossible à corriger, à supprimer ou à basculer.
   */
  function actionsCarteDuLot(lot: SiteLot): Partial<React.ComponentProps<typeof DataCard>> {
    if (lot.propertyId) {
      return {};
    }

    if (clos) {
      return { primaryAction: { label: t('Basculer au patrimoine'), onClick: () => ouvrirBascule(lot) } };
    }

    if (unLotABascule) {
      return {};
    }

    return {
      primaryAction: { label: t('Corriger'), onClick: () => ouvrirCorrection(lot) },
      secondaryActions: [
        {
          key: 'supprimer',
          danger: true,
          label: t('Supprimer'),
          onClick: () =>
            confirmerAction({
              title: t('Supprimer le lot « {{name}} » ?', { name: lot.name }),
              description: t(
                'Le coût de revient de tous les autres lots sera recalculé. Le serveur refuse ce geste si un lot de ce chantier a déjà basculé au patrimoine.'
              ),
              okText: t('Confirmer la suppression'),
              danger: true,
              onConfirm: () => supprimerLot(lot)
            })
        }
      ]
    };
  }

  const valeurAcquisition = lotABasculer?.costPrice ?? 0;
  const basculePrete =
    Boolean(formulaireBien.internalReference.trim()) &&
    Boolean(formulaireBien.title.trim()) &&
    Boolean(formulaireBien.address.trim()) &&
    Boolean(formulaireBien.propertyType) &&
    Boolean(formulaireBien.ownershipType) &&
    Boolean(formulaireBien.acquisitionDate);

  return (
    <>
      <PageHeader
        title={t('{{siteLabel}} — lots et clôture', { siteLabel: repartition.siteLabel })}
        breadcrumbs={filAriane}
        extra={<StatusTag status={clos ? 'CLOSED' : 'IN_PROGRESS'} label={clos ? t('Clôturé') : t('Ouvert')} />}
      />

      {/*
        La mention la plus importante de l'écran, et elle diffère selon
        l'état : voir l'en-tête. Elle est en haut, avant les chiffres, parce
        qu'elle dit comment les lire.
      */}
      {clos ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          message={t('Chantier clôturé : les coûts de revient ci-dessous sont définitifs.')}
          description={t(
            "Le coût du chantier a été figé à la clôture. Le chantier n'accepte plus aucune imputation — facture, pièce de caisse, note de salaire ou situation d'avancement — et ces montants ne bougeront plus."
          )}
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          message={t('Chantier ouvert : les coûts de revient ci-dessous sont une estimation.')}
          description={t(
            "Ils valent la part de chaque lot dans le coût réel à cet instant. Toute facture, pièce de caisse ou note de salaire validée ensuite les fera bouger. Ne fixez aucun prix de vente sur ces montants tant que le chantier n'est pas clôturé."
          )}
        />
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)'
        }}
      >
        {/* Tous ces chiffres arrivent calculés du serveur (P-4). */}
        <StatCard
          label={t('Coût réparti sur les lots')}
          value={<MoneyValue value={repartition.totalCost} />}
          hint={clos ? t('Coût figé à la clôture') : t("Coût réel à l'instant de la lecture")}
          tone={clos ? 'positive' : 'warning'}
        />
        <StatCard
          label={t('Non réparti')}
          value={<MoneyValue value={repartition.unallocatedCost} />}
          tone={repartition.unallocatedCost > 0 ? 'warning' : 'neutral'}
          hint={
            repartition.unallocatedCost > 0
              ? lots.length === 0
                ? t("Ce chantier coûte, et aucun lot ne porte ce coût : ajoutez les lots qu'il produit.")
                : t("Aucune clé ne s'applique à ces lots : ce coût n'est encore porté par aucun d'eux.")
              : undefined
          }
        />
        <StatCard
          label={t('Clé de répartition')}
          value={
            repartition.allocationMethod
              ? ALLOCATION_METHOD_LABELS[repartition.allocationMethod]
              : t('Aucune clé posée')
          }
          tone={repartition.allocationMethod ? 'neutral' : 'warning'}
          hint={
            repartition.allocationMethod
              ? undefined
              : t(
                  "Tant qu'aucune clé n'est posée, la part de chaque lot vaut zéro et aucun coût de revient n'est réparti."
                )
          }
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Les lots                                                       */}
      {/* ------------------------------------------------------------- */}

      <Title level={4}>{t('Lots du chantier')}</Title>

      <DataView<SiteLot>
        paginated={false}
        scrollX={980}
        items={lots}
        total={lots.length}
        page={1}
        pageSize={Math.max(lots.length, 1)}
        onPageChange={() => {}}
        emptyDescription={t('Ce chantier ne produit encore aucun lot.')}
        columns={colonnesLots}
        rowKey={lot => lot.id}
        aria-label={t('Lots du chantier')}
        renderCard={lot => (
          <DataCard
            title={lot.name}
            aria-label={lot.name}
            highlight={<MoneyValue value={lot.costPrice} />}
            subtitle={
              lot.propertyLabel
                ? t('Au patrimoine : {{propertyLabel}}', { propertyLabel: lot.propertyLabel })
                : undefined
            }
            {...actionsCarteDuLot(lot)}
            fields={[
              { label: t('Part'), value: pourcentage(lot.sharePercent) },
              { label: t('Surface'), value: surfaceOuTiret(lot.surfaceArea) },
              {
                label: t('Quote-part saisie'),
                value: lot.manualSharePercent === null ? '—' : pourcentage(lot.manualSharePercent)
              }
            ]}
          />
        )}
      />

      <Bloc titre={t('Clé de répartition')}>
        <Paragraph type="secondary" style={{ marginBottom: 'var(--space-3)' }}>
          {t(
            'La clé décide de la part de chaque lot, et donc de son coût de revient. Le serveur refuse une clé que les lots ne supportent pas plutôt que de répartir à moitié.'
          )}
        </Paragraph>
        <Space wrap align="end" size="middle">
          <div style={{ minWidth: 260 }}>
            <div>
              <label htmlFor="cle-repartition">{t('Clé de répartition')}</label>
            </div>
            <Select
              id="cle-repartition"
              style={{ width: '100%' }}
              placeholder={t('Choisir une clé')}
              value={cleChoisie ?? repartition.allocationMethod ?? undefined}
              onChange={valeur => setCleChoisie(valeur)}
              disabled={clos || unLotABascule}
              options={CLES.map(cle => ({ value: cle, label: ALLOCATION_METHOD_LABELS[cle] }))}
            />
          </div>
          <Button
            type="primary"
            loading={cleEnCours}
            disabled={!cleChoisie || clos || unLotABascule}
            onClick={appliquerCle}
          >
            {t('Appliquer la clé')}
          </Button>
        </Space>
        <Paragraph type="secondary" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
          {ALLOCATION_METHOD_REQUIREMENTS[cleChoisie ?? repartition.allocationMethod ?? 'EQUAL']}
        </Paragraph>

        {/*
          La somme des quotes-parts SAISIES — la seule valeur calculée ici, et
          uniquement parce qu'elle n'existe pas côté serveur tant que la clé
          n'est pas posée. Elle ne bloque rien : on doit pouvoir saisir un lot
          isolé pour reconfigurer.
        */}
        {(cleChoisie ?? repartition.allocationMethod) === 'MANUAL' && (
          <Paragraph style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
            <strong>
              {t('Somme des quotes-parts saisies :')} {pourcentage(sommeQuotesParts)}
            </strong>{' '}
            {sommeQuotesParts === 100
              ? t('— le total vaut cent, la clé peut être posée.')
              : sommeQuotesParts < 100
                ? t('— il manque {{value}} pour atteindre cent.', {
                    value: pourcentage(arrondiDeuxDecimales(100 - sommeQuotesParts))
                  })
                : t('— le total dépasse cent de {{value}}.', {
                    value: pourcentage(arrondiDeuxDecimales(sommeQuotesParts - 100))
                  })}
          </Paragraph>
        )}

        {unLotABascule && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 'var(--space-3)' }}
            message={t('La répartition de ce chantier est figée.')}
            description={t(
              'Un lot a basculé au patrimoine : le bien créé porte déjà son coût de revient. Changer la clé, corriger ou supprimer un lot changerait la part de tous les autres, et ce bien porterait alors une valeur qui ne correspondrait plus à rien.'
            )}
          />
        )}
      </Bloc>

      {!clos && !unLotABascule && (
        <Bloc titre={t('Ajouter un lot')}>
          <Space wrap size="middle" align="end">
            <div>
              <div>
                <label htmlFor="lot-nom">{t('Nom du lot')}</label>
              </div>
              <Input
                id="lot-nom"
                value={nouveauNom}
                onChange={event => setNouveauNom(event.target.value)}
                placeholder={t('Ex. Villa A3')}
                style={{ width: 220 }}
              />
            </div>
            <div>
              <div>
                <label htmlFor="lot-surface">{t('Surface (m²)')}</label>
              </div>
              <InputNumber
                id="lot-surface"
                min={0}
                step={1}
                style={{ width: 160 }}
                value={nouvelleSurface ?? undefined}
                onChange={valeur => setNouvelleSurface((valeur as number | null) ?? null)}
              />
            </div>
            <div>
              <div>
                <label htmlFor="lot-quote-part">{t('Quote-part (%)')}</label>
              </div>
              <InputNumber
                id="lot-quote-part"
                min={0}
                max={100}
                step={0.01}
                style={{ width: 160 }}
                value={nouvelleQuotePart ?? undefined}
                onChange={valeur => setNouvelleQuotePart((valeur as number | null) ?? null)}
              />
            </div>
            <Button type="primary" loading={ajoutEnCours} disabled={!nouveauNom.trim()} onClick={ajouterLot}>
              {t('Ajouter le lot')}
            </Button>
          </Space>
          <Paragraph type="secondary" style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
            {t(
              "La surface n'est exigée que par la clé « Au prorata des surfaces », la quote-part que par la clé « Quotes-parts saisies ». Les champs laissés vides ne sont pas envoyés."
            )}
          </Paragraph>
        </Bloc>
      )}

      {clos && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 'var(--space-4)' }}
          message={t('Ce chantier est clôturé : on ne peut plus y ajouter de lot.')}
          description={t(
            "Découper après coup ce qu'on a déclaré fini rouvrirait la question du coût de revient des lots. Rouvrez le chantier si le découpage doit changer."
          )}
        />
      )}

      {/* ------------------------------------------------------------- */}
      {/* La clôture                                                     */}
      {/* ------------------------------------------------------------- */}

      <Title level={4} style={{ marginTop: 'var(--space-6)' }}>
        {t('Clôture du chantier')}
      </Title>

      {erreurBloqueurs && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 'var(--space-3)' }}
          message={t('Impossible de savoir ce qui empêche de clôturer.')}
          description={t(
            'La clôture reste possible, mais le serveur appliquera ses propres vérifications sans que cet écran ait pu les annoncer.'
          )}
        />
      )}

      {!clos && (
        <>
          {nombreBloqueurs > 0 ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 'var(--space-3)' }}
              message={
                totalPiecesBloquantes > 0
                  ? t(
                      '{{nombreBloqueurs}} raison{{value}} empêche{{value2}} de clôturer ce chantier ({{totalPiecesBloquantes}} pièce{{value3}} concernée{{value4}}).',
                      {
                        nombreBloqueurs: nombreBloqueurs,
                        value: nombreBloqueurs > 1 ? 's' : '',
                        value2: nombreBloqueurs > 1 ? 'nt' : '',
                        totalPiecesBloquantes: totalPiecesBloquantes,
                        value3: totalPiecesBloquantes > 1 ? 's' : '',
                        value4: totalPiecesBloquantes > 1 ? 's' : ''
                      }
                    )
                  : t('{{nombreBloqueurs}} raison{{value}} empêche{{value2}} de clôturer ce chantier.', {
                      nombreBloqueurs: nombreBloqueurs,
                      value: nombreBloqueurs > 1 ? 's' : '',
                      value2: nombreBloqueurs > 1 ? 'nt' : ''
                    })
              }
              description={
                <>
                  {parcoursDeStock ? (
                    <Paragraph style={{ marginBottom: 'var(--space-2)' }}>
                      {t(
                        'Faites d’abord l’inventaire de clôture du lieu de stockage, puis transférez ce qui reste vers un magasin.'
                      )}
                    </Paragraph>
                  ) : null}
                  <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}>
                    {/* Le message du serveur est affiché TEL QUEL : il est écrit
                        pour être lu, et le réécrire ici le ferait diverger. Un
                        bloqueur de stock reçoit en plus un lien d'action, et
                        le reste du lieu son nombre d'articles (ou rien, en
                        comptage à l'aveugle). */}
                    {listeBloqueurs.map(bloqueur => {
                      const action = actionDeBloqueur(tenantId, bloqueur);
                      const detail = detailDuReste(bloqueur);
                      return (
                        <li key={`${bloqueur.documentType ?? 'piece'}-${bloqueur.message}`}>
                          {bloqueur.message}
                          {detail ? (
                            <>
                              {' '}
                              <Text type="secondary">{detail}</Text>
                            </>
                          ) : null}
                          {action ? (
                            <>
                              {' '}
                              <Link to={action.to}>{action.label}</Link>
                            </>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </>
              }
            />
          ) : (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 'var(--space-3)' }}
              message={t("Rien n'empêche de clôturer ce chantier.")}
              description={t(
                'Aucune pièce en brouillon ni aucun stock ne le vise. Ce sont exactement les vérifications que le serveur appliquera.'
              )}
            />
          )}

          {nombreBloqueurs > 0 ? (
            <Button type="primary" disabled>
              {t('Clôturer le chantier')}
            </Button>
          ) : (
            <ConfirmAction
              title={t('Clôturer le chantier « {{siteLabel}} » ?', { siteLabel: repartition.siteLabel })}
              description={t(
                "Le coût du chantier sera figé à sa valeur actuelle, et il n'acceptera plus aucune imputation. C'est ce qui rend les coûts de revient des lots définitifs. Le chantier peut être rouvert tant qu'aucun lot n'a basculé au patrimoine."
              )}
              okText={t('Confirmer la clôture')}
              onConfirm={cloturer}
            >
              <Button type="primary">{t('Clôturer le chantier')}</Button>
            </ConfirmAction>
          )}
        </>
      )}

      {clos && (
        <>
          {dernierGesteCloture && (
            <Paragraph>
              {t('Clôturé le')} {dayjs(dernierGesteCloture.closedAt).format('DD/MM/YYYY')} par{' '}
              {dernierGesteCloture.closedByLabel}
              {t(', coût figé à')} <MoneyValue value={dernierGesteCloture.finalCost} />.
            </Paragraph>
          )}

          {unLotABascule ? (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 'var(--space-3)' }}
                message={t('Ce chantier ne peut plus être rouvert : un lot a basculé au patrimoine.')}
                description={t(
                  "Un bien existe désormais, et sa valeur d'acquisition vient du coût de revient figé de ce lot. Rouvrir le chantier ferait de nouveau bouger ce coût, et le bien porterait une valeur que plus rien ne justifierait. Défaire la bascule voudrait dire supprimer un bien qui vit peut-être déjà sa vie — loué, publié, rattaché à un bail."
                )}
              />
              <Button disabled>{t('Rouvrir le chantier')}</Button>
            </>
          ) : (
            <ConfirmAction
              title={t('Rouvrir le chantier « {{siteLabel}} » ?', { siteLabel: repartition.siteLabel })}
              description={t(
                'Le coût figé sera effacé et redeviendra dérivé des imputations, qui seront de nouveau acceptées. Les coûts de revient des lots redeviendront des estimations.'
              )}
              okText={t('Confirmer la réouverture')}
              onConfirm={rouvrir}
            >
              <Button>{t('Rouvrir le chantier')}</Button>
            </ConfirmAction>
          )}

          <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)' }}>
            {t(
              "Chaque lot peut maintenant basculer au patrimoine, depuis sa ligne dans le tableau ci-dessus. La bascule crée un bien réel : elle est irréversible et ne se fait qu'une fois par lot."
            )}
          </Paragraph>
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Correction d'un lot                                            */}
      {/* ------------------------------------------------------------- */}

      <Modal
        title={lotCorrige ? t('Corriger le lot « {{name}} »', { name: lotCorrige.name }) : t('Corriger le lot')}
        open={Boolean(lotCorrige)}
        onCancel={() => setLotCorrige(null)}
        okText={t('Enregistrer la correction')}
        cancelText={t('Annuler')}
        confirmLoading={correctionEnCours}
        okButtonProps={{ disabled: !correctionNom.trim() }}
        onOk={enregistrerCorrection}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <div>
              <label htmlFor="correction-nom">{t('Nom du lot')}</label>
            </div>
            <Input id="correction-nom" value={correctionNom} onChange={event => setCorrectionNom(event.target.value)} />
          </div>
          <div>
            <div>
              <label htmlFor="correction-surface">{t('Surface (m²)')}</label>
            </div>
            <InputNumber
              id="correction-surface"
              min={0}
              step={1}
              style={{ width: '100%' }}
              value={correctionSurface ?? undefined}
              onChange={valeur => setCorrectionSurface((valeur as number | null) ?? null)}
            />
          </div>
          <div>
            <div>
              <label htmlFor="correction-quote-part">{t('Quote-part (%)')}</label>
            </div>
            <InputNumber
              id="correction-quote-part"
              min={0}
              max={100}
              step={0.01}
              style={{ width: '100%' }}
              value={correctionQuotePart ?? undefined}
              onChange={valeur => setCorrectionQuotePart((valeur as number | null) ?? null)}
            />
          </div>
          <Text type="secondary">
            {t(
              'Un champ laissé vide efface la valeur enregistrée. Le coût de revient de tous les lots sera recalculé par le serveur.'
            )}
          </Text>
        </Space>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* Bascule au patrimoine                                          */}
      {/* ------------------------------------------------------------- */}

      <Modal
        title={
          lotABasculer
            ? t('Basculer « {{name}} » au patrimoine', { name: lotABasculer.name })
            : t('Basculer au patrimoine')
        }
        open={Boolean(lotABasculer)}
        onCancel={() => setLotABasculer(null)}
        footer={
          <Space>
            <Button onClick={() => setLotABasculer(null)}>{t('Annuler')}</Button>
            <ConfirmAction
              title={
                lotABasculer
                  ? t('Créer le bien du lot « {{name}} » ?', { name: lotABasculer.name })
                  : t('Créer le bien ?')
              }
              description={
                <span>
                  {t('Cette opération est irréversible. Elle crée un bien réel au patrimoine, «')}{' '}
                  {formulaireBien.title.trim() || 'sans titre'} {t('», de référence')}{' '}
                  {formulaireBien.internalReference.trim() || '—'}
                  {t(", avec une valeur d'acquisition de")} <MoneyValue value={valeurAcquisition} />{' '}
                  {t("— le coût de revient figé de ce lot. Un lot ne bascule qu'une fois.")}
                </span>
              }
              okText={t('Confirmer la création du bien')}
              onConfirm={basculer}
            >
              <Button type="primary" loading={basculeEnCours} disabled={!basculePrete}>
                {t('Créer le bien au patrimoine')}
              </Button>
            </ConfirmAction>
          </Space>
        }
        width={640}
        destroyOnHidden
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={t('Les champs du bien sont saisis, jamais repris du chantier.')}
            description={t(
              "Un chantier a une zone, pas une adresse postale, et une villa n'est pas un terrain nu. Rien n'est prérempli à partir du chantier : ce sont les informations du bien qui sera créé."
            )}
          />

          <div>
            <div>
              <label htmlFor="bien-reference">{t('Référence interne du bien')}</label>
            </div>
            <Input
              id="bien-reference"
              value={formulaireBien.internalReference}
              onChange={event => setFormulaireBien({ ...formulaireBien, internalReference: event.target.value })}
              placeholder={t('Ex. VIL-2026-014')}
            />
          </div>

          <div>
            <div>
              <label htmlFor="bien-titre">{t('Titre du bien')}</label>
            </div>
            <Input
              id="bien-titre"
              value={formulaireBien.title}
              onChange={event => setFormulaireBien({ ...formulaireBien, title: event.target.value })}
              placeholder={t('Ex. Villa A3 — Riviera')}
            />
          </div>

          {/* Énumérations Postgres : liste de choix, jamais un champ libre. */}
          <div>
            <div>
              <label htmlFor="bien-type">{t('Type de bien')}</label>
            </div>
            <Select
              showSearch
              optionFilterProp="label"
              id="bien-type"
              style={{ width: '100%' }}
              placeholder={t('Choisir un type de bien')}
              value={formulaireBien.propertyType}
              onChange={valeur => setFormulaireBien({ ...formulaireBien, propertyType: valeur })}
              options={Object.values(PropertyType).map(type => ({
                value: type,
                label: PROPERTY_TYPE_LABELS[type]
              }))}
            />
          </div>

          <div>
            <div>
              <label htmlFor="bien-detention">{t('Mode de détention')}</label>
            </div>
            <Select
              showSearch
              optionFilterProp="label"
              id="bien-detention"
              style={{ width: '100%' }}
              placeholder={t('Choisir un mode de détention')}
              value={formulaireBien.ownershipType}
              onChange={valeur => setFormulaireBien({ ...formulaireBien, ownershipType: valeur })}
              options={Object.values(PropertyOwnershipType).map(mode => ({
                value: mode,
                label: OWNERSHIP_TYPE_LABELS[mode]
              }))}
            />
          </div>

          <div>
            <div>
              <label htmlFor="bien-adresse">{t('Adresse du bien')}</label>
            </div>
            <Input
              id="bien-adresse"
              value={formulaireBien.address}
              onChange={event => setFormulaireBien({ ...formulaireBien, address: event.target.value })}
              placeholder={t('Ex. Quartier Riviera, Cocody, Abidjan')}
            />
          </div>

          <div>
            <div>
              <label htmlFor="bien-description">{t('Description')}</label>
            </div>
            <TextArea
              id="bien-description"
              rows={3}
              value={formulaireBien.description}
              onChange={event => setFormulaireBien({ ...formulaireBien, description: event.target.value })}
              placeholder={t('Facultative — elle peut rester vide.')}
            />
          </div>

          <div>
            <div>
              <label htmlFor="bien-date">{t("Date d'acquisition")}</label>
            </div>
            <DatePicker
              id="bien-date"
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={formulaireBien.acquisitionDate}
              onChange={valeur => setFormulaireBien({ ...formulaireBien, acquisitionDate: valeur })}
            />
          </div>

          {/* La valeur d'acquisition n'est pas saisissable : c'est le coût de
              revient figé du lot, et l'accepter en entrée permettrait
              d'inscrire au patrimoine une valeur que rien ne justifie. */}
          <StatCard
            label={t("Valeur d'acquisition portée au patrimoine")}
            value={<MoneyValue value={valeurAcquisition} />}
            hint={t("Le coût de revient figé de ce lot. Il n'est pas saisissable.")}
          />
        </Space>
      </Modal>
    </>
  );
};

/** Encadré de saisie, extrait par lisibilité — aucune logique propre. */
function Bloc(props: { titre: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 'var(--space-4)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)'
      }}
    >
      <Title level={5} style={{ marginTop: 0 }}>
        {props.titre}
      </Title>
      {props.children}
    </div>
  );
}

export default ClotureChantier;
