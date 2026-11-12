# Anomalies non bloquantes et constats produit — recette Syndic dans Chrome

À remplir par Claude pendant la recette
([SCENARIO_SYNDIC_ABONNEMENT_CHROME.md](SCENARIO_SYNDIC_ABONNEMENT_CHROME.md)).
Une anomalie bloquante n'est **pas** écrite ici : elle donne lieu à une fiche de
blocage dans le chat (§1.1 du scénario).

Ne jamais écrire ici un jeton, un mot de passe, un lien d'invitation ou une
donnée réelle.

## Format d'une anomalie

Numéroter `ANO-SYN-001`, `ANO-SYN-002`… dans l'ordre d'apparition, ajouter à la
suite de la liste ci-dessous.

```text
### ANO-SYN-nnn — <titre court : écran + symptôme>

- Priorité : important | mineur
- Étape du scénario : <ex. E.3>
- Compte : super-admin | administrateur de l'agence
- Page : <chemin, sans paramètre ni jeton>
- Fait : <clics, dans l'ordre>
- Attendu :
- Observé : <texte exact affiché>
- Preuve : <message de la console, statut HTTP lu dans l'onglet réseau, capture>
```

## Anomalies

_Aucune pour l'instant._

## Constats produit

Comportements cohérents avec le code mais qui demandent une décision de Baba.
Format : titre, ce qui a été vu, ce qui était attendu, décision demandée.

### Constat attendu à confirmer — « Marquer traitée » ne crée pas l'extension

- Étape : G.5 et G.6.
- À confirmer à l'écran : marquer une demande traitée change son statut mais
  pas la capacité ; le super-admin doit ensuite ajouter l'extension à la main.
- Décision demandée : laisser en deux gestes ou proposer « Accepter et ajouter ».
- Résultat observé : _à remplir_.

### Constat attendu à confirmer — visibilité des demandes d'extension côté super-admin

- Étape : G.4.
- À confirmer à l'écran : les demandes ne se voient qu'en ouvrant la fiche de
  chaque agence, sans notification dédiée ; la liste des agences montre ou non
  un compteur de demandes ouvertes.
- Décision demandée : liste globale ou alerte pour le super-admin.
- Résultat observé : _à remplir_.
