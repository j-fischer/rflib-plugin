# summary

Adds RFLIB logging statements to Salesforce Flows.

# description

Automatically adds RFLIB logging statements to Salesforce Flows to provide enhanced tracking and debugging capabilities. Works with both standard Flows and Auto-Launched Flows. Instruments flow invocations and decision paths with logging actions, and logs an error on the fault path of every element that can fail. Existing fault paths continue after the error is logged. Elements without a fault path get one that logs the error and then terminates the transaction, so the Flow still fails as before; this requires the Terminate Transaction option of the RFLIB Log Message action. Also sets the CanvasMode to AUTO_LAYOUT_CANVAS for better flow visualization while preserving the original processType.

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

# flags.skip-fault-paths.summary

Skips logging errors on fault paths.

# flags.skip-fault-paths.description

When provided, the command will not add error logging to fault paths and will not create fault paths for elements that have none. Use this flag if the target org runs an RFLIB version without the Terminate Transaction option of the Log Message action.

# flags.verbose.summary

Enable verbose output.

# flags.verbose.description

When provided with --dryrun, prints the paths of the files that would be modified.

# flags.exclude.summary

Exclude files or directories from instrumentation based on a glob pattern.

# flags.exclude.description

Exclude specific files or directories that match the provided glob pattern. For example, use --exclude "**/Test_*.flow-meta.xml" to skip certain flows.

# flags.concurrency.summary

Limits the number of files processed concurrently.

# flags.concurrency.description

Controls the maximum number of files to process at the same time. This is useful in very large codebases to prevent excessive memory usage or file descriptor exhaustion. Defaults to 10.

# examples

- <%= config.bin %> <%= command.id %> --sourcepath force-app
- <%= config.bin %> <%= command.id %> --sourcepath force-app --dryrun
- <%= config.bin %> <%= command.id %> --sourcepath force-app --skip-instrumented
- <%= config.bin %> <%= command.id %> --sourcepath force-app --skip-fault-paths

