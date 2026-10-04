import { t } from '../../../i18n';
import { createAbortError } from './anthropic-provider';
import type { CopilotToolName, LlmBlock, LlmMessage, LlmProvider, LlmToolSpec, LlmTurnResult } from '../contracts';

/**
 * Faux fournisseur déterministe (`AI_PROVIDER=fake`, interdit en production).
 *
 * Il sert aux tests, à la démo et à la recette sans clé. Il n'exécute jamais
 * rien : il ne fait qu'émettre des appels d'outils, dont
 * `propose_rental_document`, qui ne fait que proposer. Le jeton et la
 * confirmation humaine restent seuls maîtres de la génération.
 *
 * Sans script, des règles par mots-clés lisent le dernier message utilisateur :
 * - « capacités », « catalogue » (passerelle, seulement si list_capabilities et call_read sont offerts) :
 *   list_capabilities (mot-clé cité après « sur », sinon la liste des modules), puis call_read sur la
 *   première route sans paramètre de chemin trouvée ;
 * - « crée » + « étiquette » (écriture, seulement si plan_write est offert) : plan_write d'une
 *   création `POST .../crm/tags` (nom cité après « étiquette », sinon « Prioritaire ») ;
 *   « modifie » + « contact » : call_read de la liste des contacts, puis plan_write d'un
 *   `PATCH .../crm/contacts/:contactId` (champ `internalNotes`, texte cité entre guillemets, sinon une
 *   note neutre) sur le premier contact trouvé. Exemples sans risque ; le fournisseur n'écrit
 *   jamais : il ne fait que PLANIFIER, l'accord humain et la route de confirmation restent seuls maîtres ;
 *   « désactive » + « collaborateur » (ou membre, utilisateur) : call_read de la liste des collaborateurs,
 *   puis plan_write SENSIBLE de `POST .../users/:userId/disable` (dernier collaborateur listé), pour
 *   exercer de bout en bout le mot de confirmation. Même garantie : il ne planifie que ;
 * - « tableau », « graphique » (+ « baux » pour des baux, sinon des biens) : search_properties ou
 *   search_leases puis show_artifact (table ou chart construit sur les résultats) ; « synthèse » :
 *   show_artifact (markdown) sans recherche. Seulement si show_artifact est offert ;
 * - « quittance » (+ `L-\d+` ou `BAIL-AAAA-NNNN` ou le bail actif, + période `YYYY-MM` ou mois en
 *   lettres) : search_leases puis propose_rental_document ;
 * - « relevé » (+ période : deux dates, un ou deux mois ; à défaut les 12
 *   derniers mois) : search_leases puis propose_rental_document (RENT_RECEIPT
 *   → RENT_STATEMENT) ;
 * - « documents » : search_leases puis list_lease_documents (bail cité) ou
 *   search_properties puis list_property_documents ;
 * - « bail », « baux », « locataire » (+ nom) : search_leases ;
 * - « biens » (+ commune ou quartier) : search_properties.
 * Le tour final d'une quittance ou d'un relevé lit le `status` renvoyé par
 * propose_rental_document (PROPOSAL_READY, ALREADY_EXISTS, NOT_POSSIBLE).
 * Une fois les `tool_result` revenus, il répond en texte, découpé en morceaux
 * de 20 caractères via `onTextDelta`.
 */

export interface FakeStep {
  /** Texte de l'assistant pour ce tour (découpé en morceaux de 20 caractères). */
  text?: string;
  /** Appels d'outils émis ; le tour se termine alors sur `tool_use`. */
  toolCalls?: Array<{ name: CopilotToolName; input: unknown }>;
}

export const FAKE_CHUNK_SIZE = 20;

type ToolResult = { name: string; data: unknown; isError: boolean };

/** Minuscules sans accents, pour comparer des mots-clés. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MONTHS = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre'
];

const MONTH_LABELS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];

function textOf(message: LlmMessage): string {
  return message.content
    .filter((block): block is Extract<LlmBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join(' ');
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/** Premier élément d'un tableau d'objets quelconque du résultat d'outil. */
function firstItem(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  if (data && typeof data === 'object') {
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(value)) return firstItem(value);
    }
  }
  return null;
}

function countItems(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(value)) return value.length;
    }
  }
  return 0;
}

