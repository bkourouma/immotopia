import { z } from 'zod';
import { helpIdSchema } from './help-id';

/**
 * Avis sur une fiche d'aide interne. Au moins un avis « utile / pas utile » ou une question
 * libre ; une question vide après nettoyage est REJETÉE (jamais ignorée en silence).
 */
export const createHelpFeedbackSchema = z
  .object({
    helpId: helpIdSchema,
    useful: z.boolean().optional(),
    question: z.string().trim().min(1).max(1000).optional(),
    path: z.string().max(300).optional(),
    locale: z.enum(['fr', 'en', 'ar'])
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.useful === undefined && value.question === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Un avis (utile ou non) ou une question est requis.',
        path: ['useful']
      });
    }
  });

export type CreateHelpFeedbackInput = z.infer<typeof createHelpFeedbackSchema>;

/** Fenêtre de lecture en jours : 1 à 365, défaut 30 ; hors bornes = 400, jamais tronquée. */
export const listHelpFeedbackQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30)
});

export type ListHelpFeedbackQuery = z.infer<typeof listHelpFeedbackQuerySchema>;

export interface HelpFeedbackQuestion {
  text: string;
  createdAt: string;
  locale: string;
  /** Nom de l'agence : renseigné côté plateforme uniquement, toujours nul côté agence. */
  tenantName: string | null;
}

export interface HelpFeedbackSummaryItem {
  helpId: string;
  useful: number;
  notUseful: number;
  questionsCount: number;
  lastAt: string;
  questions: HelpFeedbackQuestion[];
}

export interface HelpFeedbackSummary {
  items: HelpFeedbackSummaryItem[];
}
