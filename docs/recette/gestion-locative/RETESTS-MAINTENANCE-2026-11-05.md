# Retests maintenance — 2026-11-05

Branche `orch/2026-11-03-recette-locatif`, worktree de recette local, API `http://localhost:8820/health` saine (200). Navigateur Chrome headless piloté avec Playwright, comptes de recette locataire Fabrice N'Guessan et ADMIN_A. Les correctifs étaient présents dans l'arbre local non commité au moment de ces essais.

| Anomalie           | Scénario  | Verdict | Preuve observée                                                                                                                                                                                             |
| ------------------ | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-2026-11-04-063 | GL-11-101 | Passé   | Deux passages UI : après ajout d'une photo, `Annuler` puis réouverture : 1 vignette avant, 0 après.                                                                                                         |
| BUG-2026-11-04-064 | GL-11-101 | Passé   | Deux passages UI : le champ borne une saisie de 501 caractères à 500. Contrôle complémentaire hors interface : un POST multipart de 501 caractères renvoie 400 `VALIDATION_ERROR`, champ `locationDetails`. |
| BUG-2026-11-04-065 | GL-11-102 | Passé   | Un passage UI sur le ticket `8598d867-f93e-4008-ae94-e9c3188449d0` : sélection simultanée de `Assigné` et `Aqua Services Cocody` ; PATCH 200, statut `Assigné` affiché.                                     |

Les trois fiches du bus sont à l'état `passé`. Le ticket de 065 a été modifié pendant la recette ; aucune nouvelle demande n'a été créée par le POST invalide de 064.

Vérifications automatisées après correction de la transaction : `maintenance-cross-tenant-references.test.ts` 14/14 (assignation simultanée, annulation si l'historique échoue, conflit de statut) ; `tenant-portal-validation.test.ts` 22/22 (contrôleur 501 caractères → 400 sans création) ; `npx tsc --noEmit -p packages/api` sans erreur. ESLint ciblé API et modal : aucune erreur, avertissements préexistants.
