/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Messagerie interne (menu lot 3) : isolation par agence, participants
 * verifies, aucun contournement administrateur, 1-a-1 deduplique, audience
 * CLIENT limitee au personnel, non-lus, notifications IN_APP.
 *
 * Aucune base : `prisma` est remplace par un magasin en memoire.
 */
jest.mock('../../src/utils/database', () => ({
  prisma: require('../helpers/messaging-fake-prisma').fakePrisma
}));
jest.mock('../../src/lib/notifications', () => ({ notify: jest.fn() }));
jest.mock('../../src/services/permission-service', () => ({ hasPermission: jest.fn() }));

import { notify } from '../../src/lib/notifications';
import { hasPermission } from '../../src/services/permission-service';
import {
  addParticipants,
  createConversation,
  directory,
  getConversation,
  leaveConversation,
  listConversations,
  listMessages,
  markRead,
  sendMessage,
  unreadCount
} from '../../src/lib/messaging';
import type { MessagingActor } from '../../src/lib/messaging';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../src/middleware/error-middleware';
import { addClient, addStaff, addUser, locks, resetFake, stats, tables } from '../helpers/messaging-fake-prisma';

const notifyMock = notify as jest.Mock;
const hasPermissionMock = hasPermission as jest.Mock;
const T1 = 'tenant-1';
const T2 = 'tenant-2';

const staff = (userId: string, tenantId = T1): MessagingActor => ({ tenantId, userId, audience: 'STAFF' });
const client = (userId: string, tenantId = T1): MessagingActor => ({ tenantId, userId, audience: 'CLIENT' });

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise(resolve => setImmediate(resolve));
};

beforeEach(() => {
  resetFake();
  notifyMock.mockReset();
  hasPermissionMock.mockReset();
  hasPermissionMock.mockResolvedValue(true);
  // notify de test : ecrit la notification comme le vrai service.
  notifyMock.mockImplementation(async (input: any) => {
    for (const r of input.recipients) {
      tables.userNotification.push({
        id: `n-${tables.userNotification.length + 1}`,
        tenantId: input.tenantId,
        recipientUserId: r.userId,
        key: input.key,
        title: input.title,
        body: input.body,
        link: input.link,
        readAt: null,
        relatedEntityType: input.relatedEntity?.type,
        relatedEntityId: input.relatedEntity?.id
      });
    }
    return { notifications: [] };
  });
  addStaff(T1, 'alice');
  addStaff(T1, 'bob');
  addStaff(T1, 'carol');
  addStaff(T1, 'admin');
  addStaff(T2, 'zed');
  addClient(T1, 'cli');
  addClient(T1, 'cli2');
});

