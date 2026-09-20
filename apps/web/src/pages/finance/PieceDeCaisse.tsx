import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Card, DatePicker, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import { CopyOutlined, PrinterOutlined, SendOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  createCashVoucher,
  getCashVoucherPdfUrl,
  listConstructionSites,
  listCostCategories,
  validateCashVoucher,
  voidCashVoucher
} from '../../services/finance-lot2-service';
import { DOCUMENT_STATUS_LABELS } from '../../types/finance-lot2-types';
import type { CashVoucher, DocumentStatus } from '../../types/finance-lot2-types';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, StatusTag, ConfirmAction } from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';
import { t } from '../../i18n/t';
import { montantSaisiProps } from '../../utils/montant-saisi';

import { activeLocale } from '../../i18n/format';
const { TextArea } = Input;
const { Title, Text } = Typography;

/**
 * Pièce de caisse — récit B10 du lot 2
 * (specs/017-finance-fournisseurs-chantiers/spec.md, User Story 10).
 *
 * Formulaire court — bénéficiaire, montant, date, chantier, poste, motif — qui
 * émet la pièce, puis la présente avec ses deux gestes suivants : valider et
 * imprimer.
 *
 * **Le numéro (`CashVoucher.number`) n'existe pas avant la validation.** Il est
 * posé par le serveur à ce moment-là, jamais saisi, et vaut `null` tant que la
 * pièce est un brouillon — un brouillon abandonné ne consomme ainsi aucun
 * numéro et ne laisse pas de trou dans le carnet (décision de la cliente du
 * 19 septembre 2026). Cet écran désigne donc une pièce non validée par son
 * bénéficiaire, jamais par un numéro qu'elle n'a pas encore.
 *
 * **La caisse est unique par agence (décision actée le 18 septembre 2026,
 * spec.md « Décision actée : la caisse »).** La gestionnaire émet, le
 * dirigeant valide — un seul geste de validation, sans notion de « caissier »
 * distinct. C'est pourquoi cet écran ne propose qu'un unique bouton
 * « Valider », sans sélection de caisse.
 *
 * **La validation est irréversible, et le dit avant, pas après.** Contrairement
 * à la relance de campagne du lot 1 (`Facturation.tsx`), sans risque et donc
 * sans avertissement, une pièce de caisse validée ne se modifie plus : le
 * bouton est `danger`, et `<ConfirmAction>` porte explicitement la mention de
 * l'irréversibilité dans sa description.
 *
 * **L'état de liste ne s'applique pas ici** : ce n'est pas une liste mais un
 * geste ponctuel. Le seul état porté par l'URL est le chantier préremply
 * lorsqu'on arrive depuis `ChantierDetail.tsx` (`?chantierId=`), en cohérence
 * avec le principe général — un lien partagé rouvre le même contexte.
 *
 * **Dupliquer.** Beaucoup de pièces se ressemblent d'un mois à l'autre. Il
 * n'existe aucune LISTE des pièces de caisse dans l'application : la
 * duplication ne peut donc porter que sur la pièce qui vient d'être émise et
 * qui est affichée ci-dessous. Son bouton est posé à côté d'« Émettre une
 * nouvelle pièce », qui remet déjà le formulaire à zéro : le geste voisin
 * remet le formulaire à zéro *puis* le re-remplit d'après la pièce affichée.
 * **Rien n'est créé** : la pièce ne naît qu'au bouton « Émettre la pièce ».
 * Une pièce ANNULÉE se duplique aussi — on annule justement pour ressaisir.
 *
 * Une pièce de caisse n'a pas de référence saisie (son numéro vient du
 * serveur, à la validation) : la règle « la référence de la copie est vide »
 * ne trouve donc rien à vider ici. La date, elle, redevient celle du jour.
 *
 * **Vocabulaire (P-1).** On *impute*, jamais « débit » ni « crédit ».
 */