function idOf(item: Record<string, unknown> | null): string | null {
  const id = item?.id ?? item?.leaseId ?? item?.propertyId;
  return typeof id === 'string' ? id : null;
}

/** Commune ou quartier cité après une préposition (« à Cocody », « dans le quartier X »). */
function extractPlace(text: string): string | null {
  const match =
    /(?<![\p{L}])(?:à|dans|au|en|sur|quartier|commune de|ville de)\s+(?:(?:le|la|l'|les|du|de)\s+)?(?:(?:quartier|commune)\s+(?:de\s+)?)?([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2})/iu.exec(
      text
    );
  if (!match) return null;
  const stop = new Set(['avec', 'pour', 'et', 'ou', 'qui', 'de', 'du', 'a', 'à', 'en', 'sur', 'dans']);
  const words = match[1].split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    if (stop.has(word.toLowerCase())) break;
    kept.push(word);
  }
  const place = kept.join(' ').replace(/[’']$/, '').trim();
  return place || null;
}

function extractPeriod(text: string, now: Date): { period: string; label: string } | null {
  const iso = /\b(20\d{2})-(0[1-9]|1[0-2])\b/.exec(text);
  if (iso) {
    const monthIndex = Number(iso[2]) - 1;
    return { period: `${iso[1]}-${iso[2]}`, label: `${MONTH_LABELS[monthIndex]} ${iso[1]}` };
  }
  const normalized = normalize(text);
  for (let index = 0; index < MONTHS.length; index += 1) {
    if (new RegExp(`\\b${MONTHS[index]}\\b`).test(normalized)) {
      const year = /\b(20\d{2})\b/.exec(normalized)?.[1] ?? String(now.getFullYear());
      return { period: `${year}-${String(index + 1).padStart(2, '0')}`, label: `${MONTH_LABELS[index]} ${year}` };
    }
  }
  return null;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const isoDay = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const lastDayOfMonth = (year: number, month: number): string => isoDay(new Date(Date.UTC(year, month, 0)));

/**
 * Période d'un relevé : deux dates AAAA-MM-JJ, deux mois AAAA-MM, un ou deux
 * mois en lettres (année citée ou courante) ; à défaut, les 12 derniers mois.
 */
function extractStatementRange(text: string, now: Date): { startDate: string; endDate: string } {
  const days = text.match(/\b20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g);
  if (days && days.length >= 2) return { startDate: days[0], endDate: days[1] };

  const months: Array<{ year: number; month: number }> = [];
  for (const match of text.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])\b(?!-)/g)) {
    months.push({ year: Number(match[1]), month: Number(match[2]) });
  }
  if (months.length === 0) {
    const normalized = normalize(text);
    const year = Number(/\b(20\d{2})\b/.exec(normalized)?.[1] ?? now.getUTCFullYear());
    const found: Array<{ index: number; month: number }> = [];
    MONTHS.forEach((name, index) => {
      const at = new RegExp(`\\b${name}\\b`).exec(normalized);
      if (at) found.push({ index: at.index, month: index + 1 });
    });
    found.sort((a, b) => a.index - b.index).forEach(entry => months.push({ year, month: entry.month }));
  }
  if (months.length > 0) {
    const first = months[0];
    const last = months[months.length - 1];
    return {
      startDate: `${first.year}-${pad(first.month)}-01`,
      endDate: lastDayOfMonth(last.year, last.month)
    };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return { startDate: isoDay(start), endDate: isoDay(now) };
}

/** Nom du locataire cité après « locataire » (« le locataire Awa Koné »), avec capitale. */
function extractRenterName(text: string): string | null {
  const match =
    /\blocataires?\s+(?:(?:M\.|Mme|Monsieur|Madame)\s+)?(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})/u.exec(text);
  return match ? match[1].trim() : null;
}

