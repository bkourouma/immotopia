import React from 'react';
import { TeamPerformance } from '../../../../types/crmDashboard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/table';
import { Badge } from '../../../ui/badge';
import { TrendingUp, TrendingDown, Award } from 'lucide-react';

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

  if (sortedMembers.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        Aucune donnée de performance disponible
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Total activités: {data.totalActivities}</p>
          <p className="text-sm text-slate-600">Total affaires gagnées: {data.totalWonDeals}</p>
        </div>
        {data.avgResponseTimeHours && (
          <Badge variant="outline">
            Temps de réponse moyen: {formatTime(data.avgResponseTimeHours)}
          </Badge>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Membre</TableHead>
              <TableHead className="text-right">Activités</TableHead>
              <TableHead className="text-right">Affaires gagnées</TableHead>
              <TableHead className="text-right">Taux de conversion</TableHead>
              <TableHead className="text-right">Temps réponse</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedMembers.map((member, index) => (
              <TableRow
                key={member.userId}
                className={`hover:bg-slate-50 transition-colors ${
                  onMemberClick ? 'cursor-pointer' : ''
                }`}
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
                    {member.userEmail && (
                      <p className="text-xs text-slate-500">{member.userEmail}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{member.activitiesCount}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="font-semibold">
                    {member.wonDealsCount}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
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
                <TableCell className="text-right text-sm text-slate-600">
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
