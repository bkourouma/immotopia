import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import 'antd/dist/reset.css';
// Les tokens précèdent la CSS applicative : `index.css` et `tailwind.config.js`
// consomment ces variables, le thème AntD les lit au démarrage.
import './styles/fonts.css';
import './styles/tokens.css';
import './index.css';
// Repli de police arabe et rattrapages droite-a-gauche. Apres `index.css` :
// certaines regles y annulent des declarations directionnelles ecrites plus
// haut, et la specificite est identique.
import './styles/rtl.css';
import App from './App';

// Posé une seule fois : dayjs alimente les DatePicker AntD et le localizer de
// react-big-calendar (`pages/crm/Calendar.tsx`). §3.5.
dayjs.locale('fr');

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
