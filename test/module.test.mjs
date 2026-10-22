// node --test test/module.test.mjs  (yarn test)
// Offline checks always run. The live checks run against a Presenter Ingest site when
// PI_TEST_HOST and PI_TEST_KEY are set (use a local dev site and a test booking).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanHost, validKey, PresenterIngestApi, ApiError } from '../src/api.js'
import { formatTimer, timerState, seatChoices, emptyState, buttonSeats, seatsFromStatus, hasCue } from '../src/state.js'
import { actionDefinitions } from '../src/actions.js'
import { feedbackDefinitions } from '../src/feedbacks.js'
import { presetDefinitions, seatsNote } from '../src/presets.js'
import { variableDefinitions, variableValues } from '../src/variables.js'

const KEY = 'pic1_booking01_' + 'a'.repeat(40)

test('only sends the key to https addresses (http only for this computer)', () => {
	assert.equal(cleanHost(''), 'https://presenteringest.com')
	assert.equal(cleanHost('https://presenteringest.com/some/path?x=1'), 'https://presenteringest.com')
	assert.equal(cleanHost('http://presenteringest.com'), null)
	assert.equal(cleanHost('http://192.168.1.10'), null)
	assert.equal(cleanHost('ftp://presenteringest.com'), null)
	assert.equal(cleanHost('https://user:pass@presenteringest.com'), null)
	assert.equal(cleanHost('not a url'), null)
	assert.equal(cleanHost('http://localhost:8014'), 'http://localhost:8014')
	assert.equal(cleanHost('http://127.0.0.1:8014'), 'http://127.0.0.1:8014')
})

test('checks the key looks right', () => {
	assert.ok(validKey(KEY))
	assert.ok(!validKey('pic1_booking01_short'))
	assert.ok(!validKey(''))
	assert.ok(!validKey(KEY + ' extra'))
})

test('sends the key in a header, never in the address, and refuses redirects', async () => {
	const calls = []
	const fake = async (url, init) => {
		calls.push({ url, init })
		return new Response(JSON.stringify({ ok: true, seats: [] }), { status: 200 })
	}
	const api = new PresenterIngestApi('https://presenteringest.com', KEY, fake)
	await api.status()
	await api.setSeat(2, 'toggle')
	assert.equal(calls[0].url, 'https://presenteringest.com/pi-api/companion/v1/status')
	assert.ok(!calls[0].url.includes(KEY))
	assert.equal(calls[0].init.headers['X-Presenter-Ingest-Key'], KEY)
	assert.equal(calls[0].init.redirect, 'error')
	assert.equal(calls[1].init.method, 'POST')
	assert.deepEqual(JSON.parse(calls[1].init.body), { n: 2, action: 'toggle' })
})

test("errors don't contain the key", async () => {
	const down = async () => {
		throw new TypeError(`fetch failed for ${KEY}`)
	}
	const refused = async () =>
		new Response(JSON.stringify({ ok: false, error: 'invalid_key', message: 'Not valid' }), { status: 401 })
	for (const fake of [down, refused]) {
		const api = new PresenterIngestApi('https://presenteringest.com', KEY, fake)
		await assert.rejects(
			api.status(),
			(e) => e instanceof ApiError && !e.message.includes(KEY) && !e.message.includes('aaaa'),
		)
	}
})

test('does nothing without a usable address and key', async () => {
	let called = false
	const api = new PresenterIngestApi('http://example.com', KEY, async () => {
		called = true
	})
	await assert.rejects(api.status())
	assert.equal(called, false)
})

test('formats the countdown', () => {
	assert.equal(formatTimer(null), '')
	assert.equal(formatTimer({ remaining: 245 }), '4:05')
	assert.equal(formatTimer({ remaining: 3723 }), '1:02:03')
	assert.equal(formatTimer({ remaining: -30, overtime: true }), '+0:30')
	assert.equal(formatTimer({ remaining: -30, overtime: false }), '0:00')
	assert.equal(timerState(null), 'stopped')
	assert.equal(timerState({ paused: true, remaining: 40 }), 'paused')
	assert.equal(timerState({ remaining: 40 }), 'running')
	assert.equal(timerState({ remaining: -3, overtime: true }), 'overtime')
	assert.equal(timerState({ remaining: 0 }), 'finished')
})

function fakeInstance(state) {
	return { state, label: 'pi', calls: [], async call(what, fn) {}, async poll() {} }
}

