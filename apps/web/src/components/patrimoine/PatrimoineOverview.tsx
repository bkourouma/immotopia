import React from 'react';
import { Col, Row } from 'antd';
import { PatrimoineOverviewData } from '../../types/patrimoine-types';
import { StatCard, MoneyValue } from '../primitives';

interface Props {
  data: PatrimoineOverviewData;
}

/**
 * Indicateurs consolidés du patrimoine (REFONTE_UI_UX.md §5.1, §6.2).
 *
 * Trois défauts, tous visibles à l'écran et tous corrigés ici :
 *
 * - **Les montants étaient suffixés `XOF`**, le franc CFA d'Afrique de
 *   l'Ouest. L'application sert la Guinée, dont la monnaie est le **franc
 *   guinéen** ; la devise venait d'un suffixe écrit en dur, pas de la donnée.
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
  const tauxOccupation = new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(data.occupancyRate);

  const indicateurs = [
    {
      label: 'Biens au portefeuille',
      value: String(data.totalProperties),
      hint: `dont ${data.occupiedProperties} occupé${data.occupiedProperties > 1 ? 's' : ''}`
    },
    {
      label: "Taux d'occupation",
      value: tauxOccupation,
      // Sous 80 %, l'agence a du vide à combler : l'indicateur le dit sans
      // qu'on ait à comparer deux chiffres.
      tone:
        data.occupancyRate >= 0.9 ? ('positive' as const) : data.occupancyRate >= 0.8 ? undefined : ('warning' as const)
    },
    { label: 'Valeur estimée totale', value: <MoneyValue value={data.totalEstimatedValue} /> },
    { label: 'Encours de crédits', value: <MoneyValue value={data.totalLoanBalance} /> },
    { label: 'Charges de l’année', value: <MoneyValue value={data.totalExpensesThisYear} /> },
    { label: 'Loyers annuels', value: <MoneyValue value={data.totalAnnualRent} />, tone: 'positive' as const }
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
