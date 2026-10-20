/**
 * Active (ou change) le fournisseur d'ImmoCopilot en base, sans passer par
 * l'écran super-admin. Écrit la ligne unique `platform_ai_settings` — celle que
 * lit `ai-settings-service.ts` en priorité sur les variables `AI_*`.
 *
 * Les CLÉS API ne se règlent PAS ici : elles vivent uniquement dans
 * l'environnement du serveur (`OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY`).
 * Le script vérifie seulement leur présence et n'en affiche aucun fragment.
 *
 * Utilisation (depuis packages/api, avec le `.env` du serveur cible) :
 *   npm run ops:set-ai-provider -- --provider openrouter --model anthropic/claude-sonnet-4.5
 *   npm run ops:set-ai-provider -- --provider anthropic --model claude-opus-5-5 --effort medium
 *   npm run ops:set-ai-provider -- --provider disabled
 *   npm run ops:set-ai-provider -- --provider openrouter --dry-run
 *
 * Options :
 *   --provider  openrouter | anthropic | disabled   (défaut : openrouter)
 *   --model     identifiant du modèle               (défaut : anthropic/claude-sonnet-4.5
 *                                                    pour openrouter, claude-opus-5-5 pour anthropic)
 *   --effort    low | medium | high                 (défaut : low)
 *   --no-fallback  désactive le repli après refus   (défaut : repli actif)
 *   --dry-run   affiche ce qui serait écrit, n'écrit rien
 *
 * Le service met sa configuration en cache 30 s : aucun redémarrage requis.
 * `fake` est refusé : interdit en production.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const PROVIDERS = ['disabled', 'anthropic', 'openrouter'] as const;
const EFFORTS = ['low', 'medium', 'high'] as const;
const SETTINGS_ID = 'default';

type Provider = (typeof PROVIDERS)[number];
type Effort = (typeof EFFORTS)[number];

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out = { provider: 'openrouter' as Provider, model: '', effort: 'low' as Effort, fallback: true, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? fail(`Valeur manquante après ${arg}`);
    switch (arg) {
      case '--provider': {
        const v = next();
        if (v === 'fake') fail('Le faux fournisseur est interdit en production.');
        if (!(PROVIDERS as readonly string[]).includes(v)) fail(`Fournisseur inconnu : ${v} (${PROVIDERS.join(', ')})`);
        out.provider = v as Provider;
        break;
      }
      case '--model':
        out.model = next().trim();
        break;
      case '--effort': {
        const v = next();
        if (!(EFFORTS as readonly string[]).includes(v)) fail(`Effort inconnu : ${v} (${EFFORTS.join(', ')})`);
        out.effort = v as Effort;
        break;
      }
      case '--no-fallback':
        out.fallback = false;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      default:
        fail(`Option inconnue : ${arg}`);
    }
  }
  if (!out.model) out.model = out.provider === 'anthropic' ? 'claude-opus-5-5' : 'anthropic/claude-sonnet-4.5';
  return out;
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));

  if (cfg.provider === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) fail('OPENROUTER_API_KEY est absente de l’environnement du serveur.');
    if (!cfg.model.includes('/'))
      fail('Identifiant OpenRouter requis : fournisseur/modèle (ex. anthropic/claude-sonnet-4.5).');
  }
  if (cfg.provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    fail('ANTHROPIC_API_KEY est absente de l’environnement du serveur.');
  }

  const data = { provider: cfg.provider, model: cfg.model, effort: cfg.effort, refusalFallback: cfg.fallback };
  console.log('Réglage ImmoCopilot :', data);
  if (cfg.dryRun) {
    console.log('Dry-run : rien n’a été écrit.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const before = await prisma.platformAiSettings.findUnique({ where: { id: SETTINGS_ID } });
    await prisma.platformAiSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data
    });
    console.log(before ? `✔ Réglage mis à jour (avant : ${before.provider} / ${before.model}).` : '✔ Réglage créé.');
    console.log('Pris en compte sous 30 s, sans redémarrage.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error('✖', error instanceof Error ? error.message : error);
  process.exit(1);
});
