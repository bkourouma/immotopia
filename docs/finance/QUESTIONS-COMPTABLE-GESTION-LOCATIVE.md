# ImmoTopia — Comptabilité de la gestion locative : points à valider

Document à l'attention du cabinet comptable. Il décrit ce que l'application écrit réellement en comptabilité, puis liste les questions sur lesquelles le cabinet doit trancher.

---

## 1. Le principe retenu

L'agence agit en **mandataire** : les loyers qu'elle encaisse appartiennent aux propriétaires, jusqu'à ce qu'elle leur reverse le net. Seuls les honoraires sont un produit de l'agence.

- **Tant que le loyer n'est pas encaissé, il n'y a aucune écriture** : pas de créance locataire au 411. Le loyer appelé, mais non payé, n'est suivi que dans le compte du locataire tenu par l'application.
- **Une écriture n'est jamais modifiée ni supprimée.** Toute correction passe par une écriture de contre-passation, qui reste visible.
- **Chaque écriture est rattachée à une pièce** : un paiement, un honoraire, une dépense, un reversement ou une session de caisse.
- **Journaux** : `OP-CASH` pour les espèces, `OP-BANK` pour les autres moyens de paiement, `OP-GENERAL` pour les honoraires et les contre-passations. Chaque journal est ouvert par exercice, selon l'année civile de la date de l'écriture.

## 2. Les comptes utilisés

| Compte   | Intitulé dans l'application              | Rôle                                           | Modifiable dans l'application ? |
| -------- | ---------------------------------------- | ---------------------------------------------- | ------------------------------- |
| **4712** | Propriétaires mandants                   | Dette de l'agence envers les propriétaires     | Oui (numéro **provisoire**)     |
| **706**  | Honoraires de gestion                    | Produit de l'agence                            | Oui                             |
| **4432** | TVA facturée sur prestations de services | TVA collectée sur les honoraires               | Oui                             |
| **571**  | Caisse                                   | Espèces                                        | Non (fixé dans le code)         |
| **521**  | Banques                                  | Virements, chèques, Mobile Money, carte, autre | Non                             |
| **658**  | Charges diverses — écarts de caisse      | Manquants de caisse                            | Non                             |
| **758**  | Produits divers — écarts de caisse       | Excédents de caisse                            | Non                             |

Les trois comptes marqués « Oui » se modifient dans _Paramètres financiers_. Les quatre autres demandent une petite modification du code.

## 3. Les écritures, avec un exemple chiffré

**Hypothèses de l'exemple :**

- échéance de 200 000 FCFA, dont 180 000 de loyer et 20 000 de charges, payée en Mobile Money ;
- honoraires de 10 %, calculés sur le loyer seul ;
- agence assujettie à la TVA à 18 % ;
- une dépense de plomberie de 30 000 FCFA ;
- puis un reversement par virement du net au propriétaire.

### a) Encaissement du loyer — journal `OP-BANK`, à la date du paiement

| Compte                      | Débit   | Crédit  |
| --------------------------- | ------- | ------- |
| 521 Banques                 | 200 000 |         |
| 4712 Propriétaires mandants |         | 200 000 |

### b) Honoraires de gestion — journal `OP-GENERAL`, à la date de l'encaissement

| Compte                      | Débit  | Crédit |
| --------------------------- | ------ | ------ |
| 4712 Propriétaires mandants | 21 240 |        |
| 706 Honoraires de gestion   |        | 18 000 |
| 4432 TVA facturée           |        | 3 240  |

Les honoraires naissent **à l'encaissement du loyer**, au prorata de ce qui est payé. Aucun honoraire n'est comptabilisé sur un loyer impayé.

### c) Dépense du bien déduite au propriétaire — journal `OP-CASH`

| Compte                      | Débit  | Crédit |
| --------------------------- | ------ | ------ |
| 4712 Propriétaires mandants | 30 000 |        |
| 571 Caisse                  |        | 30 000 |

### d) Reversement au propriétaire — journal `OP-BANK` (ou `OP-CASH` en espèces)

| Compte                      | Débit   | Crédit  |
| --------------------------- | ------- | ------- |
| 4712 Propriétaires mandants | 148 760 |         |
| 521 Banques                 |         | 148 760 |

