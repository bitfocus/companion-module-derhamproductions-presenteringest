import { bannerChoices, cueChoices, seatChoices } from './state.js'

/**
 * Every action calls the API, then asks for a fresh status so buttons update at once.
 * `self` is the module instance (main.js): self.state, self.call(name, fn).
 */
export function actionDefinitions(self) {
	const seats = seatChoices(self.state)
	const seatsAll = seatChoices(self.state, true)
	const firstSeat = seats.length ? seats[0].id : 1
	const cues = cueChoices(self.state)
	const banners = bannerChoices(self.state)

	const seatOption = (choices = seats, def = firstSeat) => ({
		id: 'seat',
		type: 'dropdown',
		label: 'Seat',
		choices,
		default: def,
		allowCustom: true,
	})

	return {
		seat_link: {
			name: 'Seat: switch link on / off',
			description: 'A seat that is off blocks its presenter link; open presenter pages follow within seconds.',
			options: [
				seatOption(),
				{
					id: 'state',
					type: 'dropdown',
					label: 'Set to',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
					],
					default: 'toggle',
				},
			],
			callback: async ({ options }) =>
				self.call('Seat', (api) => api.setSeat(Number(options.seat), String(options.state))),
		},

		cue_send: {
			name: 'Cue: send to a presenter',
			options: [
				seatOption(seatsAll, firstSeat),
				{ id: 'cue', type: 'dropdown', label: 'Cue', choices: cues, default: cues[0] ? cues[0].id : 'standby' },
				{
					id: 'text',
					type: 'textinput',
					label: 'Custom message',
					default: '',
					useVariables: true,
					isVisibleExpression: "$(options:cue) == 'custom'",
				},
			],
			callback: async ({ options }) =>
				self.call('Cue', (api) => api.setCue(cueSeat(options.seat), String(options.cue), String(options.text || ''))),
		},

		cue_clear: {
			name: 'Cue: clear',
			options: [seatOption(seatsAll, 'all')],
			callback: async ({ options }) => self.call('Cue', (api) => api.setCue(cueSeat(options.seat), 'none')),
		},

		banner_show: {
			name: 'Banner: show to every presenter',
			options: [
				{
					id: 'banner',
					type: 'dropdown',
					label: 'Banner',
					choices: banners,
					default: banners[0] ? banners[0].id : 'ok',
				},
				{
					id: 'text',
					type: 'textinput',
					label: 'Custom message',
					default: '',
					useVariables: true,
					isVisibleExpression: "$(options:banner) == 'custom'",
				},
				{ id: 'until', type: 'textinput', label: 'Back at (optional, e.g. 14:30)', default: '', useVariables: true },
			],
			callback: async ({ options }) =>
				self.call('Banner', (api) =>
					api.setBanner(String(options.banner), String(options.text || ''), String(options.until || '')),
				),
		},

		banner_clear: {
			name: 'Banner: clear',
			options: [],
			callback: async () => self.call('Banner', (api) => api.setBanner('none')),
		},

		timer_start: {
			name: 'Countdown: start',
			description: 'Starts a countdown on every presenter page: for a number of minutes, or to a time of day.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Count down',
					choices: [
						{ id: 'minutes', label: 'For a number of minutes' },
						{ id: 'until', label: 'To a time of day' },
					],
					default: 'minutes',
				},
				{
					id: 'minutes',
					type: 'number',
					label: 'Minutes',
					default: 5,
					min: 0.25,
					max: 600,
					step: 0.25,
					isVisibleExpression: "$(options:mode) == 'minutes'",
				},
				{
					id: 'until',
					type: 'textinput',
					label: 'Time (HH:MM)',
					default: '14:30',
					useVariables: true,
					isVisibleExpression: "$(options:mode) == 'until'",
				},
				{
					id: 'label',
					type: 'textinput',
					label: 'Label (optional, e.g. Session starts in)',
					default: '',
					useVariables: true,
				},
				{ id: 'overtime', type: 'checkbox', label: 'Count up in overtime when it runs out', default: false },
			],
			callback: async ({ options }) =>
				self.call('Countdown', (api) =>
					api.timer({
						mode: options.mode === 'until' ? 'until' : 'minutes',
						minutes: Number(options.minutes) || 0,
						until: String(options.until || ''),
						label: String(options.label || ''),
						overtime: !!options.overtime,
					}),
				),
		},

		timer_pause: {
			name: 'Countdown: pause / resume',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 'toggle', label: 'Toggle pause' },
						{ id: 'pause', label: 'Pause' },
						{ id: 'resume', label: 'Resume' },
					],
					default: 'toggle',
				},
			],
			callback: async ({ options }) => self.call('Countdown', (api) => api.timer({ mode: String(options.mode) })),
		},

		timer_adjust: {
			name: 'Countdown: add or take away time',
			options: [
				{
					id: 'seconds',
					type: 'number',
					label: 'Seconds (negative to take away)',
					default: 60,
					min: -3600,
					max: 3600,
					step: 1,
					asInteger: true,
				},
			],
			callback: async ({ options }) =>
				self.call('Countdown', (api) => api.timer({ mode: 'adjust', seconds: Number(options.seconds) || 0 })),
		},

		timer_clear: {
			name: 'Countdown: clear',
			options: [],
			callback: async () => self.call('Countdown', (api) => api.timer({ mode: 'clear' })),
		},

		refresh: {
			name: 'Refresh now',
			description: 'Fetch the booking straight away (it is also checked every second or so).',
			options: [],
			callback: async () => self.poll(),
		},
	}
}

function cueSeat(value) {
	return value === 'all' ? 'all' : Number(value)
}
