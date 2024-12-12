const { promises: fs } = require('fs');
const { createObjectCsvWriter: csv } = require('csv-writer');
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');
const regex = require('./regex');
const ExcelJS = require('exceljs');
const { EDITOR_CONFIG } = require('../../config.main.js');

const vfxLevels = EDITOR_CONFIG.vfx.difficultyLevels.map(level => level.id).join('|');


const isPackaged = process.argv.includes('--packaged');

const getFilePath = (relativePath) => {
    return isPackaged
      ? path.join(process.resourcesPath, 'server', relativePath)
      : path.join(__dirname, '..', '..', relativePath);
};

// Helper function to get app data path
function getAppDataPath() {
    return path.join(app.getPath('userData'), 'exports');
}

// Ensure exports directory exists
async function ensureExportsDir() {
    const exportsDir = getAppDataPath();
    await fs.mkdir(exportsDir, { recursive: true });
    return exportsDir;
}

function fractionalPageCount32(lineCount, linesPerPage) {
    const ratio = Math.max(lineCount / linesPerPage, 1/32);
    const ratioWhole = Math.floor(ratio);
    const ratioFraction = ratio - ratioWhole;
    let ratioStr, ratioRounded;

    for (const i of [2, 4, 8, 16, 32]) {
        ratioRounded = Math.round(ratioFraction * i) / i;
        if (Math.abs(ratioFraction - ratioRounded) <= 1/64) {
            ratioStr = `${Math.round(ratioFraction * i)}/${i}`;
            break;
        }
    }

    ratioStr = ratioWhole ? `${ratioWhole} ${ratioStr}` : ratioStr;
    return [ratioStr, ratioWhole + ratioRounded, (ratioWhole + ratioRounded) * linesPerPage];
}

function linesPerPage(tokens) {
    let pageNum = 1, pageCounts = {}, pageCount = 0;
    let sceneNum = null, sceneCounts = {}, sceneCount = 0;
    
    // Assemble all known scene numbers as keys of sceneCounts
    tokens.forEach(token => {
        if (token.type === 'scene-heading' && token['scene-num']) {
            sceneCounts[token['scene-num']] = 0;
        }
    });

    tokens.forEach(token => {
        const textStripped = (token.text || '').replace(regex.annotation, '$1').trim();
        
        if (token.type === 'page-break') {
            if (pageCount) { // Flush out last page if it exists
                pageCounts[pageNum] = pageCount;
            }
            pageNum = parseInt(token['page-num']);
            pageCount = 0;
        } else if (token.type === 'scene-heading') {
            if (sceneNum) { // Only flush out previous scene if it has a scene number
                //console.log('flushing scene', sceneNum, sceneCount)
                sceneCounts[sceneNum] = sceneCount;
            }
            sceneNum = token['scene-num'] || sceneNum;
            while (sceneCounts[sceneNum] !== undefined && sceneCounts[sceneNum] > 0) { // Scene number already is filled with a count
                const m = sceneNum.match(regex['scene-number']);
                if (m[1]) { // Number first
                    if (m[2]) { // If letter exists increase last letter
                        sceneNum = m[1] + m[2].slice(0, -1) + String.fromCharCode(m[2].charCodeAt(m[2].length - 1) + 1);
                    } else {
                        sceneNum = m[1] + 'A';
                    }
                } else if (m[3]) { // If letter exists increase last letter
                    sceneNum = m[3].slice(0, -1) + String.fromCharCode(m[3].charCodeAt(m[3].length - 1) + 1) + m[4];
                } else {
                    sceneNum = m[4] + 'A';
                }
            }
            console.log('processing scene', token['scene-num'], sceneNum)
            token['scene-num'] = sceneNum; // update the scene number
            sceneCount = 2; // Lines in current scene
            pageCount += 2; // Lines in current page
        } else if (token.type === 'character' || token.type === 'parenthetical') {
            pageCount += (textStripped.match(/\n/g) || []).length + 1;
            sceneCount += (textStripped.match(/\n/g) || []).length + 1;
        } else if (['dialogue', 'action', 'flashback', 'transition'].includes(token.type)) {
            pageCount += (textStripped.match(/\n/g) || []).length + 2;
            sceneCount += (textStripped.match(/\n/g) || []).length + 2;
        }
    });

    if (pageCount) { // Flush last page
        pageCounts[pageNum] = pageCount;
    }
    if (sceneNum) { // Only flush out previous scene if it has a scene number
        sceneCounts[sceneNum] = sceneCount;
    }

    return [pageCounts, sceneCounts];
}


