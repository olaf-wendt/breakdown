/**
 * Script Parser Module
 * Handles parsing and conversion of screenplay text between different formats
 */

const path = require('path');
const regex = require('./regex');
const log = require('electron-log/renderer');
const { EDITOR_CONFIG } = require('../../config.main.js');


// Constants
const VFX_LEVELS = EDITOR_CONFIG.vfx.difficultyLevels.map(level => level.id);

/**
 * @typedef {Object} Token
 * @property {string} type - Token type (scene-heading, action, dialogue, dialogue-begin, dialogue-end, transition, flashback, page-break)
 * @property {string} [text] - Text content. Required for scene-heading, action, dialogue, transition, flashback
 * @property {string} [vfx] - VFX annotation in format: "<shot_number?> <difficulty_level>"
 *                           where shot_number is optional numeric prefix and 
 *                           difficulty_level is one of VFX_LEVELS
 * @property {string} [sceneNum] - Scene number. Present for scene-heading and flashback tokens
 * @property {string} [pageNum] - Page number. Present for scene-heading, flashback, and page-break tokens
 * @property {string} [character] - Character name. Only present for character tokens
 * @property {boolean} [dual] - Whether this is part of dual dialogue. Only present for character tokens
 */

/**
 * @typedef {Object} Entity
 * @property {string} type - Entity type (char, prop, env)
 * @property {string} name - Entity name
 * @property {number} count - Number of occurrences
 */

