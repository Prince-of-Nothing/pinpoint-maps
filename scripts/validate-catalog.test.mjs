import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from './validate-catalog.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

function baseCatalog() {
  return {
    schema: 1,
    updated: '2026-11-17T12:00:00Z',
    regions: [
      {
        id: 'moldova',
        name: 'Moldova',
        bbox: [26.6, 45.4, 30.2, 48.5],
        maxzoom: 14,
        version: '20261116',
        files: [
          {
            role: 'basemap',
            transfer_name: 'moldova.pmtiles',
            installed_name: 'moldova.pmtiles',
            url: 'https://example.test/moldova.pmtiles',
            transfer_bytes: 1,
            transfer_sha256: 'a'.repeat(64),
            installed_bytes: 1,
            installed_sha256: 'a'.repeat(64),
            compression: 'identity'
          },
          {
            role: 'graph',
            transfer_name: 'moldova.graph.bin.gz',
            installed_name: 'moldova.graph.bin',
            url: 'https://example.test/moldova.graph.bin.gz',
            transfer_bytes: 1,
            transfer_sha256: 'b'.repeat(64),
            installed_bytes: 2,
            installed_sha256: 'c'.repeat(64),
            compression: 'gzip'
          }
        ]
      }
    ]
  };
}

test('the committed catalog passes', async () => {
  const text = await readFile(
    fileURLToPath(new URL('../catalog.json', import.meta.url)),
    'utf8'
  );
  assert.deepEqual(validateCatalog(JSON.parse(text), text), []);
});

test('rejects duplicate region ids', () => {
  const catalog = baseCatalog();
  catalog.regions.push(clone(catalog.regions[0]));
  assert.match(validateCatalog(catalog).join('\n'), /duplicate id/);
});

test('rejects a path in installed_name', () => {
  const catalog = baseCatalog();
  catalog.regions[0].files[1].installed_name = '../graph.bin';
  assert.match(validateCatalog(catalog).join('\n'), /installed_name/);
});

test('rejects a bad hash and a duplicate role', () => {
  const catalog = baseCatalog();
  catalog.regions[0].files[1].transfer_sha256 = 'A'.repeat(64);
  catalog.regions[0].files[1].role = 'basemap';
  const errors = validateCatalog(catalog).join('\n');
  assert.match(errors, /transfer_sha256/);
  assert.match(errors, /duplicate role/);
});

test('rejects a catalog over 1 MiB', () => {
  const catalog = baseCatalog();
  catalog.regions[0].name = 'x'.repeat(1024 * 1024);
  assert.match(validateCatalog(catalog).join('\n'), /1 MiB/);
});
