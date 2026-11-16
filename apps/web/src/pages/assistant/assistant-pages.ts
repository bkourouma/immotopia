// Garde les listes de préchargement des écrans Assistant hors du chunk d’entrée.
export const loadAssistantPage = () => import('./AssistantPage');
export const loadAiSettings = () => import('../admin/AiSettings').then(module => ({ default: module.AiSettingsPage }));
