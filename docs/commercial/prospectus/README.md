# Prospectus commerciaux par pack

Une fiche recto-verso A4 par pack, à remettre ou envoyer à un prospect.

- **Recto** : la promesse et les six fonctionnalités les plus parlantes, lisibles
  d'un coup d'œil.
- **Verso** : l'inventaire complet du pack, fonction par fonction, le tarif et
  l'appel à la démonstration.

| Pack              | Source HTML                        | PDF à imprimer                   |
| ----------------- | ---------------------------------- | -------------------------------- |
| Syndic            | [syndic.html](./syndic.html)       | [syndic.pdf](./syndic.pdf)       |
| Agence            | [agence.html](./agence.html)       | [agence.pdf](./agence.pdf)       |
| Promoteur         | [promoteur.html](./promoteur.html) | [promoteur.pdf](./promoteur.pdf) |
| Opérateur intégré | [integre.html](./integre.html)     | [integre.pdf](./integre.pdf)     |

## Règles de contenu

- Chaque affirmation vient du classeur
  `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx` (ce qui est
  livré) ou d'une spécification de `specs/` (ce qui est en cours). Une fonction
  qui n'est pas encore livrée porte le badge **Bientôt**.
- Les tarifs viennent du catalogue d'abonnement
  (`packages/api/src/lib/subscription/catalog.ts`). Les reprendre à chaque
  changement de prix.
- Les visuels chiffrés (grille lot × mois, quorum, relevé propriétaire, budget de chantier, vie d'un logement, valeur nette) sont des illustrations
  marquées comme telles, jamais des données de client.
- Le bloc « Votre conseiller » est laissé vierge pour être complété à la main
  ou au tampon.

Pour le Pack Syndic, les éléments marqués **Bientôt** au 17/10/2026 sont : la
clôture d'exercice (spec 027, brouillon), la place de marché des prestataires
(besoin 10 du compte rendu du 25/09/2026, non spécifié) et l'export complet des
données (lot S7 de la spec 021, non réalisé). Le paiement Mobile Money (spec 042) est fusionné dans `main` mais son mode réel n'est pas encore activé.

Pour le Pack Agence, les éléments marqués **Bientôt** au 17/10/2026 sont : le
prélèvement automatique des loyers (spec 042-prelevement-bancaire : seuls les
créanciers et les mandats sont livrés), les relances automatiques des impayés
par SMS et WhatsApp (aucune relance de loyer automatique dans le classeur), le
site vitrine de l'agence avec diffusion sur les portails d'annonces (seul le
portail public d'ImmoTopia existe) et l'export complet des données. Les
signatures électroniques sont dites « incluses » sans chiffre : le quota par
pack du catalogue est provisoire.

Pour le Pack Promoteur, les éléments marqués **Bientôt** au 17/10/2026 viennent
du niveau 3 de la spec 040-controle-stock (§3.2, hors périmètre du lot livré) :
comptages surprise planifiés, QR codes et codes-barres, transferts en transit
avec accusé de réception, contrôle avancé des achats (doublon de facture,
dérive de prix) ; plus l'export complet des données.

La fiche Opérateur intégré résume les trois métiers et reprend l'union de
leurs « Bientôt » ; le détail de chaque métier reste sur sa fiche dédiée.

La fiche Patrimoine présente les quatre offres de la famille (Particulier
Gratuit et Plus, Patrimoine Essentiel et Pro) ; ses « Bientôt » sont le
prélèvement automatique, les relances automatiques des loyers et l'export
complet. Le prix du Particulier Plus (2 900 FCFA) a été confirmé le 29/09/2026
mais reste modifiable au catalogue.

## Régénérer le PDF

Le HTML porte ses règles d'impression (`@page` A4, une page par face). Avec
Chrome :

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf="syndic.pdf" "file:///<chemin absolu>/syndic.html"
```

Vérifier ensuite que le PDF compte exactement deux pages et que rien n'est
coupé en bas de chaque face.
