import React from 'react';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { ContactsInsights, ContactsByStatus, ContactsByRole, ScoreBucket } from '../../../../types/crmDashboard';
import { CrmContactStatus } from '../../../../types/crm-types';

interface ContactsChartsProps {
  data: ContactsInsights;
  onStatusClick?: (status: CrmContactStatus) => void;
  onRoleClick?: (role: string) => void;
  onScoreBucketClick?: (range: string) => void;
  onLeadClick?: (leadId: string) => void;
}

const STATUS_COLORS: Record<CrmContactStatus, string> = {
  LEAD: '#3b82f6',
  ACTIVE_CLIENT: '#10b981',
  ARCHIVED: '#94a3b8',
};

const STATUS_LABELS: Record<CrmContactStatus, string> = {
  LEAD: 'Lead',
  ACTIVE_CLIENT: 'Client actif',
  ARCHIVED: 'Archivé',
};

const ROLE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#64748b'];
const SCORE_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']; // Red, Orange, Blue, Green

export const ContactsCharts: React.FC<ContactsChartsProps> = ({
  data,
  onStatusClick,
  onRoleClick,
  onScoreBucketClick,
  onLeadClick,
}) => {
  const statusData = data.byStatus.map((item) => ({
    ...item,
    label: STATUS_LABELS[item.status] || item.status,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-semibold">{data.label || data.name || data.range}</p>
          <p className="text-sm text-slate-600">Nombre: {data.count}</p>
          <p className="text-sm text-slate-600">Pourcentage: {data.percentage.toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Status Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Contacts par statut</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(props: any) => {
                  const name = props.name || '';
                  const percent = props.percent || 0;
                  return `${name}: ${(percent * 100).toFixed(0)}%`;
                }}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
                cursor={onStatusClick ? 'pointer' : 'default'}
                onClick={(data: ContactsByStatus) => onStatusClick?.(data.status)}
                isAnimationActive
                animationDuration={1000}
              >
                {statusData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STATUS_COLORS[entry.status] || ROLE_COLORS[index % ROLE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Role Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Contacts par rôle</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.byRole} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="role" type="category" tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="count"
                name="Nombre"
                radius={[0, 8, 8, 0]}
                cursor={onRoleClick ? 'pointer' : 'default'}
                onClick={(event: any, payload: any) => {
                  if (payload?.payload?.role) {
                    onRoleClick?.(payload.payload.role);
                  }
                }}
                isAnimationActive
                animationDuration={1000}
              >
                {data.byRole.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={ROLE_COLORS[index % ROLE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Score Buckets */}
      <Card>
        <CardHeader>
          <CardTitle>Distribution des scores</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.byScore} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="range" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="count"
                name="Nombre"
                radius={[8, 8, 0, 0]}
                cursor={onScoreBucketClick ? 'pointer' : 'default'}
                onClick={(event: any, payload: any) => {
                  if (payload?.payload?.range) {
                    onScoreBucketClick?.(payload.payload.range);
                  }
                }}
                isAnimationActive
                animationDuration={1000}
              >
                {data.byScore.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={SCORE_COLORS[index % SCORE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Insights Callouts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Hot Leads */}
        {data.topHotLeadsWithoutAppointment.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 5 leads chauds sans RDV</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.topHotLeadsWithoutAppointment.slice(0, 5).map((lead, index) => (
                  <motion.div
                    key={lead.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer"
                    onClick={() => onLeadClick?.(lead.id)}
                  >
                    <div>
                      <p className="font-medium text-sm">{lead.name}</p>
                      <p className="text-xs text-slate-500">Score: {lead.score}/100</p>
                    </div>
                    <div className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                      Chaud
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inactive Leads */}
        {data.inactiveLeads.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Leads sans suivi (14+ jours)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.inactiveLeads.slice(0, 5).map((lead, index) => (
                  <motion.div
                    key={lead.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer"
                    onClick={() => onLeadClick?.(lead.id)}
                  >
                    <div>
                      <p className="font-medium text-sm">{lead.name}</p>
                      <p className="text-xs text-slate-500">{lead.daysSinceActivity} jours</p>
                    </div>
                    <div className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                      Inactif
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

