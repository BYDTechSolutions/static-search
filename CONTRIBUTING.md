# Contributing

Thanks for helping. Issues and pull requests are welcome at
[github.com/BYDTechSolutions/static-search](https://github.com/BYDTechSolutions/static-search).

## Setup

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Node.js 20 or later. To try a change on a real site, build it and run
`node dist/cli.js build <your site's output folder> --out /tmp/idx.json --no-ui`,
then `node dist/cli.js query /tmp/idx.json some words`.

## Rules

- Keep the browser runtime small: the README states its gzipped size, so update
  that number if a change moves it (esbuild `--minify`, then `gzip -9`).
- A ranking change needs a test that shows the ordering it fixes.
- No runtime dependencies without a strong reason, stated in the README.
- Add a line to `CHANGELOG.md` under "Unreleased".
- American English in code, messages and docs.
