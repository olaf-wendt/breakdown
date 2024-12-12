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

// CommonJS export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SHARED_CONFIG };
}

// ES modules export
if (typeof exports !== 'undefined') {
    exports.SHARED_CONFIG = SHARED_CONFIG;
}