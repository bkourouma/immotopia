/**
 * Enregistrement des sources de document signables (spec 044). UNE ligne par
 * source : chaque fichier de source s'enregistre lui-même (`registerSignatureSource`
 * en fin de fichier) ; il suffit de l'importer ici. Ce fichier n'est importé que
 * par `sources/index.ts`.
 */
import './lease-contract';
import './lease-inspection';
import './sale-agreement';
import './management-mandate';
import './sale-mandate';
import './direct-debit-mandate';
