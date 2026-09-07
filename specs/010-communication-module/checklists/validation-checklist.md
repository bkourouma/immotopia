# Checklist de validation – Module de Communication

**Objectif** : Vérifier que le module est opérationnel après implémentation (T050).

## Prérequis

- [ ] Base de données PostgreSQL accessible, migrations appliquées (`npx prisma migrate deploy`)
- [ ] Variables d'environnement configurées (voir `packages/api/.env.example` pour COMMUNICATION_*, EMAIL_*, TWILIO_*)
- [ ] Au moins un tenant actif en base
- [ ] (Optionnel) Seed communication exécuté : `npm run db:seed:communication` dans `packages/api`

## Backend

- [ ] Démarrer l'API : `npm run dev` dans `packages/api`
- [ ] Health check : `GET /health` retourne 200
- [ ] Routes communication montées sous `/api/tenants/:tenantId/communication` (nécessite auth + tenant)
- [ ] Jobs : en environnement non-test, les jobs (queue processor, reminder, status updater) sont démarrés au lancement du serveur

## Tests

- [ ] Tests unitaires : `npm test` dans `packages/api` (fichiers `__tests__/unit/communication.service.test.ts`, `notification-engine.service.test.ts`)
- [ ] Test d'intégration : `npm test -- communication.integration` (nécessite une base de test avec au moins un tenant actif et éventuellement un contact CRM)

## Frontend

- [ ] Démarrer l'app : `npm run dev` dans `apps/web`
- [ ] Menu Communication visible dans la sidebar (sous un tenant)
- [ ] Pages accessibles : Templates, Règles, Historique, Annonces, Préférences, Analytics

## Flux métier minimal

- [ ] Créer un template (email) depuis l'UI ou l'API
- [ ] Créer une règle (ex. PAYMENT_RECEIVED → RENTER) liée à ce template
- [ ] Déclencher un événement (ex. enregistrer un paiement) et vérifier qu'une communication apparaît dans l'historique (ou qu'une entrée est créée en base)
- [ ] (Optionnel) Vérifier les préférences : créer une préférence pour un destinataire et renvoyer une annonce en respectant les canaux autorisés

## Documentation

- [ ] `docs/communication/COMMUNICATION_MODULE.md` à jour
- [ ] `docs/communication/TEMPLATE_VARIABLES.md` consultable pour les variables des templates

---

**Statut** : À exécuter manuellement ou en CI après déploiement.
