import { initSchema } from './db-ops/schema';

// Run database migrations and setup on initialization.
initSchema();

export * from './db-ops/connection';
export * from './db-ops/read';
export * from './db-ops/write';
export * from './db-ops/settings';

// Ensure the db instance is exported as default for backward compatibility
import { db } from './db-ops/connection';
export default db;
