/**
 * Import à EFFET DE BORD, à placer EN PREMIER dans le seed : l'EmailService lit
 * sa configuration à la construction, donc à l'import (et il retombe sur
 * smtp.hostinger.com sans variable). Les envois doivent être coupés avant.
 */
import { neutralizeOutbound } from './types';

neutralizeOutbound();