const STATE = {
	...emptyState(),
	connected: true,
	booking: { title: 'Summit', state: 'open' },
	seats: [
		{ n: 1, name: 'Priya', enabled: true, online: true, cue: { preset: 'next', text: "You're on next" } },
		{ n: 2, name: '', enabled: false, online: false, cue: null },
	],
	banner: { preset: 'break', text: 'Studio comfort break', until: '14:30' },
	timer: { label: 'Back in', running: true, paused: false, overtime: false, remaining: 45 },
}

test('builds actions, feedbacks, variables and presets for the seats', () => {
	const self = fakeInstance(STATE)
	const actions = actionDefinitions(self)
	assert.deepEqual(
		actions.seat_link.options[0].choices.map((c) => c.id),
		[1, 2],
	)
	assert.equal(seatChoices(STATE, true)[0].id, 'all')

	const feedbacks = feedbackDefinitions(self)
	assert.equal(feedbacks.seat_online.callback({ options: { seat: 1 } }), true)
	assert.equal(feedbacks.seat_online.callback({ options: { seat: 2 } }), false)
	assert.equal(feedbacks.seat_off.callback({ options: { seat: 2 } }), true)
	assert.equal(feedbacks.seat_cue.callback({ options: { seat: 1, cue: 'next' } }), true)
	assert.equal(feedbacks.seat_cue.callback({ options: { seat: 1, cue: 'live' } }), false)
	assert.equal(feedbacks.banner_shown.callback({ options: { banner: 'any' } }), true)
	assert.equal(feedbacks.timer_low.callback({ options: { seconds: 60 } }), true)
	assert.equal(feedbacks.timer_state.callback({ options: { state: 'running' } }), true)

	const defs = variableDefinitions(STATE)
	const values = variableValues(STATE)
	for (const id of Object.keys(values)) {
		assert.ok(defs[id], `variable ${id} has a definition`)
	}
	assert.equal(values.presenters_connected, 1)
	assert.equal(values.seat_2_name, 'Seat 2')
	assert.equal(values.timer, '0:45')

	const [structure, presets] = presetDefinitions(self)
	const ids = new Set(Object.keys(presets))
	for (const section of structure) {
		for (const def of section.definitions) {
			const refs = typeof def === 'string' ? [def] : def.presets
			for (const ref of refs) {
				assert.ok(ids.has(ref), `preset ${ref} exists`)
			}
		}
	}
	// presets only use actions and feedbacks that exist
	for (const p of Object.values(presets)) {
		for (const step of p.steps) {
			const held = Object.keys(step).filter((k) => /^\d+$/.test(k)).flatMap((k) => step[k].actions)
			const turns = [...(step.rotate_left || []), ...(step.rotate_right || [])]
			for (const a of [...step.down, ...step.up, ...held, ...turns]) assert.ok(actions[a.actionId], `action ${a.actionId}`)
			if (p.style.text.includes('$(')) {
				assert.ok(p.previewStyle && !p.previewStyle.text.includes('$('), `${p.name} has a preview`)
			}
		}
		for (const f of p.feedbacks) assert.ok(feedbacks[f.feedbackId], `feedback ${f.feedbackId}`)
	}
	assert.match(presets.seat_1.style.text, /\$\(pi:seat_1_name\)/)
	// A seat button: a tap only switches on, switching off needs a one-second hold
	const seatStep = presets.seat_1.steps[0]
	assert.deepEqual(seatStep.down, [])
	assert.deepEqual(seatStep.up.map((a) => a.options.state), ['on'])
	assert.equal(seatStep[1000].options.runWhileHeld, true)
	assert.deepEqual(seatStep[1000].actions.map((a) => a.options.state), ['off'])
})

