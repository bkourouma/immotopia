import { t } from '../../../i18n';
import { AppError } from '../../../middleware/error-middleware';
import type { CopilotToolDefinition } from '../contracts';
import { followUpInput } from '../follow-ups';
import { assertToolPermission, outcome } from './tool-utils';

export const proposeFollowUpTool: CopilotToolDefinition<typeof followUpInput> = {
  name: 'propose_follow_up',
  description:
    'Prépare une confirmation pour une notification interne, une tâche, un export par e-mail ou un rapport récurrent. ' +
    'Utiliser uniquement sur demande explicite. Indiquer les noms complets des collaborateurs (ou @me pour moi). ' +
    'Les rapports exigent un identifiant de résultat obtenu dans le fil, les formats et, pour une programmation, le calendrier. ' +
    'Éclaircir toute donnée nécessaire manquante. Dire que la carte attend confirmation, et ne pas annoncer une action effectuée.',
  requiredPermission: 'PROPERTIES_VIEW',
  feature: 'CORE',
  kind: 'proposal',
  inputSchema: followUpInput,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'recipients'],
    properties: {
      kind: { type: 'string', enum: ['notify', 'task', 'email', 'schedule'] },
      recipients: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: { type: 'string' },
        description: 'Noms complets, ou @me pour le compte demandeur. Un destinataire pour une tâche.'
      },
      artifactId: {
        type: 'string',
        description: 'Identifiant du résultat du fil. Obligatoire pour email et schedule.'
      },
      title: { type: 'string', maxLength: 120, description: 'Titre obligatoire de la tâche.' },
      message: {
        type: 'string',
        maxLength: 2000,
        description: 'Message obligatoire pour notify (1000 caractères), description de tâche ou texte du courriel.'
      },
      formats: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: ['pdf', 'xlsx', 'csv'] } },
      dueDate: { type: 'string', description: 'Échéance de la tâche, AAAA-MM-JJ.' },
      priority: { type: 'string', enum: ['low', 'normal', 'high'] },
      schedule: {
        type: 'object',
        additionalProperties: false,
        required: ['frequency', 'time'],
        properties: {
          frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
          time: { type: 'string', description: 'HH:mm au quart d’heure.' },
          timeZone: { type: 'string', description: "Fuseau IANA. Omettre pour utiliser le fuseau de l'agence." },
          day: {
            type: 'integer',
            description: 'Lundi 1 à dimanche 7 pour weekly, 1 à 28 pour monthly. Omis pour daily.'
          }
        }
      }
    }
  },
  async execute(input, ctx) {
    assertToolPermission(ctx, 'PROPERTIES_VIEW');
    if (!ctx.proposeFollowUp)
      throw new AppError(t('Cette action nécessite un nouveau message dans un fil enregistré.'), 422);
    const proposal = await ctx.proposeFollowUp(input);
    return outcome(
      { status: 'pending_confirmation', kind: proposal.kind, recipients: proposal.display.recipients },
      { type: 'follow_up', proposal }
    );
  }
};
