/**
 * Script Export Module
 * Handles saving scripts in various formats with layout preservation
 */

const { promises: fs } = require('fs');
const { createObjectCsvWriter: csv } = require('csv-writer');
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');
const regex = require('./regex');
const ExcelJS = require('exceljs');
const { EDITOR_CONFIG } = require('../../config.main.js');

// Configuration
const CONFIG = {
    isPackaged: process.argv.includes('--packaged'),
    vfxLevels: EDITOR_CONFIG.vfx.difficultyLevels.map(level => level.id).join('|'),
    exportPath: path.join(app.getPath('userData'), 'exports'),
    defaultStyles: {
        headerFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } },
        headerFont: { bold: true },
        headerAlignment: { horizontal: 'center', vertical: 'bottom' },
        headerHeight: 80
    }
};

// Column definitions for exports
const EXPORT_HEADERS = [
    { id: 'page', title: 'page', width: 4, format: { alignment: { horizontal: "right" } }, headerFormat: { textRotation: 90 } },
    { id: 'scene', title: 'scene no', width: 4, format: { alignment: { horizontal: "right" } }, headerFormat: { textRotation: 90 } },
    { id: 'sceneDescr', title: 'scene', width: 4, format: { alignment: {horizontal: "left"}}},
    { id: 'description', title: 'scene description', width: 4 },
    { id: 'text', title: 'text', width: 50, format: { alignment: { horizontal: "left", wrapText: true } } },
    { id: 'length', title: 'length', width: 6, format: { numFmt: "0", alignment: {horizontal: "right" } }, headerFormat: { textRotation: 90 } },
    { id: 'lengthDec', title: 'length decimal', width: 6, format: { numFmt: "0.00", alignment: {horizontal: "right" } }, headerFormat: { textRotation: 90 } },
    { id: 'shotCount14', title: 'shot count 14 shots per page', width: 6, format: { numFmt: "0", alignment: {horizontal: "right" } }, headerFormat: { textRotation: 90 } },
    { id: 'shotCount20', title: 'shot count 20 shots per page', width: 6, format: { numFmt: "0", alignment: {horizontal: "right" } }, headerFormat: { textRotation: 90 } },
    { id: 'shotCount24', title: 'shot count 24 shots per page', width: 6, format: { numFmt: "0", alignment: {horizontal: "right" } }, headerFormat: { textRotation: 90 } },
    { id: 'difficulty', title: 'difficulty', width: 8, format: { alignment: { horizontal: "right" } } },
    { id: 'shotNumber', title: 'shot number', width: 8, format: { numFmt: "0", alignment: {horizontal: "right" } }, headerFormat: { textRotation: 90 }},
    { id: 'notes', title: 'notes', width: 30, format: { alignment: { wrapText: true } } }
];

/**
 * @typedef {Object} ExportOptions
 * @property {boolean} [full=true] - Whether to include all lines or only VFX shots
 * @property {boolean} [clean=true] - Whether to clean up formatting
 */

/**
 * Write script to CSV/Excel format
 * @param {Array} tokens - Script tokens
 * @param {Object} entities - Entity definitions
 * @param {string} outputPath - Output file path
 * @param {boolean} full - Whether to include all lines
 */
async function writeScriptCsv(tokens, entities, outputPath, full = true) {
    try {
        const vfxRegex = new RegExp(`\\s*(\\d+)?\\s*(${CONFIG.vfxLevels})\\s*`);
        const [pageCounts, sceneCounts] = calculateLineCounts(tokens);
        const sceneEnts = profileScenes(tokens, entities);
        
        log.debug('Export analysis:', { pageCounts, sceneCounts });

        // Add entity columns
        const allHeaders = [
            ...EXPORT_HEADERS,
            ...Object.keys(entities).map(ent => ({ 
                id: `entity_${ent}`, 
                title: ent, 
                width: 4, 
                format: { alignment: { horizontal: "right" } }, 
                headerFormat: { textRotation: 90 } 
            }))
        ];

        // Create export handler
        const ext = path.extname(outputPath).toLowerCase();
        const handler = ext === '.xlsx' 
            ? createExcelHandler(outputPath, allHeaders)
            : createCsvHandler(outputPath, allHeaders);

        const rows = generateRows(tokens, {
            vfxRegex,
            pageCounts,
            sceneCounts,
            entities,
            sceneEnts,
            full
        });

        await handler.addRows(rows);
        await handler.finish();
        
        log.info('Script export complete:', { path: outputPath });
    } catch (error) {
        log.error('Script export error:', error);
        throw error;
    }
}

