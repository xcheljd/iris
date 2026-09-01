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

  // eslint-config-next 16 pulls in eslint-plugin-react-hooks 7, which turns the
  // React Compiler rules on as *errors*. They flag 37 pre-existing findings —
  // real ones worth addressing, but each is a behavioural change to a hook or
  // component and none belong in a dependency bump. Demoted to warnings so they
  // stay visible without failing `pnpm lint`; promote them back to `error` as
  // they get fixed. `rules-of-hooks` and `exhaustive-deps` keep the severity
  // they had under eslint-config-next 15.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
];

export default config;