function blankIfZero(n) {
    return n !== 0 ? n : '';
}

const outputWrappers = {
    csv: {
        create: (outputPath, headers) => {
            const csvWriter = csv({
                path: outputPath,
                header: headers.map(h => ({ id: h.id, title: h.title }))
            });
            return {
                addRows: async (rows) => await csvWriter.writeRecords(rows),
                finish: async () => console.log('CSV file written successfully')
            };
        }
    },
    xlsx: {
        create: (outputPath, headers) => {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Script Breakdown');
            
            // Add headers
            worksheet.columns = headers.map(h => ({
                header: h.title,
                key: h.id,
                width: h.width
            }));
            
            return {
                addRows: async (newRows) => {
                    worksheet.addRows(newRows);
                },
                finish: async () => {
                    // Style the header row
                    const headerRow = worksheet.getRow(1);
                    
                    headers.forEach((header, i) => {
                        const cell = headerRow.getCell(i + 1);
                        
                        // Apply base header styles
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFCCCCCC' }
                        };
                        cell.font = {
                            bold: true
                        };
                        // Apply alignment from format and headerFormat
                        cell.alignment = {
                            horizontal: header.format?.alignment?.horizontal || 'center',
                            vertical: 'bottom',
                            ...(header.headerFormat || {})
                        };
                    });

                    // Set row height if we have rotated headers
                    if (headers.some(h => h.headerFormat?.textRotation)) {
                        headerRow.height = 80;
                    }

                    // Style data columns
                    const dataRows = worksheet.getRows(2, worksheet.rowCount);
                    if (dataRows) {
                        dataRows.forEach(row => {
                            const hasSceneDescr = row.getCell('sceneDescr').value;

                            headers.forEach((header, i) => {
                                const cell = row.getCell(i + 1);
                                // Check if cell is empty or just whitespace
                                if (!cell.value || (typeof cell.value === 'string' && cell.value.trim() === '')) {
                                    cell.value = null;
                                    // Skip formatting empty cells
                                    return;
                                }
                                if (hasSceneDescr) {
                                    cell.font = { bold: true };
                                }
                                if (header.format) {
                                    if (header.format.numFmt) {
                                        cell.numFmt = header.format.numFmt;
                                    }
                                    if (header.format.alignment) {
                                        cell.alignment = header.format.alignment;
                                    }
                                }
                            });
                        });
                    }

                    await workbook.xlsx.writeFile(outputPath);
                    console.log('Excel file written successfully');
                }
            };
        }
    }
};

// Define headers with format specifications
const headers = [
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
    { id: 'notes', title: 'notes', width: 30, format: { alignment: { wrapText: true } } },
];

