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

# Get the combined permissions of a user, including custom and system permissions
sf rflib debug userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type ALL --effective
```

By default, the command returns the raw permission records of each profile, permission set, and permission set group. With `--effective`, it merges them into the user's combined permissions instead:

```json
{
  "objects": { "Account": ["read", "create", "edit", "delete"] },
  "fields": { "Account.AnnualRevenue": ["read", "edit"] },
  "apexClasses": ["OrderController", "rflib__Logger"],
  "apexPages": [],
  "customPermissions": ["Approve_Discounts"],
  "systemPermissions": ["ApiEnabled", "ViewSetup"]
}
```

Field access is only listed where the user also has that access on the object. Fields without field-level security, such as `Id` or required fields, aren't listed because they follow the object permission. Custom and system permissions are only included for `--permission-type ALL`. With `--effective`, `--user-id` also accepts a username.

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--user-id (-u)`: Salesforce User ID (15 or 18 character) *(required)*
- `--permission-type (-t)`: Type of permissions: `FLS`, `OLS`, `APEX`, or `ALL` *(required)*
- `--sobject-type (-b)`: Optional SObject API name to filter FLS or OLS results (e.g. `Account`)
- `--effective (-e)`: Return the combined permissions instead of the raw permission records

---

### `sf rflib debug userpermissions check`

Check whether a user has one specific permission, and which profile, permission sets, and permission set groups grant it. Where `userpermissions get` returns the raw permission records, `check` answers a single question with a verdict, which makes it a good fit for scripts and AI agents.

```bash
# Can the user edit a field?
sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --field Account.AnnualRevenue --access edit

# Can the user delete Opportunity records?
sf rflib debug userpermissions check --target-org myOrg --user 0057000000XXXXXX --object Opportunity --access delete

# Apex class, Visualforce page, custom permission, and system permission access
sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --apex-class OrderController
sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --apex-page OrderPage
sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --custom-permission Approve_Discounts
sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --system-permission ModifyAllData
```

Example output:

```text
NOT GRANTED: jane@example.com doesn't have Edit access on Account.AnnualRevenue.
Granted by:
  Permission Set "Sales Reports" (PermissionsEdit)
Note: The user has field-level access, but no Edit permission on Account, so the field isn't accessible.
```

With `--json`, the result contains `granted`, a one-line `summary`, the granting `sources`, and `notes`. Field checks also return `fieldPermissionGranted` and the user's Read and Edit access on the object (`objectAccess`).

The check follows the Salesforce permission rules:

- A field is only accessible when the user also has the matching permission on the object. View All Fields on the object grants Read on all of its fields. Fields without field-level security (such as `Id` or `Name`) follow the object permission, and formula and auto-number fields can't be edited.
- Access to Apex classes and Visualforce pages includes access granted by the Author Apex and Customize Application system permissions.
- Inactive users are reported in the notes.
- Sharing and record-level access aren't checked.

The command only reads standard setup objects, so the RFLIB package doesn't need to be installed. The running user needs the View Setup and Configuration permission.

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--user (-u)`: User ID (15 or 18 character) or username *(required)*
- Exactly one of:
  - `--object (-b)`: Object API name, e.g. `Account`
  - `--field (-f)`: Field in the form `Object.Field`, e.g. `Account.AnnualRevenue`
  - `--apex-class`: Apex class name; use `namespace__Name` or `namespace.Name` for managed classes
  - `--apex-page`: Visualforce page name; use `namespace__Name` for managed pages
  - `--custom-permission`: Custom permission API name
  - `--system-permission`: System permission API name, e.g. `ModifyAllData`, `ViewSetup`, `ApiEnabled`
- `--access (-a)`: Access level for `--object` or `--field` (default: `read`). Objects: `read`, `create`, `edit`, `delete`, `viewall`, `modifyall`, `viewallfields`. Fields: `read`, `edit`.

---

### `sf rflib debug userpermissions whohas`

The reverse of `userpermissions check`: find the users who have a specific permission, and the profiles, permission sets, and permission set groups that grant it.

```bash
# Who can edit a field?
sf rflib debug userpermissions whohas --target-org myOrg --field Account.AnnualRevenue --access edit

# Who has Modify All Data?
sf rflib debug userpermissions whohas --target-org myOrg --system-permission ModifyAllData

