import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { TeamPerformance, TeamMemberPerformance } from '../../../../types/crmDashboard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/table';
import { Badge } from '../../../ui/badge';
import { TrendingUp, TrendingDown, Award } from 'lucide-react';
import { ExportMenu } from '../../../primitives/ExportMenu';
import { t } from '../../../../i18n/t';

interface TeamPerformanceTableProps {
  data: TeamPerformance;
  onMemberClick?: (userId: string) => void;
}

export const TeamPerformanceTable: React.FC<TeamPerformanceTableProps> = ({ data, onMemberClick }) => {
  // Sort members by performance (won deals count)
  const sortedMembers = [...data.members].sort((a, b) => b.wonDealsCount - a.wonDealsCount);

  const formatTime = (hours?: number) => {
    if (!hours) return 'N/A';
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}j`;
  };

  const formatPercentage = (value?: number) => {
    if (value === undefined || value === null) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  // Ce tableau est en HTML (pas Ant Design) : l'export déclare ses colonnes à part,
  // avec des valeurs brutes (nombres pour Excel).
  const colonnesExport: ColumnsType<TeamMemberPerformance> = [
    { title: '#', key: 'rang', exportValue: (_, index) => index + 1 },
    { title: t('Membre'), key: 'membre', exportValue: member => member.userName },
    { title: t('Email'), key: 'email', exportValue: member => member.userEmail },
    { title: t('Activités'), key: 'activites', exportValue: member => member.activitiesCount },
    { title: t('Affaires gagnées'), key: 'gagnees', exportValue: member => member.wonDealsCount },
    { title: t('Taux de conversion'), key: 'conversion', exportValue: member => member.conversionRate },
    { title: t('Temps réponse'), key: 'reponse', exportValue: member => formatTime(member.avgResponseTimeHours) }
  ];

  if (sortedMembers.length === 0) {
    return <div className="text-center py-8 text-slate-500">{t('Aucune donnée de performance disponible')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">
            {t('Total activités:')} {data.totalActivities}
          </p>
          <p className="text-sm text-slate-600">
            {t('Total affaires gagnées:')} {data.totalWonDeals}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.avgResponseTimeHours && (
            <Badge variant="outline">
              {t('Temps de réponse moyen:')} {formatTime(data.avgResponseTimeHours)}
            </Badge>
          )}
          <ExportMenu<TeamMemberPerformance>
            columns={colonnesExport}
            rows={sortedMembers}
            filename={t("Performance de l'équipe")}
          />
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        {/* Six colonnes ne tiennent pas sous 768 px : le tableau garde sa
            largeur utile et le conteneur defile. */}
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t('Membre')}</TableHead>
              <TableHead className="text-end">{t('Activités')}</TableHead>
              <TableHead className="text-end">{t('Affaires gagnées')}</TableHead>
              <TableHead className="text-end">{t('Taux de conversion')}</TableHead>
              <TableHead className="text-end">{t('Temps réponse')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedMembers.map((member, index) => (
              <TableRow
                key={member.userId}
                className={`hover:bg-slate-50 transition-colors ${onMemberClick ? 'cursor-pointer' : ''}`}
                onClick={() => onMemberClick?.(member.userId)}
              >
                <TableCell>
                  {index === 0 ? (
                    <Award className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <span className="text-slate-500">#{index + 1}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-slate-900">{member.userName}</p>
                    {member.userEmail && <p className="text-xs text-slate-500">{member.userEmail}</p>}
                  </div>
                </TableCell>
                <TableCell className="text-end">{member.activitiesCount}</TableCell>
                <TableCell className="text-end">
                  <Badge variant="outline" className="font-semibold">
                    {member.wonDealsCount}
                  </Badge>
                </TableCell>
                <TableCell className="text-end">
                  {member.conversionRate !== undefined ? (
                    <div className="flex items-center justify-end gap-1">
                      {member.conversionRate > 20 ? (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      ) : member.conversionRate < 10 ? (
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      ) : null}
                      <span>{formatPercentage(member.conversionRate)}</span>
                    </div>
                  ) : (
                    'N/A'
                  )}
                </TableCell>
                <TableCell className="text-end text-sm text-slate-600">
                  {formatTime(member.avgResponseTimeHours)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