async function writeScriptCsv(tokens, entities, outputPath,  full = true) {
    try {
        const vfxRegex = new RegExp(`\\s*(\\d+)?\\s*(${vfxLevels})\\s*`);
        const [pageCounts, sceneCounts] = linesPerPage(tokens);
        const sceneEnts = profileScenes(tokens, entities);
    
        console.log('lines per page', pageCounts, sceneCounts)

        // Add entity columns to headers
        const allHeaders = [
            ...headers,
            ...Object.keys(entities).map(ent => ({ 
                id: `entity_${ent}`, 
                title: ent, 
                width: 4, 
                format: { alignment: { horizontal: "right" } }, 
                headerFormat: { textRotation: 90 } 
            }))
        ];

        // Create appropriate wrapper based on file extension
        const ext = path.extname(outputPath).toLowerCase();
        const wrapper = ext === '.xlsx' 
            ? outputWrappers.xlsx.create(outputPath, allHeaders)
            : outputWrappers.csv.create(outputPath, allHeaders);
    
        let pageNum = 1;
        let sceneNum = '';
        let block = '';
        let blockLines = 0;
        let blockNotes = '';
        let pageLines = 0;
        let pageLinesAccounted = 0;
        let vfxLevel = ''; 
        let vfxShotNum = '';
        
        const shotCount = {14: 0, 20: 0, 24: 0};
        const shotLinesAccounted = {14: 0, 20: 0, 24: 0};

        const rows = [];
        let sceneDescr = '';

        function extractNotes(text) {
            return [...(text?.matchAll(regex['note']) || [])]
                .map(match => match[1]?.trim())
                .filter(Boolean)
                .join('\n');
        }
    
        for (const token of tokens) {
            const match = token.vfx ? token.vfx.match(vfxRegex) : null;
            const thisVfxLevel = match ? match[2] : token.vfx || '';
            const thisVfxShotNum = match ? match[1] : '';
            const notes = extractNotes(token.text);
            const textStripped = token.text ? token.text.replace(regex.annotation, '$1').replace(regex.note, '$1').trim() : '';
    
            if (token.type === 'page-break') {
                pageLines = 0;
                pageLinesAccounted = 0;
                pageNum = parseInt(token['page-num']);
                Object.keys(shotLinesAccounted).forEach(spp => {
                    shotLinesAccounted[spp] = 0;
                });
            } else if (token.type === 'scene-heading') {
                sceneNum = token['scene-num'];
                sceneDescr = textStripped;
                console.log('scene counts:', sceneCounts[sceneNum], pageCounts[pageNum])
                const [length, lengthDecimal, linesAccounted] = fractionalPageCount32(sceneCounts[sceneNum], pageCounts[pageNum]);
                rows.push({
                    page: pageNum,
                    scene: sceneNum,
                    sceneDescr: sceneDescr,
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
                    ...Object.fromEntries(Object.keys(entities).map(ent => [`entity_${ent}`, blankIfZero(sceneEnts[sceneNum][ent].count)]))
                });
                block = '';
                blockLines = 2;
                blockNotes = '';
                vfxLevel = '';
                vfxShotNum = '';
            } else if (token.type === 'character') {
                block = textStripped + ':';
                blockNotes = notes;
                vfxLevel = thisVfxLevel;
                vfxShotNum = thisVfxShotNum;
            } else if (token.type === 'parenthetical') {
                block = block ? block + '\n' + textStripped : textStripped;
                blockNotes = notes;
                vfxLevel = vfxLevel || thisVfxLevel;
                vfxShotNum = vfxShotNum || thisVfxShotNum;
            } else if (token.type === 'dialogue' || token.type === 'action') {
                block = block ? block + '\n' + textStripped : textStripped;
                blockLines += block.split('\n').length + 2;
                blockNotes = blockNotes ? blockNotes + '\n' + notes : notes;
                pageLines += blockLines;
                const [length, lengthDecimal, linesAccounted] = fractionalPageCount32(pageLines - pageLinesAccounted, pageCounts[pageNum]);
                pageLinesAccounted += linesAccounted;
                Object.keys(shotLinesAccounted).forEach(spp => {
                    shotCount[spp] = Math.round(spp * (pageLines - shotLinesAccounted[spp]) / pageCounts[pageNum]);
                    shotLinesAccounted[spp] += shotCount[spp] / spp * pageCounts[pageNum];
                });
                block = block.replace(regex.whitespacenewline, ' ');
                vfxLevel = vfxLevel || thisVfxLevel;
                vfxShotNum = vfxShotNum || thisVfxShotNum;
                if (vfxLevel || full) {
                    const ents = Object.keys(entities).filter(ent => block.toLowerCase().includes(ent.toLowerCase()));
                    rows.push({
                        page: pageNum,
                        scene: sceneNum,
                        sceneDescr: '',
                        description: sceneDescr,
                        text: block,
                        length: ' ' + length,
                        lengthDec: lengthDecimal,
                        shotCount14: shotCount[14],
                        shotCount20: shotCount[20],
                        shotCount24: shotCount[24],
                        difficulty: vfxLevel,
                        shotNumber: vfxShotNum,
                        notes: blockNotes,
                        ...Object.fromEntries(Object.keys(entities).map(ent => [`entity_${ent}`, ents.includes(ent) ? 1 : '']))
                    });
                }
                block = '';
                blockLines = 0;
                blockNotes = '';
                vfxLevel = '';
                vfxShotNum = '';
            } else if (token.type === 'flashback' || token.type === 'transition') {
                block = block ? block + '\n' + textStripped : textStripped;
                blockLines += 1;
                blockNotes = blockNotes ? blockNotes + '\n' + notes : notes;
                vfxLevel = vfxLevel || thisVfxLevel;
                vfxShotNum = vfxShotNum || thisVfxShotNum;
            }
        }
    
        await wrapper.addRows(rows);
        await wrapper.finish();
        console.log('file written successfully', outputPath);    
    } catch (error) {
        log.error('Error writing script CSV:', error);
        throw error;
    }
}

