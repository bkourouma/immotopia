import React, { useMemo, useState } from 'react';
import { Alert, Button, Input, Space, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  closeStockCount,
  createStockCount,
  getStockCount,
  justifyStockCountLine,
  setStockCountLine
} from '../../../../services/finance-stock-inventaire-service';
import { StockBlindBanner } from '../StockBlindBanner';
import { StockPhotoCapture } from '../StockPhotoCapture';
import { StockQuantityInput } from '../StockQuantityInput';
import { StockReasonPicker, isStockReasonComplete, type StockReasonValue } from '../StockReasonPicker';
import { AlerteCoupure, EtapeGeste, ListeChoix, type LigneChoix } from './MagasinBriques';
import { aujourdhuiIso } from './DateMouvement';
import { useEnvoiTerrain } from './useEnvoiTerrain';
import { lireErreurStock } from './stock-erreurs';
import { STOCK_FIELD_CONTEXT_ENTITY } from '../../../../hooks/useStockFieldContext';
import { detailKey, entityKeyPrefix, STALE_TIME } from '../../../../lib/query-keys';
import {
  estEnEcart,
  formatQuantity,
  formatVariance,
  lignesSansMotif
} from '../../../../types/finance-stock-inventaire-types';
import {
  stockReasonDisplay,
  type StockCountLineView,
  type StockCountView,
  type StockFieldContext
} from '../../../../types/finance-stock-controle-types';
import { dateFormat } from '../../../../i18n/format';
import { t } from '../../../../i18n/t';

const { Text, Title } = Typography;

export interface GesteCompterProps {
  tenantId: string;
  contexte: StockFieldContext;
  lieuCourantId: string;
  onQuitter: () => void;
}

type Vue = 'principal' | 'saisie' | 'cloture' | 'ouverture' | 'justifier';

function heure(iso: string | null): string {
  return iso ? dayjs(iso).format('HH:mm') : '';
}

/**
 * Geste « Compter » (ecrans §6.6) : ouvrir un inventaire du lieu courant, le
 * compter **à l'aveugle** (aucune quantité attendue, aucun solde du lieu lu,
 * aucun champ motif), le clore, puis justifier les écarts. La validation, avec
 * ses contrôles, vit sur l'écran Transferts et inventaire.
 */
