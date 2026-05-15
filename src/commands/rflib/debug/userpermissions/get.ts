import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { getUserPermissions, type PermissionType } from '../../../../shared/orgClient.js';

export type RflibDebugUserPermissionsGetResult = {
  result: string;
};

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('rflib-plugin', 'rflib.debug.userpermissions.get');

export default class RflibDebugUserPermissionsGet extends SfCommand<RflibDebugUserPermissionsGetResult> {
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
    'user-id': Flags.string({
      summary: messages.getMessage('flags.user-id.summary'),
      description: messages.getMessage('flags.user-id.description'),
      char: 'u',
      required: true,
    }),
    'permission-type': Flags.string({
      summary: messages.getMessage('flags.permission-type.summary'),
      description: messages.getMessage('flags.permission-type.description'),
      char: 't',
      required: true,
      options: ['FLS', 'OLS', 'APEX', 'ALL'],
    }),
    'sobject-type': Flags.string({
      summary: messages.getMessage('flags.sobject-type.summary'),
      description: messages.getMessage('flags.sobject-type.description'),
      char: 'b',
    }),
  };

  public async run(): Promise<RflibDebugUserPermissionsGetResult> {
    const { flags } = await this.parse(RflibDebugUserPermissionsGet);
    const conn = flags['target-org'].getConnection(undefined);

    this.spinner.start('Retrieving user permissions...');
    const payload = await getUserPermissions(conn, {
      userId: flags['user-id'],
      permissionType: flags['permission-type'] as PermissionType,
      sobjectType: flags['sobject-type'],
    });
    this.spinner.stop();

    const result = JSON.stringify(payload);
    this.log(result);
    return { result };
  }
}
