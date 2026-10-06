import * as path from 'node:path';
import { expect } from 'chai';
import { isExcluded } from '../../src/shared/exclude.js';

describe('exclude', () => {
  it('should not exclude anything without a pattern', () => {
    expect(isExcluded('/project/force-app/classes/Foo.cls')).to.be.false;
    expect(isExcluded('/project/force-app/classes/Foo.cls', '')).to.be.false;
  });

  it('should match globstar patterns against absolute paths', () => {
    expect(isExcluded('/project/force-app/classes/Foo.cls', '**/Foo.cls')).to.be.true;
    expect(isExcluded('/project/force-app/classes/Bar.cls', '**/Foo.cls')).to.be.false;
  });

  it('should match a bare file name pattern against the base name', () => {
    expect(isExcluded('/project/force-app/classes/Generated_Foo.cls', 'Generated_*.cls')).to.be.true;
  });

  it('should match paths that contain dot-prefixed directories', () => {
    expect(isExcluded('/home/user/.claude/worktrees/wt/force-app/classes/Foo.cls', '**/Foo.cls')).to.be.true;
    expect(isExcluded('/home/user/.config/project/lwc/cmp', '**/cmp')).to.be.true;
  });

  it('should match paths built with the native path separator', () => {
    const filePath = ['C:', 'project', 'force-app', 'classes', 'Foo.cls'].join(path.sep);
    expect(isExcluded(filePath, '**/classes/Foo.cls')).to.be.true;
  });
});
