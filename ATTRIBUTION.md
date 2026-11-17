# Attribution

Map data © OpenStreetMap contributors, available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See <https://www.openstreetmap.org/copyright>.

Every file in a `data-*` release is derived from OpenStreetMap and carries the
same ODbL obligations:

- **OSM extracts** are downloaded from [Geofabrik](https://download.geofabrik.de/).
  The exact extract URL and pinned SHA-256 for each region live in
  `scripts/offline/regions.json` in the
  [Pinpoint app repo](https://github.com/Prince-of-Nothing/Pinpoint).
- **Basemap** (`<region>.pmtiles`) is generated with
  [Planetiler](https://github.com/onthegomap/planetiler) using the
  [OpenMapTiles](https://github.com/openmaptiles/openmaptiles) schema. The
  resulting vector tiles are a database derived from OSM data and remain
  subject to ODbL 1.0.
- **Routing graph** (`<region>.graph.bin`) is produced by Pinpoint's
  `native-router` from the same OSM extract; it is a derived database under
  ODbL 1.0.
- **Search index** (`<region>-search.sqlite`) and **Valhalla tiles**
  (`<region>-valhalla.tar`) are likewise derived from the same extract under
  ODbL 1.0.

If you redistribute these files, a modified extract, or a database built from
them, keep this attribution, the ODbL license text/link, and the share-alike
terms. Do not present the data as official OpenStreetMap output.

Data is provided "as is", without warranty of any kind. Do not rely on it for
navigation where a map or routing error could cause harm.
