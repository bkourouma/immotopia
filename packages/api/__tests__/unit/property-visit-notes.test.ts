/**
 * BUG-2026-09-28-020 (recette OI, C.6) : « Marquer comme terminé » effaçait
 * la note de la visite. Le contrôleur transmet `notes: null` quand aucun
 * compte-rendu n'est saisi ; `null` ne doit pas écraser la note existante.
 *
 * Et le calendrier CRM affichait « Tâche: VISIT - … » (code brut).
 */

const visitFindFirst = jest.fn();
const visitUpdate = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    propertyVisit: {
      findFirst: (...a: unknown[]) => visitFindFirst(...a),
      update: (...a: unknown[]) => visitUpdate(...a)
    }
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/crm-activity-service', () => ({ createActivity: jest.fn() }));

import { updateVisitStatus } from '../../src/services/property-visit-service';
import { getNextActionLabel } from '../../src/services/crm-calendar-service';

const TENANT = 'tenant-a';

function visitWithNotes(notes: string | null) {
  return {
    id: 'visit-1',
    propertyId: 'prop-1',
    status: 'SCHEDULED',
    notes,
    property: { id: 'prop-1', ownershipType: 'TENANT', tenantId: TENANT }
  };
}

describe('updateVisitStatus : les notes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    visitUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'visit-1', ...data }));
  });

  it('conserve la note existante quand notes vaut null', async () => {
    visitFindFirst.mockResolvedValue(visitWithNotes('Visite A2 avec Aminata'));
    await updateVisitStatus('visit-1', 'DONE' as never, TENANT, undefined, null);
    expect(visitUpdate.mock.calls[0][0].data.notes).toBe('Visite A2 avec Aminata');
  });

  it('conserve la note existante quand notes est absent', async () => {
    visitFindFirst.mockResolvedValue(visitWithNotes('Visite A2 avec Aminata'));
    await updateVisitStatus('visit-1', 'CONFIRMED' as never, TENANT);
    expect(visitUpdate.mock.calls[0][0].data.notes).toBe('Visite A2 avec Aminata');
  });

  it('remplace la note par le compte-rendu fourni', async () => {
    visitFindFirst.mockResolvedValue(visitWithNotes('Visite A2 avec Aminata'));
    await updateVisitStatus('visit-1', 'DONE' as never, TENANT, undefined, 'Client intéressé, revient jeudi');
    expect(visitUpdate.mock.calls[0][0].data.notes).toBe('Client intéressé, revient jeudi');
  });
});

describe('getNextActionLabel', () => {
  it('traduit les codes connus et laisse un texte libre intact', () => {
    expect(getNextActionLabel('VISIT')).toBe('Visite');
    expect(getNextActionLabel('call')).toBe('Appel');
    expect(getNextActionLabel('Relancer le notaire')).toBe('Relancer le notaire');
  });
});
