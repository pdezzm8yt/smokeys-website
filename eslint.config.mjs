import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  // .claude/ holds agent worktrees (other checkouts of this repo, with their own builds); .cache/ is scratch output.
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", ".claude/**", ".cache/**"] },
];

export default config;