/**
 * Calculate line counts for pages and scenes
 * @private
 */
function calculateLineCounts(tokens) {
    let pageNum = 1, pageCounts = {}, pageCount = 0;
    let sceneNum = null, sceneCounts = {}, sceneCount = 0;

    // Initialize scene counts
    tokens.forEach(token => {
        if (token.type === 'scene-heading' && token['scene-num']) {
            sceneCounts[token['scene-num']] = 0;
        }
    });

    tokens.forEach(token => {
        const textStripped = (token.text || '')
            .replace(regex.annotation, '$1')
            .trim();
        
        if (token.type === 'page-break') {
            if (pageCount) pageCounts[pageNum] = pageCount;
            pageNum = parseInt(token['page-num']);
            pageCount = 0;
        } else if (token.type === 'scene-heading') {
            if (sceneNum) sceneCounts[sceneNum] = sceneCount;
            sceneNum = token['scene-num'] || sceneNum;
            sceneCount = 2;
            pageCount += 2;
        } else if (['character', 'parenthetical'].includes(token.type)) {
            const lines = (textStripped.match(/\n/g) || []).length + 1;
            pageCount += lines;
            sceneCount += lines;
        } else if (['dialogue', 'action', 'flashback', 'transition'].includes(token.type)) {
            const lines = (textStripped.match(/\n/g) || []).length + 2;
            pageCount += lines;
            sceneCount += lines;
        }
    });

    if (pageCount) pageCounts[pageNum] = pageCount;
    if (sceneNum) sceneCounts[sceneNum] = sceneCount;

    return [pageCounts, sceneCounts];
}

/**
 * Create CSV export handler
 * @private
 */
function createCsvHandler(outputPath, headers) {
    const csvWriter = csv({
        path: outputPath,
        header: headers.map(h => ({ id: h.id, title: h.title }))
    });
    return {
        addRows: async (rows) => {
            await csvWriter.writeRecords(rows);
            log.info('CSV records written');
        },
        finish: async () => {
            log.info('CSV export complete');
        }
    };
}

/**
 * Create Excel export handler
 * @private
 */
function createExcelHandler(outputPath, headers) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Script Breakdown');
    
    worksheet.columns = headers.map(h => ({
        header: h.title,
        key: h.id,
        width: h.width
    }));
    
    return {
        addRows: async (newRows) => {
            worksheet.addRows(newRows);
            log.info('Excel rows added');
        },
        finish: async () => {
            styleExcelWorksheet(worksheet, headers);
            await workbook.xlsx.writeFile(outputPath);
            log.info('Excel export complete');
        }
    };
}

/**
 * Style Excel worksheet
 * @private
 */
function styleExcelWorksheet(worksheet, headers) {
    const headerRow = worksheet.getRow(1);
    headers.forEach((header, i) => {
        const cell = headerRow.getCell(i + 1);
        Object.assign(cell, {
            fill: CONFIG.defaultStyles.headerFill,
            font: CONFIG.defaultStyles.headerFont,
            alignment: {
                ...CONFIG.defaultStyles.headerAlignment,
                ...header.headerFormat
            }
        });
    });

    if (headers.some(h => h.headerFormat?.textRotation)) {
        headerRow.height = CONFIG.defaultStyles.headerHeight;
    }

    worksheet.getRows(2, worksheet.rowCount)?.forEach(row => {
        const hasSceneDescr = row.getCell('sceneDescr').value;
        headers.forEach((header, i) => {
            const cell = row.getCell(i + 1);
            if (!cell.value?.toString().trim()) {
                cell.value = null;
                return;
            }
            if (hasSceneDescr) {
                cell.font = { bold: true };
            }
            if (header.format) {
                Object.assign(cell, header.format);
            }
        });
    });
}

/**
 * Generate export rows
 * @private
 */
function generateRows(tokens, context) {
    const { vfxRegex, pageCounts, sceneCounts, entities, sceneEnts, full } = context;
    const rows = [];
    let state = {
        pageNum: 1,
        sceneNum: '',
        block: '',
        blockLines: 0,
        blockNotes: '',
        pageLines: 0,
        pageLinesAccounted: 0,
        vfxLevel: '',
        vfxShotNum: '',
        sceneDescr: '',
        shotCount: { 14: 0, 20: 0, 24: 0 },
        shotLinesAccounted: { 14: 0, 20: 0, 24: 0 }
    };

    for (const token of tokens) {
        processTokenForExport(token, state, rows, {
            vfxRegex,
            pageCounts,
            sceneCounts,
            entities,
            sceneEnts,
            full
        });
    }

    return rows;
}

