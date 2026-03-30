# summary

Read all RFLIB Logger Settings from a Salesforce org via the RFLIB MCP server.

# description

Retrieves all rflib_Logger_Settings__c hierarchy custom setting records from the target org by invoking the rflib_get_logger_settings MCP tool.
Returns settings across org-wide defaults, profile overrides, and user overrides, along with embedded best-practice recommendations.

Use "sf rflib mcp loggersettings update" to apply changes.

Requires the RFLIB MCP package to be installed in the target org and the running user to have the rflib_MCP_Access permission set.
For installation instructions, visit: https://github.com/j-fischer/rflib

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org containing the RFLIB MCP package.

# examples

- Read all logger settings from the target org:

  $ sf rflib mcp loggersettings get --target-org myOrg
