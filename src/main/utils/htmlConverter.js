/**
 * HTML Converter Module
 * Handles conversion between tokens and HTML representation of screenplay
 */
const { JSDOM } = require('jsdom');
const regex = require('./regex');
const log = require('electron-log/renderer');
const { EDITOR_CONFIG } = require('../../config.main.js');

// Constants
const VFX_LEVELS = EDITOR_CONFIG.vfx.difficultyLevels.map(level => level.id);
const VFX_REGEX = new RegExp(`\\s*(\\d+)?\\s*(${VFX_LEVELS.join('|')})\\s*`);

/**
 * String manipulation utilities
 * @type {Object}
 */
const StringUtils = {
    isBlank: (string) => !string.trim(),
    isNotBlank: (string) => Boolean(string.trim()),
    stripRight: (text) => text.split('\n').map(line => line.trimEnd()).join('\n'),
    escapeRegExp: (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
};

/**
 * Convert tokens to HTML with timeout protection
 * @param {Token[]} tokens - Array of screenplay tokens
 * @param {Object.<string, Entity>} [entities={}] - Entity definitions
 * @returns {Promise<string>} HTML representation of screenplay
 * @throws {Error} If conversion times out or fails
 */
async function tokensToHtml(tokens, entities = {}) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('tokensToHtml timed out after 30 seconds'));
        }, 30000);

        try {
            setImmediate(() => {
                try {
                    const result = tokensToHtmlSync(tokens, entities);
                    clearTimeout(timeout);
                    resolve(result);
                } catch (err) {
                    clearTimeout(timeout);
                    log.error('Error in tokensToHtml:', err);
                    reject(err);
                }
            });
        } catch (err) {
            clearTimeout(timeout);
            log.error('Error initiating tokensToHtml:', err);
            reject(err);
        }
    });
}

/**
 * Synchronously convert tokens to HTML
 * @param {Token[]} tokens - Array of screenplay tokens
 * @param {Object.<string, Entity>} [entities={}] - Entity definitions
 * @returns {string} HTML representation of screenplay
 * @throws {Error} If no tokens provided or conversion fails
 */
function tokensToHtmlSync(tokens, entities = {}) {
    if (!tokens) throw new Error('No tokens provided to tokensToHtml');

    log.debug('Starting tokensToHtml conversion', {
        tokens: tokens.length,
        entities: Object.keys(entities).length
    });

    const htmlParts = [];
    
    for (const token of tokens) {
        try {
            const html = convertTokenToHtml(token, buildEntityRegex(entities), entities);
            if (html) htmlParts.push(html);
        } catch (err) {
            log.error('Error converting token to HTML:', { token, error: err });
        }
    }

    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    dom.window.document.body.innerHTML = htmlParts.join('');
    log.debug('Finished HTML conversion');
    return dom.window.document.body.innerHTML;
}

/**
 * Build regex pattern for matching entities
 * @param {Object.<string, Entity>} entities - Entity definitions
 * @returns {RegExp|null} Regex pattern for matching entities or null if no entities
 */
function buildEntityRegex(entities) {
    const entityNames = Object.keys(entities);
    if (!entityNames.length) return null;

    const pattern = entityNames
        .map(e => `(?<!\\*\\*)\\b(${StringUtils.escapeRegExp(e)})\\b(?!\\*\\*)`)
        .join("|");
    return new RegExp(pattern, 'gi');
}

/**
 * Convert a single token to its HTML representation
 * @param {Token} token - Token to convert
 * @param {RegExp|null} entityRegex - Regex pattern for matching entities
 * @param {Object.<string, Entity>} entities - Entity definitions
 * @returns {string} HTML representation of token
 */
