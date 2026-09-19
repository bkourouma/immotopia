/**
 * Contrat gelé — lot 5, premier sous-lot : le référentiel du stock (PRD E9,
 * besoins S1, S4 pour les lieux, S5 pour la méthode).
 *
 * Écrit **avant** les implémentations, et il ne bouge plus.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce sous-lot pose, et ce qu'il ne touche pas
 * ---------------------------------------------------------------------------
 *
 * Les articles, les lieux, et la méthode de valorisation de l'agence. **Aucun
 * mouvement, aucune valeur, aucune quantité** : tout cela appartient au
 * sous-lot suivant, qui lit ces tables sans les écrire.
 *
 * C'est délibérément le morceau le plus simple du lot, et il est ouvert en
 * premier parce que tout le reste en dépend.
 *
 * ---------------------------------------------------------------------------
 * L'unité est du texte libre, et c'est un choix
 * ---------------------------------------------------------------------------
 *
 * Le PRD donne des exemples — sac, tonne, barre, m³ — pas une liste fermée.
 * Une énumération obligerait à livrer une version du logiciel pour ajouter
 * « fût », et les unités d'une agence ivoirienne ne sont pas celles d'une
 * agence guinéenne. Même raisonnement que pour les postes de dépense au
 * lot 2.
 *
 * ---------------------------------------------------------------------------
 * Le poste de dépense d'un article est une PROPOSITION
 * ---------------------------------------------------------------------------
 *
 * `defaultCostCategoryId` existe pour que l'écran de sortie présente un poste
 * pré-sélectionné. Il n'a **aucune autorité** : la sortie exige son poste, et
 * le domaine ne le devine jamais depuis l'article.
 *
 * C'est exactement le parti pris du poste « main-d'œuvre » au sous-lot des
 * salaires, et pour la même raison : un poste deviné se lirait comme un choix
 * sans en être un, et personne ne le vérifierait.
 *
 * ---------------------------------------------------------------------------
 * Un lieu par chantier, et pas deux
 * ---------------------------------------------------------------------------
 *
 * Deux lieux pour le même chantier partageraient son stock en deux soldes
 * dont aucun ne dirait la vérité. L'unicité l'impose en base ; le service la
 * vérifie avant d'écrire, parce qu'en PostgreSQL une commande en échec
 * condamne toute la transaction.
 *
 * ---------------------------------------------------------------------------
 * La méthode de valorisation : une seule valeur, et c'est volontaire
 * ---------------------------------------------------------------------------
 *
 * `WEIGHTED_AVERAGE` est la seule offerte. L'énumération existe pour que le
 * **choix** soit enregistré et daté, comme le besoin S5 le demande — « choix
 * figé par tenant ; changement = décision documentée » — pas pour laisser
 * croire qu'une autre méthode est disponible. En ajouter une est un travail à
 * part entière, pas une ligne de configuration.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import type { StockLocationKind, StockValuationMethod } from '@prisma/client';

import { NotImplementedYetError } from './types';

export type { StockLocationKind, StockValuationMethod };

// ---------------------------------------------------------------------------
// L'article
// ---------------------------------------------------------------------------

export interface StockItemRecord {
  id: string;
  tenantId: string;
  reference: string;
  label: string;
  /** Sac, tonne, barre, m³. Texte libre. */
  unit: string;
  category: string | null;
  defaultCostCategoryId: string | null;
  /** Nom du poste proposé. Nul quand l'article n'en propose aucun. */
  defaultCostCategoryLabel: string | null;
  isActive: boolean;
}

/**
 * Enregistre un article.
 *
 * **Refuse une référence déjà prise** dans l'agence, en lisant d'abord : deux
 * articles de même référence rendraient illisible tout bon de sortie.
 *
 * Refuse une désignation ou une unité vide. Un article sans unité est une
 * quantité qu'on ne saura pas interpréter — « 12 » de quoi ?
 */
export type CreateStockItemTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: {
    reference: string;
    label: string;
    unit: string;
    category?: string | null;
    defaultCostCategoryId?: string | null;
  }
) => Promise<StockItemRecord>;

/**
 * Corrige un article.
 *
 * **L'unité se corrige, et c'est un danger assumé.** Passer un article de
 * « sac » à « tonne » ne reconvertit aucune quantité déjà enregistrée : les
 * mouvements passés gardent leur nombre, qui voudra désormais dire autre
 * chose. Le domaine ne peut pas deviner le facteur de conversion, et
 * l'interdire empêcherait de réparer une faute de frappe au premier jour.
 * L'écran doit prévenir ; le domaine laisse faire.
 */
export type UpdateStockItemTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  itemId: string,
  params: {
    label?: string;
    unit?: string;
    category?: string | null;
    defaultCostCategoryId?: string | null;
    isActive?: boolean;
  }
) => Promise<StockItemRecord>;