export const GesteCompter: React.FC<GesteCompterProps> = ({ tenantId, contexte, lieuCourantId, onQuitter }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const envoi = useEnvoiTerrain();
  const { canCount, canValidateCount } = contexte.abilities;
  const lieu = contexte.locations.find(candidat => candidat.id === lieuCourantId) ?? null;

  const [countIdCree, setCountIdCree] = useState<string | null>(null);
  const countId = countIdCree ?? lieu?.countInProgress?.countId ?? null;
  const [vue, setVue] = useState<Vue>('principal');
  const [recherche, setRecherche] = useState('');
  const [saisie, setSaisie] = useState<{ itemId: string; quantite: number | null } | null>(null);
  const [aJustifier, setAJustifier] = useState<StockCountLineView | null>(null);
  const [motif, setMotif] = useState<StockReasonValue>({ reasonCode: null, reason: '' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [incomplet, setIncomplet] = useState<Array<{ itemId: string; itemLabel: string }>>([]);
  const [enCours, setEnCours] = useState(false);

  const detail = useQuery({
    queryKey: detailKey('stock-counts', tenantId, countId ?? ''),
    queryFn: () => getStockCount(tenantId, countId as string),
    enabled: Boolean(countId),
    staleTime: STALE_TIME.list
  });
  const comptage = detail.data ?? null;

  const relire = async () => {
    await queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-counts', tenantId) });
    void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
  };

  const retourPrincipal = () => {
    envoi.oublier();
    setSaisie(null);
    setAJustifier(null);
    setErreur(null);
    setVue('principal');
  };

  // --- Aucun inventaire ----------------------------------------------------

  const commencer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const cree = await createStockCount(tenantId, {
        locationId: lieuCourantId,
        countedAt: aujourdhuiIso(),
        kind: 'REGULAR'
      });
      setCountIdCree(cree.id);
      queryClient.setQueryData(detailKey('stock-counts', tenantId, cree.id), cree);
      await relire();
      setVue('principal');
    } catch (err) {
      const lue = lireErreurStock(err, t('L’inventaire n’a pas pu être commencé.'));
      if (lue.code === 'STOCK_COUNT_ALREADY_OPEN') await relire();
      setErreur(lue.message);
    } finally {
      setEnCours(false);
    }
  };

  if (!countId) {
    if (vue === 'ouverture') {
      return (
        <EtapeGeste
          titre={t('Commencer l’inventaire')}
          onRetour={() => setVue('principal')}
          principale={{ label: t('Commencer'), onClick: () => void commencer(), loading: enCours }}
        >
          {erreur ? <Alert type="error" showIcon role="alert" message={erreur} style={{ marginBlockEnd: 12 }} /> : null}
          <Text style={{ fontSize: 16 }}>
            {t(
              'Commencer un inventaire de {{lieu}} aujourd’hui ? Les quantités attendues ne seront pas affichées pendant le comptage.',
              { lieu: lieu?.label ?? '' }
            )}
          </Text>
        </EtapeGeste>
      );
    }
    return (
      <EtapeGeste
        titre={t('Compter')}
        rappel={lieu?.label}
        onRetour={onQuitter}
        principale={canCount ? { label: t('Commencer l’inventaire'), onClick: () => setVue('ouverture') } : undefined}
      >
        <Text style={{ fontSize: 16 }}>{t('Aucun inventaire en cours sur ce lieu.')}</Text>
      </EtapeGeste>
    );
  }

  if (detail.isError) {
    return (
      <EtapeGeste titre={t('Compter')} onRetour={onQuitter}>
        <Alert
          type="error"
          showIcon
          message={t('L’inventaire n’a pas pu être lu.')}
          action={
            <Button onClick={() => void detail.refetch()} style={{ minHeight: 44 }}>
              {t('Réessayer')}
            </Button>
          }
        />
      </EtapeGeste>
    );
  }

  if (!comptage) {
    return (
      <EtapeGeste titre={t('Compter')} onRetour={onQuitter}>
        <Text type="secondary">{t('Chargement de l’inventaire…')}</Text>
      </EtapeGeste>
    );
  }

  if (comptage.status === 'DRAFT') {
    return (
      <Comptage
        tenantId={tenantId}
        contexte={contexte}
        comptage={comptage}
        lieuLabel={lieu?.label ?? comptage.locationLabel}
        toRecount={lieu?.toRecount ?? []}
        vue={vue}
        setVue={setVue}
        recherche={recherche}
        setRecherche={setRecherche}
        saisie={saisie}
        setSaisie={setSaisie}
        incomplet={incomplet}
        setIncomplet={setIncomplet}
        erreur={erreur}
        setErreur={setErreur}
        envoi={envoi}
        relire={relire}
        retourPrincipal={retourPrincipal}
        onQuitter={onQuitter}
      />
    );
  }

  if (comptage.status === 'COUNTED') {
    return (
      <Justification
        tenantId={tenantId}
        contexte={contexte}
        comptage={comptage}
        vue={vue}
        setVue={setVue}
        aJustifier={aJustifier}
        setAJustifier={setAJustifier}
        motif={motif}
        setMotif={setMotif}
        erreur={erreur}
        setErreur={setErreur}
        enCours={enCours}
        setEnCours={setEnCours}
        relire={relire}
        retourPrincipal={retourPrincipal}
        onQuitter={onQuitter}
        onValider={
          canValidateCount
            ? () => navigate(`/tenant/${tenantId}/finance/stock/inventaire?inventaire=${comptage.id}`)
            : undefined
        }
      />
    );
  }

  return (
    <EtapeGeste titre={t('Compter')} onRetour={onQuitter}>
      <Text style={{ fontSize: 16 }}>{t('Aucun inventaire en cours sur ce lieu.')}</Text>
    </EtapeGeste>
  );
};

