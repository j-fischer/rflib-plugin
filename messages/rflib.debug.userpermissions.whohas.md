# summary

Find the users who have a specific permission, and what grants it.

# description

The reverse of userpermissions check. Answers questions such as "Who can edit Account.AnnualRevenue?" or "Who has Modify All Data?". The command finds every profile, permission set, and permission set group that grants the permission, and the users who are assigned to them.

Check exactly one of the following:
  - An object permission (--object, with --access read, create, edit, delete, viewall, modifyall, or viewallfields)
  - A field permission (--field, with --access read or edit)
  - Access to an Apex class (--apex-class) or a Visualforce page (--apex-page)
  - A custom permission (--custom-permission)
  - A system permission (--system-permission), e.g. ModifyAllData or ViewSetup

The same permission rules as userpermissions check apply: for field checks, only users who also have the matching access on the object are included, and View All Fields grants Read on all fields. Apex class and Visualforce page checks include access granted by the Author Apex and Customize Application system permissions.

Inactive users are excluded unless you specify --include-inactive. The result lists up to --user-limit users; the total count is always returned.

The command only reads standard setup objects, so the RFLIB package doesn't need to be installed. The running user needs the View Setup and Configuration permission.

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org to search.

# flags.object.summary

API name of the object to check object permissions for, e.g. Account.

# flags.object.description

Finds users with an object permission. Use --access to choose which one; the default is read.

# flags.field.summary

Field to check field-level security for, in the form Object.Field, e.g. Account.AnnualRevenue.

# flags.field.description

Finds users with access to a field. Use --access read (default) or --access edit.

# flags.access.summary

Access level to check for --object or --field. Default: read.

# flags.access.description

The access level to check:
  - read, edit: for objects and fields
  - create, delete, viewall (View All Records), modifyall (Modify All Records), viewallfields (View All Fields): for objects only

# flags.apex-class.summary

Name of the Apex class to check access for.

# flags.apex-class.description

Finds users who can access an Apex class. Use namespace__Name or namespace.Name for a class in a managed package.

# flags.apex-page.summary

Name of the Visualforce page to check access for.

# flags.apex-page.description

Finds users who can access a Visualforce page. Use namespace__Name for a page in a managed package.

# flags.custom-permission.summary

API name of the custom permission to check.

# flags.custom-permission.description

Finds users who have a custom permission. Use namespace__Name for a custom permission in a managed package.

# flags.system-permission.summary

API name of the system permission to check, e.g. ModifyAllData or ViewSetup.

# flags.system-permission.description

Finds users who have a system (user) permission. Use the name of the permission field on the PermissionSet object, with or without the "Permissions" prefix.

# flags.include-inactive.summary

Include inactive users.

# flags.include-inactive.description

By default, only active users are returned. Specify this flag to include inactive users as well.

# flags.user-limit.summary

Maximum number of users to return. Default: 200, maximum: 2000.

# flags.user-limit.description

Limits the number of users in the result. The total number of matching users is always returned in userCount.

# info.sources

Granted by:

# info.users

Users:

# info.usersTruncated

Showing %s of %s users. Use --user-limit to see more.

# info.note

Note: %s

# examples

- Find the users who can edit a field:

  $ sf rflib debug userpermissions whohas --target-org myOrg --field Account.AnnualRevenue --access edit

- Find the users who have Modify All Data:

  $ sf rflib debug userpermissions whohas --target-org myOrg --system-permission ModifyAllData

- Find the users who can access an Apex class, including inactive users:

  $ sf rflib debug userpermissions whohas --target-org myOrg --apex-class OrderController --include-inactive
