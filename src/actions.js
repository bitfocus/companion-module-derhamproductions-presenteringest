import { bannerChoices, cueChoices, hasCue, MAX_TIMER_SECONDS, seatChoices } from './state.js'

/**
 * Every action calls the API, then asks for a fresh status so buttons update at once.
 * `self` is the module instance (main.js): self.state, self.call(name, fn).
 */
export function actionDefinitions(self) {
	const seats = seatChoices(self.state, false, self.presetSeats)
	const seatsAll = seatChoices(self.state, true, self.presetSeats)
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
				{
					id: 'again',
					type: 'checkbox',
					label: 'Pressing again clears it',
					tooltip: 'When the seat (or every seat) already has this cue, the press clears it instead',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const n = cueSeat(options.seat)
				const cue = String(options.cue)
				const text = String(options.text || '')
				// Buttons made before this option existed toggle too
				if (options.again !== false && hasCue(self.state, n, cue, text)) {
					return self.call('Cue', (api) => api.setCue(n, 'none'))
				}
				return self.call('Cue', (api) => api.setCue(n, cue, text))
			},
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
				self.call('Countdown', async (api) => {
					await api.timer({
						mode: options.mode === 'until' ? 'until' : 'minutes',
						minutes: Number(options.minutes) || 0,
						until: String(options.until || ''),
						label: String(options.label || ''),
						overtime: !!options.overtime,
					})
					self.state = { ...self.state, staged: null }
				}),
		},

		timer_set: {
			name: 'Countdown: set, ready to start',
			description:
				'Gets a countdown ready without presenters seeing it. Adjust it (add or take away time, or turn a dial), then start it: press the countdown, or use Countdown: start the set time. It is kept in Companion only.',
			options: [
				{ id: 'minutes', type: 'number', label: 'Minutes', default: 5, min: 0.25, max: 600, step: 0.25 },
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
				self.setStaged({
					seconds: Math.min(MAX_TIMER_SECONDS, Math.max(0, Math.round((Number(options.minutes) || 0) * 60))),
					label: String(options.label || ''),
					overtime: !!options.overtime,
				}),
		},

		timer_start_set: {
			name: 'Countdown: start the set time',
			description: 'Starts the countdown set with Countdown: set, ready to start. Does nothing when none is set.',
			options: [],
			callback: async () => self.startStaged(),
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
			callback: async ({ options }) => {
				// Nothing running but a countdown set: toggle / resume starts it
				if (!self.state.timer && self.state.staged && options.mode !== 'pause') {
					return self.startStaged()
				}
				return self.call('Countdown', (api) => api.timer({ mode: String(options.mode) }))
			},
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
			callback: async ({ options }) => {
				if (!self.state.timer && self.state.staged) {
					return self.nudgeTimer(Number(options.seconds) || 0)
				}
				return self.call('Countdown', (api) => api.timer({ mode: 'adjust', seconds: Number(options.seconds) || 0 }))
			},
		},

		timer_nudge: {
			name: 'Countdown: nudge (for a dial)',
			description:
				'Adds or takes away time, for rotate left / right on a dial. Quick turns are added up and sent together, and the countdown here moves straight away.',
			options: [
				{
					id: 'seconds',
					type: 'number',
					label: 'Seconds per click (negative to take away)',
					default: 15,
					min: -600,
					max: 600,
					step: 1,
					asInteger: true,
				},
			],
			callback: async ({ options }) => self.nudgeTimer(Number(options.seconds) || 0),
		},

		timer_clear: {
			name: 'Countdown: clear',
			description: 'Takes the countdown off presenter pages, and forgets one set in Companion.',
			options: [],
			callback: async () => {
				self.setStaged(null)
				return self.call('Countdown', (api) => api.timer({ mode: 'clear' }))
			},
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
