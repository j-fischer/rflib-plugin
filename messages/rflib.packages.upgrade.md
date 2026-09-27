# summary

Check the RFLIB packages installed in a Salesforce org and upgrade them to the latest released versions.

# description

Compares the RFLIB packages (RFLIB, RFLIB-FS, RFLIB-TF, RFLIB-PHAROS) installed in the target org with the latest package versions published in the RFLIB GitHub repository (https://github.com/j-fischer/rflib).

For every installed package with a newer version available, the command asks whether to install the upgrade and, if confirmed, starts the installation in the target org. Upgrades are installed one at a time in dependency order (RFLIB first), and the remaining upgrades are skipped if an installation does not complete successfully.

Packages that are not installed in the target org are only reported; this command never installs a package that isn't already present.

Use --dryrun to only report the available upgrades, or --no-prompt to install all available upgrades without asking for confirmation. When --json is specified without --no-prompt, no upgrades are installed.

# flags.target-org.summary

Username or alias of the target org.

# flags.target-org.description

The username or alias of the Salesforce org whose installed RFLIB packages should be checked and upgraded.

# flags.dryrun.summary

Report the available upgrades without installing them.

# flags.dryrun.description

Compare the installed packages with the latest versions and print the results, without prompting or installing any upgrades.

# flags.no-prompt.summary

Install all available upgrades without asking for confirmation.

# flags.no-prompt.description

Skip the confirmation prompt for each upgrade and install every available upgrade. Use this flag in scripts and CI jobs, or together with --json.

# flags.wait.summary

Number of minutes to wait for each package installation to complete.

# flags.wait.description

The number of minutes to wait for each package installation to complete before moving on. If the wait time elapses, the installation continues in the org and the remaining upgrades are skipped. Use "sf package install report" with the reported request ID to check its progress. Specify 0 to submit the first installation request without waiting.

# info.source

Latest RFLIB package versions are published in %s.

# info.notInstalled

%s is not installed in the target org. The latest version is %s (%s).

# info.noInstalledPackages

No RFLIB packages are installed in the target org.

# info.upToDate

All installed RFLIB packages are up to date.

# info.dryrun

Dry run: no upgrades were installed.

# info.jsonWithoutNoPrompt

Upgrades are available. Run the command again with --no-prompt to install them when using --json.

# prompt.upgrade

Upgrade %s from %s to %s

# spinner.retrieve

Retrieving RFLIB package versions

# spinner.install

Installing %s %s

# status.declined

Upgrade declined.

# status.upgraded

Upgraded to %s.

# status.failed

Installation failed: %s

# status.inProgress

Installation is still in progress after the wait time elapsed. Check its status with "sf package install report --request-id %s".

# status.skipped

Skipped because the upgrade of %s did not complete.

# status.notRequested

Upgrade available but not installed.

# error.upgradeFailed

The upgrade of %s did not succeed. %s

# examples

- Check the RFLIB packages installed in an org and choose which upgrades to install:

  $ sf rflib packages upgrade --target-org myOrg

- Report the available upgrades without installing anything:

  $ sf rflib packages upgrade --target-org myOrg --dryrun

- Install all available upgrades without prompting, waiting up to 60 minutes for each installation:

  $ sf rflib packages upgrade --target-org myOrg --no-prompt --wait 60