/** Texte du tour final quand la proposition n'est pas prête ; `null` si elle l'est. */
function proposalFailureText(data: unknown, periodLabel: string): string | null {
  const record = (data && typeof data === 'object' ? data : {}) as { status?: unknown; reason?: unknown };
  if (record.status === undefined || record.status === 'PROPOSAL_READY') return null;
  if (record.status === 'ALREADY_EXISTS') {
    return t('La quittance de {{period}} existe déjà : je vous la présente ci-dessous, rien de nouveau à générer.', {
      period: periodLabel
    });
  }
  const reasons: Record<string, string> = {
    lease_not_seen: t("ce bail n'a pas été identifié dans la conversation"),
    NO_PAYMENT: t('aucun paiement encaissé pour cette période'),
    NO_INSTALLMENT: t("le bail n'a pas d'échéance pour cette période"),
    NO_TEMPLATE: t("aucun modèle de document n'est disponible pour l'agence"),
    PERIOD_TOO_LONG: t('un relevé couvre au plus 12 mois'),
    INVALID_PERIOD: t('la période est invalide'),
    MISSING_PERIOD: t('la période est manquante')
  };
  const reason = typeof record.reason === 'string' ? reasons[record.reason] : undefined;
  return reason
    ? t('Je ne peux pas proposer ce document : {{reason}}.', { reason })
    : t('Je ne peux pas proposer ce document pour le moment.');
}

/** Texte affichable sans balise : le schéma de show_artifact refuse le HTML. */
const plain = (value: unknown): string => (typeof value === 'string' ? value.replace(/[<>]/g, '') : '');
const numberOrNull = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

type ArtifactKind = 'table' | 'chart';

/** Artefact construit sur les résultats d'une recherche de biens ou de baux (jamais sur autre chose). */
function artifactInput(kind: ArtifactKind, source: 'properties' | 'leases', data: unknown): FakeStep {
  const items = ((data as { items?: unknown } | null)?.items ?? []) as Array<Record<string, unknown>>;
  const list = Array.isArray(items) ? items.slice(0, 10) : [];
  if (list.length === 0) return { text: t('Aucun résultat à afficher.') };

  if (source === 'properties') {
    if (kind === 'chart') {
      return {
        toolCalls: [
          {
            name: 'show_artifact',
            input: {
              kind: 'chart',
              title: t('Prix des biens'),
              chartType: 'bar',
              xKey: 'reference',
              series: [{ key: 'price', label: t('Prix') }],
              data: list.map(item => ({ reference: plain(item.internalReference), price: numberOrNull(item.price) }))
            }
          }
        ]
      };
    }
    return {
      toolCalls: [
        {
          name: 'show_artifact',
          input: {
            kind: 'table',
            title: t('Biens trouvés'),
            columns: [
              { key: 'reference', label: t('Référence') },
              { key: 'title', label: t('Titre') },
              { key: 'status', label: t('Statut') },
              { key: 'zone', label: t('Zone') },
              { key: 'price', label: t('Prix'), type: 'currency' }
            ],
            rows: list.map(item => ({
              reference: plain(item.internalReference),
              title: plain(item.title),
              status: plain(item.status),
              zone: plain(item.locationZone),
              price: numberOrNull(item.price)
            }))
          }
        }
      ]
    };
  }

  if (kind === 'chart') {
    return {
      toolCalls: [
        {
          name: 'show_artifact',
          input: {
            kind: 'chart',
            title: t('Loyers des baux'),
            chartType: 'bar',
            xKey: 'lease',
            series: [{ key: 'rent', label: t('Loyer') }],
            data: list.map(item => ({ lease: plain(item.leaseNumber), rent: numberOrNull(item.rentAmount) }))
          }
        }
      ]
    };
  }
  return {
    toolCalls: [
      {
        name: 'show_artifact',
        input: {
          kind: 'table',
          title: t('Baux trouvés'),
          columns: [
            { key: 'lease', label: t('Bail') },
            { key: 'status', label: t('Statut') },
            { key: 'renter', label: t('Locataire') },
            { key: 'rent', label: t('Loyer'), type: 'currency' },
            { key: 'start', label: t('Début'), type: 'date' }
          ],
          rows: list.map(item => ({
            lease: plain(item.leaseNumber),
            status: plain(item.status),
            renter: plain(item.renterName),
            rent: numberOrNull(item.rentAmount),
            start: plain(item.startDate)
          }))
        }
      }
    ]
  };
}

