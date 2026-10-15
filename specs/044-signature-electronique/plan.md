# 044 — Plan de réalisation

## Contrat d'interface

```ts
interface SignatureProvider {
  readonly id: "disabled" | "log" | "internal" | string;
  createRequest(input: CreateRequestInput): Promise<{ providerRef?: string }>;
  cancel(requestId: string): Promise<void>;
  // internal : le noyau gère jeton, code et scellement ;
  // prestataire : webhook de retour → même machine d'états.
}
```

Emplacement : `packages/api/src/lib/signature/` (`types.ts`, `provider/index.ts`
avec fabrique mise en cache, `provider/disabled.ts`, `provider/log.ts`,
`provider/internal.ts`, `seal.ts`, `otp.ts`, `events.ts`). Modèle à imiter :
`lib/stock-whatsapp/transport/`.

## Lots

| Lot | Contenu                                                                                                                                                         | Dépend de |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| S0  | Prérequis : `assets/` dans l'image Docker, décision PDF (pdf-lib natif ou conversion DOCX)                                                                      | —         |
| S1  | Noyau : modèles, migration, provider `internal`, OTP e-mail et WhatsApp, scellement, page publique `/signer/:jeton`, audit, quota ; premier document : **bail** | S0        |
| S2  | Mandats de gestion et de vente : génération PDF, statut du mandat, écrans                                                                                       | S1        |
| S3  | État des lieux : rendu PDF du rapport, signature tactile sur place                                                                                              | S1        |
| S4  | Compromis de vente : génération PDF, drapeau « prestataire requis »                                                                                             | S1        |
| S5  | Écran « Signatures » (liste, relance, annulation), job d'expiration, rappels                                                                                    | S1        |
| S6  | Adaptateur prestataire (après comparaison et avis juridique)                                                                                                    | S1        |
| S7  | SMS comme canal d'OTP                                                                                                                                           | lot SMS-1 |

S2, S3 et S4 sont parallélisables après S1 (territoires de fichiers distincts :
un service de génération PDF par type de document).

## Territoires d'agents (S1)

- API noyau : `lib/signature/**`, `services/signature-service.ts`,
  `controllers/signature-*.ts`, routes agence et publiques, migration Prisma.
- Web : page publique `pages/public/SignaturePage`, composant
  « Envoyer pour signature » réutilisable, i18n.
- Tests : unitaires (OTP, scellement, chaînage), intégration d'isolation
  (`npm run test:isolation`), routes inventoriées.

## Vérifications attendues

`npm run typecheck`, `lint`, `check:architecture`, tests ciblés,
`routes-inventory`, `schema-tenant-coverage`, recette navigateur sur l'instance
de démo (envoi, code, signature, PDF scellé, refus, expiration), revue
`code-reviewer` + `security-auditor` (diff sensible : jetons publics, uploads,
tenant). Mise à jour du classeur de fonctionnalités et `npm run wiki:export`.
