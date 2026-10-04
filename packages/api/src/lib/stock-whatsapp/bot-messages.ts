import { t, currentLanguage } from '../../i18n';
import {
  META_BUTTON_TITLE_MAX,
  META_LIST_ROW_DESCRIPTION_MAX,
  META_LIST_ROW_TITLE_MAX,
  truncateLabel
} from './transport/message-limits';
import type { OutboundMessage, StockVisionResult } from './types';

/**
 * Textes du bot de l'inventaire par WhatsApp (lot 041, spec §10, M01 à M33).
 *
 * TOUT texte que le bot envoie vient d'ici, et passe par `t()` : le texte
 * français est la clé de traduction, la langue est celle du chef
 * (`runWithLanguage`, spec §8.5). Les variables `{{…}}` sont remplacées APRÈS
 * traduction.
 *
 * AVEUGLE (spec §8.3) : aucune fonction ne reçoit ni ne cite un attendu, un
 * solde, un écart, une valeur ou un coût. Le bot ne cite que ce que le chef a
 * compté : la proposition, la quantité confirmée, la quantité déjà comptée
 * dans l'inventaire (M30).
 *
 * Les nombres s'écrivent sans séparateur de milliers (« 1250 ») pour que le
 * chef puisse les recopier ; virgule décimale en français.
 */

/** Identifiants des boutons et des lignes de liste proposés par le bot. */
export const REPLY_IDS = {
  confirm: (captureId: string): string => `confirm:${captureId}`,
  cancel: (captureId: string): string => `cancel:${captureId}`,
  mergeAdd: (captureId: string): string => `merge-add:${captureId}`,
  mergeReplace: (captureId: string): string => `merge-replace:${captureId}`,
  mergeCancel: (captureId: string): string => `merge-cancel:${captureId}`,
  site: (siteId: string): string => `site:${siteId}`,
  item: (captureId: string, itemId: string): string => `item:${captureId}:${itemId}`
};

export type ParsedReplyId =
  | { kind: 'confirm' | 'cancel' | 'merge-add' | 'merge-replace' | 'merge-cancel'; captureId: string }
  | { kind: 'site'; siteId: string }
  | { kind: 'item'; captureId: string; itemId: string };

/** Lit l'identifiant d'un bouton ou d'une ligne ; `null` s'il n'a pas la forme du bot. */
export function parseReplyId(replyId: string): ParsedReplyId | null {
  const value = typeof replyId === 'string' ? replyId.trim() : '';
  if (value.length === 0 || value.length > 200) return null;
  const [kind, first, second] = value.split(':');
  if (!first) return null;
  switch (kind) {
    case 'confirm':
    case 'cancel':
    case 'merge-add':
    case 'merge-replace':
    case 'merge-cancel':
      return second === undefined ? { kind, captureId: first } : null;
    case 'site':
      return second === undefined ? { kind: 'site', siteId: first } : null;
    case 'item':
      return second ? { kind: 'item', captureId: first, itemId: second } : null;
    default:
      return null;
  }
}

/** Nombre sans séparateur de milliers, 4 décimales au plus, virgule en français. */
export function formatBotNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10_000) / 10_000;
  const text = String(rounded);
  return currentLanguage() === 'fr' ? text.replace('.', ',') : text;
}

/**
 * Titres de lignes de liste (24 caractères, comme Meta) tous différents : un
 * titre déjà pris reçoit un suffixe « (2) », « (3) »…, le nom étant coupé
 * avant pour que le suffixe reste visible.
 */
export function distinctTitles(names: readonly string[], max = META_LIST_ROW_TITLE_MAX): string[] {
  const used = new Set<string>();
  return names.map(name => {
    let title = truncateLabel(name, max);
    for (let rank = 2; used.has(title); rank += 1) {
      const suffix = ` (${rank})`;
      title = truncateLabel(name, max - Array.from(suffix).length) + suffix;
    }
    used.add(title);
    return title;
  });
}

