# Prospectus commerciaux par pack

Une fiche recto-verso A4 par pack, à remettre ou envoyer à un prospect.

- **Recto** : la promesse et les six fonctionnalités les plus parlantes, lisibles
  d'un coup d'œil.
- **Verso** : l'inventaire complet du pack, fonction par fonction, le tarif et
  l'appel à la démonstration.

| Pack   | Source HTML                  | PDF à imprimer             |
| ------ | ---------------------------- | -------------------------- |
| Syndic | [syndic.html](./syndic.html) | [syndic.pdf](./syndic.pdf) |

## Règles de contenu

- Chaque affirmation vient du classeur
  `docs/fonctionnalites/ImmoTopia_Wiki_Fonctionnalites.xlsx` (ce qui est
  livré) ou d'une spécification de `specs/` (ce qui est en cours). Une fonction
  qui n'est pas encore livrée porte le badge **Bientôt**.
- Les tarifs viennent du catalogue d'abonnement
  (`packages/api/src/lib/subscription/catalog.ts`). Les reprendre à chaque
  changement de prix.
- Les visuels chiffrés (grille lot × mois, quorum) sont des illustrations
  marquées comme telles, jamais des données de client.
- Le bloc « Votre conseiller » est laissé vierge pour être complété à la main
  ou au tampon.

Pour le Pack Syndic, les éléments marqués **Bientôt** au 17/10/2026 sont : la
clôture d'exercice (spec 027, brouillon), la place de marché des prestataires
(besoin 10 du compte rendu du 25/09/2026, non spécifié) et l'export complet des
données (lot S7 de la spec 021, non réalisé). Le paiement Mobile Money (spec 042) est fusionné dans `main` mais son mode réel n'est pas encore activé.

## Régénérer le PDF

Le HTML porte ses règles d'impression (`@page` A4, une page par face). Avec
Chrome :

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf="syndic.pdf" "file:///<chemin absolu>/syndic.html"
```

Vérifier ensuite que le PDF compte exactement deux pages et que rien n'est
coupé en bas de chaque face.
