import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { ApiError, cleanHost, DEFAULT_HOST, PresenterIngestApi, validKey } from './api.js'
import { actionDefinitions } from './actions.js'
import { feedbackDefinitions } from './feedbacks.js'
import { presetDefinitions } from './presets.js'
import { emptyState, MAX_SEATS, MAX_TIMER_SECONDS, seatsFromStatus, shapeKey } from './state.js'
import { variableDefinitions, variableValues } from './variables.js'
import { UpgradeScripts } from './upgrades.js'

export { UpgradeScripts }

/** Dial turns are added up and sent at most this often */
const NUDGE_MS = 400

/** Seconds between checks unless set otherwise (the countdown ticks in Companion in between) */
export const DEFAULT_INTERVAL = 3

export default class PresenterIngestInstance extends InstanceBase {
	async init(config, _isFirstInit, secrets) {
		this.state = emptyState()
		this.shape = null
		this.timer = null
		this.applyConfig(config, secrets)
		this.defineAll()
		this.schedule(0)
		// The countdown counts down here between checks, so checks can be a few seconds apart
		this.tickAt = Date.now()
		this.ticker = setInterval(() => this.tick(), 250)
	}

	async destroy() {
		this.stopped = true
		clearTimeout(this.timer)
		clearTimeout(this.nudgeTimeout)
		clearInterval(this.ticker)
	}

