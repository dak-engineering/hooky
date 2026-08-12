import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "migrations/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
