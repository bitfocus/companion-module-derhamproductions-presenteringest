// The Presenter Ingest Companion API: /pi-api/companion/v1/<endpoint>
//
// Safety rules for the key, which can control a booking's presenter pages:
// - it's only ever sent in a request header, never in the address
// - only to an https:// address (http only for this computer, for testing)
// - redirects are never followed, so it can't be passed on to another server
// - it never appears in log messages or errors
//
// The site may offer a lighter address for the status check (pi-fast.php). It's only
// taken as a path on the same site, so the key never goes anywhere else, and the module
// goes back to the usual address for a while if it ever fails.

export const DEFAULT_HOST = 'https://presenteringest.com'
const KEY_PATTERN = /^pic1_[a-z0-9]{4,40}_[a-z0-9]{40}$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const TIMEOUT_MS = 5000
/** The status check's lighter address, as a path on the same site */
const FAST_PATH = /^(\/[A-Za-z0-9._-]+)*\/pi-fast\.php\?c=1$/
const FAST_RETRY_MS = 5 * 60 * 1000

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
		this.fastPath = null
		this.fastRetryAt = 0
	}

	get usable() {
		return this.origin !== null && validKey(this.key)
	}

	async request(endpoint, body, path = `/pi-api/companion/v1/${endpoint}`) {
		if (!this.usable) {
			throw new ApiError('Not set up', 0, 'bad_config')
		}
		let response
		try {
			response = await this.fetch(`${this.origin}${path}`, {
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

	/** The booking's status: from the lighter address when the site offers one */
	async status() {
		let data
		if (this.fastPath && Date.now() >= this.fastRetryAt) {
			try {
				data = await this.request('status', undefined, this.fastPath)
			} catch (e) {
				// A wrong key, a booking that isn't paid or too many requests mean the same either way
				if (e instanceof ApiError && [401, 403, 429].includes(e.status)) {
					throw e
				}
				this.fastRetryAt = Date.now() + FAST_RETRY_MS
			}
		}
		if (!data) {
			data = await this.request('status')
		}
		this.fastPath = typeof data.fast === 'string' && FAST_PATH.test(data.fast) ? data.fast : null
		return data
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
