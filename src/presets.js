import { COLOURS } from './feedbacks.js'
import { bannerChoices, buttonSeats, callinSlots, guest, onAir, OFFLINE_SEATS } from './state.js'

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
	// The presets list draws buttons without their variables, so variable buttons get a preview
	const preview = (text, extra = {}) => ({ text, ...extra })
	const nameOf = (n) => {
		const s = self.state.seats.find((x) => x.n === n)
		return (s && s.name) || `Seat ${n}`
	}

	// Seats: name, green while they're on their page, grey when switched off. A tap only ever switches the
	// link on; switching it off takes a hold, so a stray press can't cut a presenter off
	const HOLD_MS = 1000
	for (const n of seats) {
		presets[`seat_${n}`] = {
			type: 'simple',
			name: `Seat ${n}: on their page / tap for on, hold for off`,
			style: style(`${n}\\n${v(`seat_${n}_name`)}`),
			previewStyle: preview(`${n}\\n${nameOf(n)}`),
			steps: [
				{
					down: [],
					up: [{ actionId: 'seat_link', options: { seat: n, state: 'on' } }],
					[HOLD_MS]: {
						options: { runWhileHeld: true },
						actions: [{ actionId: 'seat_link', options: { seat: n, state: 'off' } }],
					},
				},
			],
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
				previewStyle: preview(`${word}\\n${nameOf(n)}`),
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
			previewStyle: preview(`Clear\\n${nameOf(n)}`),
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
		{
			feedbackId: 'timer_state',
			options: { state: 'set' },
			style: { bgcolor: COLOURS.blue, color: COLOURS.white },
		},
	]
	// The live countdown, or one set and ready to start (blue). On a dial (Stream Deck +, Loupedeck),
	// turning adds or takes away time and pressing starts / pauses / resumes
	presets.timer_display = {
		type: 'simple',
		name: 'Countdown: show (press to start / pause / resume; turn a dial for ±15 s)',
		keywords: ['timer', 'rotary', 'dial', 'knob', 'encoder'],
		style: style(v('timer'), { size: '24' }),
		previewStyle: preview('4:05', { bgcolor: COLOURS.green }),
		steps: [
			{
				down: [{ actionId: 'timer_pause', options: { mode: 'toggle' } }],
				up: [],
				rotate_left: [{ actionId: 'timer_nudge', options: { seconds: -15 } }],
				rotate_right: [{ actionId: 'timer_nudge', options: { seconds: 15 } }],
			},
		],
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
		// Set it without starting: presenters see nothing until it's started
		presets[`timer_set_${minutes}`] = {
			type: 'simple',
			name: `Countdown: set ${minutes} min, ready to start`,
			style: style(`Set\\n${minutes} min`, { size: '14' }),
			steps: press('timer_set', { minutes, label: '', overtime: false }),
			feedbacks: [],
		}
	}
	presets.timer_start_set = {
		type: 'simple',
		name: 'Countdown: start the set time',
		style: style(`Start\\n${v('timer_set')}`, { size: '14' }),
		previewStyle: preview('Start\\n5:00'),
		steps: press('timer_start_set', {}),
		feedbacks: [
			{
				feedbackId: 'timer_state',
				options: { state: 'set' },
				style: { bgcolor: COLOURS.blue, color: COLOURS.white },
			},
		],
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
			steps: press('banner_show', { banner: b.id, text: '', until: '', again: true }),
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
		previewStyle: preview(
			`${self.state.seats.filter((s) => s.online).length}/${self.state.seats.filter((s) => s.enabled).length}\\non page`,
		),
		steps: press('refresh', {}),
		feedbacks: [{ feedbackId: 'connected', options: {}, style: { bgcolor: COLOURS.night, color: COLOURS.white } }],
	}

	// Call in Q&A: the queue, bring in the next guest, and a button per guest slot that ends the
	// call on a hold (like switching a seat off), with cues for the guest on air
	const callin = self.state.callin
	const slots = callinSlots(self.state)
	presets.callin_queue = {
		type: 'simple',
		name: 'Call in Q&A: queue open / closed, with guests waiting',
		style: style(`Q&A queue\\n${v('callin_waiting')} waiting`, { size: '14', bgcolor: COLOURS.grey }),
		previewStyle: preview(`Q&A queue\\n${callin ? callin.waiting : 0} waiting`),
		steps: press('callin_queue', { state: 'toggle' }),
		feedbacks: [{ feedbackId: 'callin_open', options: {}, style: { bgcolor: COLOURS.green, color: COLOURS.white } }],
	}
	presets.callin_admit = {
		type: 'simple',
		name: 'Call in Q&A: bring in the next guest',
		style: style(`Bring in\\n${v('callin_next_name')}`, { size: '14' }),
		previewStyle: preview(`Bring in\\n${(callin && callin.next && callin.next.name) || ''}`),
		steps: press('callin_admit', { slot: 0 }),
		feedbacks: [
			{ feedbackId: 'callin_waiting', options: { count: 1 }, style: { bgcolor: COLOURS.amber, color: COLOURS.black } },
		],
	}
	for (const n of slots) {
		const g = guest(self.state, n)
		presets[`callin_slot_${n}`] = {
			type: 'simple',
			name: `Guest slot ${n}: on air / hold to end the call`,
			style: style(`G${n} ${v(`callin_slot_${n}_on_air`)}\\n${v(`callin_slot_${n}_name`)}`, { size: '14' }),
			previewStyle: preview(`G${n} ${onAir(g)}\\n${(g && g.name) || ''}`),
			steps: [
				{
					down: [],
					up: [],
					[HOLD_MS]: {
						options: { runWhileHeld: true },
						actions: [{ actionId: 'callin_end', options: { slot: n } }],
					},
				},
			],
			feedbacks: [
				{ feedbackId: 'callin_slot_live', options: { slot: n }, style: { bgcolor: COLOURS.red, color: COLOURS.white } },
				{
					feedbackId: 'callin_slot_lost',
					options: { slot: n },
					style: { bgcolor: COLOURS.amber, color: COLOURS.black },
				},
			],
		}
		for (const cue of ['wrap', 'time', 'thanks']) {
			presets[`callin_cue_${cue}_${n}`] = {
				type: 'simple',
				name: `Guest slot ${n}: ${CUE_WORDS[cue]}`,
				style: style(`${CUE_WORDS[cue]}\\nGuest ${n}`, { size: '14' }),
				steps: press('callin_cue', { slot: n, cue, text: '', again: true }),
				feedbacks: [
					{
						feedbackId: 'callin_slot_cue',
						options: { slot: n, cue },
						style: { bgcolor: COLOURS.blue, color: COLOURS.white },
					},
				],
			}
		}
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
			description: `Green while the presenter is on their page, grey when the link is off. Tap to switch the link on; hold for a second to switch it off, so a stray press can't cut anyone off. ${note}`,
			definitions: seats.map((n) => `seat_${n}`).concat('status_connected'),
		},
		{
			id: 'cues',
			name: 'Cues',
			description: `Send a cue to one presenter. Blue while that cue is showing; press again to clear it. ${note}`,
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
				...[1, 2, 5, 10, 15, 30].map((m) => `timer_set_${m}`),
				'timer_start_set',
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
		{
			id: 'callin',
			name: 'Call in Q&A',
			description:
				`For bookings with Call in Q&A. Queue: green while open, showing how many are waiting. Bring in: amber while someone is waiting; puts the next guest into the first free guest slot. Guest slot buttons: red while a guest is on air, with their name and time on air, amber if they close their page; hold for a second to end the call. ${
					self.state.connected && !callin
						? "This booking doesn't have Call in Q&A: add it on the booking page."
						: callin
							? ''
							: `Not connected yet, so these are for guest slots 1 to ${slots.length}.`
				}`.trim(),
			definitions: [
				'callin_queue',
				'callin_admit',
				...slots.map((n) => `callin_slot_${n}`),
				...['wrap', 'time', 'thanks'].map((cue) => ({
					id: `callin-${cue}`,
					type: 'simple',
					name: CUE_WORDS[cue],
					presets: slots.map((n) => `callin_cue_${cue}_${n}`),
				})),
			],
		},
	]

	return [structure, presets]
}
