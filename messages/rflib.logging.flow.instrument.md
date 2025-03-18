# summary

Summary of a command.

# description

More information about a command. Don't repeat the summary. 

# flags.sourcepath.summary

Directory containing Apex classes to instrument with logging.

# flags.sourcepath.description

Path to the source directory containing Apex classes that should be instrumented with RFLIB logging statements. Test classes (ending with 'Test.cls') are automatically excluded.

# flags.dryrun.summary

Preview changes without modifying files.

# flags.dryrun.description

When enabled, shows which files would be modified without making actual changes. Useful for reviewing the impact before applying changes.

# flags.skip-instrumented.summary

Skips any files where a logger is already present.

# flags.skip-instrumented.description

When provided, the command will not add log statements to any Flows that already contains a RFLIB logging node.

# examples

- <%= config.bin %> <%= command.id %>

