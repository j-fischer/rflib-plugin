---
trigger: model_decision
description: This are commands that can be used to validate a new feature
---

- Build: `yarn build`
- Test: `yarn test`
- Lint: `yarn lint`
- Format: `yarn format`
- Single test: `c8 -r text node --loader ts-node/esm ./node_modules/mocha/bin/mocha.js "test/**/*name*.test.ts"`
- NUT tests: `yarn test:nuts`
- Dryrun command: `sf rflib logging apex instrument --sourcepath force-app --dryrun`