test('a cue button pressed again clears the cue', async () => {
	const standby = { preset: 'standby', text: 'Stand by' }
	const sent = []
	const self = {
		presetSeats: 0,
		state: { ...emptyState(), connected: true, seats: [{ n: 1, cue: standby }, { n: 2, cue: null }] },
		call: async (_what, fn) => fn({ setCue: async (...args) => sent.push(args) }),
	}
	const send = actionDefinitions(self).cue_send.callback
	await send({ options: { seat: 1, cue: 'standby', text: '' } })
	await send({ options: { seat: 2, cue: 'standby', text: '' } })
	await send({ options: { seat: 1, cue: 'next', text: '' } })
	await send({ options: { seat: 1, cue: 'standby', text: '', again: false } })
	await send({ options: { seat: 'all', cue: 'standby', text: '' } })
	assert.deepEqual(sent, [
		[1, 'none'],
		[2, 'standby', ''],
		[1, 'next', ''],
		[1, 'standby', ''],
		['all', 'standby', ''],
	])
	self.state.seats[1].cue = standby
	assert.ok(hasCue(self.state, 'all', 'standby'))
	await send({ options: { seat: 'all', cue: 'standby', text: '' } })
	assert.deepEqual(sent.at(-1), ['all', 'none'])
	const custom = { ...emptyState(), seats: [{ n: 1, cue: { preset: 'custom', text: 'Hello' } }] }
	assert.ok(hasCue(custom, 1, 'custom', 'Hello'))
	assert.ok(!hasCue(custom, 1, 'custom', 'Bye'))
	assert.ok(hasCue(custom, 1, 'any'))
	assert.ok(!hasCue(custom, 2, 'any'))
})

test('Show presenter names off: just seat numbers everywhere', () => {
	const status = [
		{ n: 1, name: 'Jane Example', enabled: true, online: true, cue: null },
		{ n: 2, name: 'Sam Sample', enabled: false, online: false, cue: null },
	]
	assert.equal(seatsFromStatus(status)[0].name, 'Jane Example')
	assert.deepEqual(seatsFromStatus(undefined), [])
	const state = { ...emptyState(), connected: true, seats: seatsFromStatus(status, false) }
	assert.equal(status[0].name, 'Jane Example', 'the reply itself is left alone')
	const text = JSON.stringify([state, seatChoices(state, true), variableValues(state)])
	assert.ok(!text.includes('Jane') && !text.includes('Sam'))
	assert.equal(variableValues(state).seat_1_name, 'Seat 1')
	assert.equal(seatChoices(state)[0].label, 'Seat 1')
	assert.equal(state.seats[0].online, true)
})

test("Preset seats: the booking's seats by default, or a set number even offline", () => {
	const offline = emptyState()
	assert.deepEqual(buttonSeats(offline), [1, 2, 3, 4, 5, 6, 7, 8])
	assert.deepEqual(
		buttonSeats(offline, 12),
		Array.from({ length: 12 }, (_, i) => i + 1),
	)
	assert.deepEqual(buttonSeats(STATE), [1, 2])
	assert.deepEqual(buttonSeats(STATE, 4), [1, 2, 3, 4])
	assert.deepEqual(
		buttonSeats(STATE, 99),
		Array.from({ length: 24 }, (_, i) => i + 1),
	)

	// The presets page says which seats it covers and where to change it
	assert.match(seatsNote({ state: STATE, presetSeats: 0 }), /Only the 2 seats on this booking/)
	assert.match(seatsNote({ state: STATE, presetSeats: 0 }), /Preset seats/)
	assert.match(seatsNote({ state: offline, presetSeats: 0 }), /Not connected yet, so these are for seats 1 to 8/)
	assert.match(seatsNote({ state: STATE, presetSeats: 4 }), /seats 1 to 4.*Your booking has 2 seats/)

	// Built for 4 seats on a 2-seat booking: buttons and working variables for all 4
	const self = { state: STATE, label: 'pi', presetSeats: 4, async call() {}, async poll() {} }
	const [structure, presets] = presetDefinitions(self)
	assert.ok(presets.seat_4 && presets.cue_live_4 && presets.cue_clear_4)
	assert.match(structure.find((s) => s.id === 'seats').description, /seats 1 to 4/)
	const values = variableValues(STATE, 4)
	assert.equal(values.seat_4_name, 'Seat 4')
	assert.equal(values.seat_4_online, false)
	assert.ok(variableDefinitions(STATE, 4).seat_4_cue)
	assert.ok(actionDefinitions(self).seat_link.options[0].choices.some((c) => c.id === 4))
})

