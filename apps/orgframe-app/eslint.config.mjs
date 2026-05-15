import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

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
      },
      "react-hooks": reactHooks
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
