import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
// Les tokens précèdent la CSS applicative : `index.css` et `tailwind.config.js`
// consomment ces variables, le thème AntD les lit au démarrage.
import './styles/tokens.css';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
