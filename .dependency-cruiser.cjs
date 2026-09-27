/**
 * Architecture boundaries that must remain true across the monorepo.
 * Keep this first pass intentionally small: only enforce package isolation,
 * which is stable and has no legacy exceptions in the current source tree.
 */
module.exports = {
  forbidden: [
    {
      name: "web-must-not-import-api",
      severity: "error",
      from: { path: "^apps/web/src/" },
      to: { path: "^packages/api/src/" },
    },
    {
      name: "api-must-not-import-web",
      severity: "error",
      from: { path: "^packages/api/src/" },
      to: { path: "^apps/web/src/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
  },
};
