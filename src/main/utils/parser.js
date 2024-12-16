// parser.js

const path = require('path');
const { JSDOM } = require('jsdom');
const regex = require('./regex');
const log = require('electron-log');
const { EDITOR_CONFIG } = require('../../config.main.js');

const vfxLevels = EDITOR_CONFIG.vfx.difficultyLevels.map(level => level.id);


// Helper functions
function isBlank(string) {
    return !string.trim();
}

function isNotBlank(string) {
    return Boolean(string.trim());
}

function stripRight(text) {
    return text.split('\n').map(line => line.trimEnd()).join('\n');
}

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

    replacements.forEach(({ pattern, replacement }) => {
        script = script.replace(pattern, replacement);
    });

    return script;
}

async function parseScript(script) {
    return new Promise((resolve, reject) => {
        try {
            // Move the parsing work to the next tick to not block
            setImmediate(() => {
                try {
                    const [tokens, entities] = parseScriptSync(script);
                    resolve ([tokens, entities]);
                } catch (err) {
                    reject(err);
                }
            });
        } catch (err) {
            reject(err);
        }
    });
}

function parseScriptSync(script) {
    if (!script) {
        log.error('parseScript received empty/null script');
        throw new Error('Cannot parse empty script');
    }
    
    if (typeof script !== 'string') {
        log.error('parseScript received non-string input:', typeof script);
        throw new Error(`Expected string input but got ${typeof script}`);
    }

    log.debug('Starting script parsing');
    log.debug('Script length:', script.length);

    const lines = script.split('\n').map(line => line.trimEnd());

    let pageNum = 1, sceneNum = 0;
    let tokens = [];
    let entities = {};
    let currentBlock = null, textBlock = [], currentVfx = null, currentIndent = 0;

    for (let line of lines) {
        let vfx = null;
        const vfxMatch = line.match(regex['vfx-annotation']);
        if (vfxMatch) {
            vfx = vfxMatch[1];
        }
        line = line.replace(regex['vfx-annotation'], '');

        // Process single entity annotations
        const processEntity = (name, type, increment = false) => {
            const key = name.trim().toUpperCase();
            entities[key] = entities[key] || { type: '', name: '', count: 0 };
            entities[key].type = type;
            if (increment) entities[key].count++;
        };

        // Process single annotations (e.g., **JOHN**[[char prop]])
        [...line.matchAll(regex['annotation'])]
            .filter(match => match?.length >= 3 && match[1])
            .forEach(match => {
                //log.debug('annotation match', match);
                processEntity(match[1], match[2], true);
            });

        let lineClean = line.replace(regex['annotation'], '$1').trim();

        // Process multi-entity annotations (e.g., [[char BOY JOHN]])
        [...lineClean.matchAll(regex['entity-annotation'])]
            .filter(match => match?.length >= 3 && match[2])
            .forEach(match => {
                //log.debug('entity annotation match', match);
                match[2]
                    .split(',')
                    .map(name => name.trim())
                    .filter(Boolean)
                    .forEach(name => processEntity(name, match[1]));
            });

        lineClean = lineClean.replace(regex['entity-annotation'], '');
        //log.debug('line clean:', lineClean);

        const isBlank = regex['blank'].test(lineClean);
        const indent = line.length - line.trimStart().length;
        const indentRight = (indent - currentIndent) > 3; // currentLine jumps to the right
        const indentJump = isBlank ? false : Math.abs(currentIndent - indent) > 3;
        currentIndent = indent;

        if (currentBlock === 'dialogue') {
            const dialogueBreaks = ['page-break', 'page-number', 'scene-heading', 'transition', 'flashback', 'action'];
            if (dialogueBreaks.some(e => regex[e].test(lineClean)) || (textBlock.length && indentJump)) {
                if (textBlock.length) {
                    tokens.push({ type: 'dialogue', text: textBlock.join('\n') + '\n', vfx: currentVfx });
                }
                tokens.push({ type: 'dialogue-end' });
                currentBlock = null;
                textBlock = [];
                currentVfx = null;
            } else {
                textBlock.push(line);
                continue;
            }
        } else if (currentBlock === 'action') {
            const nextIsCharacter = regex['character'].test(lineClean) && indentRight;
            const nextIsBreak = ['blank', 'page-break', 'page-number', 'scene-heading', 'transition', 'flashback'].some(e => regex[e].test(line.trim()));
            if (nextIsCharacter || nextIsBreak) {
                tokens.push({ type: 'action', text: textBlock.join('\n') + '\n', vfx: currentVfx });
                currentBlock = null;
                textBlock = [];
                currentVfx = null;
            } else {
                const actionMatch = line.match(regex['action']);
                if (actionMatch) {
                    line = actionMatch[1]; // strip leading exclamation mark if present
                }
                textBlock.push(line);
                continue;
            }
        }

        const sceneHeadingMatch = lineClean.match(regex['scene-heading']);
        if (sceneHeadingMatch) {
            const newSceneNum = sceneHeadingMatch[4] || sceneHeadingMatch[1] || (parseInt(sceneNum) + 1).toString();
            sceneNum = newSceneNum;
            const heading = sceneHeadingMatch[2] ? sceneHeadingMatch[2].trim() : "";
            tokens.push({ type: 'scene-heading', text: heading, 'scene-num': sceneNum, 'page-num': pageNum, vfx });
        } else if (regex['transition'].test(lineClean)) {
            tokens.push({ type: 'transition', text: line + '\n' });
        } else if (regex['flashback'].test(lineClean)) {
            tokens.push({ type: 'flashback', text: line.trim(), 'scene-num': sceneNum, 'page-num': pageNum, vfx });
        } else if (regex['page-break'].test(lineClean)) {
            pageNum++;
            tokens.push({ type: 'page-break', 'page-num': pageNum });
        } else if (regex['page-number'].test(lineClean)) {
            // skip for now
        } else if (regex['blank'].test(lineClean)) {
            // skip blank lines
        } else if (regex['character'].test(lineClean) && indentJump) {
            const characterMatch = lineClean.match(regex['character']);
            const char = characterMatch[1] ? characterMatch[1].trim() : characterMatch[2].trim();
            tokens.push({ type: 'dialogue-begin' });
            tokens.push({ type: 'character', text: line.trim(), character: char, dual: Boolean(characterMatch[4]), vfx });
            entities[char] = entities[char] || { type: '', name: '', count: 0 };
            entities[char].count++;
            entities[char].type = 'char';
            currentBlock = 'dialogue';
            textBlock = [];
            currentVfx = vfx;
        } else {
            const actionMatch = line.match(regex['action']);
            if (actionMatch) {
                line = actionMatch[1]; // strip leading exclamation mark if present
            }
            currentBlock = 'action';
            textBlock = [line];
            currentVfx = vfx;
        }
    }
    return [tokens, entities];
}

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
                    reject(err);
                }
            });
        } catch (err) {
            clearTimeout(timeout);
            reject(err);
        }
    });
}