/**
 * Process token for export
 * @private
 */
function processTokenForExport(token, state, rows, context) {
    const { vfxRegex, pageCounts, sceneCounts, entities, sceneEnts, full } = context;
    
    // Extract and validate VFX information
    const vfxInfo = extractVfxInfo(token.vfx, vfxRegex);
    const thisVfxLevel = vfxInfo.level;
    const thisVfxShotNum = vfxInfo.shotNum;
    const notes = extractNotes(token.text);
    const textStripped = token.text ? 
        token.text
            .replace(regex.annotation, '$1')
            .replace(regex.note, '$1')
            .trim() 
        : '';

    switch (token.type) {
        case 'page-break':
            handlePageBreak(token, state);
            break;
        case 'scene-heading':
            handleSceneHeading(token, state, rows, {
                textStripped,
                notes,
                sceneCounts,
                pageCounts,
                entities,
                sceneEnts
            });
            break;
        case 'character':
            handleCharacter(state, {
                textStripped,
                notes,
                thisVfxLevel,
                thisVfxShotNum
            });
            break;
        case 'parenthetical':
            handleParenthetical(state, {
                textStripped,
                notes,
                thisVfxLevel,
                thisVfxShotNum
            });
            break;
        case 'dialogue':
        case 'action':
            handleDialogueAction(state, rows, {
                textStripped,
                notes,
                thisVfxLevel,
                thisVfxShotNum,
                pageCounts,
                entities,
                full
            });
            break;
        case 'flashback':
        case 'transition':
            handleFlashbackTransition(state, {
                textStripped,
                notes,
                thisVfxLevel,
                thisVfxShotNum
            });
            break;
    }
}

/**
 * Handle page break token
 * @private
 */
function handlePageBreak(token, state) {
    state.pageLines = 0;
    state.pageLinesAccounted = 0;
    state.pageNum = parseInt(token['page-num'] || state.pageNum);
    Object.keys(state.shotLinesAccounted).forEach(spp => {
        state.shotLinesAccounted[spp] = 0;
    });
}

/**
 * Handle scene heading token
 * @private
 */
function handleSceneHeading(token, state, rows, context) {
    const { textStripped, notes, sceneCounts, pageCounts, entities, sceneEnts } = context;
    
    state.sceneNum = token['scene-num'];
    state.sceneDescr = textStripped;
    
    const [length, lengthDecimal] = calculateFractionalPageCount(
        sceneCounts[state.sceneNum],
        pageCounts[state.pageNum]
    );

    rows.push({
        page: state.pageNum,
        scene: state.sceneNum,
        sceneDescr: state.sceneDescr,
        description: '',
        text: '',
        length: ' ' + length,
        lengthDec: lengthDecimal,
        shotCount14: Math.round(lengthDecimal * 14),
        shotCount20: Math.round(lengthDecimal * 20),
        shotCount24: Math.round(lengthDecimal * 24),
        difficulty: '',
        shotNumber: '',
        notes: notes,
        ...Object.fromEntries(
            Object.keys(entities).map(ent => [
                `entity_${ent}`,
                sceneEnts[state.sceneNum][ent].count || ''
            ])
        )
    });

    state.block = '';
    state.blockLines = 2;
    state.blockNotes = '';
    state.vfxLevel = '';
    state.vfxShotNum = '';
}

/**
 * Handle character token
 * @private
 */
function handleCharacter(state, context) {
    const { textStripped, notes, thisVfxLevel, thisVfxShotNum } = context;
    
    state.block = textStripped + ':';
    state.blockNotes = notes;
    state.vfxLevel = thisVfxLevel;
    state.vfxShotNum = thisVfxShotNum;
}

/**
 * Handle parenthetical token
 * @private
 */
function handleParenthetical(state, context) {
    const { textStripped, notes, thisVfxLevel, thisVfxShotNum } = context;
    
    state.block = state.block ? state.block + '\n' + textStripped : textStripped;
    state.blockNotes = notes;
    state.vfxLevel = state.vfxLevel || thisVfxLevel;
    state.vfxShotNum = state.vfxShotNum || thisVfxShotNum;
}