export type ListStockItems = (
  tenantId: string,
  filters: { onlyActive?: boolean; search?: string }
) => Promise<StockItemRecord[]>;

export type GetStockItem = (tenantId: string, itemId: string) => Promise<StockItemRecord>;

// ---------------------------------------------------------------------------
// Le lieu de stockage
// ---------------------------------------------------------------------------

export interface StockLocationRecord {
  id: string;
  tenantId: string;
  kind: StockLocationKind;
  label: string;
  siteId: string | null;
  /** Nom du chantier. Nul pour un magasin. */
  siteLabel: string | null;
  isActive: boolean;
}

/**
 * Crée un magasin, ou le lieu de stockage d'un chantier.
 *
 * `siteId` est **exigé quand `kind` vaut `SITE`, et refusé sinon** — plutôt
 * qu'ignoré. Accepter un champ qui ne servira à rien laisserait croire qu'il
 * a servi.
 *
 * Refuse un second lieu pour le même chantier, et un libellé déjà pris.
 */
export type CreateStockLocationTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { kind: StockLocationKind; label: string; siteId?: string | null }
) => Promise<StockLocationRecord>;

/**
 * Corrige un lieu — son libellé, son activité.
 *
 * Ni sa nature ni son chantier ne se corrigent : un magasin qui deviendrait
 * le lieu d'un chantier emporterait avec lui un stock qui n'y a jamais été.
 *
 * **Désactiver n'est pas supprimer.** Un lieu désactivé garde son stock et
 * son historique ; il cesse simplement d'être proposé. Rien ne supprime un
 * lieu : ses mouvements racontent où la matière est passée.
 */
export type UpdateStockLocationTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  locationId: string,
  params: { label?: string; isActive?: boolean }
) => Promise<StockLocationRecord>;

export type ListStockLocations = (
  tenantId: string,
  filters: { onlyActive?: boolean; kind?: StockLocationKind }
) => Promise<StockLocationRecord[]>;

// ---------------------------------------------------------------------------
// La méthode de valorisation
// ---------------------------------------------------------------------------

export interface StockSettingsRecord {
  tenantId: string;
  valuationMethod: StockValuationMethod;
  decidedAt: Date;
  decisionNote: string | null;
}

/**
 * Lit les réglages, en les créant au défaut s'ils n'existent pas.
 *
 * **Ne lève jamais pour cause de réglages absents.** Une agence qui n'a
 * jamais ouvert l'écran de paramétrage doit pouvoir enregistrer sa première
 * réception : le coût moyen pondéré est le défaut du PRD, et l'imposer en
 * silence est plus honnête que de refuser un mouvement réel.
 */
export type EnsureStockSettingsTx = (tx: PrismaTransactionClient, tenantId: string) => Promise<StockSettingsRecord>;

export type GetStockSettings = (tenantId: string) => Promise<StockSettingsRecord>;

/**
 * Arrête la méthode de valorisation, avec son motif.
 *
 * **Le motif est exigé.** Le besoin S5 dit « changement = décision
 * documentée » ; sans motif ni date, ce n'en serait pas une, et personne ne
 * saurait six mois plus tard pourquoi les chiffres ont changé de sens.
 *
 * Une seule méthode existe aujourd'hui, donc cette fonction ne change rien en
 * pratique — elle enregistre la décision. C'est sa raison d'être.
 */
export type SetStockValuationMethodTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  params: { valuationMethod: StockValuationMethod; decisionNote: string }
) => Promise<StockSettingsRecord>;

// ---------------------------------------------------------------------------
// Talons
// ---------------------------------------------------------------------------

export const createStockItemTxStub: CreateStockItemTx = async () => {
  throw new NotImplementedYetError('createStockItemTx');
};

export const updateStockItemTxStub: UpdateStockItemTx = async () => {
  throw new NotImplementedYetError('updateStockItemTx');
};

export const listStockItemsStub: ListStockItems = async () => {
  throw new NotImplementedYetError('listStockItems');
};

export const getStockItemStub: GetStockItem = async () => {
  throw new NotImplementedYetError('getStockItem');
};

export const createStockLocationTxStub: CreateStockLocationTx = async () => {
  throw new NotImplementedYetError('createStockLocationTx');
};

export const updateStockLocationTxStub: UpdateStockLocationTx = async () => {
  throw new NotImplementedYetError('updateStockLocationTx');
};

export const listStockLocationsStub: ListStockLocations = async () => {
  throw new NotImplementedYetError('listStockLocations');
};

export const ensureStockSettingsTxStub: EnsureStockSettingsTx = async () => {
  throw new NotImplementedYetError('ensureStockSettingsTx');
};

export const getStockSettingsStub: GetStockSettings = async () => {
  throw new NotImplementedYetError('getStockSettings');
};

export const setStockValuationMethodTxStub: SetStockValuationMethodTx = async () => {
  throw new NotImplementedYetError('setStockValuationMethodTx');
};
