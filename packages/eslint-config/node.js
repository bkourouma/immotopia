/** Backend (Express/Prisma) preset. */
module.exports = {
  extends: ['./index.js'],
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  rules: {
    // The API logs through winston; console is still used in bootstrap paths.
    'no-console': 'off'
  }
};
