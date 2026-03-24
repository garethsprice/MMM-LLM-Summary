import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        Module: "readonly",
        Log: "readonly",
        document: "readonly",
        console: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        Date: "readonly",
        Object: "readonly",
        JSON: "readonly",
        Math: "readonly",
        Infinity: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.test.js", "__mocks__/**/*.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        jest: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        global: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/"],
  },
];
