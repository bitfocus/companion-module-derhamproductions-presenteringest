import { buttonSeats, formatTimer, timerState } from './state.js'

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
		timer_state: { name: 'Countdown state: stopped, running, paused, overtime or finished' },
	}
	for (const n of seatNumbers(state, presetSeats)) {
		defs[`seat_${n}_name`] = { name: `Seat ${n}: presenter name` }
		defs[`seat_${n}_online`] = { name: `Seat ${n}: on their page (true/false)` }
		defs[`seat_${n}_enabled`] = { name: `Seat ${n}: link on (true/false)` }
		defs[`seat_${n}_cue`] = { name: `Seat ${n}: current cue (blank when none)` }
	}
	return defs
}

export function variableValues(state, presetSeats = 0) {
	const values = {
		booking_title: state.booking ? state.booking.title : '',
		booking_state: state.booking ? state.booking.state : '',
		presenters_connected: state.seats.filter((s) => s.online).length,
		seats_on: state.seats.filter((s) => s.enabled).length,
		banner: state.banner ? state.banner.text : '',
		timer: formatTimer(state.timer),
		timer_seconds: state.timer ? state.timer.remaining : 0,
		timer_label: state.timer ? state.timer.label : '',
		timer_state: timerState(state.timer),
	}
	for (const n of seatNumbers(state, presetSeats)) {
		const s = state.seats.find((x) => x.n === n)
		// A preset seat the booking doesn't have (yet): named, but off and empty
		values[`seat_${n}_name`] = (s && s.name) || `Seat ${n}`
		values[`seat_${n}_online`] = !!(s && s.online)
		values[`seat_${n}_enabled`] = !!(s && s.enabled)
		values[`seat_${n}_cue`] = s && s.cue ? s.cue.text : ''
	}
	return values
}

/** The booking's seats and any preset-only seats, in order */
function seatNumbers(state, presetSeats) {
	const all = new Set([...state.seats.map((s) => s.n), ...buttonSeats(state, presetSeats)])
	return [...all].sort((a, b) => a - b)
}
