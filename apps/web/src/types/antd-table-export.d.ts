import type { AnyObject } from 'antd/es/_util/type';

/**
 * Augmentation du type de colonne Ant Design pour l'export des tableaux
 * (`utils/table-export/`). Les trois champs sont optionnels : une colonne qui
 * n'en pose aucun est exportée si son titre est une chaîne.
 */
declare module 'antd/es/table/interface' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnType<RecordType = AnyObject> {
    /**
     * `false` exclut la colonne de l'export. Par défaut elle est exclue si elle
     * n'a ni titre texte ni `exportTitle`, ou si sa `key`/`dataIndex` vaut
     * `actions`, `action` ou `operations`. `true` force l'inclusion.
     */
    exportable?: boolean;
    /** Titre exporté quand `title` n'est pas une chaîne (ReactNode, fonction). */
    exportTitle?: string;
    /** Valeur exportée telle quelle, prioritaire sur le rendu et la valeur brute. */
    exportValue?: (record: RecordType, index: number) => string | number | boolean | Date | null | undefined;
  }
}

export {};
