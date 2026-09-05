import js from "@eslint/js";
import importX from "eslint-plugin-import-x";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { plugins: { "import-x": importX, "react-hooks": reactHooks, "react-refresh": reactRefresh }, rules: { "@typescript-eslint/no-explicit-any": "error", "react-refresh/only-export-components": "warn" } },
);
