import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { App, Button, Card, Checkbox, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteDraftCashVoucher,
  getValidationQueue,
  validateSupplierInvoice,
  validateSupplierPayment,
  validateCashVoucher
} from '../../services/finance-lot2-service';
import { DOCUMENT_TYPE_LABELS } from '../../types/finance-lot2-types';
import type { PendingDocument, VoidableDocumentType } from '../../types/finance-lot2-types';
import { useListSearch } from '../../hooks/useListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { queryKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import {
  PageHeader,
  StateBlock,
  MoneyValue,
  StatCard,
  DataView,
  DataCard,
  useConfirmAction
} from '../../components/primitives';
import { t } from '../../i18n/t';
import { localizedList } from '../../i18n/localized';
import { HelpButton, HelpSectionTitle } from '../../help';

import { activeLocale } from '../../i18n/format';
const { Text, Title } = Typography;

/**
 * File de validation — récit 11 du lot 2
 * (specs/017-finance-fournisseurs-chantiers/spec.md, User Story 11 ; décision
 * D7 du plan : « saisie et validation restent deux gestes séparés »).
 *
 * Construit sur le même modèle que les écrans du lot 1 — `Facturation.tsx`,
 * `BalanceClients.tsx` : mêmes primitives, même état de liste porté par
 * l'URL, mêmes trois états délégués à `<DataView>`.
 *
 * **La raison d'être de l'écran, et son seul intérêt réel.** L'organisation de
 * la cliente est « plusieurs saisisseurs, un validateur ». Sans le nom de qui
 * a saisi chaque pièce, cette file ne servirait qu'à cliquer sur une liste
 * anonyme. `createdByLabel` (contrat gelé, `finance-lot2-types.ts`) est donc
 * affiché sur CHAQUE ligne, dans les deux dispositions (tableau et carte), et
 * le filtre « Saisi par » n'est pas une commodité : c'est la fonction que ce
 * récit demande explicitement (Acceptance Scenario 3).
 *
 * **Le filtre envoie un identifiant, jamais un nom.** `PendingDocument` porte
 * `createdByUserId` en plus de `createdByLabel` : le premier est la valeur
 * transmise à `getValidationQueue`, le second n'est jamais qu'affiché. Deux
 * saisisseurs homonymes ne doivent jamais se confondre dans le filtre — c'est
 * exactement le défaut déjà corrigé au lot 1 sur le filtre par bien
 * (`BalanceClients.tsx`, qui envoie l'identifiant du bien et non son titre).
 * Les options du filtre viennent d'un second appel non filtré (même pattern
 * que `listProperties` dans `BalanceClients.tsx`) : ainsi choisir un
 * saisisseur ne fait pas disparaître les autres du menu, et chaque option
 * porte l'identifiant en valeur, le nom en affichage.
 *
 * **Recherche en mode mixte** (guide : `docs/architecture/recherche-listes.md`).
 * « Saisi par » et « Nature » sont des critères SERVEUR (`createdByUserId`,
 * `documentType`, sans accesseur local) ; le champ libre (pièce, saisisseur),
 * le montant et la date de saisie filtrent la liste reçue en local
 * (`api: false` + accesseurs). Deux hooks lisent la même URL : `useListSearch`
 * donne les paramètres d'API avant la requête, `useLocalListSearch` filtre,
 * découpe et porte la barre.
 *
 * **Le filtre « Nature » part au serveur.** L'API accepte `documentType` ;
 * l'écran l'envoie (avec `createdByUserId`) au lieu de filtrer après
 * réception. Les compteurs par nature et le sous-titre restent ceux de la
 * file du saisisseur choisi, toutes natures confondues (requête dédiée, voir
 * `filePourCompteurs`).
 *
 * **Pagination locale et sélection.** La liste est découpée en pages de 20.
 * La sélection (cases à cocher, validation en lot) est limitée à la page
 * affichée : elle est vidée dès que la page, la taille de page ou un filtre
 * change, pour qu'un « Valider la sélection » ne vise jamais des pièces
 * invisibles. « Tout sélectionner » ne coche que la page affichée.
 *
 * **L'irréversibilité est dite, pas dramatisée.** Valider verrouille la pièce
 * (principe P-6 du PRD, contrairement à la relance de campagne du lot 1, qui
 * est sans risque) : une phrase d'avertissement précède l'action, dans la
 * confirmation elle-même, sans bouton `danger` ni rempart supplémentaire — ce
 * n'est pas une suppression.
 *
 * **La validation en lot est une commodité.** Chaque pièce reste
 * sélectionnable une à une ; la sélection groupée n'ajoute rien qu'un moyen
 * plus rapide de déclencher, pièce par pièce, exactement le même appel que le
 * bouton individuel (`Promise.allSettled`), et le compte rendu qui suit dit
 * ce qui est passé et ce qui a échoué — jamais un simple total.
 *
 * **Une file vide est une bonne nouvelle.** Sans filtre, `<DataView>` bascule
 * sur son état « vide » ; le message ici l'assume comme un succès (« tout est
 * à jour »), jamais comme une panne ou une absence de données à corriger.
 *
 * **Vocabulaire (P-1 du PRD).** On *facture*, on *règle*, on *impute* :
 * jamais « débit » ni « crédit ». Les montants passent systématiquement par
 * `<MoneyValue>`, sans préciser `currency`.
 */

