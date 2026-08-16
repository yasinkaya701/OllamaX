/*
 * cost-engine-wire.js (v3.15 A2) — lazy-require uyumluluk katmanı
 * provider-chat.js gibi geç yüklenen modüllerin cost-engine'a erişimi için
 * tekil bir sarmalayıcı sunar; circular-require riskini azaltır.
 */
'use strict';

const costEngine = require('./cost-engine');

module.exports = { costEngine };