function convertTokenToHtml(token, entityRegex, entities) {
    const tokenText = token.text || '';
    const cleanText = tokenText.replace(
        regex['note'], 
        '<span data-type="note" class="note-bubble">$1</span>'
    );
    const tokenTextWrap = wrapEntityMarks(cleanText, entityRegex, entities);

    const { vfxClass, vfxShotNum } = extractVfxAttributes(token.vfx);

    switch (token.type) {
        case 'scene-heading':
            const sceneNum = token['scene-num'] ? ` data-scene-number=${token['scene-num']}` : '';
            return `<p class="scene-heading${vfxClass}"${sceneNum}>${tokenTextWrap}</p><p><br></p>`;

        case 'transition':
            return `<p class="transition${vfxClass}"${vfxShotNum}>${tokenTextWrap}</p>\n<p><br></p>`;

        case 'flashback':
            return `<p class="flashback${vfxClass}"${vfxShotNum}>${tokenTextWrap}</p>`;

        case 'character':
            return `<p class="character${vfxClass}"${vfxShotNum}>${tokenTextWrap}</p>`;

        case 'parenthetical':
            return `<p class="parenthetical"${vfxShotNum}>${tokenTextWrap}</p>`;

        case 'dialogue':
        case 'action':
            return convertBlockToHtml(token.type, tokenTextWrap, vfxClass, vfxShotNum);

        case 'centered':
            return `<p class="centered${vfxClass}"${vfxShotNum}>${tokenTextWrap}</p>`;

        case 'page-break':
            return `<p class="page-break" data-page-number="${token['page-num']}">======================================================= </p><p><br></p>`;

        default:
            return '';
    }
}

/**
 * Extract VFX class and shot number from VFX annotation
 * @param {string|null} vfx - VFX annotation string
 * @returns {{vfxClass: string, vfxShotNum: string}} VFX attributes
 */
function extractVfxAttributes(vfx) {
    if (!vfx) return { vfxClass: '', vfxShotNum: '' };
    
    const match = vfx.match(VFX_REGEX);
    if (!match) return { vfxClass: ' vfx', vfxShotNum: '' };

    return {
        vfxClass: ` vfx ${match[2]}`,
        vfxShotNum: match[1] ? ` data-shot-number="${match[1]}"` : ''
    };
}

/**
 * Convert a block of text to HTML paragraphs
 * @param {string} type - Block type (action or dialogue)
 * @param {string} text - Block text content
 * @param {string} vfxClass - VFX class string
 * @param {string} vfxShotNum - VFX shot number attribute
 * @returns {string} HTML representation of block
 */
function convertBlockToHtml(type, text, vfxClass, vfxShotNum) {
    const lines = text.split('\n')
        .filter(line => line.trim())
        .map(line => `<p class="${type}${vfxClass}"${vfxShotNum}>${line.trim()}</p>`)
        .join('');
    return lines + '<p><br></p>';
}

/**
 * Wrap entity references with mark tags
 * @param {string} text - Text to process
 * @param {RegExp|null} entityRegex - Regex pattern for matching entities
 * @param {Object.<string, Entity>} entities - Entity definitions
 * @returns {string} Text with wrapped entity references
 */
function wrapEntityMarks(text, entityRegex, entities) {
    if (!entityRegex) return text;

    return text
        .replace(entityRegex, (match) => {
            const key = match.trim().toUpperCase();
            if (!entities[key]) return match;
            return `<mark class="${entities[key].type}">${key}</mark>`;
        })
        .replace(regex['annotation'], '<mark class="$2">$1</mark>');
}

/**
 * Convert HTML content to tokens
 * @param {string} html - HTML content to convert
 * @returns {[Token[], Object.<string, Entity>]} Tuple of tokens and entities
 * @throws {Error} If no HTML content provided or conversion fails
 */
function htmlToTokens(html) {
    if (!html) throw new Error('No HTML content provided to htmlToTokens');

    log.debug('Starting HTML to tokens conversion');

    try {
        const dom = new JSDOM(html);
        const document = dom.window.document;
        const paras = document.querySelectorAll('p');
        const state = {
            tokens: [],
            entities: {},
            blockType: null,
            blockText: [],
            blockVfx: null
        };

        for (const para of paras) {
            processHtmlParagraph(para, state);
        }

        // push out the last paragraph block if present
        if (state.blockType) {
            state.tokens.push({ 
                type: state.blockType, 
                text: state.blockText.join('\n'), 
                vfx: state.blockVfx 
            });
        }

        log.debug('Finished tokens conversion', {
            tokens: state.tokens.length,
            entities: Object.keys(state.entities).length
        });

        return [state.tokens, state.entities];
    } catch (error) {
        log.error('Error converting HTML to tokens:', error);
        throw error;
    }
}

/**
 * Process a single HTML paragraph
 * @param {Element} para - Paragraph element to process
 * @param {Object} state - Conversion state
 */
