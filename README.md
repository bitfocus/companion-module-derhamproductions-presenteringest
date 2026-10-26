# companion-module-derhamproductions-presenteringest

A [Bitfocus Companion](https://bitfocus.io/companion) module for [Presenter Ingest](https://presenteringest.com), the remote presenter link service by Derham Productions. It runs one booking from Companion: presenter seats on and off, who is on their page, banners, countdowns and cues, and the Call in Q&A audience queue.

See [HELP.md](./companion/HELP.md) for how to use it.

Needs Companion 4.3 or later (module API 2.0, Node 22 runtime).

## Install

Until it's in Companion's own list of modules:

1. Download the `.tgz` file from the [latest release](https://github.com/derhamproductions/companion-module-derhamproductions-presenteringest/releases/latest).
2. In Companion, open **Modules**, choose **Import module package** and pick the file.
3. Add a **Presenter Ingest** connection and paste the Companion key from your booking page on presenteringest.com.

## How it talks to Presenter Ingest

The module polls `GET /pi-api/companion/v1/status` and posts changes to `seat`, `cue`, `banner`, `timer` and `callin` on the same path. It sends the booking's Companion key in the `X-Presenter-Ingest-Key` header:

- only to an `https://` address (`http://` only for `localhost`, for development)
- never in the URL
- with redirects refused, so the key can't be passed on to another host
- never in log messages

Companion stores the key as a secret (`secret-text`), separately from the connection's config. The status holds only what Live control shows: seat numbers and names, on/off, whether each presenter's page is open, their cue, the banner and the countdown; with Call in Q&A, whether the queue is open, how many are waiting, and the name, organisation and question of the next guest and of each guest on air. It holds no presenter links, guest emails, emails or studio connection details. With **Show presenter names** off, the module drops the names (and guests' organisations and questions) as each status arrives, so they never reach variables, buttons or Companion's exports.

## Development

```
corepack yarn install
corepack yarn test        # offline checks
corepack yarn package     # builds the .tgz to import into Companion (Modules → Import module package)
```

`PI_TEST_HOST=http://localhost:8014 PI_TEST_KEY=pic1_… corepack yarn test` also runs the live checks against a development site. Use a test booking, as they switch its first seat, cues, banner and countdown.

## Licence

MIT