function tokensToHtmlSync(tokens, entities = {}) {
    log.debug('Starting tokensToHtml conversion');
    log.debug('Number of tokens:', tokens?.length);
    log.debug('Number of entities:', Object.keys(entities).length);

    // Build HTML string instead of manipulating DOM directly
    let htmlParts = [];
    let processedCount = 0;
    const vfxRegex = new RegExp(`\\s*(\\d+)?\\s*(${vfxLevels.join('|')})\\s*`);

    // Create entity regex once
    const entityNames = Object.keys(entities);
    const entityPattern = entityNames
        .map(e => `(?<!\\*\\*)\\b(${escapeRegExp(e)})\\b(?!\\*\\*)`)
        .join("|");
    let entityRegex = entityNames.length ? new RegExp(entityPattern, 'gi') : null;
    //log.debug('entity pattern:', entityPattern);

    function wrapMark(line) {
        if (!entityRegex) return line;
        return line.replace(entityRegex, (match) => {
            const key = match.trim().toUpperCase();
            if (!entities[key]) return match;
            return `<mark class="${entities[key].type}">${key}</mark>`;
        }).replace(regex['annotation'], '<mark class="$2">$1</mark>');
    }

    log.debug('Processing tokens');
    for (const token of tokens) {
        try {
            const tokenText = token.text || '';
            // wrap notes in the correct html span
            const cleanText = tokenText.replace(regex['note'], '<span data-type="note" class="note-bubble">$1</span>');
            const tokenTextWrap = wrapMark(cleanText); 
            log.debug('wrapped text', tokenTextWrap);

            const m = token.vfx ? token.vfx.match(vfxRegex) : null;
            const vfxClasses = m ? ` vfx ${m[2]}` : (token.vfx ? ' vfx' : '');
            const vfxShotNum = m && m[1] ? ` data-shot-number="${m[1]}"` : '';


            switch (token.type) {
                case 'scene-heading':
                    const sceneNum = token['scene-num'] ? ` data-scene-number=${token['scene-num']}` : '';
                    htmlParts.push(`<p class="scene-heading${vfxClasses}"${sceneNum}>${tokenTextWrap}</p><p><br></p>`);
                    break;
                case 'transition':
                    htmlParts.push(`<p class="transition${vfxClasses}"${vfxShotNum}>${tokenTextWrap}</p>\n<p><br></p>`);
                    break;
                case 'flashback':
                    htmlParts.push(`<p class="flashback${vfxClasses}"${vfxShotNum}>${tokenTextWrap}</p>`);
                    break;
                case 'character':
                    htmlParts.push(`<p class="character${vfxClasses}"${vfxShotNum}>${tokenTextWrap}</p>`);
                    break;
                case 'parenthetical':
                    htmlParts.push(`<p class="parenthetical"${vfxShotNum}>${tokenTextWrap}</p>`);
                    break;
                case 'dialogue':
                    const lines = tokenTextWrap.split('\n')
                        .filter(line => line.trim())
                        .map(line => `<p class="dialogue${vfxClasses}"${vfxShotNum}>${line.trim()}</p>`)
                        .join('');
                    htmlParts.push(lines + '<p><br></p>');
                    break;
                case 'action':
                    const actionLines = tokenTextWrap.split('\n')
                        .filter(line => line.trim())
                        .map(line => `<p class="action${vfxClasses}"${vfxShotNum}>${line.trim()}</p>`)
                        .join('');
                    htmlParts.push(actionLines + '<p><br></p>');
                    break;
                case 'centered':
                    htmlParts.push(`<p class="centered${vfxClasses}"${vfxShotNum}>${tokenTextWrap}</p>`);
                    break;
                case 'page-break':
                    htmlParts.push(`<p class="page-break" data-page-number="${token['page-num']}">=======================================================  </p><p><br></p>`);
                    break;
            }
            processedCount++;
            if (processedCount % 100 === 0) {
                log.debug(`Processed ${processedCount}/${tokens.length} tokens`);
            }
        } catch (err) {
            log.error('Error processing token:', err);
            log.error('Token:', token);
        }
    }
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const body = dom.window.document.body;
    body.innerHTML = htmlParts.join('');

    log.debug('Finished processing tokens');
    return body.innerHTML;
}

