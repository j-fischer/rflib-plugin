# summary

Query RFLIB log archives from a Salesforce org via the RFLIB MCP server.

# description

Retrieves rflib_Logs_Archive__b records from the target org's big object store by invoking the rflib_query_log_archives MCP tool.
Each log record contains log level, context, request ID, and full log messages in the format: [timestamp]|[LEVEL]|[TRACE_ID]|[CONTEXT]|[MESSAGE].

Requires the RFLIB MCP package to be installed in the target org and the running user to have the rflib_MCP_Access permission set.
For installation instructions, visit: https://github.com/j-fischer/rflib

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org containing the RFLIB MCP package.

# flags.start-date.summary

Start of the date range in ISO 8601 format. Defaults to 24 hours ago.

# flags.start-date.description

Only return log archives created on or after this date. Must be in ISO 8601 format, e.g. 2024-01-01T00:00:00Z. Defaults to 24 hours ago if omitted.

# flags.end-date.summary

End of the date range in ISO 8601 format. Defaults to now.

# flags.end-date.description

Only return log archives created on or before this date. Must be in ISO 8601 format, e.g. 2024-12-31T23:59:59Z. Defaults to the current time if omitted.

# examples

- Get log archives from the last 24 hours:

  $ sf rflib mcp logarchives get --target-org myOrg

- Get log archives for a specific date range:

  $ sf rflib mcp logarchives get --target-org myOrg --start-date 2024-01-01T00:00:00Z --end-date 2024-01-02T00:00:00Z