/**
 * Handle dialogue/action token
 * @private
 */
function handleDialogueAction(state, rows, context) {
    const { 
        textStripped, 
        notes, 
        thisVfxLevel, 
        thisVfxShotNum, 
        pageCounts, 
        entities, 
        full 
    } = context;
    
    state.block = state.block ? state.block + '\n' + textStripped : textStripped;
    state.blockLines += state.block.split('\n').length + 2;
    state.blockNotes = state.blockNotes ? state.blockNotes + '\n' + notes : notes;
    state.pageLines += state.blockLines;

    const [length, lengthDecimal, linesAccounted] = calculateFractionalPageCount(
        state.pageLines - state.pageLinesAccounted,
        pageCounts[state.pageNum]
    );
    state.pageLinesAccounted += linesAccounted;

    Object.keys(state.shotLinesAccounted).forEach(spp => {
        state.shotCount[spp] = Math.round(
            spp * (state.pageLines - state.shotLinesAccounted[spp]) / 
            pageCounts[state.pageNum]
        );
        state.shotLinesAccounted[spp] += state.shotCount[spp] / spp * 
            pageCounts[state.pageNum];
    });

    state.block = state.block.replace(regex.whitespacenewline, ' ');
    state.vfxLevel = state.vfxLevel || thisVfxLevel;
    state.vfxShotNum = state.vfxShotNum || thisVfxShotNum;

    if (state.vfxLevel || full) {
        const ents = Object.keys(entities).filter(ent => 
            state.block.toLowerCase().includes(ent.toLowerCase())
        );
        
        rows.push({
            page: state.pageNum,
            scene: state.sceneNum,
            sceneDescr: '',
            description: state.sceneDescr,
            text: state.block,
            length: ' ' + length,
            lengthDec: lengthDecimal,
            shotCount14: state.shotCount[14],
            shotCount20: state.shotCount[20],
            shotCount24: state.shotCount[24],
            difficulty: state.vfxLevel,
            shotNumber: state.vfxShotNum,
            notes: state.blockNotes,
            ...Object.fromEntries(
                Object.keys(entities).map(ent => [
                    `entity_${ent}`,
                    ents.includes(ent) ? 1 : ''
                ])
            )
        });
    }

    state.block = '';
    state.blockLines = 0;
    state.blockNotes = '';
    state.vfxLevel = '';
    state.vfxShotNum = '';
}

/**
 * Handle flashback/transition token
 * @private
 */
function handleFlashbackTransition(state, context) {
    const { textStripped, notes, thisVfxLevel, thisVfxShotNum } = context;
    
    state.block = state.block ? state.block + '\n' + textStripped : textStripped;
    state.blockLines += 1;
    state.blockNotes = state.blockNotes ? state.blockNotes + '\n' + notes : notes;
    state.vfxLevel = state.vfxLevel || thisVfxLevel;
    state.vfxShotNum = state.vfxShotNum || thisVfxShotNum;
}

/**
 * Calculate fractional page count
 * @private
 */
function calculateFractionalPageCount(lineCount, linesPerPage) {
    // Handle invalid inputs
    if (!lineCount || !linesPerPage || isNaN(lineCount) || isNaN(linesPerPage)) {
        return ['0', 0, 0];
    }

    // Ensure positive numbers
    lineCount = Math.max(0, Number(lineCount));
    linesPerPage = Math.max(1, Number(linesPerPage));

    // Calculate ratio with minimum value
    const ratio = Math.max(lineCount / linesPerPage, 1/32);
    const ratioWhole = Math.floor(ratio);
    const ratioFraction = ratio - ratioWhole;
    
    // Find best fraction representation
    let bestRatio = { diff: 1, str: '0', decimal: 0 };
    
    for (const i of [2, 4, 8, 16, 32]) {
        const rounded = Math.round(ratioFraction * i) / i;
        const diff = Math.abs(ratioFraction - rounded);
        if (diff < bestRatio.diff) {
            bestRatio = {
                diff,
                str: `${Math.round(ratioFraction * i)}/${i}`,
                decimal: rounded
            };
        }
    }

    // Calculate final values
    const ratioDecimal = ratioWhole + bestRatio.decimal;
    const displayStr = ratioWhole ?
        `${ratioWhole} ${bestRatio.str}` :
        bestRatio.str;

    return [
        displayStr,
        ratioDecimal,
        ratioDecimal * linesPerPage
    ];
}

