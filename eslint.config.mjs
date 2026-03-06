import tseslint from "typescript-eslint";

const config = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "dist/**"]
  },
  {
    plugins: {
      "@next/next": {
        rules: {
          "no-img-element": {
            meta: { type: "suggestion" },
            create() {
              return {};
            }
          }
        }
      }
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  }
];

export default config;