# Who can access an Apex class, including inactive users?
sf rflib debug userpermissions whohas --target-org myOrg --apex-class OrderController --include-inactive
```

The same permission rules as `userpermissions check` apply. For example, a field check only includes users who also have the matching access on the object, and an Apex class check includes users with Author Apex. The result lists the granting sources with the number of matching users for each, and the users with the sources that give them the access. Sources that grant the access but have no matching users are only counted (`unassignedSourceCount`).

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- Exactly one of `--object (-b)`, `--field (-f)`, `--apex-class`, `--apex-page`, `--custom-permission`, or `--system-permission`, as for `userpermissions check`
- `--access (-a)`: Access level for `--object` or `--field` (default: `read`)
- `--include-inactive`: Include inactive users (default: only active users)
- `--user-limit (-l)`: Maximum number of users to return, 1–2000 (default: 200). The total is always returned in `userCount`.

---

### `sf rflib debug userpermissions compare`

Compare the permissions of two users and show only the differences, for example to find out why something works for one user but not for another.

```bash
# Compare all permissions
sf rflib debug userpermissions compare --target-org myOrg --user jane@example.com --other-user bob@example.com

# Compare object and field access on Account
sf rflib debug userpermissions compare --target-org myOrg --user jane@example.com --other-user bob@example.com --permission-type FLS --sobject-type Account
```

Example output:

```text
Comparing jane@example.com with bob@example.com
Objects:
  Account: only bob@example.com has delete, viewall
Fields:
  Account.AnnualRevenue: only bob@example.com has edit
System permissions:
  only bob@example.com has ModifyAllData
```

The comparison uses the same combined permissions as `userpermissions get --effective`. In large orgs, use `--sobject-type` to keep the field comparison below the query row limit.

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--user (-u)`: User ID or username of the first user *(required)*
- `--other-user (-w)`: User ID or username of the second user *(required)*
- `--permission-type (-t)`: `FLS`, `OLS`, `APEX`, or `ALL` (default: `ALL`, which also compares custom and system permissions)
- `--sobject-type (-b)`: Optional SObject API name to limit the object and field comparison to

---

### `sf rflib debug recordaccess get`

Check a user's access to specific records, including sharing (org-wide defaults, role hierarchy, sharing rules, teams, and manual shares), with `UserRecordAccess`.

```bash
sf rflib debug recordaccess get --target-org myOrg --user jane@example.com --record-id 001XXXXXXXXXXXXXXX --record-id 006XXXXXXXXXXXXXXX
```

For each record, the result contains the read, edit, delete, transfer, and full access flags, the highest access level, and the user's object permissions on the record's object. The notes tell apart missing object permissions from missing sharing, for example:

```text
001XXXXXXXXXXXXXXX: The user has Read on Account, but sharing doesn't give them access to this record. Check the org-wide default, role hierarchy, sharing rules, teams, and manual shares.
```

#### Command Options

- `--target-org (-o)`: Username or alias of the target org *(required)*
- `--user (-u)`: User ID or username *(required)*
- `--record-id (-r)`: ID of a record to check; specify up to 200 times *(required)*

---

## RFLIB Package Commands

### `sf rflib packages upgrade`

Compare the RFLIB packages installed in the target org (RFLIB, RFLIB-FS, RFLIB-TF, RFLIB-PHAROS) with the latest versions published in the [RFLIB repository](https://github.com/j-fischer/rflib), and upgrade them.

The latest versions are looked up in the repository's `sfdx-project.json` every time the command runs, so no version numbers are built into the plugin. For every installed package with a newer version, the command asks whether to install the upgrade and, if confirmed, starts the installation in the org. Upgrades are installed one at a time in dependency order (RFLIB first); if an installation fails or is still running when the wait time elapses, the remaining upgrades are skipped.

Packages that aren't installed in the org are only reported. The command never installs a package that isn't already present.

#### Only released versions are offered

A new package version is added to `sfdx-project.json` when it is created, but it is only promoted to a released version later, after it has passed the release tests. Salesforce doesn't install beta versions in production orgs, and a beta version installed in a sandbox can't be upgraded later.

The command therefore asks Salesforce for the release state of each version (a read-only Tooling API query of `SubscriberPackageVersion.ReleaseState` in the target org) and only offers released versions. If the newest version of a package isn't released yet, the command falls back to the newest released version and reports the skipped versions, for example:

```text
RFLIB: skipped version(s) 11.5.0-1 because they aren't released yet. The latest released version is 11.4.0-1.
```

With `--json`, skipped versions are listed in the `unreleasedVersions` property of the package. A package without any released version has the status `NoReleasedVersion` and is never upgraded. If the release state can't be checked, the command stops before installing anything.

Salesforce is used as the source of truth because promotion is what releases a version. The release tags in the RFLIB repository (for example `RFLIB_v11.4.0`) are only created after the promotion, don't include the build number, and checking them would need GitHub API calls, which are rate limited.

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