function processHtmlParagraph(para, state) {
    const classes = para.classList;
    const vfxClasses = extractVfxFromClasses(para);
    
    processMarksAndNotes(para, state.entities);

    const text = para.textContent.trim();
    if (StringUtils.isBlank(text)) classes.length = 0;

    processEntityDefinitions(text, state.entities);

    // push out the current block if the current paragraph does not match its type
    if (state.blockType && !classes.contains(state.blockType)) {
        state.tokens.push({ 
            type: state.blockType, 
            text: state.blockText.join('\n'), 
            vfx: state.blockVfx 
        });
        state.blockType = null;
        state.blockText = [];
        state.blockVfx = null;
    }

    processParagraphByType(classes, text, vfxClasses, state, para);
}

/**
 * Extract VFX information from paragraph classes
 * @param {Element} para - Paragraph element
 * @returns {string|null} VFX string or null if no VFX
 */
function extractVfxFromClasses(para) {
    if (!para.classList.contains('vfx')) return null;
    
    const vfxLevel = VFX_LEVELS.find(level => para.classList.contains(level));

    log.debug('vfx:', { classes: [...para.classList], shotNumber: para.dataset.shotNumber });
    return vfxLevel ? (para.dataset.shotNumber ? 
        `${para.dataset.shotNumber} ${vfxLevel}` : 
        vfxLevel) : null;
}

/**
 * Process marks and notes in paragraph
 * @param {Element} para - Paragraph element
 * @param {Object.<string, Entity>} entities - Entity definitions
 */
function processMarksAndNotes(para, entities) {
    for (const mark of para.querySelectorAll('mark')) {
        const entityName = mark.textContent.toUpperCase();
        entities[entityName] = entities[entityName] || { type: '', name: '', count: 0 };
        entities[entityName].type = mark.classList[0];
        entities[entityName].count++;
        mark.outerHTML = `**${mark.textContent}**[[${mark.classList[0]}]]`;
    }

    const notes = Array.from(para.querySelectorAll('.note-bubble'))
        .map(note => note.textContent);
    para.querySelectorAll('.note-bubble').forEach(note => note.remove());

    if (notes.length) {
        para.textContent += ' ' + notes.map(note => `[[${note}]]`).join(' ');
    }
}

/**
 * Process entity definitions in text
 * @param {string} text - Text to process
 * @param {Object.<string, Entity>} entities - Entity definitions
 */
function processEntityDefinitions(text, entities) {
    const entityMatches = text.matchAll(new RegExp(regex['entity-annotation'], 'g'));
    for (const match of entityMatches) {
        for (const ent of match[2].split(',')) {
            const entityName = ent.trim().toUpperCase();
            entities[entityName] = entities[entityName] || { type: '', name: '', count: 0 };
            entities[entityName].type = match[1];
        }
    }
}

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
 * 
 * Process paragraph based on its type
 * @param {DOMTokenList} classes - Paragraph classes
 * @param {string} text - Paragraph text
 * @param {string|null} vfxClasses - VFX classes
 * @param {Object} state - Conversion state
 * @param {Element} para - Paragraph element
 */
function processParagraphByType(classes, text, vfxClasses, state, para) {
    const tokenTypes = {
        'action': 'action',
        'dialogue': 'dialogue',
        'character': 'character',
        'parenthetical': 'parenthetical',
        'scene-heading': 'scene-heading',
        'page-break': 'page-break',
        'transition': 'transition',
        'flashback': 'flashback',
        'centered': 'centered'
    };

    const type = Object.entries(tokenTypes).find(([key]) => classes.contains(key))?.[1];
    if (!type) return;

    if (type === 'action' || type === 'dialogue') {
        state.blockType = type;
        state.blockVfx = updateVfxState(state.blockVfx, vfxClasses);
        state.blockText.push(text);
    } else {
        state.tokens.push({ 
            type,
            text,
            ...(type === 'character' && { character: text }),
            ...(type === 'scene-heading' && { 'scene-num': para.dataset.sceneNumber || '' }),
            ...(type === 'page-break' && { 'page-num': para.dataset.pageNumber || '' }),
            vfx: vfxClasses
        });
    }
}

module.exports = {
    tokensToHtml,
    htmlToTokens
};