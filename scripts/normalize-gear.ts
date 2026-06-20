/**
 * One-time pass: rewrite quirky gear strings already stored in the database to
 * their preferred form (e.g. "R5m2" → "R5 Mark II"), using the same normalizeGear
 * map that new uploads run through. Targets PGlite locally, or Neon when
 * DATABASE_URL is set.
 *
 *   npm run normalize-gear
 *   DATABASE_URL=… npm run normalize-gear
 */
import { query } from '../src/lib/server/db-ops/connection';
import { normalizeGear } from '../src/lib/camera';

async function main() {
	const rows = await query<{ id: string; camera_make: string | null; camera_model: string | null }>(
		'SELECT id, camera_make, camera_model FROM photos'
	);
	let n = 0;
	for (const r of rows) {
		const make = normalizeGear(r.camera_make);
		const model = normalizeGear(r.camera_model);
		if (make !== r.camera_make || model !== r.camera_model) {
			await query('UPDATE photos SET camera_make = $1, camera_model = $2 WHERE id = $3', [
				make,
				model,
				r.id
			]);
			n++;
		}
	}
	console.log(`Normalized gear strings on ${n} photo${n === 1 ? '' : 's'}.`);
	process.exit(0);
}

main().catch((err) => {
	console.error('normalize-gear failed:', err);
	process.exit(1);
});
