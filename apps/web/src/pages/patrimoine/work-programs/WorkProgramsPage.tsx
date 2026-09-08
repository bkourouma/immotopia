import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Select, Space, Spin, Typography } from 'antd';
import { WorkProgramTimeline } from '../../../components/patrimoine/WorkProgramTimeline';
import { listWorkPrograms } from '../../../services/patrimoine-service';
import { listProperties } from '../../../services/property-service';
import type { WorkProgram } from '../../../types/patrimoine-types';
import { useAuth } from '../../../hooks/useAuth';

const { Title, Text } = Typography;

type ProgramWithProperty = WorkProgram & { propertyLabel?: string };

export const WorkProgramsPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [allPrograms, setAllPrograms] = useState<ProgramWithProperty[]>([]);

  useEffect(() => {
    if (!effectiveTenantId) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const propertiesResp = await listProperties(effectiveTenantId, { page: 1, limit: 100 });
        const result = await Promise.all(
          propertiesResp.properties.map(async property => {
            const programs = await listWorkPrograms(effectiveTenantId, property.id);
            return programs.map(program => ({ ...program, propertyLabel: property.title }));
          })
        );
        setAllPrograms(result.flat());
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Erreur chargement programmes travaux');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [effectiveTenantId]);

  const filtered = statusFilter ? allPrograms.filter(program => program.status === statusFilter) : allPrograms;

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: 0 }}>
            Programmes de travaux
          </Title>
          <Text type="secondary">Planification et suivi des travaux par bien</Text>
        </div>

        <Select
          allowClear
          placeholder="Filtrer par statut"
          style={{ width: 280 }}
          value={statusFilter}
          onChange={value => setStatusFilter(value)}
          options={[
            { value: 'PLANNED', label: 'Planifié' },
            { value: 'IN_PROGRESS', label: 'En cours' },
            { value: 'COMPLETED', label: 'Terminé' },
            { value: 'CANCELLED', label: 'Annulé' }
          ]}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin />
          </div>
        ) : null}
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {!loading ? <WorkProgramTimeline items={filtered} /> : null}
      </Space>
    </>
  );
};
