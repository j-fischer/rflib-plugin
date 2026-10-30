# summary

Check a user's access to specific records, including sharing.

# description

Answers questions such as "Why can't this user see this record?". For each record, the command returns the user's access from UserRecordAccess (read, edit, delete, transfer, and full access), which includes sharing: the org-wide default, the role hierarchy, sharing rules, teams, and manual shares.

The result also contains the user's object permissions on each record's object, and notes that tell apart missing object permissions from missing sharing. Use userpermissions check to find out which profile or permission set grants an object permission.

You can check up to 200 records at a time.

The command only reads standard objects, so the RFLIB package doesn't need to be installed.

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org that contains the records.

# flags.user.summary

User ID (15 or 18 characters) or username of the user to check.

# flags.user.description

The Salesforce User ID (15 or 18 characters) or the username of the user whose record access should be checked.

# flags.record-id.summary

ID of a record to check. Specify the flag multiple times to check several records.

# flags.record-id.description

The 15 or 18 character ID of a record to check. Specify --record-id up to 200 times.

# info.user

Record access for %s:

# info.notFound

Not found

# info.note

%s: %s

# examples

- Check a user's access to a record:

  $ sf rflib debug recordaccess get --target-org myOrg --user jane@example.com --record-id 001XXXXXXXXXXXXXXX

- Check several records at once:

  $ sf rflib debug recordaccess get --target-org myOrg --user 0057000000XXXXXX --record-id 001XXXXXXXXXXXXXXX --record-id 006XXXXXXXXXXXXXXX
