import posthog from 'posthog-js';
import log from 'electron-log/renderer';

/**
 * @typedef {Object} AnalyticsEvent
 * @property {string} name - Event name
 * @property {Object} properties - Event properties
 * @property {number} timestamp - Event timestamp
 */

/**
 * Analytics Service
 * Handles user tracking and analytics using PostHog
 * Features:
 * - Event tracking with automatic app version and platform info
 * - User identification
 * - Offline event queueing
 * - Error handling and retry mechanism
 * - Graceful degradation when analytics is disabled
 */
class Analytics {
  static RETRY_ATTEMPTS = 3;
  static RETRY_DELAY = 1000;
  static offlineQueue = [];
  static isInitialized = false;
  static isEnabled = false;

  /**
   * Initialize PostHog analytics if API key is available
   * Silently disables analytics if no API key is found
   */
  static init() {
    try {
      const POSTHOG_KEY = process.env.REACT_APP_POSTHOG_KEY;
      
      if (!POSTHOG_KEY) {
        log.info('Analytics disabled: No PostHog API key found');
        this.isEnabled = false;
        return;
      }

      posthog.init(POSTHOG_KEY, {
        api_host: 'https://app.posthog.com',
        persistence: 'localStorage',
        autocapture: false,
        capture_pageview: false,
        loaded: (posthog) => {
          log.info('PostHog analytics initialized');
          this.isInitialized = true;
          this.isEnabled = true;
          this.processOfflineQueue();
        }
      });
    } catch (error) {
      log.warn('Failed to initialize analytics:', error);
      this.isEnabled = false;
    }
  }

  /**
   * Clean up analytics before app shutdown
   */
  static shutdown() {
    try {
      if (this.isInitialized) {
        posthog.shutdown();
        this.isInitialized = false;
        this.isEnabled = false;
        log.info('Analytics shutdown complete');
      }
    } catch (error) {
      log.error('Error during analytics shutdown:', error);
    }
  }

  /**
   * Identify user for tracking
   * @param {string} userId - Unique user identifier
   */
  static identify(userId) {
    if (!this.isEnabled) return;

    try {
      if (!userId) {
        log.warn('User ID is required for identification');
        return;
      }

      posthog.identify(userId);
      log.debug('User identified:', userId);
    } catch (error) {
      log.error('Failed to identify user:', error);
      this.queueEvent('identify', { userId });
    }
  }

  /**
   * Track an analytics event
   * @param {string} eventName - Name of the event
   * @param {Object} properties - Additional event properties
   */
  static track(eventName, properties = {}) {
    if (!this.isEnabled) return;

    if (!eventName) {
      log.warn('Event name is required for tracking');
      return;
    }

    const event = {
      name: eventName,
      properties: {
        ...properties,
        app_version: process.env.REACT_APP_VERSION,
        platform: process.platform,
        timestamp: Date.now()
      }
    };

    this.sendEvent(event);
  }

  /**
   * Track editor operations
   * @param {string} operation - Operation name
   * @param {Object} details - Operation details
   */
  static trackEditorOperation(operation, details = {}) {
    if (!this.isEnabled) return;
    
    this.track('editor_operation', {
      operation,
      ...details
    });
  }

  /**
   * Track file operations
   * @param {string} operation - Operation type (open, save, etc.)
   * @param {Object} fileInfo - File information
   */
  static trackFileOperation(operation, fileInfo = {}) {
    if (!this.isEnabled) return;
    
    this.track('file_operation', {
      operation,
      ...fileInfo
    });
  }

  /**
   * Track error events
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   */
  static trackError(error, context = {}) {
    if (!this.isEnabled) return;
    
    this.track('error', {
      error_message: error.message,
      error_stack: error.stack,
      ...context
    });
  }

  /**
   * Send event to PostHog with retry mechanism
   * @private
   * @param {AnalyticsEvent} event - Event to send
   * @param {number} attempt - Current attempt number
   */
  static async sendEvent(event, attempt = 1) {
    if (!this.isEnabled || !this.isInitialized) {
      this.queueEvent(event.name, event.properties);
      return;
    }

    try {
      await posthog.capture(event.name, event.properties);
      log.debug('Event tracked:', event.name);
    } catch (error) {
      log.error(`Failed to track event (attempt ${attempt}):`, error);

      if (attempt < this.RETRY_ATTEMPTS) {
        setTimeout(() => {
          this.sendEvent(event, attempt + 1);
        }, this.RETRY_DELAY * attempt);
      } else {
        this.queueEvent(event.name, event.properties);
      }
    }
  }

  /**
   * Queue event for later processing
   * @private
   * @param {string} eventName - Event name
   * @param {Object} properties - Event properties
   */
  static queueEvent(eventName, properties) {
    if (!this.isEnabled) return;
    
    this.offlineQueue.push({
      name: eventName,
      properties,
      timestamp: Date.now()
    });
    log.debug('Event queued for later:', eventName);
  }

  /**
   * Process queued events
   * @private
   */
  static async processOfflineQueue() {
    if (!this.isEnabled || !this.isInitialized || this.offlineQueue.length === 0) return;

    log.info(`Processing ${this.offlineQueue.length} queued events`);

    while (this.offlineQueue.length > 0) {
      const event = this.offlineQueue.shift();
      await this.sendEvent(event);
    }
  }
}

export default Analytics;