function profileScenes(tokens, entities = {}) {
    const sceneHeadings = tokens.reduce((acc, token, index) => {
        if (token.type === 'scene-heading') acc.push(index);
        return acc;
    }, []);

    const sceneEnts = {};

    for (let i = 0; i < sceneHeadings.length; i++) {
        const start = sceneHeadings[i];
        const end = i === sceneHeadings.length - 1 ? tokens.length - 1 : sceneHeadings[i + 1];
        const ents = JSON.parse(JSON.stringify(entities));
        Object.keys(ents).forEach(key => ents[key].count = 0);

        for (let j = start + 1; j < end; j++) {
            const token = tokens[j];
            const text = token.text || '';
            const textClean = text.replace(regex.annotation, '$1').trim().replace(regex.annotation, '$1').trim();
            if (['character', 'dialogue', 'parenthetical', 'action'].includes(token.type)) {
                Object.keys(ents).forEach(ent => {
                    if (textClean.toLowerCase().includes(ent.toLowerCase())) {
                        ents[ent].count++;
                    }
                });
            }
        }
        sceneEnts[tokens[start]['scene-num']] = ents;
    }
    return sceneEnts;
}

async function writeScenesCsv(tokens, outputPath) {
    try {
        const linecount = scenes.reduce((acc, scene) => acc + scene.lineCount, 0);
        const sortedEntities = Object.fromEntries(
            Object.entries(entities).sort((a, b) => b[1] - a[1])
        );
        const linesPerPage = linecount / scenes[scenes.length - 1]['page-num'];

        const csvWriter = createObjectCsvWriter({
            path: outputPath,
            header: [
                {id: 'page', title: 'page'},
                {id: 'scene', title: 'scene'},
                {id: 'description', title: 'description'},
                {id: 'sentences', title: 'sentences'},
                {id: 'lines', title: 'lines'},
                {id: 'pageCount', title: 'page count'},
                ...Object.keys(sortedEntities).map(ent => ({id: ent, title: ent})),
                {id: 'text', title: 'text'}
            ]
        });

        const rows = scenes.map(scene => ({
            page: scene['page-num'],
            scene: scene['scene-num'],
            description: scene.text,
            sentences: scene.sentences.length,
            lines: scene.lineCount,
            pageCount: fractionalPageCount32(scene.lineCount, linesPerPage)[0],
            ...Object.fromEntries(Object.keys(sortedEntities).map(ent => [ent, scene.characters[ent] || ''])),
            text: scene.sentences.join(' ').replace(/\n/g, ' ').replace(/  /g, ' ')
        }));

        await csvWriter.writeRecords(rows).then(() => console.log('CSV file written successfully'));
    } catch (error) {
        log.error('Error writing scenes CSV:', error);
        throw error;
    }
}

