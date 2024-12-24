# summary

Instrument Apex classes with RFLIB logging statements automatically.

# description

Analyzes Apex classes and adds RFLIB logging statements for method entry and error handling. Adds class-level logger initialization if not already present. 

# flags.sourcepath.summary

Directory containing Apex classes to instrument with logging.

# flags.sourcepath.description

Path to the source directory containing Apex classes that should be instrumented with RFLIB logging statements. Test classes (ending with 'Test.cls') are automatically excluded.

# flags.dryrun.summary

Preview changes without modifying files.

# flags.dryrun.description

When enabled, shows which files would be modified without making actual changes. Useful for reviewing the impact before applying changes.

# flags.prettier.summary

Format modified files using Prettier.

# flags.prettier.description

When enabled, formats the modified Apex files using prettier-plugin-apex after adding logging statements. Maintains consistent code style.

# examples

- Add logging statements to all Apex classes in a directory:
```sh-session
$ sf rflib logging apex instrument --sourcepath force-app/main/default/classes
```

- Preview changes without modifying files:
```sh-session
$ sf rflib logging apex instrument --sourcepath force-app/main/default/classes --dryrun
```

- Add logging statements and format code:
```sh-session
$ sf rflib logging apex instrument --sourcepath force-app/main/default/classes --prettier
```