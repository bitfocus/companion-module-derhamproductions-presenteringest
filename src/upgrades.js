// Upgrade scripts for saved buttons when actions or options change between versions.
// Once one has been added it cannot be removed.
export const UpgradeScripts = [
	// 0.9.0: checks every 3 seconds by default (the countdown ticks in Companion in between);
	// connections still on the old default of 1 second move to 3
	(_context, props) => {
		const config = props.config
		if (config && Number(config.interval) === 1) {
			return { updatedConfig: { ...config, interval: 3 }, updatedActions: [], updatedFeedbacks: [] }
		}
		return { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }
	},
]