	async configUpdated(config, secrets) {
		clearTimeout(this.timer)
		this.state = emptyState()
		this.shape = null
		this.applyConfig(config, secrets)
		this.defineAll()
		this.schedule(0)
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'intro',
				width: 12,
				label: 'Connect a Presenter Ingest booking',
				value:
					'On your booking page at presenteringest.com, press Connect Companion under Bitfocus Companion and paste the key here. The key works for that booking only; anyone who has it can control its presenters, so keep it private.',
			},
			{
				type: 'secret-text',
				id: 'key',
				label: 'Companion key',
				width: 12,
				regex: '/^pic1_[a-z0-9]{4,40}_[a-z0-9]{40}$/',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Site address',
				tooltip: 'Leave as it is unless you have been told otherwise. Must start with https://',
				width: 8,
				default: DEFAULT_HOST,
			},
			{
				type: 'dropdown',
				id: 'preset_seats',
				label: 'Preset seats',
				tooltip:
					'Which seats get ready-made buttons under Presets. Match my booking shows only the seats on the booking. A number builds buttons for that many seats, connected or not, so you can set up pages offline or before moving to a bigger package.',
				width: 8,
				default: 0,
				choices: [
					{ id: 0, label: 'Match my booking' },
					...Array.from({ length: MAX_SEATS }, (_, i) => ({ id: i + 1, label: `${i + 1} seat${i ? 's' : ''}` })),
				],
			},
			{
				type: 'checkbox',
				id: 'show_names',
				label: 'Show presenter names',
				tooltip:
					'On: buttons, variables and seat lists show each presenter’s name from the booking. Off: just Seat 1, Seat 2 and so on, for a Companion screen other people can see. Names are then not kept in Companion at all.',
				width: 4,
				default: true,
			},
			{
				type: 'number',
				id: 'interval',
				label: 'Check every (seconds)',
				tooltip:
					'How often to fetch the booking. The countdown keeps counting in between, and button presses fetch it straight away, so 3 is plenty; less means more requests to the site.',
				width: 4,
				default: DEFAULT_INTERVAL,
				min: 1,
				max: 10,
				asInteger: true,
			},
		]
	}

	applyConfig(config, secrets) {
		this.config = config || {}
		const key = String((secrets && secrets.key) || '').trim()
		this.api = new PresenterIngestApi(this.config.host, key)
		this.interval = Math.min(10, Math.max(1, Number(this.config.interval) || DEFAULT_INTERVAL)) * 1000
		// Missing in configs saved before 0.3.0: names on, as before
		this.showNames = this.config.show_names !== false
		this.presetSeats = Math.min(MAX_SEATS, Math.max(0, Math.floor(Number(this.config.preset_seats) || 0)))
		if (cleanHost(this.config.host) === null) {
			this.updateStatus(InstanceStatus.BadConfig, 'The site address must start with https://')
		} else if (!validKey(key)) {
			this.updateStatus(
				InstanceStatus.BadConfig,
				key ? 'That doesn’t look like a Companion key' : 'Paste the booking’s Companion key',
			)
		} else {
			this.updateStatus(InstanceStatus.Connecting)
		}
	}

	// ---------------------------------------------------------------- polling

	schedule(delay) {
		clearTimeout(this.timer)
		if (!this.stopped && this.api.usable) {
			this.timer = setTimeout(() => this.poll(), delay)
		}
	}

	async poll() {
		clearTimeout(this.timer)
		if (this.polling) {
			return
		}
		this.polling = true
		let next = this.interval
		try {
			const data = await this.api.status()
			this.state = {
				connected: true,
				booking: data.booking || null,
				seats: seatsFromStatus(data.seats, this.showNames),
				banner: data.banner || null,
				timer: data.timer || null,
				presets: data.presets || null,
				staged: this.state.staged,
			}
			// Dial turns not sent yet: keep showing them on top of what the site says
			if (this.nudgePending && this.state.timer) {
				this.state.timer = { ...this.state.timer, remaining: this.state.timer.remaining + this.nudgePending }
			}
			this.tickAt = Date.now()
			this.updateStatus(InstanceStatus.Ok, data.booking ? data.booking.title : null)
		} catch (e) {
			next = this.failed(e)
		} finally {
			this.polling = false
		}
		this.publish()
		this.schedule(next)
	}

	/** Shows the problem and says how long to wait before trying again */
	failed(e) {
		const wasConnected = this.state.connected
		this.state = { ...this.state, connected: false }
		if (!(e instanceof ApiError)) {
			this.updateStatus(InstanceStatus.UnknownError, 'Unexpected error')
			return 10000
		}
		if (e.status === 401) {
			// A wrong or replaced key: no point asking often
			this.updateStatus(
				InstanceStatus.AuthenticationFailure,
				'The key was not accepted. Make a new one on the booking page.',
			)
			return 60000
		}
		if (e.status === 403) {
			this.updateStatus(InstanceStatus.InsufficientPermissions, 'This booking is not paid or was cancelled')
			return 60000
		}
		if (e.status === 429) {
			this.updateStatus(InstanceStatus.UnknownWarning, 'Too many requests: slowing down')
			return Math.max(5, e.retryAfter || 5) * 1000
		}
		this.updateStatus(InstanceStatus.ConnectionFailure, e.message)
		if (wasConnected) {
			this.log('warn', `Presenter Ingest: ${e.message}`)
		}
		return Math.min(30000, this.interval * 5)
	}

	/** Pushes the state to variables and feedbacks, and rebuilds definitions when the seats change */
	publish() {
		const shape = shapeKey(this.state)
		if (shape !== this.shape) {
			this.shape = shape
			this.defineAll()
		}
		this.setVariableValues(variableValues(this.state, this.presetSeats))
		this.checkAllFeedbacks()
	}

	defineAll() {
		this.setActionDefinitions(actionDefinitions(this))
		this.setFeedbackDefinitions(feedbackDefinitions(this))
		this.setVariableDefinitions(variableDefinitions(this.state, this.presetSeats))
		const [structure, presets] = presetDefinitions(this)
		this.setPresetDefinitions(structure, presets)
	}

	/**
	 * Dial turns: shown on the countdown at once, then added up and sent at most every
	 * NUDGE_MS, so a fast spin is a request or two rather than dozens (the site allows
	 * about 10 a second per booking). Does nothing without a countdown.
	 */
	nudgeTimer(seconds) {
		if (!seconds) {
			return
		}
		if (!this.state.timer) {
			// A countdown set but not started is adjusted here in Companion
			if (this.state.staged) {
				const total = Math.min(MAX_TIMER_SECONDS, Math.max(0, this.state.staged.seconds + seconds))
				this.setStaged({ ...this.state.staged, seconds: total })
			}
			return
		}
		this.nudgePending = (this.nudgePending || 0) + seconds
		this.state = { ...this.state, timer: { ...this.state.timer, remaining: this.state.timer.remaining + seconds } }
		this.setVariableValues(variableValues(this.state, this.presetSeats))
		this.checkAllFeedbacks()
		if (!this.nudgeTimeout) {
			this.nudgeTimeout = setTimeout(() => {
				this.nudgeTimeout = null
				const total = this.nudgePending
				this.nudgePending = 0
				if (total) {
					this.call('Countdown', (api) => api.timer({ mode: 'adjust', seconds: total }))
				}
			}, NUDGE_MS)
		}
	}

	/**
	 * Counts a running countdown down (or up, in overtime) between checks, a whole second at
	 * a time from when the site last said where it was. Stops at 0:00 unless it counts overtime.
	 */
	tick() {
		const t = this.state.timer
		const now = Date.now()
		const whole = Math.floor((now - (this.tickAt || now)) / 1000)
		if (!t || t.paused || whole < 1 || (t.remaining <= 0 && !t.overtime)) {
			if (whole >= 1) this.tickAt += whole * 1000
			return
		}
		this.tickAt += whole * 1000
		this.state = { ...this.state, timer: { ...t, remaining: t.remaining - whole } }
		this.setVariableValues(variableValues(this.state, this.presetSeats))
		this.checkAllFeedbacks()
	}

	/** Sets up a countdown in Companion without starting it (null to forget it) */
	setStaged(staged) {
		this.state = { ...this.state, staged }
		this.setVariableValues(variableValues(this.state, this.presetSeats))
		this.checkAllFeedbacks()
	}

	/** Starts the set countdown on every presenter page; it stays set if the site refuses it */
	async startStaged() {
		const s = this.state.staged
		if (!s || s.seconds <= 0) {
			return
		}
		await this.call('Countdown', async (api) => {
			await api.timer({ mode: 'minutes', minutes: s.seconds / 60, label: s.label, overtime: s.overtime })
			this.state = { ...this.state, staged: null }
		})
	}

	/** Runs an action's API call, logs a refusal, and refreshes straight away */
	async call(what, fn) {
		try {
			await fn(this.api)
		} catch (e) {
			const message = e instanceof ApiError ? e.message : 'Unexpected error'
			this.log('warn', `${what}: ${message}`)
			if (e instanceof ApiError && e.status === 401) {
				this.failed(e)
			}
		}
		await this.poll()
	}
}
