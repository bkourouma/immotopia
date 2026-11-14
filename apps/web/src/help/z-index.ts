/**
 * Niveaux d'empilement de l'aide. Les Modal et Drawer d'antd sont a 1000 :
 * le panneau d'aide doit s'ouvrir au-dessus d'eux (un « ? » peut etre pose
 * dans une modale ou un tiroir), et la visite guidee au-dessus du panneau,
 * pour rester utilisable si les deux coexistent.
 */
export const HELP_DRAWER_Z_INDEX = 1100;
export const HELP_TOUR_Z_INDEX = 1200;
