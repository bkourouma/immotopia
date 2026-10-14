import React, { useMemo, useState } from 'react';
import { Alert, Button, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listStockBalances } from '../../../../services/finance-stock-mouvements-service';
import { queryKey, STALE_TIME } from '../../../../lib/query-keys';
import { PlusOutlined } from '@ant-design/icons';
import { StockQuantityInput } from '../StockQuantityInput';
import { EtapeGeste, ListeChoix, type LigneChoix } from './MagasinBriques';
import { formatQuantity } from '../../../../types/finance-stock-inventaire-types';
import type { StockFieldContext, StockInvoiceLineView } from '../../../../types/finance-stock-controle-types';
import { nouvelIdentifiantDeRequete } from '../../../../utils/stock-client-request-id';
import { t } from '../../../../i18n/t';

const { Text } = Typography;

/** Une ligne d'une réception ou d'une sortie, en cours de saisie. */
export interface LigneSaisie {
  key: string;
  itemId: string;
  quantity: number;
  /** Réception : ligne de la facture d'où prendre le prix (facultatif). */
  supplierInvoiceLineId?: string | null;
  /** Sortie : poste du chantier (exigé, jamais deviné). */
  costCategoryId?: string | null;
}

/** Ce que l'écran sait du stock du lieu de sortie, lu à l'étape qui le montre. */
export interface DisponibiliteLieu {
  chargement: boolean;
  /** Lieu en comptage : aucune quantité n'est montrée, aucun avertissement de dépassement. */
  aveugle: boolean;
  quantites: Map<string, number | null>;
}

export type Article = StockFieldContext['items'][number];

/**
 * Le stock d'un lieu, lu seulement quand l'étape qui le montre est ouverte
 * (`actif`). Un lieu que le contexte terrain sait en comptage n'est pas lu du
 * tout ; un lieu que le serveur range dans `meta.blindLocationIds`, ou dont il
 * masque la quantité, est traité en aveugle.
 */
export function useDisponibiliteLieu(
  tenantId: string,
  contexte: StockFieldContext,
  lieuId: string,
  actif: boolean
): DisponibiliteLieu {
  const lieu = contexte.locations.find(candidat => candidat.id === lieuId) ?? null;
  const aveugleConnu = lieu?.countInProgress?.status === 'DRAFT';
  const soldes = useQuery({
    queryKey: queryKey('stock-balances', tenantId, { locationId: lieuId }),
    queryFn: () => listStockBalances(tenantId, { locationId: lieuId }),
    enabled: actif && !aveugleConnu && Boolean(lieuId),
    staleTime: STALE_TIME.list
  });
  return useMemo(() => {
    const quantites = new Map<string, number | null>();
    for (const solde of soldes.data?.data ?? []) quantites.set(solde.itemId, solde.quantity);
    const aveugle =
      aveugleConnu ||
      Boolean(soldes.data?.meta.blindLocationIds.includes(lieuId)) ||
      [...quantites.values()].some(quantite => quantite === null);
    return { chargement: !aveugle && soldes.isPending, aveugle, quantites };
  }, [aveugleConnu, soldes.data, soldes.isPending, lieuId]);
}

export interface SaisieArticlesProps {
  mode: 'reception' | 'sortie';
  titre: string;
  rappel?: React.ReactNode;
  articles: Article[];
  lignes: LigneSaisie[];
  onChange: (lignes: LigneSaisie[]) => void;
  onRetour: () => void;
  onContinuer: () => void;
  /** Réception : lignes de la facture, lues au choix de la facture. */
  lignesFacture?: StockInvoiceLineView[] | null;
  /** Sortie : postes du chantier. */
  postes?: StockFieldContext['costCategories'];
  /** Sortie : stock du lieu. */
  disponibilite?: DisponibiliteLieu | null;
  /** Refus du serveur affiché en tête (`409 STOCK_INSUFFICIENT`). */
  messageEnTete?: string | null;
  /** Articles nommés par le serveur dans son refus. */
  articlesEnEvidence?: string[];
}

/**
 * « Disponible ici : 120 sacs », ou l'état aveugle d'un lieu en comptage
 * (ecrans §3.4) : aucune quantité, aucun avertissement de dépassement — le
 * serveur refusera une sortie qui dépasse le stock.
 */
