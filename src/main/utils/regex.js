// regex.js - All regex patterns for script parsing

const regex = {
    'title_page': /^((?:title|credit|author[s]?|source|notes|draft date|date|contact|copyright):)/mi,
    'scene-heading': /^(?:#?((?:[0-9]+[a-z]*)|(?:[a-z]+[0-9]+))#?\s+)?(?:((?:\*{0,3}_?)?(?:(?:int|ext|est|i\/e)[. ]).+?)|(?:\.(?!\.+))(.+?))(?:#?((?:[0-9]+[a-z]*)|(?:[a-z]+[0-9]+))#?)?$/i,
    'scene-number': /#?((?:([0-9]+)([a-z]*))|(?:([a-z]+)([0-9]+)))#?/i,
    'transition': /^((?:FADE (?:TO BLACK|OUT)|CUT TO BLACK)\.|.+ TO\:)|^(?:< *)(.+)/,
    'character': /^(?:([A-Z_]+[0-9A-Z ._\-\']*)|@([\w ._\-\']+))((?:\([0-9A-Za-z ._\-\'']*\)\s*)*)(\^?)$/,
    'parenthetical': /^(\(.+\))$/,
    'action': /^!(.+)$/,
    'blank': /^$/,
    'flashback': /^(FLASHBACK|CURRENT\s+DAY|HOME\s+VIDEO)\s*/,

    'page-break': /^\={3,}\s*(?:#?([0-9]+[a-zA-Z]*)#?\.?\s*)?$/,
    'page-number': /^([0-9]+)\.?$/,
    'line-break': /^ {2}$/,

    'annotation': /\*\*([\w\'\.\- ]+)\*\*\s*(?:\[{2}(?!\[+))\s*([\w\'\.\- ]+)\s*([\w\'\.\- ]*)(?:\]{2}(?!\[+))/g,
    'entity-annotation': /(?<!\*\*)(?:\[{2}(?!\[\[+))\s*(char|prop|env|fx)\b\s*([\w\'\.\-\, ]*)(?:\]{2}(?!\[+))/g,
    'vfx-annotation': /(?:\[{2}(?!\[+))\s*vfx\s*([\w\'\. ]*)(?:\]{2}(?!\[+))/,

    'note': /\[\[(?!vfx|char|prop|env|fx\b)([^\[\]]*?)\]\]/g,
    'note-inline': /(?:\[{2}(?!\[+))\s*(\w+)\s*(.*)(?:\]{2}(?!\[+))/,
    'note-start': /^(.*)(?:\[{2}(?!\[+))(.+?)(?:\]{2}(?!\[+))?$/,
    'note-end': /^(?:\[{2}(?!\[+))?(.+)(?:\]{2}(?!\[+))(.*)$/,

    'uppercase': /((?:\b[A-Z\']{2,}\s+?)+\b)/,
    'centered': /^(?:< *)(.+)(?: *<)(\n.+)*/m,
    'section': /^(#+)(?: *)(.*)/,
    'synopsis': /^(?:\=(?!\=+) *)(.*)/,

    'emphasis': /(_|\*{1,3}|_\*{1,3}|\*{1,3}_)(.+)(_|\*{1,3}|_\*{1,3}|\*{1,3}_)/,
    'bold-italic_underline': /(_{1}\*{3}(?=.+\*{3}_{1})|\*{3}_{1}(?=.+_{1}\*{3}))(.+?)(\*{3}_{1}|_{1}\*{3})/,
    'bold-underline': /(_{1}\*{2}(?=.+\*{2}_{1})|\*{2}_{1}(?=.+_{1}\*{2}))(.+?)(\*{2}_{1}|_{1}\*{2})/,
    'italic_underline': /(?:_{1}\*{1}(?=.+\*{1}_{1})|\*{1}_{1}(?=.+_{1}\*{1}))(.+?)(\*{1}_{1}|_{1}\*{1})/,
    'bold-italic': /(\*{3}(?=.+\*{3}))(.+?)(\*{3})/,
    'bold': /(\*{2}(?=.+\*{2}))(.+?)(\*{2})/,
    'italic': /(\*{1}(?=.+\*{1}))(.+?)(\*{1})/,
    'underline': /(_{1}(?=.+_{1}))(.+?)(_{1})/,

    'boneyard': /(^\/\*|^\*\/)$/,
    'splitter': /\n{2,}/,
    'cleaner': /^\n+|\n+$/,
    'standardizer': /\r\n|\r/,
    'quotes': /[''‛`]/,
    'doublequotes': /[""]/, 
    'doublespaces': /\b[ \t]{2,}\b/m,
    'whitespacer': /^\t+|^ {3,}/m,
    'hyphens': /—/,
    'whitespacenewline': /[\s\n]+/,
    'tabs': /\t/,
    'duplicated': /^\s*(?:(.)\1|\s)+$/,
    'deduplicator': /(.)\1+|\s/
};

// Helper function to escape special characters in regex
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = regex;