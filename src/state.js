// What the module knows about the booking (from the status endpoint), and the
// choices and formats built from it.

// Used until the first status arrives (the server sends its own lists)
const DEFAULT_CUES = {
	standby: 'Stand by',
	next: "You're on next",
	live: "You're live",
	wrap: 'Please wrap up',
	time: "Time's up",
	thanks: 'Thank you, all done',
	custom: 'Custom message',
}
const DEFAULT_BANNERS = {
	ok: 'All systems running',
	standby: 'Stand by',
	break: 'Comfort break',
	lunch: 'Lunch break',
	error: 'Technical problem',
	offline: 'Studio offline',
	custom: 'Custom message',
}
/** Packages go up to 24 seats: before the first status, seat choices go that far */
export const MAX_SEATS = 24

export function emptyState() {
	return { connected: false, booking: null, seats: [], banner: null, timer: null, presets: null }
}

export function seatCount(state) {
	return state.seats.length
}

export function seat(state, n) {
	return state.seats.find((s) => s.n === Number(n)) || null
}

export function seatChoices(state, withAll = false) {
	const seats = state.seats.length
		? state.seats.map((s) => ({ id: s.n, label: `Seat ${s.n}${s.name ? ': ' + s.name : ''}` }))
		: Array.from({ length: MAX_SEATS }, (_, i) => ({ id: i + 1, label: `Seat ${i + 1}` }))
	return withAll ? [{ id: 'all', label: 'Every presenter' }, ...seats] : seats
}

function presetChoices(list, fallback) {
	return Object.entries(list || fallback)
		.filter(([id]) => id !== 'none')
		.map(([id, label]) => ({ id, label: String(label) }))
}

export function cueChoices(state) {
	return presetChoices(state.presets && state.presets.cues, DEFAULT_CUES)
}

export function bannerChoices(state) {
	return presetChoices(state.presets && state.presets.banners, DEFAULT_BANNERS)
}

/** 4:05, 1:02:03, or +2:15 when a countdown with overtime has run out */
export function formatTimer(timer) {
	if (!timer) {
		return ''
	}
	const left = Number(timer.remaining) || 0
	if (left < 0 && !timer.overtime) {
		return '0:00'
	}
	const total = Math.abs(left)
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	const clock =
		h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
	return left < 0 ? `+${clock}` : clock
}

/** stopped | running | paused | overtime | finished */
export function timerState(timer) {
	if (!timer) {
		return 'stopped'
	}
	if (timer.paused) {
		return 'paused'
	}
	if (timer.remaining <= 0) {
		return timer.overtime ? 'overtime' : 'finished'
	}
	return 'running'
}

/** A short "what does the state look like" key, so definitions are only rebuilt when seats change */
export function shapeKey(state) {
	return JSON.stringify([state.seats.map((s) => [s.n, s.name]), state.presets])
}
