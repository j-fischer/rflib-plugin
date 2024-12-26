# summary

Instrument Lightning Web Components with RFLIB logging statements automatically.

# description

Analyzes Lightning Web Component JavaScript files and adds RFLIB logging statements for method entry and error handling. Adds logger import and initialization if not already present. Automatically adds error logging to catch blocks and Promise catch handlers.

# flags.sourcepath.summary

Directory containing LWC JavaScript files to instrument with logging.

# flags.sourcepath.description

Path to the source directory containing Lightning Web Component JavaScript files that should be instrumented with RFLIB logging statements. Aura component files are automatically excluded.

# flags.dryrun.summary

Preview changes without modifying files.

# flags.dryrun.description

When enabled, shows which files would be modified without making actual changes. Useful for reviewing the impact before applying changes.

# flags.prettier.summary

Format modified files using Prettier.

# flags.prettier.description

When enabled, formats the modified JavaScript files using Prettier after adding logging statements. Maintains consistent code style.

# examples

- Add logging statements to all LWC files in a directory:

  $ sf rflib logging lwc instrument --sourcepath force-app/main/default/lwc

- Preview changes without modifying files:

$ sf rflib logging lwc instrument --sourcepath force-app/main/default/lwc --dryrun

- Add logging statements and format code:

$ sf rflib logging lwc instrument --sourcepath force-app/main/default/lwc --prettier
