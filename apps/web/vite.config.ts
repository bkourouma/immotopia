/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // `PORT` (not VITE_-prefixed, so it stays out of the browser bundle) keeps
  // working the way Create React App used it. The API's CORS allows a single
  // origin, so this must match FRONTEND_URL in packages/api/.env.
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.PORT) || 3000;

  return {
    plugins: [react()],

    resolve: {
      alias: {
        // Mirrors the `baseUrl: "src"` + `@/*` paths of tsconfig.json.
        '@': path.resolve(__dirname, 'src')
      }
    },

    server: {
      port,
      strictPort: true
    },

    preview: {
      port
    },

    build: {
      // Keep the output directory Create React App used, so deployment
      // scripts and .gitignore entries stay valid.
      outDir: 'build',
      sourcemap: false,
      // REFONTE_UI_UX.md §8.1 : 350 Ko non compresses valent environ 120 Ko
      // gzip, le budget d'un chunk de route. L'ancien seuil de 900 etait
      // quatre fois trop permissif. Avertissement seulement : le Lot 0 mesure
      // et publie la reference, c'est le Lot 5 qui rend size-limit bloquant.
      chunkSizeWarningLimit: 350

      // PAS de rollupOptions.output.manualChunks, contrairement au §8.1.
      // Mesure du chemin critique (JS + CSS charges au premier rendu, gzip) :
      //
      //   sans manualChunks .......................... 274 301 o
      //   antd + charts + calendar + editor + motion . 505 735 o
      //   charts + calendar + editor + motion ........ 510 035 o
      //   excel + editor seulement ................... 286 390 o
      //
      // Tout chunk nomme par manualChunks est systematiquement precharge par
      // Vite via <link rel="modulepreload"> dans index.html. Ce qui etait
      // charge paresseusement par route devient donc telecharge des le premier
      // rendu, et le chemin critique double. Le decoupage automatique de
      // Rollup fait mieux ici. `exceljs` est deja isole sans aide, parce
      // qu'il est importe dynamiquement (utils/export-utils.ts).
      //
      // Ecart assume et chiffre dans docs/refonte/LOT-0-RAPPORT.md. Le vrai
      // levier sur ce chemin critique est ailleurs : Login est le seul ecran
      // importe statiquement (App.tsx), ce qui tire tout AntD dans l'entree.
      // Son passage en lazy est au perimetre du Lot 1.,
    },

    test: {
      globals: true,
      environment: 'jsdom',
      // Le defaut de 5 s suffisait tant que les suites mockaient `antd` en
      // entier. Celles qui montent la vraie coquille prennent 4 s a elles
      // seules et depassaient sous la charge parallele — echec intermittent,
      // pas defaut de code. 20 s a tenu jusqu'au Lot 2.
      //
      // Porte a 40 s en cours de Lot 2 : la suite est passee de 93 a 238 tests,
      // et plusieurs montent desormais une `<Modal>` ou un `<Drawer>` d'Ant
      // Design, ce qui coute cher en jsdom. Les tests concernes passent en 3 a
      // 13 s isoles et ne depassaient que sous la charge parallele — c'est un
      // probleme de plan de charge, pas de code.
      //
      // Ce seuil n'est PAS la premiere reponse a un test lent : `userEvent` est
      // configure sans delai la ou il en inserait, ce qui retire le cout au
      // lieu de l'autoriser. Le seuil ne couvre que ce qui reste.
      testTimeout: 40000,
      // Parallelisme borne.
      //
      // Vitest ouvre par defaut un worker par coeur. Chacun monte un jsdom
      // complet et, depuis le Lot 2, des composants Ant Design lourds :
      // au-dela de quatre, les workers se disputent la machine et le temps de
      // collecte a ete observe en train de TRIPLER d'une execution a l'autre,
      // jusqu'a faire expirer des tests qui passent en 3 s isoles.
      //
      // Une suite qui n'est verte que sur une machine au repos ne garde rien.
      // Quatre workers rendent le resultat independant de ce qui tourne a
      // cote — serveur de developpement, build, autre session.
      maxWorkers: 4,
      minWorkers: 1,
      setupFiles: './src/setupTests.ts',
      css: false,
      include: ['src/**/*.{test,spec}.{ts,tsx}']
    }
  };
});
