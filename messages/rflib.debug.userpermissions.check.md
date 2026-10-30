# summary

Check whether a user has a specific permission, and where it comes from.

# description

Answers questions such as "Can this user edit Account.AnnualRevenue?" or "Does this user have Modify All Data?". The command checks the user's profile, permission sets, and permission set groups, and returns whether the permission is granted and which of them grant it.

Check exactly one of the following:
  - An object permission (--object, with --access read, create, edit, delete, viewall, modifyall, or viewallfields)
  - A field permission (--field, with --access read or edit)
  - Access to an Apex class (--apex-class) or a Visualforce page (--apex-page)
  - A custom permission (--custom-permission)
  - A system permission (--system-permission), e.g. ModifyAllData or ViewSetup

Field checks take the object permissions into account: a field is only accessible when the user also has Read (or Edit) on the object. View All Fields on the object grants Read on all of its fields. Apex class and Visualforce page checks include access granted by the Author Apex and Customize Application system permissions.

Sharing and record-level access aren't checked.

The command only reads standard setup objects, so the RFLIB package doesn't need to be installed. The running user needs the View Setup and Configuration permission.

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org to check the permission in.

# flags.user.summary

User ID (15 or 18 characters) or username of the user to check.

# flags.user.description

The Salesforce User ID (15 or 18 characters) or the username of the user whose permission should be checked.

# flags.object.summary

API name of the object to check object permissions for, e.g. Account.

# flags.object.description

Checks an object permission. Use --access to choose which one; the default is read.

# flags.field.summary

Field to check field-level security for, in the form Object.Field, e.g. Account.AnnualRevenue.

# flags.field.description

Checks field-level security for a field. Use --access read (default) or --access edit.

# flags.access.summary

Access level to check for --object or --field. Default: read.

# flags.access.description

The access level to check:
  - read, edit: for objects and fields
  - create, delete, viewall (View All Records), modifyall (Modify All Records), viewallfields (View All Fields): for objects only

# flags.apex-class.summary

Name of the Apex class to check access for.

# flags.apex-class.description

Checks whether the user can access an Apex class. Use namespace__Name or namespace.Name for a class in a managed package.

# flags.apex-page.summary

Name of the Visualforce page to check access for.

# flags.apex-page.description

Checks whether the user can access a Visualforce page. Use namespace__Name for a page in a managed package.

# flags.custom-permission.summary

API name of the custom permission to check.

# flags.custom-permission.description

Checks whether the user has a custom permission. Use namespace__Name for a custom permission in a managed package.

# flags.system-permission.summary

API name of the system permission to check, e.g. ModifyAllData or ViewSetup.

# flags.system-permission.description

Checks a system (user) permission. Use the name of the permission field on the PermissionSet object, with or without the "Permissions" prefix, e.g. ModifyAllData, ViewAllData, ApiEnabled, or PermissionsAuthorApex.

# info.granted

GRANTED: %s

# info.notGranted

NOT GRANTED: %s

# info.sources

Granted by:

# info.source

%s "%s" (%s)

# info.note

Note: %s

# examples

- Check whether a user can edit a field:

  $ sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --field Account.AnnualRevenue --access edit

- Check whether a user can delete Opportunity records:

  $ sf rflib debug userpermissions check --target-org myOrg --user 0057000000XXXXXX --object Opportunity --access delete

- Check access to an Apex class:

  $ sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --apex-class OrderController

- Check a custom permission:

  $ sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --custom-permission Approve_Discounts

- Check a system permission:

  $ sf rflib debug userpermissions check --target-org myOrg --user jane@example.com --system-permission ModifyAllData
