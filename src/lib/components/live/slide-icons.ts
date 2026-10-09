import {
	ArrowDownWideNarrow,
	ChartColumn,
	CircleCheckBig,
	Cloud,
	Gauge,
	Keyboard,
	ListOrdered,
	MessageSquareText,
	MessagesSquare,
	ShieldQuestion,
	SlidersHorizontal,
	Split,
	Target,
	TrafficCone
} from '@lucide/svelte';
import type { Component } from 'svelte';
import type { SlideKind } from '$lib/live/types';

export const SLIDE_ICONS: Record<SlideKind, Component<{ class?: string }>> = {
	select_answer: CircleCheckBig,
	type_answer: Keyboard,
	pick_number: SlidersHorizontal,
	lineup: ListOrdered,
	multiple_choice: ChartColumn,
	this_or_that: Split,
	traffic_lights: TrafficCone,
	truth_or_lie: ShieldQuestion,
	word_cloud: Cloud,
	open_ended: MessageSquareText,
	scales: Gauge,
	guess_number: Target,
	ranking: ArrowDownWideNarrow,
	qa: MessagesSquare
};

/**
 * Stage accent per slide kind (a --color-* token). Tints the ambient glow,
 * the intro card and the kind chip so each kind has its own mood.
 */
export const SLIDE_ACCENT: Record<SlideKind, string> = {
	select_answer: 'var(--color-sun)',
	type_answer: 'var(--color-chart-3)',
	pick_number: 'var(--color-chart-4)',
	lineup: 'var(--color-chart-5)',
	multiple_choice: 'var(--color-green-300)',
	this_or_that: 'var(--color-chart-4)',
	traffic_lights: 'var(--color-green-300)',
	truth_or_lie: 'var(--color-chart-5)',
	word_cloud: 'var(--color-chart-3)',
	open_ended: 'var(--color-sun)',
	scales: 'var(--color-chart-3)',
	guess_number: 'var(--color-chart-4)',
	ranking: 'var(--color-chart-5)',
	qa: 'var(--color-sun)'
};
