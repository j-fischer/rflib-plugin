# summary

Read all RFLIB Logger Settings from a Salesforce org.

# description

Retrieves all rflib_Logger_Settings__c hierarchy custom setting records from the target org via the Salesforce REST API.
Returns settings across org-wide defaults, profile overrides, and user overrides, along with embedded best-practice recommendations.

Use "sf rflib debug loggersettings update" to apply changes.

Requires the RFLIB base package to be installed in the target org and the running user to have read access to rflib_Logger_Settings__c.
For installation instructions, visit: https://github.com/j-fischer/rflib

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org containing the RFLIB base package.

# examples

- Read all logger settings from the target org:

  $ sf rflib debug loggersettings get --target-org myOrg
