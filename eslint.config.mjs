import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "prisma/dev.db",
      "postcss.config.mjs",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-undef": "off",
      ...tsPlugin.configs.recommended.rules,
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    ...reactPlugin.configs.flat.recommended,
  },
  {
    files: ["**/*.{jsx,tsx}"],
    ...reactPlugin.configs.flat["jsx-runtime"],
  },
  {
    files: ["**/*.{jsx,tsx}"],
    ...reactHooksPlugin.configs["recommended-latest"],
  },
  {
    files: ["**/*.{jsx,tsx}"],
    ...jsxA11yPlugin.flatConfigs.recommended,
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    ...nextPlugin.flatConfig.coreWebVitals,
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["public/sw.js"],
    languageOptions: {
      globals: {
        URL: "readonly",
        caches: "readonly",
        fetch: "readonly",
        self: "readonly",
      },
    },
  },
  {
    files: ["src/components/ui/card.tsx"],
    rules: {
      "jsx-a11y/heading-has-content": "off",
    },
  },
  {
    files: ["src/components/ui/label.tsx"],
    rules: {
      "jsx-a11y/label-has-associated-control": "off",
    },
  },
];
