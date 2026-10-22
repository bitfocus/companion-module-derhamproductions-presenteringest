## Presenter Ingest

Run a [Presenter Ingest](https://presenteringest.com) booking from Companion: see which presenters are on their page, switch their links on and off, and send banners, countdowns and cues to their presenter pages.

### Set up

1. On presenteringest.com, open the booking and go to **Bitfocus Companion**. Press **Connect Companion** and copy the key. It's shown once.
2. Add this connection in Companion and paste the key into **Companion key**. Leave **Site address** as `https://presenteringest.com`.
3. The connection turns green, and the presets fill in with the booking's seats.

Each key works for one booking only, until the booking ends. Make a new key or press **Disconnect** on the booking page to stop an old one straight away. Anyone with the key can control that booking's presenter pages, so treat it like a password. Companion keeps it in its secrets store, not with the other settings.

### Actions

- **Seat: switch link on / off** (on, off or toggle). An open presenter page follows within seconds.
- **Cue: send to a presenter** (or to every presenter), including a custom message, and **Cue: clear**. Pressing a cue button again clears that cue (untick **Pressing again clears it** to send it every time).
- **Banner: show to every presenter** (with an optional "back at" time) and **Banner: clear**.
- **Countdown: start** (for a number of minutes, or to a time of day, with an optional label and overtime), **pause / resume**, **add or take away time** and **clear**.
- **Refresh now**.

### Feedbacks

- **Seat: presenter is on their page** (green by default).
- **Seat: link is switched off**.
- **Seat: has a cue** (any, or a particular one). With **Every presenter**, lit when they all have it.
- **Banner: showing**.
- **Countdown: state** (running, paused, overtime, finished, not set) and **running with little time left**.
- **Connection: talking to Presenter Ingest**.

### Variables

`booking_title`, `booking_state`, `presenters_connected`, `seats_on`, `banner`, `timer` (e.g. `4:05`, or `+0:30` in overtime), `timer_seconds`, `timer_label`, `timer_state`, and for each seat `seat_N_name`, `seat_N_online`, `seat_N_enabled` and `seat_N_cue`.

### Presets

- **Seats**: one button per seat, showing the presenter's name. Green while they're on their page, grey when the link is off; press to switch the link.
- **Cues**: Stand by, Next, Live, Wrap up, Time's up, Thanks and Clear for each seat, plus Stand by and Clear for everyone. A cue button lights blue while that cue is showing; press it again to clear it.
- **Countdown**: the time (press to pause), start 1 to 30 minutes, ±1 minute, pause and clear.
- **Banners**: each banner, and clear.

**Which seats get buttons.** By default, only the seats on your booking get Seat and Cue buttons, so a 4-seat booking shows buttons for seats 1 to 4. Before you connect, the presets show seats 1 to 8 as examples.

To build buttons for a set number of seats, choose it under **Preset seats** in this connection's settings (1 to 24). The buttons are there whether or not you're connected, so you can build your pages offline, or before moving to a bigger package. Buttons for seats your booking doesn't have stay dark until it does.

**Presenter names.** Buttons, variables and seat lists show each presenter's name from the booking. If other people can see your Companion screen or Stream Deck, untick **Show presenter names** in this connection's settings: everything then just says Seat 1, Seat 2 and so on, and the names aren't kept in Companion.

### Notes

- The module checks the booking every second (change it under **Check every**). Presenter Ingest allows about 10 requests a second per booking, plenty for polling and button presses.
- Changes need the booking to be running (links open). Seats can be switched on and off before then too.
- The module only talks to the site address over https, never follows redirects, and never writes the key to the log.
