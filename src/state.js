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
	// staged: a countdown set up in Companion but not started ({ seconds, label, overtime }), which
	// presenters don't see until it's started
	// callin: Call in Q&A (null when the booking doesn't have it), from callinFromStatus()
	return {
		connected: false,
		booking: null,
		seats: [],
		banner: null,
		timer: null,
		presets: null,
		staged: null,
		callin: null,
	}
}

/** The longest countdown the site takes (600 minutes) */
export const MAX_TIMER_SECONDS = 36000

/** The seats from a status reply; with names off, the names are dropped there and then, never kept */
export function seatsFromStatus(seats, showNames = true) {
	if (!Array.isArray(seats)) {
		return []
	}
	return showNames ? seats : seats.map((s) => ({ ...s, name: '' }))
}

export function seatCount(state) {
	return state.seats.length
}

export function seat(state, n) {
	return state.seats.find((s) => s.n === Number(n)) || null
}

/**
 * Whether a seat (or, for "all", every seat) has this cue right now. "any" matches any cue;
 * a custom message only matches the same text.
 */
export function hasCue(state, n, cue, text = '') {
	const seats = n === 'all' ? state.seats : state.seats.filter((s) => s.n === Number(n))
	return (
		seats.length > 0 &&
		seats.every(
			(s) => s.cue && (cue === 'any' || (s.cue.preset === cue && (cue !== 'custom' || s.cue.text === text))),
		)
	)
}

export function seatChoices(state, withAll = false, presetSeats = 0) {
	const booked = state.seats.map((s) => ({ id: s.n, label: `Seat ${s.n}${s.name ? ': ' + s.name : ''}` }))
	// Before connecting, any seat a package can have; after, the booking's seats plus any preset-only ones
	const extra = (
		state.seats.length ? buttonSeats(state, presetSeats) : Array.from({ length: MAX_SEATS }, (_, i) => i + 1)
	)
		.filter((n) => !state.seats.some((s) => s.n === n))
		.map((n) => ({ id: n, label: `Seat ${n}` }))
	const seats = [...booked, ...extra].sort((a, b) => a.id - b.id)
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

/** stopped | set (in Companion, not started) | running | paused | overtime | finished */
export function timerState(timer, staged = null) {
	if (!timer) {
		return staged ? 'set' : 'stopped'
	}
	if (timer.paused) {
		return 'paused'
	}
	if (timer.remaining <= 0) {
		return timer.overtime ? 'overtime' : 'finished'
	}
	return 'running'
}

/** Seats shown before the first status, when presets match the booking */
export const OFFLINE_SEATS = 8

/**
 * The seat numbers that get preset buttons and variables. With Preset seats set
 * (1-24), that many, connected or not, so pages can be built offline or ahead of
 * a bigger booking. Otherwise the booking's own seats (8 until it's connected).
 */
export function buttonSeats(state, presetSeats = 0) {
	const fixed = Math.min(MAX_SEATS, Math.max(0, Math.floor(Number(presetSeats) || 0)))
	if (fixed > 0) {
		return Array.from({ length: fixed }, (_, i) => i + 1)
	}
	if (state.seats.length) {
		return state.seats.map((s) => s.n)
	}
	return Array.from({ length: OFFLINE_SEATS }, (_, i) => i + 1)
}

/** A short "what does the state look like" key, so definitions are only rebuilt when seats or guest slots change */
export function shapeKey(state) {
	return JSON.stringify([state.seats.map((s) => [s.n, s.name]), state.presets, state.callin && callinSlots(state)])
}

// ---------------------------------------------------------------- Call in Q&A

/** Bookings have 1, 2 or 4 guest slots */
export const MAX_GUEST_SLOTS = 4
/** Guest slots that get preset buttons before the booking says how many it has */
export const OFFLINE_GUEST_SLOTS = 2

/**
 * Call in Q&A from a status reply: { open, waiting, next, slots: [{ n, ready, guest }] }, or
 * null when the booking doesn't have it. With names off, guests' names (just "Guest"),
 * organisations and questions are dropped there and then, as presenter names are. Each guest on air gets
 * `since` (when they went on air, by this computer's clock) so the time on air can tick;
 * it's kept from the last check while it agrees to within 2 seconds, so the clock doesn't
 * jump back a second at each check.
 */
export function callinFromStatus(callin, showNames = true, now = Date.now(), previous = null) {
	if (!callin || typeof callin !== 'object' || !Array.isArray(callin.slots)) {
		return null
	}
	const person = (p) => (showNames ? p : { ...p, name: 'Guest', org: '', question: '' })
	return {
		open: !!callin.open,
		waiting: Math.max(0, Number(callin.waiting) || 0),
		next: callin.next ? person(callin.next) : null,
		slots: callin.slots.map((s) => {
			if (!s.guest) {
				return { n: Number(s.n), ready: !!s.ready, guest: null }
			}
			let since = now - (Number(s.guest.on_air) || 0) * 1000
			const before = previous && previous.slots.find((p) => p.n === Number(s.n))
			if (before && before.guest && Math.abs(before.guest.since - since) < 2000) {
				since = before.guest.since
			}
			return { n: Number(s.n), ready: !!s.ready, guest: { ...person(s.guest), since } }
		}),
	}
}

/** The guest slot numbers: the booking's, or OFFLINE_GUEST_SLOTS until it says */
export function callinSlots(state) {
	if (state.callin && state.callin.slots.length) {
		return state.callin.slots.map((s) => s.n)
	}
	return Array.from({ length: OFFLINE_GUEST_SLOTS }, (_, i) => i + 1)
}

/** The guest on air in a slot, or null */
export function guest(state, n) {
	const slot = state.callin ? state.callin.slots.find((s) => s.n === Number(n)) : null
	return (slot && slot.guest) || null
}

export function slotChoices(state, withFirstFree = false) {
	const numbers = state.callin
		? callinSlots(state)
		: Array.from({ length: MAX_GUEST_SLOTS }, (_, i) => i + 1)
	// No guest names here: they change with every call, and the lists are only rebuilt when the slots do
	const slots = numbers.map((n) => ({ id: n, label: `Guest slot ${n}` }))
	return withFirstFree ? [{ id: 0, label: 'First free slot' }, ...slots] : slots
}

/** "Name, Organisation", or whichever there is */
export function guestLabel(g) {
	return g ? [g.name, g.org].filter(Boolean).join(', ') : ''
}

/** How long a guest has been on air, as 4:05 */
export function onAir(g, now = Date.now()) {
	if (!g) {
		return ''
	}
	return formatTimer({ remaining: Math.max(0, Math.floor((now - g.since) / 1000)) })
}
