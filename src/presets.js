import { COLOURS } from './feedbacks.js'
import { bannerChoices, buttonSeats, OFFLINE_SEATS } from './state.js'

// Short button words for the cue presets (the server's labels are longer)
const CUE_WORDS = {
	standby: 'Stand by',
	next: 'Next',
	live: 'Live',
	wrap: 'Wrap up',
	time: "Time's up",
	thanks: 'Thanks',
}

/**
 * What the seat sections say about which seats they cover, and how to change it.
 */
export function seatsNote(self) {
	const fixed = Number(self.presetSeats) || 0
	const booked = self.state.seats.length
	const plural = (n) => `${n} seat${n === 1 ? '' : 's'}`
	if (fixed > 0) {
		const extra =
			self.state.connected && booked < fixed
				? ` Your booking has ${plural(booked)}: the buttons for the others stay dark until the booking has them.`
				: ''
		return `Buttons for seats 1 to ${fixed}, as set under Preset seats in this connection's settings.${extra}`
	}
	if (self.state.connected) {
		return `Only the ${plural(booked)} on this booking get buttons. To build buttons for more seats (before extending to a bigger package, or while offline), set Preset seats in this connection's settings.`
	}
	return `Not connected yet, so these are for seats 1 to ${OFFLINE_SEATS}. Once connected, only the seats on your booking get buttons. To build buttons for a set number of seats, even offline, set Preset seats in this connection's settings.`
}

/**
 * Ready-made buttons for the seats from buttonSeats() (presets are rebuilt when they change).
 * @returns {[import('@companion-module/base').CompanionPresetSection[], import('@companion-module/base').CompanionPresetDefinitions]}
 */
