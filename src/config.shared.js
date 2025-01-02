/**
 * @typedef {Object} DifficultyLevel
 * @property {string} id - Unique identifier for the difficulty level
 * @property {string} label - Human-readable label for the difficulty level
 * @property {string} color - Hex color code for visual representation
 */

/**
 * @typedef {Object} VfxConfig
 * @property {DifficultyLevel[]} difficultyLevels - Array of available VFX difficulty levels
 */

/**
 * @typedef {Object} SharedConfig
 * @property {VfxConfig} vfx - VFX-related configuration
 */

/** @type {SharedConfig} */
const SHARED_CONFIG = {
    vfx: {
        difficultyLevels: [
            { id: 'easy', label: 'Easy', color: '#4CAF50' },
            { id: 'mid', label: 'Medium', color: '#FFC107' },
            { id: 'hard', label: 'Hard', color: '#F44336' },
            { id: 'epic', label: 'Epic', color: '#9C27B0' }
        ]
    }
};

// Use CommonJS exports for Electron compatibility
module.exports = { SHARED_CONFIG };