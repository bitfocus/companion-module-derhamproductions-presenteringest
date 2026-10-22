import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { ApiError, cleanHost, DEFAULT_HOST, PresenterIngestApi, validKey } from './api.js'
import { actionDefinitions } from './actions.js'
import { feedbackDefinitions } from './feedbacks.js'
import { presetDefinitions } from './presets.js'
import { emptyState, MAX_SEATS, shapeKey } from './state.js'
import { variableDefinitions, variableValues } from './variables.js'
import { UpgradeScripts } from './upgrades.js'

export { UpgradeScripts }

export default class PresenterIngestInstance extends InstanceBase {
	async init(config, _isFirstInit, secrets) {
		this.state = emptyState()
		this.shape = null
		this.timer = null
		this.applyConfig(config, secrets)
		this.defineAll()
		this.schedule(0)
	}

	async destroy() {
		this.stopped = true
		clearTimeout(this.timer)
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
				type: 'number',
				id: 'interval',
				label: 'Check every (seconds)',
				width: 4,
				default: 1,
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
		this.interval = Math.min(10, Math.max(1, Number(this.config.interval) || 1)) * 1000
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
				seats: Array.isArray(data.seats) ? data.seats : [],
				banner: data.banner || null,
				timer: data.timer || null,
				presets: data.presets || null,
			}
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
