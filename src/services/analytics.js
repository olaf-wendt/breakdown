import posthog from 'posthog-js'

// Initialize PostHog with your project API key
const POSTHOG_KEY = process.env.REACT_APP_POSTHOG_KEY || 'your_posthog_key'

class Analytics {
  static init() {
    posthog.init(POSTHOG_KEY, {
      api_host: 'https://app.posthog.com',
      persistence: 'localStorage',
      autocapture: false,
      capture_pageview: false // Disable automatic pageview tracking for desktop apps
    })
  }

  static identify(userId) {
    posthog.identify(userId)
  }

  static track(eventName, properties = {}) {
    posthog.capture(eventName, {
      ...properties,
      app_version: process.env.REACT_APP_VERSION,
      platform: process.platform
    })
  }
}

export default Analytics