/**
 * How a camera's EXIF make + model combine into one display string. The model
 * often already contains the brand ("Canon EOS R5"), so we only prepend the make
 * when it doesn't — avoiding "Canon Canon EOS R5" while still turning a bare
 * "EOS R5" + "Canon" into "Canon EOS R5".
 */
export function cameraLabel(make?: string | null, model?: string | null): string {
	if (model && make && !model.toLowerCase().startsWith(make.toLowerCase())) {
		return `${make} ${model}`;
	}
	return model ?? '';
}

/**
 * Normalize quirky EXIF gear strings to the preferred display form. Cameras
 * write their own model names ("EOS R5m2"); this rewrites them to how we'd
 * rather show them ("EOS R5 Mark II"). Applied on upload and by the one-time
 * normalize script. Add new aliases here.
 */
const GEAR_ALIASES: [RegExp, string][] = [[/R5m2/gi, 'R5 Mark II']];

export function normalizeGear<T extends string | null | undefined>(value: T): T {
	if (!value) return value;
	let v: string = value;
	for (const [re, to] of GEAR_ALIASES) v = v.replace(re, to);
	return v as T;
}