Après ces quatre écritures, le 4712 est soldé : 200 000 − 21 240 − 30 000 − 148 760 = 0.

### e) Écart de caisse, passé à la validation de la session par un responsable

| Cas               | Débit       | Crédit      |
| ----------------- | ----------- | ----------- |
| Manquant de 1 000 | 658 : 1 000 | 571 : 1 000 |
| Excédent de 1 000 | 571 : 1 000 | 758 : 1 000 |

### f) Annulation d'un paiement ou d'un reversement

L'écriture exactement inverse est passée au journal `OP-GENERAL`, à la date de l'annulation. L'écriture d'origine reste visible.

## 4. Questions à trancher

**Q1 — Compte des fonds des propriétaires.**
Le 4712 « Créditeurs divers » est provisoire. Quel numéro faut-il utiliser ? Un compte collectif unique suffit-il, ou faut-il un sous-compte par propriétaire ? Aujourd'hui, le détail par propriétaire est tenu dans l'application, pas au grand livre. Des sous-comptes demanderaient un développement.

**Q2 — Honoraires.**
Le 706 convient-il, ou faut-il un sous-compte (7061…) ?

**Q3 — TVA sur honoraires.**

- L'agence est-elle assujettie ? Au régime réel, elle facture la TVA ; à l'impôt synthétique, non.
- Le 4432 est-il le bon compte ?
- L'application constate la TVA **à l'encaissement du loyer**. Est-ce conforme à l'exigibilité applicable aux prestations de services de l'agence ?

**Q4 — Charges et pénalités encaissées.**
Aujourd'hui, **tout** ce que paie le locataire (loyer, charges, pénalités de retard) est crédité au propriétaire. Les pénalités et certaines charges doivent-elles plutôt revenir à l'agence ou à un tiers (eau, électricité, syndic) ?

**Q5 — Assiette des honoraires.**
Loyer seul, ou tout l'encaissé ? L'application permet les deux, ainsi qu'un forfait par échéance. Quelle pratique retenir par défaut ?

**Q6 — Banque et Mobile Money.**
Tout ce qui n'est pas en espèces passe au 521, Mobile Money compris. Faut-il un compte par banque, et un compte distinct pour chaque opérateur Mobile Money (Wave, Orange Money, MTN) ?

**Q7 — Caisse.**
Un seul 571 pour tous les caissiers, ou un sous-compte par caisse ?

**Q8 — Écarts de caisse.**
658 et 758 conviennent-ils, ou faut-il des sous-comptes (6588, 7588…) ?

**Q9 — Dépenses payées pour le propriétaire.**
L'application suppose qu'elles sortent de la caisse (571). Sont-elles plutôt payées par banque, ou via un compte fournisseur (401) ?

**Q10 — Dépôts de garantie.**
**Ils ne sont aujourd'hui passés dans aucune écriture comptable** : seul leur suivi existe dans l'application. Comment les comptabiliser ? Au 4712, dans un compte de dépôts reçus, ou dans un autre compte de tiers ?

**Q11 — Encaissements non affectés.**
Un paiement reçu mais pas encore rattaché à une échéance (une avance) n'entre en comptabilité qu'au moment de son affectation. Est-ce acceptable, ou faut-il le comptabiliser dès réception, par exemple dans un compte d'avances locataires ?

**Q12 — Exercice comptable.**
L'exercice correspond-il à l'année civile ?

**Q13 — Export vers le cabinet.**
Quel logiciel utilise le cabinet (Sage, Odoo, autre) ? Quel format d'import attend-il : colonnes, séparateur, codes journaux ? L'application exporte aujourd'hui le journal, le grand livre et la balance, en Excel et en CSV (point-virgule, virgule décimale).

## 5. À savoir avant de répondre

- Les numéros choisis s'appliquent **aux écritures à venir** : celles déjà passées restent sur l'ancien numéro. Mieux vaut donc trancher **avant la mise en service**.
- Les autres comptes opérationnels déjà présents dans l'application (chantiers, fournisseurs, salaires, stock) sont : 311, 401, 402, 4047, 411, 422, 486, 601, 603, 605, 613 et 661. S'ils sont mal numérotés, c'est le moment de le signaler.

---

_Réponses à retourner à l'agence : un numéro ou une décision par question (Q1 à Q13)._
