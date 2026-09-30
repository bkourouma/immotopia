import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  activityDirectionLabels,
  activityTypeLabels,
  calendarBadgeLabel,
  calendarEventTypeLabels,
  dealLabelFromApi,
  dealPropertyStatusLabels,
  dealStageLabels,
  dealSummaryLabel,
  dealTypeLabels,
  funnelStepLabel,
  funnelStepLabels,
  leadSourceLabels,
  nextActionTypeLabel,
  priorityLabels,
  visitStatusLabels
} from '../../utils/crm-labels';
import { ActivityTimeline } from '../../components/crm/ActivityTimeline';
import { FunnelChart } from '../../components/crm/dashboard/charts/FunnelChart';
import { Workbench } from '../../components/crm/dashboard/workbench/Workbench';
import { versEvenementAgenda, lignesExport } from '../../pages/crm/calendar-model';

// Recharts mesure le DOM : on remplace le conteneur par une boîte fixe pour
// que les libellés d'axe soient rendus par jsdom.
vi.mock('recharts', async importOriginal => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 600, height: 300 })
  };
});

/**
 * BUG-2026-09-30-022 / -031 : le CRM affichait des codes techniques
 * (`OUT`, `FOLLOW_UP_CALL`, `LOCATION - QUALIFIED`) et des étapes d'entonnoir
 * en anglais. Un seul module de libellés (`utils/crm-labels`) les traduit ;
 * ces tests le comparent au contrat (`schema.prisma`).
 */

const SCHEMA = readFileSync(resolve(__dirname, '../../../../../packages/api/prisma/schema.prisma'), 'utf8');

