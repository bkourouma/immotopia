import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Upload,
  Button,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd';
import { UploadOutlined, DollarOutlined, PhoneOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import type { UploadFile } from 'antd';
import { tenantPortalService } from '../../services/tenantPortalService';
import { readPaymentProof } from '../../services/tenant-portal-declared-payment-service';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { formatMontantLocatif } from '../../lib/rental-labels';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import type {
  ProofReadResultDto,
  RentalDeclarationPaymentMethod,
  RentalMobileMoneyOperator
} from '../../types/rental-declared-payment';
import ReceivingNumbersCard from './declared-payment/ReceivingNumbersCard';
import { useDeclaredAvailability } from './declared-payment/useDeclaredAvailability';
import { invalidateAfterDeclaration } from './declared-payment/invalidate';
import {
  ALL_PAYMENT_METHODS,
  OPERATORS,
  aiFieldHint,
  aiReadFailedMessage,
  declarationErrorMessage,
  isValidTransactionReference,
  normalizeTransactionReference,
  operatorLabel,
  parseDeclarationApiError,
  paymentMethodLabel,
  validateProofFile
} from './declared-payment/labels';

const { TextArea } = Input;
const { Text } = Typography;

/** Chiffres (latins, arabo-indiens, persans), espaces (dont insécables), séparateurs décimaux et signe. */
const CARACTERES_ADMIS = new RegExp('^[\\d\\s.,\\u066B\\u202F\\u00A0\\u0660-\\u0669\\u06F0-\\u06F9-]$');

/** Avance tolérée sur l'horloge du serveur et ancienneté maximale de `paidAt` (contrat §1.1). */
const PAID_AT_FUTURE_TOLERANCE_MINUTES = 10;
const PAID_AT_MAX_AGE_DAYS = 90;
const TOUCH_TARGET = 40;

type AiField = 'operator' | 'amount' | 'paidAt' | 'reference' | 'payerPhone';

interface PaymentDeclarationModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  installmentId?: string;
  /** Solde restant de l'echeance visee, pre-rempli comme montant propose. */
  defaultAmount?: number;
  /** Periode de l'echeance visee, rappelee dans le titre (ex. « 09/2026 »). */
  installmentLabel?: string;
}

interface FormValues {
  paymentMethod?: RentalDeclarationPaymentMethod;
  leaseId?: string;
  receivingNumberId?: string;
  operator?: RentalMobileMoneyOperator;
  payerPhone?: string;
  reference?: string;
  amount?: number;
  paidAt?: Dayjs;
  notes?: string;
}

