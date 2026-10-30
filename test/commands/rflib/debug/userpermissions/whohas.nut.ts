import { expect } from 'chai';
import RflibDebugUserPermissionsWhoHas from '../../../../../src/commands/rflib/debug/userpermissions/whohas.js';
import { setupNut } from '../../../../helpers/nutTestContext.js';

const SALES_PS = '0PS0000000000S1';
const UNUSED_PS = '0PS0000000000U1';

const assignments = [
  {
    AssigneeId: '0057000000JANE1',
    PermissionSetId: SALES_PS,
    PermissionSetGroupId: null,
    Assignee: { Username: 'jane@example.com', Name: 'Jane', IsActive: true, Profile: { Name: 'Standard User' } },
  },
  {
    AssigneeId: '0057000000DANA1',
    PermissionSetId: SALES_PS,
    PermissionSetGroupId: null,
    Assignee: { Username: 'dana@example.com', Name: 'Dana', IsActive: true, Profile: { Name: 'Standard User' } },
  },
];

describe('rflib debug userpermissions whohas NUTs', () => {
  const harness = setupNut({
    query: (soql) => {
      if (soql.includes('FROM PermissionSet WHERE PermissionsModifyAllData = true')) {
        return [
          { Id: SALES_PS, Name: 'Sales_Reports', Label: 'Sales Reports', IsOwnedByProfile: false },
          { Id: UNUSED_PS, Name: 'Unused', Label: 'Unused', IsOwnedByProfile: false },
        ];
      }
      if (soql.includes('FROM PermissionSetAssignment')) return assignments;
      return [];
    },
    describe: {
      PermissionSet: () => ({ name: 'PermissionSet', fields: [{ name: 'PermissionsModifyAllData', type: 'boolean' }] }),
    },
  });

  it('lists the users with a system permission and what grants it', async () => {
    const result = await RflibDebugUserPermissionsWhoHas.run([
      '--target-org',
      harness.testOrg.username,
      '--system-permission',
      'ModifyAllData',
      '--user-limit',
      '1',
    ]);

    expect(result.summary).to.equal('2 active users have the ModifyAllData system permission.');
    expect(result.userCount).to.equal(2);
    expect(result.users.map((user) => user.username)).to.deep.equal(['dana@example.com']);
    expect(result.usersTruncated).to.equal(true);
    expect(result.sources).to.deep.equal([
      {
        type: 'PermissionSet',
        name: 'Sales Reports',
        apiName: 'Sales_Reports',
        permission: 'PermissionsModifyAllData',
        userCount: 2,
      },
    ]);
    expect(result.unassignedSourceCount).to.equal(1);

    const assignmentQuery = harness.queries.find((q) => q.includes('FROM PermissionSetAssignment'))!;
    expect(assignmentQuery).to.include(`PermissionSetId IN ('${SALES_PS}','${UNUSED_PS}')`);
    expect(assignmentQuery).to.include('Assignee.IsActive = true');
  });

  it('includes inactive users with --include-inactive', async () => {
    await RflibDebugUserPermissionsWhoHas.run([
      '--target-org',
      harness.testOrg.username,
      '--system-permission',
      'ModifyAllData',
      '--include-inactive',
    ]);

    const assignmentQuery = harness.queries.find((q) => q.includes('FROM PermissionSetAssignment'))!;
    expect(assignmentQuery).to.not.include('Assignee.IsActive = true');
  });

  it('requires exactly one permission to look up', async () => {
    try {
      await RflibDebugUserPermissionsWhoHas.run(['--target-org', harness.testOrg.username]);
      expect.fail('expected the command to throw');
    } catch (err) {
      expect((err as Error).message).to.match(/exactly one/i);
    }
    expect(harness.queries).to.have.lengthOf(0);
  });
});
