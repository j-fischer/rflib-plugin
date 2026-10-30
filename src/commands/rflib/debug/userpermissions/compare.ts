import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  comparePermissions,
  type ComparePermissionsResult,
  type PermissionType,
} from '../../../../shared/orgClient.js';

export type RflibDebugUserPermissionsCompareResult = ComparePermissionsResult;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.userpermissions.compare');

const LIST_SECTIONS = [
  ['apexClasses', 'info.section.apexClasses'],
  ['apexPages', 'info.section.apexPages'],
  ['customPermissions', 'info.section.customPermissions'],
  ['systemPermissions', 'info.section.systemPermissions'],
] as const;

// Admins can have hundreds of Apex classes or system permissions; the JSON result has all of them.
const MAX_LISTED = 20;

function formatList(items: readonly string[]): string {
  if (items.length <= MAX_LISTED) return items.join(', ');
  return messages.getMessage('info.andMore', [items.slice(0, MAX_LISTED).join(', '), items.length - MAX_LISTED]);
}

function describeDiff(diff: { onlyUser: string[]; onlyOtherUser: string[] }, user: string, other: string): string {
  const parts: string[] = [];
  if (diff.onlyUser.length > 0) parts.push(messages.getMessage('info.onlyUser', [user, diff.onlyUser.join(', ')]));
  if (diff.onlyOtherUser.length > 0) {
    parts.push(messages.getMessage('info.onlyUser', [other, diff.onlyOtherUser.join(', ')]));
  }
  return parts.join('; ');
}

export default class RflibDebugUserPermissionsCompare extends SfCommand<RflibDebugUserPermissionsCompareResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg({
      summary: messages.getMessage('flags.target-org.summary'),
      description: messages.getMessage('flags.target-org.description'),
      char: 'o',
      required: true,
    }),
    user: Flags.string({
      summary: messages.getMessage('flags.user.summary'),
      description: messages.getMessage('flags.user.description'),
      char: 'u',
      required: true,
    }),
    'other-user': Flags.string({
      summary: messages.getMessage('flags.other-user.summary'),
      description: messages.getMessage('flags.other-user.description'),
      char: 'w',
      required: true,
    }),
    'permission-type': Flags.string({
      summary: messages.getMessage('flags.permission-type.summary'),
      description: messages.getMessage('flags.permission-type.description'),
      char: 't',
      options: ['FLS', 'OLS', 'APEX', 'ALL'],
      default: 'ALL',
    }),
    'sobject-type': Flags.string({
      summary: messages.getMessage('flags.sobject-type.summary'),
      description: messages.getMessage('flags.sobject-type.description'),
      char: 'b',
    }),
  };

  public async run(): Promise<RflibDebugUserPermissionsCompareResult> {
    const { flags } = await this.parse(RflibDebugUserPermissionsCompare);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Comparing user permissions...');
    const result = await comparePermissions(conn, {
      user: flags.user,
      otherUser: flags['other-user'],
      permissionType: flags['permission-type'] as PermissionType,
      sobjectType: flags['sobject-type'],
    });
    this.spinner.stop();

    this.report(result);
    return result;
  }

  private report(result: ComparePermissionsResult): void {
    const user = result.user.username;
    const other = result.otherUser.username;
    this.log(messages.getMessage('info.comparing', [user, other]));
    if (result.identical) {
      this.log(messages.getMessage('info.identical'));
    }

    for (const [key, section] of [
      ['objects', 'info.section.objects'],
      ['fields', 'info.section.fields'],
    ] as const) {
      const entries = Object.entries(result[key] ?? {});
      if (entries.length === 0) continue;
      this.log(messages.getMessage(section));
      for (const [name, diff] of entries) {
        this.log(`  ${messages.getMessage('info.accessDiff', [name, describeDiff(diff, user, other)])}`);
      }
    }

    for (const [key, section] of LIST_SECTIONS) {
      const diff = result[key];
      if (!diff || (diff.onlyUser.length === 0 && diff.onlyOtherUser.length === 0)) continue;
      this.log(messages.getMessage(section));
      // Indented here because the message loader strips leading whitespace.
      if (diff.onlyUser.length > 0) {
        this.log(`  ${messages.getMessage('info.onlyUser', [user, formatList(diff.onlyUser)])}`);
      }
      if (diff.onlyOtherUser.length > 0) {
        this.log(`  ${messages.getMessage('info.onlyUser', [other, formatList(diff.onlyOtherUser)])}`);
      }
    }

    for (const note of result.notes) {
      this.log(messages.getMessage('info.note', [note]));
    }
  }
}
