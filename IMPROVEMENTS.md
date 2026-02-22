# RFLIB Plugin - Command Improvement Recommendations

This document captures recommended improvements for the existing `sf rflib logging` commands across all four platforms (Apex, LWC, Aura, Flow).

---

## Cross-Command Improvements

### 1. Add `--verbose` / `--json-output` flag for dry-run mode

**Applies to:** All commands
**Type:** UX / Functionality

Currently, `--dryrun` only reports counts (processed/modified/formatted). Users have no way to preview _what_ will change without inspecting debug logs. Adding a `--verbose` flag (or enhancing `--dryrun`) to print a diff or summary of each file's changes to stdout would make dry-run significantly more useful.

**Suggested behavior:**
- `--dryrun` alone: current behavior (counts only)
- `--dryrun --verbose`: print file-by-file change summaries or unified diffs to stdout

---

### 2. Add `--exclude` flag for file/directory exclusion patterns

**Applies to:** All commands
**Type:** Functionality

There is no way to exclude specific files or directories from instrumentation (e.g., generated code, managed package classes, third-party libraries). A `--exclude` flag accepting glob patterns would give users fine-grained control.

**Example:**
```bash
sf rflib logging apex instrument --sourcepath force-app --exclude "**/Generated_*.cls,**/managed/**"
```

---

### 3. Add `--concurrency` flag to control parallel file processing

**Applies to:** All commands
**Type:** Performance / Stability

All commands currently use unbounded `Promise.all()` for parallel processing. For very large codebases, this can lead to excessive memory usage or file descriptor exhaustion. A `--concurrency` flag (defaulting to, e.g., 10) that limits the number of files processed simultaneously would improve stability on resource-constrained environments.

---

### 4. Extract shared types and utilities into a common module

**Applies to:** All commands (internal)
**Type:** Implementation / Maintainability

The types `InstrumentationOptions`, `LoggerInfo`, `IfCondition`, and the Prettier formatting + error handling pattern are duplicated across `apex/instrument.ts`, `lwc/instrument.ts`, and `aura/instrument.ts`. Extracting these into a shared module (e.g., `src/shared/types.ts` and `src/shared/formatting.ts`) would reduce duplication and ensure consistent behavior when changes are made.

---

### 5. Add a `--log-level` flag for controlling instrumented log level

**Applies to:** Apex, LWC, Aura
**Type:** Functionality

Method entry logging is currently hardcoded to `info` level across all instrumenters. Users may want to instrument at `debug` level instead to avoid noise in production environments. A `--log-level` flag (e.g., `--log-level debug`) would let users choose the default level for injected entry-point logging statements.

---

### 6. Report skipped file counts

**Applies to:** All commands
**Type:** UX

When `--skip-instrumented` is used, files that are already instrumented are silently skipped. The final summary only shows `processedFiles` and `modifiedFiles`. Adding a `skippedFiles` counter to the result would give users visibility into how many files were skipped and why the modified count might be lower than expected.

---

## Apex-Specific Improvements

### 8. Improve test class detection beyond filename heuristics

**Applies to:** `sf rflib logging apex instrument`
**Type:** Stability

Test classes are currently identified by checking if the filename contains `"Test"` (`fileName.includes('Test')` at line 378). This is fragile: a class named `TestDataFactory` or `ContestController` would be misclassified. Using the `@IsTest` annotation in the file content would be more reliable.

---

### 9. Add `--no-catch` flag to skip catch block instrumentation

**Applies to:** `sf rflib logging apex instrument`
**Type:** Functionality

Some teams have existing error handling patterns in their catch blocks and don't want automated error logging injected. A `--no-catch` flag (similar to the existing `--no-if`) would let users opt out of catch block instrumentation.

---

### 10. Handle `System.debug` with string concatenation more robustly

**Applies to:** `sf rflib logging apex instrument`
**Type:** Stability

The `transformSystemDebug` method checks if the argument starts with a single quote to decide whether to wrap it in `JSON.serialize()`. Expressions like `'Prefix: ' + someVariable` start with a quote but are string concatenations, not pure string literals. These should be passed through directly without `JSON.serialize()` wrapping.

---

## LWC-Specific Improvements

### 11. Support TypeScript `.ts` files in LWC components

**Applies to:** `sf rflib logging lwc instrument`
**Type:** Functionality

The LWC instrumenter only scans `.js` files. With the growing adoption of TypeScript in LWC development (via LWC TypeScript support), the command should also process `.ts` files.

---

### 12. Handle arrow function class properties

**Applies to:** `sf rflib logging lwc instrument`
**Type:** Stability

The `METHOD_REGEX` targets named function declarations (`methodName(args) {`). It does not match arrow function class properties (e.g., `handleClick = (event) => { ... }`), which are common in LWC. These methods are not instrumented.

---

### 13. Exclude `renderedCallback`, `connectedCallback`, and lifecycle hooks from method entry logging

**Applies to:** `sf rflib logging lwc instrument`
**Type:** UX

