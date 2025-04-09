# RFLIB Plugin for Salesforce CLI

[![NPM](https://img.shields.io/npm/v/rflib-plugin.svg?label=rflib-plugin)](https://www.npmjs.com/package/rflib-plugin) [![Downloads/week](https://img.shields.io/npm/dw/rflib-plugin.svg)](https://npmjs.org/package/rflib-plugin) [![License](https://img.shields.io/badge/License-BSD%203--Clause-brightgreen.svg)](https://raw.githubusercontent.com/salesforcecli/rflib-plugin/main/LICENSE)

Plugin for Salesforce CLI to help with the adoption of [RFLIB](https://github.com/j-fischer/rflib) - an open-source logging framework for Salesforce.

## Features

- Automatically instruments Apex classes with RFLIB logging statements
- Automatically instruments LWC components with RFLIB logging statements
- Automatically instruments Aura components with RFLIB logging statements
- Automatically instruments Salesforce Flows with RFLIB logging actions

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

### `sf rflib logging flow instrument`

Adds RFLIB logging actions to Salesforce Flows.

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

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Learn More

- [RFLIB Documentation](https://github.com/j-fischer/rflib)
- [Salesforce CLI Plugin Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_plugins.meta/sfdx_cli_plugins/cli_plugins_architecture_sf_cli.htm)