export function presetDefinitions(self) {
	const v = (name) => `$(${self.label}:${name})`
	const seats = buttonSeats(self.state, self.presetSeats)
	const note = seatsNote(self)
	const presets = {}
	const style = (text, extra = {}) => ({ text, size: 'auto', color: COLOURS.white, bgcolor: COLOURS.night, ...extra })
	const press = (actionId, options) => [{ down: [{ actionId, options }], up: [] }]

	// Seats: name, green while they're on their page, grey when switched off; press to switch the link on/off
	for (const n of seats) {
		presets[`seat_${n}`] = {
			type: 'simple',
			name: `Seat ${n}: on their page / link on-off`,
			style: style(`${n}\\n${v(`seat_${n}_name`)}`),
			steps: press('seat_link', { seat: n, state: 'toggle' }),
			feedbacks: [
				{ feedbackId: 'seat_online', options: { seat: n }, style: { bgcolor: COLOURS.green, color: COLOURS.white } },
				{ feedbackId: 'seat_off', options: { seat: n }, style: { bgcolor: COLOURS.grey, color: COLOURS.black } },
			],
		}
		for (const [cue, word] of Object.entries(CUE_WORDS)) {
			presets[`cue_${cue}_${n}`] = {
				type: 'simple',
				name: `Seat ${n}: ${word}`,
				style: style(`${word}\\n${v(`seat_${n}_name`)}`, { size: '14' }),
				steps: press('cue_send', { seat: n, cue, text: '', again: true }),
				feedbacks: [
					{ feedbackId: 'seat_cue', options: { seat: n, cue }, style: { bgcolor: COLOURS.blue, color: COLOURS.white } },
				],
			}
		}
		presets[`cue_clear_${n}`] = {
			type: 'simple',
			name: `Seat ${n}: clear cue`,
			style: style(`Clear\\n${v(`seat_${n}_name`)}`, { size: '14' }),
			steps: press('cue_clear', { seat: n }),
			feedbacks: [
				{
					feedbackId: 'seat_cue',
					options: { seat: n, cue: 'any' },
					style: { bgcolor: COLOURS.blue, color: COLOURS.white },
				},
			],
		}
	}
	presets.cue_all_standby = {
		type: 'simple',
		name: 'Everyone: stand by',
		style: style('Stand by\\nEVERYONE', { size: '14' }),
		steps: press('cue_send', { seat: 'all', cue: 'standby', text: '', again: true }),
		feedbacks: [
			{
				feedbackId: 'seat_cue',
				options: { seat: 'all', cue: 'standby' },
				style: { bgcolor: COLOURS.blue, color: COLOURS.white },
			},
		],
	}
	presets.cue_all_clear = {
		type: 'simple',
		name: 'Everyone: clear cues',
		style: style('Clear cues\\nEVERYONE', { size: '14' }),
		steps: press('cue_clear', { seat: 'all' }),
		feedbacks: [],
	}

	// Countdown
	const timerFeedbacks = [
		{
			feedbackId: 'timer_state',
			options: { state: 'running' },
			style: { bgcolor: COLOURS.green, color: COLOURS.white },
		},
		{ feedbackId: 'timer_low', options: { seconds: 60 }, style: { bgcolor: COLOURS.amber, color: COLOURS.black } },
		{
			feedbackId: 'timer_state',
			options: { state: 'paused' },
			style: { bgcolor: COLOURS.amber, color: COLOURS.black },
		},
		{
			feedbackId: 'timer_state',
			options: { state: 'overtime' },
			style: { bgcolor: COLOURS.red, color: COLOURS.white },
		},
		{
			feedbackId: 'timer_state',
			options: { state: 'finished' },
			style: { bgcolor: COLOURS.red, color: COLOURS.white },
		},
	]
	presets.timer_display = {
		type: 'simple',
		name: 'Countdown: show (press to pause / resume)',
		style: style(v('timer'), { size: '24' }),
		steps: press('timer_pause', { mode: 'toggle' }),
		feedbacks: timerFeedbacks,
	}
	for (const minutes of [1, 2, 5, 10, 15, 30]) {
		presets[`timer_start_${minutes}`] = {
			type: 'simple',
			name: `Countdown: start ${minutes} min`,
			style: style(`Start\\n${minutes} min`, { size: '14' }),
			steps: press('timer_start', { mode: 'minutes', minutes, until: '', label: '', overtime: false }),
			feedbacks: [],
		}
	}
	presets.timer_plus = {
		type: 'simple',
		name: 'Countdown: +1 min',
		style: style('+1 min', { size: '18' }),
		steps: press('timer_adjust', { seconds: 60 }),
		feedbacks: [],
	}
	presets.timer_minus = {
		type: 'simple',
		name: 'Countdown: -1 min',
		style: style('-1 min', { size: '18' }),
		steps: press('timer_adjust', { seconds: -60 }),
		feedbacks: [],
	}
	presets.timer_pause = {
		type: 'simple',
		name: 'Countdown: pause / resume',
		style: style('Pause /\\nResume', { size: '14' }),
		steps: press('timer_pause', { mode: 'toggle' }),
		feedbacks: [
			{
				feedbackId: 'timer_state',
				options: { state: 'paused' },
				style: { bgcolor: COLOURS.amber, color: COLOURS.black },
			},
		],
	}
	presets.timer_clear = {
		type: 'simple',
		name: 'Countdown: clear',
		style: style('Clear\\ncountdown', { size: '14' }),
		steps: press('timer_clear', {}),
		feedbacks: [],
	}

	// Banners
	const banners = bannerChoices(self.state).filter((b) => b.id !== 'custom')
	for (const b of banners) {
		presets[`banner_${b.id}`] = {
			type: 'simple',
			name: `Banner: ${b.label}`,
			style: style(b.label, { size: '14' }),
			steps: press('banner_show', { banner: b.id, text: '', until: '' }),
			feedbacks: [
				{
					feedbackId: 'banner_shown',
					options: { banner: b.id },
					style: { bgcolor: COLOURS.blue, color: COLOURS.white },
				},
			],
		}
	}
	presets.banner_clear = {
		type: 'simple',
		name: 'Banner: clear',
		style: style('Clear\\nbanner', { size: '14' }),
		steps: press('banner_clear', {}),
		feedbacks: [
			{
				feedbackId: 'banner_shown',
				options: { banner: 'any' },
				style: { bgcolor: COLOURS.blue, color: COLOURS.white },
			},
		],
	}

	// Status
	presets.status_connected = {
		type: 'simple',
		name: 'On their page now',
		style: style(`${v('presenters_connected')}/${v('seats_on')}\\non page`, { size: '14', bgcolor: COLOURS.red }),
		steps: press('refresh', {}),
		feedbacks: [{ feedbackId: 'connected', options: {}, style: { bgcolor: COLOURS.night, color: COLOURS.white } }],
	}

	const cueGroups = Object.entries(CUE_WORDS).map(([cue, word]) => ({
		id: `cue-${cue}`,
		type: 'simple',
		name: word,
		presets: seats.map((n) => `cue_${cue}_${n}`),
	}))
	const structure = [
		{
			id: 'seats',
			name: 'Seats',
			description: `Green while the presenter is on their page, grey when the link is off. Press to switch the link on or off. ${note}`,
			definitions: seats.map((n) => `seat_${n}`).concat('status_connected'),
		},
		{
			id: 'cues',
			name: 'Cues',
			description: `Send a cue to one presenter. Blue while that cue is showing. ${note}`,
			definitions: [
				...cueGroups,
				{ id: 'cue-clear', type: 'simple', name: 'Clear', presets: seats.map((n) => `cue_clear_${n}`) },
				{ id: 'cue-all', type: 'simple', name: 'Everyone', presets: ['cue_all_standby', 'cue_all_clear'] },
			],
		},
		{
			id: 'countdown',
			name: 'Countdown',
			description: 'The countdown on every presenter page.',
			definitions: [
				'timer_display',
				...[1, 2, 5, 10, 15, 30].map((m) => `timer_start_${m}`),
				'timer_plus',
				'timer_minus',
				'timer_pause',
				'timer_clear',
			],
		},
		{
			id: 'banners',
			name: 'Banners',
			description: 'The banner on every presenter page. Blue while it is showing.',
			definitions: banners.map((b) => `banner_${b.id}`).concat('banner_clear'),
		},
	]

	return [structure, presets]
}
