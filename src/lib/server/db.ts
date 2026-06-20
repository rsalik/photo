// Public data-layer surface. The Postgres connection (PGlite locally, Neon in
// production) initializes itself and creates the schema lazily on first query.
export * from './db-ops/connection';
export * from './db-ops/read';
export * from './db-ops/write';
export * from './db-ops/settings';