function text(value: string): OutboundMessage {
  return { kind: 'TEXT', text: value };
}

/** Ligne de détail de la méthode de comptage (M13a à M13d). */
export function methodDetail(
  result: Pick<StockVisionResult, 'method' | 'visibleUnits' | 'layers' | 'columns' | 'depthRows'>
): string {
  if (result.method === 'SACKS_STACKED') {
    return t('{{front}} sacs de face × {{depth}} rangée(s) en profondeur', {
      front: formatBotNumber(result.visibleUnits),
      depth: formatBotNumber(result.depthRows ?? 1)
    });
  }
  if (result.method === 'BARS_BUNDLE') {
    return t('{{visible}} sections comptées en bout de fagot', { visible: formatBotNumber(result.visibleUnits) });
  }
  if (result.method === 'BLOCKS_PALLET' && result.columns !== null && result.layers !== null) {
    return t('{{columns}} blocs par couche × {{layers}} couche(s)', {
      columns: formatBotNumber(result.columns),
      layers: formatBotNumber(result.layers)
    });
  }
  return t('{{visible}} unité(s) visible(s)', { visible: formatBotNumber(result.visibleUnits) });
}

export const botMessages = {
  /** M01 — numéro inconnu (W7). */
  unknownNumber: (): OutboundMessage =>
    text(
      t("Bonjour. Ce numéro n'est pas associé à un compte Chef de chantier ImmoTopia. Contactez votre administrateur.")
    ),

  /** M02 — activation réussie. */
  activated: (input: { name: string; agency: string }): OutboundMessage =>
    text(
      t(
        "Bienvenue {{name}}. Votre numéro est relié à ImmoTopia pour l'inventaire des chantiers de {{agency}}. Envoyez une photo de votre stock pour commencer : une photo par article, prise de face. Photographiez la marchandise, pas les personnes. Tapez AIDE à tout moment.",
        input
      )
    ),

  /** M03 — code incorrect. */
  wrongCode: (remaining: number): OutboundMessage =>
    text(
      t('Code incorrect. Il vous reste {{remaining}} essai(s). Vérifiez le code donné par votre administrateur.', {
        remaining: String(remaining)
      })
    ),

  /** M04 — code épuisé ou expiré. */
  codeLocked: (): OutboundMessage =>
    text(t("Ce code n'est plus valable. Demandez un nouveau code à votre administrateur.")),

  /** M05 — inscription en attente, message sans code. */
  activationPending: (): OutboundMessage =>
    text(
      t(
        "Votre inscription n'est pas encore activée. Envoyez d'abord le code à 6 chiffres donné par votre administrateur."
      )
    ),

  /** M06 — accès perdu. */
  accessLost: (): OutboundMessage =>
    text(t("Votre accès à l'inventaire par WhatsApp n'est plus actif. Contactez votre administrateur.")),

  /** M06b — option absente (`enforce`). */
  optionMissing: (): OutboundMessage =>
    text(t("L'inventaire par WhatsApp n'est pas activé pour votre entreprise. Contactez votre administrateur.")),

  /** M07 — quota atteint. */
  quotaReached: (): OutboundMessage =>
    text(
      t(
        'Le nombre de photos analysées ce mois-ci pour votre entreprise est atteint. Contactez votre administrateur. Le bureau peut saisir le comptage dans ImmoTopia.'
      )
    ),

  /**
   * M08 — choix du chantier : boutons (2 ou 3 chantiers) ou liste (4 à 10).
   * Deux noms identiques une fois coupés à 20 caractères (titre de bouton
   * Meta) passent en liste (24 caractères, nom complet en description), et
   * des titres encore identiques reçoivent un suffixe : jamais deux choix de
   * même titre.
   */
  chooseSite: (sites: Array<{ siteId: string; name: string }>): OutboundMessage => {
    const question = t('Sur quel chantier êtes-vous ?');
    const shown = sites.slice(0, 10);
    const buttonTitles = shown.map(site => truncateLabel(site.name, META_BUTTON_TITLE_MAX));
    if (shown.length <= 3 && new Set(buttonTitles).size === buttonTitles.length) {
      return {
        kind: 'BUTTONS',
        text: question,
        buttons: shown.map((site, index) => ({ id: REPLY_IDS.site(site.siteId), title: buttonTitles[index] }))
      };
    }
    const titles = distinctTitles(shown.map(site => site.name));
    return {
      kind: 'LIST',
      text: question,
      buttonText: t('Choisir'),
      rows: shown.map((site, index) => {
        const row: { id: string; title: string; description?: string } = {
          id: REPLY_IDS.site(site.siteId),
          title: titles[index]
        };
        if (titles[index] !== site.name.trim()) {
          row.description = truncateLabel(site.name, META_LIST_ROW_DESCRIPTION_MAX);
        }
        return row;
      })
    };
  },

  /** M09 — aucun chantier. */
  noSite: (): OutboundMessage =>
    text(t('Aucun chantier ouvert au stock ne vous est affecté. Contactez votre administrateur.')),

  /** M10 — chantier choisi. */
  siteChosen: (site: string): OutboundMessage =>
    text(t('Chantier « {{site}} ». Envoyez la photo du premier article.', { site })),

  /** M11 — photo reçue. */
  photoReceived: (): OutboundMessage => text(t('Photo reçue, je compte…')),

  /** M12 — analyse en cours. */
  analysisInProgress: (): OutboundMessage =>
    text(t("Je termine l'analyse de la photo précédente. Renvoyez cette photo après ma réponse.")),

  /** M12b — question en attente. */
  questionPending: (): OutboundMessage =>
    text(t("Répondez d'abord à ma question précédente, ou tapez 0 pour l'annuler. Renvoyez ensuite cette photo.")),

  /** M13 — proposition, boutons « Valider » et « Annuler ». */
  proposal: (input: {
    captureId: string;
    item: string;
    reference: string;
    unit: string;
    total: number;
    result: Pick<StockVisionResult, 'method' | 'visibleUnits' | 'layers' | 'columns' | 'depthRows' | 'confidence'>;
  }): OutboundMessage => {
    const total = formatBotNumber(input.total);
    const lines = [
      t('{{item}} ({{reference}})', { item: input.item, reference: input.reference }),
      methodDetail(input.result),
      t('Total proposé : {{total}} {{unit}}', { total, unit: input.unit }),
      ''
    ];
    if (input.result.confidence < 0.7) {
      lines.push(t('Je ne suis pas sûr de ce total : vérifiez-le avant de valider.'));
    }
    lines.push(
      t('Tapez 1 pour VALIDER ce comptage ({{total}} {{unit}}), le nombre exact si différent, 0 pour annuler.', {
        total,
        unit: input.unit
      })
    );
    return {
      kind: 'BUTTONS',
      text: lines.join('\n'),
      buttons: [
        { id: REPLY_IDS.confirm(input.captureId), title: t('Valider') },
        { id: REPLY_IDS.cancel(input.captureId), title: t('Annuler') }
      ]
    };
  },

  /** M14 — enregistré. */
  recorded: (input: { quantity: number; unit: string; item: string }): OutboundMessage =>
    text(
      t(
        "Enregistré : {{quantity}} {{unit}} de {{item}}. Envoyez la photo de l'article suivant, ou tapez FIN quand vous avez terminé.",
        { quantity: formatBotNumber(input.quantity), unit: input.unit, item: input.item }
      )
    ),

  /** M15 — enregistré, quantité corrigée. */
  recordedCorrected: (input: { quantity: number; unit: string; item: string }): OutboundMessage =>
    text(
      t(
        "Enregistré : {{quantity}} {{unit}} de {{item}} (quantité corrigée). Envoyez la photo de l'article suivant, ou tapez FIN quand vous avez terminé.",
        { quantity: formatBotNumber(input.quantity), unit: input.unit, item: input.item }
      )
    ),

  /** M16 — annulé. */
  cancelled: (): OutboundMessage =>
    text(t("Comptage de cette photo annulé : rien n'est enregistré. Envoyez une autre photo, ou tapez FIN.")),

  /** M17 — réponse incomprise. */
  notUnderstood: (input: { total: number; unit: string }): OutboundMessage =>
    text(
      t("Je n'ai pas compris. Tapez 1 pour valider {{total}} {{unit}}, le nombre exact (ex. 84), ou 0 pour annuler.", {
        total: formatBotNumber(input.total),
        unit: input.unit
      })
    ),

  /** M18 — trop sombre ou floue. */
  tooDark: (): OutboundMessage =>
    text(t('Photo trop sombre ou floue pour compter précisément. Merci de reprendre la photo en activant le flash.')),

  /** M18b — pas de stock visible. */
  notStock: (): OutboundMessage =>
    text(t('Je ne vois pas de matériau à compter sur cette photo. Photographiez le stock de face, en entier.')),

  /** M18c — fichier refusé. */
  fileRefused: (): OutboundMessage =>
    text(t('Je ne peux pas lire ce fichier. Envoyez une photo (JPEG ou PNG) de moins de 10 Mo.')),

  /** M19 — article non reconnu. */
  itemUnknown: (): OutboundMessage =>
    text(
      t(
        "Photo reçue, mais l'article n'est pas identifiable avec certitude. De quel matériau s'agit-il ? (Ex : Ciment, Fer 10, Parpaing)"
      )
    ),

  /** M20 — plusieurs articles : liste (10 au plus). */
  severalItems: (
    captureId: string,
    items: Array<{ id: string; label: string; reference: string; unit: string }>
  ): OutboundMessage => ({
    kind: 'LIST',
    text: t('Plusieurs articles correspondent. Lequel est sur la photo ?'),
    buttonText: t('Choisir'),
    rows: (() => {
      const shown = items.slice(0, 10);
      const titles = distinctTitles(shown.map(item => item.label));
      return shown.map((item, index) => ({
        id: REPLY_IDS.item(captureId, item.id),
        title: titles[index],
        description: `${item.reference} · ${item.unit}`
      }));
    })()
  }),

  /** M21 — aucun article. */
  noItem: (typed: string): OutboundMessage =>
    text(
      t(
        'Je ne trouve pas « {{text}} » parmi les articles de votre entreprise. Essayez un autre nom (ex. Ciment, Fer 10), ou tapez 0 pour annuler. Un article nouveau se crée dans ImmoTopia par le bureau.',
        { text: typed }
      )
    ),

  /** M22 — échec de l'analyse. */
  analysisFailed: (): OutboundMessage =>
    text(
      t(
        "Désolé, je n'arrive pas à analyser cette photo pour le moment. Elle est conservée. Réessayez dans quelques minutes, ou prévenez le bureau."
      )
    ),

  /** M23 — relance (10 min). */
  reminder: (): OutboundMessage =>
    text(
      t(
        "J'attends votre réponse à ma question précédente. Sans réponse dans 20 minutes, cette photo ne sera pas enregistrée."
      )
    ),

  /** M24 — expiration (30 min). */
  expired: (input: { pendingDropped: boolean; closed: { site: string; count: number } | null }): OutboundMessage => {
    const pending = input.pendingDropped ? t("La dernière photo n'a pas été enregistrée.") : '';
    const closed = input.closed
      ? t("L'inventaire de « {{site}} » est transmis au bureau ({{count}} article(s)).", {
          site: input.closed.site,
          count: String(input.closed.count)
        })
      : '';
    const body = t(
      'Session terminée après 30 minutes sans réponse. {{pending}}{{closed}} Envoyez une photo pour recommencer.',
      { pending: pending && closed ? `${pending} ` : pending, closed }
    );
    return text(body.replace(/ {2,}/g, ' '));
  },

  /** M25 — `FIN`, inventaire clos. */
  closedCounted: (input: { site: string; count: number }): OutboundMessage =>
    text(
      t(
        "Merci. L'inventaire de « {{site}} » est transmis au bureau : {{count}} article(s) compté(s). Le bureau le vérifiera et le validera.",
        { site: input.site, count: String(input.count) }
      )
    ),

  /** M25b — `FIN`, inventaire laissé ouvert. */
  closedLeftOpen: (input: { site: string; count: number }): OutboundMessage =>
    text(
      t(
        "Merci. Vos {{count}} article(s) sont enregistrés dans l'inventaire en cours de « {{site}} ». Il reste ouvert : le bureau le clôturera.",
        { site: input.site, count: String(input.count) }
      )
    ),

  /** M25c — `FIN`, rien compté. */
  closedNothing: (): OutboundMessage => text(t("Session terminée. Aucun article n'a été compté.")),

  /** M26 — `AIDE`. */
  help: (): OutboundMessage =>
    text(
      [
        t('Inventaire par photo :'),
        t('1. Envoyez une photo par article, de face, en entier, avec le flash si besoin.'),
        t("2. Je propose un total : tapez 1 pour valider, le nombre exact s'il est différent, 0 pour annuler."),
        t('3. Tapez FIN quand vous avez terminé.'),
        t('CHANTIER : changer de chantier.'),
        t('Un article à zéro se signale au bureau, pas par WhatsApp.'),
        t('Photographiez la marchandise, pas les personnes.')
      ].join('\n')
    ),

  /** M28 — type non pris en charge. */
  unsupported: (): OutboundMessage =>
    text(t('Je lis seulement les photos et les messages écrits. Envoyez une photo de votre stock, ou tapez AIDE.')),

  /** M29 — inventaire en attente de validation. */
  countAwaitingValidation: (): OutboundMessage =>
    text(
      t(
        "Un inventaire de ce chantier attend sa validation au bureau. Le comptage par WhatsApp reprendra après cette validation. Rien n'a été enregistré."
      )
    ),

  /** M30 — article déjà compté, boutons « Ajouter », « Remplacer », « Annuler ». */
  alreadyCounted: (input: {
    captureId: string;
    item: string;
    unit: string;
    existing: number;
    quantity: number;
  }): OutboundMessage => ({
    kind: 'BUTTONS',
    text: t(
      '{{item}} est déjà compté dans cet inventaire : {{existing}} {{unit}}. Tapez 1 pour AJOUTER {{quantity}} (total {{sum}}), 2 pour REMPLACER par {{quantity}}, 0 pour annuler cette photo.',
      {
        item: input.item,
        unit: input.unit,
        existing: formatBotNumber(input.existing),
        quantity: formatBotNumber(input.quantity),
        sum: formatBotNumber(input.existing + input.quantity)
      }
    ),
    buttons: [
      { id: REPLY_IDS.mergeAdd(input.captureId), title: t('Ajouter') },
      { id: REPLY_IDS.mergeReplace(input.captureId), title: t('Remplacer') },
      { id: REPLY_IDS.mergeCancel(input.captureId), title: t('Annuler') }
    ]
  }),

  /** M31 — inventaire modifié au bureau. */
  countChangedAtOffice: (): OutboundMessage =>
    text(
      t(
        "L'inventaire en cours a été modifié au bureau : ce comptage n'a pas été enregistré. Envoyez à nouveau la photo."
      )
    ),

  /** M32 — chantier plus disponible. */
  siteUnavailable: (site: string): OutboundMessage =>
    text(t("Le chantier « {{site}} » n'est plus ouvert au comptage par WhatsApp.", { site })),

  /** M33 — texte libre en `READY`. */
  sendPhoto: (): OutboundMessage => text(t('Envoyez une photo de votre stock, ou tapez AIDE.'))
};
