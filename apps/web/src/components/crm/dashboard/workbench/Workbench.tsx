import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { Button } from '../../../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../ui/tabs';
import { Clock, Calendar, CheckCircle, X, ExternalLink } from 'lucide-react';
import type { Workbench as WorkbenchType, WorkbenchItem } from '../../../../types/crmDashboard';
import { format } from 'date-fns';

interface WorkbenchProps {
  data: WorkbenchType;
  onItemClick?: (item: WorkbenchItem) => void;
  onComplete?: (item: WorkbenchItem) => void;
  onReschedule?: (item: WorkbenchItem) => void;
}

const getItemIcon = (type: WorkbenchItem['type']) => {
  switch (type) {
    case 'OVERDUE_ACTION':
      return Clock;
    case 'UPCOMING_ACTION':
      return Clock;
    default:
      return Clock;
  }
};

const getItemColor = (type: WorkbenchItem['type'], priority?: WorkbenchItem['priority']) => {
  if (type === 'OVERDUE_ACTION') return 'text-red-600 bg-red-50';
  if (priority === 'HIGH') return 'text-orange-600 bg-orange-50';
  return 'text-slate-600 bg-slate-50';
};

const WorkbenchItemRow: React.FC<{
  item: WorkbenchItem;
  onItemClick?: (item: WorkbenchItem) => void;
  onComplete?: (item: WorkbenchItem) => void;
  onReschedule?: (item: WorkbenchItem) => void;
  delay?: number;
}> = ({ item, onItemClick, onComplete, onReschedule, delay = 0 }) => {
  const Icon = getItemIcon(item.type);
  const colorClass = getItemColor(item.type, item.priority);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 cursor-pointer" onClick={() => onItemClick?.(item)}>
          <div className={`p-2 rounded-lg ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-900">{item.title}</p>
            {item.description && (
              <p className="text-sm text-slate-600 mt-1">{item.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
              <span>
                {format(new Date(item.dueDate), 'PPp')}
              </span>
              {item.contactName && <span>• {item.contactName}</span>}
              {item.dealLabel && <span>• {item.dealLabel}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          {item.canComplete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onComplete?.(item);
              }}
              className="h-8 w-8 p-0"
            >
              <CheckCircle className="h-4 w-4 text-green-600" />
            </Button>
          )}
          {item.canReschedule && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onReschedule?.(item);
              }}
              className="h-8 w-8 p-0"
            >
              <Calendar className="h-4 w-4 text-blue-600" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onItemClick?.(item);
            }}
            className="h-8 w-8 p-0"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

export const Workbench: React.FC<WorkbenchProps> = ({
  data,
  onItemClick,
  onComplete,
  onReschedule,
}) => {
  const [activeTab, setActiveTab] = useState<'now' | 'week'>('now');

  const nowItems = [...data.overdue, ...data.today];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workbench</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="now">À faire maintenant</TabsTrigger>
            <TabsTrigger value="week">Cette semaine</TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <TabsContent value="now" className="mt-4">
              <motion.div
                key="now"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {nowItems.length > 0 ? (
                  <div className="space-y-3">
                    {nowItems.map((item, index) => (
                      <WorkbenchItemRow
                        key={item.id}
                        item={item}
                        onItemClick={onItemClick}
                        onComplete={onComplete}
                        onReschedule={onReschedule}
                        delay={index * 0.05}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-400" />
                    <p className="font-medium">Tout est à jour!</p>
                    <p className="text-sm">Aucune action urgente</p>
                  </div>
                )}
              </motion.div>
            </TabsContent>

            <TabsContent value="week" className="mt-4">
              <motion.div
                key="week"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {data.thisWeek.length > 0 ? (
                  <div className="space-y-3">
                    {data.thisWeek.map((item, index) => (
                      <WorkbenchItemRow
                        key={item.id}
                        item={item}
                        onItemClick={onItemClick}
                        onComplete={onComplete}
                        onReschedule={onReschedule}
                        delay={index * 0.05}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    <Calendar className="h-12 w-12 mx-auto mb-2 text-slate-400" />
                    <p className="font-medium">Aucun élément cette semaine</p>
                  </div>
                )}
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      </CardContent>
    </Card>
  );
};

