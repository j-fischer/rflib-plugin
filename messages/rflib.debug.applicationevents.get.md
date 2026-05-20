# summary

Query RFLIB Application Events from a Salesforce org.

# description

Retrieves rflib_Application_Event__c records from the target org via the Salesforce REST API.
Application Events are business-level events used to track feature adoption, user actions, and domain-specific milestones.
Results are ordered by Occurred_On__c descending (most recent first).

Requires the RFLIB base package to be installed in the target org and the running user to be assigned the rflib_Ops_Center_Access permission set (or have equivalent read access to rflib_Application_Event__c).
For installation instructions, visit: https://github.com/j-fischer/rflib

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org containing the RFLIB base package.

# flags.event-name.summary

Filter by event name. Use % as a wildcard.

# flags.event-name.description

Filter Application Events by their Event_Name__c field. Use the % character as a wildcard for partial matches, for example "order-%".

# flags.start-date.summary

Filter events on or after this ISO 8601 date.

# flags.start-date.description

Only return events where Occurred_On__c is on or after this date. Must be in ISO 8601 format, e.g. 2024-01-01T00:00:00Z.

# flags.end-date.summary

Filter events on or before this ISO 8601 date.

# flags.end-date.description

Only return events where Occurred_On__c is on or before this date. Must be in ISO 8601 format, e.g. 2024-12-31T23:59:59Z.

# flags.related-record-id.summary

Filter by Related_Record_ID__c (exact match).

# flags.related-record-id.description

Only return events associated with this specific record ID.

# flags.record-limit.summary

Maximum number of records to return (default 200, max 2000).

# flags.record-limit.description

Controls how many Application Event records are returned. Defaults to 200. Maximum allowed value is 2000.

# examples

- Get all application events from the default org:

  $ sf rflib debug applicationevents get --target-org myOrg

- Get events filtered by name and date range:

  $ sf rflib debug applicationevents get --target-org myOrg --event-name "order-%" --start-date 2024-01-01T00:00:00Z

- Get events related to a specific record with a custom limit:

  $ sf rflib debug applicationevents get --target-org myOrg --related-record-id 0017000000XXXXXX --record-limit 50
