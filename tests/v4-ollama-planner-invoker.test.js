'use strict';

const { choosePlannerModel } = require('../src/main/v4/models/ollama-planner-invoker');

describe('v4 Ollama planner model selection', () => {
  test('prefers installed coding model', () => {
    const model = choosePlannerModel([
      { name: 'llama3.1:8b' },
      { name: 'qwen2.5-coder:14b' },
      { name: 'gemma3:12b' },
    ]);
    expect(model).toBe('qwen2.5-coder:14b');
  });

  test('honors explicit installed planner model', () => {
    const models = [{ name: 'qwen2.5-coder:14b' }, { name: 'llama3.1:8b' }];
    expect(choosePlannerModel(models, 'llama3.1:8b')).toBe('llama3.1:8b');
  });

  test('returns null when no model is installed', () => {
    expect(choosePlannerModel([])).toBeNull();
  });
});