// ===========================================================================
// Comptage à l'aveugle (DRAFT)
// ===========================================================================

interface ComptageProps {
  tenantId: string;
  contexte: StockFieldContext;
  comptage: StockCountView;
  lieuLabel: string;
  toRecount: Array<{ itemId: string; itemLabel: string }>;
  vue: Vue;
  setVue: (vue: Vue) => void;
  recherche: string;
  setRecherche: (valeur: string) => void;
  saisie: { itemId: string; quantite: number | null } | null;
  setSaisie: (saisie: { itemId: string; quantite: number | null } | null) => void;
  incomplet: Array<{ itemId: string; itemLabel: string }>;
  setIncomplet: (items: Array<{ itemId: string; itemLabel: string }>) => void;
  erreur: string | null;
  setErreur: (erreur: string | null) => void;
  envoi: ReturnType<typeof useEnvoiTerrain>;
  relire: () => Promise<void>;
  retourPrincipal: () => void;
  onQuitter: () => void;
}

function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const Comptage: React.FC<ComptageProps> = ({
  tenantId,
  contexte,
  comptage,
  lieuLabel,
  toRecount,
  vue,
  setVue,
  recherche,
  setRecherche,
  saisie,
  setSaisie,
  incomplet,
  setIncomplet,
  erreur,
  setErreur,
  envoi,
  relire,
  retourPrincipal,
  onQuitter
}) => {
  const { canCount } = contexte.abilities;
  const [clotureEnCours, setClotureEnCours] = useState(false);
  const lignesParArticle = useMemo(() => new Map(comptage.lines.map(ligne => [ligne.itemId, ligne])), [comptage.lines]);
  const aRecompter = useMemo(
    () => new Set([...toRecount, ...comptage.toRecount].map(item => item.itemId)),
    [toRecount, comptage.toRecount]
  );

  const ouvrirSaisie = (itemId: string) => {
    envoi.oublier();
    envoi.preparer();
    setErreur(null);
    const existante = lignesParArticle.get(itemId);
    setSaisie({ itemId, quantite: existante?.countedQuantity ?? null });
    setVue('saisie');
  };

  const enregistrerLigne = async () => {
    if (!saisie || saisie.quantite === null || saisie.quantite < 0) return;
    setErreur(null);
    const quantite = saisie.quantite;
    const reponse = await envoi.envoyer(
      clientRequestId =>
        setStockCountLine(tenantId, comptage.id, { itemId: saisie.itemId, countedQuantity: quantite, clientRequestId }),
      t('Le comptage de l’article n’a pas pu être enregistré.')
    );
    if (reponse.ok) {
      setIncomplet(incomplet.filter(item => item.itemId !== saisie.itemId));
      await relire();
      retourPrincipal();
      return;
    }
    if (!reponse.erreur.reseau) setErreur(reponse.erreur.message);
  };

  const clore = async () => {
    setClotureEnCours(true);
    setErreur(null);
    try {
      await closeStockCount(tenantId, comptage.id);
      setIncomplet([]);
      await relire();
      setVue('principal');
    } catch (err) {
      const lue = lireErreurStock(err, t('Le comptage n’a pas pu être clos.'));
      if (lue.code === 'STOCK_COUNT_INCOMPLETE') {
        // L'écran ne sait pas quels articles ont du stock (aveugle) : il relaie la liste du serveur.
        setIncomplet(lue.items);
        setErreur(
          t(
            'Un inventaire d’ouverture ou de clôture doit compter tous les articles présents sur le lieu. Il reste à compter : {{liste}}.',
            { liste: lue.items.map(item => item.itemLabel).join(', ') }
          )
        );
      } else {
        setErreur(lue.message);
      }
      setVue('principal');
    } finally {
      setClotureEnCours(false);
    }
  };

  if (vue === 'saisie' && saisie) {
    const article = contexte.items.find(candidat => candidat.id === saisie.itemId) ?? null;
    const existante = lignesParArticle.get(saisie.itemId) ?? null;
    return (
      <EtapeGeste
        titre={article ? `${article.reference} — ${article.label}` : (existante?.itemLabel ?? t('Article'))}
        rappel={lieuLabel}
        onRetour={retourPrincipal}
        envoiEnCours={envoi.enCours}
        principale={{
          label: t('Enregistrer'),
          onClick: () => void enregistrerLigne(),
          loading: envoi.enCours,
          disabled: saisie.quantite === null || saisie.quantite < 0
        }}
      >
        {envoi.coupure ? <AlerteCoupure onReessayer={() => void enregistrerLigne()} disabled={envoi.enCours} /> : null}
        {erreur ? <Alert type="error" showIcon role="alert" message={erreur} style={{ marginBlockEnd: 12 }} /> : null}
        <label htmlFor="magasin-compte" style={{ display: 'block', fontSize: 16, marginBlockEnd: 8 }}>
          {t('Quantité comptée')}
        </label>
        <StockQuantityInput
          id="magasin-compte"
          aria-label={t('Quantité comptée')}
          unit={article?.unit ?? existante?.itemUnit}
          min={0}
          value={saisie.quantite}
          onChange={valeur => setSaisie({ ...saisie, quantite: valeur })}
        />
        <Button
          block
          onClick={() => setSaisie({ ...saisie, quantite: 0 })}
          style={{ minHeight: 48, fontSize: 16, marginBlockStart: 'var(--space-3)' }}
        >
          {t('Rien trouvé (0)')}
        </Button>
        {existante && existante.countedQuantity !== null ? (
          <Text type="secondary" style={{ display: 'block', marginBlockStart: 'var(--space-3)' }}>
            {t('Cette quantité remplace celle saisie à {{heure}} par {{nom}}.', {
              heure: heure(existante.countedAtServer),
              nom: existante.countedByLabel ?? ''
            })}
          </Text>
        ) : null}
      </EtapeGeste>
    );
  }

  if (vue === 'cloture') {
    return (
      <EtapeGeste
        titre={t('Clore le comptage')}
        rappel={lieuLabel}
        onRetour={() => setVue('principal')}
        envoiEnCours={clotureEnCours}
        principale={{ label: t('Clore le comptage'), onClick: () => void clore(), loading: clotureEnCours }}
      >
        <Text style={{ fontSize: 16 }}>
          {t(
            'Clore le comptage de {{lieu}} ? {{n}} article(s) compté(s). Les articles qui ont du stock ici et que personne n’a comptés apparaîtront comme « non comptés » : une personne habilitée devra les écarter. Après la clôture, les quantités ne se modifient plus et les écarts s’affichent.',
            { lieu: lieuLabel, n: comptage.linesCount }
          )}
        </Text>
      </EtapeGeste>
    );
  }

  const cle = normaliser(recherche.trim());
  const correspond = (texte: string) => !cle || normaliser(texte).includes(cle);
  const aCompter: LigneChoix[] = contexte.items
    .filter(article => !lignesParArticle.has(article.id) && correspond(`${article.reference} ${article.label}`))
    .sort((a, b) => {
      const ra = aRecompter.has(a.id) ? 0 : 1;
      const rb = aRecompter.has(b.id) ? 0 : 1;
      return ra - rb || a.reference.localeCompare(b.reference);
    })
    .map(article => ({
      id: article.id,
      titre: `${article.reference} — ${article.label}`,
      sousTitre: article.unit,
      pastilles: aRecompter.has(article.id)
        ? [{ key: 'TO_RECOUNT', tone: 'warning' as const, label: t('À recompter') }]
        : undefined
    }));
  const dejaComptes: LigneChoix[] = comptage.lines
    .filter(ligne => correspond(`${ligne.itemReference} ${ligne.itemLabel}`))
    .map(ligne => ({
      id: ligne.itemId,
      titre: `${ligne.itemReference} — ${ligne.itemLabel}`,
      sousTitre: formatQuantity(ligne.countedQuantity, ligne.itemUnit),
      note: t('compté par {{nom}} à {{heure}}', {
        nom: ligne.countedByLabel ?? '',
        heure: heure(ligne.countedAtServer)
      })
    }));

  return (
    <EtapeGeste
      titre={t('Comptage de {{lieu}}', { lieu: lieuLabel })}
      onRetour={onQuitter}
      principale={
        canCount
          ? { label: t('Clore le comptage'), onClick: () => setVue('cloture'), disabled: comptage.lines.length === 0 }
          : undefined
      }
    >
      <div style={{ position: 'sticky', insetBlockStart: 0, zIndex: 1, marginBlockEnd: 'var(--space-3)' }}>
        <StockBlindBanner variant="magasin" />
      </div>
      {erreur ? (
        <Alert
          type="warning"
          showIcon
          role="alert"
          style={{ marginBlockEnd: 'var(--space-3)' }}
          message={erreur}
          description={
            incomplet.length > 0 ? (
              <Space wrap>
                {incomplet.map(item => (
                  <Button key={item.itemId} onClick={() => ouvrirSaisie(item.itemId)} style={{ minHeight: 44 }}>
                    {item.itemLabel}
                  </Button>
                ))}
              </Space>
            ) : undefined
          }
        />
      ) : null}
      <Input
        allowClear
        prefix={<SearchOutlined aria-hidden />}
        placeholder={t('Référence ou libellé')}
        aria-label={t('Rechercher un article')}
        value={recherche}
        onChange={event => setRecherche(event.target.value)}
        style={{ minHeight: 48, fontSize: 16, marginBlockEnd: 'var(--space-3)' }}
      />
      <Title level={5}>{t('À compter')}</Title>
      <ListeChoix
        aria-label={t('À compter')}
        sansRecherche
        lignes={aCompter}
        onChoisir={id => (canCount ? ouvrirSaisie(id) : undefined)}
        vide={t('Tous les articles ont été comptés.')}
      />
      <Title level={5}>{t('Déjà comptés ({{n}})', { n: comptage.lines.length })}</Title>
      <ListeChoix
        aria-label={t('Déjà comptés')}
        sansRecherche
        lignes={dejaComptes}
        onChoisir={id => (canCount ? ouvrirSaisie(id) : undefined)}
        vide={t('Aucun article compté pour le moment.')}
      />
    </EtapeGeste>
  );
};

