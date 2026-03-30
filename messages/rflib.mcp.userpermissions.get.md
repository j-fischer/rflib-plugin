# summary

Check Salesforce permissions for a user in the target org via the RFLIB MCP server.

# description

Retrieves FLS (Field-Level Security), OLS (Object-Level Security), and Apex class/page permissions for a specific user
by invoking the rflib_get_user_permissions MCP tool. Permissions are aggregated across the user's profile, permission sets,
and permission set groups.

Use --sobject-type to narrow FLS or OLS results to a specific SObject.

Requires the RFLIB MCP package to be installed in the target org and the running user to have the rflib_MCP_Access permission set.
For installation instructions, visit: https://github.com/j-fischer/rflib

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org containing the RFLIB MCP package.

# flags.user-id.summary

Salesforce User ID (15 or 18 character) to check permissions for.

# flags.user-id.description

The Salesforce User ID (15 or 18 characters) of the user whose permissions should be retrieved.

# flags.permission-type.summary

Type of permissions to retrieve: FLS, OLS, APEX, or ALL.

# flags.permission-type.description

Controls which permission types are returned:
  - FLS: Field-Level Security only
  - OLS: Object-Level Security only
  - APEX: Apex class and page access only
  - ALL: All three permission types

# flags.sobject-type.summary

Optional SObject API name to filter FLS or OLS results.

# flags.sobject-type.description

Filters Field-Level Security or Object-Level Security results to a specific SObject type, e.g. Account, Contact, Opportunity.

# examples

- Check all permissions for a user:

  $ sf rflib mcp userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type ALL

- Check FLS for a specific object:

  $ sf rflib mcp userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type FLS --sobject-type Account

- Check Apex access:

  $ sf rflib mcp userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type APEX
