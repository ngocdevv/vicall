const { defineConfig } = require("eslint/config");
const universe = require("eslint-config-universe/flat/native");

module.exports = defineConfig([
  { ignores: ["build"] },
  ...universe,
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      // Reanimated SharedValues are intentionally mutated from worklets.
      "react-hooks/immutability": "off",
      // Presentation mode mirrors an external native/session state machine.
      "react-hooks/set-state-in-effect": "off",
      // Fire-and-forget native promises are explicitly marked with void.
      "no-void": "off",
    },
  },
]);