// ===========================================================================
// Justification (COUNTED)
// ===========================================================================

interface JustificationProps {
  tenantId: string;
  contexte: StockFieldContext;
  comptage: StockCountView;
  vue: Vue;
  setVue: (vue: Vue) => void;
  aJustifier: StockCountLineView | null;
  setAJustifier: (ligne: StockCountLineView | null) => void;
  motif: StockReasonValue;
  setMotif: (motif: StockReasonValue) => void;
  erreur: string | null;
  setErreur: (erreur: string | null) => void;
  enCours: boolean;
  setEnCours: (valeur: boolean) => void;
  relire: () => Promise<void>;
  retourPrincipal: () => void;
  onQuitter: () => void;
  onValider?: () => void;
}

/** « Attendu : 100 sacs · Compté : 92 sacs · Écart : −8 sacs » — quantités seulement, jamais de valeur. */
export function resumeEcart(ligne: StockCountLineView): string {
  if (ligne.notCounted) {
    return t('Attendu : {{attendu}} · non compté', { attendu: formatQuantity(ligne.expectedQuantity, ligne.itemUnit) });
  }
  return t('Attendu : {{attendu}} · Compté : {{compte}} · Écart : {{ecart}}', {
    attendu: formatQuantity(ligne.expectedQuantity, ligne.itemUnit),
    compte: formatQuantity(ligne.countedQuantity, ligne.itemUnit),
    ecart: formatVariance(ligne.variance, ligne.itemUnit)
  });
}

