// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // Screens load their data with `useEffect(() => { load(); }, [load])`,
      // where `load` sets state only after awaiting the server. This rule
      // can't see past the call and reports every one of them, so it warns
      // instead; state set synchronously in an effect is still fixed where found.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
