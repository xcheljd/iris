import next from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Flat config. There is no `root: true` any more and none is needed: ESLint
// resolves `eslint.config.mjs` from the working directory and stops at the
// first one it finds, so a checkout under `.claude/worktrees/` no longer picks
// up the parent repo's config (the ESLint 8 failure mode this replaces).
//
// `eslint .` still covers the whole repo. The shipped configs scope themselves
// to `**/*.{js,jsx,mjs,ts,tsx,mts,cts}`, which spans everything the old
// `--ext .ts,.tsx,.js,.jsx,.mjs,.cjs` did — the repo has no `.cjs` files.
const config = [
  ...next,
  ...nextTypescript,

  // Former `.eslintignore`. `.next/`, `out/` and `next-env.d.ts` are already
  // ignored by eslint-config-next itself.
  {
    ignores: [
      "dist/**",
      "coverage/**",
      // Generated / vendored — not ours to lint.
      "drizzle/**",
      "public/**",
      // Local scratch (also gitignored).
      "remotion-demo/**",
      "tmp/**",
    ],
  },

  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // The React Compiler rules from eslint-plugin-react-hooks 7 were demoted to
  // warnings through the eslint-config-next 16 bump while their findings were
  // fixed. They are all fixed (or carry a justified inline suppression), so
  // they are errors again. `exhaustive-deps` stays at eslint-config-next's
  // `warn`, which `--max-warnings 0` in `pnpm lint` enforces anyway.
  {
    rules: {
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/static-components": "error",
      "react-hooks/immutability": "error",
      "react-hooks/refs": "error",
      "react-hooks/purity": "error",
    },
  },

  // A disable directive that suppresses nothing is dead weight that hides the
  // next real finding on that line — fail on it (ESLint 9 defaults to "warn").
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
];

export default config;