const CarteLigne: React.FC<{ ligne: StockCountLineView; children?: React.ReactNode }> = ({ ligne, children }) => (
  <li
    style={{
      listStyle: 'none',
      padding: 'var(--space-3)',
      marginBlockEnd: 'var(--space-2)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--surface-card)'
    }}
  >
    <Text strong style={{ display: 'block', fontSize: 16 }}>
      {ligne.itemReference} — {ligne.itemLabel}
    </Text>
    <Text style={{ display: 'block' }}>{resumeEcart(ligne)}</Text>
    {children}
  </li>
);

const Justification: React.FC<JustificationProps> = ({
  tenantId,
  contexte,
  comptage,
  vue,
  setVue,
  aJustifier,
  setAJustifier,
  motif,
  setMotif,
  erreur,
  setErreur,
  enCours,
  setEnCours,
  relire,
  retourPrincipal,
  onQuitter,
  onValider
}) => {
  const { canCount, canValidateCount } = contexte.abilities;
  const peutJustifier = canCount || canValidateCount;

  const ouvrirJustification = (ligne: StockCountLineView) => {
    setAJustifier(ligne);
    setMotif({ reasonCode: ligne.reasonCode, reason: ligne.reason ?? '' });
    setErreur(null);
    setVue('justifier');
  };

  const enregistrerMotif = async () => {
    if (!aJustifier || !motif.reasonCode) return;
    setEnCours(true);
    setErreur(null);
    try {
      await justifyStockCountLine(tenantId, comptage.id, aJustifier.itemId, {
        reasonCode: motif.reasonCode,
        reason: motif.reason
      });
      await relire();
      retourPrincipal();
    } catch (err) {
      setErreur(lireErreurStock(err, t('Le motif n’a pas pu être enregistré.')).message);
    } finally {
      setEnCours(false);
    }
  };

  if (vue === 'justifier' && aJustifier) {
    return (
      <EtapeGeste
        titre={t('Justifier l’écart de {{article}}', { article: aJustifier.itemLabel })}
        onRetour={retourPrincipal}
        envoiEnCours={enCours}
        principale={{
          label: t('Enregistrer le motif'),
          onClick: () => void enregistrerMotif(),
          loading: enCours,
          disabled: !isStockReasonComplete(motif)
        }}
      >
        {erreur ? <Alert type="error" showIcon role="alert" message={erreur} style={{ marginBlockEnd: 12 }} /> : null}
        <Text style={{ display: 'block', fontSize: 16, marginBlockEnd: 'var(--space-3)' }}>
          {resumeEcart(aJustifier)}
        </Text>
        <StockReasonPicker codes={contexte.reasonCodes.count} value={motif} onChange={setMotif} />
        <div style={{ marginBlockStart: 'var(--space-4)' }}>
          <Text strong style={{ display: 'block', fontSize: 16 }}>
            {t('Ajouter une photo')}
          </Text>
          <StockPhotoCapture
            tenantId={tenantId}
            target={{ type: 'COUNT_LINE', id: aJustifier.id }}
            purposes={['GOODS_PHOTO']}
          />
        </div>
      </EtapeGeste>
    );
  }

  const aJustifierLignes = lignesSansMotif(comptage);
  const justifiees = comptage.lines.filter(ligne => estEnEcart(ligne) && ligne.justified);
  const nonComptees = comptage.lines.filter(ligne => ligne.notCounted && ligne.setAside === null);
  const ecartees = comptage.lines.filter(ligne => ligne.setAside !== null);
  const sansEcart = comptage.lines.filter(ligne => !ligne.notCounted && ligne.setAside === null && !estEnEcart(ligne));

  return (
    <EtapeGeste titre={t('Écarts du comptage')} rappel={comptage.locationLabel} onRetour={onQuitter}>
      <Text style={{ display: 'block', fontSize: 16, marginBlockEnd: 'var(--space-3)' }}>
        {t('Comptage clos le {{date}} par {{nom}}. Les écarts sont visibles : dites ce qui s’est passé pour chacun.', {
          date: comptage.closedAt ? dayjs(comptage.closedAt).format(dateFormat('short')) : '',
          nom: comptage.closedByLabel ?? ''
        })}
      </Text>

      <Title level={5}>{t('Écarts à justifier ({{n}})', { n: aJustifierLignes.length })}</Title>
      <ul style={{ margin: 0, padding: 0 }} aria-label={t('Écarts à justifier')}>
        {aJustifierLignes.map(ligne => (
          <CarteLigne key={ligne.id} ligne={ligne}>
            {peutJustifier ? (
              <Button
                type="primary"
                onClick={() => ouvrirJustification(ligne)}
                style={{ minHeight: 48, marginBlockStart: 'var(--space-2)' }}
              >
                {t('Justifier')}
              </Button>
            ) : null}
          </CarteLigne>
        ))}
      </ul>

      <Title level={5}>{t('Écarts justifiés ({{n}})', { n: justifiees.length })}</Title>
      <ul style={{ margin: 0, padding: 0 }} aria-label={t('Écarts justifiés')}>
        {justifiees.map(ligne => (
          <CarteLigne key={ligne.id} ligne={ligne}>
            <Text style={{ display: 'block' }}>
              {stockReasonDisplay(ligne.reasonCode, ligne.reasonCode ? null : ligne.reason)}
            </Text>
            {ligne.reasonCode && ligne.reason ? (
              <Text type="secondary" style={{ display: 'block' }}>
                {ligne.reason}
              </Text>
            ) : null}
            {ligne.justifiedByLabel ? (
              <Text type="secondary" style={{ display: 'block' }}>
                {t('justifié par {{nom}} à {{heure}}', {
                  nom: ligne.justifiedByLabel,
                  heure: heure(ligne.justifiedAt)
                })}
              </Text>
            ) : null}
            {peutJustifier ? (
              <Button onClick={() => ouvrirJustification(ligne)} style={{ minHeight: 48, marginBlockStart: 8 }}>
                {t('Corriger le motif')}
              </Button>
            ) : null}
          </CarteLigne>
        ))}
      </ul>

      {nonComptees.length > 0 ? (
        <>
          <Title level={5}>{t('Non comptés ({{n}})', { n: nonComptees.length })}</Title>
          <ul style={{ margin: 0, padding: 0 }} aria-label={t('Non comptés')}>
            {nonComptees.map(ligne => (
              <CarteLigne key={ligne.id} ligne={ligne}>
                <Text type="secondary" style={{ display: 'block' }}>
                  {t('Une personne habilitée doit écarter cette ligne ou faire recompter l’article.')}
                </Text>
              </CarteLigne>
            ))}
          </ul>
        </>
      ) : null}

      {ecartees.length > 0 ? (
        <details style={{ marginBlockEnd: 'var(--space-3)' }}>
          <summary style={{ minHeight: 48, fontSize: 16, cursor: 'pointer' }}>
            {t('Lignes écartées ({{n}})', { n: ecartees.length })}
          </summary>
          <ul style={{ margin: 0, padding: 0 }}>
            {ecartees.map(ligne => (
              <CarteLigne key={ligne.id} ligne={ligne}>
                <Text type="secondary">{t('Écartée : {{motif}}', { motif: ligne.setAside?.reason ?? '' })}</Text>
              </CarteLigne>
            ))}
          </ul>
        </details>
      ) : null}

      <details style={{ marginBlockEnd: 'var(--space-3)' }}>
        <summary style={{ minHeight: 48, fontSize: 16, cursor: 'pointer' }}>
          {t('Sans écart ({{n}})', { n: sansEcart.length })}
        </summary>
        <ul style={{ margin: 0, padding: 0 }}>
          {sansEcart.map(ligne => (
            <CarteLigne key={ligne.id} ligne={ligne} />
          ))}
        </ul>
      </details>

      {aJustifierLignes.length === 0 ? (
        <Alert
          type="success"
          showIcon
          message={t('Tous les écarts sont justifiés. Une personne habilitée doit maintenant valider l’inventaire.')}
          action={
            onValider ? (
              <Button onClick={onValider} style={{ minHeight: 44 }}>
                {t('Ouvrir l’inventaire pour le valider')}
              </Button>
            ) : undefined
          }
        />
      ) : null}
    </EtapeGeste>
  );
};

export default GesteCompter;
