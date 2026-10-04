import React from 'react';
import { Button, DatePicker, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { dateFormat } from '../../../../i18n/format';
import { t } from '../../../../i18n/t';

const { Text } = Typography;

/**
 * Dates de mouvement (ecrans §3.8, spec A5-R4), partagées par l'écran Magasin
 * et l'écran Transferts et inventaire : aujourd'hui par défaut, jamais dans le
 * futur, jamais avant aujourd'hui − `backdatingLimitDays`.
 */

/** Aujourd'hui, au format du contrat (`AAAA-MM-JJ`). */
export function aujourdhuiIso(): string {
  return dayjs().format('YYYY-MM-DD');
}

/** Vrai pour un jour qui ne peut pas être choisi. */
export function jourInterdit(jour: Dayjs, backdatingLimitDays: number): boolean {
  const aujourdhui = dayjs().startOf('day');
  const borne = aujourdhui.subtract(Math.max(0, backdatingLimitDays), 'day');
  const candidat = jour.startOf('day');
  return candidat.isAfter(aujourdhui) || candidat.isBefore(borne);
}

/** Aide affichée sous le sélecteur de date. */
export function aideDateMouvement(backdatingLimitDays: number): string {
  if (backdatingLimitDays <= 0) return t('Aujourd’hui seulement.');
  return t('Au plus {{n}} jours en arrière. La date de saisie réelle est enregistrée à côté.', {
    n: backdatingLimitDays
  });
}

export interface DateMouvementProps {
  id?: string;
  value: Dayjs | null;
  onChange: (value: Dayjs | null) => void;
  backdatingLimitDays: number;
  /** Refus du serveur (`STOCK_DATE_IN_FUTURE`, `STOCK_DATE_TOO_OLD`) : le champ est mis en erreur. */
  error?: string | null;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * La date d'un geste de l'écran Magasin (ecrans §3.8) : elle n'est pas
 * demandée, elle vaut aujourd'hui ; un lien discret « Changer la date » ouvre
 * le sélecteur.
 */
export const DateDuGeste: React.FC<{
  value: Dayjs;
  onChange: (value: Dayjs) => void;
  backdatingLimitDays: number;
  error?: string | null;
  disabled?: boolean;
}> = ({ value, onChange, backdatingLimitDays, error, disabled }) => {
  const [ouvert, setOuvert] = React.useState(Boolean(error));
  const estAujourdhui = value.isSame(dayjs(), 'day');
  if (!ouvert && !error) {
    return (
      <span>
        {estAujourdhui ? t('Aujourd’hui') : value.format(dateFormat('short'))}{' '}
        {backdatingLimitDays > 0 ? (
          <Button
            type="link"
            onClick={() => setOuvert(true)}
            disabled={disabled}
            style={{ paddingInline: 4, minHeight: 44 }}
          >
            {t('Changer la date')}
          </Button>
        ) : null}
      </span>
    );
  }
  return (
    <DateMouvement
      aria-label={t('Date')}
      value={value}
      onChange={next => {
        if (next) onChange(next);
      }}
      backdatingLimitDays={backdatingLimitDays}
      error={error}
      disabled={disabled}
    />
  );
};

/** Sélecteur de date d'un mouvement ou d'un inventaire, avec son aide et son erreur. */
export const DateMouvement: React.FC<DateMouvementProps> = ({
  id,
  value,
  onChange,
  backdatingLimitDays,
  error,
  disabled,
  'aria-label': ariaLabel
}) => (
  <div>
    <DatePicker
      id={id}
      aria-label={ariaLabel}
      style={{ width: '100%', minHeight: 44 }}
      format={dateFormat('short')}
      value={value}
      allowClear={false}
      disabled={disabled}
      status={error ? 'error' : undefined}
      disabledDate={jour => jourInterdit(jour, backdatingLimitDays)}
      onChange={next => onChange(next ?? null)}
    />
    <Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
      {aideDateMouvement(backdatingLimitDays)}
    </Text>
    {error ? (
      <Text type="danger" role="alert" style={{ display: 'block' }}>
        {error}
      </Text>
    ) : null}
  </div>
);
