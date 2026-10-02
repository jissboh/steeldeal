import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in the production page`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('distinct quotations created at the same instant receive distinct numbers', () => {
  const context = vm.createContext({ Uint8Array });
  vm.runInContext(extractFunction('createQuotationNumber'), context);

  const now = {
    getFullYear: () => 2026,
    getMonth: () => 9,
    getDate: () => 2,
    getHours: () => 10,
    getMinutes: () => 15,
    getSeconds: () => 30,
    getMilliseconds: () => 123,
  };
  const entropyChunks = [
    [0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef],
    [0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10],
  ];
  const cryptoSource = {
    getRandomValues(bytes) {
      bytes.set(entropyChunks.shift());
      return bytes;
    },
  };

  const quotationA = context.createQuotationNumber(now, cryptoSource);
  const quotationB = context.createQuotationNumber(now, cryptoSource);

  assert.equal(quotationA, 'QI20261002-101530123-0123456789ABCDEF');
  assert.equal(quotationB, 'QI20261002-101530123-FEDCBA9876543210');
  assert.notEqual(quotationA, quotationB);
});

test('quotation generation uses the collision-resistant helper', () => {
  assert.match(source, /const poNumber = createQuotationNumber\(now\);/);
  assert.match(source, /const fileName = poNumber \+ '\.jpg';/);
  assert.doesNotMatch(
    source,
    /const poNumber = 'QI' \+ now\.getFullYear\(\).*now\.getMinutes\(\)/,
  );
});

test('a high-volume same-instant batch has no duplicate quotation numbers', () => {
  const context = vm.createContext({ Uint8Array });
  vm.runInContext(extractFunction('createQuotationNumber'), context);
  const now = {
    getFullYear: () => 2026,
    getMonth: () => 9,
    getDate: () => 2,
    getHours: () => 10,
    getMinutes: () => 15,
    getSeconds: () => 30,
    getMilliseconds: () => 123,
  };
  const generated = new Set();

  for (let i = 0; i < 10000; i += 1) {
    generated.add(context.createQuotationNumber(now, webcrypto));
  }

  assert.equal(generated.size, 10000);
});

test('all inline scripts remain syntactically valid JavaScript', () => {
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  for (const [, script] of scripts) {
    if (script.trim()) new vm.Script(script);
  }
});
