const { parseDelegateCalls } = require('../src/renderer/lib/delegate-parse.js');

describe('parseDelegateCalls', () => {
  test('parses single CALL block', () => {
    const t = '//CALL:Coder fix the login bug';
    expect(parseDelegateCalls(t)).toEqual([{ name: 'Coder', task: 'fix the login bug', parallel: false }]);
  });

  test('parses multiple blocks', () => {
    const t = `Intro text
//CALL:Writer draft an email
More
//CALL:Reviewer check tone`;
    const r = parseDelegateCalls(t);
    expect(r).toHaveLength(2);
    expect(r[0].name).toBe('Writer');
    expect(r[0].parallel).toBe(false);
    expect(r[1].name).toBe('Reviewer');
    expect(r[1].parallel).toBe(false);
  });

  test('empty input', () => {
    expect(parseDelegateCalls('')).toEqual([]);
    expect(parseDelegateCalls(null)).toEqual([]);
  });

  test('CALL_PARALLEL sets parallel flag', () => {
    const t = `//CALL_PARALLEL:Worker task A
//CALL:Other task B`;
    const r = parseDelegateCalls(t);
    expect(r[0].parallel).toBe(true);
    expect(r[1].parallel).toBe(false);
  });
});
