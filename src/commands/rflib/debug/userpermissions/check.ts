import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import {
  ACCESS_LEVELS,
  checkUserPermission,
  type CheckUserPermissionResult,
  type PermissionSource,
} from '../../../../shared/orgClient.js';

export type RflibDebugUserPermissionsCheckResult = CheckUserPermissionResult;

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.userpermissions.check');

const CHECK_FLAGS = ['object', 'field', 'apex-class', 'apex-page', 'custom-permission', 'system-permission'];

const SOURCE_LABELS: Record<PermissionSource['type'], string> = {
  Profile: 'Profile',
  PermissionSet: 'Permission Set',
  PermissionSetGroup: 'Permission Set Group',
};

export default class RflibDebugUserPermissionsCheck extends SfCommand<RflibDebugUserPermissionsCheckResult> {
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
  };

  public async run(): Promise<RflibDebugUserPermissionsCheckResult> {
    const { flags } = await this.parse(RflibDebugUserPermissionsCheck);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Checking user permission...');
    const result = await checkUserPermission(conn, {
      user: flags.user,
      object: flags.object,
      field: flags.field,
      access: flags.access,
      apexClass: flags['apex-class'],
      apexPage: flags['apex-page'],
      customPermission: flags['custom-permission'],
      systemPermission: flags['system-permission'],
    });
    this.spinner.stop();

    this.report(result);
    return result;
  }

  private report(result: CheckUserPermissionResult): void {
    this.log(messages.getMessage(result.granted ? 'info.granted' : 'info.notGranted', [result.summary]));
    if (result.sources.length > 0) {
      this.log(messages.getMessage('info.sources'));
      for (const source of result.sources) {
        // Indented here because the message loader strips leading whitespace.
        this.log(
          `  ${messages.getMessage('info.source', [SOURCE_LABELS[source.type], source.name, source.permission])}`,
        );
      }
    }
    for (const note of result.notes) {
      this.log(messages.getMessage('info.note', [note]));
    }
  }
}