LWC lifecycle hooks (`connectedCallback`, `disconnectedCallback`, `renderedCallback`, `errorCallback`) are called frequently by the framework. Instrumenting them at `info` level can generate excessive log output. Consider either skipping them by default or logging them at `debug` level, with a flag to override.

---

## Aura-Specific Improvements

### 14. Handle missing `<aura:attribute>` tags in component files

**Applies to:** `sf rflib logging aura instrument`
**Type:** Stability

The `.cmp` instrumentation inserts the `<c:rflibLoggerCmp>` tag after the last `<aura:attribute>`. If the component has no `<aura:attribute>` tags, the logger component is never added, and JavaScript instrumentation will produce references to a logger that doesn't exist in the DOM.

**Recommendation:** Fall back to inserting after the opening `<aura:component>` tag when no attributes are found.

---

### 15. Use the actual logger variable name in `processTryCatchBlocks`

**Applies to:** `sf rflib logging aura instrument`
**Type:** Stability

`AuraInstrumentationService.processTryCatchBlocks` hardcodes `logger` as the variable name (line 118: `logger.error('An error occurred', ${errorVar})`). Other methods correctly use the dynamic `loggerVar` parameter. If the logger variable has a different name (e.g., from an existing `component.find()` call), the catch block instrumentation will reference an undefined variable.

---

### 16. Pass `loggerId` to `processTryCatchBlocks` for method-name context

**Applies to:** `sf rflib logging aura instrument`
**Type:** UX

Unlike the Apex and LWC catch block handlers, the Aura version does not include the enclosing method name in the error log message. It always logs `'An error occurred'`. Adding the method name (as done in Apex and LWC) would make error logs more useful for debugging.

---

## Flow-Specific Improvements

### 17. Support additional process types

**Applies to:** `sf rflib logging flow instrument`
**Type:** Functionality

`isSupportedProcessType` currently only supports `Flow` and `AutoLaunchedFlow` (with `RecordAfterSave` trigger). Other common flow types like `AutoLaunchedFlow` with `RecordBeforeSave`, `Workflow`, scheduled flows, and platform event-triggered flows are skipped. Expanding the supported set (or adding a `--process-types` flag) would increase the command's utility.

---

### 18. Add `--prettier` flag for XML formatting consistency

**Applies to:** `sf rflib logging flow instrument`
**Type:** UX / Consistency

The flow command is the only one that lacks a `--prettier` flag. While XML formatting is handled by `xml2js.Builder`, the output format can differ from the original file's formatting (indentation, attribute ordering). Adding a `--prettier` flag using `@prettier/plugin-xml` would bring consistency with the other three commands.

---

### 19. Reduce eslint-disable directives by introducing typed interfaces for Flow XML

**Applies to:** `sf rflib logging flow instrument` (internal)
**Type:** Implementation / Maintainability

The file has 7 `eslint-disable` directives at the top to suppress TypeScript strictness warnings caused by liberal `any` usage for XML objects. Defining TypeScript interfaces for the Flow XML structure (at least for the properties the code accesses) would improve type safety, enable better IDE support, and reduce the need for eslint overrides.

---

### 20. Eliminate duplicate code in `createDecisionPathLogger` and `createLoggingAction`

**Applies to:** `sf rflib logging flow instrument` (internal)
**Type:** Implementation

Both `createDecisionPathLogger` and `createLoggingAction` construct nearly identical action objects with the same `inputParameters` structure, `actionName`, and `actionType`. The fallback blocks (when `name.length > 80`) also duplicate the full object. Extracting a shared builder method would reduce ~40 lines of duplication.

---

### 21. Make `generateUniqueId` deterministic in tests

**Applies to:** `sf rflib logging flow instrument` (internal)
**Type:** Testability

`generateUniqueId` uses `Date.now()` and `Math.random()`, making flow XML output non-deterministic across test runs. This makes snapshot-based testing or exact content assertions fragile. Injecting a seed or ID generator would allow deterministic output in tests.

---

## Summary

| # | Command | Category | Priority | Status |
|---|---------|----------|----------|--------|
| 1 | All | UX | High | Done |
| 2 | All | Functionality | High | Done |
| 3 | All | Performance | Medium | Done |
| 4 | All (internal) | Maintainability | Medium | Done |
| 5 | Apex, LWC, Aura | Functionality | Medium | To do |
| 6 | All | UX | Low | To do |
| 8 | Apex | Stability | High | Done |
| 9 | Apex | Functionality | Low | To do |
| 10 | Apex | Stability | Medium | To do |
| 11 | LWC | Functionality | Medium | To do |
| 12 | LWC | Stability | High | Done |
| 13 | LWC | UX | Low | To do |
| 14 | Aura | Stability | High | To do |
| 17 | Aura | Stability | High | To do |
| 18 | Aura | UX | Medium | To do |
| 19 | Flow | Functionality | Medium | To do |
| 20 | Flow | Consistency | Low | To do |
| 21 | Flow (internal) | Maintainability | Medium | To do |
| 22 | Flow (internal) | Maintainability | Low | To do |
| 23 | Flow (internal) | Testability | Low | To do |
