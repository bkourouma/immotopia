import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Drawer,
  Dropdown,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, DownOutlined, DownloadOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
  listStockBalances,
  listStockMovements,
  recordStockIssue,
  recordStockReceipt
} from '../../services/finance-stock-mouvements-service';
import {
  exportStockMovementsCsv,
  getInvoiceReceipts,
  getStockSlip,
  listMovementAuthors,
  listStockTakers,
  recordStockScrap,
  recordSupplierReturn,
  searchReceivableInvoices
} from '../../services/finance-stock-controle-service';
import { STOCK_MOVEMENT_TYPE_LABELS, STOCK_MOVEMENT_TYPE_TONES } from '../../types/finance-stock-mouvements-types';
import type { StockMovementType } from '../../types/finance-stock-mouvements-types';
import {
  STOCK_SLIP_KIND_LABELS,
  STOCK_VALUATION_SOURCE_LABELS,
  stockReasonDisplay,
  type RequesterFields,
  type StockAbilities,
  type StockBalanceView,
  type StockErrorData,
  type StockFieldContext,
  type StockMeta,
  type StockMovementsFilters,
  type StockMovementView,
  type StockReceiptResult,
  type StockReceivableInvoice,
  type StockSlipResult,
  type StockWrite
} from '../../types/finance-stock-controle-types';
import { entityKeyPrefix, queryKey, STALE_TIME } from '../../lib/query-keys';
import { useStockFieldContext, STOCK_FIELD_CONTEXT_ENTITY } from '../../hooks/useStockFieldContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { nouvelIdentifiantDeRequete } from '../../utils/stock-client-request-id';
import { reponseIncertaine } from '../../components/finance/stock/magasin/useEnvoiTerrain';
import { isModuleNotIncludedError } from '../../utils/module-not-included';
import { describeDownloadError } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { montantSaisiProps } from '../../utils/montant-saisi';
import {
  DataCard,
  DataView,
  FilterSheet,
  MoneyValue,
  PageHeader,
  SkeletonDetail,
  StateBlock,
  StatusTag,
  formatMoney
} from '../../components/primitives';
import { ModuleNotIncluded } from '../../components/primitives/ModuleNotIncluded';
import { StockQuantityCell } from '../../components/finance/stock/StockQuantityCell';
import { StockQuantityInput } from '../../components/finance/stock/StockQuantityInput';
import { StockReasonPicker, isStockReasonComplete } from '../../components/finance/stock/StockReasonPicker';
import type { StockReasonValue } from '../../components/finance/stock/StockReasonPicker';
import { StockPhotoCapture } from '../../components/finance/stock/StockPhotoCapture';
import { StockAttachmentList } from '../../components/finance/stock/StockAttachmentList';
import { StockSlipPdfButton } from '../../components/finance/stock/StockSlipPdfButton';
import { StockTakerSelect } from '../../components/finance/stock/StockTakerSelect';
import { t } from '../../i18n/t';
import { activeLocale } from '../../i18n/format';

const { Text, Paragraph, Title } = Typography;

/**
 * Le stock au quotidien — état, réceptions, sorties, rebuts, retours, journal
 * des mouvements, bons et réceptions d'une facture. Lot 5 (PRD E9, besoins S2,
 * S3, S4), refondu au lot 040 (contrôle du stock de chantier, ecrans §5).
 *
 * ---------------------------------------------------------------------------
 * Une seule source pour les gestes : le contexte terrain
 * ---------------------------------------------------------------------------
 *
 * L'écran lit `GET /stock/field-context` une fois (`useStockFieldContext`) :
 * lieux, chantiers, postes, articles, preneurs, factures réceptionnables,
 * motifs, réglages et droits de l'appelant (`abilities`). Il remplace les
 * lectures financières que le magasinier n'a pas (`listConstructionSites`,
 * `listCostCategories`, `listSuppliers`) et décide de chaque bouton affiché.
 * Un `403` reste possible (rôle changé entre deux lectures) : il est relayé.
 *
 * ---------------------------------------------------------------------------
 * Le serveur masque, l'écran n'invente pas (B1, A2)
 * ---------------------------------------------------------------------------
 *
 * Sans STOCK_VALUES_VIEW, les champs de valeur arrivent à `null` : la colonne,
 * la carte ou la ligne DISPARAÎT — jamais « 0 FCFA » ni « — ». Sur un lieu en
 * comptage (`meta.blindLocationIds`), la quantité arrive aussi à `null` et
 * s'affiche « Comptage en cours ». Aucun montant n'est calculé ici, à la seule
 * exception de l'APERÇU d'une ligne de sortie, nommé comme tel et qui ne
 * voyage pas.
 *
 * ---------------------------------------------------------------------------
 * C'est la SORTIE qui impute le chantier, pas la livraison (P-7)
 * ---------------------------------------------------------------------------
 *
 * Dit en tête (pour qui voit les valeurs : le bandeau parle de coût), redit
 * dans la réception et dans la sortie. Le prix d'une sortie n'est jamais
 * saisi : le corps posté ne porte aucun champ de valeur (P-4).
 *
 * ---------------------------------------------------------------------------
 * Une écriture terrain porte toujours un `clientRequestId` (B3-R2)
 * ---------------------------------------------------------------------------
 *
 * Tiré à l'ouverture du formulaire, gardé tant que l'envoi n'a pas réussi —
 * y compris après une coupure sans réponse, un `5xx`, un `408` ou un `429`
 * (réponse incertaine) —, jeté après un succès ou après un refus `4xx`
 * définitif qui oblige à modifier le formulaire. Un réessai ne crée donc
 * jamais une seconde réception ou sortie ; un rejeu (`200`) dit « déjà
 * enregistrée ».
 *
 * **Vocabulaire.** On *reçoit*, on *sort*, on *retourne*, on *met au rebut* ;
 * un écart est un écart. Jamais « débit » ni « crédit », et aucun mot qui
 * juge une personne.
 */

// ---------------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------------

/** Une quantité, à quatre décimales au plus. Jamais `formatMoney`. */
function quantite(valeur: number, unite?: string | null): string {
  const texte = valeur.toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  return unite ? `${texte} ${unite}` : texte;
}

/** Une date ISO à la française. « — » plutôt que « Invalid Date ». */
function date(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const jour = dayjs(valeur);
  return jour.isValid() ? jour.format('DD/MM/YYYY') : '—';
}

function dateHeure(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const jour = dayjs(valeur);
  return jour.isValid() ? jour.format('DD/MM/YYYY HH:mm') : '—';
}

/** Ce qu'un refus de l'API dit, lu une fois. Sans réponse : une coupure réseau. */
interface ErreurLue {
  reseau: boolean;
  status?: number;
  code?: string;
  message?: string;
  data?: StockErrorData;
}

function lireErreur(err: unknown): ErreurLue {
  const reponse = (
    err as { response?: { status?: number; data?: { code?: string; message?: string; data?: StockErrorData } } }
  )?.response;
  if (!reponse) return { reseau: true };
  return {
    reseau: false,
    status: reponse.status,
    code: reponse.data?.code,
    message: reponse.data?.message,
    data: reponse.data?.data
  };
}

const CODES_DATE = new Set(['STOCK_DATE_IN_FUTURE', 'STOCK_DATE_TOO_OLD']);
const CODES_PRENEUR = new Set(['STOCK_TAKER_REQUIRED', 'STOCK_REQUESTER_REQUIRED', 'STOCK_TAKER_INACTIVE']);
const CODES_MOTIF = new Set(['STOCK_REASON_REQUIRED', 'STOCK_REASON_NOT_ALLOWED']);

/** Les lieux masqués à l'appelant : ceux du `meta`, et ceux qu'un comptage en cours vise. */
function lieuxAveugles(meta: StockMeta | undefined, contexte: StockFieldContext): Set<string> {
  const aveugles = new Set(meta?.blindLocationIds ?? []);
  for (const lieu of contexte.locations) {
    if (lieu.countInProgress?.status === 'DRAFT' && !contexte.abilities.canValidateCount) aveugles.add(lieu.id);
  }
  return aveugles;
}

/** Le texte d'un champ de valeur masqué parce que le lieu est en comptage. */
const MASQUE_COMPTAGE = (): React.ReactElement => <Text type="secondary">{t('Masqué (comptage en cours)')}</Text>;

/** L'identifiant de requête d'un formulaire d'écriture (ecrans §3.7). */
function useIdentifiantDeRequete(): [string, () => void] {
  const [identifiant, setIdentifiant] = useState(() => nouvelIdentifiantDeRequete());
  const renouveler = useCallback(() => setIdentifiant(nouvelIdentifiantDeRequete()), []);
  return [identifiant, renouveler];
}

/** Bandeau d'une coupure réseau : les saisies restent, et le réessai ne double rien. */
function AlerteCoupure({ onRetry, loading }: { onRetry: () => void; loading?: boolean }): React.ReactElement {
  return (
    <Alert
      type="warning"
      showIcon
      message={t('La connexion a été perdue.')}
      description={t("Vos saisies sont conservées. Réessayez : l'opération ne sera pas enregistrée deux fois.")}
      action={
        <Button size="small" onClick={onRetry} loading={loading}>
          {t('Réessayer')}
        </Button>
      }
    />
  );
}

