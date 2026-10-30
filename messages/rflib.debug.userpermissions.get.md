# summary

Check Salesforce permissions for a user in the target org.

# description

Retrieves FLS (Field-Level Security), OLS (Object-Level Security), and Apex class/page permissions for a specific user
via the Salesforce REST API. Permissions are aggregated across the user's profile, permission sets, and permission set groups.

Use --sobject-type to narrow FLS or OLS results to a specific SObject.

Use --effective to get the user's combined permissions instead of the raw permission records: one entry per object with its access levels, one entry per field with read and edit (only where the user also has that access on the object), and the names of the accessible Apex classes and Visualforce pages. With --permission-type ALL, the result also lists the user's custom permissions and system permissions.

Requires the RFLIB base package to be installed in the target org and the running user to be assigned the rflib_Ops_Center_Access permission set (or have equivalent read access to the relevant permission objects).
For installation instructions, visit: https://github.com/j-fischer/rflib

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org containing the RFLIB base package.

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

# flags.effective.summary

Return the user's combined permissions instead of the raw permission records.

# flags.effective.description

Merges the permissions from the profile, permission sets, and permission set groups. Objects list their access levels (read, create, edit, delete, viewall, modifyall, viewallfields), fields list read and edit, and Apex classes, Visualforce pages, and custom permissions are listed by name. System permissions are included for --permission-type ALL. With --effective, --user-id also accepts a username.

# examples

- Check all permissions for a user:

  $ sf rflib debug userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type ALL

- Check FLS for a specific object:

  $ sf rflib debug userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type FLS --sobject-type Account

- Check Apex access:

  $ sf rflib debug userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type APEX

- Get the combined permissions of a user, including custom and system permissions:

  $ sf rflib debug userpermissions get --target-org myOrg --user-id 0057000000XXXXXX --permission-type ALL --effective