function htmlToTokens(html) {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const paras = document.querySelectorAll('p');
    const tokens = [];
    const entities = {};
    let blockType = null, blockText = [], blockVfx = null;

    for (const p of paras) {
        const classes = p.classList;
        const vfxClasses = classes.contains('vfx') 
            ? (p.dataset.shotNumber || '') + ' ' + vfxLevels.filter(c => classes.contains(c)).join(' ')
            : null;
        
        for (const mark of p.querySelectorAll('mark')) {
            const entityName = mark.textContent.toUpperCase();
            entities[entityName] = entities[entityName] || { type: '', name: '', count: 0 };
            entities[entityName].type = mark.classList[0];
            entities[entityName].count++;
            mark.outerHTML = `**${mark.textContent}**[[${mark.classList[0]}]]`;
        }

        const noteElements = p.querySelectorAll('.note-bubble');
        const notes = Array.from(noteElements).map(note => note.textContent);
        noteElements.forEach(note => note.remove());  // Remove notes from text content
        const noteText = notes.length 
            ? ' ' + notes.map(note => `[[${note}]]`).join(' ')
            : '';

        const text = p.textContent.trim() + noteText;


        if (isBlank(text)) {
            classes.length = 0; // Make sure empty lines break a block
        }

        // Gather any entity definitions
        const entityMatches = text.matchAll(new RegExp(regex['entity-annotation'], 'g'));
        for (const m of entityMatches) {
            for (const ent of m[2].split(',')) {
                const entityName = ent.trim().toUpperCase();
                entities[entityName] = entities[entityName] || { type: '', name: '', count: 0 };
                entities[entityName].type = m[1];
            }
        }

        if (blockType && !classes.contains(blockType)) {
            tokens.push({ type: blockType, text: blockText.join('\n'), vfx: blockVfx });
            blockType = null;
            blockText = [];
            blockVfx = null;
        }

        if (classes.contains('action')) {
            blockType = 'action';
            blockVfx = blockVfx || vfxClasses;
            blockText.push(text);
        } else if (classes.contains('dialogue')) {
            blockType = 'dialogue';
            blockVfx = blockVfx || vfxClasses;
            blockText.push(text);
        } else if (classes.contains('character')) {
            tokens.push({ type: 'character', text, character: text, vfx: vfxClasses });
        } else if (classes.contains('parenthetical')) {
            tokens.push({ type: 'parenthetical', text, vfx: vfxClasses });
        } else if (classes.contains('scene-heading')) {
            tokens.push({ type: 'scene-heading', text, 'scene-num': p.dataset.sceneNumber || '', vfx: vfxClasses });
        } else if (classes.contains('page-break')) {
            tokens.push({ type: 'page-break', 'page-num': p.dataset.pageNumber || '' });
        } else if (classes.contains('transition')) {
            tokens.push({ type: 'transition', text, vfx: vfxClasses });
        } else if (classes.contains('flashback')) {
            tokens.push({ type: 'flashback', text, vfx: vfxClasses });
        } else if (classes.contains('centered')) {
            tokens.push({ type: 'centered', text, vfx: vfxClasses });
        }
    }

    if (blockType) {
        tokens.push({ type: blockType, text: blockText.join('\n'), vfx: blockVfx });
    }

    return [tokens, entities];
}

// Helper function to escape special characters in regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    parseScript,
    tokensToHtml,
    htmlToTokens,
};