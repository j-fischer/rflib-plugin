# RFLIB Plugin for Salesforce CLI

[![NPM](https://img.shields.io/npm/v/rflib-plugin.svg?label=rflib-plugin)](https://www.npmjs.com/package/rflib-plugin) [![Downloads/week](https://img.shields.io/npm/dw/rflib-plugin.svg)](https://npmjs.org/package/rflib-plugin) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/salesforcecli/rflib-plugin/main/LICENSE)

Plugin for Salesforce CLI to help with the adoption of [RFLIB](https://github.com/j-fischer/rflib) - an open-source logging framework for Salesforce.

## Features

- Automatically instruments Apex classes with RFLIB logging statements
- Automatically instruments LWC components with RFLIB logging statements
- Automatically instruments Aura components with RFLIB logging statements
- Automatically instruments Salesforce Flows with RFLIB logging actions
- Debug commands that read RFLIB log archives, application events, and logger settings, and tune logger settings — useful as a tool surface for AI agents driving a debugging session
- Checks the RFLIB packages installed in an org against the latest versions in the RFLIB repository and installs the upgrades you confirm

## Installation

```bash
sf plugins install rflib-plugin
```

## Commands

### `sf rflib logging apex instrument`

Adds RFLIB logging statements to Apex classes.

```bash
# Add logging to all classes in a directory
sf rflib logging apex instrument --sourcepath force-app

# Preview changes without modifying files
sf rflib logging apex instrument --sourcepath force-app --dryrun

# Format modified files with Prettier
sf rflib logging apex instrument --sourcepath force-app --prettier

# Skip instrumenting files where logging is already present
sf rflib logging apex instrument --sourcepath force-app --skip-instrumented
```

#### Command Options

- `--sourcepath (-s)`: Directory containing Apex classes to instrument
- `--dryrun (-d)`: Preview changes without modifying files
- `--prettier (-p)`: Format modified files using Prettier
- `--skip-instrumented`: Do not instrument files where RFLIB logging is already present
- `--verbose (-v)`: Print paths of the files that would be modified (useful with --dryrun)
- `--exclude (-e)`: Exclude files or directories from instrumentation based on a glob pattern

### `sf rflib logging lwc instrument`

Adds RFLIB logging statements to Lightning Web Components.

```bash
# Add logging to all LWC files
sf rflib logging lwc instrument --sourcepath force-app

# Preview changes without modifying files
sf rflib logging lwc instrument --sourcepath force-app --dryrun

# Add logging and format code
sf rflib logging lwc instrument --sourcepath force-app --prettier

# Skip instrumenting files where logging is already present
sf rflib logging lwc instrument --sourcepath force-app --skip-instrumented
```

#### Command Options

- `--sourcepath (-s)`: Directory containing LWC components to instrument
- `--dryrun (-d)`: Preview changes without modifying files
- `--prettier (-p)`: Format modified files using Prettier
- `--skip-instrumented`: Do not instrument files where RFLIB logging is already present
- `--verbose (-v)`: Print paths of the files that would be modified (useful with --dryrun)
- `--exclude (-e)`: Exclude files or directories from instrumentation based on a glob pattern

### `sf rflib logging aura instrument`

Adds RFLIB logging statements to Aura Components.

```bash
# Add logging to all Aura component files
sf rflib logging aura instrument --sourcepath force-app

# Preview changes without modifying files
sf rflib logging aura instrument --sourcepath force-app --dryrun

# Add logging and format code
sf rflib logging aura instrument --sourcepath force-app --prettier

# Skip instrumenting files where logging is already present
sf rflib logging aura instrument --sourcepath force-app --skip-instrumented
```

#### Command Options

- `--sourcepath (-s)`: Directory containing Aura components to instrument
- `--dryrun (-d)`: Preview changes without modifying files
- `--prettier (-p)`: Format modified files using Prettier
- `--skip-instrumented`: Do not instrument files where RFLIB logging is already present
- `--verbose (-v)`: Print paths of the files that would be modified (useful with --dryrun)
- `--exclude (-e)`: Exclude files or directories from instrumentation based on a glob pattern

### `sf rflib logging flow instrument`

Adds RFLIB logging actions to Salesforce Flows and optimizes flow layout.

```bash
# Add logging to all Flow files
sf rflib logging flow instrument --target-org myOrg --sourcepath force-app

# Preview changes without modifying files
sf rflib logging flow instrument --target-org myOrg --sourcepath force-app --dryrun

# Skip instrumenting flows where logging is already present
sf rflib logging flow instrument --target-org myOrg --sourcepath force-app --skip-instrumented

# Do not add error logging to fault paths
sf rflib logging flow instrument --target-org myOrg --sourcepath force-app --skip-fault-paths
```

#### Command Options

- `--target-org (-o)`: Username or alias of the org the Flows will be deployed to. Its RFLIB version decides whether fault paths are instrumented, see [Why `--target-org` is required](#why---target-org-is-required) *(required)*
- `--sourcepath (-s)`: Directory containing Flow files to instrument
- `--dryrun (-d)`: Preview changes without modifying files
- `--skip-instrumented`: Do not instrument files where RFLIB logging is already present
- `--skip-fault-paths`: Do not add error logging to fault paths or create fault paths for elements without one, regardless of the RFLIB version in the target org
- `--verbose (-v)`: Print paths of the files that would be modified (useful with --dryrun)
- `--exclude (-e)`: Exclude files or directories from instrumentation based on a glob pattern

#### Why `--target-org` is required

The fault paths this command creates log the error and then stop the Flow using the `Terminate Transaction` option of the RFLIB `Log Message` action. That option was added in RFLIB 11.4.0, so a Flow that uses it fails to deploy to an org running an older RFLIB version.

To avoid producing Flows that won't deploy, the command checks the RFLIB package installed in the target org before it changes any files:

- **RFLIB 11.4.0 or later:** fault paths are instrumented.
- **An older RFLIB version, or RFLIB not installed as a package** (for example, deployed as unpackaged source): fault paths are skipped and a warning is shown. Flow start and decision logging are still added. Run `sf rflib packages upgrade` to upgrade the org.

The check is a single read-only Tooling API query of the org's installed packages (`InstalledSubscriberPackage`). The command doesn't change or deploy anything to the org; it only edits the Flow files under `--sourcepath`. Pass the org you'll deploy the instrumented Flows to. The flag is required even with `--skip-fault-paths`, although the org isn't queried in that case.

#### Features

- Adds logging for flow invocation at the start of the flow
- Adds logging for decision paths to track which branch is executed
- Logs an `ERROR` on the fault path of every element that can fail (Actions, Apex Plugins, Create/Delete/Get/Update Records, and Waits). The message names the failing element and includes `{!$Flow.FaultMessage}`, the values the element used as input, the triggering record ID, and the flow's input variables
  - If the element already has a fault path, the log action is inserted as its first step and the existing path continues as before
  - If the element has no fault path, one is created that logs the error and then terminates the transaction using the `Terminate Transaction` option of the RFLIB `Log Message` action. The Flow still fails, rolls back, and shows the error just like an unhandled fault, so its behavior does not change
  - Requires RFLIB 11.4.0 or later in the target org. Otherwise fault paths are skipped with a warning, see [Why `--target-org` is required](#why---target-org-is-required)
- Sets the flow's CanvasMode to AUTO_LAYOUT_CANVAS for better visualization in Flow Builder
- Preserves the original processType value
- Handles both free-form and auto-layout flows, converting all to auto-layout
- Supports both standard Flows (processType="Flow") and Auto-Launched Flows (processType="AutoLaunchedFlow")

## RFLIB Debug Commands

These commands query and tune RFLIB-instrumented data directly via the Salesforce REST API. The only prerequisite is that the [RFLIB](https://github.com/j-fischer/rflib) package is installed in the target org and the running user is assigned the `rflib_Ops_Center_Access` permission set (or has equivalent read access to `rflib_Logs_Archive__b`, `rflib_Application_Event__c`, and `rflib_Logger_Settings__c`, plus update access on Logger Settings to use the `update` command).

These commands are designed to be invoked by an LLM agent (via a Claude skill or equivalent) to drive a debugging session: trigger code in the org, then read the resulting logs and adjust verbosity as needed.

### `sf rflib debug applicationevents get`

Query RFLIB Application Events from a Salesforce org.

```bash
# Get all recent application events
sf rflib debug applicationevents get --target-org myOrg

# Filter by event name with wildcard
sf rflib debug applicationevents get --target-org myOrg --event-name "order-%"

# Filter by date range
sf rflib debug applicationevents get --target-org myOrg --start-date 2024-01-01T00:00:00Z --end-date 2024-12-31T23:59:59Z

# Filter by related record and limit results
sf rflib debug applicationevents get --target-org myOrg --related-record-id 001abc --record-limit 50
```

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--event-name (-e)`: Filter by Event_Name__c. Use `%` as a wildcard
- `--start-date (-s)`: Filter events on or after this ISO 8601 datetime
- `--end-date (-d)`: Filter events on or before this ISO 8601 datetime
- `--related-record-id (-r)`: Filter by Related_Record_ID__c (exact match)
- `--record-limit (-l)`: Maximum number of records to return (default 200, max 2000)

---

### `sf rflib debug logarchives get`

Query RFLIB log archives from the `rflib_Logs_Archive__b` big object.

```bash
# Get log archives from the last 24 hours
sf rflib debug logarchives get --target-org myOrg

# Get archives for a specific date range
sf rflib debug logarchives get --target-org myOrg --start-date 2024-01-01T00:00:00Z --end-date 2024-01-02T00:00:00Z
```

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--start-date (-s)`: Start of date range in ISO 8601 format (defaults to 24 hours ago)
- `--end-date (-d)`: End of date range in ISO 8601 format (defaults to now)

---

### `sf rflib debug loggersettings get`

Read all RFLIB Logger Settings from the target org.

```bash
sf rflib debug loggersettings get --target-org myOrg
```

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*

---

### `sf rflib debug loggersettings update`

Create or update an RFLIB Logger Setting in the target org.

```bash
# Update an existing setting record
sf rflib debug loggersettings update --target-org myOrg --record-id a01abc --field-name Log_Event_Reporting_Level__c --field-value WARN

# Create a new org-wide setting
sf rflib debug loggersettings update --target-org myOrg --setup-owner-id 00D000000000001 --field-name Log_Event_Reporting_Level__c --field-value WARN
```

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--field-name (-f)`: API name of the field to update, e.g. `Log_Event_Reporting_Level__c` *(required)*
- `--field-value (-v)`: New value for the field (e.g. TRACE, DEBUG, INFO, WARN, ERROR, FATAL, NONE) *(required)*
- `--record-id (-r)`: ID of an existing `rflib_Logger_Settings__c` record to update
- `--setup-owner-id (-s)`: Org ID, Profile ID, or User ID for creating a new setting record

---

### `sf rflib debug userpermissions get`

Check Salesforce user permissions (FLS, OLS, Apex access) aggregated across profile, permission sets, and permission set groups.

```bash
# Check all permissions for a user
sf rflib debug userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type ALL

# Check FLS for a specific SObject
sf rflib debug userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type FLS --sobject-type Account

# Check Apex class/page access
sf rflib debug userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type APEX
```

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--user-id (-u)`: Salesforce User ID (15 or 18 character) *(required)*
- `--permission-type (-t)`: Type of permissions: `FLS`, `OLS`, `APEX`, or `ALL` *(required)*
- `--sobject-type (-b)`: Optional SObject API name to filter FLS or OLS results (e.g. `Account`)

---

## RFLIB Package Commands

### `sf rflib packages upgrade`

Compare the RFLIB packages installed in the target org (RFLIB, RFLIB-FS, RFLIB-TF, RFLIB-PHAROS) with the latest versions published in the [RFLIB repository](https://github.com/j-fischer/rflib), and upgrade them.

The latest versions are looked up in the repository's `sfdx-project.json` every time the command runs, so no version numbers are built into the plugin. For every installed package with a newer version, the command asks whether to install the upgrade and, if confirmed, starts the installation in the org. Upgrades are installed one at a time in dependency order (RFLIB first); if an installation fails or is still running when the wait time elapses, the remaining upgrades are skipped.

Packages that aren't installed in the org are only reported. The command never installs a package that isn't already present.

```bash
# Check the installed packages and choose which upgrades to install
sf rflib packages upgrade --target-org myOrg

# Only report the available upgrades
sf rflib packages upgrade --target-org myOrg --dryrun

# Install all available upgrades without prompting, waiting up to 60 minutes per installation
sf rflib packages upgrade --target-org myOrg --no-prompt --wait 60
```

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--dryrun (-d)`: Report the available upgrades without installing them
- `--no-prompt (-r)`: Install all available upgrades without asking for confirmation. Required to install upgrades when using `--json`
- `--wait (-w)`: Minutes to wait for each installation to complete (default 30)

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Learn More

- [RFLIB Documentation](https://github.com/j-fischer/rflib)
- [Salesforce CLI Plugin Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_plugins.meta/sfdx_cli_plugins/cli_plugins_architecture_sf_cli.htm)
