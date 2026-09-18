/**
 * Moteur comptable operationnel — lot 2.
 *
 * Les trois fonctions existent d'abord sous forme de talons, avec leur
 * signature definitive. C'est ce qui permet aux agents qui ecrivent les
 * fournisseurs, les chantiers et la caisse de compiler et de se tester avant
 * que l'implementation n'arrive : ils importent un nom qui existe deja.
 *
 * Le contrat qu'elles honorent est dans `./types-lot2.ts`. Il ne bouge plus.
 */

import type { GetTrialBalance, PostDocumentEntryTx, VoidDocumentTx } from './types-lot2';
import { getTrialBalanceStub, postDocumentEntryTxStub, voidDocumentTxStub } from './types-lot2';

/** Voir `PostDocumentEntryTx` dans `./types-lot2.ts`. */
export const postDocumentEntryTx: PostDocumentEntryTx = postDocumentEntryTxStub;

/** Voir `VoidDocumentTx` dans `./types-lot2.ts`. */
export const voidDocumentTx: VoidDocumentTx = voidDocumentTxStub;

/** Voir `GetTrialBalance` dans `./types-lot2.ts`. */
export const getTrialBalance: GetTrialBalance = getTrialBalanceStub;
