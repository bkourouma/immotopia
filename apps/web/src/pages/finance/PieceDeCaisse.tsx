import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Card, DatePicker, Input, InputNumber, Select, Space, Typography } from 'antd';
import { PrinterOutlined, SendOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import {
  createCashVoucher,
  getCashVoucherPdfUrl,
  listConstructionSites,
  listCostCategories,
  validateCashVoucher
} from '../../services/finance-lot2-service';
import { DOCUMENT_STATUS_LABELS } from '../../types/finance-lot2-types';
import type { CashVoucher, DocumentStatus } from '../../types/finance-lot2-types';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, StatusTag, ConfirmAction } from '../../components/primitives';
import type { StatusTone } from '../../components/primitives';

const { TextArea } = Input;
const { Title, Text } = Typography;

/**
 * Pièce de caisse — récit B10 du lot 2
 * (specs/017-finance-fournisseurs-chantiers/spec.md, User Story 10).
 *
 * Formulaire court — bénéficiaire, montant, date, chantier, poste, motif — qui
 * émet la pièce, puis la présente avec ses deux gestes suivants : valider et
 * imprimer. Le numéro (`CashVoucher.number`) est posé par le serveur à
 * l'émission, jamais saisi.
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
 * **Vocabulaire (P-1).** On *impute*, jamais « débit » ni « crédit ».
 */

const TONE_PIECE: Record<DocumentStatus, StatusTone> = {
  DRAFT: 'neutral',
  VALIDATED: 'success',
  VOIDED: 'danger'
};

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR');
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
    return <StateBlock variant="empty" title="Aucune agence sélectionnée" />;
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
      message.error('Renseignez le chantier, le poste, le bénéficiaire, un montant positif et le motif.');
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
      message.success(`Pièce de caisse ${nouvellePiece.number} émise.`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || "L'émission de la pièce de caisse a échoué.");
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
      message.success(`Pièce ${pieceValidee.number} validée.`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'La validation a échoué.');
    } finally {
      setValidationEnCours(false);
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

  const formulaireVerrouille = Boolean(piece);

  return (
    <>
      <PageHeader
        title="Pièce de caisse"
        breadcrumbs={[
          { label: 'Finance', to: `/tenant/${tenantId}/finance/chantiers` },
          { label: 'Chantiers', to: `/tenant/${tenantId}/finance/chantiers` },
          { label: 'Pièce de caisse' }
        ]}
      />

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <Title level={4} style={{ marginTop: 0 }}>
          Émettre une pièce
        </Title>

        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap size="middle" style={{ width: '100%' }}>
            <div style={{ minWidth: 240 }}>
              <label htmlFor="caisse-chantier">Chantier</label>
              <Select
                id="caisse-chantier"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                placeholder="Choisir le chantier"
                value={siteId}
                onChange={setSiteId}
                options={optionsChantiers}
                disabled={formulaireVerrouille}
              />
            </div>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="caisse-poste">Poste de dépense</label>
              <Select
                id="caisse-poste"
                style={{ width: '100%' }}
                placeholder="Choisir le poste"
                value={costCategoryId}
                onChange={setCostCategoryId}
                options={optionsPostes}
                disabled={formulaireVerrouille}
              />
            </div>
          </Space>

          <Space wrap size="middle" style={{ width: '100%' }}>
            <div style={{ minWidth: 220 }}>
              <label htmlFor="caisse-beneficiaire">Bénéficiaire</label>
              <Input
                id="caisse-beneficiaire"
                value={beneficiaire}
                onChange={event => setBeneficiaire(event.target.value)}
                disabled={formulaireVerrouille}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label htmlFor="caisse-montant">Montant (FCFA)</label>
              <InputNumber
                id="caisse-montant"
                style={{ width: '100%' }}
                min={1}
                step={1000}
                value={montant ?? undefined}
                onChange={valeur => setMontant(typeof valeur === 'number' ? valeur : null)}
                disabled={formulaireVerrouille}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label htmlFor="caisse-date">Date</label>
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
            <label htmlFor="caisse-motif">Motif</label>
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
              Émettre la pièce
            </Button>
          ) : (
            <Button onClick={nouvellePiece}>Émettre une nouvelle pièce</Button>
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
                Pièce {piece.number}
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
              Bénéficiaire : <strong>{piece.beneficiary}</strong>
            </Text>
            <Text>
              Montant : <MoneyValue value={piece.amount} />
            </Text>
            <Text>Date : {dateCourte(piece.voucherDate)}</Text>
            <Text>Motif : {piece.reason}</Text>
          </Space>

          <Space wrap>
            {piece.status === 'DRAFT' && (
              <ConfirmAction
                title={`Valider la pièce ${piece.number} ?`}
                description="La validation est irréversible : une fois validée, cette pièce ne peut plus être ni modifiée ni reprise depuis cet écran."
                okText="Valider"
                danger
                onConfirm={valider}
              >
                <Button danger loading={validationEnCours}>
                  Valider la pièce
                </Button>
              </ConfirmAction>
            )}
            <Button icon={<PrinterOutlined />} onClick={imprimer}>
              Imprimer le bon
            </Button>
          </Space>
        </Card>
      )}
    </>
  );
};

export default PieceDeCaisse;