/**
 * Extract notes from text
 * @private
 */
function extractNotes(text) {
    return [...(text?.matchAll(regex['note']) || [])]
        .map(match => match[1]?.trim())
        .filter(Boolean)
        .join('\n');
}

/**
 * Profile scenes for entity occurrences
 * @private
 */
function profileScenes(tokens, entities = {}) {
    const sceneHeadings = tokens.reduce((acc, token, index) => {
        if (token.type === 'scene-heading') acc.push(index);
        return acc;
    }, []);

    const sceneEnts = {};

    for (let i = 0; i < sceneHeadings.length; i++) {
        const start = sceneHeadings[i];
        const end = i === sceneHeadings.length - 1 ? 
            tokens.length - 1 : 
            sceneHeadings[i + 1];
        
        const ents = JSON.parse(JSON.stringify(entities));
        Object.keys(ents).forEach(key => ents[key].count = 0);

        for (let j = start + 1; j < end; j++) {
            const token = tokens[j];
            if (!['character', 'dialogue', 'parenthetical', 'action'].includes(token.type)) {
                continue;
            }

            const textClean = (token.text || '')
                .replace(regex.annotation, '$1')
                .trim()
                .replace(regex.annotation, '$1')
                .trim();

            Object.keys(ents).forEach(ent => {
                if (textClean.toLowerCase().includes(ent.toLowerCase())) {
                    ents[ent].count++;
                }
            });
        }

        sceneEnts[tokens[start]['scene-num']] = ents;
    }

    return sceneEnts;
}

/**
 * Write raw script content
 * @param {string} content - Script content
 * @param {string} filePath - Output file path
 */
async function writeScriptRaw(content, filePath) {
    try {
        if (typeof content !== 'string') {
            throw new TypeError('Content must be a string');
        }
        await fs.writeFile(filePath, content, 'utf8');
        log.info('Raw script written:', { path: filePath });
    } catch (error) {
        log.error('Raw script write error:', error);
        throw error;
    }
}

/**
 * Convert tokens to raw script format
 * @param {Array} tokens - Script tokens
 * @param {Object} entities - Entity definitions
 * @param {boolean} clean - Whether to clean up formatting
 * @returns {string} Formatted script content
 */
function tokensToRaw(tokens, entities, clean = true) {
    try {
        let output = '';

        // Write entity definitions if not cleaning
        if (!clean) {
            const groupedEnts = {};
            Object.entries(entities).forEach(([entity, attributes]) => {
                if (!groupedEnts[attributes.type]) groupedEnts[attributes.type] = [];
                groupedEnts[attributes.type].push([entity, attributes]);
            });

            Object.entries(groupedEnts).forEach(([entityType, entityList]) => {
                const entList = entityList.sort((a, b) => b[1].count - a[1].count);
                const entListGrouped = [];
                for (let i = 0; i < entList.length; i += 5) {
                    entListGrouped.push(entList.slice(i, i + 5));
                }
                entListGrouped.forEach(el => {
                    output += `[[${entityType}  ${el.map(e => e[0]).join(', ')} ]]\n`;
                });
            });
        }

        // Process tokens
        tokens.forEach(token => {
            // Format VFX annotation with shot number and level
            let vfx = '';
            if (token.vfx && !clean) {
                const vfxParts = token.vfx.split(' ');
                const hasNumber = /^\d+$/.test(vfxParts[0]);
                if (hasNumber) {
                    vfx = ` [[vfx ${vfxParts[0]} ${vfxParts[1]}]]`;
                } else {
                    vfx = ` [[vfx ${token.vfx}]]`;
                }
                log.debug('vfx: ' + token.vfx + ' -> ' + vfx);
            }
            let text = token.text || '';
            let textClean = text
                .replace(regex.annotation, '$1')
                .trim()
                .replace(regex.annotation, '$1')
                .trim();
            text = clean ? textClean : text;

            switch (token.type) {
                case 'action':
                    text.split('\n').forEach(line => {
                        if (['character', 'scene-heading'].some(e => 
                            regex[e].test(line.replace(regex.annotation, '$1').trim())
                        )) {
                            line = '!' + line;
                        }
                        output += `${line.padEnd(80)}${vfx}\n`;
                    });
                    output += '\n';
                    break;

                case 'dialogue':
                    text.split('\n').forEach(line => {
                        output += `${' '.repeat(10)}${line.padEnd(70)}${vfx}\n`;
                    });
                    output += '\n';
                    break;

                case 'character':
                    const char = regex.character.test(textClean) ? text : '@' + text;
                    output += `${' '.repeat(15)}${char.padEnd(65)}${vfx}\n`;
                    break;

                case 'parenthetical':
                    output += `${' '.repeat(10)}${text.padEnd(70)}${vfx}\n`;
                    break;

                case 'scene-heading':
                    const heading = regex['scene-heading'].test(
                        text.replace(regex.annotation, '$1').trim()
                    ) ? text : '.' + text;
                    const sceneNum = token['scene-num'] ? `#${token['scene-num']}#` : '';
                    output += `${heading.padEnd(70)}${sceneNum.padStart(10)}${vfx}\n\n`;
                    break;

                case 'page-break':
                    output += `${'='.repeat(74)} ${(token['page-num'] || '').toString().padStart(5)}\n\n`;
                    break;

                case 'transition':
                case 'flashback':
                    output += `${text.padEnd(80)}${vfx}\n\n`;
                    break;
            }
        });

        return output;
    } catch (error) {
        log.error('Error converting tokens to raw format:', error);
        throw error;
    }
}

