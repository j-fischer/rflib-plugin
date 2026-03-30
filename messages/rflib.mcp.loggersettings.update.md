# summary

Create or update an RFLIB Logger Setting in a Salesforce org via the RFLIB MCP server.

# description

Creates or updates a single field on an rflib_Logger_Settings__c record in the target org by invoking the rflib_update_logger_setting MCP tool.
Validates field values and warns about best-practice violations.

To update an existing record, provide --record-id. To create a new record, provide --setup-owner-id with an org ID (00D...), profile ID (00E...), or user ID.

Requires the RFLIB MCP package to be installed in the target org and the running user to have the rflib_MCP_Access permission set.
For installation instructions, visit: https://github.com/j-fischer/rflib

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org containing the RFLIB MCP package.

# flags.field-name.summary

API name of the rflib_Logger_Settings__c field to update.

# flags.field-name.description

The API name of the field to create or update, e.g. Log_Event_Reporting_Level__c. For log level fields, valid values are: TRACE, DEBUG, INFO, WARN, ERROR, FATAL, NONE.

# flags.field-value.summary

New value for the specified field.

# flags.field-value.description

The new value to set on the specified field. For log level fields, valid values are: TRACE, DEBUG, INFO, WARN, ERROR, FATAL, NONE.

# flags.record-id.summary

ID of an existing rflib_Logger_Settings__c record to update.

# flags.record-id.description

The Salesforce record ID of an existing rflib_Logger_Settings__c record to update. Omit this flag to create a new record (requires --setup-owner-id).

# flags.setup-owner-id.summary

Setup owner ID for creating a new Logger Setting record.

# flags.setup-owner-id.description

Required when creating a new Logger Setting record. Accepts an org ID (00D...), profile ID (00E...), or user ID. Read existing record IDs using "sf rflib mcp loggersettings get".

# examples

- Update the Log_Event_Reporting_Level__c field on an existing record:

  $ sf rflib mcp loggersettings update --target-org myOrg --record-id a0A000000001234 --field-name Log_Event_Reporting_Level__c --field-value WARN

- Create a new org-wide Logger Setting:

  $ sf rflib mcp loggersettings update --target-org myOrg --setup-owner-id 00D000000000001 --field-name Log_Event_Reporting_Level__c --field-value WARN
