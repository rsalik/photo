/** Client-side cached fetch for gallery filter previews. */
export interface FilterPreview {
	count: number;
	photos: { id: string; width: number; height: number; blurData: string }[];
}

const cache = new Map<string, Promise<FilterPreview>>();

export function fetchFilterPreview(params: string): Promise<FilterPreview> {
	let hit = cache.get(params);
	if (!hit) {
		hit = fetch(`/api/filter-preview?${params}`).then((res) => {
			if (!res.ok) throw new Error(`preview failed: ${res.status}`);
			return res.json();
		});
		hit.catch(() => cache.delete(params));
		cache.set(params, hit);
	}
	return hit;
}
