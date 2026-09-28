import React from 'react';
import { Col, Row } from 'antd';
import { PatrimoineOverviewData } from '../../types/patrimoine-types';
import { StatCard, MoneyValue } from '../primitives';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
interface Props {
  data: PatrimoineOverviewData;
}

/**
 * Indicateurs consolidés du patrimoine (REFONTE_UI_UX.md §5.1, §6.2).
 *
 * Trois défauts, tous visibles à l'écran et tous corrigés ici :
 *
 * - **Les montants étaient suffixés `XOF`** par un littéral écrit en dur :
 *   la devise ne venait pas de la donnée, et un montant libellé autrement
 *   s'affichait sous une devise qui n'était pas la sienne.
 *   `<MoneyValue>` la rend, avec la mise en forme française.
 * - **Les nombres portaient des séparateurs anglais** — `4,820,000,000` — là
 *   où le français attend une espace insécable.
 * - **Le taux s'affichait « 86.00 % »**, avec un point décimal.
 *
 * Les `<Statistic>` d'Ant Design sont remplacés par `<StatCard>` : même
 * information, mais une seule définition de la taille, de la couleur et de
 * l'ordre de lecture — le libellé précède la valeur dans le DOM, ce qui change
 * ce qu'annonce un lecteur d'écran.
 */
export const PatrimoineOverview: React.FC<Props> = ({ data }) => {
  const tauxOccupation = new Intl.NumberFormat(activeLocale(), {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(data.occupancyRate);

  const indicateurs = [
    {
      label: t('Biens au portefeuille'),
      value: String(data.totalProperties),
      // Deux phrases complètes plutôt qu'un « s » collé au mot : l'accord
      // n'est pas le même dans toutes les langues, et `t()` n'a pas de pluriel.
      hint:
        data.occupiedProperties > 1
          ? t('dont {{occupiedProperties}} occupés', { occupiedProperties: data.occupiedProperties })
          : t('dont {{occupiedProperties}} occupé', { occupiedProperties: data.occupiedProperties })
    },
    {
      label: t("Taux d'occupation"),
      value: tauxOccupation,
      // Sous 80 %, l'agence a du vide à combler : l'indicateur le dit sans
      // qu'on ait à comparer deux chiffres.
      tone:
        data.occupancyRate >= 0.9 ? ('positive' as const) : data.occupancyRate >= 0.8 ? undefined : ('warning' as const)
    },
    { label: t('Valeur estimée totale'), value: <MoneyValue value={data.totalEstimatedValue} /> },
    { label: t('Encours de crédits'), value: <MoneyValue value={data.totalLoanBalance} /> },
    { label: t('Charges de l’année'), value: <MoneyValue value={data.totalExpensesThisYear} /> },
    { label: t('Loyers annuels'), value: <MoneyValue value={data.totalAnnualRent} />, tone: 'positive' as const }
  ];

  return (
    <Row gutter={[16, 16]}>
      {indicateurs.map(indicateur => (
        <Col xs={24} sm={12} lg={8} key={indicateur.label}>
          <StatCard label={indicateur.label} value={indicateur.value} hint={indicateur.hint} tone={indicateur.tone} />
        </Col>
      ))}
    </Row>
  );
};