function libelleNature(type: VoidableDocumentType): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

function accord(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

function cle(doc: PendingDocument): string {
  return `${doc.documentType}:${doc.documentId}`;
}

/** Le seul point du contrat qui décide quelle mutation appeler. */
function validerPiece(tenantId: string, doc: PendingDocument) {
  switch (doc.documentType) {
    case 'SUPPLIER_INVOICE':
      return validateSupplierInvoice(tenantId, doc.documentId);
    case 'SUPPLIER_PAYMENT':
      return validateSupplierPayment(tenantId, doc.documentId);
    case 'CASH_VOUCHER':
      return validateCashVoucher(tenantId, doc.documentId);
    default:
      return Promise.reject(new Error(t('Nature de pièce inconnue.')));
  }
}

/** Une nature inconnue (URL modifiée à la main) n'est pas envoyée : l'API répondrait 400. */
function natureConnue(valeur: string | undefined): VoidableDocumentType | undefined {
  return valeur && Object.prototype.hasOwnProperty.call(DOCUMENT_TYPE_LABELS, valeur)
    ? (valeur as VoidableDocumentType)
    : undefined;
}

const OPTIONS_NATURE = localizedList(() =>
  (Object.keys(DOCUMENT_TYPE_LABELS) as VoidableDocumentType[]).map(type => ({
    value: type,
    label: DOCUMENT_TYPE_LABELS[type]
  }))
);

// Champ libre local : libellé de la pièce et nom du saisisseur (constantes de module).
const TEXTE_RECHERCHE = [(doc: PendingDocument) => doc.label, (doc: PendingDocument) => doc.createdByLabel];

// Critères purement locaux : montant et date de saisie.
const ACCESSEURS = {
  montant: (doc: PendingDocument) => doc.amount,
  saisie: (doc: PendingDocument) => doc.createdAt
};

interface RapportLot {
  succes: string[];
  echecs: Array<{ label: string; raison: string }>;
}

export const FileDeValidation: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();
  const confirmAction = useConfirmAction();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string | null>(null);
  const [rapportLot, setRapportLot] = useState<RapportLot | null>(null);

  /**
   * Options du critère « Saisi par », lues sur la file NON filtrée.
   *
   * Choisir un saisisseur ne doit pas faire disparaître les autres du menu.
   */
  const { data: toutesLesPieces } = useQuery({
    queryKey: queryKey('validation-queue', tenantId, {}),
    queryFn: () => getValidationQueue(tenantId as string, {}),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const optionsSaisisseurs = React.useMemo(() => {
    const parPersonne = new Map<string, string>();
    for (const doc of toutesLesPieces ?? []) {
      parPersonne.set(doc.createdByUserId, doc.createdByLabel);
    }
    return Array.from(parPersonne.entries())
      .sort(([, labelA], [, labelB]) => labelA.localeCompare(labelB))
      .map(([id, label]) => ({ value: id, label }));
  }, [toutesLesPieces]);

  // Déclarés dans le corps : les libellés se retraduisent au changement de langue.
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Pièce, saisisseur…'), api: false },
    {
      key: 'saisisseur',
      type: 'select',
      label: t('Saisi par'),
      primary: true,
      options: optionsSaisisseurs,
      api: 'createdByUserId'
    },
    {
      key: 'nature',
      type: 'select',
      label: t('Nature'),
      primary: true,
      options: OPTIONS_NATURE,
      // Une nature inconnue (URL modifiée à la main) n'est pas envoyée : l'API répondrait 400.
      api: (valeur): Record<string, string> => {
        const nature = natureConnue(String(valeur));
        return nature ? { documentType: nature } : {};
      }
    },
    { key: 'montant', type: 'numberRange', label: t('Montant'), unit: 'FCFA', api: false },
    { key: 'saisie', type: 'dateRange', label: t('Saisie du… au…'), api: false }
  ];
  // Paramètres d'API des critères serveur, disponibles avant la requête.
  const { filterParams } = useListSearch({ criteria: criteres });
  const filtreCreateur = filterParams.createdByUserId as string | undefined;
  const filtreNature = filterParams.documentType as VoidableDocumentType | undefined;

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('validation-queue', tenantId, { createdByUserId: filtreCreateur, documentType: filtreNature }),
    queryFn: () =>
      getValidationQueue(tenantId as string, { createdByUserId: filtreCreateur, documentType: filtreNature }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  /**
   * File du saisisseur choisi, toutes natures confondues : alimente les
   * compteurs par nature et le sous-titre, qui ne doivent pas tomber à zéro
   * quand on filtre sur une nature. Sans filtre de nature, c'est la même clé
   * que la requête ci-dessus : une seule requête part.
   */
  const { data: filePourCompteurs } = useQuery({
    queryKey: queryKey('validation-queue', tenantId, { createdByUserId: filtreCreateur }),
    queryFn: () => getValidationQueue(tenantId as string, { createdByUserId: filtreCreateur }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  // Déjà filtrée par nature et par saisisseur côté serveur ; le reste (texte,
  // montant, date de saisie) se filtre ici, puis la liste est découpée en pages.
  const local = useLocalListSearch<PendingDocument>(data, {
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });
  const itemsPage = local.pageItems;
  const compteurs = filePourCompteurs ?? data ?? [];

  // La sélection ne vaut que pour la page affichée : on la vide dès que ce qui
  // est affiché change (page, taille de page, critères).
  useEffect(() => {
    setSelection(prev => (prev.size > 0 ? new Set() : prev));
  }, [local.page, local.pageSize, local.values]);

  const piecesSelectionnees = itemsPage.filter(doc => selection.has(cle(doc)));

  const clesVisibles = itemsPage.map(cle);
  const toutSelectionne = clesVisibles.length > 0 && clesVisibles.every(k => selection.has(k));
  const selectionPartielle = !toutSelectionne && clesVisibles.some(k => selection.has(k));

  const basculerUn = (doc: PendingDocument) => {
    setSelection(prev => {
      const next = new Set(prev);
      const k = cle(doc);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const basculerTout = () => {
    setSelection(prev => {
      const next = new Set(prev);
      if (toutSelectionne) clesVisibles.forEach(k => next.delete(k));
      else clesVisibles.forEach(k => next.add(k));
      return next;
    });
  };

  const invaliderLaFile = () =>
    queryClient.invalidateQueries({ queryKey: entityKeyPrefix('validation-queue', tenantId) });

  const validerUnePiece = async (doc: PendingDocument) => {
    if (!tenantId) return;
    setEnCours(cle(doc));
    try {
      await validerPiece(tenantId, doc);
      await invaliderLaFile();
      setSelection(prev => {
        const next = new Set(prev);
        next.delete(cle(doc));
        return next;
      });
      message.success(t('« {{label}} » a été validée.', { label: doc.label }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation a échoué.'));
    } finally {
      setEnCours(null);
    }
  };

  /**
   * Jette un brouillon de pièce de caisse. Ajout du 20 septembre 2026.
   *
   * **Cette file n'offrait que « Valider ».** Une pièce dont la validation
   * est refusée — celle d'un chantier clôturé, par exemple — y restait donc
   * pour toujours : ni validable, ni supprimable. Et comme un brouillon de
   * pièce de caisse interdit à lui seul de clôturer le chantier qu'il vise,
   * l'écran de clôture conseillait « validez-la ou supprimez-la » en ne
   * proposant que la première moitié.
   *
   * Seules les PIÈCES DE CAISSE sont concernées ici, parce qu'elles seules
   * ont aujourd'hui un point d'entrée de suppression côté serveur. Les autres
   * natures gardent leur unique action, et ce n'est pas un oubli : rien ne
   * doit laisser croire qu'un brouillon de facture se jette de la même façon
   * tant que le serveur ne le permet pas.
   */
  const supprimerUnBrouillon = async (doc: PendingDocument) => {
    if (!tenantId) return;
    setEnCours(cle(doc));
    try {
      await deleteDraftCashVoucher(tenantId, doc.documentId);
      await invaliderLaFile();
      setSelection(prev => {
        const next = new Set(prev);
        next.delete(cle(doc));
        return next;
      });
      message.success(t('« {{label}} » a été supprimée.', { label: doc.label }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La suppression a échoué.'));
    } finally {
      setEnCours(null);
    }
  };

  const demanderSuppression = (doc: PendingDocument) => {
    confirmAction({
      title: t('Supprimer « {{label}} » ?', { label: doc.label }),
      description: t(
        "Ce brouillon n'a ni numéro, ni écriture, ni imputation : le supprimer ne laisse aucune trace et ne change aucun coût. C'est la différence avec l'annulation, qui ne vaut que pour une pièce déjà validée."
      ),
      okText: t('Supprimer'),
      onConfirm: () => supprimerUnBrouillon(doc)
    });
  };

  const demanderValidation = (doc: PendingDocument) => {
    confirmAction({
      title: t('Valider « {{label}} » ?', { label: doc.label }),
      description: t(
        "Cette validation est irréversible : la pièce ne sera plus modifiable ensuite. Pour la corriger, il faudra l'annuler par une pièce liée."
      ),
      okText: t('Valider'),
      onConfirm: () => validerUnePiece(doc)
    });
  };

  const validerLot = async () => {
    if (!tenantId) return;
    const cibles = piecesSelectionnees;
    const resultats = await Promise.allSettled(cibles.map(doc => validerPiece(tenantId, doc)));

    const succes: string[] = [];
    const echecs: Array<{ label: string; raison: string }> = [];
    resultats.forEach((resultat, index) => {
      const doc = cibles[index];
      if (resultat.status === 'fulfilled') {
        succes.push(doc.label);
      } else {
        const raison = (resultat.reason as any)?.response?.data?.message || t('Échec de la validation.');
        echecs.push({ label: doc.label, raison });
      }
    });

    setRapportLot({ succes, echecs });
    setSelection(new Set());
    await invaliderLaFile();

    if (echecs.length === 0) {
      message.success(`${accord(succes.length, t('pièce validée'), t('pièces validées'))}.`);
    } else {
      message.warning(
        `${accord(succes.length, t('pièce validée'), t('pièces validées'))}, ${accord(echecs.length, t('échec'), t('échecs'))}.`
      );
    }
  };

  const demanderValidationLot = () => {
    if (piecesSelectionnees.length === 0) return;
    confirmAction({
      title:
        piecesSelectionnees.length > 1
          ? t('Valider les {{length}} pièces sélectionnées ?', { length: piecesSelectionnees.length })
          : t('Valider la pièce sélectionnée ?'),
      description: t(
        'Cette validation est irréversible : les pièces validées ne seront plus modifiables ensuite. Pour les corriger, il faudra les annuler une à une.'
      ),
      okText: t('Valider'),
      onConfirm: validerLot
    });
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const colonnes: ColumnsType<PendingDocument> = [
    {
      title: (
        <Checkbox
          aria-label={t('Tout sélectionner')}
          checked={toutSelectionne}
          indeterminate={selectionPartielle}
          onChange={basculerTout}
        />
      ),
      key: 'selection',
      exportable: false,
      width: 48,
      render: (_, doc) => (
        <Checkbox
          aria-label={t('Sélectionner {{label}}', { label: doc.label })}
          checked={selection.has(cle(doc))}
          onChange={() => basculerUn(doc)}
        />
      )
    },
    { title: t('Nature'), key: 'nature', render: (_, doc) => libelleNature(doc.documentType) },
    { title: t('Pièce'), key: 'piece', render: (_, doc) => doc.label },
    {
      title: t('Montant'),
      key: 'montant',
      align: 'end',
      render: (_, doc) => <MoneyValue value={doc.amount} />,
      exportValue: doc => doc.amount
    },
    { title: t('Saisie le'), key: 'date', render: (_, doc) => dateCourte(doc.createdAt) },
    { title: t('Saisi par'), key: 'saisisseur', render: (_, doc) => doc.createdByLabel },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, doc) => (
        <Space size={0}>
          <Button type="link" loading={enCours === cle(doc)} onClick={() => demanderValidation(doc)}>
            {t('Valider')}
          </Button>
          {doc.documentType === 'CASH_VOUCHER' && (
            <Button type="link" danger disabled={enCours === cle(doc)} onClick={() => demanderSuppression(doc)}>
              {t('Supprimer')}
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <PageHeader
        helpId="finance.validation.page"
        title={t('File de validation')}
        subtitle={compteurs.length > 0 ? `${accord(compteurs.length, t('pièce'), t('pièces'))} en attente` : undefined}
      />

      {compteurs.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-6)'
          }}
        >
          <StatCard
            helpId="finance.validation.indicateurs"
            label={DOCUMENT_TYPE_LABELS.SUPPLIER_INVOICE}
            value={String(compteurs.filter(d => d.documentType === 'SUPPLIER_INVOICE').length)}
          />
          <StatCard
            helpId="finance.validation.indicateurs"
            label={DOCUMENT_TYPE_LABELS.SUPPLIER_PAYMENT}
            value={String(compteurs.filter(d => d.documentType === 'SUPPLIER_PAYMENT').length)}
          />
          <StatCard
            helpId="finance.validation.indicateurs"
            label={DOCUMENT_TYPE_LABELS.CASH_VOUCHER}
            value={String(compteurs.filter(d => d.documentType === 'CASH_VOUCHER').length)}
          />
        </div>
      )}

      {/* Le point qui compte : l'irréversibilité est dite une fois, en une
          phrase, pas répétée en rempart sur chaque ligne — la confirmation
          par pièce la redit au moment décisif. */}
      <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-4)' }}>
        {t(
          "Valider une pièce est définitif : une fois validée, elle ne se modifie plus. Pour la corriger, il faut l'annuler par une pièce liée."
        )}
      </Text>

      {selection.size > 0 && (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <Space wrap align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
            <Space size="small">
              <Text>{accord(piecesSelectionnees.length, t('pièce sélectionnée'), t('pièces sélectionnées'))}</Text>
              <HelpButton size="small" helpId="finance.validation.lot" />
            </Space>
            <Button type="primary" onClick={demanderValidationLot}>
              {t('Valider la sélection')}
            </Button>
          </Space>
        </Card>
      )}

      {rapportLot && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-3)'
            }}
          >
            <Title level={5} style={{ margin: 0 }}>
              <HelpSectionTitle
                title={t('Compte rendu de la validation en lot')}
                helpId="finance.validation.compte-rendu"
              />
            </Title>
            <Button type="text" onClick={() => setRapportLot(null)} aria-label={t('Fermer le compte rendu')}>
              {t('Fermer')}
            </Button>
          </div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
            {accord(rapportLot.succes.length, t('pièce validée'), t('pièces validées'))}
            {rapportLot.echecs.length > 0 ? `, ${accord(rapportLot.echecs.length, t('échec'), t('échecs'))}.` : '.'}
          </Text>
          {rapportLot.succes.length > 0 && (
            <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}>
              {rapportLot.succes.map(label => (
                <li key={label}>
                  {label} {t('— validée')}
                </li>
              ))}
            </ul>
          )}
          {rapportLot.echecs.length > 0 && (
            <ul
              style={{
                margin: 'var(--space-2) 0 0',
                paddingInlineStart: 'var(--space-5)',
                color: 'var(--color-error-text)'
              }}
            >
              {rapportLot.echecs.map(echec => (
                <li key={echec.label}>
                  {echec.label} — {echec.raison}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <DataView<PendingDocument>
        helpId="finance.validation.tableau"
        export={{ filename: t('File de validation'), fetchAll: local.exportAll }}
        // Le contrat (`getValidationQueue`) rend l'ensemble des pièces en
        // attente, sans enveloppe de pagination : pagination locale.
        {...local.dataViewProps}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger la file de validation.') : null}
        errorCause={erreurRequete}
        onRetry={() => refetch()}
        // Une file vide est une bonne nouvelle : elle se présente comme
        // telle, jamais comme une panne ou une absence à corriger.
        emptyDescription={t("Bonne nouvelle : aucune pièce n'attend de validation, tout est à jour.")}
        columns={colonnes}
        rowKey={cle}
        aria-label={t('File de validation')}
        renderCard={doc => (
          <DataCard
            title={
              <Space size="small" align="start">
                <Checkbox
                  aria-label={t('Sélectionner {{label}}', { label: doc.label })}
                  checked={selection.has(cle(doc))}
                  onChange={() => basculerUn(doc)}
                />
                <span>{doc.label}</span>
              </Space>
            }
            aria-label={doc.label}
            subtitle={t('{{nature}} · Saisie par {{auteur}} le {{date}}', {
              nature: libelleNature(doc.documentType),
              auteur: doc.createdByLabel,
              date: dateCourte(doc.createdAt)
            })}
            highlight={<MoneyValue value={doc.amount} />}
            primaryAction={{
              label: t('Valider'),
              loading: enCours === cle(doc),
              onClick: () => demanderValidation(doc)
            }}
            // Au palier mobile, la suppression passe par le menu secondaire :
            // deux boutons de même poids sur une carte étroite inviteraient à
            // se tromper, et celui des deux qui détruit doit demander un geste
            // de plus. Même restriction qu'en table — les pièces de caisse
            // seules, faute de point d'entrée serveur pour les autres natures.
            secondaryActions={
              doc.documentType === 'CASH_VOUCHER'
                ? [
                    {
                      key: 'supprimer',
                      danger: true,
                      label: t('Supprimer le brouillon'),
                      onClick: () => demanderSuppression(doc)
                    }
                  ]
                : undefined
            }
          />
        )}
      />
    </>
  );
};
