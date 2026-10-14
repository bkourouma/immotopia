import React, { useMemo, useState } from 'react';
import { Button, Input, Select, Space, Typography } from 'antd';
import { StockTakerForm } from './StockTakerForm';
import type { RequesterFields, StockPerson, StockTakerView } from '../../../types/finance-stock-controle-types';
import { t } from '../../../i18n/t';

const { Text } = Typography;

export interface StockTakerSelectProps {
  /** Le demandeur : un preneur du carnet (`takerId`), ou un nom saisi (`requestedBy`). */
  value: RequesterFields;
  onChange: (value: RequesterFields) => void;
  /** Les preneurs du carnet (`FieldContext.takers`) ; seuls les actifs sont proposés. */
  takers: StockTakerView[];
  /** Réglage de l'agence : vrai, un preneur du carnet est exigé (pas de nom libre). */
  requireTaker: boolean;
  /** STOCK_TAKERS_MANAGE : propose « Ajouter un preneur… ». */
  canManageTakers: boolean;
  /** Employés et tâcherons liables, transmis au formulaire d'ajout. */
  people: StockPerson[];
  tenantId?: string;
  disabled?: boolean;
  /** Le serveur a refusé le demandeur (STOCK_TAKER_REQUIRED, STOCK_REQUESTER_REQUIRED, STOCK_TAKER_INACTIVE). */
  error?: string | null;
}

const ADD_OPTION = '__ajouter__';

/** Longueur maximale d'un demandeur saisi (contrat `RequesterFields`). */
export const STOCK_REQUESTER_MAX_LENGTH = 200;

/**
 * Choix du preneur d'une sortie ou d'un transfert (spec B2-R3, ecrans §4).
 *
 * Liste cherchable des preneurs actifs (« Nom — Équipe ») ; en tête, «
 * Ajouter un preneur… » pour qui gère le carnet, qui ouvre le formulaire en
 * ligne et sélectionne le preneur créé. Sans `requireTaker`, un lien bascule
 * sur un nom saisi sans l'ajouter au carnet ; avec `requireTaker`, ce lien
 * n'existe pas et l'aide le dit.
 */
export const StockTakerSelect: React.FC<StockTakerSelectProps> = ({
  value,
  onChange,
  takers,
  requireTaker,
  canManageTakers,
  people,
  tenantId,
  disabled,
  error
}) => {
  const [adding, setAdding] = useState(false);
  const [freeText, setFreeText] = useState(Boolean(!requireTaker && value.requestedBy && !value.takerId));
  const [created, setCreated] = useState<StockTakerView[]>([]);

  const options = useMemo(() => {
    const known = new Map<string, StockTakerView>();
    for (const taker of [...takers, ...created]) {
      if (taker.isActive) known.set(taker.id, taker);
    }
    const list = [...known.values()]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(taker => ({ value: taker.id, label: taker.label }));
    return canManageTakers ? [{ value: ADD_OPTION, label: t('Ajouter un preneur…') }, ...list] : list;
  }, [takers, created, canManageTakers]);

  const useFreeText = !requireTaker && freeText;

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {useFreeText ? (
        <Input
          aria-label={t('Nom du demandeur')}
          placeholder={t('Nom du demandeur')}
          value={value.requestedBy ?? ''}
          maxLength={STOCK_REQUESTER_MAX_LENGTH}
          disabled={disabled}
          status={error ? 'error' : undefined}
          onChange={event => onChange({ requestedBy: event.target.value })}
          style={{ minHeight: 44 }}
        />
      ) : (
        <Select
          aria-label={t('Preneur')}
          placeholder={t('Choisir la personne qui emporte la marchandise')}
          showSearch
          optionFilterProp="label"
          value={value.takerId}
          disabled={disabled}
          status={error ? 'error' : undefined}
          options={options}
          style={{ width: '100%', minHeight: 44 }}
          onChange={(selected: string) => {
            if (selected === ADD_OPTION) {
              setAdding(true);
              return;
            }
            onChange({ takerId: selected });
          }}
        />
      )}

      {error ? (
        <Text type="danger" role="alert">
          {error}
        </Text>
      ) : null}

      {requireTaker ? (
        <Text type="secondary">
          {t('Votre agence exige un preneur du carnet pour chaque sortie et chaque transfert.')}
        </Text>
      ) : (
        <Button
          type="link"
          style={{ paddingInline: 0, alignSelf: 'flex-start' }}
          disabled={disabled}
          onClick={() => {
            const next = !freeText;
            setFreeText(next);
            onChange(next ? { requestedBy: '' } : {});
          }}
        >
          {useFreeText ? t('Choisir un preneur du carnet') : t('Saisir un nom sans l’ajouter au carnet')}
        </Button>
      )}

      {adding && canManageTakers ? (
        <div style={{ borderInlineStart: '3px solid var(--border-subtle)', paddingInlineStart: 12 }}>
          <StockTakerForm
            tenantId={tenantId}
            people={people}
            onCancel={() => setAdding(false)}
            onDuplicate={existingTakerId => {
              setAdding(false);
              setFreeText(false);
              onChange({ takerId: existingTakerId });
            }}
            onCreated={taker => {
              setCreated(previous => [...previous, taker]);
              setAdding(false);
              setFreeText(false);
              onChange({ takerId: taker.id });
            }}
          />
        </div>
      ) : null}
    </Space>
  );
};

export default StockTakerSelect;
