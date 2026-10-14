import React, { useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { createStockTransfer } from '../../../../services/finance-stock-inventaire-service';
import { StockPhotoCapture } from '../StockPhotoCapture';
import { StockQuantityInput } from '../StockQuantityInput';
import { StockReasonPicker, isStockReasonComplete, type StockReasonValue } from '../StockReasonPicker';
import { StockTakerSelect } from '../StockTakerSelect';
import {
  AlerteCoupure,
  AvisPhotosEnEchec,
  EtapeGeste,
  LigneRecap,
  ListeChoix,
  useConfirmerAbandon,
  usePhotosEnEchec
} from './MagasinBriques';
import { DisponibiliteTexte, useDisponibiliteLieu } from './SaisieArticles';
import { DateDuGeste } from './DateMouvement';
import { useEnvoiTerrain } from './useEnvoiTerrain';
import { CODES_DATE, CODES_MOTIF, CODES_PRENEUR } from './stock-erreurs';
import type { GesteProps } from './GesteRecevoir';
import { STOCK_FIELD_CONTEXT_ENTITY } from '../../../../hooks/useStockFieldContext';
import { entityKeyPrefix } from '../../../../lib/query-keys';
import { formatQuantity } from '../../../../types/finance-stock-inventaire-types';
import {
  STOCK_REASON_LABELS,
  type RequesterFields,
  type StockTransferResult,
  type StockWrite
} from '../../../../types/finance-stock-controle-types';
import { t } from '../../../../i18n/t';

const { Text } = Typography;

type Etape = 'arrivee' | 'article' | 'quantite' | 'demandeur' | 'motif' | 'photo' | 'verifier' | 'fait';

/**
 * Geste « Transférer » (ecrans §6.5) : lieu d'arrivée, un article et sa
 * quantité, demandeur, motif, photo, vérification. Un transfert n'a pas de bon
 * PDF ; ses photos vont sur la moitié sortante (`MOVEMENT` dont `isDecrease`
 * est vrai). Les lieux des chantiers clos sont grisés (spec A7-R4).
 */
export const GesteTransferer: React.FC<GesteProps> = ({
  tenantId,
  contexte,
  lieuCourantId,
  onQuitter,
  onRecommencer
}) => {
  const queryClient = useQueryClient();
  const confirmerAbandon = useConfirmerAbandon(onQuitter);
  const envoi = useEnvoiTerrain();

  const [etape, setEtape] = useState<Etape>('arrivee');
  const [arriveeId, setArriveeId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [quantite, setQuantite] = useState<number | null>(null);
  const [demandeur, setDemandeur] = useState<RequesterFields>({});
  const [motif, setMotif] = useState<StockReasonValue>({ reasonCode: null, reason: '' });
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [photoVue, setPhotoVue] = useState(false);
  const [erreurPreneur, setErreurPreneur] = useState<string | null>(null);
  const [erreurMotif, setErreurMotif] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [resultat, setResultat] = useState<StockWrite<StockTransferResult> | null>(null);
  const photosEnEchec = usePhotosEnEchec();

  const disponibilite = useDisponibiliteLieu(tenantId, contexte, lieuCourantId, etape === 'quantite');
  const origine = contexte.locations.find(lieu => lieu.id === lieuCourantId) ?? null;
  const arrivee = contexte.locations.find(lieu => lieu.id === arriveeId) ?? null;
  const article = contexte.items.find(candidat => candidat.id === itemId) ?? null;
  const entame = Boolean(arriveeId || itemId);
  const demandeurPret = Boolean(
    demandeur.takerId || (!contexte.settings.requireTaker && (demandeur.requestedBy ?? '').trim())
  );

  const enregistrer = async () => {
    if (!arriveeId || !itemId || quantite === null || !motif.reasonCode) return;
    setErreurEnvoi(null);
    setErreurDate(null);
    const reasonCode = motif.reasonCode;
    const reponse = await envoi.envoyer(
      clientRequestId =>
        createStockTransfer(tenantId, {
          fromLocationId: lieuCourantId,
          toLocationId: arriveeId,
          itemId,
          quantity: quantite,
          transferDate: date.format('YYYY-MM-DD'),
          ...demandeur,
          reasonCode,
          reason: motif.reason,
          clientRequestId
        }),
      t('Le transfert n’a pas pu être enregistré.')
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
    if (erreur.code && CODES_PRENEUR.includes(erreur.code)) {
      setErreurPreneur(erreur.message);
      setEtape('demandeur');
    } else if (erreur.code && CODES_MOTIF.includes(erreur.code)) {
      setErreurMotif(erreur.message);
      setEtape('motif');
    } else if (erreur.code && CODES_DATE.includes(erreur.code)) {
      setErreurDate(erreur.message);
    } else {
      if (erreur.code === 'STOCK_SITE_CLOSED') {
        void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
      }
      setErreurEnvoi(erreur.message);
    }
  };

  const rappel = origine ? t('Depuis : {{lieu}}', { lieu: origine.label }) : undefined;
  const sortante = resultat?.data.movements.find(mouvement => mouvement.isDecrease) ?? null;
  const cible = sortante ? { type: 'MOVEMENT' as const, id: sortante.id } : undefined;
  const photos = photoVue ? (
    <div hidden={!(etape === 'photo' || etape === 'fait')} style={{ marginBlockEnd: 'var(--space-4)' }}>
      <StockPhotoCapture
        tenantId={tenantId}
        target={cible}
        purposes={['GOODS_PHOTO']}
        onFailedCountChange={photosEnEchec.signaler('marchandise')}
      />
    </div>
  ) : null;

  switch (etape) {
    case 'arrivee':
      return (
        <EtapeGeste titre={t('Vers quel lieu ?')} rappel={rappel} onRetour={() => confirmerAbandon(entame)}>
          <ListeChoix
            aria-label={t('Lieux d’arrivée')}
            lignes={contexte.locations
              .filter(lieu => lieu.isActive && lieu.id !== lieuCourantId)
              .map(lieu => ({
                id: lieu.id,
                titre: lieu.label,
                recherche: lieu.label,
                desactivee: lieu.siteClosed,
                note: lieu.siteClosed ? t('Chantier clos : il ne reçoit plus de marchandise') : undefined
              }))}
            selectionId={arriveeId}
            onChoisir={id => {
              setArriveeId(id);
              setEtape('article');
            }}
            vide={t('Aucun autre lieu actif.')}
          />
        </EtapeGeste>
      );
    case 'article':
      return (
        <EtapeGeste titre={t('Quel article ?')} rappel={rappel} onRetour={() => setEtape('arrivee')}>
          <ListeChoix
            aria-label={t('Articles')}
            lignes={[...contexte.items]
              .sort((a, b) => a.reference.localeCompare(b.reference))
              .map(candidat => ({
                id: candidat.id,
                titre: `${candidat.reference} — ${candidat.label}`,
                sousTitre: candidat.unit,
                recherche: `${candidat.reference} ${candidat.label}`
              }))}
            selectionId={itemId}
            onChoisir={id => {
              setItemId(id);
              setEtape('quantite');
            }}
            placeholderRecherche={t('Référence ou libellé')}
            vide={t('Aucun article actif.')}
          />
        </EtapeGeste>
      );
    case 'quantite':
      return (
        <EtapeGeste
          titre={article ? `${article.reference} — ${article.label}` : t('Quantité')}
          rappel={rappel}
          onRetour={() => setEtape('article')}
          principale={{
            label: t('Continuer'),
            onClick: () => setEtape('demandeur'),
            disabled: quantite === null || quantite <= 0
          }}
        >
          <StockQuantityInput
            aria-label={t('Quantité transférée')}
            unit={article?.unit}
            min={0}
            value={quantite}
            onChange={setQuantite}
          />
          {itemId ? (
            <DisponibiliteTexte
              disponibilite={disponibilite}
              itemId={itemId}
              unite={article?.unit ?? null}
              quantite={quantite}
              verbe="transfert"
            />
          ) : null}
        </EtapeGeste>
      );
    case 'demandeur':
      return (
        <EtapeGeste
          titre={t('Qui demande ou emporte ce transfert ?')}
          rappel={rappel}
          onRetour={() => setEtape('quantite')}
          principale={{ label: t('Continuer'), onClick: () => setEtape('motif'), disabled: !demandeurPret }}
        >
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
        </EtapeGeste>
      );
    case 'motif':
      return (
        <EtapeGeste
          titre={t('Pourquoi ce transfert ?')}
          rappel={rappel}
          onRetour={() => setEtape('demandeur')}
          principale={{
            label: t('Continuer'),
            onClick: () => {
              setPhotoVue(true);
              setEtape('photo');
            },
            disabled: !isStockReasonComplete(motif)
          }}
        >
          {erreurMotif ? (
            <Alert
              type="warning"
              showIcon
              role="alert"
              style={{ marginBlockEnd: 'var(--space-3)' }}
              message={erreurMotif}
            />
          ) : null}
          <StockReasonPicker
            codes={contexte.reasonCodes.transfer}
            value={motif}
            onChange={valeur => {
              setErreurMotif(null);
              setMotif(valeur);
            }}
          />
        </EtapeGeste>
      );
    case 'photo':
      return (
        <EtapeGeste
          titre={t('Photo')}
          rappel={t('Facultatif')}
          onRetour={() => setEtape('motif')}
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
    case 'verifier':
      return (
        <EtapeGeste
          titre={t('Vérifiez')}
          onRetour={() => setEtape('photo')}
          persistant={photos}
          envoiEnCours={envoi.enCours}
          principale={{
            label: t('Enregistrer le transfert'),
            onClick: () => void enregistrer(),
            loading: envoi.enCours
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
          <LigneRecap label={t('Depuis')}>{origine?.label}</LigneRecap>
          <LigneRecap label={t('Vers')}>{arrivee?.label}</LigneRecap>
          <LigneRecap label={t('Article')}>
            {article ? `${article.reference} — ${article.label}` : ''} : {formatQuantity(quantite, article?.unit)}
          </LigneRecap>
          <LigneRecap label={t('Demandeur')}>
            {demandeur.takerId
              ? contexte.takers.find(preneur => preneur.id === demandeur.takerId)?.label
              : demandeur.requestedBy}
          </LigneRecap>
          <LigneRecap label={t('Motif')}>
            {motif.reasonCode ? STOCK_REASON_LABELS[motif.reasonCode] : ''}
            {motif.reason.trim() ? ` — ${motif.reason.trim()}` : ''}
          </LigneRecap>
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
        </EtapeGeste>
      );
    case 'fait':
      if (!resultat) return null;
      return (
        <EtapeGeste
          titre={resultat.replayed ? t('Transfert déjà enregistré') : t('Transfert enregistré')}
          persistant={photos}
        >
          {resultat.replayed ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBlockEnd: 'var(--space-3)' }}
              message={t('Cette opération était déjà enregistrée.')}
            />
          ) : null}
          <AvisPhotosEnEchec total={photosEnEchec.total} />
          <Text style={{ display: 'block', fontSize: 16, marginBlockEnd: 'var(--space-3)' }}>
            {t('{{quantite}} de « {{article}} », de « {{depuis}} » vers « {{vers}} ».', {
              quantite: formatQuantity(resultat.data.quantity, sortante?.itemUnit ?? article?.unit),
              article: sortante?.itemLabel ?? article?.label ?? '',
              depuis: resultat.data.fromLocationLabel,
              vers: resultat.data.toLocationLabel
            })}
          </Text>
          <Space direction="vertical" style={{ width: '100%', marginBlockStart: 'var(--space-4)' }}>
            <Button type="primary" block onClick={onRecommencer} style={{ minHeight: 48, fontSize: 16 }}>
              {t('Nouveau transfert')}
            </Button>
            <Button block onClick={onQuitter} style={{ minHeight: 48, fontSize: 16 }}>
              {t('Retour au magasin')}
            </Button>
          </Space>
        </EtapeGeste>
      );
    default:
      return null;
  }
};

export default GesteTransferer;
