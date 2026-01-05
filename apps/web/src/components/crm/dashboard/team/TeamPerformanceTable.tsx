import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../ui/table';
import { Badge } from '../../../ui/badge';
import { TeamPerformance, TeamMemberPerformance } from '../../../../types/crmDashboard';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TeamPerformanceTableProps {
  data: TeamPerformance;
  onMemberClick?: (userId: string) => void;
}

export const TeamPerformanceTable: React.FC<TeamPerformanceTableProps> = ({
  data,
  onMemberClick,
}) => {
  const formatResponseTime = (hours?: number): string => {
    if (!hours) return 'N/A';
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}j`;
  };

  const formatPercentage = (value?: number): string => {
    if (value === undefined || value === null) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  // Sort by performance (won deals, then activities)
  const sortedMembers = [...data.members].sort((a, b) => {
    if (b.wonDealsCount !== a.wonDealsCount) {
      return b.wonDealsCount - a.wonDealsCount;
    }
    return b.activitiesCount - a.activitiesCount;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance de l'équipe</CardTitle>
        <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
          <span>Total suivis: {data.totalActivities}</span>
          <span>•</span>
          <span>Total RDV: {data.totalAppointments}</span>
          <span>•</span>
          <span>Affaires gagnées: {data.totalWonDeals}</span>
          {data.avgResponseTimeHours && (
            <>
              <span>•</span>
              <span>Temps de réponse moyen: {formatResponseTime(data.avgResponseTimeHours)}</span>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rang</TableHead>
                <TableHead>Collaborateur</TableHead>
                <TableHead className="text-right">Suivis</TableHead>
                <TableHead className="text-right">RDV</TableHead>
                <TableHead className="text-right">Affaires gagnées</TableHead>
                <TableHead className="text-right">Taux de conversion</TableHead>
                <TableHead className="text-right">Temps de réponse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.map((member, index) => (
                <motion.tr
                  key={member.userId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`hover:bg-slate-50 ${onMemberClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onMemberClick?.(member.userId)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-400">#{index + 1}</span>
                      {index === 0 && (
                        <Badge variant="default" className="bg-yellow-500">
                          Top
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {member.userName}
                    {member.userEmail && (
                      <span className="text-sm text-slate-500 block">{member.userEmail}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{member.activitiesCount}</TableCell>
                  <TableCell className="text-right">{member.appointmentsCount}</TableCell>
                  <TableCell className="text-right font-semibold">{member.wonDealsCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {member.conversionRate !== undefined && (
                        <>
                          {member.conversionRate > (data.members.reduce((sum, m) => sum + (m.conversionRate || 0), 0) / data.members.length) ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                          <span>{formatPercentage(member.conversionRate)}</span>
                        </>
                      )}
                      {member.conversionRate === undefined && <span>N/A</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatResponseTime(member.avgResponseTimeHours)}
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};