// ---------------------------------------------------------------- live
const host = process.env.PI_TEST_HOST
const key = process.env.PI_TEST_KEY
test(
	'live: status and every kind of change',
	{ skip: !host || !key ? 'set PI_TEST_HOST and PI_TEST_KEY' : false },
	async () => {
		// Paced like someone pressing buttons: the API allows 10 requests a second per booking
		const paced = async (url, init) => {
			await new Promise((r) => setTimeout(r, 150))
			return fetch(url, init)
		}
		const api = new PresenterIngestApi(host, key, paced)
		const status = await api.status()
		assert.equal(status.ok, true)
		assert.ok(status.seats.length > 0)
		const json = JSON.stringify(status)
		for (const word of ['email', 'secret', 'vmix_key', 'http_', 'whip', 'globalcue', 'hash']) {
			assert.ok(!json.includes(word), `status mentions ${word}`)
		}

		const before = status.seats[0].enabled
		assert.equal((await api.setSeat(1, 'toggle')).enabled, !before)
		assert.equal((await api.setSeat(1, before ? 'on' : 'off')).enabled, before)

		await api.setCue(1, 'next')
		assert.equal((await api.status()).seats[0].cue.preset, 'next')
		await api.setCue('all', 'none')
		assert.equal((await api.status()).seats[0].cue, null)

		await api.setBanner('break', '', '14:30')
		assert.equal((await api.status()).banner.preset, 'break')
		await api.setBanner('none')

		await api.timer({ mode: 'minutes', minutes: 5, label: 'Test' })
		let t = (await api.status()).timer
		assert.ok(t.running && t.remaining > 290)
		await api.timer({ mode: 'toggle' })
		assert.equal((await api.status()).timer.paused, true)
		await api.timer({ mode: 'adjust', seconds: 60 })
		await api.timer({ mode: 'toggle' })
		t = (await api.status()).timer
		assert.ok(t.running && t.remaining > 340)
		await api.timer({ mode: 'clear' })
		assert.equal((await api.status()).timer, null)

		await assert.rejects(api.setSeat(99, 'on'), (e) => e.status === 404)
		await assert.rejects(
			new PresenterIngestApi(host, 'pic1_nosuch0001_' + 'b'.repeat(40)).status(),
			(e) => e.status === 401 || e.status === 429,
		)
	},
)

test('a dial on the countdown: turns show at once and are sent together', async () => {
	const { default: Instance } = await import('../src/main.js')
	const sent = []
	const self = {
		presetSeats: 0,
		state: { ...emptyState(), connected: true, timer: { remaining: 300, paused: false, overtime: false, label: '' } },
		shown: [],
		setVariableValues(values) {
			this.shown.push(values.timer)
		},
		checkAllFeedbacks() {},
		call: async (_what, fn) => fn({ timer: async (body) => sent.push(body) }),
	}
	const nudge = (s) => Instance.prototype.nudgeTimer.call(self, s)
	nudge(15)
	nudge(15)
	nudge(-15)
	nudge(15)
	assert.deepEqual(self.shown, ['5:15', '5:30', '5:15', '5:30'])
	assert.deepEqual(sent, [])
	await new Promise((r) => setTimeout(r, 500))
	assert.deepEqual(sent, [{ mode: 'adjust', seconds: 30 }])
	// No countdown: nothing to nudge
	self.state.timer = null
	nudge(15)
	await new Promise((r) => setTimeout(r, 500))
	assert.equal(sent.length, 1)

	// The countdown preset turns with the dial, and previews a time instead of its variable
	const [, presets] = presetDefinitions({ ...self, label: 'pi', state: emptyState() })
	const step = presets.timer_display.steps[0]
	assert.deepEqual(step.rotate_right[0], { actionId: 'timer_nudge', options: { seconds: 15 } })
	assert.deepEqual(step.rotate_left[0], { actionId: 'timer_nudge', options: { seconds: -15 } })
	assert.equal(presets.timer_display.previewStyle.text, '4:05')
	assert.ok(!presets.seat_1.previewStyle.text.includes('$('))
})

