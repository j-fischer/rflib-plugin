# RFLIB Plugin for Salesforce CLI

[![NPM](https://img.shields.io/npm/v/rflib-plugin.svg?label=rflib-plugin)](https://www.npmjs.com/package/rflib-plugin) [![Downloads/week](https://img.shields.io/npm/dw/rflib-plugin.svg)](https://npmjs.org/package/rflib-plugin) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/salesforcecli/rflib-plugin/main/LICENSE)

Plugin for Salesforce CLI to help with the adoption of [RFLIB](https://github.com/j-fischer/rflib) - an open-source logging framework for Salesforce.

## Features

- Automatically instruments Apex classes with RFLIB logging statements
- Automatically instruments LWC components with RFLIB logging statements
- Automatically instruments Aura components with RFLIB logging statements
- Automatically instruments Salesforce Flows with RFLIB logging actions
- Debug commands that read RFLIB log archives, application events, and logger settings, and tune logger settings — useful as a tool surface for AI agents driving a debugging session

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
sf rflib logging flow instrument --sourcepath force-app

# Preview changes without modifying files
sf rflib logging flow instrument --sourcepath force-app --dryrun

# Skip instrumenting flows where logging is already present
sf rflib logging flow instrument --sourcepath force-app --skip-instrumented
```

#### Command Options

- `--sourcepath (-s)`: Directory containing Flow files to instrument
- `--dryrun (-d)`: Preview changes without modifying files
- `--skip-instrumented`: Do not instrument files where RFLIB logging is already present
- `--verbose (-v)`: Print paths of the files that would be modified (useful with --dryrun)
- `--exclude (-e)`: Exclude files or directories from instrumentation based on a glob pattern

#### Features

- Adds logging for flow invocation at the start of the flow
- Adds logging for decision paths to track which branch is executed
- Sets the flow's CanvasMode to AUTO_LAYOUT_CANVAS for better visualization in Flow Builder
- Preserves the original processType value
- Handles both free-form and auto-layout flows, converting all to auto-layout
- Supports both standard Flows (processType="Flow") and Auto-Launched Flows (processType="AutoLaunchedFlow")

## RFLIB Debug Commands

These commands query and tune RFLIB-instrumented data directly via the Salesforce REST API. The only prerequisite is that the [RFLIB](https://github.com/j-fischer/rflib) package is installed in the target org and the running user has read access to `rflib_Logs_Archive__b`, `rflib_Application_Event__c`, and `rflib_Logger_Settings__c` (plus update access on the Logger Settings if you intend to use the `update` command).

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Learn More

- [RFLIB Documentation](https://github.com/j-fischer/rflib)
- [Salesforce CLI Plugin Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_plugins.meta/sfdx_cli_plugins/cli_plugins_architecture_sf_cli.htm)