/** Un sélecteur de date de mouvement, borné par le réglage de l'agence (A5-R4, ecrans §3.8). */
function ChampDate(props: {
  id: string;
  label: string;
  value: Dayjs | null;
  onChange: (valeur: Dayjs | null) => void;
  limiteJours: number;
  erreur?: string | null;
}): React.ReactElement {
  const { id, label, value, onChange, limiteJours, erreur } = props;
  const aujourdhui = dayjs().startOf('day');
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <DatePicker
        id={id}
        style={{ width: '100%' }}
        format="DD/MM/YYYY"
        value={value}
        onChange={onChange}
        status={erreur ? 'error' : undefined}
        disabledDate={jour =>
          jour.isAfter(aujourdhui.endOf('day')) || jour.isBefore(aujourdhui.subtract(limiteJours, 'day'))
        }
      />
      <div>
        <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
          {limiteJours === 0
            ? t('Aujourd’hui seulement.')
            : t('Au plus {{n}} jours en arrière. La date de saisie réelle est enregistrée à côté.', { n: limiteJours })}
        </Text>
      </div>
      {erreur ? (
        <Text type="danger" role="alert">
          {erreur}
        </Text>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Choisir une facture réceptionnable (réception et retour, ecrans §5.3, §5.5)
// ---------------------------------------------------------------------------

function libelleFacture(facture: StockReceivableInvoice, valeursVisibles: boolean): string {
  const base = `${facture.reference} — ${facture.supplierName} — ${date(facture.invoiceDate)}`;
  return valeursVisibles && facture.amount !== null ? `${base} — ${formatMoney(facture.amount)}` : base;
}

function ChoixFacture(props: {
  tenantId: string;
  id: string;
  factures: StockReceivableInvoice[];
  valeursVisibles: boolean;
  value: string | undefined;
  onChange: (facture: StockReceivableInvoice) => void;
  erreur?: string | null;
}): React.ReactElement {
  const { tenantId, id, factures, valeursVisibles, value, onChange, erreur } = props;
  const [trouvees, setTrouvees] = useState<StockReceivableInvoice[]>([]);
  const [recherche, setRecherche] = useState('');
  const [curseur, setCurseur] = useState<string | null>(null);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [rechercheEchouee, setRechercheEchouee] = useState(false);

  const connues = useMemo(() => {
    const parId = new Map<string, StockReceivableInvoice>();
    for (const facture of [...factures, ...trouvees]) parId.set(facture.id, facture);
    return [...parId.values()];
  }, [factures, trouvees]);

  const chercher = async (suite: boolean) => {
    setRechercheEnCours(true);
    setRechercheEchouee(false);
    try {
      const lu = await searchReceivableInvoices(tenantId, {
        search: recherche,
        cursor: suite ? (curseur ?? undefined) : undefined
      });
      setTrouvees(precedentes => (suite ? [...precedentes, ...lu.data] : lu.data));
      setCurseur(lu.meta.nextCursor ?? null);
    } catch {
      setRechercheEchouee(true);
    } finally {
      setRechercheEnCours(false);
    }
  };

  return (
    <Space orientation="vertical" size="small" style={{ width: '100%' }}>
      <div>
        <label htmlFor={id}>{t('Facture validée')}</label>
        <Select
          id={id}
          style={{ width: '100%' }}
          placeholder={t('Choisir une facture')}
          showSearch
          optionFilterProp="label"
          value={value}
          status={erreur ? 'error' : undefined}
          onChange={(valeur: string) => {
            const facture = connues.find(candidate => candidate.id === valeur);
            if (facture) onChange(facture);
          }}
          options={connues.map(facture => ({
            value: facture.id,
            label: libelleFacture(facture, valeursVisibles),
            receiptCount: facture.receiptCount
          }))}
          optionRender={option => (
            <Space size={4} wrap>
              <span>{option.label}</span>
              {(option.data as { receiptCount?: number }).receiptCount ? (
                <Tag color="blue">
                  {t('Déjà réceptionnée ({{n}} fois)', { n: (option.data as { receiptCount: number }).receiptCount })}
                </Tag>
              ) : null}
            </Space>
          )}
          notFoundContent={t('Aucune facture validée à proposer')}
        />
        <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
          {t('Seules les factures validées les plus récentes sont proposées.')}
        </Text>
        {erreur ? (
          <div>
            <Text type="danger" role="alert">
              {erreur}
            </Text>
          </div>
        ) : null}
      </div>
      <div>
        <label htmlFor={`${id}-recherche`}>{t('Chercher une autre facture (référence ou fournisseur)')}</label>
        <Input.Search
          id={`${id}-recherche`}
          value={recherche}
          onChange={event => setRecherche(event.target.value)}
          onSearch={() => void chercher(false)}
          loading={rechercheEnCours}
          enterButton={t('Chercher')}
        />
        {rechercheEchouee ? <Text type="secondary">{t('La recherche n’a pas abouti. Réessayez.')}</Text> : null}
        {trouvees.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={t('Factures trouvées')}>
            {trouvees.map(facture => (
              <li key={facture.id} style={{ paddingBlock: 2 }}>
                <Button type="link" style={{ paddingInline: 0 }} onClick={() => onChange(facture)}>
                  {libelleFacture(facture, valeursVisibles)}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {curseur ? (
          <Button size="small" onClick={() => void chercher(true)} loading={rechercheEnCours}>
            {t('Afficher plus')}
          </Button>
        ) : null}
      </div>
    </Space>
  );
}

// ---------------------------------------------------------------------------
// Fenêtre « Enregistrer une réception » (A8, B4, B5 — ecrans §5.3)
// ---------------------------------------------------------------------------

interface LigneReception {
  cle: number;
  itemId: string | undefined;
  quantity: number | null;
  invoiceLineId: string | undefined;
  unitCost: number | null;
  /** Vrai dès que la personne a touché au prix : sinon `unitCost` ne part pas. */
  prixSaisi: boolean;
}

function ligneReceptionVide(cle: number): LigneReception {
  return { cle, itemId: undefined, quantity: null, invoiceLineId: undefined, unitCost: null, prixSaisi: false };
}

function FenetreReception(props: {
  tenantId: string;
  contexte: StockFieldContext;
  onClose: () => void;
  onNouvelle: () => void;
}): React.ReactElement {
  const { tenantId, contexte, onClose, onNouvelle } = props;
  const queryClient = useQueryClient();
  const valeursVisibles = contexte.abilities.valuesVisible;
  const [clientRequestId, renouvelerIdentifiant] = useIdentifiantDeRequete();

  const [facture, setFacture] = useState<StockReceivableInvoice | null>(null);
  const [lieu, setLieu] = useState<string | undefined>(undefined);
  const [lieuChoisiALaMain, setLieuChoisiALaMain] = useState(false);
  const [dateReception, setDateReception] = useState<Dayjs | null>(dayjs());
  const [lignes, setLignes] = useState<LigneReception[]>([ligneReceptionVide(0)]);
  const [prochaineCle, setProchaineCle] = useState(1);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [coupure, setCoupure] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [resultat, setResultat] = useState<StockWrite<StockReceiptResult> | null>(null);

  const receptions = useQuery({
    queryKey: queryKey('stock-invoice-receipts', tenantId, { invoiceId: facture?.id }),
    queryFn: () => getInvoiceReceipts(tenantId, facture?.id as string),
    enabled: Boolean(facture),
    staleTime: STALE_TIME.list
  });
  const lignesFacture = receptions.data?.data.invoice.lines ?? [];

  const optionsLieux = contexte.locations
    .filter(l => l.isActive && !l.siteClosed)
    .map(l => ({ value: l.id, label: l.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const optionsArticles = contexte.items
    .map(a => ({ value: a.id, label: `${a.reference} — ${a.label}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const choisirFacture = (choisie: StockReceivableInvoice) => {
    setFacture(choisie);
    // Les lignes de facture d'une autre facture ne valent plus.
    setLignes(precedentes => precedentes.map(l => ({ ...l, invoiceLineId: undefined })));
    if (!lieuChoisiALaMain) {
      const chantier = contexte.sites.find(s => s.id === choisie.siteId);
      if (chantier?.stockEnabled && chantier.locationId && optionsLieux.some(o => o.value === chantier.locationId)) {
        setLieu(chantier.locationId);
      }
    }
  };

  const modifierLigne = (cle: number, champs: Partial<LigneReception>) => {
    setLignes(precedentes => precedentes.map(l => (l.cle === cle ? { ...l, ...champs } : l)));
  };

  const choisirLigneFacture = (cle: number, invoiceLineId: string | undefined) => {
    const ligneFacture = lignesFacture.find(l => l.id === invoiceLineId);
    const prix = ligneFacture?.hasUnitPrice && ligneFacture.unitPrice !== null ? ligneFacture.unitPrice : null;
    modifierLigne(cle, { invoiceLineId, unitCost: prix, prixSaisi: false });
  };

  const lignesCompletes = lignes.every(l => Boolean(l.itemId) && l.quantity !== null && l.quantity > 0);
  const peutEnvoyer = Boolean(facture) && Boolean(lieu) && dateReception !== null && lignesCompletes;

  const envoyer = async () => {
    if (!peutEnvoyer || !facture) return;
    setEnvoiEnCours(true);
    setErreur(null);
    setErreurDate(null);
    try {
      const ecrit = await recordStockReceipt(tenantId, {
        locationId: lieu as string,
        supplierInvoiceId: facture.id,
        receiptDate: (dateReception as Dayjs).format('YYYY-MM-DD'),
        lines: lignes.map(l => ({
          itemId: l.itemId as string,
          quantity: l.quantity as number,
          ...(l.invoiceLineId ? { supplierInvoiceLineId: l.invoiceLineId } : {}),
          // Le prix ne part que s'il a été saisi : prérempli de la ligne de
          // facture et laissé tel quel, c'est `supplierInvoiceLineId` qui le porte.
          ...(valeursVisibles && l.prixSaisi && l.unitCost !== null ? { unitCost: l.unitCost } : {})
        })),
        clientRequestId
      });
      setCoupure(false);
      setResultat(ecrit);
      renouvelerIdentifiant();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-movements', tenantId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-invoice-receipts', tenantId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) })
      ]);
    } catch (err) {
      const lue = lireErreur(err);
      if (lue.reseau) {
        // Même identifiant au prochain essai : le serveur rejouera, sans doubler.
        setCoupure(true);
        return;
      }
      setCoupure(false);
      // 5xx, 408, 429 : l'API a pu valider. Même identifiant au prochain essai.
      if (!reponseIncertaine(lue)) renouvelerIdentifiant();
      if (lue.code === 'STOCK_IDEMPOTENCY_MISMATCH') {
        setErreur(
          t("Cette opération a déjà été envoyée avec d'autres données. Vérifiez le journal avant de recommencer.")
        );
      } else if (lue.code && CODES_DATE.has(lue.code)) {
        setErreurDate(lue.message || t('Cette date n’est pas acceptée.'));
      } else {
        setErreur(lue.message || t("La réception n'a pas pu être enregistrée."));
      }
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const slip = resultat?.data.slip ?? null;
  const footer = resultat
    ? [
        <Button key="nouvelle" onClick={onNouvelle}>
          {t('Nouvelle réception')}
        </Button>,
        <Button key="fermer" type="primary" onClick={onClose}>
          {t('Fermer')}
        </Button>
      ]
    : [
        <Button key="annuler" onClick={onClose} disabled={envoiEnCours}>
          {t('Annuler')}
        </Button>,
        <Button key="envoyer" type="primary" disabled={!peutEnvoyer} loading={envoiEnCours} onClick={envoyer}>
          {t('Enregistrer la réception')}
        </Button>
      ];

  const dejaFaites = receptions.data?.data.receipts ?? [];

  return (
    <Modal
      title={t('Enregistrer une réception')}
      open
      onCancel={() => {
        if (!envoiEnCours) onClose();
      }}
      footer={footer}
      width={860}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {resultat && slip ? (
          <ConfirmationReception tenantId={tenantId} resultat={resultat} valeursVisibles={valeursVisibles} />
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              message={t('Une réception ne fait monter aucun coût de chantier')}
              description={t(
                "Elle enregistre des quantités et la valeur qui leur est attachée. La facture a déjà porté cette valeur ; c'est la sortie vers un chantier qui l'imputera à son coût, plus tard."
              )}
            />

            <ChoixFacture
              tenantId={tenantId}
              id="reception-facture"
              factures={contexte.receivableInvoices}
              valeursVisibles={valeursVisibles}
              value={facture?.id}
              onChange={choisirFacture}
            />
            {valeursVisibles ? (
              <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                {t(
                  "Le total reçu n'a pas à égaler le montant de la facture — un écart est une donnée, que le rapprochement exposera."
                )}
              </Text>
            ) : null}

            {facture && facture.receiptCount > 0 ? (
              receptions.isPending ? (
                <Text type="secondary">{t('Lecture des réceptions déjà faites…')}</Text>
              ) : receptions.error ? (
                <Text type="secondary">{t('Les réceptions déjà faites n’ont pas pu être lues.')}</Text>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message={t('Cette facture a déjà été réceptionnée')}
                  description={
                    <>
                      <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}>
                        {dejaFaites.map((reception, index) => (
                          <li key={`${reception.slipId ?? 'sans-bon'}-${index}`}>
                            {reception.slipNumber ? <strong>{reception.slipNumber}</strong> : null}{' '}
                            {t('le {{date}} à « {{lieu}} », par {{auteur}} :', {
                              date: date(reception.receiptDate),
                              lieu: reception.locationLabel,
                              auteur: reception.createdByLabel
                            })}{' '}
                            {reception.lines
                              .map(l =>
                                valeursVisibles && l.totalValue !== null
                                  ? `${l.itemLabel} ${quantite(l.quantity, l.itemUnit)} (${formatMoney(l.totalValue)})`
                                  : `${l.itemLabel} ${quantite(l.quantity, l.itemUnit)}`
                              )
                              .join(', ')}
                          </li>
                        ))}
                      </ul>
                      <Paragraph style={{ marginBottom: 0, marginTop: 'var(--space-2)' }}>
                        {t(
                          'Une livraison en plusieurs fois est normale. Vérifiez seulement que cette marchandise n’a pas déjà été saisie.'
                        )}
                      </Paragraph>
                    </>
                  }
                />
              )
            ) : null}

            <div>
              <label htmlFor="reception-lieu">{t('Lieu de réception')}</label>
              <Select
                id="reception-lieu"
                style={{ width: '100%' }}
                placeholder={t('Choisir un lieu')}
                showSearch
                optionFilterProp="label"
                value={lieu}
                onChange={(valeur: string) => {
                  setLieu(valeur);
                  setLieuChoisiALaMain(true);
                }}
                options={optionsLieux}
                notFoundContent={t('Aucun lieu de stockage disponible')}
              />
            </div>

            <ChampDate
              id="reception-date"
              label={t('Date de réception')}
              value={dateReception}
              onChange={setDateReception}
              limiteJours={contexte.settings.backdatingLimitDays}
              erreur={erreurDate}
            />

            <Text strong>{t('Lignes reçues')}</Text>
            {lignes.map((ligne, index) => {
              const ligneFacture = lignesFacture.find(l => l.id === ligne.invoiceLineId);
              const prixRepris = Boolean(ligneFacture?.hasUnitPrice) && !ligne.prixSaisi;
              return (
                <Card key={ligne.cle} size="small" title={t('Ligne {{value}}', { value: index + 1 })}>
                  <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                    <div>
                      <label htmlFor={`reception-article-${index}`}>{t('Article')}</label>
                      <Select
                        id={`reception-article-${index}`}
                        style={{ width: '100%' }}
                        placeholder={t('Choisir un article')}
                        showSearch
                        optionFilterProp="label"
                        value={ligne.itemId}
                        onChange={(valeur: string) => modifierLigne(ligne.cle, { itemId: valeur })}
                        options={optionsArticles}
                        notFoundContent={t('Aucun article disponible')}
                      />
                    </div>
                    <div>
                      <label htmlFor={`reception-quantite-${index}`}>{t('Quantité reçue')}</label>
                      <StockQuantityInput
                        id={`reception-quantite-${index}`}
                        min={0.0001}
                        unit={contexte.items.find(a => a.id === ligne.itemId)?.unit}
                        value={ligne.quantity}
                        onChange={valeur => modifierLigne(ligne.cle, { quantity: valeur })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`reception-ligne-facture-${index}`}>{t('Ligne de la facture')}</label>
                      <Select
                        id={`reception-ligne-facture-${index}`}
                        style={{ width: '100%' }}
                        disabled={!facture}
                        value={ligne.invoiceLineId ?? ''}
                        onChange={(valeur: string) => choisirLigneFacture(ligne.cle, valeur || undefined)}
                        options={[
                          { value: '', label: t('— Aucune —') },
                          ...lignesFacture.map(l => ({ value: l.id, label: l.label }))
                        ]}
                      />
                    </div>
                    {valeursVisibles ? (
                      <div>
                        <label htmlFor={`reception-prix-${index}`}>{t('Prix unitaire (facultatif)')}</label>
                        <InputNumber
                          id={`reception-prix-${index}`}
                          style={{ width: '100%' }}
                          min={0}
                          step={100}
                          value={ligne.unitCost ?? undefined}
                          onChange={valeur =>
                            modifierLigne(ligne.cle, {
                              unitCost: typeof valeur === 'number' ? valeur : null,
                              prixSaisi: true
                            })
                          }
                          {...montantSaisiProps}
                        />
                        <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                          {prixRepris
                            ? t('Prix repris de la facture.')
                            : t(
                                'Laissé vide, le prix est repris de la ligne de facture, sinon du coût moyen du lieu, sinon du dernier prix reçu.'
                              )}
                        </Text>
                      </div>
                    ) : null}
                    {lignes.length > 1 ? (
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setLignes(precedentes => precedentes.filter(l => l.cle !== ligne.cle))}
                        aria-label={t('Retirer la ligne {{value}}', { value: index + 1 })}
                      >
                        {t('Retirer cette ligne')}
                      </Button>
                    ) : null}
                  </Space>
                </Card>
              );
            })}
            {lignes.length < 50 ? (
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  setLignes(precedentes => [...precedentes, ligneReceptionVide(prochaineCle)]);
                  setProchaineCle(prochaineCle + 1);
                }}
              >
                {t('Ajouter une ligne')}
              </Button>
            ) : null}
            {!valeursVisibles ? (
              <Text type="secondary">
                {t('Le prix est repris de la facture, ou à défaut du coût moyen du lieu. Vous n’avez rien à saisir.')}
              </Text>
            ) : null}

            {coupure ? <AlerteCoupure onRetry={() => void envoyer()} loading={envoiEnCours} /> : null}
            {erreur ? <Alert type="error" showIcon message={erreur} /> : null}
          </>
        )}

        {/* Les photos restent montées d'un écran à l'autre : prises avant
            l'enregistrement, elles partent dès que le bon existe. La clé est
            indispensable : `Space` aplatit le fragment du formulaire et place
            chaque enfant sur une clé d'index ; sans elle, le passage au succès
            décale cet index, remonte le bloc et vide sa file (rec040-03). */}
        <div key="photos-avant-enregistrement">
          <Text strong>{t('Photos (facultatif)')}</Text>
          <StockPhotoCapture
            tenantId={tenantId}
            target={slip ? { type: 'SLIP', id: slip.id } : undefined}
            purposes={['DELIVERY_NOTE', 'GOODS_PHOTO']}
          />
        </div>
        {slip ? (
          <div>
            <Text strong>{t('Photographier le bon signé')}</Text>
            <StockPhotoCapture tenantId={tenantId} target={{ type: 'SLIP', id: slip.id }} purposes={['SIGNED_SLIP']} />
          </div>
        ) : null}
      </Space>
    </Modal>
  );
}

function ConfirmationReception(props: {
  tenantId: string;
  resultat: StockWrite<StockReceiptResult>;
  valeursVisibles: boolean;
}): React.ReactElement {
  const { tenantId, resultat, valeursVisibles } = props;
  const { slip, movements, controls } = resultat.data;
  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Title level={4} style={{ margin: 0 }}>
        {resultat.replayed
          ? t('Réception déjà enregistrée — {{numero}}', { numero: slip.number })
          : t('Réception enregistrée — {{numero}}', { numero: slip.number })}
      </Title>
      {resultat.replayed ? <Text>{t('Cette opération était déjà enregistrée : voici son bon.')}</Text> : null}
      {controls.map(controle => (
        <Alert
          key={`${controle.code}-${controle.alertId}`}
          type={controle.severity === 'WARNING' ? 'warning' : 'info'}
          showIcon
          message={controle.message}
          description={
            valeursVisibles && (controle.amount !== null || controle.threshold !== null) ? (
              <Space size="middle" wrap>
                {controle.amount !== null ? (
                  <span>
                    {t('Reçu :')} <MoneyValue value={controle.amount} />
                  </span>
                ) : null}
                {controle.threshold !== null ? (
                  <span>
                    {t('Facture :')} <MoneyValue value={controle.threshold} />
                  </span>
                ) : null}
              </Space>
            ) : undefined
          }
        />
      ))}
      <LignesDuBon mouvements={movements} valeursVisibles={valeursVisibles} montrerSource />
      <Space wrap>
        <StockSlipPdfButton tenantId={tenantId} slipId={slip.id} number={slip.number} />
      </Space>
    </Space>
  );
}

/** Les lignes d'un bon tout juste enregistré : article, quantité, reste après, valeurs si visibles. */
function LignesDuBon(props: {
  mouvements: StockMovementView[];
  valeursVisibles: boolean;
  montrerSource?: boolean;
}): React.ReactElement {
  const { mouvements, valeursVisibles, montrerSource } = props;
  return (
    <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }} aria-label={t('Lignes du bon')}>
      {mouvements.map(m => (
        <li key={m.id}>
          <strong>{m.itemLabel}</strong> — {quantite(m.quantity, m.itemUnit)}
          {' · '}
          {t('Reste après :')} {m.quantityAfter === null ? MASQUE_COMPTAGE() : quantite(m.quantityAfter, m.itemUnit)}
          {valeursVisibles && m.totalValue !== null ? (
            <>
              {' · '}
              <MoneyValue value={m.totalValue} />
            </>
          ) : null}
          {valeursVisibles && montrerSource && m.valuationSource ? (
            <>
              {' · '}
              <Text type="secondary">{STOCK_VALUATION_SOURCE_LABELS[m.valuationSource]}</Text>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Fenêtre « Enregistrer une sortie » (B2, B3-R3, A10 — ecrans §5.4)
// ---------------------------------------------------------------------------

interface LigneSortie {
  cle: number;
  itemId: string | undefined;
  quantity: number | null;
  costCategoryId: string | undefined;
  /** Vrai tant que le poste affiché vient de la PROPOSITION de l'article. */
  postePropose: boolean;
}

function ligneSortieVide(cle: number): LigneSortie {
  return { cle, itemId: undefined, quantity: null, costCategoryId: undefined, postePropose: false };
}

/** Le dernier lieu de sortie utilisé dans cette page (ecrans §6.2). */
let dernierLieuDeSortie: string | undefined;

/** Les soldes d'un lieu, pour montrer le stock disponible sous chaque ligne. */
function useSoldesDuLieu(tenantId: string, lieu: string | undefined) {
  return useQuery({
    queryKey: queryKey('stock-balances', tenantId, { locationId: lieu }),
    queryFn: () => listStockBalances(tenantId, { locationId: lieu }),
    enabled: Boolean(lieu),
    staleTime: STALE_TIME.list
  });
}

function StockDisponible(props: {
  aveugle: boolean;
  solde: StockBalanceView | null;
  unite: string;
  demande: number | null;
}): React.ReactElement {
  const { aveugle, solde, unite, demande } = props;
  if (aveugle || (solde && solde.quantity === null)) {
    return (
      <Text type="secondary">
        {t(
          'Lieu en cours de comptage : la quantité disponible n’est pas affichée. Le serveur refusera une sortie qui dépasse le stock.'
        )}
      </Text>
    );
  }
  const disponible = solde?.quantity ?? 0;
  const auDela = demande !== null && demande > disponible;
  return (
    <>
      <Text type={auDela ? 'danger' : 'secondary'}>
        {t('Stock disponible dans ce lieu :')} <strong>{quantite(disponible, unite)}</strong>
      </Text>
      {auDela ? (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Alert
            type="warning"
            showIcon
            message={t('Cette sortie dépasse le stock disponible, et sera refusée')}
            description={t(
              "Un stock négatif n'aurait pas de coût moyen qui veuille dire quelque chose, et toute la valorisation qui suit deviendrait fausse. Si la marchandise est bien partie, le geste juste est un inventaire, pas une sortie à découvert."
            )}
          />
        </div>
      ) : null}
    </>
  );
}

function FenetreSortie(props: {
  tenantId: string;
  contexte: StockFieldContext;
  onClose: () => void;
  onNouvelle: () => void;
}): React.ReactElement {
  const { tenantId, contexte, onClose, onNouvelle } = props;
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const valeursVisibles = contexte.abilities.valuesVisible;
  const [clientRequestId, renouvelerIdentifiant] = useIdentifiantDeRequete();

  const [chantier, setChantier] = useState<string | undefined>(undefined);
  const [lieu, setLieu] = useState<string | undefined>(dernierLieuDeSortie);
  const [lieuChoisiALaMain, setLieuChoisiALaMain] = useState(false);
  const [preneur, setPreneur] = useState<RequesterFields>({});
  const [lignes, setLignes] = useState<LigneSortie[]>([ligneSortieVide(0)]);
  const [prochaineCle, setProchaineCle] = useState(1);
  const [dateSortie, setDateSortie] = useState<Dayjs | null>(dayjs());
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [coupure, setCoupure] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [erreurPreneur, setErreurPreneur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<StockWrite<StockSlipResult> | null>(null);

  const soldes = useSoldesDuLieu(tenantId, lieu);
  const aveugle = Boolean(lieu) && lieuxAveugles(soldes.data?.meta, contexte).has(lieu as string);

  const optionsChantiers = contexte.sites
    .filter(s => !s.closed)
    .map(s => ({ value: s.id, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const optionsLieux = contexte.locations
    .filter(l => l.isActive)
    .map(l => ({ value: l.id, label: l.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const optionsArticles = contexte.items
    .map(a => ({ value: a.id, label: `${a.reference} — ${a.label}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const optionsPostes = contexte.costCategories
    .map(p => ({ value: p.id, label: p.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const choisirChantier = (valeur: string) => {
    setChantier(valeur);
    const site = contexte.sites.find(s => s.id === valeur);
    if (!lieuChoisiALaMain && site?.locationId && optionsLieux.some(o => o.value === site.locationId)) {
      setLieu(site.locationId);
    }
  };

  const modifierLigne = (cle: number, champs: Partial<LigneSortie>) => {
    setLignes(precedentes => precedentes.map(l => (l.cle === cle ? { ...l, ...champs } : l)));
  };

  /** L'article pré-sélectionne le poste qu'il propose ; un poste choisi à la main n'est pas écrasé. */
  const choisirArticle = (ligne: LigneSortie, itemId: string) => {
    const article = contexte.items.find(a => a.id === itemId);
    const champs: Partial<LigneSortie> = { itemId };
    if (article?.defaultCostCategoryId && (!ligne.costCategoryId || ligne.postePropose)) {
      champs.costCategoryId = article.defaultCostCategoryId;
      champs.postePropose = true;
    } else if (!article?.defaultCostCategoryId && ligne.postePropose) {
      champs.costCategoryId = undefined;
      champs.postePropose = false;
    }
    modifierLigne(ligne.cle, champs);
  };

  const doublons = new Set<number>();
  lignes.forEach((ligne, index) => {
    if (!ligne.itemId || !ligne.costCategoryId) return;
    const premiere = lignes.findIndex(l => l.itemId === ligne.itemId && l.costCategoryId === ligne.costCategoryId);
    if (premiere !== index) doublons.add(ligne.cle);
  });

  const preneurRenseigne = Boolean(preneur.takerId) || Boolean((preneur.requestedBy ?? '').trim());
  const lignesCompletes = lignes.every(
    l => Boolean(l.itemId) && l.quantity !== null && l.quantity > 0 && Boolean(l.costCategoryId)
  );
  const peutEnvoyer =
    Boolean(chantier) &&
    Boolean(lieu) &&
    preneurRenseigne &&
    lignesCompletes &&
    doublons.size === 0 &&
    dateSortie !== null;

  const envoyer = async () => {
    if (!peutEnvoyer) return;
    setEnvoiEnCours(true);
    setErreur(null);
    setErreurDate(null);
    setErreurPreneur(null);
    try {
      // AUCUN MONTANT dans ce corps, sous aucun nom (P-4) : le serveur valorise.
      const ecrit = await recordStockIssue(tenantId, {
        locationId: lieu as string,
        siteId: chantier as string,
        issueDate: (dateSortie as Dayjs).format('YYYY-MM-DD'),
        lines: lignes.map(l => ({
          itemId: l.itemId as string,
          quantity: l.quantity as number,
          costCategoryId: l.costCategoryId as string
        })),
        ...(preneur.takerId ? { takerId: preneur.takerId } : { requestedBy: preneur.requestedBy ?? '' }),
        clientRequestId
      });
      dernierLieuDeSortie = lieu;
      setCoupure(false);
      setResultat(ecrit);
      renouvelerIdentifiant();
      message.success(
        ecrit.replayed
          ? t('Cette opération était déjà enregistrée : voici son bon.')
          : t('Sortie enregistrée : bon {{numero}}.', { numero: ecrit.data.slip.number })
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-movements', tenantId) })
      ]);
    } catch (err) {
      const lue = lireErreur(err);
      if (lue.reseau) {
        setCoupure(true);
        return;
      }
      setCoupure(false);
      // 5xx, 408, 429 : l'API a pu valider. Même identifiant au prochain essai.
      if (!reponseIncertaine(lue)) renouvelerIdentifiant();
      const texte = lue.message || t("La sortie n'a pas pu être enregistrée.");
      if (lue.code === 'STOCK_IDEMPOTENCY_MISMATCH') {
        setErreur(
          t("Cette opération a déjà été envoyée avec d'autres données. Vérifiez le journal avant de recommencer.")
        );
      } else if (lue.code && CODES_DATE.has(lue.code)) {
        setErreurDate(texte);
      } else if (lue.code && CODES_PRENEUR.has(lue.code)) {
        setErreurPreneur(texte);
      } else {
        // « Stock insuffisant », « chantier clos » : relayés tels quels.
        setErreur(texte);
        if (lue.code === 'STOCK_SITE_CLOSED') {
          await queryClient.invalidateQueries({ queryKey: entityKeyPrefix(STOCK_FIELD_CONTEXT_ENTITY, tenantId) });
        }
      }
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const slip = resultat?.data.slip ?? null;
  const footer = resultat
    ? [
        <Button key="nouvelle" onClick={onNouvelle}>
          {t('Nouvelle sortie')}
        </Button>,
        <Button key="fermer" type="primary" onClick={onClose}>
          {t('Fermer')}
        </Button>
      ]
    : [
        <Button key="annuler" onClick={onClose} disabled={envoiEnCours}>
          {t('Annuler')}
        </Button>,
        <Button key="envoyer" type="primary" disabled={!peutEnvoyer} loading={envoiEnCours} onClick={envoyer}>
          {t('Enregistrer la sortie')}
        </Button>
      ];

  return (
    <Modal
      title={t('Enregistrer une sortie vers un chantier')}
      open
      onCancel={() => {
        if (!envoiEnCours) onClose();
      }}
      footer={footer}
      width={820}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {resultat && slip ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Title level={4} style={{ margin: 0 }}>
              {resultat.replayed
                ? t('Sortie déjà enregistrée — {{numero}}', { numero: slip.number })
                : t('Sortie enregistrée — {{numero}}', { numero: slip.number })}
            </Title>
            {resultat.replayed ? <Text>{t('Cette opération était déjà enregistrée : voici son bon.')}</Text> : null}
            <LignesDuBon mouvements={resultat.data.movements} valeursVisibles={valeursVisibles} />
            <StockSlipPdfButton tenantId={tenantId} slipId={slip.id} number={slip.number} />
            <Text>{t('Faites signer le bon par le preneur, puis photographiez-le.')}</Text>
            <div>
              <Text strong>{t('Photographier le bon signé par le preneur')}</Text>
              <StockPhotoCapture
                tenantId={tenantId}
                target={{ type: 'SLIP', id: slip.id }}
                purposes={['SIGNED_SLIP']}
              />
            </div>
          </Space>
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              message={t("C'est ce geste qui impute le chantier")}
              description={t(
                "La sortie fait entrer le matériau dans le coût réel du chantier, au coût moyen du lieu avant la sortie. La livraison, elle, n'y avait rien changé."
              )}
            />

            <div>
              <label htmlFor="sortie-chantier">{t('Chantier')}</label>
              <Select
                id="sortie-chantier"
                style={{ width: '100%' }}
                placeholder={t('Choisir un chantier')}
                showSearch
                optionFilterProp="label"
                value={chantier}
                onChange={choisirChantier}
                options={optionsChantiers}
                notFoundContent={t('Aucun chantier disponible')}
              />
              <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                {t("Un chantier clos n'accepte plus de sortie : il n'est pas proposé.")}
              </Text>
            </div>

            <div>
              <label htmlFor="sortie-lieu">{t('Lieu de sortie')}</label>
              <Select
                id="sortie-lieu"
                style={{ width: '100%' }}
                placeholder={t('Choisir un lieu')}
                showSearch
                optionFilterProp="label"
                value={lieu}
                onChange={(valeur: string) => {
                  setLieu(valeur);
                  setLieuChoisiALaMain(true);
                }}
                options={optionsLieux}
                notFoundContent={t('Aucun lieu de stockage disponible')}
              />
            </div>

            <div>
              <Text strong>{t('Qui emporte la marchandise ?')}</Text>
              <StockTakerSelect
                tenantId={tenantId}
                value={preneur}
                onChange={valeur => {
                  setPreneur(valeur);
                  setErreurPreneur(null);
                }}
                takers={contexte.takers}
                requireTaker={contexte.settings.requireTaker}
                canManageTakers={contexte.abilities.canManageTakers}
                people={contexte.people}
                error={erreurPreneur}
              />
              <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                {t(
                  'Le preneur est la personne à qui la marchandise est remise. Son nom est imprimé sur le bon de sortie, qu’il signe.'
                )}
              </Text>
            </div>

            <Text strong>{t('Articles sortis')}</Text>
            {lignes.map((ligne, index) => {
              const article = contexte.items.find(a => a.id === ligne.itemId);
              const solde =
                (soldes.data?.data ?? []).find(s => s.itemId === ligne.itemId && s.locationId === lieu) ?? null;
              const apercu =
                valeursVisibles &&
                !aveugle &&
                solde?.averageUnitCost !== null &&
                solde?.averageUnitCost !== undefined &&
                ligne.quantity !== null &&
                ligne.quantity > 0
                  ? Math.round(solde.averageUnitCost * ligne.quantity)
                  : null;
              const posteArticle = article?.defaultCostCategoryId
                ? contexte.costCategories.find(p => p.id === article.defaultCostCategoryId)?.label
                : null;
              return (
                <Card key={ligne.cle} size="small" title={t('Ligne {{value}}', { value: index + 1 })}>
                  <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                    <div>
                      <label htmlFor={`sortie-article-${index}`}>{t('Article')}</label>
                      <Select
                        id={`sortie-article-${index}`}
                        style={{ width: '100%' }}
                        placeholder={t('Choisir un article')}
                        showSearch
                        optionFilterProp="label"
                        value={ligne.itemId}
                        onChange={(valeur: string) => choisirArticle(ligne, valeur)}
                        options={optionsArticles}
                        notFoundContent={t('Aucun article disponible')}
                      />
                    </div>
                    <div>
                      <label htmlFor={`sortie-quantite-${index}`}>{t('Quantité')}</label>
                      <StockQuantityInput
                        id={`sortie-quantite-${index}`}
                        min={0.0001}
                        unit={article?.unit}
                        value={ligne.quantity}
                        onChange={valeur => modifierLigne(ligne.cle, { quantity: valeur })}
                      />
                      <div>
                        {ligne.itemId && lieu ? (
                          <StockDisponible
                            aveugle={aveugle}
                            solde={solde}
                            unite={article?.unit ?? solde?.itemUnit ?? ''}
                            demande={ligne.quantity}
                          />
                        ) : (
                          <Text type="secondary">
                            {t(
                              'Choisissez un lieu et un article pour voir le stock disponible avant de saisir la quantité.'
                            )}
                          </Text>
                        )}
                      </div>
                    </div>
                    {apercu !== null && solde?.averageUnitCost !== null && solde ? (
                      <Alert
                        type="info"
                        message={t(
                          'Aperçu : cette ligne vaudrait environ {{value}}, au coût moyen actuel de {{value2}} par {{itemUnit}}.',
                          {
                            value: formatMoney(apercu),
                            value2: formatMoney(solde.averageUnitCost),
                            itemUnit: solde.itemUnit
                          }
                        )}
                        description={t(
                          "Aperçu indicatif seulement. Aucun prix n'est saisi ni envoyé : le serveur valorise la sortie au coût moyen du lieu à l'instant de l'écriture."
                        )}
                      />
                    ) : null}
                    <div>
                      <label htmlFor={`sortie-poste-${index}`}>{t('Poste de dépense')}</label>
                      <Select
                        id={`sortie-poste-${index}`}
                        style={{ width: '100%' }}
                        placeholder={t('Choisir un poste')}
                        showSearch
                        optionFilterProp="label"
                        value={ligne.costCategoryId}
                        onChange={(valeur: string) =>
                          modifierLigne(ligne.cle, { costCategoryId: valeur, postePropose: false })
                        }
                        options={optionsPostes}
                        notFoundContent={t('Aucun poste disponible')}
                      />
                      <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                        {ligne.postePropose && posteArticle
                          ? t(
                              '« {{poste}} » est le poste proposé par cet article : une proposition seulement, libre d’être changée.',
                              { poste: posteArticle }
                            )
                          : article && !article.defaultCostCategoryId
                            ? t(
                                "Cet article ne propose aucun poste, et c'est un cas normal : choisissez celui de cette sortie."
                              )
                            : t('Le poste de dépense est obligatoire, et jamais deviné.')}
                      </Text>
                    </div>
                    {doublons.has(ligne.cle) ? (
                      <Text type="danger" role="alert">
                        {t('Cet article est déjà dans la sortie : modifiez sa quantité.')}
                      </Text>
                    ) : null}
                    {lignes.length > 1 ? (
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => setLignes(precedentes => precedentes.filter(l => l.cle !== ligne.cle))}
                        aria-label={t('Retirer la ligne {{value}}', { value: index + 1 })}
                      >
                        {t('Retirer cette ligne')}
                      </Button>
                    ) : null}
                  </Space>
                </Card>
              );
            })}
            {lignes.length < 50 ? (
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  setLignes(precedentes => [...precedentes, ligneSortieVide(prochaineCle)]);
                  setProchaineCle(prochaineCle + 1);
                }}
              >
                {t('Ajouter un article')}
              </Button>
            ) : null}

            <ChampDate
              id="sortie-date"
              label={t('Date de sortie')}
              value={dateSortie}
              onChange={setDateSortie}
              limiteJours={contexte.settings.backdatingLimitDays}
              erreur={erreurDate}
            />

            <Text type="secondary">
              {t(
                "Ce formulaire ne demande aucun prix, et c'est voulu : la valeur d'une sortie se déduit du coût moyen du lieu au moment où elle est enregistrée."
              )}
            </Text>

            {coupure ? <AlerteCoupure onRetry={() => void envoyer()} loading={envoiEnCours} /> : null}
            {erreur ? <Alert type="error" showIcon message={erreur} /> : null}
          </>
        )}
        {/* Clé stable : voir la fenêtre de réception (rec040-03). */}
        <div key="photos-avant-enregistrement">
          <Text strong>{t('Photo de la marchandise (facultatif)')}</Text>
          <StockPhotoCapture
            tenantId={tenantId}
            target={slip ? { type: 'SLIP', id: slip.id } : undefined}
            purposes={['GOODS_PHOTO']}
          />
        </div>
      </Space>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Fenêtres « Rebut » et « Retour au fournisseur » (A6 — ecrans §5.5)
// ---------------------------------------------------------------------------

const MOTIF_VIDE: StockReasonValue = { reasonCode: null, reason: '' };

function FenetreRebut(props: {
  tenantId: string;
  contexte: StockFieldContext;
  onClose: () => void;
}): React.ReactElement {
  const { tenantId, contexte, onClose } = props;
  const queryClient = useQueryClient();
  const valeursVisibles = contexte.abilities.valuesVisible;
  const [clientRequestId, renouvelerIdentifiant] = useIdentifiantDeRequete();
  const [lieu, setLieu] = useState<string | undefined>(undefined);
  const [article, setArticle] = useState<string | undefined>(undefined);
  const [quantiteSaisie, setQuantiteSaisie] = useState<number | null>(null);
  const [motif, setMotif] = useState<StockReasonValue>(MOTIF_VIDE);
  const [dateRebut, setDateRebut] = useState<Dayjs | null>(dayjs());
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [coupure, setCoupure] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [erreurMotif, setErreurMotif] = useState<string | null>(null);
  const [resultat, setResultat] = useState<StockWrite<StockMovementView> | null>(null);

  const soldes = useSoldesDuLieu(tenantId, lieu);
  const aveugle = Boolean(lieu) && lieuxAveugles(soldes.data?.meta, contexte).has(lieu as string);
  const solde = (soldes.data?.data ?? []).find(s => s.itemId === article && s.locationId === lieu) ?? null;
  const articleChoisi = contexte.items.find(a => a.id === article);

  const peutEnvoyer =
    Boolean(lieu) &&
    Boolean(article) &&
    quantiteSaisie !== null &&
    quantiteSaisie > 0 &&
    isStockReasonComplete(motif) &&
    dateRebut !== null;

  const envoyer = async () => {
    if (!peutEnvoyer) return;
    setEnvoiEnCours(true);
    setErreur(null);
    setErreurDate(null);
    setErreurMotif(null);
    try {
      const ecrit = await recordStockScrap(tenantId, {
        locationId: lieu as string,
        itemId: article as string,
        quantity: quantiteSaisie as number,
        scrapDate: (dateRebut as Dayjs).format('YYYY-MM-DD'),
        reasonCode: motif.reasonCode as NonNullable<StockReasonValue['reasonCode']>,
        reason: motif.reason,
        clientRequestId
      });
      setCoupure(false);
      setResultat(ecrit);
      renouvelerIdentifiant();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-movements', tenantId) })
      ]);
    } catch (err) {
      const lue = lireErreur(err);
      if (lue.reseau) {
        setCoupure(true);
        return;
      }
      setCoupure(false);
      // 5xx, 408, 429 : l'API a pu valider. Même identifiant au prochain essai.
      if (!reponseIncertaine(lue)) renouvelerIdentifiant();
      const texte = lue.message || t("Le rebut n'a pas pu être enregistré.");
      if (lue.code === 'STOCK_IDEMPOTENCY_MISMATCH') {
        setErreur(
          t("Cette opération a déjà été envoyée avec d'autres données. Vérifiez le journal avant de recommencer.")
        );
      } else if (lue.code && CODES_DATE.has(lue.code)) setErreurDate(texte);
      else if (lue.code && CODES_MOTIF.has(lue.code)) setErreurMotif(texte);
      else setErreur(texte);
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const mouvement = resultat?.data ?? null;
  return (
    <Modal
      title={t('Enregistrer un rebut')}
      open
      onCancel={() => {
        if (!envoiEnCours) onClose();
      }}
      footer={
        mouvement
          ? [
              <Button key="fermer" type="primary" onClick={onClose}>
                {t('Fermer')}
              </Button>
            ]
          : [
              <Button key="annuler" onClick={onClose} disabled={envoiEnCours}>
                {t('Annuler')}
              </Button>,
              <Button key="envoyer" type="primary" disabled={!peutEnvoyer} loading={envoiEnCours} onClick={envoyer}>
                {t('Enregistrer le rebut')}
              </Button>
            ]
      }
      width={720}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {mouvement ? (
          <Alert
            type="success"
            showIcon
            message={
              resultat?.replayed
                ? t('Cette opération était déjà enregistrée : voici son bon.')
                : valeursVisibles && mouvement.totalValue !== null
                  ? t('Rebut enregistré : {{quantite}} de {{article}} pour {{valeur}}.', {
                      quantite: quantite(mouvement.quantity, mouvement.itemUnit),
                      article: mouvement.itemLabel,
                      valeur: formatMoney(mouvement.totalValue)
                    })
                  : t('Rebut enregistré : {{quantite}} de {{article}}.', {
                      quantite: quantite(mouvement.quantity, mouvement.itemUnit),
                      article: mouvement.itemLabel
                    })
            }
          />
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              message={t(
                'Un rebut retire du stock une matière détruite ou inutilisable. Il n’est imputé à aucun chantier.'
              )}
            />
            <div>
              <label htmlFor="rebut-lieu">{t('Lieu')}</label>
              <Select
                id="rebut-lieu"
                style={{ width: '100%' }}
                placeholder={t('Choisir un lieu')}
                showSearch
                optionFilterProp="label"
                value={lieu}
                onChange={(valeur: string) => setLieu(valeur)}
                options={contexte.locations.filter(l => l.isActive).map(l => ({ value: l.id, label: l.label }))}
              />
            </div>
            <div>
              <label htmlFor="rebut-article">{t('Article')}</label>
              <Select
                id="rebut-article"
                style={{ width: '100%' }}
                placeholder={t('Choisir un article')}
                showSearch
                optionFilterProp="label"
                value={article}
                onChange={(valeur: string) => setArticle(valeur)}
                options={contexte.items.map(a => ({ value: a.id, label: `${a.reference} — ${a.label}` }))}
              />
            </div>
            <div>
              <label htmlFor="rebut-quantite">{t('Quantité')}</label>
              <StockQuantityInput
                id="rebut-quantite"
                min={0.0001}
                unit={articleChoisi?.unit}
                value={quantiteSaisie}
                onChange={setQuantiteSaisie}
              />
              {lieu && article ? (
                <StockDisponible
                  aveugle={aveugle}
                  solde={solde}
                  unite={articleChoisi?.unit ?? ''}
                  demande={quantiteSaisie}
                />
              ) : null}
            </div>
            <div>
              <Text strong>{t('Motif')}</Text>
              <StockReasonPicker codes={contexte.reasonCodes.scrap} value={motif} onChange={setMotif} />
              {erreurMotif ? (
                <Text type="danger" role="alert">
                  {erreurMotif}
                </Text>
              ) : null}
            </div>
            <ChampDate
              id="rebut-date"
              label={t('Date du rebut')}
              value={dateRebut}
              onChange={setDateRebut}
              limiteJours={contexte.settings.backdatingLimitDays}
              erreur={erreurDate}
            />
            {coupure ? <AlerteCoupure onRetry={() => void envoyer()} loading={envoiEnCours} /> : null}
            {erreur ? <Alert type="error" showIcon message={erreur} /> : null}
          </>
        )}
        {/* Clé stable : la photo choisie avant l'enregistrement part sur le
            mouvement créé au lieu d'être perdue au remontage (rec040-03). */}
        <div key="photos-avant-enregistrement">
          <Text strong>{t('Photo de la marchandise (facultatif)')}</Text>
          <StockPhotoCapture
            tenantId={tenantId}
            target={mouvement ? { type: 'MOVEMENT', id: mouvement.id } : undefined}
            purposes={['GOODS_PHOTO']}
          />
        </div>
      </Space>
    </Modal>
  );
}

function FenetreRetour(props: {
  tenantId: string;
  contexte: StockFieldContext;
  onClose: () => void;
}): React.ReactElement {
  const { tenantId, contexte, onClose } = props;
  const queryClient = useQueryClient();
  const valeursVisibles = contexte.abilities.valuesVisible;
  const [clientRequestId, renouvelerIdentifiant] = useIdentifiantDeRequete();
  const [facture, setFacture] = useState<StockReceivableInvoice | null>(null);
  const [article, setArticle] = useState<string | undefined>(undefined);
  const [ligneFacture, setLigneFacture] = useState<string | undefined>(undefined);
  const [lieu, setLieu] = useState<string | undefined>(undefined);
  const [quantiteSaisie, setQuantiteSaisie] = useState<number | null>(null);
  const [motif, setMotif] = useState<StockReasonValue>(MOTIF_VIDE);
  const [dateRetour, setDateRetour] = useState<Dayjs | null>(dayjs());
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [coupure, setCoupure] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurDate, setErreurDate] = useState<string | null>(null);
  const [erreurMotif, setErreurMotif] = useState<string | null>(null);
  const [erreurLigne, setErreurLigne] = useState<string | null>(null);
  const [resultat, setResultat] = useState<StockWrite<StockMovementView> | null>(null);

  const receptions = useQuery({
    queryKey: queryKey('stock-invoice-receipts', tenantId, { invoiceId: facture?.id }),
    queryFn: () => getInvoiceReceipts(tenantId, facture?.id as string),
    enabled: Boolean(facture),
    staleTime: STALE_TIME.list
  });
  const vue = receptions.data?.data;
  const cumul = vue?.byItem.find(b => b.itemId === article) ?? null;
  const lignesValorisables = (vue?.invoice.lines ?? []).filter(l => l.hasUnitPrice);
  const ligneExigee = Boolean(cumul?.returnNeedsInvoiceLine);

  const peutEnvoyer =
    Boolean(facture) &&
    Boolean(article) &&
    Boolean(lieu) &&
    quantiteSaisie !== null &&
    quantiteSaisie > 0 &&
    (!ligneExigee || Boolean(ligneFacture)) &&
    isStockReasonComplete(motif) &&
    dateRetour !== null;

  const envoyer = async () => {
    if (!peutEnvoyer || !facture) return;
    setEnvoiEnCours(true);
    setErreur(null);
    setErreurDate(null);
    setErreurMotif(null);
    setErreurLigne(null);
    try {
      const ecrit = await recordSupplierReturn(tenantId, {
        locationId: lieu as string,
        supplierInvoiceId: facture.id,
        ...(ligneFacture ? { supplierInvoiceLineId: ligneFacture } : {}),
        itemId: article as string,
        quantity: quantiteSaisie as number,
        returnDate: (dateRetour as Dayjs).format('YYYY-MM-DD'),
        reasonCode: motif.reasonCode as NonNullable<StockReasonValue['reasonCode']>,
        reason: motif.reason,
        clientRequestId
      });
      setCoupure(false);
      setResultat(ecrit);
      renouvelerIdentifiant();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-balances', tenantId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-movements', tenantId) }),
        queryClient.invalidateQueries({ queryKey: entityKeyPrefix('stock-invoice-receipts', tenantId) })
      ]);
    } catch (err) {
      const lue = lireErreur(err);
      if (lue.reseau) {
        setCoupure(true);
        return;
      }
      setCoupure(false);
      // 5xx, 408, 429 : l'API a pu valider. Même identifiant au prochain essai.
      if (!reponseIncertaine(lue)) renouvelerIdentifiant();
      const texte = lue.message || t("Le retour n'a pas pu être enregistré.");
      if (lue.code === 'STOCK_IDEMPOTENCY_MISMATCH') {
        setErreur(
          t("Cette opération a déjà été envoyée avec d'autres données. Vérifiez le journal avant de recommencer.")
        );
      } else if (lue.code === 'STOCK_RETURN_UNVALUED') setErreurLigne(texte);
      else if (lue.code && CODES_DATE.has(lue.code)) setErreurDate(texte);
      else if (lue.code && CODES_MOTIF.has(lue.code)) setErreurMotif(texte);
      else setErreur(texte);
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const mouvement = resultat?.data ?? null;
  return (
    <Modal
      title={t('Retourner une marchandise au fournisseur')}
      open
      onCancel={() => {
        if (!envoiEnCours) onClose();
      }}
      footer={
        mouvement
          ? [
              <Button key="fermer" type="primary" onClick={onClose}>
                {t('Fermer')}
              </Button>
            ]
          : [
              <Button key="annuler" onClick={onClose} disabled={envoiEnCours}>
                {t('Annuler')}
              </Button>,
              <Button key="envoyer" type="primary" disabled={!peutEnvoyer} loading={envoiEnCours} onClick={envoyer}>
                {t('Enregistrer le retour')}
              </Button>
            ]
      }
      width={760}
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {mouvement ? (
          <Alert
            type="success"
            showIcon
            message={
              resultat?.replayed
                ? t('Cette opération était déjà enregistrée : voici son bon.')
                : t('Retour enregistré : {{quantite}} de {{article}}.', {
                    quantite: quantite(mouvement.quantity, mouvement.itemUnit),
                    article: mouvement.itemLabel
                  })
            }
          />
        ) : (
          <>
            <Alert
              type="info"
              showIcon
              message={t(
                'Le retour diminue le stock et le solde dû au fournisseur. Il ne modifie pas le reste à payer affiché sur la facture : rapprochez l’avoir du fournisseur.'
              )}
            />
            <ChoixFacture
              tenantId={tenantId}
              id="retour-facture"
              factures={contexte.receivableInvoices}
              valeursVisibles={valeursVisibles}
              value={facture?.id}
              onChange={choisie => {
                setFacture(choisie);
                setArticle(undefined);
                setLigneFacture(undefined);
              }}
            />
            {facture && receptions.isPending ? (
              <Text type="secondary">{t('Lecture des réceptions de la facture…')}</Text>
            ) : null}
            {receptions.error ? (
              <Text type="secondary">{t('Les réceptions de cette facture n’ont pas pu être lues.')}</Text>
            ) : null}
            <div>
              <label htmlFor="retour-article">{t('Article')}</label>
              <Select
                id="retour-article"
                style={{ width: '100%' }}
                placeholder={t('Choisir un article reçu sur cette facture')}
                disabled={!vue}
                value={article}
                onChange={(valeur: string) => setArticle(valeur)}
                options={(vue?.byItem ?? []).map(b => ({ value: b.itemId, label: b.itemLabel }))}
                notFoundContent={t('Aucun article n’a été reçu sur cette facture')}
              />
              {cumul ? (
                <Text type="secondary">
                  {t(
                    'Reçu sur cette facture : {{recu}} · déjà retourné : {{retourne}} · retournable : {{retournable}}',
                    {
                      recu: quantite(cumul.receivedQuantity, cumul.itemUnit),
                      retourne: quantite(cumul.returnedQuantity, cumul.itemUnit),
                      retournable: quantite(cumul.returnableQuantity, cumul.itemUnit)
                    }
                  )}
                </Text>
              ) : null}
            </div>
            <div>
              <label htmlFor="retour-ligne-facture">
                {ligneExigee ? t('Ligne de la facture') : t('Ligne de la facture (facultatif)')}
              </label>
              <Select
                id="retour-ligne-facture"
                style={{ width: '100%' }}
                disabled={!vue}
                allowClear
                status={erreurLigne ? 'error' : undefined}
                placeholder={t('Choisir la ligne de la facture')}
                value={ligneFacture}
                onChange={(valeur: string | undefined) => {
                  setLigneFacture(valeur);
                  setErreurLigne(null);
                }}
                options={lignesValorisables.map(l => ({ value: l.id, label: l.label }))}
              />
              {ligneExigee ? (
                <Text type="secondary">
                  {t('Le montant déduit de la dette du fournisseur est le prix de cette ligne.')}
                </Text>
              ) : null}
              {erreurLigne ? (
                <div>
                  <Text type="danger" role="alert">
                    {erreurLigne}
                  </Text>
                </div>
              ) : null}
            </div>
            <div>
              <label htmlFor="retour-lieu">{t('Lieu')}</label>
              <Select
                id="retour-lieu"
                style={{ width: '100%' }}
                placeholder={t('Choisir un lieu')}
                showSearch
                optionFilterProp="label"
                value={lieu}
                onChange={(valeur: string) => setLieu(valeur)}
                options={contexte.locations.filter(l => l.isActive).map(l => ({ value: l.id, label: l.label }))}
              />
            </div>
            <div>
              <label htmlFor="retour-quantite">{t('Quantité')}</label>
              <StockQuantityInput
                id="retour-quantite"
                min={0.0001}
                unit={cumul?.itemUnit}
                value={quantiteSaisie}
                onChange={setQuantiteSaisie}
              />
            </div>
            <div>
              <Text strong>{t('Motif')}</Text>
              <StockReasonPicker codes={contexte.reasonCodes.supplierReturn} value={motif} onChange={setMotif} />
              {erreurMotif ? (
                <Text type="danger" role="alert">
                  {erreurMotif}
                </Text>
              ) : null}
            </div>
            <ChampDate
              id="retour-date"
              label={t('Date du retour')}
              value={dateRetour}
              onChange={setDateRetour}
              limiteJours={contexte.settings.backdatingLimitDays}
              erreur={erreurDate}
            />
            {coupure ? <AlerteCoupure onRetry={() => void envoyer()} loading={envoiEnCours} /> : null}
            {erreur ? <Alert type="error" showIcon message={erreur} /> : null}
          </>
        )}
        {/* Clé stable : la photo choisie avant l'enregistrement part sur le
            mouvement créé au lieu d'être perdue au remontage (rec040-03). */}
        <div key="photos-avant-enregistrement">
          <Text strong>{t('Photo de la marchandise (facultatif)')}</Text>
          <StockPhotoCapture
            tenantId={tenantId}
            target={mouvement ? { type: 'MOVEMENT', id: mouvement.id } : undefined}
            purposes={['GOODS_PHOTO']}
          />
        </div>
      </Space>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Onglet « État du stock » (ecrans §5.2)
// ---------------------------------------------------------------------------

function OngletEtat(props: {
  tenantId: string;
  contexte: StockFieldContext;
  onRecevoir: () => void;
}): React.ReactElement {
  const { tenantId, contexte, onRecevoir } = props;
  const [lieuFiltre, setLieuFiltre] = useState<string | undefined>(undefined);
  const [articleFiltre, setArticleFiltre] = useState<string | undefined>(undefined);
  const [masquerZero, setMasquerZero] = useState(false);
  const filtres = { locationId: lieuFiltre, itemId: articleFiltre, onlyInStock: masquerZero || undefined };

  const soldes = useQuery({
    queryKey: queryKey('stock-balances', tenantId, filtres),
    queryFn: () => listStockBalances(tenantId, filtres),
    staleTime: STALE_TIME.list
  });
  const meta = soldes.data?.meta;
  const valeursVisibles = meta?.valuesVisible ?? contexte.abilities.valuesVisible;
  const aveugles = lieuxAveugles(meta, contexte);
  const liste = soldes.data?.data ?? [];
  const nbFiltres = (lieuFiltre ? 1 : 0) + (articleFiltre ? 1 : 0) + (masquerZero ? 1 : 0);
  const effacer = () => {
    setLieuFiltre(undefined);
    setArticleFiltre(undefined);
    setMasquerZero(false);
  };

  const pastilleComptage = <StatusTag status="STOCK_COUNT_IN_PROGRESS" tone="info" label={t('Comptage en cours')} />;
  const valeurOuComptage = (b: StockBalanceView, valeur: number | null, unite?: boolean) =>
    valeur === null ? (
      aveugles.has(b.locationId) ? (
        pastilleComptage
      ) : null
    ) : unite ? (
      <Space size={4}>
        <MoneyValue value={valeur} />
        <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
          / {b.itemUnit}
        </Text>
      </Space>
    ) : (
      <MoneyValue value={valeur} />
    );

  const colonnes: ColumnsType<StockBalanceView> = [
    {
      title: t('Article'),
      key: 'article',
      render: (_, b) => (
        <Space orientation="vertical" size={0}>
          <span>{b.itemLabel}</span>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {b.itemReference}
          </Text>
        </Space>
      )
    },
    {
      title: t('Lieu'),
      key: 'lieu',
      render: (_, b) => (
        <Space size={4} wrap>
          <span>{b.locationLabel}</span>
          {aveugles.has(b.locationId) ? pastilleComptage : null}
        </Space>
      )
    },
    {
      title: t('Quantité'),
      key: 'quantite',
      align: 'end',
      render: (_, b) =>
        b.quantity === 0 ? (
          <Text type="secondary">
            0 {b.itemUnit} {t('— plus rien ici')}
          </Text>
        ) : (
          <StockQuantityCell quantity={b.quantity} unit={b.itemUnit} />
        )
    },
    ...(valeursVisibles
      ? ([
          {
            title: t('Coût moyen unitaire'),
            key: 'cout-moyen',
            align: 'end',
            render: (_, b) => valeurOuComptage(b, b.averageUnitCost, true)
          },
          {
            title: t('Valeur'),
            key: 'valeur',
            align: 'end',
            render: (_, b) => valeurOuComptage(b, b.value)
          }
        ] as ColumnsType<StockBalanceView>)
      : [])
  ];

  return (
    <>
      <FilterSheet activeCount={nbFiltres} onClear={effacer} title={t("Filtrer l'état du stock")}>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="filtre-lieu-stock">{t('Lieu')}</label>
          <Select
            id="filtre-lieu-stock"
            style={{ width: '100%' }}
            placeholder={t('Tous les lieux')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={lieuFiltre}
            onChange={valeur => setLieuFiltre(valeur as string | undefined)}
            options={contexte.locations.map(l => ({ value: l.id, label: l.label }))}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="filtre-article-stock">{t('Article')}</label>
          <Select
            id="filtre-article-stock"
            style={{ width: '100%' }}
            placeholder={t('Tous les articles')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={articleFiltre}
            onChange={valeur => setArticleFiltre(valeur as string | undefined)}
            options={contexte.items.map(a => ({ value: a.id, label: `${a.reference} — ${a.label}` }))}
          />
        </div>
        <div style={{ minWidth: 240 }}>
          <Checkbox checked={masquerZero} onChange={event => setMasquerZero(event.target.checked)}>
            {t('Masquer les lignes à zéro')}
          </Checkbox>
        </div>
      </FilterSheet>

      <DataView<StockBalanceView>
        paginated={false}
        scrollX={1000}
        items={liste}
        total={liste.length}
        page={1}
        pageSize={Math.max(liste.length, 1)}
        onPageChange={() => {}}
        loading={soldes.isPending}
        isReloading={soldes.isFetching && !soldes.isPending}
        error={soldes.error ? t("Impossible de charger l'état du stock.") : null}
        onRetry={() => soldes.refetch()}
        isFiltered={nbFiltres > 0}
        onClearFilters={effacer}
        emptyDescription={t("Aucun stock n'est encore enregistré.")}
        emptyAction={
          contexte.abilities.canReceive ? { label: t('Enregistrer une réception'), onClick: onRecevoir } : undefined
        }
        columns={colonnes}
        rowKey={b => `${b.itemId}-${b.locationId}`}
        aria-label={t('État du stock')}
        renderCard={b => (
          <DataCard
            title={b.itemLabel}
            aria-label={b.itemLabel}
            subtitle={`${b.itemReference} — ${b.locationLabel}`}
            highlight={
              valeursVisibles ? (
                valeurOuComptage(b, b.value)
              ) : (
                <StockQuantityCell quantity={b.quantity} unit={b.itemUnit} />
              )
            }
            fields={[
              { label: t('Quantité'), value: <StockQuantityCell quantity={b.quantity} unit={b.itemUnit} /> },
              ...(valeursVisibles
                ? [{ label: t('Coût moyen unitaire'), value: valeurOuComptage(b, b.averageUnitCost, true) }]
                : [])
            ]}
          />
        )}
      />

      {valeursVisibles ? (
        <Paragraph type="secondary" style={{ marginTop: 'var(--space-3)' }}>
          {t(
            "Le coût moyen unitaire est propre à chaque couple article / lieu : un même article peut valoir deux prix différents dans deux magasins, selon ce qu'on y a reçu et à quel prix. Il se déduit de la valeur et de la quantité, et n'est jamais une donnée saisie."
          )}
        </Paragraph>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Onglet « Journal des mouvements » (A5, A4-R4 — ecrans §5.6)
// ---------------------------------------------------------------------------

const PAGE_DU_JOURNAL = 50;

function OngletJournal(props: {
  tenantId: string;
  contexte: StockFieldContext;
  filtreBon: { id: string; number: string } | null;
  onEffacerBon: () => void;
  mouvementId: string | null;
  onEffacerMouvement: () => void;
  onOuvrirBon: (slipId: string) => void;
  onOuvrirFacture: (invoiceId: string) => void;
}): React.ReactElement {
  const { tenantId, contexte, filtreBon, onEffacerBon, mouvementId, onEffacerMouvement, onOuvrirBon, onOuvrirFacture } =
    props;
  const { message } = App.useApp();
  const abilities: StockAbilities = contexte.abilities;
  const [article, setArticle] = useState<string | undefined>(undefined);
  const [lieu, setLieu] = useState<string | undefined>(undefined);
  const [chantier, setChantier] = useState<string | undefined>(undefined);
  const [nature, setNature] = useState<StockMovementType | undefined>(undefined);
  const [du, setDu] = useState<Dayjs | null>(null);
  const [au, setAu] = useState<Dayjs | null>(null);
  const [demandeur, setDemandeur] = useState('');
  const [preneurFiltre, setPreneurFiltre] = useState<string | undefined>(undefined);
  const [auteur, setAuteur] = useState<string | undefined>(undefined);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [piecesDuMouvement, setPiecesDuMouvement] = useState<StockMovementView | null>(null);

  // Les trois filtres par personne n'existent qu'avec les valeurs (A5-R2) :
  // sans elles, le serveur répondrait 403.
  const filtresParPersonne = abilities.valuesVisible;
  const filtres: Omit<StockMovementsFilters, 'cursor' | 'limit'> = {
    itemId: article,
    locationId: lieu,
    siteId: chantier,
    type: nature,
    from: du ? du.format('YYYY-MM-DD') : undefined,
    to: au ? au.format('YYYY-MM-DD') : undefined,
    slipId: filtreBon?.id,
    movementId: mouvementId ?? undefined,
    ...(filtresParPersonne
      ? { requestedBy: demandeur.trim() || undefined, takerId: preneurFiltre, createdByUserId: auteur }
      : {})
  };
  // Le journal se lit par pages (curseur). `useInfiniteQuery` garde les pages
  // dans une seule entrée du cache : quand la première page est relue (écriture
  // qui invalide `stock-movements`, retour sur l'onglet), TanStack relit les
  // pages suivantes une à une à partir des curseurs fraîchement rendus. Un
  // mouvement arrivé en tête décale donc la suite sans qu'aucune ligne ne soit
  // perdue ni doublée. Changer un filtre change la clé : on repart de la
  // première page.
  const journal = useInfiniteQuery({
    queryKey: queryKey('stock-movements', tenantId, {
      ...(filtres as Record<string, string | undefined>),
      vue: 'journal'
    }),
    queryFn: ({ pageParam }) =>
      listStockMovements(tenantId, {
        ...filtres,
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: PAGE_DU_JOURNAL
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: derniere => derniere.meta.nextCursor ?? undefined,
    staleTime: STALE_TIME.list
  });

  const mouvements = useMemo(() => (journal.data?.pages ?? []).flatMap(page => page.data), [journal.data]);
  const meta = journal.data?.pages[0]?.meta;
  const valeursVisibles = meta?.valuesVisible ?? abilities.valuesVisible;
  const aveugles = lieuxAveugles(meta, contexte);
  const suiteEchouee = journal.isFetchNextPageError;
  // Une suite qui échoue n'efface pas les lignes déjà lues : seul un échec de
  // la première lecture (ou de sa relecture) remplace la liste par l'erreur.
  const erreurJournal = journal.error && !journal.isFetchNextPageError ? journal.error : null;

  const chargerPlus = () => {
    if (!journal.hasNextPage || journal.isFetchingNextPage) return;
    void journal.fetchNextPage();
  };

  const preneurs = useQuery({
    queryKey: queryKey('stock-takers', tenantId, { onlyActive: false }),
    queryFn: () => listStockTakers(tenantId, { onlyActive: false }),
    enabled: filtresParPersonne,
    staleTime: STALE_TIME.reference
  });
  const auteurs = useQuery({
    queryKey: queryKey('stock-movement-authors', tenantId, {}),
    queryFn: () => listMovementAuthors(tenantId),
    enabled: filtresParPersonne,
    staleTime: STALE_TIME.reference
  });

  const nbFiltres =
    [article, lieu, chantier, nature, du, au, preneurFiltre, auteur].filter(Boolean).length +
    (demandeur.trim() ? 1 : 0);
  const effacer = () => {
    setArticle(undefined);
    setLieu(undefined);
    setChantier(undefined);
    setNature(undefined);
    setDu(null);
    setAu(null);
    setDemandeur('');
    setPreneurFiltre(undefined);
    setAuteur(undefined);
  };

  const exporter = async () => {
    setExportEnCours(true);
    try {
      const fichier = await exportStockMovementsCsv(tenantId, filtres);
      saveBlob(fichier.blob, fichier.filename);
    } catch (err) {
      const statut = (err as { response?: { status?: number } })?.response?.status;
      message.error(
        statut === 422
          ? t("L'export dépasse 50 000 lignes. Réduisez la période ou ajoutez un filtre.")
          : await describeDownloadError(err)
      );
    } finally {
      setExportEnCours(false);
    }
  };

  const masque = (m: StockMovementView) => aveugles.has(m.locationId);
  const nature_ = (m: StockMovementView) => (
    <StatusTag status={m.type} label={STOCK_MOVEMENT_TYPE_LABELS[m.type]} tone={STOCK_MOVEMENT_TYPE_TONES[m.type]} />
  );
  const signe = (m: StockMovementView) => `${m.isDecrease ? '−' : '+'} ${quantite(m.quantity, m.itemUnit)}`;
  const saisiLe = (m: StockMovementView) => (
    <Space size={4} wrap>
      <span>{dateHeure(m.createdAt)}</span>
      {m.entryLagDays > 0 ? (
        <Tooltip title={t('Saisi {{n}} jour(s) après la date déclarée.', { n: m.entryLagDays })}>
          <span>
            <StatusTag
              status="STOCK_ENTRY_LAG"
              tone={m.entryLagDays >= 3 ? 'warning' : 'neutral'}
              label={t('+{{n}} j', { n: m.entryLagDays })}
            />
          </span>
        </Tooltip>
      ) : null}
    </Space>
  );
  const preneurOuDemandeur = (m: StockMovementView) =>
    m.requestedBy ? (
      <Space orientation="vertical" size={0}>
        <span>{m.requestedBy}</span>
        {m.takerLabel && m.takerLabel !== m.requestedBy ? (
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {t('(aujourd’hui : {{takerLabel}})', { takerLabel: m.takerLabel })}
          </Text>
        ) : null}
      </Space>
    ) : (
      <Text type="secondary">—</Text>
    );
  const motifDe = (m: StockMovementView): string => {
    const libelle = stockReasonDisplay(m.reasonCode, m.reason);
    if (!libelle) return '—';
    return m.reasonCode && m.reason?.trim() ? `${libelle} — ${m.reason.trim()}` : libelle;
  };
  const bonDe = (m: StockMovementView) =>
    m.slipNumber && m.slipId ? (
      <Button type="link" style={{ paddingInline: 0 }} onClick={() => onOuvrirBon(m.slipId as string)}>
        {m.slipNumber}
      </Button>
    ) : (
      <Text type="secondary">—</Text>
    );
  const piecesJointes = (m: StockMovementView) =>
    m.attachmentsCount > 0 ? (
      <Button
        type="link"
        icon={<PaperClipOutlined />}
        aria-label={t('Pièces jointes : {{n}}', { n: m.attachmentsCount })}
        onClick={() => (m.slipId ? onOuvrirBon(m.slipId) : setPiecesDuMouvement(m))}
      >
        {m.attachmentsCount}
      </Button>
    ) : (
      <Text type="secondary">—</Text>
    );

  const colonnes: ColumnsType<StockMovementView> = [
    { title: t('Date'), key: 'date', render: (_, m) => date(m.movementDate) },
    { title: t('Saisi le'), key: 'saisi-le', render: (_, m) => saisiLe(m) },
    { title: t('Nature'), key: 'nature', render: (_, m) => nature_(m) },
    { title: t('Bon'), key: 'bon', render: (_, m) => bonDe(m) },
    {
      title: t('Article'),
      key: 'article',
      render: (_, m) => (
        <Space orientation="vertical" size={0}>
          <span>{m.itemLabel}</span>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {m.itemReference}
          </Text>
        </Space>
      )
    },
    { title: t('Lieu'), key: 'lieu', render: (_, m) => m.locationLabel },
    { title: t('Quantité'), key: 'quantite', align: 'end', render: (_, m) => signe(m) },
    {
      title: t('Reste après'),
      key: 'reste',
      align: 'end',
      render: (_, m) =>
        m.quantityAfter === null ? (
          MASQUE_COMPTAGE()
        ) : (
          <Space orientation="vertical" size={0} style={{ alignItems: 'flex-end' }}>
            <span>{quantite(m.quantityAfter, m.itemUnit)}</span>
            {valeursVisibles && m.valueAfter !== null ? (
              <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                <MoneyValue value={m.valueAfter} />
              </Text>
            ) : null}
          </Space>
        )
    },
    ...(valeursVisibles
      ? ([
          {
            title: t('Prix unitaire'),
            key: 'prix-unitaire',
            align: 'end',
            render: (_, m) =>
              m.unitCost === null ? masque(m) ? MASQUE_COMPTAGE() : null : <MoneyValue value={m.unitCost} />
          },
          {
            // `totalValue` TEL QUEL, jamais `quantity × unitCost`.
            title: t('Valeur du mouvement'),
            key: 'valeur',
            align: 'end',
            render: (_, m) =>
              m.totalValue === null ? (
                masque(m) ? (
                  MASQUE_COMPTAGE()
                ) : null
              ) : m.type === 'SUPPLIER_RETURN' && m.supplierCreditValue !== null ? (
                <Tooltip
                  title={t('Valeur sortie du stock ; montant porté au fournisseur : {{supplierCreditValue}}', {
                    supplierCreditValue: formatMoney(m.supplierCreditValue)
                  })}
                >
                  <span>
                    <MoneyValue value={m.totalValue} />
                  </span>
                </Tooltip>
              ) : (
                <MoneyValue value={m.totalValue} />
              )
          }
        ] as ColumnsType<StockMovementView>)
      : []),
    {
      title: t('Chantier imputé'),
      key: 'chantier',
      render: (_, m) =>
        m.siteLabel ? (
          <Space orientation="vertical" size={0}>
            <span>{m.siteLabel}</span>
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {m.costCategoryLabel ?? t('Poste non renseigné')}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">{t('Aucune imputation')}</Text>
        )
    },
    { title: t('Preneur ou demandeur'), key: 'preneur', render: (_, m) => preneurOuDemandeur(m) },
    { title: t('Motif'), key: 'motif', render: (_, m) => motifDe(m) },
    {
      title: t('Pièce'),
      key: 'piece',
      render: (_, m) =>
        m.supplierInvoiceReference && m.supplierInvoiceId ? (
          <Button
            type="link"
            style={{ paddingInline: 0 }}
            onClick={() => onOuvrirFacture(m.supplierInvoiceId as string)}
          >
            {m.supplierInvoiceReference}
          </Button>
        ) : (
          (m.supplierInvoiceReference ?? <Text type="secondary">—</Text>)
        )
    },
    { title: t('Saisi par'), key: 'auteur', render: (_, m) => m.createdByLabel },
    { title: t('Pièces jointes'), key: 'pieces-jointes', render: (_, m) => piecesJointes(m) }
  ];

  const mouvementFiltre = mouvementId ? mouvements.find(m => m.id === mouvementId) : undefined;

  return (
    <>
      <FilterSheet activeCount={nbFiltres} onClear={effacer} title={t('Filtrer le journal')}>
        <div style={{ minWidth: 260 }}>
          <label htmlFor="journal-article">{t('Article')}</label>
          <Select
            id="journal-article"
            style={{ width: '100%' }}
            placeholder={t('Tous les articles')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={article}
            onChange={valeur => setArticle(valeur as string | undefined)}
            options={contexte.items.map(a => ({ value: a.id, label: `${a.reference} — ${a.label}` }))}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="journal-lieu">{t('Lieu')}</label>
          <Select
            id="journal-lieu"
            style={{ width: '100%' }}
            placeholder={t('Tous les lieux')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={lieu}
            onChange={valeur => setLieu(valeur as string | undefined)}
            options={contexte.locations.map(l => ({ value: l.id, label: l.label }))}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="journal-chantier">{t('Chantier')}</label>
          <Select
            id="journal-chantier"
            style={{ width: '100%' }}
            placeholder={t('Tous les chantiers')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={chantier}
            onChange={valeur => setChantier(valeur as string | undefined)}
            options={contexte.sites.map(s => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div style={{ minWidth: 220 }}>
          <label htmlFor="journal-nature">{t('Nature')}</label>
          <Select
            id="journal-nature"
            style={{ width: '100%' }}
            placeholder={t('Toutes les natures')}
            allowClear
            showSearch
            optionFilterProp="label"
            value={nature}
            onChange={valeur => setNature(valeur as StockMovementType | undefined)}
            options={(Object.keys(STOCK_MOVEMENT_TYPE_LABELS) as StockMovementType[]).map(code => ({
              value: code,
              label: STOCK_MOVEMENT_TYPE_LABELS[code]
            }))}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <label htmlFor="journal-du">{t('Du')}</label>
          <DatePicker id="journal-du" style={{ width: '100%' }} format="DD/MM/YYYY" value={du} onChange={setDu} />
        </div>
        <div style={{ minWidth: 180 }}>
          <label htmlFor="journal-au">{t('Au')}</label>
          <DatePicker id="journal-au" style={{ width: '100%' }} format="DD/MM/YYYY" value={au} onChange={setAu} />
        </div>
        {filtresParPersonne ? (
          <>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="journal-demandeur">{t('Demandeur ou preneur contient')}</label>
              <Input
                id="journal-demandeur"
                allowClear
                value={demandeur}
                onChange={event => setDemandeur(event.target.value)}
              />
            </div>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="journal-preneur">{t('Preneur')}</label>
              <Select
                id="journal-preneur"
                style={{ width: '100%' }}
                placeholder={t('Tous les preneurs')}
                allowClear
                showSearch
                optionFilterProp="label"
                value={preneurFiltre}
                onChange={valeur => setPreneurFiltre(valeur as string | undefined)}
                options={(preneurs.data ?? []).map(p => ({ value: p.id, label: p.label }))}
              />
            </div>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="journal-auteur">{t('Saisi par')}</label>
              <Select
                id="journal-auteur"
                style={{ width: '100%' }}
                placeholder={t('Toutes les personnes')}
                allowClear
                showSearch
                optionFilterProp="label"
                value={auteur}
                onChange={valeur => setAuteur(valeur as string | undefined)}
                options={(auteurs.data ?? []).map(a => ({ value: a.userId, label: a.label }))}
              />
            </div>
          </>
        ) : null}
      </FilterSheet>

      <Space wrap size="middle" style={{ marginBottom: 'var(--space-3)', alignItems: 'center' }}>
        {filtreBon ? (
          <Tag closable onClose={onEffacerBon}>
            {t('Bon {{numero}}', { numero: filtreBon.number })}
          </Tag>
        ) : null}
        {mouvementId ? (
          <Tag closable onClose={onEffacerMouvement}>
            {mouvementFiltre
              ? t('Mouvement du {{date}}', { date: dayjs(mouvementFiltre.movementDate).format('DD/MM') })
              : t('Mouvement sélectionné')}
          </Tag>
        ) : null}
        <div>
          <Button icon={<DownloadOutlined />} loading={exportEnCours} onClick={() => void exporter()}>
            {t('Exporter (CSV)')}
          </Button>
          <div>
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {valeursVisibles
                ? t('Mêmes filtres que la liste, 50 000 lignes au plus.')
                : t('Mêmes filtres que la liste, 50 000 lignes au plus. Sans les colonnes de valeur.')}
            </Text>
          </div>
        </div>
      </Space>

      <DataView<StockMovementView>
        paginated={false}
        scrollX={2200}
        items={mouvements}
        total={mouvements.length}
        page={1}
        pageSize={Math.max(mouvements.length, 1)}
        onPageChange={() => {}}
        loading={journal.isPending}
        isReloading={journal.isFetching && !journal.isPending && !journal.isFetchingNextPage}
        error={erreurJournal ? t('Impossible de charger le journal des mouvements.') : null}
        onRetry={() => journal.refetch()}
        isFiltered={nbFiltres > 0 || Boolean(filtreBon) || Boolean(mouvementId)}
        onClearFilters={() => {
          effacer();
          onEffacerBon();
          onEffacerMouvement();
        }}
        emptyDescription={t("Aucun mouvement de stock n'a encore été enregistré.")}
        columns={colonnes}
        rowKey={m => m.id}
        aria-label={t('Journal des mouvements de stock')}
        renderCard={m => (
          <DataCard
            title={m.itemLabel}
            aria-label={m.itemLabel}
            subtitle={`${date(m.movementDate)} — ${m.locationLabel}`}
            status={nature_(m)}
            highlight={valeursVisibles && m.totalValue !== null ? <MoneyValue value={m.totalValue} /> : signe(m)}
            fields={[
              { label: t('Quantité'), value: signe(m) },
              { label: t('Bon'), value: bonDe(m) },
              { label: t('Preneur ou demandeur'), value: preneurOuDemandeur(m) },
              { label: t('Motif'), value: motifDe(m) },
              { label: t('Saisi le'), value: saisiLe(m) }
            ]}
          />
        )}
      />
      {nbFiltres > 0 && !journal.isPending && mouvements.length === 0 && !erreurJournal ? (
        <Text type="secondary">{t('Aucun mouvement pour ces filtres.')}</Text>
      ) : null}

      {journal.hasNextPage ? (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Button onClick={chargerPlus} loading={journal.isFetchingNextPage}>
            {t('Charger plus')}
          </Button>
          {suiteEchouee ? (
            <div>
              <Text type="secondary">{t('La suite du journal n’a pas pu être chargée. Réessayez.')}</Text>
            </div>
          ) : null}
        </div>
      ) : null}

      {piecesDuMouvement ? (
        <Modal open title={t('Pièces jointes du mouvement')} onCancel={() => setPiecesDuMouvement(null)} footer={null}>
          <StockAttachmentList
            tenantId={tenantId}
            targetType="MOVEMENT"
            targetId={piecesDuMouvement.id}
            canAdd={
              (piecesDuMouvement.type === 'SCRAP' || piecesDuMouvement.type === 'SUPPLIER_RETURN'
                ? abilities.canDispose
                : piecesDuMouvement.type === 'TRANSFER'
                  ? abilities.canTransfer && piecesDuMouvement.isDecrease
                  : false) === true
            }
          />
        </Modal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tiroirs « Bon » et « Réceptions d'une facture » (ecrans §5.7, §5.8)
// ---------------------------------------------------------------------------

function TiroirBon(props: {
  tenantId: string;
  slipId: string;
  abilities: StockAbilities;
  onClose: () => void;
  onVoirMouvements: (slip: { id: string; number: string }) => void;
}): React.ReactElement {
  const { tenantId, slipId, abilities, onClose, onVoirMouvements } = props;
  const { isMobile } = useBreakpoint();
  const navigate = useNavigate();
  const lu = useQuery({
    queryKey: queryKey('stock-slip', tenantId, { slipId }),
    queryFn: () => getStockSlip(tenantId, slipId),
    staleTime: STALE_TIME.list
  });
  const bon = lu.data?.data;
  const valeursVisibles = lu.data?.meta.valuesVisible ?? abilities.valuesVisible;
  const introuvable = (lu.error as { response?: { status?: number } } | null)?.response?.status === 404;
  const peutAjouter = bon
    ? bon.kind === 'RECEIPT'
      ? abilities.canReceive
      : bon.kind === 'ISSUE'
        ? abilities.canIssue
        : abilities.canValidateCount
    : false;

  return (
    <Drawer
      open
      onClose={onClose}
      width={isMobile ? '100%' : 640}
      title={bon ? `${STOCK_SLIP_KIND_LABELS[bon.kind]} ${bon.number}` : t('Bon')}
    >
      {lu.isPending ? (
        <SkeletonDetail />
      ) : introuvable ? (
        <StateBlock variant="empty" title={t('Ce bon est introuvable.')} />
      ) : lu.error || !bon ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce bon.')}
          actions={[{ label: t('Réessayer'), onClick: () => lu.refetch(), primary: true }]}
        />
      ) : (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Text>{t('Date du document : {{date}}', { date: date(bon.documentDate) })}</Text>
          <Text type="secondary">
            {t('Enregistré le {{date}} à {{heure}} (heure du serveur) par {{auteur}}', {
              date: date(bon.createdAt),
              heure: dayjs(bon.createdAt).format('HH:mm'),
              auteur: bon.createdByLabel
            })}
          </Text>
          <Text>{t('Lieu : {{lieu}}', { lieu: bon.location.label })}</Text>
          {bon.site ? <Text>{t('Chantier : {{chantier}}', { chantier: bon.site.name })}</Text> : null}
          {bon.taker || bon.requestedBy ? (
            <Text>{t('Preneur ou demandeur : {{nom}}', { nom: bon.requestedBy ?? bon.taker?.label ?? '' })}</Text>
          ) : null}
          {bon.supplierInvoice ? (
            <Text>
              {t('Facture : {{reference}} — {{fournisseur}}', {
                reference: bon.supplierInvoice.reference,
                fournisseur: bon.supplierInvoice.supplierName
              })}
            </Text>
          ) : null}
          <LignesDuBon mouvements={bon.movements} valeursVisibles={valeursVisibles} />
          {valeursVisibles && bon.totalValue !== null ? (
            <Text strong>
              {t('Valeur totale :')} <MoneyValue value={bon.totalValue} />
            </Text>
          ) : null}
          <StockSlipPdfButton tenantId={tenantId} slipId={bon.id} number={bon.number} />
          {bon.kind === 'COUNT_REPORT' && bon.stockCountId ? (
            <Button
              type="link"
              style={{ paddingInline: 0 }}
              onClick={() =>
                navigate(
                  `/tenant/${tenantId}/finance/stock/inventaire?inventaire=${encodeURIComponent(bon.stockCountId as string)}`
                )
              }
            >
              {t('Ouvrir le détail de l’inventaire')}
            </Button>
          ) : (
            <>
              <Title level={5} style={{ margin: 0 }}>
                {t('Pièces jointes')}
              </Title>
              <StockAttachmentList
                tenantId={tenantId}
                targetType="SLIP"
                targetId={bon.id}
                canAdd={peutAjouter}
                initialAttachments={bon.attachments}
                purposes={['SIGNED_SLIP', 'GOODS_PHOTO', 'DELIVERY_NOTE']}
              />
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() => onVoirMouvements({ id: bon.id, number: bon.number })}
              >
                {t('Voir les mouvements de ce bon')}
              </Button>
            </>
          )}
        </Space>
      )}
    </Drawer>
  );
}

function TiroirFacture(props: {
  tenantId: string;
  invoiceId: string;
  valeursVisibles: boolean;
  onClose: () => void;
  onOuvrirBon: (slipId: string) => void;
}): React.ReactElement {
  const { tenantId, invoiceId, onClose, onOuvrirBon } = props;
  const { isMobile } = useBreakpoint();
  const lu = useQuery({
    queryKey: queryKey('stock-invoice-receipts', tenantId, { invoiceId }),
    queryFn: () => getInvoiceReceipts(tenantId, invoiceId),
    staleTime: STALE_TIME.list
  });
  const vue = lu.data?.data;
  const valeursVisibles = lu.data?.meta.valuesVisible ?? props.valeursVisibles;
  return (
    <Drawer
      open
      onClose={onClose}
      width={isMobile ? '100%' : 640}
      title={vue ? t('Réceptions de la facture {{reference}}', { reference: vue.invoice.reference }) : t('Facture')}
    >
      {lu.isPending ? (
        <SkeletonDetail />
      ) : lu.error || !vue ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les réceptions de cette facture.')}
          actions={[{ label: t('Réessayer'), onClick: () => lu.refetch(), primary: true }]}
        />
      ) : (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Text>
            {vue.invoice.reference} — {vue.invoice.supplierName} — {date(vue.invoice.invoiceDate)}
          </Text>
          <StatusTag status={vue.invoice.status} />
          {valeursVisibles && vue.invoice.amount !== null ? (
            <Text>
              {t('Montant :')} <MoneyValue value={vue.invoice.amount} />
            </Text>
          ) : null}
          <Title level={5} style={{ margin: 0 }}>
            {t('Réceptions')}
          </Title>
          {vue.receipts.length === 0 ? <Text type="secondary">{t('Aucune réception sur cette facture.')}</Text> : null}
          <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}>
            {vue.receipts.map((reception, index) => (
              <li key={`${reception.slipId ?? 'sans-bon'}-${index}`}>
                {reception.slipId && reception.slipNumber ? (
                  <Button
                    type="link"
                    style={{ paddingInline: 0 }}
                    onClick={() => onOuvrirBon(reception.slipId as string)}
                  >
                    {reception.slipNumber}
                  </Button>
                ) : null}{' '}
                {t('le {{date}} à « {{lieu}} », par {{auteur}} :', {
                  date: date(reception.receiptDate),
                  lieu: reception.locationLabel,
                  auteur: reception.createdByLabel
                })}{' '}
                {reception.lines.map(l => `${l.itemLabel} ${quantite(l.quantity, l.itemUnit)}`).join(', ')}
              </li>
            ))}
          </ul>
          {vue.returns.length > 0 ? (
            <>
              <Title level={5} style={{ margin: 0 }}>
                {t('Retours au fournisseur')}
              </Title>
              <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}>
                {vue.returns.map(m => (
                  <li key={m.id}>
                    {date(m.movementDate)} — {m.itemLabel} {quantite(m.quantity, m.itemUnit)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {valeursVisibles && vue.receivedValue !== null ? (
            <Text>
              {t('Reçu :')} <MoneyValue value={vue.receivedValue} />
              {vue.returnedValue !== null ? (
                <>
                  {' · '}
                  {t('Retourné :')} <MoneyValue value={vue.returnedValue} />
                </>
              ) : null}
            </Text>
          ) : null}
        </Space>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// L'écran
// ---------------------------------------------------------------------------

type Fenetre = 'reception' | 'sortie' | 'rebut' | 'retour' | null;

export const Stock: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDesktop } = useBreakpoint();
  const contexteTerrain = useStockFieldContext(tenantId);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [generation, setGeneration] = useState(0);
  const [filtreBon, setFiltreBon] = useState<{ id: string; number: string } | null>(null);

  const onglet = searchParams.get('onglet') === 'journal' ? 'journal' : 'etat';
  const mouvementId = searchParams.get('mouvement');
  const bonOuvert = searchParams.get('bon');
  const factureOuverte = searchParams.get('facture');

  const modifierParametres = useCallback(
    (modifier: (parametres: URLSearchParams) => void) => {
      setSearchParams(
        precedents => {
          const suivants = new URLSearchParams(precedents);
          modifier(suivants);
          return suivants;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const entete = (
    <PageHeader title={t('Stock')} subtitle={t('État du stock, réceptions, sorties et journal des mouvements')} />
  );

  if (contexteTerrain.error) {
    const erreur = lireErreur(contexteTerrain.error);
    if (isModuleNotIncludedError(contexteTerrain.error)) {
      return (
        <>
          {entete}
          <ModuleNotIncluded />
        </>
      );
    }
    if (erreur.status === 403) {
      return (
        <>
          {entete}
          <StateBlock
            variant="forbidden"
            title={t('Le stock ne vous est pas ouvert')}
            description={t(
              "Votre rôle ne comprend pas la consultation du stock. Demandez à l'administrateur de l'agence de vous attribuer le rôle Magasinier ou un rôle qui la comprend."
            )}
          />
        </>
      );
    }
    return (
      <>
        {entete}
        <StateBlock
          variant="error"
          description={t('Impossible de charger le stock.')}
          actions={[{ label: t('Réessayer'), onClick: () => contexteTerrain.refetch(), primary: true }]}
        />
      </>
    );
  }

  if (contexteTerrain.isPending || !contexteTerrain.data) {
    return (
      <>
        {entete}
        <StateBlock variant="loading" />
      </>
    );
  }

  const contexte = contexteTerrain.data.data;
  const abilities = contexte.abilities;
  const valeursVisibles = contexteTerrain.data.meta.valuesVisible ?? abilities.valuesVisible;

  const ouvrir = (quelle: Fenetre) => {
    setGeneration(g => g + 1);
    setFenetre(quelle);
  };
  const fermer = () => setFenetre(null);
  const ouvrirBon = (slipId: string) => modifierParametres(p => p.set('bon', slipId));
  const ouvrirFacture = (invoiceId: string) => modifierParametres(p => p.set('facture', invoiceId));

  const autresMouvements = abilities.canDispose ? (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          { key: 'rebut', label: t('Rebut'), onClick: () => ouvrir('rebut') },
          { key: 'retour', label: t('Retour au fournisseur'), onClick: () => ouvrir('retour') }
        ]
      }}
    >
      <Button>
        <Space>
          {t('Autres mouvements')}
          <DownOutlined />
        </Space>
      </Button>
    </Dropdown>
  ) : null;

  return (
    <>
      {entete}
      {!valeursVisibles ? (
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Text type="secondary">{t('Les valeurs du stock ne sont pas affichées pour votre rôle.')}</Text>
        </div>
      ) : null}

      {!isDesktop ? (
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <Title level={5} style={{ marginTop: 0 }}>
            {t('Vous êtes sur le terrain ?')}
          </Title>
          <Paragraph>
            {t('L’écran Magasin réunit la réception, la sortie et le comptage en trois gestes, avec la photo.')}
          </Paragraph>
          <Button type="primary" block onClick={() => navigate(`/tenant/${tenantId}/finance/stock/magasin`)}>
            {t('Ouvrir l’écran Magasin')}
          </Button>
        </Card>
      ) : null}

      {valeursVisibles ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 'var(--space-4)' }}
          message={t("C'est la sortie qui impute le chantier, pas la livraison")}
          description={t(
            "Recevoir de la marchandise fait monter le stock, et rien d'autre : aucun coût de chantier ne bouge à ce moment-là. Le matériau entre dans le coût d'un chantier le jour où il sort du magasin pour lui, à son coût moyen d'alors."
          )}
        />
      ) : null}

      {abilities.canReceive || abilities.canIssue || abilities.canDispose ? (
        <Space wrap size="middle" style={{ marginBottom: 'var(--space-4)' }}>
          {abilities.canReceive ? (
            <Button icon={<PlusOutlined />} onClick={() => ouvrir('reception')}>
              {t('Enregistrer une réception')}
            </Button>
          ) : null}
          {abilities.canIssue ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => ouvrir('sortie')}>
              {t('Enregistrer une sortie')}
            </Button>
          ) : null}
          {autresMouvements}
        </Space>
      ) : null}

      <Tabs
        activeKey={onglet}
        onChange={cle =>
          modifierParametres(p => {
            if (cle === 'journal') p.set('onglet', 'journal');
            else p.delete('onglet');
          })
        }
        items={[
          {
            key: 'etat',
            label: t('État du stock'),
            children: <OngletEtat tenantId={tenantId} contexte={contexte} onRecevoir={() => ouvrir('reception')} />
          },
          {
            key: 'journal',
            label: t('Journal des mouvements'),
            children: (
              <OngletJournal
                tenantId={tenantId}
                contexte={contexte}
                filtreBon={filtreBon}
                onEffacerBon={() => setFiltreBon(null)}
                mouvementId={mouvementId}
                onEffacerMouvement={() => modifierParametres(p => p.delete('mouvement'))}
                onOuvrirBon={ouvrirBon}
                onOuvrirFacture={ouvrirFacture}
              />
            )
          }
        ]}
      />

      {fenetre === 'reception' ? (
        <FenetreReception
          key={`reception-${generation}`}
          tenantId={tenantId}
          contexte={contexte}
          onClose={fermer}
          onNouvelle={() => ouvrir('reception')}
        />
      ) : null}
      {fenetre === 'sortie' ? (
        <FenetreSortie
          key={`sortie-${generation}`}
          tenantId={tenantId}
          contexte={contexte}
          onClose={fermer}
          onNouvelle={() => ouvrir('sortie')}
        />
      ) : null}
      {fenetre === 'rebut' ? (
        <FenetreRebut key={`rebut-${generation}`} tenantId={tenantId} contexte={contexte} onClose={fermer} />
      ) : null}
      {fenetre === 'retour' ? (
        <FenetreRetour key={`retour-${generation}`} tenantId={tenantId} contexte={contexte} onClose={fermer} />
      ) : null}

      {bonOuvert ? (
        <TiroirBon
          key={bonOuvert}
          tenantId={tenantId}
          slipId={bonOuvert}
          abilities={abilities}
          onClose={() => modifierParametres(p => p.delete('bon'))}
          onVoirMouvements={slip => {
            setFiltreBon(slip);
            modifierParametres(p => {
              p.delete('bon');
              p.set('onglet', 'journal');
            });
          }}
        />
      ) : null}
      {factureOuverte ? (
        <TiroirFacture
          key={factureOuverte}
          tenantId={tenantId}
          invoiceId={factureOuverte}
          valeursVisibles={valeursVisibles}
          onClose={() => modifierParametres(p => p.delete('facture'))}
          onOuvrirBon={slipId =>
            modifierParametres(p => {
              p.delete('facture');
              p.set('bon', slipId);
            })
          }
        />
      ) : null}
    </>
  );
};

export default Stock;