export default function PaymentDeclarationModal({
  open,
  onCancel,
  onSuccess,
  installmentId,
  defaultAmount,
  installmentLabel
}: PaymentDeclarationModalProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const availabilityQuery = useDeclaredAvailability(open);
  const availability = availabilityQuery.data;

  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [reading, setReading] = useState(false);
  const [proofReadId, setProofReadId] = useState<string | null>(null);
  const [aiFields, setAiFields] = useState<AiField[]>([]);
  const [readWarnings, setReadWarnings] = useState<ProofReadResultDto['warnings']>([]);
  // Champs que le locataire a touchés : la lecture IA ne les écrase pas.
  const touched = useRef<Set<string>>(new Set());

  // Vrai tant qu'un caractère invalide a été tapé dans le montant : la validation
  // le refuse même si la suite de la saisie (« 1e9 » → « 19 ») redevient numérique.
  const caractereRefuse = useRef(false);
  // Le drapeau ne retombe que quand le champ est vidé : le message le dit.
  const messageCaractere = () =>
    `${t('Le montant ne doit contenir que des chiffres et une virgule (2 décimales au plus).')} ${t(
      'Caractère refusé : effacez le montant puis saisissez-le de nouveau.'
    )}`;

  // Plusieurs baux actifs et aucune échéance visée : le bail doit être choisi.
  const [leases, setLeases] = useState<Array<{ id: string; leaseNumber: string; propertyAddress?: string }>>([]);
  useEffect(() => {
    if (!open || installmentId) return;
    let annule = false;
    (async () => {
      try {
        const response = await tenantPortalService.getLeases();
        if (!annule) setLeases(Array.isArray(response?.data?.data) ? response.data.data : []);
      } catch {
        // Sans liste, la fenêtre se comporte comme pour un seul bail : le serveur retient le bail par défaut.
        if (!annule) setLeases([]);
      }
    })();
    return () => {
      annule = true;
    };
  }, [open, installmentId]);
  const doitChoisirUnBail = !installmentId && leases.length > 1;

  const receivingNumbers = availability?.receivingNumbers ?? [];
  // Absent (API plus ancienne) : tous les modes sont supposés permis.
  const allowedMethods: RentalDeclarationPaymentMethod[] = availability?.allowedMethods
    ? ALL_PAYMENT_METHODS.filter(m => availability.allowedMethods?.includes(m))
    : ALL_PAYMENT_METHODS;
  const usable = Boolean(availability?.enabled && allowedMethods.length > 0);
  const defaultMethod: RentalDeclarationPaymentMethod = allowedMethods.includes('MOBILE_MONEY')
    ? 'MOBILE_MONEY'
    : (allowedMethods[0] ?? 'MOBILE_MONEY');
  const watchedMethod = Form.useWatch('paymentMethod', form);
  const method: RentalDeclarationPaymentMethod =
    watchedMethod && allowedMethods.includes(watchedMethod) ? watchedMethod : defaultMethod;
  const isMobile = method === 'MOBILE_MONEY';
  const mobileSansNumero = isMobile && receivingNumbers.length === 0;

  /** Une touche qui n'est ni un chiffre, ni un séparateur, ni un signe est refusée avec un message (jamais ignorée en silence). */
  const refuserCaractereInvalide = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    if (CARACTERES_ADMIS.test(event.key)) return;
    event.preventDefault();
    caractereRefuse.current = true;
    form.setFields([{ name: 'amount', errors: [messageCaractere()] }]);
  };

  // Compteur de lectures IA : toute lecture dont le numéro n'est plus le courant
  // (capture retirée, remplacée, mode changé) est ignorée à son retour.
  const readSeq = useRef(0);

  const resetAi = () => {
    setProofReadId(null);
    setAiFields([]);
    setReadWarnings([]);
    touched.current = new Set();
  };

  const handleSubmit = async (values: FormValues) => {
    try {
      setLoading(true);

      const formData = new FormData();
      if (isMobile) {
        formData.append('receivingNumberId', values.receivingNumberId as string);
        formData.append('operator', values.operator as string);
      } else {
        formData.append('paymentMethod', method);
      }
      const referenceNormalisee = normalizeTransactionReference(values.reference ?? '');
      if (isMobile || referenceNormalisee) formData.append('reference', referenceNormalisee);
      formData.append('amount', String(values.amount));
      formData.append('paidAt', (values.paidAt as Dayjs).format());
      if (isMobile && values.payerPhone?.trim()) formData.append('payerPhone', values.payerPhone.trim());
      if (installmentId) formData.append('installmentId', installmentId);
      if (values.notes?.trim()) formData.append('notes', values.notes.trim());
      // Lecture IA réussie : la capture conservée côté serveur devient la preuve (exclusif avec `proof`).
      if (isMobile && proofReadId) {
        formData.append('proofReadId', proofReadId);
      } else if (fileList.length > 0 && fileList[0].originFileObj) {
        formData.append('proof', fileList[0].originFileObj);
      }

      const response = await tenantPortalService.declarePayment(
        formData,
        doitChoisirUnBail ? values.leaseId : undefined
      );

      message.success({
        content: t('Déclaration de paiement envoyée. Elle est en attente de validation par votre agence.'),
        duration: 5
      });
      if (response?.data?.data?.duplicateSuspected) {
        message.info(t('Un paiement très proche existe déjà : votre agence vérifiera.'));
      }
      readSeq.current += 1;
      form.resetFields();
      setFileList([]);
      resetAi();
      invalidateAfterDeclaration(queryClient);
      onSuccess();
      onCancel();
    } catch (error: unknown) {
      const text = declarationErrorMessage(error);
      const { code, status } = parseDeclarationApiError(error, '');
      if (code === 'RENTAL_DECLARATION_DUPLICATE_REFERENCE' || (status === 409 && !code)) {
        form.setFields([{ name: 'reference', errors: [text] }]);
      }
      message.error(text);
    } finally {
      setLoading(false);
    }
  };

  // À chaque ouverture : le solde restant de l'échéance visée est proposé (modifiable
  // pour un paiement partiel) ; sans échéance, le montant est vide. Sans cela le
  // magasin du formulaire gardait le montant de l'échéance précédente.
  useEffect(() => {
    if (!open || !usable) return;
    caractereRefuse.current = false;
    touched.current = new Set();
    form.setFieldsValue({ amount: defaultAmount && defaultAmount > 0 ? defaultAmount : undefined });
  }, [open, usable, installmentId, defaultAmount, form]);

  // Un seul numéro de réception : il est choisi d'office.
  useEffect(() => {
    if (!open || !usable || receivingNumbers.length !== 1) return;
    if (!form.getFieldValue('receivingNumberId')) form.setFieldsValue({ receivingNumberId: receivingNumbers[0].id });
  }, [open, usable, receivingNumbers, form]);

  /** Fermer sans déclarer repart d'un formulaire vierge à la prochaine ouverture. */
  const handleCancel = () => {
    readSeq.current += 1;
    setReading(false);
    form.resetFields();
    setFileList([]);
    resetAi();
    caractereRefuse.current = false;
    onCancel();
  };

  /** Lecture IA de la capture : jamais bloquante, le locataire corrige librement. */
  const lireLaCapture = async (file: File) => {
    const seq = readSeq.current;
    // Périmée : une autre capture, un retrait ou un changement de mode est passé par là.
    const perimee = () => readSeq.current !== seq;
    setReading(true);
    try {
      const result = await readPaymentProof(file);
      if (perimee()) return;
      if (result.quality !== 'OK') {
        message.warning(aiReadFailedMessage());
        return;
      }
      const prefilled: AiField[] = [];
      const patch: Partial<FormValues> = {};
      const libre = (champ: string) => !touched.current.has(champ);
      if (result.operator && libre('operator')) {
        patch.operator = result.operator;
        prefilled.push('operator');
      }
      if (result.amount !== null && libre('amount')) {
        patch.amount = result.amount;
        prefilled.push('amount');
      }
      if (result.reference && libre('reference')) {
        patch.reference = result.reference;
        prefilled.push('reference');
      }
      if (result.paidAt && libre('paidAt') && dayjs(result.paidAt).isValid()) {
        patch.paidAt = dayjs(result.paidAt);
        prefilled.push('paidAt');
      }
      if (result.payerPhone && libre('payerPhone')) {
        patch.payerPhone = result.payerPhone;
        prefilled.push('payerPhone');
      }
      if (result.matchedReceivingNumberId && libre('receivingNumberId')) {
        patch.receivingNumberId = result.matchedReceivingNumberId;
      }
      form.setFieldsValue(patch);
      setAiFields(prefilled);
      setReadWarnings(result.warnings ?? []);
      setProofReadId(result.proofReadId);
    } catch {
      if (!perimee()) message.warning(aiReadFailedMessage());
    } finally {
      if (!perimee()) setReading(false);
    }
  };

  const handleFileChange = (info: { fileList: UploadFile[] }) => {
    const nouvelle = info.fileList.slice(-1); // Une seule capture
    setFileList(nouvelle);
    if (nouvelle.length === 0) {
      // Retrait : une lecture en cours est ignorée.
      readSeq.current += 1;
      setReading(false);
      resetAi();
    }
  };

  const beforeUpload = (file: File) => {
    const refus = validateProofFile(file);
    if (refus) {
      message.error(refus);
      return Upload.LIST_IGNORE;
    }
    // Une nouvelle capture annule la lecture précédente (même en cours).
    readSeq.current += 1;
    setReading(false);
    setProofReadId(null);
    setAiFields([]);
    setReadWarnings([]);
    if (isMobile && availability?.aiPrefillAvailable) void lireLaCapture(file);
    return false; // Pas d'envoi automatique : la capture part avec la déclaration
  };

  const marquerChamp = (champ: AiField) =>
    aiFields.includes(champ) ? (
      <Tag color="blue" style={{ marginTop: 4 }} data-testid={`ai-hint-${champ}`}>
        {aiFieldHint()}
      </Tag>
    ) : null;

  const messageIndisponible = () => {
    if (availabilityQuery.isError)
      return t("La déclaration de paiement n'est pas disponible pour le moment. Contactez votre agence.");
    if (availability && !availability.enabled)
      return t("Votre agence n'a pas activé la déclaration de paiement. Contactez-la.");
    return t("Aucun numéro de réception n'est disponible pour le moment. Contactez votre agence.");
  };

  const maxAmount = availability?.maxAmount ?? 5_000_000;

  return (
    <Modal
      title={
        <Space>
          <DollarOutlined />
          <HelpSectionTitle
            title={
              installmentLabel
                ? t('Déclarer un paiement — échéance {{installmentLabel}}', { installmentLabel: installmentLabel })
                : t('Déclarer un paiement')
            }
            helpId="portails.locataire.paiements.declaration"
          />
        </Space>
      }
      open={open}
      onCancel={handleCancel}
      footer={null}
      width="min(600px, calc(100vw - 16px))"
      destroyOnClose
    >
      {availabilityQuery.isPending && open ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spin aria-label={t('Chargement')} />
        </div>
      ) : !usable ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert type="info" showIcon message={messageIndisponible()} />
          <Button style={{ minHeight: TOUCH_TARGET }} onClick={handleCancel}>
            {t('Fermer')}
          </Button>
        </Space>
      ) : (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {isMobile && receivingNumbers.length > 0 ? (
            <ReceivingNumbersCard numbers={receivingNumbers} instructions={availability?.instructions ?? null} />
          ) : null}

          <Form<FormValues>
            form={form}
            // BUG-2026-11-04-052 : sans `preserve={false}`, le magasin du formulaire
            // gardait le montant d'une échéance ouverte puis annulée, et le bouton de
            // page « Déclarer un paiement » le réaffichait.
            preserve={false}
            layout="vertical"
            onFinish={handleSubmit}
            onValuesChange={changed => {
              for (const champ of Object.keys(changed)) {
                touched.current.add(champ);
                if (aiFields.includes(champ as AiField)) setAiFields(prev => prev.filter(f => f !== champ));
              }
            }}
            initialValues={{
              paymentMethod: defaultMethod,
              paidAt: dayjs()
              // Le montant proposé n'est PAS dans `initialValues` : il est posé à chaque
              // ouverture par l'effet ci-dessus (BUG-2026-11-04-052).
            }}
          >
            {doitChoisirUnBail && (
              <Form.Item
                label={t('Bail concerné')}
                name="leaseId"
                rules={[{ required: true, message: t('Le bail concerné est requis') }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('Sélectionner le bail')}
                  options={leases.map(bail => ({
                    value: bail.id,
                    label: bail.propertyAddress ? `${bail.leaseNumber} — ${bail.propertyAddress}` : bail.leaseNumber
                  }))}
                />
              </Form.Item>
            )}

            <Form.Item label={t('Mode de paiement')} name="paymentMethod">
              <Select
                aria-label={t('Mode de paiement')}
                options={allowedMethods.map(m => ({ value: m, label: paymentMethodLabel(m) }))}
                onChange={() => {
                  // Changer de mode annule toute lecture IA (en cours ou terminée).
                  readSeq.current += 1;
                  setReading(false);
                  resetAi();
                }}
              />
            </Form.Item>

            {mobileSansNumero ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={t("Aucun numéro de réception n'est disponible pour le moment. Contactez votre agence.")}
              />
            ) : null}

            {isMobile ? (
              <>
                <Form.Item
                  label={t('Numéro de réception utilisé')}
                  name="receivingNumberId"
                  rules={[{ required: true, message: t('Choisissez le numéro vers lequel vous avez payé') }]}
                >
                  <Select
                    placeholder={t('Sélectionner le numéro')}
                    options={receivingNumbers.map(n => ({
                      value: n.id,
                      label: `${operatorLabel(n.operator)} — ${n.phone}`
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  label={t('Opérateur utilisé pour payer')}
                  name="operator"
                  extra={marquerChamp('operator')}
                  rules={[{ required: true, message: t("L'opérateur mobile est requis") }]}
                >
                  <Select
                    placeholder={t("Sélectionner l'opérateur")}
                    options={OPERATORS.map(op => ({ value: op, label: operatorLabel(op) }))}
                  />
                </Form.Item>

                <Form.Item
                  label={t('Votre numéro (celui qui a envoyé)')}
                  name="payerPhone"
                  extra={marquerChamp('payerPhone')}
                  rules={[{ max: 50, message: t('Le numéro ne peut pas dépasser 50 caractères') }]}
                >
                  <Input
                    prefix={<PhoneOutlined />}
                    placeholder={t('Ex. 07 00 00 00 00')}
                    maxLength={50}
                    inputMode="tel"
                    style={{ minHeight: TOUCH_TARGET }}
                  />
                </Form.Item>
              </>
            ) : null}

            <Form.Item
              label={
                isMobile ? t('Référence de la transaction') : t('Référence (n° de chèque ou de virement, facultatif)')
              }
              name="reference"
              extra={marquerChamp('reference')}
              rules={[
                ...(isMobile ? [{ required: true, message: t('La référence de la transaction est requise') }] : []),
                {
                  validator: (_, value?: string) =>
                    !value || isValidTransactionReference(normalizeTransactionReference(value))
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error(
                            t('La référence doit comporter 4 à 40 caractères (lettres, chiffres, point, tiret).')
                          )
                        )
                }
              ]}
            >
              <Input
                placeholder={isMobile ? t('Numéro de transaction reçu par SMS') : t('Ex. numéro du chèque')}
                maxLength={60}
                autoCapitalize="characters"
                style={{ minHeight: TOUCH_TARGET }}
              />
            </Form.Item>

            <Form.Item
              label={t('Montant')}
              name="amount"
              extra={marquerChamp('amount')}
              rules={[
                { required: true, message: t('Le montant est requis') },
                { type: 'number', min: 0.01, message: t('Le montant doit être positif') },
                {
                  validator: () =>
                    caractereRefuse.current ? Promise.reject(new Error(messageCaractere())) : Promise.resolve()
                },
                {
                  validator: (_, value?: number) =>
                    typeof value === 'number' && value > 0 && !Number.isInteger(value)
                      ? Promise.reject(new Error(t('Saisissez un montant entier en FCFA.')))
                      : Promise.resolve()
                },
                {
                  validator: (_, value?: number) =>
                    typeof value === 'number' && value > maxAmount
                      ? Promise.reject(
                          new Error(
                            t('Le montant ne peut pas dépasser {{montant}}.', {
                              montant: formatMontantLocatif(maxAmount)
                            })
                          )
                        )
                      : Promise.resolve()
                }
              ]}
            >
              {/*
                BUG-2026-11-04-043 : ni `min` (InputNumber recadrerait -1 en 0,01 sans rien
                dire : la règle ci-dessus le refuse avec un message), ni `precision={0}`
                (qui arrondissait 0,01 en 1). La virgule décimale de la langue est lue ;
                l'API attend un entier : une décimale est refusée avec un message.
              */}
              <InputNumber
                prefix={<DollarOutlined />}
                style={{ width: '100%', minHeight: TOUCH_TARGET }}
                placeholder={t('Ex. 150 000')}
                step={1000}
                inputMode="decimal"
                onKeyDown={refuserCaractereInvalide}
                // Champ vidé : on repart de zéro.
                onChange={valeur => {
                  if (valeur === null || valeur === '') caractereRefuse.current = false;
                }}
                {...montantSaisiProps}
              />
            </Form.Item>

            <Form.Item
              label={t('Date et heure du paiement')}
              name="paidAt"
              extra={marquerChamp('paidAt')}
              rules={[
                { required: true, message: t('La date de paiement est requise') },
                {
                  validator: (_, value?: Dayjs) => {
                    if (!value) return Promise.resolve();
                    if (value.isAfter(dayjs().add(PAID_AT_FUTURE_TOLERANCE_MINUTES, 'minute'))) {
                      return Promise.reject(new Error(t('La date du paiement ne peut pas être dans le futur.')));
                    }
                    if (value.isBefore(dayjs().subtract(PAID_AT_MAX_AGE_DAYS, 'day'))) {
                      return Promise.reject(
                        new Error(
                          t('Le paiement date de plus de {{jours}} jours : contactez votre agence.', {
                            jours: PAID_AT_MAX_AGE_DAYS
                          })
                        )
                      );
                    }
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                style={{ width: '100%', minHeight: TOUCH_TARGET }}
                format="DD/MM/YYYY HH:mm"
                disabledDate={current => current && current > dayjs().endOf('day')}
                placeholder={t('Sélectionner la date')}
              />
            </Form.Item>

            <Form.Item
              label={t('Capture du paiement')}
              required={isMobile && Boolean(availability?.proofRequired)}
              extra={
                <Text type="secondary">
                  {isMobile && availability?.proofRequired
                    ? t('Obligatoire. Image JPEG, PNG, WebP ou PDF (5 Mo au plus).')
                    : t('Facultative. Image JPEG, PNG, WebP ou PDF (5 Mo au plus).')}
                  {isMobile && availability?.aiPrefillAvailable
                    ? ` ${t('Nous pouvons lire la capture pour pré-remplir le formulaire ; vous gardez la main sur chaque champ.')}`
                    : ''}
                </Text>
              }
            >
              <Upload
                fileList={fileList}
                onChange={handleFileChange}
                beforeUpload={beforeUpload}
                maxCount={1}
                accept="image/jpeg,image/png,image/webp,.pdf"
              >
                <Button icon={<UploadOutlined />} style={{ minHeight: TOUCH_TARGET }}>
                  {t('Joindre la capture')}
                </Button>
              </Upload>
              {reading ? (
                <Space style={{ marginTop: 8 }}>
                  <Spin size="small" />
                  <Text type="secondary">{t('Lecture de la capture…')}</Text>
                </Space>
              ) : null}
            </Form.Item>

            {readWarnings.includes('REFERENCE_ALREADY_DECLARED') ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('Cette référence a déjà été déclarée. Vérifiez-la avant d’envoyer.')}
              />
            ) : null}
            {readWarnings.includes('RECIPIENT_NOT_A_RECEIVING_NUMBER') ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('Le destinataire lu sur la capture ne correspond à aucun numéro de votre agence.')}
              />
            ) : null}

            <Form.Item label={t('Notes (optionnel)')} name="notes" rules={[{ max: 500 }]}>
              <TextArea rows={3} maxLength={500} placeholder={t('Informations complémentaires sur ce paiement...')} />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={handleCancel} style={{ minHeight: TOUCH_TARGET }}>
                  {t('Annuler')}
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  disabled={
                    mobileSansNumero || (isMobile && Boolean(availability?.proofRequired) && fileList.length === 0)
                  }
                  style={{ minHeight: TOUCH_TARGET }}
                >
                  {t('Déclarer le paiement')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Space>
      )}
    </Modal>
  );
}
