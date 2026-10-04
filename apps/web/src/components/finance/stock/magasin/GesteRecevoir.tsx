import React, { useMemo, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { getInvoiceReceipts, searchReceivableInvoices } from '../../../../services/finance-stock-controle-service';
import { recordStockReceipt } from '../../../../services/finance-stock-mouvements-service';
import { StockPhotoCapture } from '../StockPhotoCapture';
import { StockSlipPdfButton } from '../StockSlipPdfButton';
import {
  AlerteCoupure,
  EtapeGeste,
  LigneRecap,
  ListeChoix,
  useConfirmerAbandon,
  type LigneChoix
} from './MagasinBriques';
import { SaisieArticles, type LigneSaisie } from './SaisieArticles';
import { DateDuGeste } from './DateMouvement';
import { useEnvoiTerrain } from './useEnvoiTerrain';
import { CODES_DATE } from './stock-erreurs';
import { STOCK_FIELD_CONTEXT_ENTITY } from '../../../../hooks/useStockFieldContext';
import { entityKeyPrefix } from '../../../../lib/query-keys';
import { formatQuantity } from '../../../../types/finance-stock-inventaire-types';
import type {
  StockFieldContext,
  StockInvoiceReceiptsView,
  StockReceiptResult,
  StockReceivableInvoice,
  StockWrite
} from '../../../../types/finance-stock-controle-types';
import { dateFormat } from '../../../../i18n/format';
import { t } from '../../../../i18n/t';

const { Text, Title } = Typography;

export interface GesteProps {
  tenantId: string;
  contexte: StockFieldContext;
  lieuCourantId: string;
  /** Retour à l'accueil du magasin. */
  onQuitter: () => void;
  /** Recommencer le même geste, vierge. */
  onRecommencer: () => void;
}

type Etape = 'facture' | 'deja-recue' | 'lieu' | 'articles' | 'photos' | 'verifier' | 'fait';

interface LectureRecus {
  chargement: boolean;
  echec: boolean;
  vue: StockInvoiceReceiptsView | null;
}

function libelleFacture(facture: StockReceivableInvoice): string {
  return [facture.reference, dayjs(facture.invoiceDate).format(dateFormat('short')), facture.siteName]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Geste « Recevoir » (ecrans §6.3) : facture, réceptions déjà faites, lieu,
 * articles, photos, vérification, bon. **Aucun prix n'est demandé, même à qui
 * voit les valeurs** : l'écran du terrain parle de quantités, la chaîne de prix
 * du serveur s'applique (spec A8-R3).
 */
export const GesteRecevoir: React.FC<GesteProps> = ({
  tenantId,
  contexte,
  lieuCourantId,
  onQuitter,
  onRecommencer
}) => {
  const queryClient = useQueryClient();
  const confirmerAbandon = useConfirmerAbandon(onQuitter);
  const envoi = useEnvoiTerrain();

  const lieuxPossibles = contexte.locations.filter(lieu => lieu.isActive && !lieu.siteClosed);
  const lieuInitial = lieuxPossibles.some(lieu => lieu.id === lieuCourantId) ? lieuCourantId : null;

  const [etape, setEtape] = useState<Etape>('facture');
  const [facture, setFacture] = useState<StockReceivableInvoice | null>(null);
  const [recus, setRecus] = useState<LectureRecus>({ chargement: false, echec: false, vue: null });
  const [trouvees, setTrouvees] = useState<StockReceivableInvoice[]>([]);
  const [curseur, setCurseur] = useState<string | null>(null);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [rechercheFaite, setRechercheFaite] = useState<string | null>(null);
  const [lieuId, setLieuId] = useState<string | null>(lieuInitial);
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [photosVues, setPhotosVues] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [resultat, setResultat] = useState<StockWrite<StockReceiptResult> | null>(null);

  const lieu = contexte.locations.find(candidat => candidat.id === lieuId) ?? null;
  const entame = Boolean(facture) || lignes.length > 0;

  // --- Étape 1 : la facture --------------------------------------------------

  const factures = useMemo(() => {
    const parId = new Map<string, StockReceivableInvoice>();
    for (const candidate of [...contexte.receivableInvoices, ...trouvees]) parId.set(candidate.id, candidate);
    return [...parId.values()];
  }, [contexte.receivableInvoices, trouvees]);

  const lignesFactures: LigneChoix[] = factures.map(candidate => ({
    id: candidate.id,
    titre: candidate.supplierName,
    sousTitre: libelleFacture(candidate),
    recherche: `${candidate.supplierName} ${candidate.reference}`,
    pastilles:
      candidate.receiptCount > 0
        ? [
            {
              key: 'RECEIVED',
              tone: 'warning' as const,
              label: t('Déjà reçue {{n}} fois', { n: candidate.receiptCount })
            }
          ]
        : undefined
  }));

  const chercher = async (recherche: string, suite?: string | null) => {
    setRechercheEnCours(true);
    try {
      const page = await searchReceivableInvoices(tenantId, { search: recherche, cursor: suite ?? undefined });
      setTrouvees(previous => (suite ? [...previous, ...page.data] : page.data));
      setCurseur(page.meta.nextCursor ?? null);
      setRechercheFaite(recherche);
    } catch {
      setRechercheFaite(recherche);
    } finally {
      setRechercheEnCours(false);
    }
  };

  const choisirFacture = (id: string) => {
    const choisie = factures.find(candidate => candidate.id === id);
    if (!choisie) return;
    setFacture(choisie);
    setRecus({ chargement: true, echec: false, vue: null });
    // Les lignes de la facture et les réceptions précédentes, lues au choix.
    getInvoiceReceipts(tenantId, choisie.id)
      .then(lecture => setRecus({ chargement: false, echec: false, vue: lecture.data }))
      .catch(() => setRecus({ chargement: false, echec: true, vue: null }));
    // La facture est sur le lieu d'un chantier : il est proposé d'abord.
    const site = contexte.sites.find(candidat => candidat.id === choisie.siteId);
    if (!lieuId && site?.stockEnabled && site.locationId && lieuxPossibles.some(l => l.id === site.locationId)) {
      setLieuId(site.locationId);
    }
    setEtape(choisie.receiptCount > 0 ? 'deja-recue' : 'lieu');
  };

  // --- Envoi -------------------------------------------------------------------

  const enregistrer = async () => {
    if (!facture || !lieuId || lignes.length === 0) return;
    setErreurEnvoi(null);
    setErreurDate(null);
    const reponse = await envoi.envoyer(
      clientRequestId =>
        recordStockReceipt(tenantId, {
          locationId: lieuId,
          supplierInvoiceId: facture.id,
          receiptDate: date.format('YYYY-MM-DD'),
          lines: lignes.map(ligne => ({
            itemId: ligne.itemId,
            quantity: ligne.quantity,
            ...(ligne.supplierInvoiceLineId ? { supplierInvoiceLineId: ligne.supplierInvoiceLineId } : {})
          })),
          clientRequestId
        }),
      t('La réception n’a pas pu être enregistrée.')
    );
    if (reponse.ok) {
      setResultat(reponse.resultat);
      setEtape('fait');
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-movements', tenantId) });
      return;
    }
    const { erreur } = reponse;
    if (erreur.reseau) return;
    if (erreur.code && CODES_DATE.includes(erreur.code)) {
      setErreurDate(erreur.message);
      return;
    }
    if (erreur.code === 'STOCK_SITE_CLOSED') {
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
    }
    setErreurEnvoi(erreur.message);
  };

  const rappelFacture = facture ? `${facture.supplierName} · ${facture.reference}` : undefined;

  // --- Photos : montées dès l'étape 4, envoyées après l'enregistrement --------
  // Rendues en `persistant` des étapes 4 à 6, qui sont toutes des `EtapeGeste` :
  // les fichiers pris à l'étape 4 attendent le bon, puis partent un par un.

  const cibleBon = resultat ? { type: 'SLIP' as const, id: resultat.data.slip.id } : undefined;
  const photosVisibles = etape === 'photos' || etape === 'fait';
  const photos = photosVues ? (
    <div hidden={!photosVisibles} style={{ marginBlockEnd: 'var(--space-4)' }}>
      <Text strong style={{ display: 'block', fontSize: 16 }}>
        {t('Photographier le bon de livraison')}
      </Text>
      <StockPhotoCapture tenantId={tenantId} target={cibleBon} purposes={['DELIVERY_NOTE']} />
      <Text strong style={{ display: 'block', fontSize: 16, marginBlockStart: 'var(--space-3)' }}>
        {t('Photographier la marchandise')}
      </Text>
      <StockPhotoCapture tenantId={tenantId} target={cibleBon} purposes={['GOODS_PHOTO']} />
    </div>
  ) : null;

  let contenu: React.ReactNode = null;

  if (etape === 'facture') {
    contenu = (
      <EtapeGeste titre={t('Quelle facture ?')} onRetour={() => confirmerAbandon(entame)}>
        <ListeChoix
          aria-label={t('Factures validées')}
          lignes={lignesFactures}
          onChoisir={choisirFacture}
          selectionId={facture?.id}
          placeholderRecherche={t('Fournisseur ou référence')}
          vide={t('Aucune facture validée trouvée. La réception exige une facture validée par la comptabilité.')}
          pied={recherche => (
            <Space direction="vertical" style={{ width: '100%', marginBlockStart: 'var(--space-2)' }}>
              <Button
                block
                loading={rechercheEnCours}
                onClick={() => void chercher(recherche)}
                style={{ minHeight: 48, fontSize: 16 }}
              >
                {t('Chercher dans toutes les factures')}
              </Button>
              {curseur && rechercheFaite !== null ? (
                <Button
                  block
                  loading={rechercheEnCours}
                  onClick={() => void chercher(rechercheFaite, curseur)}
                  style={{ minHeight: 48 }}
                >
                  {t('Afficher plus')}
                </Button>
              ) : null}
            </Space>
          )}
        />
      </EtapeGeste>
    );
  } else if (etape === 'deja-recue') {
    const vue = recus.vue;
    contenu = (
      <EtapeGeste
        titre={t('Cette facture a déjà été réceptionnée')}
        rappel={rappelFacture}
        onRetour={() => setEtape('facture')}
      >
        {recus.chargement ? (
          <Text type="secondary">{t('Lecture des réceptions déjà faites…')}</Text>
        ) : recus.echec || !vue ? (
          <Text type="secondary">{t('Les réceptions déjà faites n’ont pas pu être lues.')}</Text>
        ) : (
          <ul aria-label={t('Réceptions déjà faites')} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {vue.receipts.map((recu, index) => (
              <li
                key={recu.slipId ?? `${recu.createdAt}-${index}`}
                style={{ paddingBlock: 'var(--space-2)', borderBlockEnd: '1px solid var(--border-subtle)' }}
              >
                <Text strong>{recu.slipNumber ?? t('Réception sans bon')}</Text>
                <Text type="secondary" style={{ display: 'block' }}>
                  {[dayjs(recu.receiptDate).format(dateFormat('short')), recu.locationLabel, recu.createdByLabel].join(
                    ' · '
                  )}
                </Text>
                {recu.lines.map(ligne => (
                  <Text key={ligne.itemId} style={{ display: 'block' }}>
                    {ligne.itemLabel} : {formatQuantity(ligne.quantity, ligne.itemUnit)}
                  </Text>
                ))}
              </li>
            ))}
          </ul>
        )}
        <Text type="secondary" style={{ display: 'block', marginBlock: 'var(--space-3)' }}>
          {t(
            'Une livraison en plusieurs fois est normale. Vérifiez seulement que cette marchandise n’a pas déjà été saisie.'
          )}
        </Text>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button type="primary" block onClick={() => setEtape('lieu')} style={{ minHeight: 48, fontSize: 16 }}>
            {t('Continuer : c’est une autre livraison')}
          </Button>
          <Button block onClick={() => setEtape('facture')} style={{ minHeight: 48, fontSize: 16 }}>
            {t('Choisir une autre facture')}
          </Button>
        </Space>
      </EtapeGeste>
    );
  } else if (etape === 'lieu') {
    contenu = (
      <EtapeGeste
        titre={t('Où arrive la marchandise ?')}
        rappel={rappelFacture}
        onRetour={() => setEtape(facture && facture.receiptCount > 0 ? 'deja-recue' : 'facture')}
        principale={{ label: t('Continuer'), onClick: () => setEtape('articles'), disabled: !lieuId }}
      >
        <ListeChoix
          aria-label={t('Lieux de réception')}
          lignes={lieuxPossibles.map(candidat => ({
            id: candidat.id,
            titre: candidat.label,
            recherche: candidat.label
          }))}
          selectionId={lieuId}
          onChoisir={setLieuId}
          vide={t('Aucun lieu ne peut recevoir de marchandise.')}
        />
      </EtapeGeste>
    );
  } else if (etape === 'articles') {
    contenu = (
      <SaisieArticles
        mode="reception"
        titre={t('Qu’avez-vous reçu ?')}
        rappel={rappelFacture}
        articles={contexte.items}
        lignes={lignes}
        onChange={setLignes}
        lignesFacture={recus.vue?.invoice.lines ?? null}
        onRetour={() => setEtape('lieu')}
        onContinuer={() => {
          setPhotosVues(true);
          setEtape('photos');
        }}
      />
    );
  } else if (etape === 'photos') {
    contenu = (
      <EtapeGeste
        titre={t('Photos')}
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
  } else if (etape === 'verifier') {
    contenu = (
      <EtapeGeste
        titre={t('Vérifiez')}
        onRetour={() => setEtape('photos')}
        persistant={photos}
        envoiEnCours={envoi.enCours}
        principale={{
          label: t('Enregistrer la réception'),
          onClick: () => void enregistrer(),
          loading: envoi.enCours,
          disabled: !facture || !lieuId || lignes.length === 0
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
        <LigneRecap label={t('Facture')}>{rappelFacture}</LigneRecap>
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
  } else if (etape === 'fait' && resultat) {
    contenu = (
      <EtapeGeste
        titre={resultat.replayed ? t('Réception déjà enregistrée') : t('Réception enregistrée')}
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
        {resultat.data.controls.map(controle => (
          <Alert
            key={controle.alertId || controle.code}
            type={controle.severity === 'WARNING' ? 'warning' : 'info'}
            showIcon
            style={{ marginBlockEnd: 'var(--space-2)' }}
            message={controle.message}
          />
        ))}
        <Space direction="vertical" style={{ width: '100%', marginBlockStart: 'var(--space-3)' }}>
          <StockSlipPdfButton tenantId={tenantId} slipId={resultat.data.slip.id} number={resultat.data.slip.number} />
          <Text strong style={{ fontSize: 16 }}>
            {t('Photographier le bon signé')}
          </Text>
          <StockPhotoCapture tenantId={tenantId} target={cibleBon} purposes={['SIGNED_SLIP']} />
        </Space>
        <Space direction="vertical" style={{ width: '100%', marginBlockStart: 'var(--space-4)' }}>
          <Button type="primary" block onClick={onRecommencer} style={{ minHeight: 48, fontSize: 16 }}>
            {t('Nouvelle réception')}
          </Button>
          <Button block onClick={onQuitter} style={{ minHeight: 48, fontSize: 16 }}>
            {t('Retour au magasin')}
          </Button>
        </Space>
      </EtapeGeste>
    );
  }

  return <>{contenu}</>;
};

export default GesteRecevoir;
