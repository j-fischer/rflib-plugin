# summary

Instrument Aura Components with RFLIB logging statements automatically.

# description

Analyzes Aura Component files and adds RFLIB logging statements for:
- Method entry logging with parameter values in Controller, Helper, and Renderer files
- Error logging in try-catch blocks
- Error logging in Promise catch handlers
- Adds rflibLoggerCmp component if not present
- Replaces console.log and similar method invocations
- Formats modified files using Prettier (optional)

The command processes:
- Component (.cmp) files to add the logger component
- Controller (.js) files for method instrumentation
- Helper (.js) files for method instrumentation
- Renderer (.js) files for method instrumentation

# flags.sourcepath.summary

Directory containing Aura components to instrument with logging.

# flags.sourcepath.description

Path to the source directory containing Aura components that should be instrumented with RFLIB logging statements. The command will:
- Scan for 'aura' directories recursively
- Process all Aura components found
- Add <c:rflibLoggerCmp> to component files
- Add logging statements to JavaScript files
- Initialize logger in methods using component.find()

# flags.dryrun.summary

Preview changes without modifying files.

# flags.dryrun.description

When enabled, shows which files would be modified without making actual changes. Useful for reviewing the impact before applying changes. Shows:
- Files that would be modified
- Number of processed files
- Number of modified files
- Number of formatted files

# flags.prettier.summary

Format modified files using Prettier.

# flags.prettier.description

When enabled, formats the modified JavaScript files using Prettier after adding logging statements. Maintains consistent code style with:
- 120 character line width
- 4 space indentation
- Single quotes for strings
- No tabs
- No trailing commas

# flags.no-if.summary

Exclude the instrumentation of if-else statements.

# flags.no-if.description

When provided, the command will not add log statements inside of `if` and `else` blocks.

# flags.skip-instrumented.summary

Skips any files where a logger is already present.

# flags.skip-instrumented.description

When provided, the command will not add log statements to any Aura component that contains the `` component.

# examples

- Add logging to all aura files:
$ sf rflib logging aura instrument --sourcepath force-app

- Preview changes:
$ sf rflib logging aura instrument --sourcepath force-app --dryrun

- Add logging and format code:
$ sf rflib logging aura instrument --sourcepath force-app --prettier

- Process specific component:
$ sf rflib logging aura instrument --sourcepath force-app/main/default/aura/myComponent