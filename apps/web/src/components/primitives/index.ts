/**
 * Primitives du design system (REFONTE_UI_UX.md §3.6).
 *
 * Ecrites au Lot 0, volontairement NON cablees dans les ecrans : le Lot 0 ne
 * refond aucun ecran. Leur adoption est le travail des lots 1 a 4.
 */
export { PageHeader } from './PageHeader';
export type { PageHeaderProps, Crumb } from './PageHeader';

export { StateBlock } from './StateBlock';
export type { StateBlockProps, StateVariant, StateBlockAction } from './StateBlock';

export { SkeletonList, SkeletonTable, SkeletonDetail, SkeletonStats } from './Skeleton';
export type { SkeletonProps } from './Skeleton';

export { StatusTag, statusTone } from './StatusTag';
export type { StatusTagProps, StatusTone } from './StatusTag';

export { ConfirmAction, useConfirmAction } from './ConfirmAction';
export type { ConfirmActionProps, ConfirmOptions } from './ConfirmAction';

export { MoneyValue, formatMoney } from './MoneyValue';
export type { MoneyValueProps } from './MoneyValue';

export { AccessDenied } from './AccessDenied';
export type { AccessDeniedProps, AccessDeniedReason } from './AccessDenied';

export { NotFound } from './NotFound';

export { AccountNotLinked } from './AccountNotLinked';

export { DataView } from './DataView';
export type { DataViewProps } from './DataView';

export { DataCard } from './DataCard';
export type { DataCardProps, DataCardField } from './DataCard';

export { FilterSheet } from './FilterSheet';
export type { FilterSheetProps } from './FilterSheet';

export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';
