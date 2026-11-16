// Reexport : le code vit dans HelpButton.tsx pour que le « ? » et ses derives
// forment un seul chunk partage (moins d'indices de prechargement dans l'entree).
export { HelpSectionTitle, default } from './HelpButton';
export type { HelpSectionTitleProps } from './HelpButton';
