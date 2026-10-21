import { formatTimer, timerState } from './state.js'

export function variableDefinitions(state) {
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
	for (const s of state.seats) {
		defs[`seat_${s.n}_name`] = { name: `Seat ${s.n}: presenter name` }
		defs[`seat_${s.n}_online`] = { name: `Seat ${s.n}: on their page (true/false)` }
		defs[`seat_${s.n}_enabled`] = { name: `Seat ${s.n}: link on (true/false)` }
		defs[`seat_${s.n}_cue`] = { name: `Seat ${s.n}: current cue (blank when none)` }
	}
	return defs
}

export function variableValues(state) {
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
	for (const s of state.seats) {
		values[`seat_${s.n}_name`] = s.name || `Seat ${s.n}`
		values[`seat_${s.n}_online`] = s.online
		values[`seat_${s.n}_enabled`] = s.enabled
		values[`seat_${s.n}_cue`] = s.cue ? s.cue.text : ''
	}
	return values
}
