'use strict';
/* featured-discover.test.js — otomatik GitHub keşif motoru birim testleri */
const {
  _bestCategoryFor,
  _repoToItem,
  CATEGORY_QUERIES,
} = require('../src/main/featured-discover');

describe('featured-discover (v3.11)', () => {
  test('beş kategori tanımı tam', () => {
    expect(CATEGORY_QUERIES).toHaveLength(5);
    for (const cat of CATEGORY_QUERIES) {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.query.length).toBeGreaterThan(5);
      expect(cat.keywords.length).toBeGreaterThan(0);
    }
  });

  test('bestCategoryFor: depoları anahtar kelimelere göre atar', () => {
    const agentRepo = { full_name: 'langchain-ai/langgraph', description: 'Multi-agent orchestration framework', topics: ['ai-agents'] };
    expect(_bestCategoryFor(agentRepo)).toBe('agents-orchestration');

    const ragRepo = { full_name: 'run-llama/llama_index', description: 'RAG retrieval augmented generation framework', topics: ['rag'] };
    expect(_bestCategoryFor(ragRepo)).toBe('rag-data');

    const inferRepo = { full_name: 'ggml-org/llama.cpp', description: 'LLM inference in C/C++', topics: ['llm-inference'] };
    expect(_bestCategoryFor(inferRepo)).toBe('local-inference');

    const learnRepo = { full_name: 'karpathy/nn-zero-to-hero', description: 'Zero to hero neural network lecture series', topics: ['education'] };
    expect(_bestCategoryFor(learnRepo)).toBe('learning-path');

    const baseRepo = { full_name: 'karpathy/nanoGPT', description: 'The simplest GPT training repository', topics: ['gpt'] };
    expect(_bestCategoryFor(baseRepo)).toBe('ai-foundations');
  });

  test('bestCategoryFor: bilinmeyen depo varsayılan kategoriye düşer', () => {
    const unknown = { full_name: 'xyz/qwe', description: 'something else entirely', topics: ['misc'] };
    expect(_bestCategoryFor(unknown)).toBe('ai-foundations');
  });

  test('repoToItem: API yanıtını kart verisine çevirir', () => {
    const item = _repoToItem({
      full_name: 'karpathy/nanoGPT',
      description: 'The simplest GPT repo',
      stargazers_count: 17200,
      language: 'Python',
      html_url: 'https://github.com/karpathy/nanoGPT',
    });
    expect(item.name).toBe('karpathy/nanoGPT');
    expect(item.stars).toBe(17200);
    expect(item.lang).toBe('Python');
    expect(item.url).toBe('https://github.com/karpathy/nanoGPT');
  });

  test('repoToItem: eksik alanlara toleranslı', () => {
    const item = _repoToItem({ full_name: 'a/b' });
    expect(item.desc).toContain('Açıklama yok');
    expect(item.stars).toBe(0);
    expect(item.lang).toBe('');
    expect(item.url).toBe('');
  });

  test('uzun açıklama kırpılır (120 karakter)', () => {
    const item = _repoToItem({ full_name: 'a/b', description: 'x'.repeat(200) });
    expect(item.desc.length).toBeLessThanOrEqual(125);
  });

  test('CATEGORY_QUERIES sorgu formatı GitHub search qualifiers yapısına uyar', () => {
    const reserved = ['\u0000', '"', "'", '<'];
    for (const cat of CATEGORY_QUERIES) {
      for (const r of reserved) expect(cat.query).not.toContain(r);
      /* GitHub arama: "stars:>N", "pushed:>YYYY-MM-DD" biçimi standarttır */
      expect(/[a-z]+:>[\d-]+/.test(cat.query)).toBe(true);
    }
  });
});
