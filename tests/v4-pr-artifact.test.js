'use strict';

const { buildPullRequestArtifact } = require('../src/main/v4/tools/pr-artifact');

describe('v4 PR artifact formatter', () => {
  test('renders bounded delivery and evidence summary without performing actions', () => {
    const artifact = buildPullRequestArtifact({
      mission: { id: 'mission-1', title: 'Fix login', status: 'VERIFYING' },
      workspace: { id: 'ws-1', name: 'Fixture' },
      delivery: {
        baseSha: 'a'.repeat(40),
        headSha: 'b'.repeat(40),
        diffHash: 'c'.repeat(64),
        currentInventoryHash: 'd'.repeat(64),
        changedFiles: ['src/login.js', 'tests/login.test.js'],
        diffStat: '2 files changed, 10 insertions(+)',
      },
      evidence: {
        taskCount: 2,
        agentRunCount: 1,
        verificationRunCount: 3,
        verificationPassed: 2,
        verificationStale: 1,
        verificationFailed: 0,
        evidenceCount: 5,
        currentInventoryHash: 'd'.repeat(64),
      },
    });
    expect(artifact.title).toBe('Fix login');
    expect(artifact.body).toContain('src/login.js');
    expect(artifact.body).toContain('Current passed verification runs: 2');
    expect(artifact.body).toContain('Stale passed verification runs: 1');
    expect(artifact.body).toContain('performs no remote Git action');
  });
});
