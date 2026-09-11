import { describe, it, expect } from 'vitest';
import { queryKey, detailKey, entityKeyPrefix, normalizeFilters, STALE_TIME } from '../../lib/query-keys';

/**
 * Conventions de cache (REFONTE_UI_UX.md §8.4).
 *
 * Une clé de cache est silencieuse quand elle se trompe : rien ne plante, la
 * donnée est simplement fausse ou rechargée pour rien. Ces tests portent donc
 * sur les deux erreurs qui ne se verraient pas autrement :
 *
 * 1. **Deux clés qui devraient être identiques ne le sont pas** — la requête
 *    repart alors qu'elle n'aurait pas dû, et le cache ne sert à rien.
 * 2. **Deux clés qui devraient différer sont identiques** — c'est le cas grave :
 *    la liste d'une agence servie à une autre.
 */

describe('queryKey — convention [entité, tenantId, filtres]', () => {
  it('sépare deux agences, meme entite et memes filtres', () => {
    // Le defaut redoute : un collaborateur change d'agence sans rechargement
    // et voit la liste de la precedente.
    const a = queryKey('properties', 'tenant-1', { page: 1 });
    const b = queryKey('properties', 'tenant-2', { page: 1 });
    expect(a).not.toEqual(b);
  });

  it('sépare deux entités pour une meme agence', () => {
    expect(queryKey('properties', 't1')).not.toEqual(queryKey('leases', 't1'));
  });

  it('rend la meme cle quel que soit l’ordre des filtres', () => {
    // React Query compare champ a champ : sans normalisation, ces deux appels
    // creeraient deux entrees de cache pour une seule requete.
    expect(queryKey('properties', 't1', { status: 'AVAILABLE', page: 2 })).toEqual(
      queryKey('properties', 't1', { page: 2, status: 'AVAILABLE' })
    );
  });

  it('traite un filtre vide comme un filtre absent', () => {
    // Vider un champ de recherche doit ramener a l'entree deja chargee, pas en
    // creer une troisieme.
    expect(queryKey('properties', 't1', { q: '', status: undefined })).toEqual(queryKey('properties', 't1'));
    expect(queryKey('properties', 't1', {})).toEqual(queryKey('properties', 't1', undefined));
  });

  it('distingue deux valeurs de filtre differentes', () => {
    expect(queryKey('properties', 't1', { q: 'villa' })).not.toEqual(queryKey('properties', 't1', { q: 'studio' }));
  });

  it('distingue deux pages', () => {
    expect(queryKey('properties', 't1', { page: 1 })).not.toEqual(queryKey('properties', 't1', { page: 2 }));
  });

  it('accepte une absence d’agence sans la confondre avec une agence nommee', () => {
    expect(queryKey('communes', null)).toEqual(queryKey('communes', undefined));
    expect(queryKey('communes', null)).not.toEqual(queryKey('communes', 'null'));
  });
});

describe('normalizeFilters', () => {
  it('rend null plutot qu’un objet vide', () => {
    // `null` et `{}` ne sont pas egaux pour React Query : il faut une seule
    // forme pour « aucun filtre ».
    expect(normalizeFilters({})).toBeNull();
    expect(normalizeFilters(undefined)).toBeNull();
    expect(normalizeFilters({ a: undefined })).toBeNull();
  });

  it('conserve les valeurs fausses qui sont de vrais filtres', () => {
    // `0` et `false` sont des valeurs, pas des absences : un filtre
    // « 0 chambre » ou « non publie » doit survivre au nettoyage.
    expect(normalizeFilters({ minRooms: 0, published: false })).toEqual({ minRooms: 0, published: false });
  });
});

describe('detailKey et entityKeyPrefix — invalidation', () => {
  it('un detail n’est pas une liste, meme avec le meme identifiant', () => {
    expect(detailKey('properties', 't1', 'abc')).not.toEqual(queryKey('properties', 't1', { id: 'abc' }));
  });

  it('le prefixe d’entite couvre les listes ET les details de l’agence', () => {
    // React Query invalide par prefixe. Le test verifie la propriete dont
    // depend l'invalidation apres mutation : la cle complete commence par le
    // prefixe. Sans cela, il faudrait enumerer toutes les combinaisons de
    // filtres, ce qui est impossible.
    const prefix = entityKeyPrefix('properties', 't1');
    const list = queryKey('properties', 't1', { page: 3, status: 'RENTED' });
    const detail = detailKey('properties', 't1', 'abc');

    expect(list.slice(0, prefix.length)).toEqual(prefix);
    expect(detail.slice(0, prefix.length)).toEqual(prefix);
  });

  it('le prefixe d’une agence ne couvre pas une autre agence', () => {
    const prefix = entityKeyPrefix('properties', 't1');
    const autre = queryKey('properties', 't2', { page: 1 });
    expect(autre.slice(0, prefix.length)).not.toEqual(prefix);
  });
});

describe('STALE_TIME', () => {
  it('un referentiel reste frais plus longtemps qu’une liste', () => {
    expect(STALE_TIME.reference).toBeGreaterThan(STALE_TIME.list);
  });

  it('applique les durees du §8.4', () => {
    expect(STALE_TIME.list).toBe(30_000);
    expect(STALE_TIME.reference).toBe(300_000);
  });
});
