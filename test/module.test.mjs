// node --test test/module.test.mjs  (yarn test)
// Offline checks always run. The live checks run against a Presenter Ingest site when
// PI_TEST_HOST and PI_TEST_KEY are set (use a local dev site and a test booking).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanHost, validKey, PresenterIngestApi, ApiError } from '../src/api.js'
import { formatTimer, timerState, seatChoices, emptyState } from '../src/state.js'
import { actionDefinitions } from '../src/actions.js'
import { feedbackDefinitions } from '../src/feedbacks.js'
import { presetDefinitions } from '../src/presets.js'
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
			for (const a of step.down) assert.ok(actions[a.actionId], `action ${a.actionId}`)
		}
		for (const f of p.feedbacks) assert.ok(feedbacks[f.feedbackId], `feedback ${f.feedbackId}`)
	}
	assert.match(presets.seat_1.style.text, /\$\(pi:seat_1_name\)/)
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