export const DisponibiliteTexte: React.FC<{
  disponibilite: DisponibiliteLieu;
  itemId: string;
  unite: string | null;
  quantite: number | null;
  verbe?: 'sortie' | 'transfert';
}> = ({ disponibilite, itemId, unite, quantite, verbe = 'sortie' }) => {
  if (disponibilite.aveugle) {
    return (
      <Text type="secondary" role="note" style={{ display: 'block', marginBlockStart: 'var(--space-3)' }}>
        {verbe === 'sortie'
          ? t(
              'Lieu en cours de comptage : la quantité disponible n’est pas affichée. Le serveur refusera une sortie qui dépasse le stock.'
            )
          : t(
              'Lieu en cours de comptage : la quantité disponible n’est pas affichée. Le serveur refusera un transfert qui dépasse le stock.'
            )}
      </Text>
    );
  }
  if (disponibilite.chargement) {
    return (
      <Text type="secondary" style={{ display: 'block', marginBlockStart: 'var(--space-3)' }}>
        {t('Lecture du stock du lieu…')}
      </Text>
    );
  }
  const disponible = disponibilite.quantites.get(itemId) ?? 0;
  const depasse = typeof disponible === 'number' && quantite !== null && quantite > disponible;
  return (
    <div style={{ marginBlockStart: 'var(--space-3)' }}>
      <Text>{t('Disponible ici : {{quantite}}', { quantite: formatQuantity(disponible, unite) })}</Text>
      {depasse ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBlockStart: 'var(--space-2)' }}
          message={t('La quantité dépasse ce qui est disponible ici.')}
          description={t('Le serveur refusera cette opération. Vérifiez la quantité.')}
        />
      ) : null}
    </div>
  );
};

interface Edition {
  key: string | null;
  itemId: string;
  quantity: number | null;
  supplierInvoiceLineId: string | null;
  costCategoryId: string | null;
}

/**
 * Étape « Qu'avez-vous reçu ? » / « Quels articles ? » (ecrans §6.3 étape 3,
 * §6.4 étape 3) : la liste des lignes ajoutées, puis la liste cherchable des
 * articles, puis l'écran de quantité. **Aucun prix n'est demandé, à
 * personne** (spec A8-R3) : la chaîne de prix du serveur s'applique.
 */
