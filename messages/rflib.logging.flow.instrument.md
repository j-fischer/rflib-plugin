# summary

Adds RFLIB logging statements to Salesforce Flows.

# description

Automatically adds RFLIB logging statements to Salesforce Flows to provide enhanced tracking and debugging capabilities. Works with both standard Flows and Auto-Launched Flows. Instruments flow invocations and decision paths with logging actions. Also sets the CanvasMode to AUTO_LAYOUT_CANVAS for better flow visualization while preserving the original processType.

# flags.sourcepath.summary

Directory containing Flow files to instrument with logging.

# flags.sourcepath.description

Path to the source directory containing Flow files that should be instrumented with RFLIB logging statements. Processes .flow-meta.xml files with processType="Flow" or "AutoLaunchedFlow".

# flags.dryrun.summary

Preview changes without modifying files.

# flags.dryrun.description

When enabled, shows which files would be modified without making actual changes. Useful for reviewing the impact before applying changes.

# flags.prettier.summary

Format output files with prettier.

# flags.prettier.description

Use prettier to format the output files.

# flags.skip-instrumented.summary

Skips any files where a logger is already present.

# flags.skip-instrumented.description

When provided, the command will not add log statements to any Flows that already contain RFLIB logging actions.

# flags.verbose.summary

Enable verbose output.

# flags.verbose.description

When provided with --dryrun, prints the paths of the files that would be modified.

# examples

- <%= config.bin %> <%= command.id %> --sourcepath force-app
- <%= config.bin %> <%= command.id %> --sourcepath force-app --dryrun
- <%= config.bin %> <%= command.id %> --sourcepath force-app --skip-instrumented

