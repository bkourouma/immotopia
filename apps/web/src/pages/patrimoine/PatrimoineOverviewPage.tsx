import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Empty, Space, Spin, Typography } from 'antd';
import { PatrimoineOverview } from '../../components/patrimoine/PatrimoineOverview';
import { WorkProgramTimeline } from '../../components/patrimoine/WorkProgramTimeline';
import { listProperties } from '../../services/property-service';
import { getPatrimoineOverview, listWorkPrograms } from '../../services/patrimoine-service';
import type { PatrimoineOverviewData, WorkProgram } from '../../types/patrimoine-types';
import type { Property } from '../../types/property-types';
import { useAuth } from '../../hooks/useAuth';

const { Title, Text } = Typography;

type ProgramWithProperty = WorkProgram & { propertyLabel?: string };

export const PatrimoineOverviewPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<PatrimoineOverviewData | null>(null);
  const [workPrograms, setWorkPrograms] = useState<ProgramWithProperty[]>([]);

  useEffect(() => {
    if (!effectiveTenantId) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [overviewData, propertiesResp] = await Promise.all([
          getPatrimoineOverview(effectiveTenantId),
          listProperties(effectiveTenantId, { page: 1, limit: 100 })
        ]);
        setOverview(overviewData);

        const properties = propertiesResp.properties;
        const programsPerProperty = await Promise.all(
          properties.map(async (property: Property) => {
            const programs = await listWorkPrograms(effectiveTenantId, property.id);
            return programs.map(program => ({ ...program, propertyLabel: property.title }));
          })
        );
        setWorkPrograms(programsPerProperty.flat());
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Erreur chargement dashboard patrimoine');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [effectiveTenantId]);

  if (!effectiveTenantId) {
    return (
      <>
        <Alert type="warning" showIcon message="Aucune agence sélectionnée" />
      </>
    );
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={2} style={{ marginBottom: 0 }}>
              Patrimoine
            </Title>
            <Text type="secondary">Vue consolidee du portefeuille immobilier</Text>
          </div>
          <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/properties`)}>
            Voir les biens (/properties)
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin />
          </div>
        ) : null}
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {!loading && !overview ? <Empty description="Aucune donnee patrimoine" /> : null}
        {!loading && overview ? <PatrimoineOverview data={overview} /> : null}
        {!loading ? <WorkProgramTimeline items={workPrograms} /> : null}
      </Space>
    </>
  );
};