function enumValues(name: string): string[] {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(SCHEMA);
  if (!m) throw new Error(`enum ${name} introuvable dans schema.prisma`);
  return m[1]
    .split(/\r?\n/)
    .map(l => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

const CONTRAT: Array<[string, () => Record<string, string>]> = [
  ['CrmActivityType', activityTypeLabels],
  ['CrmActivityDirection', activityDirectionLabels],
  ['CrmDealType', dealTypeLabels],
  ['CrmDealStage', dealStageLabels],
  ['PriorityLevel', priorityLabels],
  ['LeadSource', leadSourceLabels],
  ['CrmDealPropertyStatus', dealPropertyStatusLabels],
  ['PropertyVisitStatus', visitStatusLabels]
];

describe('libellés CRM : exhaustivité face au contrat', () => {
  it.each(CONTRAT)('%s : chaque valeur a un libellé français distinct du code', (nom, table) => {
    const libelles = table();
    for (const valeur of enumValues(nom)) {
      expect(libelles[valeur], `${nom}.${valeur} sans libellé`).toBeTruthy();
      // « SMS » est le même mot dans toutes les langues.
      if (valeur !== 'SMS') expect(libelles[valeur], `${nom}.${valeur} affiché brut`).not.toBe(valeur);
    }
    // Pas de libellé orphelin : la table ne doit pas dériver du contrat.
    expect(Object.keys(libelles).sort()).toEqual([...enumValues(nom)].sort());
  });

  it('les types d’événement du calendrier et les étapes de l’entonnoir sont couverts', () => {
    expect(Object.keys(calendarEventTypeLabels()).sort()).toEqual(['FOLLOWUP', 'PROPERTY_VISIT']);
    for (const etape of ['Leads', 'Qualified', 'Visit', 'Negotiation', 'Won']) {
      expect(funnelStepLabels()).toHaveProperty(etape);
    }
    expect(funnelStepLabel('Qualified')).toBe('Qualifié');
  });
});

describe('libellés CRM : cas de la recette', () => {
  it('traduit les codes vus à l’écran', () => {
    expect(activityDirectionLabels().OUT).toBe('Sortant');
    expect(nextActionTypeLabel('FOLLOW_UP_CALL')).toBe('Appel de relance');
    expect(dealSummaryLabel('LOCATION', 'QUALIFIED')).toBe('Location — Qualifiée');
    expect(dealLabelFromApi('ACHAT - NEW')).toBe('Achat — Nouvelle');
  });

  it('ne rend jamais un code inconnu en MAJUSCULES_SOULIGNÉES brut ; un texte libre passe', () => {
    expect(nextActionTypeLabel('SEND_OFFER')).toBe('Send offer');
    expect(nextActionTypeLabel('Rappel')).toBe('Rappel');
    expect(nextActionTypeLabel(undefined)).toBe('');
  });

  it('les badges d’événement mêlent codes et mots : tous traduits', () => {
    expect(calendarBadgeLabel('FOLLOW_UP_CALL')).toBe('Appel de relance');
    expect(calendarBadgeLabel('Deal')).toBe('Affaire');
    expect(calendarBadgeLabel('CONFIRMED')).toBe('Confirmée');
  });
});

describe('rendu en français sans code brut', () => {
  it('fil d’activité : direction, affaire et prochaine action', () => {
    const activity: any = {
      id: 'a1',
      activityType: 'VISIT',
      direction: 'OUT',
      content: 'Visite effectuée',
      occurredAt: '2026-10-01T10:00:00Z',
      nextActionAt: '2026-10-03T10:00:00Z',
      nextActionType: 'FOLLOW_UP_CALL',
      deal: { id: 'd1', type: 'LOCATION', stage: 'QUALIFIED' }
    };
    const { container } = render(
      <MemoryRouter>
        <ActivityTimeline activities={[activity]} tenantId="t1" />
      </MemoryRouter>
    );
    const texte = container.textContent ?? '';
    expect(texte).toContain('Visite');
    expect(texte).toContain('Sortant');
    expect(texte).toContain('Location — Qualifiée');
    expect(texte).toContain('Appel de relance');
    for (const brut of ['(OUT)', 'FOLLOW_UP_CALL', 'LOCATION', 'QUALIFIED']) {
      expect(texte).not.toContain(brut);
    }
  });

  it('calendrier : titre, affaire, badges et export sans code brut', () => {
    const evenement = versEvenementAgenda({
      eventId: 'e1',
      eventType: 'FOLLOWUP',
      start: '2026-10-03T10:00:00Z',
      end: null,
      title: "Tâche: FOLLOW_UP_CALL - Yao N'Dri",
      contactId: 'c1',
      contactName: "Yao N'Dri",
      dealId: 'd1',
      dealLabel: 'LOCATION - QUALIFIED',
      badges: ['FOLLOW_UP_CALL', 'Deal'],
      canEdit: true,
      canDrag: true,
      nextActionType: 'FOLLOW_UP_CALL',
      createdByUserId: 'u1'
    } as any)!;
    expect(evenement.title).toBe("Tâche: Appel de relance - Yao N'Dri");
    expect(evenement.dealLabel).toBe('Location — Qualifiée');
    expect(evenement.badges).toEqual(['Appel de relance', 'Affaire']);
    const ligne = lignesExport([evenement])[0];
    expect(JSON.stringify(ligne)).not.toMatch(/FOLLOW_UP_CALL|QUALIFIED/);
  });

  it('entonnoir : étapes en français', () => {
    const { container } = render(
      <FunnelChart
        data={{
          steps: [
            { step: 'Leads', count: 10, percentage: 100 },
            { step: 'Qualified', count: 5, percentage: 50 },
            { step: 'Visit', count: 3, percentage: 30 },
            { step: 'Negotiation', count: 2, percentage: 20 },
            { step: 'Won', count: 1, percentage: 10 }
          ]
        }}
      />
    );
    const texte = container.textContent ?? '';
    for (const fr of ['Leads', 'Qualifié', 'Visite', 'Négociation', 'Gagné']) expect(texte).toContain(fr);
    for (const en of ['Qualified', 'Negotiation', 'Won']) expect(texte).not.toContain(en);
  });

  it('plan de travail : pas de titre anglais « Workbench », type d’action traduit', () => {
    const item: any = {
      id: 'w1',
      type: 'OVERDUE_ACTION',
      title: 'FOLLOW_UP_CALL',
      dueDate: '2026-10-01T10:00:00Z',
      canComplete: false,
      canReschedule: false
    };
    render(<Workbench data={{ overdue: [item], today: [], thisWeek: [] } as any} />);
    expect(screen.queryByText('Workbench')).toBeNull();
    expect(screen.getByText('Appel de relance')).toBeTruthy();
    expect(screen.queryByText('FOLLOW_UP_CALL')).toBeNull();
  });
});
