/**
 * Cle metier de la notification d'un message prive (messagerie). Definie ici
 * UNE seule fois : le journal admin et le renvoi l'excluent (un message prive
 * n'apparait jamais au journal, meme en metadonnees) ; lib/messaging la reutilise.
 */
export const MESSAGE_NOTIFICATION_KEY = 'MESSAGE_RECEIVED';