test('a countdown set in Companion: adjusted, then started; presenters see nothing before', async () => {
	const { default: Instance } = await import('../src/main.js')
	const sent = []
	let refuse = false
	const self = Object.create(Instance.prototype)
	Object.assign(self, {
		presetSeats: 0,
		state: { ...emptyState(), connected: true },
		shown: {},
		setVariableValues(values) {
			this.shown = values
		},
		checkAllFeedbacks() {},
		async call(_what, fn) {
			try {
				await fn({
					timer: async (body) => {
						if (refuse) throw new Error('refused')
						sent.push(body)
					},
				})
			} catch {
				// logged by the real call()
			}
		},
	})
	const actions = () => actionDefinitions(self)
	await actions().timer_set.callback({ options: { minutes: 5, label: 'Session starts in', overtime: true } })
	assert.equal(self.shown.timer, '5:00')
	assert.equal(self.shown.timer_state, 'set')
	await actions().timer_adjust.callback({ options: { seconds: 60 } })
	self.nudgeTimer(-15)
	self.nudgeTimer(-15)
	assert.equal(self.shown.timer_set, '5:30')
	assert.deepEqual(sent, [], 'nothing sent while it is only set')
	// Pausing does nothing to a set countdown; a refused start keeps it set
	await actions().timer_pause.callback({ options: { mode: 'pause' } })
	assert.deepEqual(sent, [{ mode: 'pause' }])
	sent.length = 0
	refuse = true
	await actions().timer_pause.callback({ options: { mode: 'toggle' } })
	assert.equal(self.state.staged.seconds, 330)
	refuse = false
	await actions().timer_pause.callback({ options: { mode: 'toggle' } })
	assert.deepEqual(sent, [{ mode: 'minutes', minutes: 5.5, label: 'Session starts in', overtime: true }])
	assert.equal(self.state.staged, null)
	// Clear forgets a set one too
	await actions().timer_set.callback({ options: { minutes: 2, label: '', overtime: false } })
	await actions().timer_clear.callback({ options: {} })
	assert.equal(self.state.staged, null)
	assert.equal(timerState(null, null), 'stopped')
})

test('a banner button pressed again clears the banner', async () => {
	const sent = []
	const self = {
		presetSeats: 0,
		state: { ...emptyState(), connected: true, banner: { preset: 'break', text: 'Comfort break', until: '14:30' } },
		call: async (_what, fn) => fn({ setBanner: async (...args) => sent.push(args) }),
	}
	const show = actionDefinitions(self).banner_show.callback
	await show({ options: { banner: 'break', text: '', until: '' } })
	await show({ options: { banner: 'lunch', text: '', until: '' } })
	await show({ options: { banner: 'break', text: '', until: '', again: false } })
	self.state.banner = { preset: 'custom', text: 'Hello', until: '' }
	await show({ options: { banner: 'custom', text: 'Hello', until: '' } })
	await show({ options: { banner: 'custom', text: 'Bye', until: '' } })
	self.state.banner = null
	await show({ options: { banner: 'break', text: '', until: '15:00' } })
	assert.deepEqual(sent, [
		['none'],
		['lunch', '', ''],
		['break', '', ''],
		['none'],
		['custom', 'Bye', ''],
		['break', '', '15:00'],
	])
})

test('the countdown ticks in Companion between checks', async () => {
	const { default: Instance } = await import('../src/main.js')
	const shown = []
	const self = {
		presetSeats: 0,
		state: { ...emptyState(), connected: true, timer: { remaining: 65, paused: false, overtime: false, label: '' } },
		tickAt: Date.now() - 3200,
		setVariableValues(values) {
			shown.push(values.timer)
		},
		checkAllFeedbacks() {},
	}
	const tick = () => Instance.prototype.tick.call(self)
	tick()
	assert.equal(self.state.timer.remaining, 62)
	assert.deepEqual(shown, ['1:02'])
	// Nothing until another whole second has passed
	tick()
	assert.equal(shown.length, 1)
	// Paused: holds
	self.state.timer.paused = true
	self.tickAt -= 5000
	tick()
	assert.equal(self.state.timer.remaining, 62)
	// Run out without overtime: stops at 0:00
	self.state.timer = { remaining: 1, paused: false, overtime: false, label: '' }
	self.tickAt = Date.now() - 4000
	tick()
	tick()
	assert.equal(shown.at(-1), '0:00')
	const stopped = self.state.timer.remaining
	self.tickAt -= 3000
	tick()
	assert.equal(self.state.timer.remaining, stopped)
	// Overtime: counts on
	self.state.timer = { remaining: -10, paused: false, overtime: true, label: '' }
	self.tickAt = Date.now() - 2000
	tick()
	assert.equal(shown.at(-1), '+0:12')
})

test('connections on the old 1-second default move to 3 seconds', async () => {
	const { UpgradeScripts } = await import('../src/upgrades.js')
	const run = (config) => UpgradeScripts[0]({}, { config, actions: [], feedbacks: [] }).updatedConfig
	assert.equal(run({ interval: 1, host: 'https://presenteringest.com' }).interval, 3)
	assert.equal(run({ interval: 5 }), null)
	assert.equal(run(null), null)
})
