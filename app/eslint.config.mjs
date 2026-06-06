import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import tseslintParser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

const eslintConfig = [
    {
        ignores: [
            ".next/**",
            ".next-dev/**",
            "node_modules/**",
            "out/**",
            "public/**",
            "src/lib/database.types.ts",
            "next-env.d.ts",
        ],
    },
    ...compat.extends("next/core-web-vitals"),
    eslintConfigPrettier,
    {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            parser: tseslintParser,
        },
        plugins: {
            "@typescript-eslint": tseslintPlugin,
        },
        rules: {
            "no-unused-vars": [
                "off",
            ],
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
];

export default eslintConfig;
