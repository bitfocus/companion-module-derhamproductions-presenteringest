import { combineRgb } from '@companion-module/base'
import { bannerChoices, cueChoices, hasCue, seat, seatChoices, timerState } from './state.js'

export const COLOURS = {
	black: combineRgb(0, 0, 0),
	white: combineRgb(255, 255, 255),
	green: combineRgb(22, 163, 74),
	red: combineRgb(229, 64, 42),
	amber: combineRgb(217, 119, 6),
	blue: combineRgb(31, 111, 209),
	grey: combineRgb(64, 72, 88),
	night: combineRgb(13, 17, 24),
}

export function feedbackDefinitions(self) {
	const seats = seatChoices(self.state, false, self.presetSeats)
	const firstSeat = seats.length ? seats[0].id : 1
	const seatOption = {
		id: 'seat',
		type: 'dropdown',
		label: 'Seat',
		choices: seats,
		default: firstSeat,
		allowCustom: true,
	}
	const cues = [{ id: 'any', label: 'Any cue' }, ...cueChoices(self.state)]
	const banners = [{ id: 'any', label: 'Any banner' }, ...bannerChoices(self.state)]

	return {
		seat_online: {
			type: 'boolean',
			name: 'Seat: presenter is on their page',
			defaultStyle: { bgcolor: COLOURS.green, color: COLOURS.white },
			options: [seatOption],
			callback: ({ options }) => {
				const s = seat(self.state, options.seat)
				return !!(s && s.online)
			},
		},

		seat_off: {
			type: 'boolean',
			name: 'Seat: link is switched off',
			defaultStyle: { bgcolor: COLOURS.grey, color: COLOURS.black },
			options: [seatOption],
			callback: ({ options }) => {
				const s = seat(self.state, options.seat)
				return !!(s && !s.enabled)
			},
		},

		seat_cue: {
			type: 'boolean',
			name: 'Seat: has a cue',
			defaultStyle: { bgcolor: COLOURS.blue, color: COLOURS.white },
			description: 'With Every presenter, lit when they all have it',
			options: [
				{ ...seatOption, choices: seatChoices(self.state, true, self.presetSeats) },
				{ id: 'cue', type: 'dropdown', label: 'Cue', choices: cues, default: 'any' },
			],
			callback: ({ options }) => hasCue(self.state, options.seat === 'all' ? 'all' : Number(options.seat), String(options.cue)),
		},

		banner_shown: {
			type: 'boolean',
			name: 'Banner: showing',
			defaultStyle: { bgcolor: COLOURS.blue, color: COLOURS.white },
			options: [{ id: 'banner', type: 'dropdown', label: 'Banner', choices: banners, default: 'any' }],
			callback: ({ options }) =>
				!!(self.state.banner && (options.banner === 'any' || self.state.banner.preset === options.banner)),
		},

		timer_state: {
			type: 'boolean',
			name: 'Countdown: state',
			defaultStyle: { bgcolor: COLOURS.green, color: COLOURS.white },
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'When the countdown is',
					choices: [
						{ id: 'running', label: 'Running' },
						{ id: 'paused', label: 'Paused' },
						{ id: 'overtime', label: 'In overtime' },
						{ id: 'finished', label: 'Finished' },
						{ id: 'stopped', label: 'Not set' },
					],
					default: 'running',
				},
			],
			callback: ({ options }) => timerState(self.state.timer) === options.state,
		},

		timer_low: {
			type: 'boolean',
			name: 'Countdown: running with little time left',
			defaultStyle: { bgcolor: COLOURS.amber, color: COLOURS.black },
			options: [
				{ id: 'seconds', type: 'number', label: 'Seconds or fewer', default: 60, min: 1, max: 3600, asInteger: true },
			],
			callback: ({ options }) => {
				const t = self.state.timer
				return !!(t && !t.paused && t.remaining > 0 && t.remaining <= Number(options.seconds))
			},
		},

		connected: {
			type: 'boolean',
			name: 'Connection: talking to Presenter Ingest',
			description: 'True while the module is getting the booking (key and address are right, and the site answers).',
			defaultStyle: { bgcolor: COLOURS.green, color: COLOURS.white },
			options: [],
			callback: () => self.state.connected,
		},
	}
}