async function writeTokens(tokens, entities, outputPath, clean = true) {
    try {
        let output = '';
    
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

        tokens.forEach(token => {
            const vfx = token.vfx && !clean ? ` [[vfx ${token.vfx}]]` : '';
            let text = token.text || '';
            let textClean = text.replace(regex.annotation, '$1').trim().replace(regex.annotation, '$1').trim();
            text = clean ? textClean : text;

            switch (token.type) {
                case 'action':
                    text.split('\n').forEach(line => {
                        if (['character', 'scene-heading'].some(e => regex[e].test(line.replace(regex.annotation, '$1').trim()))) {
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
                    const heading = regex['scene-heading'].test(text.replace(regex.annotation, '$1').trim()) ? text : '.' + text;
                    const sceneNum = token['scene-num'] ? `#${token['scene-num']}#` : '';
                    output += `${heading.padEnd(70)}${sceneNum.padStart(10)}${vfx}\n\n`;
                    break;
                case 'page-break':
                    output += `${'='.repeat(74)} ${(token.pageNum || '').toString().padStart(5)}\n\n`;
                    break;
                case 'transition':
                case 'flashback':
                    output += `${text.padEnd(80)}${vfx}\n\n`;
                    break;
            }
        });
        await fs.writeFile(outputPath, output, 'utf8');
        log.info(`Tokens written to: ${outputPath}`);
    } catch (error) {
        log.error('Error writing tokens:', error);
        throw error;
    }
}

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

        await fs.writeFile(outputPath, template, 'utf8');
        log.info(`HTML written to: ${outputPath}`);
    } catch (error) {
        log.error('Error writing HTML:', error);
        throw error;
    }
}

async function writeScriptRaw(content, filePath) {
    try {
        log.info(`Writing raw script to ${filePath}`);
        await fs.writeFile(filePath, content, 'utf8');
        log.info('Script written successfully');
    } catch (error) {
        log.error('Error writing raw script:', error);
        throw error;
    }
}

function sortEntities(entities) {
    return Object.entries(entities)
        .sort(([a], [b]) => {
            // Sort by entity type first
            if (entities[a].type !== entities[b].type) {
                return entities[a].type.localeCompare(entities[b].type);
            }
            // Then by count
            if (entities[a].count !== entities[b].count) {
                return entities[b].count - entities[a].count;
            }
            // Finally by name
            return a.localeCompare(b);
        });
}

// Helper function to generate unique filenames
async function getUniqueFilename(basePath, extension) {
    const dir = path.dirname(basePath);
    const base = path.basename(basePath, extension);
    let counter = 0;
    let filePath = path.join(dir, `${base}${extension}`);
    
    while (await fs.access(filePath).then(() => true).catch(() => false)) {
        counter++;
        filePath = path.join(dir, `${base}_${counter}${extension}`);
    }
    
    return filePath;
}

// Export all file types at once
async function exportAll(tokens, entities, baseFilename) {
    try {
        const exportsDir = await ensureExportsDir();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const base = path.join(exportsDir, `${baseFilename}_${timestamp}`);

        await Promise.all([
            writeScriptCsv(tokens, `${base}_script.csv`),
            writeScenesCsv(tokens, `${base}_scenes.csv`),
            writeTokens(tokens, `${base}_tokens.json`),
            writeTokens(entities, `${base}_entities.json`),
            writeHtml(tokensToHtml(tokens), `${base}.html`)
        ]);

        log.info('All files exported successfully');
        return exportsDir;
    } catch (error) {
        log.error('Error exporting files:', error);
        throw error;
    }
}


module.exports = {
    writeScriptCsv,
    writeScenesCsv,
    writeTokens,
    writeHtml,
    writeScriptRaw,
    sortEntities,
    exportAll
};