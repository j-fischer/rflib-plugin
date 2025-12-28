---
trigger: always_on
---

- Uses TypeScript with strict type checking
- Follow ESLint rules from eslint-config-salesforce-typescript
- Use 4-space indentation for Apex, 2-space for TypeScript
- Prefer single quotes over double quotes
- Use ESM imports: `import * as fs from 'node:fs'`
- Error handling: use typed errors (`if (error instanceof Error)`)
- Naming: camelCase for variables/functions, PascalCase for classes
- Document functions with JSDoc comments
- Use async/await rather than Promises
- Prefer readonly with const parameters when possible
- Avoid "Unsafe argument of type `any` assigned to a parameter of type `string`" eslint issue

Apply clean code best practices using proper abstraction, reducing indentation, strong naming, and the overall complexlity of the file. 