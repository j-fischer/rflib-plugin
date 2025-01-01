# summary

Instrument Lightning Web Components with RFLIB logging statements automatically.

# description

Analyzes Lightning Web Component JavaScript files and adds RFLIB logging statements for:
- Method entry logging with parameter values
- Error logging in try-catch blocks
- Error logging in Promise catch handlers
- Condition logging in if/else blocks
- Adds logger import if not present
- Adds logger initialization if not present
- Formats modified files using Prettier (optional)

# flags.sourcepath.summary

Directory containing aura JavaScript files to instrument with logging.

# flags.sourcepath.description

Path to the source directory containing Lightning Web Component JavaScript files that should be instrumented with RFLIB logging statements. Aura component files are automatically excluded. The command will:
- Process all .js files in the directory and subdirectories
- Skip files in 'aura' directories
- Add import statement: import { createLogger } from 'c/rflibLogger'
- Add logger initialization: const logger = createLogger('ComponentName')

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

# examples

- Add logging to all aura files:
$ sf rflib logging aura instrument --sourcepath force-app/main/default/aura

- Preview changes:
$ sf rflib logging aura instrument --sourcepath force-app/main/default/aura --dryrun

- Add logging and format code:
$ sf rflib logging aura instrument --sourcepath force-app/main/default/aura --prettier

- Process specific component:
$ sf rflib logging aura instrument --sourcepath force-app/main/default/aura/myComponent