// String manipulation utilities
const StringUtils = {
    isBlank: (string) => !string.trim(),
    isNotBlank: (string) => Boolean(string.trim()),
    stripRight: (text) => text.split('\n').map(line => line.trimEnd()).join('\n'),
    escapeRegExp: (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
};

/**
 * Update VFX state with new annotation, preserving shot numbers
 * @param {string|null} currentVfx - Current VFX state (e.g., "42 easy" or "hard")
 * @param {string|null} newVfx - New VFX annotation
 * @returns {string|null} Updated VFX state
 */
function updateVfxState(currentVfx, newVfx) {
    if (!newVfx) return currentVfx;

    const [newFirst, ...newRest] = newVfx.split(' ');
    if (/^\d+$/.test(newFirst)) return newVfx;

    const [currentShot] = currentVfx?.split(' ') || [];
    return /^\d+$/.test(currentShot) ? `${currentShot} ${newFirst}` : newVfx;
}


/**
 * Lexical analysis of script text
 * @param {string} script - Raw script text
 * @returns {string} Processed script text
 */
function lexer(script) {
    const replacements = [
        { pattern: regex.boneyard, replacement: '\n$1\n' },
        { pattern: regex.standardizer, replacement: '\n' },
        { pattern: regex.cleaner, replacement: '' },
        { pattern: regex.quotes, replacement: '\'' },
        { pattern: regex.doublequotes, replacement: '"' },
        { pattern: regex.hyphens, replacement: '-' },
        { pattern: regex.doublespaces, replacement: ' ' },
    ];

    return replacements.reduce((text, { pattern, replacement }) => 
        text.replace(pattern, replacement), script);
}

/**
 * Process entity annotations in script text
 * @param {string} name - Entity name
 * @param {string} type - Entity type
 * @param {boolean} increment - Whether to increment entity count
 * @param {Object} entities - Entities collection
 */
function processEntity(name, type, increment = false, entities) {
    const key = name.trim().toUpperCase();
    entities[key] = entities[key] || { type: '', name: '', count: 0 };
    entities[key].type = type;
    if (increment) entities[key].count++;
}

/**
 * Asynchronously parse script text into tokens and entities
 * @param {string} script - Script text to parse
 * @returns {Promise<[Token[], Object.<string, Entity>]>}
 */
async function parseScript(script) {
    return new Promise((resolve, reject) => {
        try {
            setImmediate(() => {
                try {
                    const [tokens, entities] = parseScriptSync(script);
                    resolve([tokens, entities]);
                } catch (err) {
                    log.error('Error in parseScript:', err);
                    reject(err);
                }
            });
        } catch (err) {
            log.error('Error initiating parseScript:', err);
            reject(err);
        }
    });
}

/**
 * Synchronously parse script text
 * @param {string} script - Script text to parse
 * @returns {[Token[], Object.<string, Entity>]}
 */
function parseScriptSync(script) {
    // Input validation
    if (!script) {
        log.error('parseScript received empty/null script');
        throw new Error('Cannot parse empty script');
    }
    
    if (typeof script !== 'string') {
        log.error('parseScript received non-string input:', typeof script);
        throw new Error(`Expected string input but got ${typeof script}`);
    }

    log.debug('Starting script parsing', { length: script.length });

    const lines = script.split('\n').map(line => line.trimEnd());
    const state = {
        pageNum: 1,
        sceneNum: 0,
        tokens: [],
        entities: {},
        currentBlock: null,
        textBlock: [],
        currentVfx: null,
        currentIndent: 0,
        currentBlank: false
    };

    for (let line of lines) {
        try {
            parseLine(line, state);
        } catch (error) {
            log.error('Error parsing line:', { line, error });
            // Continue parsing other lines
        }
    }

    // Handle any remaining block
    if (state.currentBlock === 'dialogue' && state.textBlock.length) {
        state.tokens.push({ 
            type: 'dialogue', 
            text: state.textBlock.join('\n') + '\n', 
            vfx: state.currentVfx 
        });
        state.tokens.push({ type: 'dialogue-end' });
    } else if (state.currentBlock === 'action' && state.textBlock.length) {
        state.tokens.push({ 
            type: 'action', 
            text: state.textBlock.join('\n') + '\n', 
            vfx: state.currentVfx 
        });
    }

    log.debug('Parsing complete', { 
        tokens: state.tokens.length, 
        entities: Object.keys(state.entities).length 
    });

    return [state.tokens, state.entities];
}

/**
 * Extract VFX annotations from a line of text
 * @param {string} line - Line to process
 * @returns {[string|null, string]} Tuple of [vfx annotation, cleaned line]
 */
function extractVfxAnnotations(line) {
    const vfxMatches = [...line.matchAll(new RegExp(regex['vfx-annotation'], 'g'))];
    if (!vfxMatches.length) return [null, line];

    // Get the last VFX annotation (in case of multiple)
    const [shotNumber, difficulty] = vfxMatches.at(-1).slice(1);
    const vfx = shotNumber ? `${shotNumber} ${difficulty}` : difficulty;

    // Remove all VFX annotations from the line
    const cleanedLine = vfxMatches.reduce(
        (text, match) => text.replace(match[0], ''),
        line
    );

    return [vfx, cleanedLine];
}

/**
 * Parse a single line of script text
 * @param {string} line - Line to parse
 * @param {Object} state - Parser state
 */
function parseLine(line, state) {
    const [vfx, cleanedLine] = extractVfxAnnotations(line);
    line = cleanedLine;

    // Process annotations
    [...line.matchAll(regex['annotation'])]
        .filter(match => match?.length >= 3 && match[1])
        .forEach(match => {
            processEntity(match[1], match[2], true, state.entities);
        });

    let lineClean = line.replace(regex['annotation'], '$1').trim();

    // Process multi-entity annotations
    [...lineClean.matchAll(regex['entity-annotation'])]
        .filter(match => match?.length >= 3 && match[2])
        .forEach(match => {
            match[2]
                .split(',')
                .map(name => name.trim())
                .filter(Boolean)
                .forEach(name => processEntity(name, match[1], false, state.entities));
        });

    lineClean = lineClean.replace(regex['entity-annotation'], '');

    // Calculate indentation
    const isBlank = regex['blank'].test(lineClean);
    const indent = isBlank && !state.currentBlank ? 
        state.currentIndent : 
        line.length - line.trimStart().length;
    const indentRight = (indent - state.currentIndent) > 4;
    const indentJump = isBlank && !state.currentBlank ? 
        false : 
        Math.abs(state.currentIndent - indent) > 4;

    state.currentIndent = indent;
    state.currentBlank = isBlank;

    // Handle current block continuation
    if (handleBlockContinuation(lineClean, line, indentJump, indentRight, state, vfx)) {
        return;
    }

    // Parse line based on type
    parseLineByType(lineClean, line, indentJump, state, vfx);
}

/**
 * Handle continuation of current block (dialogue or action)
 * @returns {boolean} Whether line was handled as continuation
 */
function handleBlockContinuation(lineClean, line, indentJump, indentRight, state, vfx) {
    if (state.currentBlock === 'dialogue') {
        const nextIsBreak = ['page-break', 'page-number', 'scene-heading', 'transition', 'flashback', 'action']
            .some(e => regex[e].test(lineClean));

        if (nextIsBreak || (state.textBlock.length && indentJump)) {
            if (state.textBlock.length) {
                state.tokens.push({ 
                    type: 'dialogue', 
                    text: state.textBlock.join('\n') + '\n', 
                    vfx: state.currentVfx 
                });
            }
            state.tokens.push({ type: 'dialogue-end' });
            state.currentBlock = null;
            state.textBlock = [];
            state.currentVfx = null;
        } else {
            if (!StringUtils.isBlank(lineClean) || state.textBlock.length) {
                state.textBlock.push(line);
                // Update VFX state with the most recent valid annotation
                state.currentVfx = updateVfxState(state.currentVfx, vfx);
            }
            return true;
        }
    } else if (state.currentBlock === 'action') {
        const nextIsCharacter = regex['character'].test(lineClean) && indentRight;
        const nextIsBreak = ['blank', 'page-break', 'page-number', 'scene-heading', 'transition', 'flashback']
            .some(e => regex[e].test(lineClean));

        if (nextIsCharacter || nextIsBreak) {
            state.tokens.push({ 
                type: 'action', 
                text: state.textBlock.join('\n') + '\n', 
                vfx: state.currentVfx 
            });
            state.currentBlock = null;
            state.textBlock = [];
            state.currentVfx = null;
        } else {
            const actionMatch = line.match(regex['action']);
            if (actionMatch) {
                line = actionMatch[1];
            }
            state.textBlock.push(line);
            // Update VFX state with the most recent valid annotation
            state.currentVfx = updateVfxState(state.currentVfx, vfx);
            return true;
        }
    }
    return false;
}

/**
 * Parse line based on its type
 */
function parseLineByType(lineClean, line, indentJump, state, vfx) {
    const sceneHeadingMatch = lineClean.match(regex['scene-heading']);
    if (sceneHeadingMatch) {
        const newSceneNum = sceneHeadingMatch[4] || 
            sceneHeadingMatch[1] || 
            (parseInt(state.sceneNum) + 1).toString();
        state.sceneNum = newSceneNum;
        const heading = sceneHeadingMatch[2] ? sceneHeadingMatch[2].trim() : "";
        state.tokens.push({ 
            type: 'scene-heading', 
            text: heading, 
            'scene-num': state.sceneNum, 
            'page-num': state.pageNum, 
            vfx 
        });
    } else if (regex['transition'].test(lineClean)) {
        state.tokens.push({ type: 'transition', text: line + '\n' });
    } else if (regex['flashback'].test(lineClean)) {
        state.tokens.push({ 
            type: 'flashback', 
            text: line.trim(), 
            'scene-num': state.sceneNum, 
            'page-num': state.pageNum, 
            vfx 
        });
    } else if (regex['page-break'].test(lineClean)) {
        state.pageNum++;
        state.tokens.push({ type: 'page-break', 'page-num': state.pageNum });
    } else if (regex['page-number'].test(lineClean)) {
        // Skip page numbers
    } else if (regex['blank'].test(lineClean)) {
        // Skip blank lines
    } else if (regex['character'].test(lineClean) && indentJump) {
        handleCharacterLine(lineClean, line, state, vfx);
    } else {
        handleActionLine(line, state, vfx);
    }
}

/**
 * Handle character line parsing
 */
function handleCharacterLine(lineClean, line, state, vfx) {
    const characterMatch = lineClean.match(regex['character']);
    const char = characterMatch[1] ? 
        characterMatch[1].trim() : 
        characterMatch[2].trim();

    state.tokens.push({ type: 'dialogue-begin' });
    state.tokens.push({ 
        type: 'character', 
        text: line.trim(), 
        character: char, 
        dual: Boolean(characterMatch[4]), 
        vfx 
    });

    state.entities[char] = state.entities[char] || { type: '', name: '', count: 0 };
    state.entities[char].count++;
    state.entities[char].type = 'char';
    state.currentBlock = 'dialogue';
    state.textBlock = [];
    state.currentVfx = vfx;
}

/**
 * Handle action line parsing
 */
function handleActionLine(line, state, vfx) {
    const actionMatch = line.match(regex['action']);
    if (actionMatch) {
        line = actionMatch[1];
    }
    state.currentBlock = 'action';
    state.textBlock = [line];
    state.currentVfx = vfx;
}

module.exports = {
    parseScript
};