/** Premier objet portant un `id` texte dans un résultat d'outil (liste de contacts, enveloppe quelconque). */
function findFirstId(data: unknown, depth = 0): string | null {
  if (depth > 6 || data === null || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findFirstId(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(record.id)) return record.id;
  for (const value of Object.values(record)) {
    const found = findFirstId(value, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Texte cité entre guillemets (« … », "…"), sinon null. */
function extractQuoted(text: string): string | null {
  const match = /[«"“]\s*([^»"”]{1,200}?)\s*[»"”]/.exec(text);
  return match ? match[1].replace(/[<>]/g, '') : null;
}

/** Nom d'étiquette cité après « étiquette » ou entre guillemets. */
function extractTagName(text: string): string {
  const quoted = extractQuoted(text);
  if (quoted) return quoted.slice(0, 60);
  const match = /(?<![\p{L}])[ée]tiquette\s+([\p{L}0-9][\p{L}0-9' _-]{0,40})/iu.exec(text);
  return match ? match[1].trim() : 'Prioritaire';
}

const CREATE_TAG = 'POST /api/tenants/:tenantId/crm/tags';
const LIST_CONTACTS = 'GET /api/tenants/:tenantId/crm/contacts';
const PATCH_CONTACT = 'PATCH /api/tenants/:tenantId/crm/contacts/:contactId';
const LIST_MEMBERS = 'GET /api/tenants/:tenantId/users';
const DISABLE_MEMBER = 'POST /api/tenants/:tenantId/users/:userId/disable';

/** Dernier collaborateur de `{ data: { members: [{ user: { id } }] } }` (le premier est souvent le demandeur). */
function lastMemberUserId(data: unknown): string | null {
  // Le résultat de call_read porte le corps de la réponse (`{ success, data: { members } }`) : on le déballe.
  let node = data as { members?: unknown; data?: unknown } | null;
  for (let depth = 0; depth < 3 && node && !Array.isArray(node.members); depth += 1) {
    node = node.data as typeof node;
  }
  const members = node?.members;
  if (!Array.isArray(members)) return null;
  for (let index = members.length - 1; index >= 0; index -= 1) {
    const id = (members[index] as { user?: { id?: unknown } } | null)?.user?.id;
    if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)) return id;
  }
  return null;
}

/** Dernier mot de l'assistant après un plan : le plan est PROPOSÉ, jamais « fait ». */
function planOutcomeText(result: ToolResult | undefined): string {
  const data = result?.data as { planned?: unknown } | null;
  return data?.planned === true
    ? t("J'ai préparé le plan d'écriture. Rien n'a été modifié : il ne sera appliqué qu'après votre approbation.")
    : t("Je n'ai pas pu préparer ce plan d'écriture.");
}

/** Capacités annoncées : uniquement celles des outils réellement offerts par le serveur. */
function capabilitiesText(offered: ReadonlySet<string> | null): string {
  const has = (name: string) => offered === null || offered.has(name);
  if (
    has('search_properties') &&
    has('search_leases') &&
    has('list_lease_documents') &&
    has('propose_rental_document')
  ) {
    return t(
      'Je peux rechercher des biens, retrouver des baux, lister des documents et proposer une quittance de loyer.'
    );
  }
  const parts: string[] = [];
  if (has('search_properties')) parts.push(t('rechercher des biens'));
  if (has('search_leases')) parts.push(t('retrouver des baux'));
  if (has('list_lease_documents') || has('list_property_documents')) parts.push(t('lister des documents'));
  if (has('propose_rental_document')) parts.push(t('proposer une quittance de loyer'));
  if (parts.length === 0) return t("Aucune capacité n'est disponible avec votre abonnement.");
  return t('Je peux {{capabilities}}.', { capabilities: parts.join(', ') });
}

export class FakeProvider implements LlmProvider {
  readonly id = 'fake' as const;

  constructor(
    private readonly script?: FakeStep[],
    private readonly now: () => Date = () => new Date()
  ) {}

  async runTurn(
    req: { system: string; messages: LlmMessage[]; tools: LlmToolSpec[]; maxOutputTokens: number },
    onTextDelta: (text: string) => void,
    signal: AbortSignal
  ): Promise<LlmTurnResult> {
    if (signal.aborted) throw createAbortError();

    const { question, round, results } = this.analyse(req.messages);
    const step = this.script
      ? (this.script[round] ?? {})
      : this.decide(question, round, results, req.tools.length > 0 ? new Set(req.tools.map(tool => tool.name)) : null);

    const blocks: LlmBlock[] = [];
    if (step.text) {
      for (let offset = 0; offset < step.text.length; offset += FAKE_CHUNK_SIZE) {
        if (signal.aborted) throw createAbortError();
        onTextDelta(step.text.slice(offset, offset + FAKE_CHUNK_SIZE));
      }
      blocks.push({ type: 'text', text: step.text });
    }

    const toolCalls = (step.toolCalls ?? []).map((call, index) => ({
      id: `fake_tool_${round}_${index}`,
      name: call.name,
      input: call.input
    }));
    for (const call of toolCalls) blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });

    return {
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      assistantContent: blocks,
      toolCalls
    };
  }

  /** Dernière question de l'utilisateur, tour courant et résultats d'outils déjà reçus. */
  private analyse(messages: LlmMessage[]): { question: string; round: number; results: ToolResult[] } {
    let questionIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === 'user' && message.content.some(block => block.type === 'text')) {
        questionIndex = index;
        break;
      }
    }
    const question = questionIndex >= 0 ? textOf(messages[questionIndex]) : '';
    const after = questionIndex >= 0 ? messages.slice(questionIndex + 1) : [];

    const names = new Map<string, string>();
    let round = 0;
    const results: ToolResult[] = [];
    for (const message of after) {
      if (message.role === 'assistant') {
        round += 1;
        for (const block of message.content) if (block.type === 'tool_use') names.set(block.id, block.name);
      } else {
        for (const block of message.content) {
          if (block.type === 'tool_result') {
            results.push({
              name: names.get(block.toolUseId) ?? '',
              data: parseJson(block.content),
              isError: Boolean(block.isError)
            });
          }
        }
      }
    }
    return { question, round, results };
  }

  private decide(
    question: string,
    round: number,
    results: ToolResult[],
    offered: ReadonlySet<string> | null
  ): FakeStep {
    const normalized = normalize(question);
    const leaseNumber = /\b(?:BAIL-\d{4}-\d+|L-\d+)\b/i.exec(question)?.[0].toUpperCase() ?? null;
    const call = (name: CopilotToolName, input: unknown): FakeStep => ({ toolCalls: [{ name, input }] });
    const renterName = extractRenterName(question);
    const leaseSearch = (): FakeStep =>
      call('search_leases', leaseNumber ? { leaseNumber } : renterName ? { renterName } : { status: 'ACTIVE' });

    const denial = results.find(
      result => result.isError && (result.data as { error?: unknown } | null)?.error === 'MODULE_NOT_INCLUDED'
    );
    if (denial) {
      const message = (denial.data as { message?: unknown }).message;
      return {
        text:
          typeof message === 'string' ? message : t("Cette fonctionnalité n'est pas comprise dans votre abonnement.")
      };
    }
    const planError = results.find(result => result.isError && result.name === 'plan_write');
    if (planError) {
      const message = (planError.data as { message?: unknown } | null)?.message;
      return {
        text:
          typeof message === 'string'
            ? t("Je n'ai pas pu préparer ce plan d'écriture : {{reason}}", { reason: message })
            : t("Je n'ai pas pu préparer ce plan d'écriture.")
      };
    }
    // Refus de permission (outil refusé, ou route réelle 401/403 convertie en ForbiddenError par l'outil).
    const permissionDenied = results.some(
      result =>
        result.isError &&
        ['FORBIDDEN', 'TOOL_FORBIDDEN'].includes(String((result.data as { error?: unknown } | null)?.error ?? ''))
    );
    if (permissionDenied) return { text: t("Je n'ai pas la permission d'accéder à cette donnée.") };
    if (results.some(result => result.isError)) {
      return { text: t("Je n'ai pas pu terminer cette recherche : un outil a renvoyé une erreur.") };
    }

    // Le bloc <screen_context> (JSON, guillemets compris) précède le texte de l'utilisateur : on l'écarte.
    const userText = question.replace(/<screen_context>[\s\S]*?<\/screen_context>/g, '').trim();

    // 000. Écriture : plan_write seulement (création d'une étiquette, modification d'un contact)
    const canPlan = offered === null || offered.has('plan_write');
    if (canPlan && /\b(cree|creer)\b/.test(normalized) && /\b(etiquette|etiquettes|tag)\b/.test(normalized)) {
      if (round === 0) {
        const name = extractTagName(userText);
        return call('plan_write', {
          capabilityId: CREATE_TAG,
          body: { name, color: '#1677ff' },
          title: t('Créer l’étiquette « {{name}} »', { name }),
          steps: [t('Ajouter l’étiquette « {{name}} » à la liste des étiquettes de l’agence.', { name })]
        });
      }
      return { text: planOutcomeText(results[0]) };
    }
    const canReadForPlan = offered === null || offered.has('call_read');
    if (canPlan && canReadForPlan && /\b(modifie|modifier)\b/.test(normalized) && /\bcontacts?\b/.test(normalized)) {
      if (round === 0) return call('call_read', { capabilityId: LIST_CONTACTS, query: { limit: 1 } });
      if (round === 1) {
        const contactId = findFirstId((results[0]?.data as { data?: unknown } | null)?.data);
        if (!contactId) return { text: t("Je n'ai trouvé aucun contact à modifier.") };
        const note = extractQuoted(userText) ?? t('Note ajoutée par l’assistant.');
        return call('plan_write', {
          capabilityId: PATCH_CONTACT,
          pathParams: { contactId },
          body: { internalNotes: note.slice(0, 500) },
          title: t('Mettre à jour la note interne du contact'),
          steps: [
            t('Lire la fiche du contact.'),
            t('Remplacer sa note interne par le texte indiqué, sans toucher aux autres champs.')
          ]
        });
      }
      return { text: planOutcomeText(results[1]) };
    }

    // 000 bis. Plan SENSIBLE de test (recette) : « désactive le collaborateur » -> lecture des collaborateurs
    // puis plan_write de `POST .../users/:userId/disable` (sensible : mot de confirmation exigé). Ne fait que
    // PLANIFIER : seule la confirmation humaine écrit.
    if (
      canPlan &&
      canReadForPlan &&
      /\b(desactive|desactiver)\b/.test(normalized) &&
      /\b(collaborateur|collaborateurs|membre|membres|utilisateur|utilisateurs)\b/.test(normalized)
    ) {
      if (round === 0) return call('call_read', { capabilityId: LIST_MEMBERS, query: { limit: 50 } });
      if (round === 1) {
        const userId = lastMemberUserId((results[0]?.data as { data?: unknown } | null)?.data);
        if (!userId) return { text: t("Je n'ai trouvé aucun collaborateur à désactiver.") };
        return call('plan_write', {
          capabilityId: DISABLE_MEMBER,
          pathParams: { userId },
          body: {},
          title: t('Désactiver un collaborateur'),
          steps: [t('Lire la fiche du collaborateur.'), t("Désactiver son accès à l'agence après votre approbation.")]
        });
      }
      return { text: planOutcomeText(results[1]) };
    }

    // 00. Passerelle générique : list_capabilities puis call_read (lecture seule)
    const canQueryGateway = offered === null || (offered.has('list_capabilities') && offered.has('call_read'));
    if (canQueryGateway && /\b(capacite|capacites|catalogue)\b/.test(normalized)) {
      if (round === 0) {
        const topic = /\bsur\s+(?:les?\s+|la\s+|l')?([a-z0-9-]{4,})/.exec(normalized)?.[1];
        return call('list_capabilities', topic ? { query: topic } : {});
      }
      if (round === 1) {
        const data = results[0]?.data as { items?: Array<{ id?: unknown; pathParams?: unknown }> } | null;
        const target = (data?.items ?? []).find(
          item => typeof item.id === 'string' && Array.isArray(item.pathParams) && item.pathParams.length === 0
        );
        return target
          ? call('call_read', { capabilityId: target.id })
          : { text: t('Aucune consultation correspondante dans le catalogue.') };
      }
      const read = results[1]?.data as { ok?: unknown; status?: unknown } | null;
      return read?.ok === true
        ? { text: t("J'ai consulté la donnée demandée (statut {{status}}).", { status: String(read.status) }) }
        : { text: t("La consultation n'a pas abouti.") };
    }

    // 0. Artefact (tableau, graphique, synthèse) — seulement si show_artifact est offert
    const canShow = offered === null || offered.has('show_artifact');
    if (canShow && /\b(tableau|graphique|synthese)\b/.test(normalized)) {
      if (/\bsynthese\b/.test(normalized)) {
        if (round === 0) {
          return {
            toolCalls: [
              {
                name: 'show_artifact',
                input: {
                  kind: 'markdown',
                  title: t('Synthèse'),
                  content: t(
                    '## Synthèse\n\n- Données issues des outils de l’assistant.\n- Aucune écriture n’a été faite.'
                  )
                }
              }
            ]
          };
        }
        return { text: t("J'ai affiché la synthèse dans le panneau.") };
      }
      const kind: ArtifactKind = /\bgraphique\b/.test(normalized) ? 'chart' : 'table';
      const source = /\b(bail|baux|loyer|loyers|locataire|locataires)\b/.test(normalized) ? 'leases' : 'properties';
      if (round === 0) {
        if (source === 'leases') return leaseSearch();
        const place = extractPlace(question);
        return call('search_properties', place ? { city: place } : {});
      }
      if (round === 1) return artifactInput(kind, source, results[0]?.data);
      const shown = results[1]?.data as { shown?: unknown } | null;
      return shown?.shown === true
        ? { text: t("J'ai affiché le résultat dans le panneau.") }
        : { text: t("Je n'ai pas pu afficher ce résultat.") };
    }

    // 1. Quittance
    if (normalized.includes('quittance')) {
      const period = extractPeriod(question, this.now());
      if (!period)
        return { text: t('Pour quelle période souhaitez-vous la quittance ? Indiquez le mois (par exemple 2026-03).') };
      if (round === 0) return leaseSearch();
      if (round === 1) {
        const leaseId = idOf(firstItem(results[0]?.data));
        if (!leaseId) return { text: t("Je n'ai trouvé aucun bail correspondant.") };
        return call('propose_rental_document', { docType: 'RENT_RECEIPT', leaseId, period: period.period });
      }
      const failure = proposalFailureText(results[1]?.data, period.label);
      if (failure) return { text: failure };
      return {
        text: t(
          'Je vous propose la quittance de loyer de {{period}}. Elle ne sera générée qu’après votre confirmation.',
          { period: period.label }
        )
      };
    }

    // 1 bis. Relevé de compte
    if (normalized.includes('releve')) {
      const range = extractStatementRange(question, this.now());
      const label = `${range.startDate} → ${range.endDate}`;
      if (round === 0) return leaseSearch();
      if (round === 1) {
        const leaseId = idOf(firstItem(results[0]?.data));
        if (!leaseId) return { text: t("Je n'ai trouvé aucun bail correspondant.") };
        return call('propose_rental_document', { docType: 'RENT_STATEMENT', leaseId, ...range });
      }
      const failure = proposalFailureText(results[1]?.data, label);
      if (failure) return { text: failure };
      return {
        text: t(
          'Je vous propose le relevé de compte du {{start}} au {{end}}. Il ne sera généré qu’après votre confirmation.',
          { start: range.startDate, end: range.endDate }
        )
      };
    }

    // 2. Documents
    if (normalized.includes('document')) {
      const forLease = leaseNumber !== null || normalized.includes('bail');
      if (round === 0) {
        if (forLease) return leaseSearch();
        const place = extractPlace(question);
        return call('search_properties', place ? { city: place } : {});
      }
      if (round === 1) {
        const id = idOf(firstItem(results[0]?.data));
        if (!id)
          return {
            text: forLease
              ? t("Je n'ai trouvé aucun bail correspondant.")
              : t("Je n'ai trouvé aucun bien correspondant.")
          };
        return forLease
          ? call('list_lease_documents', { leaseId: id })
          : call('list_property_documents', { propertyId: id });
      }
      return { text: t('Voici les documents trouvés ({{count}}).', { count: countItems(results[1]?.data) }) };
    }

    // 3. Baux (avant « biens » : « Quels baux concernent ce bien ? » cherche des baux)
    if (/\b(bail|baux|locataire|locataires)\b/.test(normalized)) {
      if (round === 0) return leaseSearch();
      const count = (results[0]?.data as { count?: unknown } | null)?.count;
      return {
        text: t("J'ai trouvé {{count}} bail(s) correspondant à votre recherche.", {
          count: typeof count === 'number' ? count : countItems(results[0]?.data)
        })
      };
    }

    // 4. Biens
    if (
      /\b(bien|biens|appartement|appartements|villa|villas|maison|maisons|studio|studios|terrain|terrains|local|locaux)\b/.test(
        normalized
      )
    ) {
      if (round === 0) {
        const place = extractPlace(question);
        return call('search_properties', place ? { city: place } : {});
      }
      const total = (results[0]?.data as { total?: unknown } | null)?.total;
      const count = typeof total === 'number' ? total : countItems(results[0]?.data);
      return { text: t("J'ai trouvé {{count}} bien(s) correspondant à votre recherche.", { count }) };
    }

    return { text: capabilitiesText(offered) };
  }
}