/**
 * Write tokens to file
 * @param {Array} tokens - Script tokens
 * @param {Object} entities - Entity definitions
 * @param {string} outputPath - Output file path
 * @param {ExportOptions} options - Export options
 */
async function writeTokens(tokens, entities, outputPath, options = { clean: true }) {
    try {
        const content = tokensToRaw(tokens, entities, options.clean);
        await writeScriptRaw(content, outputPath);
        log.info('Tokens written successfully:', { path: outputPath });
    } catch (error) {
        log.error('Error writing tokens:', error);
        throw error;
    }
}

/**
 * Write script to HTML format
 * @param {string} html - HTML content
 * @param {string} outputPath - Output file path
 */
async function writeHtml(html, outputPath) {
    try {
        const template = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Script</title>
    <style>
        body { font-family: Courier, monospace; }
        .scene-heading { text-transform: uppercase; }
        .character { text-align: center; }
        .parenthetical { text-align: center; }
        .dialogue { text-align: center; max-width: 60%; margin: 0 auto; }
        .transition { text-align: right; }
        .centered { text-align: center; }
        .vfx { background-color: #ffeb3b; }
        .hard { border: 2px solid red; }
        .mid { border: 2px solid orange; }
        .easy { border: 2px solid green; }
    </style>
</head>
<body>
${html}
</body>
</html>`;

        await writeScriptRaw(template, outputPath);
        log.info('HTML export complete:', { path: outputPath });
    } catch (error) {
        log.error('HTML export error:', error);
        throw error;
    }
}

/**
 * Sort entities by type and count
 * @param {Object} entities - Entity definitions
 * @returns {Array} Sorted entity entries
 */
function sortEntities(entities) {
    return Object.entries(entities)
        .sort(([a], [b]) => {
            if (entities[a].type !== entities[b].type) {
                return entities[a].type.localeCompare(entities[b].type);
            }
            if (entities[a].count !== entities[b].count) {
                return entities[b].count - entities[a].count;
            }
            return a.localeCompare(b);
        });
}

/**
 * Export script in all formats
 * @param {Array} tokens - Script tokens
 * @param {Object} entities - Entity definitions
 * @param {string} baseFilename - Base filename for exports
 * @returns {Promise<string>} Path to exports directory
 */
async function exportAll(tokens, entities, baseFilename) {
    try {
        const exportsDir = await PathUtils.ensureExportsDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const base = path.join(exportsDir, `${baseFilename}_${timestamp}`);

        await Promise.all([
            writeScriptCsv(tokens, entities, `${base}_script.csv`),
            writeTokens(tokens, entities, `${base}_tokens.txt`, { clean: false }),
            writeHtml(tokens, `${base}.html`)
        ]);

        log.info('All exports complete:', { 
            base,
            formats: ['csv', 'txt', 'html']
        });
        
        return exportsDir;
    } catch (error) {
        log.error('Export error:', error);
        throw error;
    }
}

module.exports = {
    writeScriptCsv,
    writeTokens,
    writeHtml,
    writeScriptRaw,
    sortEntities,
    exportAll
};