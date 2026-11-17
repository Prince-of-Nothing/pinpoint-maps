// Validates catalog.json against the schema 1 contract. No dependencies:
// CI can run `node scripts/validate-catalog.mjs`.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MAX_CATALOG_BYTES = 1024 * 1024;
const ID_RE = /^[a-z0-9-]{1,64}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const BASENAME_RE = /^(?!.*\.\.)[^/\\:]+$/;
const URL_RE = /^https?:\/\/[^\s/]+\S*$/;
const ROLES = ['basemap', 'graph'];
const COMPRESSIONS = ['identity', 'gzip'];

const isObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Returns a list of `path: message` problems; an empty list means valid.
 * `serialized` is the catalog text when validating a file, so the byte cap
 * covers whitespace too.
 */
export function validateCatalog(catalog, serialized) {
  const errors = [];
  const bad = (path, message) => errors.push(`${path}: ${message}`);
  const text =
    typeof serialized === 'string' ? serialized : (JSON.stringify(catalog) ?? '');

  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_CATALOG_BYTES) {
    bad('catalog', `serialized size ${bytes} exceeds the 1 MiB cap`);
  }

  if (!isObject(catalog)) {
    return [...errors, 'catalog: must be a JSON object'];
  }

  if (catalog.schema !== 1) {
    bad('schema', 'must be 1');
  }
  if (typeof catalog.updated !== 'string' || catalog.updated.length === 0) {
    bad('updated', 'must be a non-empty string');
  }
  if (!Array.isArray(catalog.regions)) {
    return [...errors, 'regions: must be an array'];
  }
  if (catalog.regions.length < 1 || catalog.regions.length > 64) {
    bad('regions', `must contain 1..64 regions, got ${catalog.regions.length}`);
  }

  const ids = new Map();
  catalog.regions.forEach((region, index) => {
    const p = `regions[${index}]`;
    if (!isObject(region)) {
      bad(p, 'must be an object');
      return;
    }

    if (typeof region.id !== 'string' || !ID_RE.test(region.id)) {
      bad(`${p}.id`, 'must match ^[a-z0-9-]{1,64}$');
    } else if (ids.has(region.id)) {
      bad(
        `${p}.id`,
        `duplicate id "${region.id}" (first at regions[${ids.get(region.id)}])`
      );
    } else {
      ids.set(region.id, index);
    }

    if (typeof region.name !== 'string' || region.name.length === 0) {
      bad(`${p}.name`, 'must be a non-empty string');
    }

    if (
      !Array.isArray(region.bbox) ||
      region.bbox.length !== 4 ||
      !region.bbox.every(
        (value) => typeof value === 'number' && Number.isFinite(value)
      )
    ) {
      bad(`${p}.bbox`, 'must be exactly 4 finite numbers');
    }

    if (
      !Number.isInteger(region.maxzoom) ||
      region.maxzoom < 0 ||
      region.maxzoom > 22
    ) {
      bad(`${p}.maxzoom`, 'must be an integer 0..22');
    }

    if (typeof region.version !== 'string' || region.version.length === 0) {
      bad(`${p}.version`, 'must be a non-empty string');
    }

    if (!Array.isArray(region.files)) {
      bad(`${p}.files`, 'must be an array');
      return;
    }
    if (region.files.length < 1 || region.files.length > 32) {
      bad(
        `${p}.files`,
        `must contain 1..32 files, got ${region.files.length}`
      );
    }

    const roles = new Map();
    region.files.forEach((file, fileIndex) => {
      const fp = `${p}.files[${fileIndex}]`;
      if (!isObject(file)) {
        bad(fp, 'must be an object');
        return;
      }

      if (!ROLES.includes(file.role)) {
        bad(`${fp}.role`, 'must be "basemap" or "graph"');
      } else if (roles.has(file.role)) {
        bad(
          `${fp}.role`,
          `duplicate role "${file.role}" (first at ${p}.files[${roles.get(
            file.role
          )}])`
        );
      } else {
        roles.set(file.role, fileIndex);
      }

      for (const key of ['transfer_name', 'installed_name']) {
        if (typeof file[key] !== 'string' || !BASENAME_RE.test(file[key])) {
          bad(
            `${fp}.${key}`,
            'must be a safe basename (no /, \\, : or ..)'
          );
        }
      }

      if (typeof file.url !== 'string' || !URL_RE.test(file.url)) {
        bad(`${fp}.url`, 'must be an absolute http(s) URL');
      }

      for (const key of ['transfer_bytes', 'installed_bytes']) {
        if (!Number.isInteger(file[key]) || file[key] < 1) {
          bad(`${fp}.${key}`, 'must be a positive integer');
        }
      }

      for (const key of ['transfer_sha256', 'installed_sha256']) {
        if (typeof file[key] !== 'string' || !HASH_RE.test(file[key])) {
          bad(`${fp}.${key}`, 'must be 64 lowercase hex characters');
        }
      }

      if (!COMPRESSIONS.includes(file.compression)) {
        bad(`${fp}.compression`, 'must be "identity" or "gzip"');
      }
    });
  });

  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file =
    process.argv[2] ??
    fileURLToPath(new URL('../catalog.json', import.meta.url));

  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    console.error(`catalog error: cannot read ${file}: ${error.message}`);
    process.exit(1);
  }

  let catalog;
  try {
    // PowerShell 5 writes a UTF-8 BOM; JSON.parse rejects it.
    catalog = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    console.error(`catalog error: ${file} is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  const errors = validateCatalog(catalog, text);
  if (errors.length > 0) {
    console.error(`catalog invalid: ${errors.length} problem(s) in ${file}`);
    for (const error of errors.slice(0, 20)) {
      console.error(`  - ${error}`);
    }
    if (errors.length > 20) {
      console.error(`  ... and ${errors.length - 20} more`);
    }
    process.exit(1);
  }

  console.log(`catalog ok: ${catalog.regions.length} regions`);
}