export const SaisieArticles: React.FC<SaisieArticlesProps> = ({
  mode,
  titre,
  rappel,
  articles,
  lignes,
  onChange,
  onRetour,
  onContinuer,
  lignesFacture,
  postes,
  disponibilite,
  messageEnTete,
  articlesEnEvidence
}) => {
  const [vue, setVue] = useState<'liste' | 'articles' | 'quantite'>('liste');
  const [edition, setEdition] = useState<Edition | null>(null);

  const articleDe = (itemId: string) => articles.find(article => article.id === itemId) ?? null;

  const lignesArticles: LigneChoix[] = useMemo(
    () =>
      [...articles]
        .sort((a, b) => a.reference.localeCompare(b.reference))
        .map(article => ({
          id: article.id,
          titre: `${article.reference} — ${article.label}`,
          sousTitre: article.unit,
          recherche: `${article.reference} ${article.label}`
        })),
    [articles]
  );

  const ouvrirArticle = (itemId: string) => {
    const article = articleDe(itemId);
    setEdition({
      key: null,
      itemId,
      quantity: null,
      supplierInvoiceLineId: null,
      costCategoryId: article?.defaultCostCategoryId ?? null
    });
    setVue('quantite');
  };

  const modifierLigne = (ligne: LigneSaisie) => {
    setEdition({
      key: ligne.key,
      itemId: ligne.itemId,
      quantity: ligne.quantity,
      supplierInvoiceLineId: ligne.supplierInvoiceLineId ?? null,
      costCategoryId: ligne.costCategoryId ?? null
    });
    setVue('quantite');
  };

  const enregistrerEdition = () => {
    if (!edition || edition.quantity === null || edition.quantity <= 0) return;
    const ligne: LigneSaisie = {
      key: edition.key ?? nouvelIdentifiantDeRequete(),
      itemId: edition.itemId,
      quantity: edition.quantity,
      ...(mode === 'reception' ? { supplierInvoiceLineId: edition.supplierInvoiceLineId } : {}),
      ...(mode === 'sortie' ? { costCategoryId: edition.costCategoryId } : {})
    };
    onChange(edition.key ? lignes.map(l => (l.key === edition.key ? ligne : l)) : [...lignes, ligne]);
    setEdition(null);
    setVue('liste');
  };

  const retirerEdition = () => {
    if (!edition?.key) return;
    onChange(lignes.filter(l => l.key !== edition.key));
    setEdition(null);
    setVue('liste');
  };

  // --- Écran de quantité ---------------------------------------------------

  if (vue === 'quantite' && edition) {
    const article = articleDe(edition.itemId);
    const unite = article?.unit ?? null;
    const posteExige = mode === 'sortie' && !article?.defaultCostCategoryId;
    const pret = edition.quantity !== null && edition.quantity > 0 && (!posteExige || Boolean(edition.costCategoryId));

    return (
      <EtapeGeste
        titre={article ? `${article.reference} — ${article.label}` : t('Quantité')}
        rappel={rappel}
        onRetour={() => {
          setEdition(null);
          setVue(edition.key ? 'liste' : 'articles');
        }}
        principale={{
          label: edition.key ? t('Enregistrer la ligne') : t('Ajouter'),
          onClick: enregistrerEdition,
          disabled: !pret
        }}
      >
        <label htmlFor="magasin-quantite" style={{ display: 'block', fontSize: 16, marginBlockEnd: 8 }}>
          {mode === 'reception' ? t('Quantité reçue') : t('Quantité remise')}
        </label>
        <div style={{ fontSize: 20 }}>
          <StockQuantityInput
            id="magasin-quantite"
            aria-label={mode === 'reception' ? t('Quantité reçue') : t('Quantité remise')}
            unit={unite}
            min={0}
            value={edition.quantity}
            onChange={value => setEdition({ ...edition, quantity: value })}
          />
        </div>

        {mode === 'sortie' && disponibilite ? (
          <DisponibiliteTexte
            disponibilite={disponibilite}
            itemId={edition.itemId}
            unite={unite}
            quantite={edition.quantity}
          />
        ) : null}

        {mode === 'sortie' && posteExige ? (
          <div style={{ marginBlockStart: 'var(--space-4)' }}>
            <Text strong style={{ display: 'block', fontSize: 16, marginBlockEnd: 8 }}>
              {t('Poste du chantier')}
            </Text>
            <ListeChoix
              aria-label={t('Poste du chantier')}
              lignes={(postes ?? []).map(poste => ({ id: poste.id, titre: poste.label, recherche: poste.label }))}
              selectionId={edition.costCategoryId}
              onChoisir={id => setEdition({ ...edition, costCategoryId: id })}
              vide={t('Aucun poste de chantier disponible.')}
            />
          </div>
        ) : null}

        {mode === 'reception' ? (
          <div style={{ marginBlockStart: 'var(--space-4)' }}>
            <Text strong style={{ display: 'block', fontSize: 16, marginBlockEnd: 8 }}>
              {t('Ligne de la facture (facultatif)')}
            </Text>
            <ListeChoix
              aria-label={t('Ligne de la facture')}
              lignes={[
                { id: '', titre: t('Je ne sais pas'), recherche: '' },
                ...(lignesFacture ?? []).map(ligneFacture => ({
                  id: ligneFacture.id,
                  titre: ligneFacture.label,
                  sousTitre:
                    ligneFacture.quantity !== null
                      ? t('Quantité facturée : {{quantite}}', { quantite: formatQuantity(ligneFacture.quantity) })
                      : undefined,
                  recherche: ligneFacture.label
                }))
              ]}
              selectionId={edition.supplierInvoiceLineId ?? ''}
              onChoisir={id => setEdition({ ...edition, supplierInvoiceLineId: id || null })}
            />
          </div>
        ) : null}

        {edition.key ? (
          <Button danger onClick={retirerEdition} style={{ minHeight: 48, marginBlockStart: 'var(--space-4)' }}>
            {t('Retirer cette ligne')}
          </Button>
        ) : null}
      </EtapeGeste>
    );
  }

  // --- Liste des articles --------------------------------------------------

  if (vue === 'articles') {
    return (
      <EtapeGeste titre={t('Choisir un article')} rappel={rappel} onRetour={() => setVue('liste')}>
        <ListeChoix
          aria-label={t('Articles')}
          lignes={lignesArticles}
          onChoisir={ouvrirArticle}
          placeholderRecherche={t('Référence ou libellé')}
          vide={t('Aucun article actif.')}
        />
      </EtapeGeste>
    );
  }

  // --- Lignes déjà ajoutées ------------------------------------------------

  const enEvidence = new Set(articlesEnEvidence ?? []);
  const sansPoste = mode === 'sortie' && lignes.some(ligne => !ligne.costCategoryId);

  return (
    <EtapeGeste
      titre={titre}
      rappel={rappel}
      onRetour={onRetour}
      principale={{ label: t('Continuer'), onClick: onContinuer, disabled: lignes.length === 0 || sansPoste }}
    >
      {messageEnTete ? (
        <Alert
          type="warning"
          showIcon
          role="alert"
          style={{ marginBlockEnd: 'var(--space-3)' }}
          message={messageEnTete}
        />
      ) : null}
      {lignes.length === 0 ? (
        <Text type="secondary" style={{ display: 'block', marginBlockEnd: 'var(--space-3)' }}>
          {t('Aucun article ajouté pour le moment.')}
        </Text>
      ) : (
        <ListeChoix
          aria-label={t('Articles ajoutés')}
          lignes={lignes.map(ligne => {
            const article = articleDe(ligne.itemId);
            return {
              id: ligne.key,
              titre: article ? `${article.reference} — ${article.label}` : ligne.itemId,
              sousTitre: formatQuantity(ligne.quantity, article?.unit ?? null),
              enEvidence: enEvidence.has(ligne.itemId),
              note: enEvidence.has(ligne.itemId) ? t('Quantité refusée par le serveur') : undefined
            };
          })}
          onChoisir={key => {
            const ligne = lignes.find(l => l.key === key);
            if (ligne) modifierLigne(ligne);
          }}
        />
      )}
      <Button
        icon={<PlusOutlined />}
        block
        onClick={() => setVue('articles')}
        disabled={lignes.length >= 50}
        style={{ minHeight: 56, fontSize: 16 }}
      >
        {t('Ajouter un article')}
      </Button>
    </EtapeGeste>
  );
};

export default SaisieArticles;
