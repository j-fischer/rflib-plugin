import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { ACCESS_LEVELS, whoHasPermission, type WhoHasPermissionResult } from '../../../../shared/orgClient.js';

export type RflibDebugUserPermissionsWhoHasResult = WhoHasPermissionResult;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.userpermissions.whohas');

const CHECK_FLAGS = ['object', 'field', 'apex-class', 'apex-page', 'custom-permission', 'system-permission'];

const SOURCE_LABELS: Record<WhoHasPermissionResult['sources'][number]['type'], string> = {
  Profile: 'Profile',
  PermissionSet: 'Permission Set',
  PermissionSetGroup: 'Permission Set Group',
};

export default class RflibDebugUserPermissionsWhoHas extends SfCommand<RflibDebugUserPermissionsWhoHasResult> {
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
    object: Flags.string({
      summary: messages.getMessage('flags.object.summary'),
      description: messages.getMessage('flags.object.description'),
      char: 'b',
      exactlyOne: CHECK_FLAGS,
    }),
    field: Flags.string({
      summary: messages.getMessage('flags.field.summary'),
      description: messages.getMessage('flags.field.description'),
      char: 'f',
      exactlyOne: CHECK_FLAGS,
    }),
    access: Flags.string({
      summary: messages.getMessage('flags.access.summary'),
      description: messages.getMessage('flags.access.description'),
      char: 'a',
      options: ACCESS_LEVELS,
    }),
    'apex-class': Flags.string({
      summary: messages.getMessage('flags.apex-class.summary'),
      description: messages.getMessage('flags.apex-class.description'),
      exactlyOne: CHECK_FLAGS,
    }),
    'apex-page': Flags.string({
      summary: messages.getMessage('flags.apex-page.summary'),
      description: messages.getMessage('flags.apex-page.description'),
      exactlyOne: CHECK_FLAGS,
    }),
    'custom-permission': Flags.string({
      summary: messages.getMessage('flags.custom-permission.summary'),
      description: messages.getMessage('flags.custom-permission.description'),
      exactlyOne: CHECK_FLAGS,
    }),
    'system-permission': Flags.string({
      summary: messages.getMessage('flags.system-permission.summary'),
      description: messages.getMessage('flags.system-permission.description'),
      exactlyOne: CHECK_FLAGS,
    }),
    'include-inactive': Flags.boolean({
      summary: messages.getMessage('flags.include-inactive.summary'),
      description: messages.getMessage('flags.include-inactive.description'),
      default: false,
    }),
    'user-limit': Flags.integer({
      summary: messages.getMessage('flags.user-limit.summary'),
      description: messages.getMessage('flags.user-limit.description'),
      char: 'l',
      min: 1,
      max: 2000,
      default: 200,
    }),
  };

  public async run(): Promise<RflibDebugUserPermissionsWhoHasResult> {
    const { flags } = await this.parse(RflibDebugUserPermissionsWhoHas);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Finding users with the permission...');
    const result = await whoHasPermission(conn, {
      object: flags.object,
      field: flags.field,
      access: flags.access,
      apexClass: flags['apex-class'],
      apexPage: flags['apex-page'],
      customPermission: flags['custom-permission'],
      systemPermission: flags['system-permission'],
      includeInactive: flags['include-inactive'],
      limit: flags['user-limit'],
    });
    this.spinner.stop();

    this.report(result);
    return result;
  }

  private report(result: WhoHasPermissionResult): void {
    this.log(result.summary);

    if (result.sources.length > 0) {
      this.log(messages.getMessage('info.sources'));
      this.table({
        data: result.sources.map((source) => ({
          type: SOURCE_LABELS[source.type],
          name: source.name,
          permission: source.permission,
          users: source.userCount,
        })),
        columns: [
          { key: 'type', name: 'Type' },
          { key: 'name', name: 'Name' },
          { key: 'permission', name: 'Permission' },
          { key: 'users', name: 'Users' },
        ],
      });
    }

    if (result.users.length > 0) {
      this.log(messages.getMessage('info.users'));
      this.table({
        data: result.users.map((user) => ({
          username: user.username,
          name: user.name,
          profile: user.profileName,
          sources: user.sources.join(', '),
        })),
        columns: [
          { key: 'username', name: 'Username' },
          { key: 'name', name: 'Name' },
          { key: 'profile', name: 'Profile' },
          { key: 'sources', name: 'Granted By' },
        ],
      });
      if (result.usersTruncated) {
        this.log(messages.getMessage('info.usersTruncated', [result.users.length, result.userCount]));
      }
    }

    for (const note of result.notes) {
      this.log(messages.getMessage('info.note', [note]));
    }
  }
}
