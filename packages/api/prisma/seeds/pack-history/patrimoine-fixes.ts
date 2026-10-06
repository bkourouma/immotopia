/**
 * PATRIMOINE : correctifs et compléments de la recette (hypothèses de rendement en fractions,
 * visites, prestataires, échéances à venir, prêts, polices, balance âgée, parc, portail…).
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 *
 * Les blocs vivent dans des fichiers annexes :
 *   patrimoine-fixes-basics.ts        hypothèses de rendement, prestataires de maintenance
 *   patrimoine-fixes-parc.ts          nouveaux biens (Pro), statuts, prêts, assurances
 *   patrimoine-fixes-locatif(-data).ts baux, échéances, impayés, pénalités, événements
 *   patrimoine-fixes-people.ts        contacts CRM, visites, compte du portail propriétaire
 */
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { loadState } from './patrimoine-extras-state';
import { seedInspections } from './patrimoine-extras-bail';
import { seedPropertyDocuments } from './patrimoine-extras-dossier';
import { seedPropertyImages } from './property-images';
import { fixVendors, fixYieldAssumptions } from './patrimoine-fixes-basics';
import { seedActivePolicies, seedEssentielStatuses, seedMoreLoans, seedNewProperties } from './patrimoine-fixes-parc';
import { seedLeaseStories, seedNextInstallments } from './patrimoine-fixes-locatif';
import { seedOwnerPortalAccount, seedVisits } from './patrimoine-fixes-people';

export async function seedPatrimoineFixes(
  ctx: HistoryContext,
  pack: 'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO'
): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  const started = Date.now();
  let s = await loadState(ctx, pack);
  if (s.properties.length === 0) {
    ctx.log(`seedPatrimoineFixes (${pack}) : aucun bien, le générateur de base n'a pas tourné.`);
    return;
  }

  // 1. Données fausses : hypothèses en fractions, prestataires lisibles par l'écran.
  await fixYieldAssumptions(s);
  await fixVendors(s);

  // 2. Parc : nouveaux biens (Pro) ou statuts variés (Essentiel).
  await seedNewProperties(s);
  await seedEssentielStatuses(s);
  s = await loadState(ctx, pack);

  // 3. Gestion locative : histoires de baux, échéances à venir.
  await seedLeaseStories(s);
  s = await loadState(ctx, pack);
  await seedNextInstallments(s);

  // 4. Financement et assurances.
  await seedMoreLoans(s);
  await seedActivePolicies(s);

  // 5. Personnes : visites, portail propriétaire (les contacts CRM viennent de core-communication).
  await seedVisits(s);
  await seedOwnerPortalAccount(s);

  // 6. Pièces et photos des biens, polices et prêts ajoutés (idempotent par bien et par nom de fichier).
  s = await loadState(ctx, pack);
  await seedInspections({ ...s, leases: s.leases.filter(l => ['ACTIVE', 'SUSPENDED', 'ENDED'].includes(l.status)) });
  await seedPropertyDocuments(s);
  await seedPropertyImages(ctx);

  ctx.log(`seedPatrimoineFixes (${pack}) terminé en ${Math.round((Date.now() - started) / 1000)} s.`);
}
