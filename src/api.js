// The Presenter Ingest Companion API: /pi-api/companion/v1/<endpoint>
//
// Safety rules for the key, which can control a booking's presenter pages:
// - it's only ever sent in a request header, never in the address
// - only to an https:// address (http only for this computer, for testing)
// - redirects are never followed, so it can't be passed on to another server
// - it never appears in log messages or errors

export const DEFAULT_HOST = 'https://presenteringest.com'
const KEY_PATTERN = /^pic1_[a-z0-9]{4,40}_[a-z0-9]{40}$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const TIMEOUT_MS = 5000

/** The site's origin from the config, or null if it isn't one we'll send a key to. */
export function cleanHost(value) {
	let url
	try {
		url = new URL(String(value || '').trim() || DEFAULT_HOST)
	} catch {
		return null
	}
	const local = LOCAL_HOSTS.has(url.hostname)
	if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
		return null
	}
	if (url.username || url.password) {
		return null
	}
	return url.origin
}

export function validKey(value) {
	return KEY_PATTERN.test(String(value || '').trim())
}

export class ApiError extends Error {
	constructor(message, status, code, retryAfter) {
		super(message)
		this.status = status
		this.code = code
		this.retryAfter = retryAfter
	}
}

export class PresenterIngestApi {
	constructor(host, key, fetchImpl = globalThis.fetch) {
		this.origin = cleanHost(host)
		this.key = String(key || '').trim()
		this.fetch = fetchImpl
	}

	get usable() {
		return this.origin !== null && validKey(this.key)
	}

	async request(endpoint, body) {
		if (!this.usable) {
			throw new ApiError('Not set up', 0, 'bad_config')
		}
		let response
		try {
			response = await this.fetch(`${this.origin}/pi-api/companion/v1/${endpoint}`, {
				method: body === undefined ? 'GET' : 'POST',
				headers: {
					'X-Presenter-Ingest-Key': this.key,
					Accept: 'application/json',
					...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				redirect: 'error',
				signal: AbortSignal.timeout(TIMEOUT_MS),
			})
		} catch (e) {
			// Network problems: say what, without the request (which holds the key)
			throw new ApiError(
				e && e.name === 'TimeoutError' ? 'The server took too long to answer' : 'Could not reach the server',
				0,
				'network',
			)
		}
		let data = null
		try {
			data = await response.json()
		} catch {
			// not JSON: handled below
		}
		if (!response.ok || !data || data.ok !== true) {
			const message =
				(data && typeof data.message === 'string' && data.message) || `Request failed (${response.status})`
			const retry = Number(response.headers.get('Retry-After')) || 0
			throw new ApiError(message.slice(0, 200), response.status, (data && data.error) || 'error', retry)
		}
		return data
	}

	status() {
		return this.request('status')
	}

	setSeat(n, action) {
		return this.request('seat', { n, action })
	}

	setCue(n, preset, text = '') {
		return this.request('cue', { n, preset, text })
	}

	setBanner(preset, text = '', until = '') {
		return this.request('banner', { preset, text, until })
	}

	timer(body) {
		return this.request('timer', body)
	}
}
