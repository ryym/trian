module.exports = {
  parser: "@typescript-eslint/parser",

  plugins: ["@typescript-eslint"],

  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],

  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-empty-function": "off",

    // We cannot avoid using any type in some situations.
    "@typescript-eslint/no-explicit-any": "off",
  },
};
