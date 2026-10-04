import React, { useMemo, useState } from 'react';
import { Alert, Button, Input, Space, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { recordStockIssue } from '../../../../services/finance-stock-mouvements-service';
import { StockPhotoCapture } from '../StockPhotoCapture';
import { StockSlipPdfButton } from '../StockSlipPdfButton';
import { StockTakerForm } from '../StockTakerForm';
import { STOCK_REQUESTER_MAX_LENGTH } from '../StockTakerSelect';
import { AlerteCoupure, EtapeGeste, LigneRecap, ListeChoix, useConfirmerAbandon } from './MagasinBriques';
import { SaisieArticles, useDisponibiliteLieu, type LigneSaisie } from './SaisieArticles';
import { DateDuGeste } from './DateMouvement';
import { useEnvoiTerrain } from './useEnvoiTerrain';
import { CODES_DATE, CODES_PRENEUR } from './stock-erreurs';
import type { GesteProps } from './GesteRecevoir';
import { STOCK_FIELD_CONTEXT_ENTITY } from '../../../../hooks/useStockFieldContext';
import { entityKeyPrefix } from '../../../../lib/query-keys';
import { formatQuantity } from '../../../../types/finance-stock-inventaire-types';
import type {
  RequesterFields,
  StockSlipResult,
  StockTakerView,
  StockWrite
} from '../../../../types/finance-stock-controle-types';
import { t } from '../../../../i18n/t';

const { Text, Title } = Typography;

type Etape = 'chantier' | 'preneur' | 'articles' | 'photo' | 'verifier' | 'fait';

/** Le demandeur est complet : un preneur du carnet, ou un nom saisi de 1 à 200 caractères. */
function demandeurComplet(valeur: RequesterFields, requireTaker: boolean): boolean {
  if (valeur.takerId) return true;
  if (requireTaker) return false;
  const nom = (valeur.requestedBy ?? '').trim();
  return nom.length > 0 && nom.length <= STOCK_REQUESTER_MAX_LENGTH;
}

/**
 * Geste « Sortir » (ecrans §6.4) : chantier, preneur, articles, photo,
 * vérification, bon à faire signer. La sortie part du lieu courant. Le stock
 * du lieu n'est lu qu'à l'étape des articles ; sur un lieu en comptage, il
 * n'est pas montré (spec A2), et c'est le serveur qui refuse un dépassement.
 */
export const GesteSortir: React.FC<GesteProps> = ({ tenantId, contexte, lieuCourantId, onQuitter, onRecommencer }) => {
  const queryClient = useQueryClient();
  const confirmerAbandon = useConfirmerAbandon(onQuitter);
  const envoi = useEnvoiTerrain();
  const { requireTaker } = contexte.settings;
  const { canManageTakers } = contexte.abilities;

  const lieu = contexte.locations.find(candidat => candidat.id === lieuCourantId) ?? null;
  const chantiers = contexte.sites.filter(site => !site.closed);

  const [etape, setEtape] = useState<Etape>('chantier');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [demandeur, setDemandeur] = useState<RequesterFields>({});
  const [nomLibre, setNomLibre] = useState(false);
  const [ajout, setAjout] = useState(false);
  const [crees, setCrees] = useState<StockTakerView[]>([]);
  const [erreurPreneur, setErreurPreneur] = useState<string | null>(null);
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [photoVue, setPhotoVue] = useState(false);
  const [refusStock, setRefusStock] = useState<{ message: string; itemIds: string[] } | null>(null);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [resultat, setResultat] = useState<StockWrite<StockSlipResult> | null>(null);

  const entame = Boolean(siteId) || lignes.length > 0;
  const site = chantiers.find(candidat => candidat.id === siteId) ?? null;

  // --- Le stock du lieu, lu seulement à l'étape des articles ------------------

  const disponibilite = useDisponibiliteLieu(tenantId, contexte, lieuCourantId, etape === 'articles');

  // --- Preneurs ----------------------------------------------------------------

  const preneurs = useMemo(() => {
    const parId = new Map<string, StockTakerView>();
    for (const preneur of [...contexte.takers, ...crees]) if (preneur.isActive) parId.set(preneur.id, preneur);
    return [...parId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [contexte.takers, crees]);

  const libelleDemandeur = demandeur.takerId
    ? (preneurs.find(preneur => preneur.id === demandeur.takerId)?.label ?? '')
    : (demandeur.requestedBy ?? '').trim();

  // --- Envoi -------------------------------------------------------------------

  const enregistrer = async () => {
    if (!siteId || lignes.length === 0 || !demandeurComplet(demandeur, requireTaker)) return;
    setErreurEnvoi(null);
    setErreurDate(null);
    const reponse = await envoi.envoyer(
      clientRequestId =>
        recordStockIssue(tenantId, {
          locationId: lieuCourantId,
          siteId,
          issueDate: date.format('YYYY-MM-DD'),
          lines: lignes.map(ligne => ({
            itemId: ligne.itemId,
            quantity: ligne.quantity,
            costCategoryId: ligne.costCategoryId as string
          })),
          ...(demandeur.takerId
            ? { takerId: demandeur.takerId }
            : { requestedBy: (demandeur.requestedBy ?? '').trim() }),
          clientRequestId
        }),
      t('La sortie n’a pas pu être enregistrée.')
    );
    if (reponse.ok) {
      setResultat(reponse.resultat);
      setEtape('fait');
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-movements', tenantId) });
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) });
      return;
    }
    const { erreur } = reponse;
    if (erreur.reseau) return;
    if (erreur.code === 'STOCK_INSUFFICIENT') {
      // Retour aux articles, message du serveur en tête (il ne cite aucune quantité).
      setRefusStock({ message: erreur.message, itemIds: erreur.items.map(item => item.itemId) });
      setEtape('articles');
      return;
    }
    if (erreur.code && CODES_PRENEUR.includes(erreur.code)) {
      setErreurPreneur(erreur.message);
      setEtape('preneur');
      return;
    }
    if (erreur.code && CODES_DATE.includes(erreur.code)) {
      setErreurDate(erreur.message);
      return;
    }
    if (erreur.code === 'STOCK_SITE_CLOSED') {
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
    }
    setErreurEnvoi(erreur.message);
  };

  const rappelLieu = lieu ? t('Sortie depuis : {{lieu}}', { lieu: lieu.label }) : undefined;

  const cibleBon = resultat ? { type: 'SLIP' as const, id: resultat.data.slip.id } : undefined;
  const photos = photoVue ? (
    <div hidden={!(etape === 'photo' || etape === 'fait')} style={{ marginBlockEnd: 'var(--space-4)' }}>
      <Text strong style={{ display: 'block', fontSize: 16 }}>
        {t('Photographier la marchandise remise')}
      </Text>
      <StockPhotoCapture tenantId={tenantId} target={cibleBon} purposes={['GOODS_PHOTO']} />
    </div>
  ) : null;

  if (etape === 'chantier') {
    return (
      <EtapeGeste titre={t('Pour quel chantier ?')} rappel={rappelLieu} onRetour={() => confirmerAbandon(entame)}>
        <ListeChoix
          aria-label={t('Chantiers ouverts')}
          lignes={chantiers.map(candidat => ({ id: candidat.id, titre: candidat.name, recherche: candidat.name }))}
          selectionId={siteId}
          onChoisir={id => {
            setSiteId(id);
            setEtape('preneur');
          }}
          placeholderRecherche={t('Nom du chantier')}
          vide={t('Aucun chantier ouvert.')}
        />
      </EtapeGeste>
    );
  }

  if (etape === 'preneur') {
    const complet = demandeurComplet(demandeur, requireTaker);
    return (
      <EtapeGeste
        titre={t('Qui emporte la marchandise ?')}
        rappel={site?.name}
        onRetour={() => setEtape('chantier')}
        principale={{ label: t('Continuer'), onClick: () => setEtape('articles'), disabled: !complet }}
      >
        {erreurPreneur ? (
          <Alert
            type="warning"
            showIcon
            role="alert"
            style={{ marginBlockEnd: 'var(--space-3)' }}
            message={erreurPreneur}
          />
        ) : null}
        {nomLibre && !requireTaker ? (
          <div>
            <label htmlFor="magasin-demandeur" style={{ display: 'block', fontSize: 16, marginBlockEnd: 8 }}>
              {t('Nom de la personne qui emporte')}
            </label>
            <Input
              id="magasin-demandeur"
              value={demandeur.requestedBy ?? ''}
              maxLength={STOCK_REQUESTER_MAX_LENGTH}
              onChange={event => {
                setErreurPreneur(null);
                setDemandeur({ requestedBy: event.target.value });
              }}
              style={{ minHeight: 48, fontSize: 16 }}
            />
            <Button
              type="link"
              onClick={() => {
                setNomLibre(false);
                setDemandeur({});
              }}
              style={{ paddingInline: 0, minHeight: 48 }}
            >
              {t('Choisir un preneur du carnet')}
            </Button>
          </div>
        ) : ajout && canManageTakers ? (
          <StockTakerForm
            tenantId={tenantId}
            people={contexte.people}
            onCancel={() => setAjout(false)}
            onDuplicate={existant => {
              setAjout(false);
              setDemandeur({ takerId: existant });
            }}
            onCreated={preneur => {
              setCrees(previous => [...previous, preneur]);
              setAjout(false);
              setErreurPreneur(null);
              setDemandeur({ takerId: preneur.id });
              void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
            }}
          />
        ) : (
          <ListeChoix
            aria-label={t('Preneurs')}
            lignes={preneurs.map(preneur => ({
              id: preneur.id,
              titre: preneur.fullName,
              sousTitre: preneur.teamOrCompany ?? undefined,
              recherche: preneur.label
            }))}
            selectionId={demandeur.takerId}
            onChoisir={id => {
              setErreurPreneur(null);
              setDemandeur({ takerId: id });
            }}
            placeholderRecherche={t('Nom ou équipe')}
            vide={t('Aucun preneur dans le carnet.')}
            tete={
              canManageTakers ? (
                <Button
                  icon={<PlusOutlined />}
                  block
                  onClick={() => setAjout(true)}
                  style={{ minHeight: 56, fontSize: 16, marginBlockEnd: 'var(--space-2)' }}
                >
                  {t('Ajouter un preneur')}
                </Button>
              ) : null
            }
            pied={() =>
              requireTaker ? (
                <Text type="secondary" style={{ display: 'block', marginBlockStart: 'var(--space-2)' }}>
                  {t('Votre agence exige un preneur du carnet pour chaque sortie et chaque transfert.')}
                </Text>
              ) : (
                <Button
                  type="link"
                  onClick={() => {
                    setNomLibre(true);
                    setDemandeur({ requestedBy: '' });
                  }}
                  style={{ paddingInline: 0, minHeight: 48 }}
                >
                  {t('Saisir un nom sans l’ajouter au carnet')}
                </Button>
              )
            }
          />
        )}
      </EtapeGeste>
    );
  }

  if (etape === 'articles') {
    return (
      <SaisieArticles
        mode="sortie"
        titre={t('Quels articles ?')}
        rappel={rappelLieu}
        articles={contexte.items}
        lignes={lignes}
        onChange={nouvelles => {
          setLignes(nouvelles);
          setRefusStock(null);
        }}
        postes={contexte.costCategories}
        disponibilite={disponibilite}
        messageEnTete={refusStock?.message ?? null}
        articlesEnEvidence={refusStock?.itemIds}
        onRetour={() => setEtape('preneur')}
        onContinuer={() => {
          setPhotoVue(true);
          setEtape('photo');
        }}
      />
    );
  }

  if (etape === 'photo') {
    return (
      <EtapeGeste
        titre={t('Photo')}
        rappel={t('Facultatif')}
        onRetour={() => setEtape('articles')}
        persistant={photos}
        principale={{
          label: t('Passer'),
          onClick: () => {
            envoi.preparer();
            setEtape('verifier');
          }
        }}
      >
        {null}
      </EtapeGeste>
    );
  }

  if (etape === 'verifier') {
    return (
      <EtapeGeste
        titre={t('Vérifiez')}
        onRetour={() => setEtape('photo')}
        persistant={photos}
        envoiEnCours={envoi.enCours}
        principale={{
          label: t('Enregistrer la sortie'),
          onClick: () => void enregistrer(),
          loading: envoi.enCours,
          disabled: !siteId || lignes.length === 0 || !demandeurComplet(demandeur, requireTaker)
        }}
      >
        {envoi.coupure ? <AlerteCoupure onReessayer={() => void enregistrer()} disabled={envoi.enCours} /> : null}
        {erreurEnvoi ? (
          <Alert
            type="error"
            showIcon
            role="alert"
            style={{ marginBlockEnd: 'var(--space-3)' }}
            message={erreurEnvoi}
          />
        ) : null}
        <LigneRecap label={t('Chantier')}>{site?.name}</LigneRecap>
        <LigneRecap label={t('Preneur')}>{libelleDemandeur}</LigneRecap>
        <LigneRecap label={t('Lieu')}>{lieu?.label}</LigneRecap>
        <LigneRecap label={t('Date')}>
          <DateDuGeste
            value={date}
            onChange={valeur => {
              setDate(valeur);
              setErreurDate(null);
            }}
            backdatingLimitDays={contexte.settings.backdatingLimitDays}
            error={erreurDate}
            disabled={envoi.enCours}
          />
        </LigneRecap>
        <LigneRecap label={t('Articles')}>
          {lignes.map(ligne => {
            const article = contexte.items.find(candidat => candidat.id === ligne.itemId);
            return (
              <Text key={ligne.key} style={{ display: 'block' }}>
                {article ? `${article.reference} — ${article.label}` : ligne.itemId} :{' '}
                {formatQuantity(ligne.quantity, article?.unit ?? null)}
              </Text>
            );
          })}
        </LigneRecap>
      </EtapeGeste>
    );
  }

  if (etape === 'fait' && resultat) {
    return (
      <EtapeGeste
        titre={resultat.replayed ? t('Sortie déjà enregistrée') : t('Sortie enregistrée')}
        persistant={photos}
      >
        {resultat.replayed ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBlockEnd: 'var(--space-3)' }}
            message={t('Cette opération était déjà enregistrée : voici son bon.')}
          />
        ) : null}
        <Title level={2} style={{ marginBlock: 'var(--space-2)', textAlign: 'center' }}>
          {resultat.data.slip.number}
        </Title>
        <Text strong style={{ display: 'block', fontSize: 16, marginBlockEnd: 'var(--space-3)' }}>
          {t('Faites signer le bon par le preneur.')}
        </Text>
        <Space direction="vertical" style={{ width: '100%' }}>
          <StockSlipPdfButton tenantId={tenantId} slipId={resultat.data.slip.id} number={resultat.data.slip.number} />
          <Text strong style={{ fontSize: 16 }}>
            {t('Photographier le bon signé')}
          </Text>
          <StockPhotoCapture tenantId={tenantId} target={cibleBon} purposes={['SIGNED_SLIP']} />
        </Space>
        <Space direction="vertical" style={{ width: '100%', marginBlockStart: 'var(--space-4)' }}>
          <Button type="primary" block onClick={onRecommencer} style={{ minHeight: 48, fontSize: 16 }}>
            {t('Nouvelle sortie')}
          </Button>
          <Button block onClick={onQuitter} style={{ minHeight: 48, fontSize: 16 }}>
            {t('Retour au magasin')}
          </Button>
        </Space>
      </EtapeGeste>
    );
  }

  return null;
};

export default GesteSortir;
