<script module lang="ts">
	export type IconName =
		| 'camera'
		| 'lens'
		| 'aperture'
		| 'shutter'
		| 'iso'
		| 'focal'
		| 'location'
		| 'calendar'
		| 'tag'
		| 'album'
		| 'search'
		| 'chevron'
		| 'x'
		| 'check'
		| 'plus'
		| 'arrow-left'
		| 'edit'
		| 'star'
		| 'film'
		| 'grid'
		| 'list'
		| 'arrow-right'
		| 'sliders'
		| 'drag';
</script>

<script lang="ts">
	interface Props {
		name: IconName;
		size?: number;
		class?: string;
	}
	let { name, size = 14, class: className = '' }: Props = $props();

	const PATHS: Record<IconName, string> = {
		camera:
			'M14.5 5l1.6 2.2H20a1.6 1.6 0 0 1 1.6 1.6v9.6A1.6 1.6 0 0 1 20 20H4a1.6 1.6 0 0 1-1.6-1.6V8.8A1.6 1.6 0 0 1 4 7.2h3.9L9.5 5h5z M12 16.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z',
		lens: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4z M16.8 4.4l-1.5 2.8',
		aperture:
			'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M14.31 8l5.74 9.94 M9.69 8h11.48 M7.38 12l5.74-9.94 M9.69 16L3.95 6.06 M14.31 16H2.83 M16.62 12l-5.74 9.94',
		shutter: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 9.5V13l2.4 1.6 M9.8 2.5h4.4',
		iso: 'M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V6A1.5 1.5 0 0 1 4 4.5z M6.5 9.5v5 M12.9 9.5h-2a1.25 1.25 0 0 0 0 2.5h1.2a1.25 1.25 0 0 1 0 2.5H9.9 M16.4 9.5h.9a1.3 1.3 0 0 1 1.3 1.3v2.4a1.3 1.3 0 0 1-1.3 1.3h-.9a1.3 1.3 0 0 1-1.3-1.3v-2.4a1.3 1.3 0 0 1 1.3-1.3z',
		focal: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M22 12h-3.5 M5.5 12H2 M12 5.5V2 M12 22v-3.5',
		location: 'M19.5 10c0 5.4-7.5 11.5-7.5 11.5S4.5 15.4 4.5 10a7.5 7.5 0 0 1 15 0z M12 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
		calendar: 'M5 4.8h14A1.7 1.7 0 0 1 20.7 6.5v13A1.7 1.7 0 0 1 19 21.2H5a1.7 1.7 0 0 1-1.7-1.7v-13A1.7 1.7 0 0 1 5 4.8z M16 2.8v4 M8 2.8v4 M3.3 10.4h17.4',
		tag: 'M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z M7.6 8.1a.6.6 0 1 0 0-1.2.6.6 0 0 0 0 1.2z',
		album: 'M8.5 3.5H20A1.5 1.5 0 0 1 21.5 5v11.5 M5.5 7h12A1.5 1.5 0 0 1 19 8.5V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V8.5A1.5 1.5 0 0 1 5.5 7z M4 16.5l4.2-4 3.6 3.4 2.7-2.5L19 17.6',
		search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-5-5',
		chevron: 'M6 9l6 6 6-6',
		x: 'M18 6L6 18 M6 6l12 12',
		check: 'M20 6L9 17l-5-5',
		plus: 'M12 5v14 M5 12h14',
		'arrow-left': 'M19 12H5 M12 19l-7-7 7-7',
		edit: 'M17 3.5a2.6 2.6 0 0 1 3.7 3.7L7.8 20.1 2.5 21.5l1.4-5.3z M14.5 6l3.5 3.5',
		star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
		film: 'M4 3.5h16a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z M7.5 3.5v17 M16.5 3.5v17 M3 8h4.5 M3 12h4.5 M3 16h4.5 M16.5 8H21 M16.5 12H21 M16.5 16H21',
		grid: 'M4 4h6.5v6.5H4z M13.5 4h6.5v6.5h-6.5z M4 13.5h6.5V20H4z M13.5 13.5h6.5V20h-6.5z',
		list: 'M9 5.5h11 M9 12h11 M9 18.5h11 M4.5 5.5h.01 M4.5 12h.01 M4.5 18.5h.01',
		'arrow-right': 'M5 12h14 M12 5l7 7-7 7',
		sliders:
			'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4.5v5 M9 14.5v5 M15 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
		drag: 'M9 5.5h.01 M15 5.5h.01 M9 12h.01 M15 12h.01 M9 18.5h.01 M15 18.5h.01'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	class="inline-block shrink-0 {className}"
	aria-hidden="true"
>
	<path d={PATHS[name]} />
</svg>
