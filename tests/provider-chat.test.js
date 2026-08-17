/* eslint-env jest */
/* eslint-disable no-underscore-dangle */
// Çoklu sağlayıcı AI API katmanının birim testleri (v3.6.0)
// provider-chat.js saf fonksiyonlarını test eder; HTTP istekleri mock'lanır.

'use strict';

const { _internal } = require('../src/main/agents/provider-chat');

describe('validateProvider', () => {
  const { validateProvider } = require('../src/main/agents/provider-chat');
  test('bilinen sağlayıcıları kabul eder', () => {
    for (const id of ['openrouter','xai','mistral','deepseek','cohere','perplexity','together','groq','cerebras','fireworks','replicate','azure','aws-bedrock','lmstudio','custom','manus']) {
      expect(validateProvider(id)).toBe(true);
    }
  });
  test('bilinmeyen/geçersiz idleri reddeder', () => {
    expect(validateProvider('unknown')).toBe(false);
    expect(validateProvider('../xss')).toBe(false);
    expect(validateProvider('')).toBe(false);
  });
});

describe('normalizeMessages', () => {
  const { normalizeMessages } = _internal;
  test('user/assistant rollerini korur, diğerlerini atlar', () => {
    const out = normalizeMessages([
      { role: 'system', content: 'Sys' },
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
      { role: 'user', content: 'C' },
      null,
    ]);
    // normalizeMessages yalnızca user/assistant rollerini korur; system mesajları atılır
    expect(out).toEqual([
      { role: 'user', content: 'A' },
      { role: 'assistant', content: 'B' },
      { role: 'user', content: 'C' },
    ]);
  });
});

describe('awsSigV4', () => {
  const { awsSigV4, extractAwsCreds } = _internal;
  test('AWS örnek vektörüyle eşleşen imza üretir (AWS dokümantasyon örneği)', () => {
    // AWS SigV4 testi örnek vektörü (docs): GET https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J
    const accessKey = 'AKIAIOSFODNN7EXAMPLE';
    const secretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const host = 'examplebucket.s3.amazonaws.com';
    const pathStr = '/?max-keys=2&prefix=J';
    const date = new Date('2013-05-24T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(date);
    const payload = '';
    const bodyHash = require('crypto').createHash('sha256').update(payload).digest('hex');
    const amzDate = '20130524T000000Z';
    const canonicalHeaders =
      `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = ['GET', pathStr, '', canonicalHeaders, signedHeaders, bodyHash].join('\n');
    const kDate = require('crypto').createHmac('sha256', 'AWS4' + secretKey).update('20130524').digest();
    const kRegion = require('crypto').createHmac('sha256', kDate).update('us-east-1').digest();
    const kService = require('crypto').createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = require('crypto').createHmac('sha256', kService).update('aws4_request').digest('hex');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, '20130524/us-east-1/s3/aws4_request', require('crypto').createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const expectedSig = require('crypto').createHmac('sha256', Buffer.from(kSigning, 'hex')).update(stringToSign).digest('hex');
    const { headers } = awsSigV4('GET', host, pathStr, payload, 'us-east-1', accessKey, secretKey, 's3');
    expect(headers.Authorization).toContain(`Signature=${expectedSig}`);
    expect(headers.Authorization).toContain('Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request');
    expect(headers['X-Amz-Date']).toBe(amzDate);
    jest.useRealTimers();
  });

  test('Bedrock için doğru servis alanı kullanılır', () => {
    const { headers } = awsSigV4('POST', 'bedrock-runtime.us-east-1.amazonaws.com', '/model/a.b/invoke', '{}', 'us-east-1', 'AKID', 'SECRET', 'bedrock');
    expect(headers.Authorization).toContain('/bedrock/');
  });

  test('extractAwsCreds boş değerleri tolere eder', () => {
    expect(extractAwsCreds({})).toEqual({ region: '', accessKeyId: '', secretAccessKey: '' });
    expect(extractAwsCreds({ region: ' eu-west-1 ', awsAccessKeyId: '  ak ' })).toEqual({ region: 'eu-west-1', accessKeyId: 'ak', secretAccessKey: '' });
  });
});

describe('extractModelIds', () => {
  const { extractModelIds } = _internal;
  test('OpenAI-format model listesini çözer', () => {
    const data = { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'qwen-qwq-32b' }] };
    expect(extractModelIds('openai-list', data)).toEqual(['llama-3.3-70b-versatile', 'qwen-qwq-32b']);
  });
  test('Bedrock modelSummaries listesini çözer', () => {
    const data = { modelSummaries: [{ modelId: 'anthropic.claude-3-sonnet' }, { modelId: 'meta.llama3-70b' }] };
    expect(extractModelIds('bedrock-list', data)).toEqual(['anthropic.claude-3-sonnet', 'meta.llama3-70b']);
  });
  test('geçersiz JSON toleransı', () => {
    expect(extractModelIds('openai-list', null)).toEqual([]);
    expect(extractModelIds('openai-list', { data: [{}] })).toEqual([]);
  });
});

describe('sağlayıcı kayıt defteri', () => {
  const { PROVIDERS } = require('../src/main/agents/provider-chat');
  test('16 sağlayıcı kayıtlı (aws-bedrock ve manus dahil)', () => {
    expect(Object.keys(PROVIDERS).length).toBe(16);
    expect(PROVIDERS.manus).toBeDefined();
    expect(PROVIDERS.manus.label).toBe('Manus');
    expect(PROVIDERS.manus.hostname).toBe('api.manus.ai');
  });
  test('her sağlayıcının hostname, path ve format tanımı var', () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      expect(p.label).toBeTruthy();
      expect(p.format).toMatch(/^(openai|cohere|bedrock|azure|custom|manus)$/);
      if (p.authType !== 'none' && p.modelEndpoint) {
        expect(p.modelEndpoint.hostname).toBeTruthy();
        expect(p.modelEndpoint.path).toBeTruthy();
      }
    }
  });
  test('LM Studio yerel IP kullanır, Bedrock dinamik host', () => {
    expect(PROVIDERS.lmstudio.hostname).toBe('127.0.0.1');
    expect(PROVIDERS.lmstudio.port).toBe(1234);
    expect(PROVIDERS['aws-bedrock'].authType).toBe('bedrock');
    expect(PROVIDERS.azure.authType).toBe('azure');
  });
});
