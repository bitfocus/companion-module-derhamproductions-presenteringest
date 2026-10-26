import { buttonSeats, callinSlots, cueChoices, formatTimer, guest, guestLabel, onAir, timerState } from './state.js'

export function variableDefinitions(state, presetSeats = 0) {
	const defs = {
		booking_title: { name: 'Booking name' },
		booking_state: { name: 'Booking state (upcoming, open, ended)' },
		presenters_connected: { name: 'Presenters on their page now' },
		seats_on: { name: 'Seats switched on' },
		banner: { name: 'Banner shown to presenters (blank when none)' },
		timer: { name: 'Countdown, e.g. 4:05 (or +0:30 in overtime)' },
		timer_seconds: { name: 'Countdown in seconds (negative in overtime)' },
		timer_label: { name: 'Countdown label' },
		timer_state: { name: 'Countdown state: stopped, set (not started), running, paused, overtime or finished' },
		timer_set: { name: 'Countdown set in Companion, not started yet (blank when none)' },
	}
	for (const n of seatNumbers(state, presetSeats)) {
		defs[`seat_${n}_name`] = { name: `Seat ${n}: presenter name` }
		defs[`seat_${n}_online`] = { name: `Seat ${n}: on their page (true/false)` }
		defs[`seat_${n}_enabled`] = { name: `Seat ${n}: link on (true/false)` }
		defs[`seat_${n}_cue`] = { name: `Seat ${n}: current cue (blank when none)` }
	}
	defs.callin_open = { name: 'Call in Q&A: queue open (true/false)' }
	defs.callin_waiting = { name: 'Call in Q&A: guests waiting' }
	defs.callin_next_name = { name: 'Call in Q&A: next guest (blank when nobody is waiting with their page open)' }
	defs.callin_next_org = { name: "Call in Q&A: next guest's organisation" }
	defs.callin_next_question = { name: "Call in Q&A: next guest's question" }
	for (const n of callinSlots(state)) {
		defs[`callin_slot_${n}_name`] = { name: `Guest slot ${n}: guest on air (blank when none)` }
		defs[`callin_slot_${n}_org`] = { name: `Guest slot ${n}: organisation` }
		defs[`callin_slot_${n}_label`] = { name: `Guest slot ${n}: name and organisation, for a title` }
		defs[`callin_slot_${n}_question`] = { name: `Guest slot ${n}: question` }
		defs[`callin_slot_${n}_on_air`] = { name: `Guest slot ${n}: time on air, e.g. 2:05` }
		defs[`callin_slot_${n}_online`] = { name: `Guest slot ${n}: guest has their page open (true/false)` }
		defs[`callin_slot_${n}_cue`] = { name: `Guest slot ${n}: current cue (blank when none)` }
	}
	return defs
}

export function variableValues(state, presetSeats = 0, now = Date.now()) {
	const staged = state.staged || null
	const values = {
		booking_title: state.booking ? state.booking.title : '',
		booking_state: state.booking ? state.booking.state : '',
		presenters_connected: state.seats.filter((s) => s.online).length,
		seats_on: state.seats.filter((s) => s.enabled).length,
		banner: state.banner ? state.banner.text : '',
		// With no countdown running, a set one shows instead, so the countdown button shows what Start will send
		timer: formatTimer(state.timer || (staged && { remaining: staged.seconds })),
		timer_seconds: state.timer ? state.timer.remaining : staged ? staged.seconds : 0,
		timer_label: state.timer ? state.timer.label : staged ? staged.label : '',
		timer_state: timerState(state.timer, staged),
		timer_set: staged ? formatTimer({ remaining: staged.seconds }) : '',
	}
	for (const n of seatNumbers(state, presetSeats)) {
		const s = state.seats.find((x) => x.n === n)
		// A preset seat the booking doesn't have (yet): named, but off and empty
		values[`seat_${n}_name`] = (s && s.name) || `Seat ${n}`
		values[`seat_${n}_online`] = !!(s && s.online)
		values[`seat_${n}_enabled`] = !!(s && s.enabled)
		values[`seat_${n}_cue`] = s && s.cue ? s.cue.text : ''
	}
	const callin = state.callin
	const next = callin && callin.next
	values.callin_open = !!(callin && callin.open)
	values.callin_waiting = callin ? callin.waiting : 0
	values.callin_next_name = next ? next.name : ''
	values.callin_next_org = next ? next.org : ''
	values.callin_next_question = next ? next.question : ''
	const cues = Object.fromEntries(cueChoices(state).map((c) => [c.id, c.label]))
	for (const n of callinSlots(state)) {
		const g = guest(state, n)
		values[`callin_slot_${n}_name`] = g ? g.name : ''
		values[`callin_slot_${n}_org`] = g ? g.org : ''
		values[`callin_slot_${n}_label`] = guestLabel(g)
		values[`callin_slot_${n}_question`] = g ? g.question : ''
		values[`callin_slot_${n}_on_air`] = onAir(g, now)
		values[`callin_slot_${n}_online`] = !!(g && g.online)
		values[`callin_slot_${n}_cue`] = g && g.cue ? cues[g.cue] || g.cue : ''
	}
	return values
}

/** The booking's seats and any preset-only seats, in order */
function seatNumbers(state, presetSeats) {
	const all = new Set([...state.seats.map((s) => s.n), ...buttonSeats(state, presetSeats)])
	return [...all].sort((a, b) => a - b)
}
