# summary

Compare the permissions of two users and show only the differences.

# description

Finds out why something works for one user but not for another. The command combines each user's permissions across their profile, permission sets, and permission set groups, and returns only the permissions that one of the users has and the other doesn't.

Use --permission-type to choose what to compare (default: ALL) and --sobject-type to limit the object and field comparison to one object. ALL compares object and field access, Apex classes, Visualforce pages, custom permissions, and system permissions.

Field access only counts where the user also has the matching access on the object. Sharing and record-level access aren't compared.

The command only reads standard setup objects, so the RFLIB package doesn't need to be installed. The running user needs the View Setup and Configuration permission.

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org to compare the users in.

# flags.user.summary

User ID (15 or 18 characters) or username of the first user.

# flags.user.description

The first user to compare, typically the user for whom something doesn't work.

# flags.other-user.summary

User ID (15 or 18 characters) or username of the second user.

# flags.other-user.description

The second user to compare, typically the user for whom it works.

# flags.permission-type.summary

Permissions to compare: FLS, OLS, APEX, or ALL. Default: ALL.

# flags.permission-type.description

Controls which permissions are compared:
  - FLS: Field access
  - OLS: Object access
  - APEX: Apex class and Visualforce page access
  - ALL: All of the above, plus custom permissions and system permissions

# flags.sobject-type.summary

Optional SObject API name to limit the object and field comparison to.

# flags.sobject-type.description

Limits the object and field comparison to one SObject type, e.g. Account. Recommended in large orgs, where the full field comparison can reach the query row limit.

# info.comparing

Comparing %s with %s

# info.identical

No differences found.

# info.section.objects

Objects:

# info.section.fields

Fields:

# info.section.apexClasses

Apex classes:

# info.section.apexPages

Visualforce pages:

# info.section.customPermissions

Custom permissions:

# info.section.systemPermissions

System permissions:

# info.accessDiff

%s: %s

# info.onlyUser

only %s has %s

# info.andMore

%s, and %s more (see --json for the full list)

# info.note

Note: %s

# examples

- Compare all permissions of two users:

  $ sf rflib debug userpermissions compare --target-org myOrg --user jane@example.com --other-user bob@example.com

- Compare object and field access on Account:

  $ sf rflib debug userpermissions compare --target-org myOrg --user jane@example.com --other-user bob@example.com --permission-type FLS --sobject-type Account
