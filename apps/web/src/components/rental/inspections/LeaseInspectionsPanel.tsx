import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Col, Row, Space, Spin } from 'antd';
import {
  createInspection,
  InspectionTemplate,
  InspectionType,
  LeaseInspection,
  listInspections
} from '../../../services/lease-inspections-service';
import { InspectionOverviewCard } from './InspectionOverviewCard';
import { StartInspectionModal } from './StartInspectionModal';
import { InspectionForm } from './InspectionForm';
import { InspectionViewer } from './InspectionViewer';
import { InspectionCompareModal } from './InspectionCompareModal';
import { t } from '../../../i18n/t';

interface LeaseInspectionsPanelProps {
  tenantId: string;
  leaseId: string;
  /** Ameublement du bien loué : présélectionne le modèle mobilier (spec 040, M1). */
  propertyFurnishingStatus?: 'FURNISHED' | 'UNFURNISHED' | 'PARTIALLY_FURNISHED' | null;
}

/** Modèle présélectionné : mobilier pour un bien meublé ou partiellement meublé. */
function defaultTemplateFor(
  furnishingStatus: LeaseInspectionsPanelProps['propertyFurnishingStatus']
): InspectionTemplate {
  return furnishingStatus === 'FURNISHED' || furnishingStatus === 'PARTIALLY_FURNISHED' ? 'FURNISHED' : 'STANDARD';
}

type PanelView =
  { mode: 'overview' } | { mode: 'edit'; inspection: LeaseInspection } | { mode: 'view'; inspection: LeaseInspection };

/**
 * Panneau autonome des états des lieux d'entrée et de sortie d'un bail.
 *
 * Destiné à être intégré comme onglet « États des lieux » de la fiche du bail
 * (fait par ailleurs — ce composant ne touche pas `LeaseDetailPage.tsx`).
 */
export const LeaseInspectionsPanel: React.FC<LeaseInspectionsPanelProps> = ({
  tenantId,
  leaseId,
  propertyFurnishingStatus
}) => {
  const { message } = App.useApp();

  const [inspections, setInspections] = useState<LeaseInspection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<PanelView>({ mode: 'overview' });
  const [startType, setStartType] = useState<InspectionType | null>(null);
  const [creating, setCreating] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listInspections(tenantId, leaseId);
      setInspections(response.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || t('Erreur lors du chargement des états des lieux'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, leaseId]);

  const entry = inspections?.find(inspection => inspection.type === 'ENTRY') || null;
  const exit = inspections?.find(inspection => inspection.type === 'EXIT') || null;

  const replaceInspection = (updated: LeaseInspection) => {
    setInspections(prev => {
      if (!prev) return [updated];
      const exists = prev.some(inspection => inspection.id === updated.id);
      return exists
        ? prev.map(inspection => (inspection.id === updated.id ? updated : inspection))
        : [...prev, updated];
    });
  };

  // Une sortie dont l'entrée existe reprend ses pièces : pas de choix de modèle.
  const showTemplateChoice = !(startType === 'EXIT' && entry);

  const handleConfirmStart = async (inspectionDate: string, template: InspectionTemplate) => {
    if (!startType) return;
    setCreating(true);
    try {
      const response = await createInspection(tenantId, leaseId, {
        type: startType,
        inspectionDate,
        ...(showTemplateChoice ? { template } : {})
      });
      replaceInspection(response.data);
      setStartType(null);
      setView({ mode: 'edit', inspection: response.data });
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Erreur lors de la création de l’état des lieux'));
    } finally {
      setCreating(false);
    }
  };

  const handleSaved = (updated: LeaseInspection) => {
    replaceInspection(updated);
    setView({ mode: 'edit', inspection: updated });
  };

  const handleFinalized = (updated: LeaseInspection) => {
    replaceInspection(updated);
    setView({ mode: 'view', inspection: updated });
  };

  const handleDeleted = () => {
    // Le brouillon supprimé n'existe plus côté serveur : on le retire de la liste locale.
    const deletedId = view.mode !== 'overview' ? view.inspection.id : null;
    if (deletedId) {
      setInspections(prev => (prev ? prev.filter(inspection => inspection.id !== deletedId) : prev));
    }
    setView({ mode: 'overview' });
  };

  if (loading) {
    return <Spin />;
  }

  if (error && !inspections) {
    return <Alert type="error" showIcon message={error} />;
  }

  if (view.mode === 'edit') {
    return (
      <InspectionForm
        tenantId={tenantId}
        leaseId={leaseId}
        inspection={view.inspection}
        entryInspection={view.inspection.type === 'EXIT' ? entry : null}
        onSaved={handleSaved}
        onFinalized={handleFinalized}
        onDeleted={handleDeleted}
        onCancel={() => setView({ mode: 'overview' })}
      />
    );
  }

  if (view.mode === 'view') {
    return (
      <InspectionViewer
        tenantId={tenantId}
        leaseId={leaseId}
        inspection={view.inspection}
        entryInspection={view.inspection.type === 'EXIT' ? entry : null}
        onBack={() => setView({ mode: 'overview' })}
      />
    );
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {error && <Alert type="error" showIcon message={error} closable onClose={() => setError(null)} />}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <InspectionOverviewCard
            title={t("État des lieux d'entrée")}
            inspection={entry}
            onStart={() => setStartType('ENTRY')}
            onContinue={() => entry && setView({ mode: 'edit', inspection: entry })}
            onView={() => entry && setView({ mode: 'view', inspection: entry })}
          />
        </Col>
        <Col xs={24} md={12}>
          <InspectionOverviewCard
            title={t('État des lieux de sortie')}
            inspection={exit}
            onStart={() => setStartType('EXIT')}
            onContinue={() => exit && setView({ mode: 'edit', inspection: exit })}
            onView={() => exit && setView({ mode: 'view', inspection: exit })}
            startHelp={t("Reprend les pièces de l'entrée pour la comparaison.")}
          />
        </Col>
      </Row>

      {entry && exit && <Button onClick={() => setCompareOpen(true)}>{t('Comparer entrée et sortie')}</Button>}

      <StartInspectionModal
        open={startType !== null}
        type={startType || 'ENTRY'}
        confirmLoading={creating}
        onCancel={() => setStartType(null)}
        onConfirm={handleConfirmStart}
        defaultTemplate={defaultTemplateFor(propertyFurnishingStatus)}
        showTemplateChoice={showTemplateChoice}
      />

      <InspectionCompareModal
        open={compareOpen}
        tenantId={tenantId}
        leaseId={leaseId}
        onClose={() => setCompareOpen(false)}
      />
    </Space>
  );
};

export default LeaseInspectionsPanel;
