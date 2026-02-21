# summary

Instrument Apex classes with RFLIB logging statements automatically.

# description

Analyzes Apex classes and adds RFLIB logging statements for method entry and error handling. Adds class-level logger initialization if not already present. 
For Apex Test classes, the `@TestSetup` method will be updated to include `rflib_TestUtil.prepareLoggerForUnitTests();` to avoid test failures caused by the logging framework.

# flags.sourcepath.summary

Directory containing Apex classes to instrument with logging.

# flags.sourcepath.description

Path to the source directory containing Apex classes that should be instrumented with RFLIB logging statements. Test classes (ending with 'Test.cls') are automatically excluded.

# flags.dryrun.summary

Preview changes without modifying files.

# flags.dryrun.description

When enabled, shows which files would be modified without making actual changes. Useful for reviewing the impact before applying changes.

# flags.prettier.summary

Format modified files using Prettier.

# flags.prettier.description

When enabled, formats the modified Apex files using prettier-plugin-apex after adding logging statements. Maintains consistent code style with:

- 120 character line width
- 4 space indentation
- Single quotes for strings
- No tabs

# flags.no-if.summary

Exclude the instrumentation of if-else statements.

# flags.no-if.description

When provided, the command will not add log statements inside of `if` and `else` blocks.


# flags.skip-instrumented.summary

Skips any files where a logger is already present.

# flags.skip-instrumented.description

When provided, the command will not add log statements to any Apex class that contains the `rflib_Logger` reference.

# flags.verbose.summary

Enable verbose output.

# flags.verbose.description

When provided with --dryrun, prints the paths of the files that would be modified.

# examples

- Add logging statements to all Apex classes in a directory:

$ sf rflib logging apex instrument --sourcepath force-app/main/default/classes

- Preview changes without modifying files:

$ sf rflib logging apex instrument --sourcepath force-app/main/default/classes --dryrun

- Add logging statements and format code:

$ sf rflib logging apex instrument --sourcepath force-app/main/default/classes --prettier