const TONE_PIECE: Record<DocumentStatus, StatusTone> = {
  DRAFT: 'neutral',
  VALIDATED: 'success',
  VOIDED: 'danger'
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(activeLocale());
}

export const PieceDeCaisse: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams] = useSearchParams();
  const chantierPreselectionne = searchParams.get('chantierId') || undefined;

  const [siteId, setSiteId] = useState<string | undefined>(chantierPreselectionne);
  const [costCategoryId, setCostCategoryId] = useState<string | undefined>(undefined);
  const [beneficiaire, setBeneficiaire] = useState('');
  const [montant, setMontant] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs>(() => dayjs());
  const [motif, setMotif] = useState('');

  const [emissionEnCours, setEmissionEnCours] = useState(false);
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [annulationOuverte, setAnnulationOuverte] = useState(false);
  const [motifAnnulation, setMotifAnnulation] = useState('');
  const [annulationEnCours, setAnnulationEnCours] = useState(false);
  const [piece, setPiece] = useState<CashVoucher | null>(null);

  const { data: chantiers } = useQuery({
    queryKey: queryKey('construction-sites', tenantId, {}),
    queryFn: () => listConstructionSites(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const { data: postes } = useQuery({
    queryKey: queryKey('cost-categories', tenantId, {}),
    queryFn: () => listCostCategories(tenantId as string),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.reference
  });

  const optionsChantiers = (chantiers ?? []).map(chantier => ({ value: chantier.id, label: chantier.name }));
  const optionsPostes = (postes ?? [])
    .filter(poste => poste.isActive)
    .sort((a, b) => a.position - b.position)
    .map(poste => ({ value: poste.id, label: poste.label }));

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const reinitialiserFormulaire = () => {
    setSiteId(chantierPreselectionne);
    setCostCategoryId(undefined);
    setBeneficiaire('');
    setMontant(null);
    setDate(dayjs());
    setMotif('');
  };

  const emettre = async () => {
    if (!siteId || !costCategoryId || !beneficiaire.trim() || !montant || montant <= 0 || !motif.trim()) {
      message.error(t('Renseignez le chantier, le poste, le bénéficiaire, un montant positif et le motif.'));
      return;
    }
    setEmissionEnCours(true);
    try {
      const nouvellePiece = await createCashVoucher(tenantId, {
        siteId,
        costCategoryId,
        beneficiary: beneficiaire.trim(),
        amount: montant,
        voucherDate: date.format('YYYY-MM-DD'),
        reason: motif.trim()
      });
      setPiece(nouvellePiece);
      // Pas de numéro à annoncer : il sera attribué à la validation.
      message.success(t('Pièce de caisse émise pour {{beneficiary}}.', { beneficiary: nouvellePiece.beneficiary }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'émission de la pièce de caisse a échoué."));
    } finally {
      setEmissionEnCours(false);
    }
  };

  const valider = async () => {
    if (!piece) return;
    setValidationEnCours(true);
    try {
      const pieceValidee = await validateCashVoucher(tenantId, piece.id);
      setPiece(pieceValidee);
      // Ici le numéro existe : c'est la validation qui vient de le poser.
      message.success(t('Pièce {{number}} validée.', { number: pieceValidee.number }));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La validation a échoué.'));
    } finally {
      setValidationEnCours(false);
    }
  };

  /**
   * Annule une pièce validée, par une pièce d'annulation liée.
   *
   * On ne modifie jamais une pièce validée (principe P-6) : on en crée une
   * seconde qui porte l'écriture inverse, et l'historique montre les deux. Le
   * coût du chantier retombe tout seul, puisqu'il est dérivé des imputations
   * validées et non annulées.
   */
  const annuler = async () => {
    if (!tenantId || !piece || !motifAnnulation.trim()) return;
    setAnnulationEnCours(true);
    try {
      await voidCashVoucher(tenantId, piece.id, motifAnnulation.trim());
      setPiece({ ...piece, status: 'VOIDED' });
      setAnnulationOuverte(false);
      setMotifAnnulation('');
      message.success(t('Pièce de caisse annulée.'));
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'annulation a échoué."));
    } finally {
      setAnnulationEnCours(false);
    }
  };

  const imprimer = () => {
    if (!piece) return;
    const url = getCashVoucherPdfUrl(tenantId, piece.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const nouvellePiece = () => {
    setPiece(null);
    reinitialiserFormulaire();
  };

  /**
   * Repart de la pièce affichée : même chantier, même poste, même
   * bénéficiaire, même montant, même motif — date du jour.
   *
   * **N'appelle aucune écriture.** Le formulaire redevient saisissable et
   * pré-rempli ; c'est « Émettre la pièce » qui créera la nouvelle pièce, et
   * lui seul. Ce qui n'est jamais repris : le numéro, le statut, la date de
   * validation.
   */
  const dupliquerPiece = () => {
    if (!piece) return;
    const source = piece;
    setPiece(null);
    setSiteId(source.siteId);
    setCostCategoryId(source.costCategoryId);
    setBeneficiaire(source.beneficiary);
    setMontant(source.amount);
    setDate(dayjs());
    setMotif(source.reason);
    // `beneficiary` est toujours présent sur une pièce émise : rien
    // d'`undefined` ne part dans l'interpolation, qui laisserait sinon le
    // gabarit `{{beneficiary}}` visible à l'écran.
    message.info(
      t("Formulaire pré-rempli d'après la pièce de {{beneficiary}}. Vérifiez la date.", {
        beneficiary: source.beneficiary
      })
    );
  };

  const formulaireVerrouille = Boolean(piece);

  return (
    <>
      <PageHeader
        title={t('Pièce de caisse')}
        breadcrumbs={[
          { label: 'Finance', to: `/tenant/${tenantId}/finance/chantiers` },
          { label: 'Chantiers', to: `/tenant/${tenantId}/finance/chantiers` },
          { label: t('Pièce de caisse') }
        ]}
      />

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <Title level={4} style={{ marginTop: 0 }}>
          {t('Émettre une pièce')}
        </Title>

        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap size="middle" style={{ width: '100%' }}>
            <div style={{ minWidth: 240 }}>
              <label htmlFor="caisse-chantier">{t('Chantier')}</label>
              <Select
                id="caisse-chantier"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                placeholder={t('Choisir le chantier')}
                value={siteId}
                onChange={setSiteId}
                options={optionsChantiers}
                disabled={formulaireVerrouille}
              />
            </div>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="caisse-poste">{t('Poste de dépense')}</label>
              <Select
                id="caisse-poste"
                style={{ width: '100%' }}
                placeholder={t('Choisir le poste')}
                value={costCategoryId}
                onChange={setCostCategoryId}
                showSearch
                optionFilterProp="label"
                options={optionsPostes}
                disabled={formulaireVerrouille}
              />
            </div>
          </Space>

          <Space wrap size="middle" style={{ width: '100%' }}>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="caisse-beneficiaire">{t('Bénéficiaire')}</label>
              <Input
                id="caisse-beneficiaire"
                value={beneficiaire}
                onChange={event => setBeneficiaire(event.target.value)}
                disabled={formulaireVerrouille}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label htmlFor="caisse-montant">{t('Montant (FCFA)')}</label>
              <InputNumber
                id="caisse-montant"
                style={{ width: '100%' }}
                min={1}
                step={1000}
                value={montant ?? undefined}
                onChange={valeur => setMontant(typeof valeur === 'number' ? valeur : null)}
                disabled={formulaireVerrouille}
                {...montantSaisiProps}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label htmlFor="caisse-date">{t('Date')}</label>
              <DatePicker
                id="caisse-date"
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                value={date}
                onChange={valeur => valeur && setDate(valeur)}
                disabled={formulaireVerrouille}
              />
            </div>
          </Space>

          <div>
            <label htmlFor="caisse-motif">{t('Motif')}</label>
            <TextArea
              id="caisse-motif"
              rows={2}
              value={motif}
              onChange={event => setMotif(event.target.value)}
              disabled={formulaireVerrouille}
            />
          </div>

          {!piece ? (
            <Button type="primary" icon={<SendOutlined />} loading={emissionEnCours} onClick={emettre}>
              {t('Émettre la pièce')}
            </Button>
          ) : (
            <Space wrap size="small">
              <Button onClick={nouvellePiece}>{t('Émettre une nouvelle pièce')}</Button>
              {/*
                Sans condition de statut : une pièce annulée se duplique aussi.
              */}
              <Button icon={<CopyOutlined />} onClick={dupliquerPiece}>
                {t('Dupliquer')}
              </Button>
            </Space>
          )}
        </Space>
      </Card>

      {piece && (
        <Card>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)'
            }}
          >
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {piece.number
                  ? t('Pièce {{number}}', { number: piece.number })
                  : t('Pièce à valider — {{beneficiary}}', { beneficiary: piece.beneficiary })}
              </Title>
              <Text type="secondary">
                {piece.siteLabel} · {piece.costCategoryLabel}
              </Text>
            </div>
            <StatusTag
              status={piece.status}
              tone={TONE_PIECE[piece.status]}
              label={DOCUMENT_STATUS_LABELS[piece.status]}
            />
          </div>

          <Space orientation="vertical" size="small" style={{ display: 'flex', marginBottom: 'var(--space-4)' }}>
            <Text>
              {t('Bénéficiaire :')} <strong>{piece.beneficiary}</strong>
            </Text>
            <Text>
              {t('Montant :')} <MoneyValue value={piece.amount} />
            </Text>
            <Text>
              {t('Date :')} {dateCourte(piece.voucherDate)}
            </Text>
            <Text>
              {t('Motif :')} {piece.reason}
            </Text>
          </Space>

          <Space wrap>
            {piece.status === 'DRAFT' && (
              <ConfirmAction
                title={t('Valider la pièce de {{beneficiary}} ?', { beneficiary: piece.beneficiary })}
                description={t(
                  "La validation est irréversible : une fois validée, cette pièce ne peut plus être ni modifiée ni reprise depuis cet écran. C'est à cet instant qu'elle reçoit son numéro."
                )}
                okText={t('Valider')}
                danger
                onConfirm={valider}
              >
                <Button danger loading={validationEnCours}>
                  {t('Valider la pièce')}
                </Button>
              </ConfirmAction>
            )}
            {piece.status === 'VALIDATED' && (
              <Button danger onClick={() => setAnnulationOuverte(true)}>
                {t('Annuler la pièce')}
              </Button>
            )}
            <Button icon={<PrinterOutlined />} onClick={imprimer}>
              {t('Imprimer le bon')}
            </Button>
          </Space>
        </Card>
      )}

      <Modal
        title={t('Annuler cette pièce de caisse ?')}
        open={annulationOuverte}
        onCancel={() => setAnnulationOuverte(false)}
        onOk={annuler}
        okText={t("Confirmer l'annulation")}
        okButtonProps={{ danger: true, disabled: !motifAnnulation.trim(), loading: annulationEnCours }}
        cancelText={t('Renoncer')}
        destroyOnHidden
      >
        <Text type="secondary">
          {t(
            "Une pièce d'annulation liée sera créée. La pièce d'origine reste conservée avec son numéro, mais son montant ne compte plus dans le coût du chantier."
          )}
        </Text>
        <div style={{ marginTop: 'var(--space-4)' }}>
          <label htmlFor="motif-annulation-piece">{t("Motif de l'annulation")}</label>
          <Input.TextArea
            id="motif-annulation-piece"
            rows={3}
            value={motifAnnulation}
            onChange={event => setMotifAnnulation(event.target.value)}
            placeholder={t('Ex. Erreur sur le bénéficiaire')}
          />
        </div>
      </Modal>
    </>
  );
};

export default PieceDeCaisse;
