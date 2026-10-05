# summary

Adds RFLIB logging statements to Salesforce Flows.

# description

Automatically adds RFLIB logging statements to Salesforce Flows to provide enhanced tracking and debugging capabilities. Works with both standard Flows and Auto-Launched Flows. Instruments flow invocations and decision paths with logging actions, and logs an error on the fault path of every element that can fail. Existing fault paths continue after the error is logged. Elements without a fault path get one that logs the error and then terminates the transaction, so the Flow still fails as before; this requires the Terminate Transaction option of the RFLIB Log Message action, which was added in RFLIB 11.4.0. The command checks the RFLIB version in the target org, using the installed RFLIB package or, if RFLIB was deployed as source, its RFLIB_Version custom label, and skips the fault paths if the org runs an older version, RFLIB is not found, or the version cannot be determined. Also sets the CanvasMode to AUTO_LAYOUT_CANVAS for better flow visualization while preserving the original processType.

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The Salesforce org the instrumented Flows will be deployed to. The fault paths this command creates use the Terminate Transaction option of the RFLIB Log Message action, which was added in RFLIB 11.4.0, so Flows that use it fail to deploy to an org running an older RFLIB version. Before changing any files, the command runs a read-only Tooling API query for the packages installed in this org. If RFLIB is not installed as a package, for example because it was deployed as source, a second query reads the RFLIB_Version custom label instead. If the org runs RFLIB 11.4.0 or later, fault paths are instrumented; if it runs an older version, RFLIB is not found, or a query fails, they are skipped with a warning. Nothing in the org is changed. The flag is required even with --skip-fault-paths, although the org is not queried in that case.

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

When provided, the command will not add error logging to fault paths and will not create fault paths for elements that have none, regardless of the RFLIB version installed in the target org.

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

# warning.faultPaths.rflibNotInstalled

Skipping fault path instrumentation because RFLIB was not found in the target org, neither as an installed package nor as deployed source with the %s custom label. Fault path logging requires RFLIB %s or later.

# warning.faultPaths.rflibOutdated

Skipping fault path instrumentation because the target org runs RFLIB %s. Fault path logging requires RFLIB %s or later; run "sf rflib packages upgrade" to upgrade the org.

# warning.faultPaths.rflibSourceOutdated

Skipping fault path instrumentation because the RFLIB source deployed to the target org is version %s, according to its %s custom label. Fault path logging requires RFLIB %s or later; deploy a newer version of the RFLIB source to the org.

# warning.faultPaths.versionCheckFailed

Skipping fault path instrumentation because the RFLIB version of the target org could not be determined: %s. Fault path logging requires RFLIB %s or later.

# examples

- <%= config.bin %> <%= command.id %> --target-org myOrg --sourcepath force-app
- <%= config.bin %> <%= command.id %> --target-org myOrg --sourcepath force-app --dryrun
- <%= config.bin %> <%= command.id %> --target-org myOrg --sourcepath force-app --skip-instrumented
- <%= config.bin %> <%= command.id %> --target-org myOrg --sourcepath force-app --skip-fault-paths