describe('createConversation : verification des participants', () => {
  it("refuse un participant d'une autre agence avec la meme NotFoundError qu'un inconnu", async () => {
    const other = createConversation(staff('alice'), { participantUserIds: ['zed'] });
    const unknown = createConversation(staff('alice'), { participantUserIds: ['nobody'] });
    await expect(other).rejects.toBeInstanceOf(NotFoundError);
    await expect(unknown).rejects.toBeInstanceOf(NotFoundError);
    await expect(other).rejects.toThrow((await unknown.catch(e => e)).message);
    expect(tables.conversation).toHaveLength(0);
  });

  it('refuse un utilisateur desactive et un membership non actif', async () => {
    addStaff(T1, 'off', { isActive: false });
    addStaff(T1, 'pending', { status: 'PENDING_INVITE' });
    addStaff(T1, 'disabled', { status: 'DISABLED' });
    for (const id of ['off', 'pending', 'disabled']) {
      await expect(createConversation(staff('alice'), { participantUserIds: [id] })).rejects.toBeInstanceOf(
        NotFoundError
      );
    }
  });

  it('refuse un groupe qui contient un seul participant invalide, sans rien creer', async () => {
    await expect(createConversation(staff('alice'), { participantUserIds: ['bob', 'zed'] })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(tables.conversation).toHaveLength(0);
  });

  it('refuse un appelant STAFF sans Membership (super-admin) : ForbiddenError', async () => {
    addUser('root');
    await expect(createConversation(staff('root'), { participantUserIds: ['alice'] })).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it('1-a-1 : deduplique par directKey (meme conversation, ordre indifferent)', async () => {
    const a = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    const b = await createConversation(staff('bob'), { participantUserIds: ['alice'] });
    expect(a.kind).toBe('DIRECT');
    expect(b.id).toBe(a.id);
    expect(tables.conversation).toHaveLength(1);
    expect(tables.conversation[0].directKey).toBe('alice:bob');
    expect(a.participants.map(p => p.userId).sort()).toEqual(['alice', 'bob']);
  });

  it("1-a-1 : une course a l'unique renvoie la conversation gagnante", async () => {
    const [a, b] = await Promise.all([
      createConversation(staff('alice'), { participantUserIds: ['bob'] }),
      createConversation(staff('bob'), { participantUserIds: ['alice'] })
    ]);
    expect(b.id).toBe(a.id);
    expect(tables.conversation).toHaveLength(1);
    expect(tables.conversationParticipant).toHaveLength(2);
  });

  it("1-a-1 recree : l'autre qui etait parti RESTE parti (pas de reactivation silencieuse)", async () => {
    const a = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    await leaveConversation(staff('bob'), a.id);
    await expect(getConversation(staff('bob'), a.id)).rejects.toBeInstanceOf(NotFoundError);
    const again = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    expect(again.id).toBe(a.id);
    await expect(getConversation(staff('bob'), a.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(tables.conversationParticipant.find(p => p.userId === 'bob')!.leftAt).toBeInstanceOf(Date);
  });

  it("1-a-1 recree : l'APPELANT qui etait parti revient (sa propre action)", async () => {
    const a = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    await leaveConversation(staff('alice'), a.id);
    await expect(getConversation(staff('alice'), a.id)).rejects.toBeInstanceOf(NotFoundError);
    const again = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    expect(again.id).toBe(a.id);
    await expect(getConversation(staff('alice'), a.id)).resolves.toMatchObject({ id: a.id });
    expect(tables.conversationParticipant.find(p => p.userId === 'alice')!.leftAt).toBeNull();
  });

  it('groupe : plusieurs participants ou titre', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'], title: 'Equipe' });
    expect(g.kind).toBe('GROUP');
    expect(g.title).toBe('Equipe');
    expect(g.participants).toHaveLength(3);
    const titled = await createConversation(staff('alice'), { participantUserIds: ['bob'], title: 'Duo nomme' });
    expect(titled.kind).toBe('GROUP');
    expect(titled.id).not.toBe(g.id);
  });

  it("un groupe ne se deduplique pas et ignore l'appelant dans la liste", async () => {
    const g1 = await createConversation(staff('alice'), { participantUserIds: ['alice', 'bob', 'carol'] });
    const g2 = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'] });
    expect(g1.id).not.toBe(g2.id);
    expect(g1.participants).toHaveLength(3);
  });

  it('refuse une conversation avec soi-meme seul', async () => {
    await expect(createConversation(staff('alice'), { participantUserIds: ['alice'] })).rejects.toThrow();
  });

  it('firstMessage : poste le message et notifie', async () => {
    const c = await createConversation(staff('alice'), { participantUserIds: ['bob'], firstMessage: ' Salut ' });
    expect(c.lastMessage?.body).toBe('Salut');
    await flush();
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("les libelles viennent d'un select explicite : jamais de passwordHash", async () => {
    const c = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    expect(JSON.stringify(c)).not.toContain('SECRET');
    expect(JSON.stringify(c)).not.toContain('passwordHash');
  });
});

describe('audience CLIENT', () => {
  it('ne peut joindre que du personnel de son agence', async () => {
    const ok = await createConversation(client('cli'), { participantUserIds: ['alice'] });
    expect(ok.participants.find(p => p.userId === 'alice')?.kind).toBe('STAFF');
    await expect(createConversation(client('cli'), { participantUserIds: ['cli2'] })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(createConversation(client('cli'), { participantUserIds: ['zed'] })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('ne peut pas ajouter un autre client a un groupe', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'cli'], title: 'G' });
    await expect(addParticipants(client('cli'), g.id, ['cli2'])).rejects.toBeInstanceOf(NotFoundError);
    const done = await addParticipants(client('cli'), g.id, ['carol']);
    expect(done.participants).toHaveLength(4);
  });

  it('ne peut pas creer un groupe (plusieurs participants ou titre), seulement un 1-a-1', async () => {
    await expect(createConversation(client('cli'), { participantUserIds: ['alice', 'bob'] })).rejects.toBeInstanceOf(
      BadRequestError
    );
    await expect(
      createConversation(client('cli'), { participantUserIds: ['alice'], title: 'Mon groupe' })
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(tables.conversation).toHaveLength(0);
  });

  it('un groupe qui contient un client est limite a 5 participants (creation et ajout)', async () => {
    addStaff(T1, 's4');
    addStaff(T1, 's5');
    addStaff(T1, 's6');
    await expect(
      createConversation(staff('alice'), { participantUserIds: ['bob', 'carol', 'admin', 's4', 'cli'], title: 'G' })
    ).rejects.toMatchObject({ message: 'Un groupe avec un client est limité à 5 participants.' });
    // sans client : pas de plafond de 5
    const noClient = await createConversation(staff('alice'), {
      participantUserIds: ['bob', 'carol', 'admin', 's4', 's5'],
      title: 'Equipe'
    });
    await addParticipants(staff('alice'), noClient.id, ['s6']);
    // avec client : 5 maximum au total
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol', 'cli'], title: 'G2' });
    await addParticipants(staff('alice'), g.id, ['admin']);
    await expect(addParticipants(staff('alice'), g.id, ['s4', 's5'])).rejects.toMatchObject({
      message: 'Un groupe avec un client est limité à 5 participants.'
    });
    // ajouter un client a un groupe de personnel deja plein
    await expect(addParticipants(staff('alice'), noClient.id, ['cli'])).rejects.toBeInstanceOf(BadRequestError);
  });

  it("un client ne voit ni le nom ni l'identifiant d'un autre client, le personnel reste nomme", async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'cli', 'cli2'], title: 'G' });
    await sendMessage(client('cli2'), g.id, 'salut de cli2');
    await sendMessage(client('cli'), g.id, 'salut de cli');
    await sendMessage(staff('bob'), g.id, 'salut de bob');

    const seen = await getConversation(client('cli'), g.id);
    const others = seen.participants.filter(p => p.label === 'Autre participant');
    expect(others).toHaveLength(1);
    expect(others[0].userId).not.toBe('cli2');
    expect(seen.participants.find(p => p.userId === 'cli')?.label).toBe('Nom cli');
    expect(seen.participants.find(p => p.userId === 'alice')?.label).toBe('Nom alice');
    expect(JSON.stringify(seen)).not.toContain('cli2');

    const msgs = await listMessages(client('cli'), g.id);
    const fromCli2 = msgs.items.find(m => m.body === 'salut de cli2')!;
    expect(fromCli2).toMatchObject({ authorLabel: 'Autre participant', mine: false });
    expect(fromCli2.authorUserId).toBe(others[0].userId); // coherent avec la liste des participants
    expect(msgs.items.find(m => m.body === 'salut de cli')).toMatchObject({ authorUserId: 'cli', mine: true });
    expect(msgs.items.find(m => m.body === 'salut de bob')).toMatchObject({
      authorUserId: 'bob',
      authorLabel: 'Nom bob'
    });
    expect(JSON.stringify(await listConversations(client('cli')))).not.toContain('cli2');
    // l'identifiant opaque est propre a la conversation
    const g2 = await createConversation(staff('alice'), { participantUserIds: ['bob', 'cli', 'cli2'], title: 'G2' });
    const other2 = (await getConversation(client('cli'), g2.id)).participants.find(
      p => p.label === 'Autre participant'
    );
    expect(other2?.userId).not.toBe(others[0].userId);

    // le personnel voit l'identite reelle
    const staffView = await getConversation(staff('alice'), g.id);
    expect(staffView.participants.find(p => p.userId === 'cli2')?.label).toBe('Nom cli2');
    const staffMsgs = await listMessages(staff('alice'), g.id);
    expect(staffMsgs.items.find(m => m.body === 'salut de cli2')).toMatchObject({ authorUserId: 'cli2' });
  });

  it("l'ajout d'un participant ne rappelle pas une personne partie", async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'], title: 'G' });
    await leaveConversation(staff('bob'), g.id);
    const done = await addParticipants(staff('alice'), g.id, ['bob', 'admin']);
    expect(done.participants.map(p => p.userId)).not.toContain('bob');
    expect(done.participants.map(p => p.userId)).toContain('admin');
    expect(tables.conversationParticipant.find(p => p.userId === 'bob')!.leftAt).toBeInstanceOf(Date);
  });

  it("un appelant CLIENT qui n'est pas client de l'agence est refuse", async () => {
    addClient(T2, 'ext');
    await expect(createConversation(client('ext'), { participantUserIds: ['alice'] })).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("le directory ne renvoie que le personnel actif, sans l'appelant", async () => {
    addStaff(T1, 'off', { isActive: false });
    const list = await directory(client('cli'));
    expect(list.every(e => e.kind === 'STAFF')).toBe(true);
    expect(list.map(e => e.userId).sort()).toEqual(['admin', 'alice', 'bob', 'carol']);
  });

  it('le directory STAFF sans CRM_CONTACTS_VIEW ne renvoie AUCUN client portail', async () => {
    hasPermissionMock.mockResolvedValue(false);
    const list = await directory(staff('alice'));
    expect(list.every(e => e.kind === 'STAFF')).toBe(true);
    expect(list.map(e => e.userId)).not.toContain('cli');
    hasPermissionMock.mockResolvedValue(true);
    expect((await directory(staff('alice'))).map(e => e.userId)).toContain('cli');
    expect(hasPermissionMock).toHaveBeenCalledWith('alice', 'CRM_CONTACTS_VIEW', T1);
  });

  it("un client ne cherche que par nom (pas par e-mail) et ne voit jamais l'e-mail d'un membre du personnel", async () => {
    // "exemple" n'apparait que dans les e-mails (alice@exemple.test).
    expect(await directory(client('cli'), 'exemple')).toEqual([]);
    expect((await directory(staff('alice'), 'exemple')).length).toBeGreaterThan(0);
    tables.user.find(u => u.id === 'bob')!.fullName = null;
    const list = await directory(client('cli'));
    expect(list.find(e => e.userId === 'bob')?.label).toBe("Équipe de l'agence");
    expect(list.map(e => e.label).join('|')).not.toContain('@');
    // le personnel, lui, garde l'e-mail de repli
    expect((await directory(staff('alice'))).find(e => e.userId === 'bob')?.label).toBe('bob@exemple.test');
  });

  it('un client voit le repli generique pour un participant ou un auteur sans nom, jamais son e-mail', async () => {
    tables.user.find(u => u.id === 'alice')!.fullName = null;
    const conv = await createConversation(client('cli'), { participantUserIds: ['alice'], firstMessage: 'Bonjour' });
    expect(conv.participants.find(p => p.userId === 'alice')?.label).toBe("Équipe de l'agence");
    expect(conv.participants.find(p => p.userId === 'cli')?.label).toBe('Nom cli');
    await sendMessage(staff('alice'), conv.id, 'Re');
    const msgs = await listMessages(client('cli'), conv.id);
    expect(msgs.items.map(m => m.authorLabel)).toEqual(['Nom cli', "Équipe de l'agence"]);
    // vu par le personnel : l'e-mail de repli reste disponible
    const staffView = await listMessages(staff('alice'), conv.id);
    expect(staffView.items[1].authorLabel).toBe('alice@exemple.test');
  });

  it("le directory STAFF liste personnel et clients de l'agence, filtre par q", async () => {
    const all = await directory(staff('alice'));
    expect(all.map(e => e.userId)).not.toContain('alice');
    expect(all.map(e => e.userId)).not.toContain('zed');
    expect(all.find(e => e.userId === 'cli')?.kind).toBe('CLIENT');
    const filtered = await directory(staff('alice'), 'BOB');
    expect(filtered.map(e => e.userId)).toEqual(['bob']);
  });
});

describe('acces : participant non parti du tenant, sinon NotFoundError', () => {
  let convId: string;
  beforeEach(async () => {
    convId = (await createConversation(staff('alice'), { participantUserIds: ['bob'] })).id;
  });

  it("un non-participant (y compris un administrateur du meme tenant) ne lit, n'ecrit ni ne marque lu", async () => {
    for (const intruder of [staff('carol'), staff('admin')]) {
      await expect(getConversation(intruder, convId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listMessages(intruder, convId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(sendMessage(intruder, convId, 'coucou')).rejects.toBeInstanceOf(NotFoundError);
      await expect(markRead(intruder, convId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(addParticipants(intruder, convId, ['carol'])).rejects.toBeInstanceOf(NotFoundError);
      await expect(leaveConversation(intruder, convId)).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(tables.message).toHaveLength(0);
  });

  it("une conversation d'une autre agence est introuvable meme pour un participant du meme id", async () => {
    await expect(getConversation(staff('alice', T2), convId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(sendMessage(staff('zed', T2), convId, 'x')).rejects.toBeInstanceOf(NotFoundError);
    // un participant dont la ligne pointe un autre tenant n'ouvre rien non plus
    tables.conversationParticipant.find(p => p.userId === 'alice')!.tenantId = T2;
    await expect(getConversation(staff('alice'), convId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("un participant parti n'a plus acces", async () => {
    await leaveConversation(staff('bob'), convId);
    await expect(listMessages(staff('bob'), convId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(sendMessage(staff('bob'), convId, 'x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(getConversation(staff('alice'), convId)).resolves.toMatchObject({
      participants: [{ userId: 'alice' }]
    });
  });

  it('ajout de participants : groupes seulement, participants verifies', async () => {
    await expect(addParticipants(staff('alice'), convId, ['carol'])).rejects.toThrow();
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'], title: 'G' });
    await expect(addParticipants(staff('alice'), g.id, ['zed'])).rejects.toBeInstanceOf(NotFoundError);
    const done = await addParticipants(staff('alice'), g.id, ['admin', 'carol']);
    expect(done.participants.map(p => p.userId).sort()).toEqual(['admin', 'alice', 'bob', 'carol']);
  });

  it('un participant ajoute ne voit pas les messages anterieurs a son arrivee', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'], title: 'G' });
    await sendMessage(staff('alice'), g.id, 'avant');
    await new Promise(resolve => setTimeout(resolve, 5));
    await addParticipants(staff('alice'), g.id, ['admin']);
    await new Promise(resolve => setTimeout(resolve, 5));
    await sendMessage(staff('alice'), g.id, 'apres');
    const seen = await listMessages(staff('admin'), g.id);
    expect(seen.items.map(m => m.body)).toEqual(['apres']);
    const full = await listMessages(staff('bob'), g.id);
    expect(full.items.map(m => m.body)).toEqual(['avant', 'apres']);
  });
});

describe('messages', () => {
  let convId: string;
  beforeEach(async () => {
    convId = (await createConversation(staff('alice'), { participantUserIds: ['bob'] })).id;
  });

  it('valide le corps : trim, 1..5000', async () => {
    await expect(sendMessage(staff('alice'), convId, '   ')).rejects.toThrow();
    await expect(sendMessage(staff('alice'), convId, 'x'.repeat(5001))).rejects.toThrow();
    const ok = await sendMessage(staff('alice'), convId, `  ${'x'.repeat(5000)}  `);
    expect(ok.body).toHaveLength(5000);
  });

  it("un envoi met a jour lastMessageAt et le lastReadAt de l'auteur", async () => {
    const m = await sendMessage(staff('alice'), convId, 'Bonjour');
    expect(m).toMatchObject({ authorUserId: 'alice', mine: true, body: 'Bonjour', authorLabel: 'Nom alice' });
    const conv = tables.conversation[0];
    expect(conv.lastMessageAt).toBeInstanceOf(Date);
    const mine = tables.conversationParticipant.find(p => p.userId === 'alice')!;
    expect(mine.lastReadAt).toBeInstanceOf(Date);
    expect(tables.conversationParticipant.find(p => p.userId === 'bob')!.lastReadAt).toBeNull();
  });

  it('pagine par curseur `before`, ordre chronologique croissant dans la page', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await sendMessage(staff('alice'), convId, `m${i}`);
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    const first = await listMessages(staff('bob'), convId, { limit: 2 });
    expect(first.items.map(m => m.body)).toEqual(['m4', 'm5']);
    expect(first.hasMore).toBe(true);
    expect(first.items[0].mine).toBe(false);
    const second = await listMessages(staff('bob'), convId, { limit: 2, before: first.items[0].id });
    expect(second.items.map(m => m.body)).toEqual(['m2', 'm3']);
    const third = await listMessages(staff('bob'), convId, { limit: 2, before: second.items[0].id });
    expect(third.items.map(m => m.body)).toEqual(['m1']);
    expect(third.hasMore).toBe(false);
  });

  it("un curseur inconnu ou d'une autre conversation est refuse", async () => {
    const other = await createConversation(staff('alice'), { participantUserIds: ['carol'] });
    const m = await sendMessage(staff('alice'), other.id, 'ailleurs');
    await expect(listMessages(staff('bob'), convId, { before: m.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("liste les conversations du participant, la plus recente d'abord, avec dernier message", async () => {
    const c2 = await createConversation(staff('alice'), { participantUserIds: ['carol'] });
    await sendMessage(staff('alice'), convId, 'un');
    await new Promise(resolve => setTimeout(resolve, 3));
    await sendMessage(staff('alice'), c2.id, 'deux');
    const list = await listConversations(staff('alice'));
    expect(list.total).toBe(2);
    expect(list.items.map(i => i.id)).toEqual([c2.id, convId]);
    expect(list.items[0].lastMessage?.body).toBe('deux');
    expect((await listConversations(staff('admin'))).items).toHaveLength(0);
  });
});

describe('non-lus', () => {
  it("compte les conversations avec un message non lu d'un autre, et markRead remet a zero", async () => {
    const c1 = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    const c2 = await createConversation(staff('carol'), { participantUserIds: ['bob'] });
    await new Promise(resolve => setTimeout(resolve, 3));
    await sendMessage(staff('alice'), c1.id, 'a');
    await sendMessage(staff('alice'), c1.id, 'b');
    await sendMessage(staff('carol'), c2.id, 'c');

    expect(await unreadCount(staff('bob'))).toEqual({ count: 2 });
    expect(await unreadCount(staff('alice'))).toEqual({ count: 0 });
    const summary = await getConversation(staff('bob'), c1.id);
    expect(summary.unreadCount).toBe(2);

    await new Promise(resolve => setTimeout(resolve, 3));
    const read = await markRead(staff('bob'), c1.id);
    expect(typeof read.lastReadAt).toBe('string');
    expect(await unreadCount(staff('bob'))).toEqual({ count: 1 });
    expect((await getConversation(staff('bob'), c1.id)).unreadCount).toBe(0);

    await new Promise(resolve => setTimeout(resolve, 3));
    await sendMessage(staff('alice'), c1.id, 'd');
    expect(await unreadCount(staff('bob'))).toEqual({ count: 2 });
  });

  it('une conversation quittee ne compte plus', async () => {
    const c = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    await new Promise(resolve => setTimeout(resolve, 3));
    await sendMessage(staff('alice'), c.id, 'a');
    await leaveConversation(staff('bob'), c.id);
    expect(await unreadCount(staff('bob'))).toEqual({ count: 0 });
  });
});

describe('notifications des destinataires', () => {
  it('envoie une notification IN_APP aux AUTRES participants uniquement', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'], title: 'G' });
    await sendMessage(staff('alice'), g.id, 'Bonjour a tous');
    await flush();
    expect(notifyMock).toHaveBeenCalledTimes(2);
    const calls = notifyMock.mock.calls.map(c => c[0]);
    expect(calls.map(c => c.recipients[0].userId).sort()).toEqual(['bob', 'carol']);
    expect(calls[0]).toMatchObject({
      tenantId: T1,
      key: 'MESSAGE_RECEIVED',
      title: 'Nom alice',
      body: 'Vous avez reçu un nouveau message.',
      link: `/messages/${g.id}`,
      channels: ['IN_APP'],
      senderUserId: 'alice',
      relatedEntity: { type: 'Conversation', id: g.id }
    });
  });

  it('VIE PRIVEE : aucun extrait du message ne part dans la notification (corps generique)', async () => {
    const c = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    await sendMessage(staff('alice'), c.id, 'Mot de passe du coffre : 12345-SECRET');
    await flush();
    const input = notifyMock.mock.calls[0][0];
    expect(input.body).toBe('Vous avez reçu un nouveau message.');
    expect(JSON.stringify(input)).not.toContain('SECRET');
    expect(JSON.stringify(tables.userNotification)).not.toContain('SECRET');
  });

  it("le titre ne revele pas l'e-mail de l'expediteur a un client destinataire", async () => {
    tables.user.find(u => u.id === 'alice')!.fullName = null;
    const c = await createConversation(client('cli'), { participantUserIds: ['alice'] });
    await sendMessage(staff('alice'), c.id, 'Bonjour');
    await flush();
    expect(notifyMock.mock.calls[0][0]).toMatchObject({ recipients: [{ userId: 'cli' }], title: "Équipe de l'agence" });
  });

  it('ne notifie pas un participant parti', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'], title: 'G' });
    await leaveConversation(staff('carol'), g.id);
    await sendMessage(staff('alice'), g.id, 'x');
    await flush();
    expect(notifyMock.mock.calls.map(c => c[0].recipients[0].userId)).toEqual(['bob']);
  });

  it("met a jour la notification non lue existante au lieu d'en creer une autre", async () => {
    const c = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    await sendMessage(staff('alice'), c.id, 'premier');
    await flush();
    await sendMessage(staff('alice'), c.id, 'second');
    await flush();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(tables.userNotification).toHaveLength(1);
    // Le corps reste generique : la mise a jour anti-bruit ne reecrit aucun contenu.
    expect(tables.userNotification[0].body).toBe('Vous avez reçu un nouveau message.');
    expect(JSON.stringify(tables.userNotification)).not.toContain('second');
    // une fois lue, la suivante en cree une nouvelle
    tables.userNotification[0].readAt = new Date();
    await sendMessage(staff('alice'), c.id, 'troisieme');
    await flush();
    expect(notifyMock).toHaveBeenCalledTimes(2);
  });

  it("un echec de notify ne fait pas echouer l'envoi (rejet ou exception synchrone)", async () => {
    const c = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    notifyMock.mockRejectedValueOnce(new Error('boum'));
    await expect(sendMessage(staff('alice'), c.id, 'un')).resolves.toMatchObject({ body: 'un' });
    notifyMock.mockImplementationOnce(() => {
      throw new Error('boum synchrone');
    });
    await expect(sendMessage(staff('alice'), c.id, 'deux')).resolves.toMatchObject({ body: 'deux' });
    await flush();
    expect(tables.message).toHaveLength(2);
  });
});

describe('requetes en nombre constant', () => {
  it('lister N conversations ne fait pas une requete par conversation', async () => {
    const counts: number[] = [];
    for (const n of [1, 6]) {
      resetFake();
      for (const id of ['alice', 'bob']) addStaff(T1, id);
      for (let i = 0; i < n; i += 1) {
        addStaff(T1, `p${i}`);
        const c = await createConversation(staff('alice'), { participantUserIds: [`p${i}`, 'bob'], title: `G${i}` });
        await sendMessage(staff(`p${i}`), c.id, `m${i}`);
      }
      await flush();
      stats.findFirst = 0;
      stats.findMany = 0;
      stats.groupBy = 0;
      const page = await listConversations(staff('bob'));
      expect(page.items).toHaveLength(n);
      for (const item of page.items) {
        expect(item.unreadCount).toBe(1);
        expect(item.lastMessage?.body).toMatch(/^m\d$/);
      }
      expect(stats.groupBy).toBe(1);
      counts.push(stats.findFirst + stats.findMany + stats.groupBy);
    }
    expect(counts[1]).toBe(counts[0]);
  });

  it('unreadCount : un groupBy, aucune recherche unitaire par conversation', async () => {
    for (let i = 0; i < 4; i += 1) {
      const c = await createConversation(staff('alice'), { participantUserIds: ['bob'], title: `G${i}` });
      await new Promise(resolve => setTimeout(resolve, 2));
      await sendMessage(staff('alice'), c.id, `m${i}`);
    }
    await flush();
    stats.findFirst = 0;
    stats.groupBy = 0;
    expect(await unreadCount(staff('bob'))).toEqual({ count: 4 });
    expect(stats.groupBy).toBe(1);
    expect(stats.findFirst).toBe(0);
  });
});

describe('quitter une conversation', () => {
  it('marque leftAt, la conversation disparait de la liste, les autres restent', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'], title: 'G' });
    await expect(leaveConversation(staff('bob'), g.id)).resolves.toEqual({ left: true });
    expect((await listConversations(staff('bob'))).items).toHaveLength(0);
    expect((await listConversations(staff('alice'))).items).toHaveLength(1);
    expect(tables.conversationParticipant.find(p => p.userId === 'bob')!.leftAt).toBeInstanceOf(Date);
    await expect(leaveConversation(staff('bob'), g.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('clients portail joignables par le personnel : CRM_CONTACTS_VIEW', () => {
  it('sans la permission : NotFoundError en creation (1-a-1 et groupe) comme pour un inconnu', async () => {
    hasPermissionMock.mockResolvedValue(false);
    await expect(createConversation(staff('alice'), { participantUserIds: ['cli'] })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(createConversation(staff('alice'), { participantUserIds: ['bob', 'cli'] })).rejects.toBeInstanceOf(
      NotFoundError
    );
    const ghost = await createConversation(staff('alice'), { participantUserIds: ['inconnu'] }).catch(e => e);
    const refused = await createConversation(staff('alice'), { participantUserIds: ['cli'] }).catch(e => e);
    expect(refused.message).toBe(ghost.message);
    expect(hasPermissionMock).toHaveBeenCalledWith('alice', 'CRM_CONTACTS_VIEW', T1);
  });

  it('sans la permission : NotFoundError a l ajout de participant, aucune participation creee', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'] });
    hasPermissionMock.mockResolvedValue(false);
    await expect(addParticipants(staff('alice'), g.id, ['cli'])).rejects.toBeInstanceOf(NotFoundError);
    expect(tables.conversationParticipant.some(p => p.userId === 'cli')).toBe(false);
  });

  it('avec la permission : le client est joignable (creation et ajout)', async () => {
    const direct = await createConversation(staff('alice'), { participantUserIds: ['cli'] });
    expect(direct.participants.find(p => p.userId === 'cli')?.kind).toBe('CLIENT');
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'] });
    const done = await addParticipants(staff('alice'), g.id, ['cli']);
    expect(done.participants.map(p => p.userId)).toContain('cli');
  });

  it('un client qui est aussi membre actif du personnel reste joignable sans la permission', async () => {
    addClient(T1, 'bob');
    hasPermissionMock.mockResolvedValue(false);
    const conv = await createConversation(staff('alice'), { participantUserIds: ['bob'] });
    expect(conv.participants.find(p => p.userId === 'bob')?.kind).toBe('STAFF');
  });
});

describe('plafond de participants : recomptage sous verrou', () => {
  it('le 51e est refuse par le recomptage dans la transaction meme si le controle initial passait', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob'], title: 'Equipe' });
    for (let i = 0; i < 46; i += 1) {
      addStaff(T1, `m${i}`);
      tables.conversationParticipant.push({
        id: `cp-m${i}`,
        tenantId: T1,
        conversationId: g.id,
        userId: `m${i}`,
        leftAt: null,
        joinedAt: new Date(),
        lastReadAt: null
      });
    }
    // 48 actifs. Deux ajouts : 50 au controle initial (passe) ; un ajout concurrent entre-temps.
    addStaff(T1, 'x1');
    addStaff(T1, 'x2');
    locks.onLock = () => {
      tables.conversationParticipant.push({
        id: 'cp-concurrent',
        tenantId: T1,
        conversationId: g.id,
        userId: 'carol',
        leftAt: null,
        joinedAt: new Date(),
        lastReadAt: null
      });
    };
    await expect(addParticipants(staff('alice'), g.id, ['x1', 'x2'])).rejects.toMatchObject({
      message: 'Trop de participants.'
    });
    expect(tables.conversationParticipant.some(p => p.userId === 'x1')).toBe(false);
    expect(tables.conversationParticipant.some(p => p.userId === 'x2')).toBe(false);
  });

  it('le verrou cible la conversation ET l agence, avec des valeurs parametrees', async () => {
    const g = await createConversation(staff('alice'), { participantUserIds: ['bob', 'carol'] });
    await addParticipants(staff('alice'), g.id, ['admin']);
    expect(locks.calls).toHaveLength(1);
    expect(locks.calls[0].sql).toMatch(/FROM conversations WHERE id = \? AND tenant_id = \? FOR UPDATE/);
    expect(locks.calls[0].values).toEqual([g.id, T1]);
  });
});
