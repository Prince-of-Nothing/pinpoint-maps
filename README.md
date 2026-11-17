# pinpoint-maps

Public map data for [Pinpoint](https://github.com/Prince-of-Nothing/Pinpoint).

This repo holds the **per-region offline packs** (vector basemap + routing graph),
the **catalog** the app reads at runtime, and the workflow that builds and
publishes them. It contains no application code: the build scripts live in the
app repo under `scripts/offline/`, and every release records which app ref
produced it.

Adding a country is a data change here, not an app release.

## Region catalog

`catalog.json` on `main` is the single source of truth for what the app can
download. It follows **schema 1**:

```json
{
  "schema": 1,
  "updated": "2026-11-17T12:00:00Z",
  "regions": [
    {
      "id": "moldova",
      "name": "Moldova",
      "bbox": [26.6, 45.4, 30.2, 48.5],
      "maxzoom": 14,
      "version": "20261116",
      "files": [
        {
          "role": "basemap",
          "transfer_name": "moldova.pmtiles",
          "installed_name": "moldova.pmtiles",
          "url": "https://github.com/Prince-of-Nothing/Pinpoint/releases/download/data-moldova-20261116/moldova.pmtiles",
          "transfer_bytes": 93172399,
          "transfer_sha256": "7b27155519e3384e1520d1a3dc6488f93cf1e46292dae22129f972bc97524f2e",
          "installed_bytes": 93172399,
          "installed_sha256": "7b27155519e3384e1520d1a3dc6488f93cf1e46292dae22129f972bc97524f2e",
          "compression": "identity"
        }
      ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `schema` | Always `1`. |
| `updated` | RFC 3339 UTC timestamp of the last catalog write. |
| `regions[].id` | Stable region id, `[a-z0-9-]{1,64}`, unique. Matches the Geofabrik slug. Also the `packs/<id>/` directory name. |
| `regions[].name` | Human-readable label shown in the app. |
| `regions[].bbox` | `[west, south, east, north]` in WGS84 degrees, finite numbers. |
| `regions[].maxzoom` | Highest zoom present in the basemap. |
| `regions[].version` | Build date, `YYYYMMDD`; the app compares it to detect updates. |
| `files[].role` | `basemap` or `graph`. |
| `files[].transfer_name` | Asset name on the wire (the release asset). |
| `files[].installed_name` | File name after install, inside `packs/<id>/`. |
| `files[].url` | Direct `https://` download URL. |
| `files[].transfer_bytes` / `transfer_sha256` | Size and SHA-256 of the bytes that are downloaded. |
| `files[].installed_bytes` / `installed_sha256` | Size and SHA-256 of the bytes after decompression. |
| `files[].compression` | `identity` or `gzip`. |

The app downloads a region's files in order, verifies both the transfer hash and
the installed hash/length, and only then renames the `.part` file into place.
When `compression` is `gzip`, the transfer hash covers the compressed bytes and
the installed hash covers the decompressed bytes.

Contract limits: schema 1, unique ids matching `[a-z0-9-]{1,64}`, at most 64
regions and 32 files per region, positive byte counts, 64-char lowercase hex
hashes, `http(s)` URLs, and a catalog response under 1 MiB.

## Release layout

Each region is one GitHub release tagged `data-<region>-<YYYYMMDD>`:

```text
data-moldova-20261116/
  moldova.pmtiles              basemap (PMTiles, OpenMapTiles schema, zoom 0-14)
  moldova.graph.bin.gz         routing graph, gzip
  moldova-search.sqlite        FTS5 place search
  moldova-valhalla.tar         Valhalla tiles (server/desktop routing path)
  manifest.json                build metadata, file sizes and hashes
  ATTRIBUTION.md               OSM/ODbL attribution
```

The catalog lists the two files the map app installs (`basemap`, `graph`); the
search index and Valhalla tar ship in the same release for the native server
path. Release tags are immutable in practice: a same-day rebuild replaces that
day's release, and the catalog is regenerated in the same run.

## Limits

- **2 GiB per release asset.** GitHub Releases rejects larger files. Large
  countries are built with a lower `maxzoom` (workflow input) so each asset
  stays under the cap; splitting an asset into parts is not implemented yet.
- **No binaries in git.** Git files are capped at 100 MB, so packs live only in
  releases. `out/` and `app/` are gitignored.
- **Bandwidth.** GitHub Releases is not a CDN; heavy public traffic may be
  throttled. The catalog keeps the URL in one place, so moving to object
  storage is a data-only change.

## Adding a region

1. In the app repo, add the region to `scripts/offline/regions.json`: Geofabrik
   PBF URL, pinned PBF SHA-256 and byte size, bbox, `maxzoom`, and pinned
   Planetiler/Valhalla image digests. Merge that PR.
2. Run **Actions -> build-region -> Run workflow** with `region: <id>`
   (Geofabrik slug, e.g. `romania`). Optionally set `app_ref` to a tag or SHA
   for a reproducible build, and `maxzoom` to cap the basemap size.
3. The run publishes `data-<region>-<YYYYMMDD>` and commits the regenerated
   `catalog.json` to `main` as `github-actions[bot]`. Nothing is edited by hand.
4. Verify the release carries `manifest.json` and `ATTRIBUTION.md`, and spot
   check one hash:

   ```bash
   gh release download data-<region>-<YYYYMMDD> --pattern '<region>.pmtiles' --dir /tmp/pack
   sha256sum /tmp/pack/<region>.pmtiles
   ```

   It must equal the catalog entry's `transfer_sha256`.

Weekly schedule: `moldova`, `romania` (Mondays 03:17 UTC). Everything
else is on demand. The schedule list lives in the workflow matrix fallback; add
a region there to refresh it automatically. Scheduled builds always use
`app_ref: main` and each region's `maxzoom` from `regions.json`. Ukraine is
dispatch-only: its basemap phase needs 5.4-9.8 GB with a peak of 10-15 GB, more
than the 14 GB disk on `ubuntu-latest`, so it needs a larger/self-hosted runner
or a lower `maxzoom` cap:

```bash
gh workflow run build-region.yml -f region=ukraine -f maxzoom=10
```

## Workflow usage

`.github/workflows/build-region.yml`:

| Input | Required | Default | Purpose |
|---|---|---|---|
| `region` | yes | - | Region id to build. |
| `app_ref` | no | `main` | Pinpoint branch, tag or SHA providing `scripts/offline/`. |
| `maxzoom` | no | region config | Override the basemap maxzoom. |
| `dry_run` | no | `false` | Print the build plan and stop; no release, no catalog commit. |

What a run does: checks out this repo and the app at `app_ref`, installs Rust
stable (Docker and `pwsh` are preinstalled on `ubuntu-latest`), runs
`app/scripts/offline/build.ps1 -Region <region> -OutputRoot <workspace>/out`
(Planetiler basemap, search index, Valhalla tiles, `native-router` graph,
manifest, verification), creates the data release with the default
`GITHUB_TOKEN` (`contents: write`, `--prerelease --latest=false`), regenerates
`catalog.json` from the published files, and commits it to `main`. No extra
secrets are needed. The build step always passes `-AllowUnpinnedSource`:
scheduled builds follow Geofabrik `-latest`, so a changed extract warns and
records the downloaded hash instead of failing the run; Docker images stay
digest-pinned.

A concurrency group per region keeps one build in flight per region; queued
runs for the same region wait instead of racing. Different regions may run in
parallel.

### Dry run

```bash
gh workflow run build-region.yml -f region=romania -f app_ref=feat/global-maps -f dry_run=true
```

Validates `region` and `maxzoom`, checks out both repos and runs
`build.ps1 ... -DryRun -AllowUnpinnedSource`, which prints the planned download,
Planetiler/Valhalla Docker commands, `native-router` commands and the output
file list, then stops. No Docker, no Geofabrik download, no release and no
`catalog.json` change. The run still checks out both repos and installs Rust,
and `build.ps1` must be a ref that supports `-DryRun` (`feat/global-maps` until
that PR merges; older refs fail on the unknown parameter).

The multi-region build and catalog scripts live on the app repo branch
`feat/global-maps` until that PR merges. Before then pass
`app_ref: feat/global-maps` on every run (and pin a SHA once it is stable);
after the merge the default `main` is enough. `app_ref` stays the way to test a
script change before it lands on `main`.

## Attribution

Map data © OpenStreetMap contributors, available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Extracts come from [Geofabrik](https://download.geofabrik.de/); basemaps are
built with Planetiler using the OpenMapTiles schema; routing graphs are built by
Pinpoint's `native-router`. Every release ships `ATTRIBUTION.md` - keep it with
any redistributed copy. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Related

- App and build scripts: <https://github.com/Prince-of-Nothing/Pinpoint>
- Offline pack details: `docs/offline/moldova.md` and `docs/offline/native-routing.md`
  in the app repo.
