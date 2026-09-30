import { prisma } from '../../utils/database';
import { conflict, notFound, unprocessableEntity } from '../errors';
import { t } from '../../i18n';
import { DEFAULT_MAJORITY_RULE } from './meeting-majority';
import {
  addAgendaItemToMeeting,
  deleteAgendaItemByTenant,
  getMeetingByTenant,
  updateAgendaItemByTenant
} from './queries';

/**
 * Ecritures d'assemblee generale qui doivent respecter le meme gel que les
 * votes, resolutions et pouvoirs (BUG-2026-09-30-082) et la creation qui doit
 * rendre l'AG creee (BUG-2026-09-30-090).
 *
 * Statuts (data-model, GeneralMeeting) : PLANNED -> IN_PROGRESS -> COMPLETED,
 * ou PLANNED -> CANCELLED. Une AG COMPLETED ou CANCELLED est figee ; l'ordre du
 * jour reste modifiable en PLANNED et IN_PROGRESS (les discussions s'y
 * saisissent en seance).
 */

export type MeetingWriteKind = 'AGENDA';

/** Une assemblee cloturee ou annulee ne se modifie plus. */
export function isMeetingFrozenStatus(status: string): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

/** Garde partage : 409 traduit « assemblée clôturée / annulée ». */
export function assertMeetingWritable(status: string, kind: MeetingWriteKind = 'AGENDA'): void {
  if (!isMeetingFrozenStatus(status)) return;
  if (kind === 'AGENDA') {
    throw conflict(
      status === 'COMPLETED'
        ? t("Assemblée clôturée : l'ordre du jour ne peut plus être modifié")
        : t("Assemblée annulée : l'ordre du jour ne peut plus être modifié")
    );
  }
}

/**
 * Cree l'AG et ses resolutions, puis la relit APRES la validation de la
 * transaction (lue depuis le client global a l'interieur, la ligne n'etait pas
 * encore visible et la reponse portait `data: null`).
 */
export async function createMeetingForTenant(
  tenantId: string,
  data: {
    syndicateId: string;
    type: string;
    scheduledAt: Date;
    startTime?: Date;
    endTime?: Date;
    location?: string | null;
    resolutions: { title: string; description?: string | null; majorityRule?: string | null }[];
  }
) {
  if (data.startTime && data.endTime && data.startTime > data.endTime) {
    throw unprocessableEntity("L'heure de debut doit etre inferieure a l'heure de fin");
  }

  const syndicate = await prisma.syndicate.findFirst({
    where: { id: data.syndicateId, tenantId },
    select: { id: true }
  });
  if (!syndicate) {
    throw notFound('Copropriete introuvable ou inaccessible');
  }

  const meetingId = await prisma.$transaction(async tx => {
    const meeting = await tx.generalMeeting.create({
      data: {
        syndicateId: data.syndicateId,
        type: data.type as any,
        scheduledAt: data.scheduledAt,
        startTime: data.startTime ?? undefined,
        endTime: data.endTime ?? undefined,
        location: data.location ?? undefined
      }
    });

    if (data.resolutions.length > 0) {
      await tx.gMResolution.createMany({
        data: data.resolutions.map(r => ({
          meetingId: meeting.id,
          title: r.title,
          description: r.description,
          majorityRule: r.majorityRule?.trim() || DEFAULT_MAJORITY_RULE
        }))
      });
    }

    return meeting.id;
  });

  const created = await getMeetingByTenant(tenantId, data.syndicateId, meetingId);
  if (!created) {
    throw notFound('Assemblee generale introuvable ou inaccessible');
  }
  return created;
}

async function findMeetingStatus(tenantId: string, syndicateId: string, meetingId: string) {
  const meeting = await prisma.generalMeeting.findFirst({
    where: { id: meetingId, syndicateId, syndicate: { tenantId } },
    select: { id: true, status: true }
  });
  if (!meeting) {
    throw notFound('Assemblee generale introuvable ou inaccessible');
  }
  return meeting;
}

async function findAgendaItemMeetingStatus(tenantId: string, syndicateId: string, agendaItemId: string) {
  const item = await prisma.gMAgendaItem.findFirst({
    where: { id: agendaItemId, meeting: { syndicateId, syndicate: { tenantId } } },
    select: { id: true, meeting: { select: { status: true } } }
  });
  if (!item) {
    throw notFound("Point d'ordre du jour introuvable ou inaccessible");
  }
  return item.meeting.status;
}

export async function addAgendaItemGuarded(
  tenantId: string,
  syndicateId: string,
  data: Parameters<typeof addAgendaItemToMeeting>[2]
) {
  const meeting = await findMeetingStatus(tenantId, syndicateId, data.meetingId);
  assertMeetingWritable(meeting.status);
  return addAgendaItemToMeeting(tenantId, syndicateId, data);
}

export async function updateAgendaItemGuarded(
  tenantId: string,
  syndicateId: string,
  agendaItemId: string,
  data: Parameters<typeof updateAgendaItemByTenant>[3]
) {
  assertMeetingWritable(await findAgendaItemMeetingStatus(tenantId, syndicateId, agendaItemId));
  return updateAgendaItemByTenant(tenantId, syndicateId, agendaItemId, data);
}

export async function deleteAgendaItemGuarded(tenantId: string, syndicateId: string, agendaItemId: string) {
  assertMeetingWritable(await findAgendaItemMeetingStatus(tenantId, syndicateId, agendaItemId));
  return deleteAgendaItemByTenant(tenantId, syndicateId, agendaItemId);
}
