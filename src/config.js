import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import History from '@tiptap/extension-history'
import Color from '@tiptap/extension-color'
import TextStyle from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Node, Mark, Extension } from '@tiptap/core'
import log from 'electron-log/renderer';

// Import using CommonJS require for Electron compatibility
const { SHARED_CONFIG } = require('./config.shared.js');

/**
 * Custom node for collapsible scenes
 * Allows scenes to be collapsed/expanded for better navigation
 */
const CollapsibleScene = Node.create({
  name: 'collapsibleScene',
  group: 'block',
  content: 'block+',

  addAttributes() {
    return {
      isCollapsed: {
        default: false,
      }
    }
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="collapsible-scene"]',
    }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', {
      'data-type': 'collapsible-scene',
      'class': `collapsible-scene ${node.attrs.isCollapsed ? 'collapsed' : ''}`,
      ...HTMLAttributes
    }, 0]
  }
})

/**
 * Extended paragraph node with custom attributes for script formatting
 * Handles scene headings, shot numbers, and collapsible states
 */
const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      class: { default: null },
      'data-shot-number': { default: null },
      'data-scene-number': { default: null },
      'data-page-number': { default: null },
      'data-collapsed': { default: null }
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = { ...HTMLAttributes };
    
    if (attrs.class === 'scene-heading') {
      return ['p', attrs, 
        ['span', { class: 'scene-heading-caret' }],
        ['span', { class: 'scene-heading-content' }, 0]
      ];
    }
    
    return ['p', attrs, 0];
  }
});

/**
 * Extended highlight mark with class attribute support
 * Enables different highlight types (character, prop, environment)
 */
const HighlightClassed = Highlight.extend({
  addAttributes() {
    return {
      class: { default: null },
    }
  }
})

/**
 * Custom mark for script notes
 * Provides note creation and keyboard shortcuts
 */
const Note = Mark.create({
  name: 'note',
  
  parseHTML() {
    return [
      {
        tag: 'span[data-type="note"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { 'data-type': 'note', class: 'note-bubble', ...HTMLAttributes }, 0]
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (editor.isActive('note')) {
          editor.commands.insertContent(' ')
          return true
        }
        return false
      },

      'Mod-n': ({ editor }) => {
        if (!editor.isActive('note')) {
          editor.chain()
            .setMark('note')
            .insertContent('Note')
            .setMark('note')
            .run()
          return true
        }
        return false
      }
    }
  }
})

/**
 * Search extension for text finding functionality
 * Manages search state and provides navigation commands
 */
const Search = Extension.create({
  name: 'search',

  addCommands() {
    // Encapsulated search state
    const searchManager = {
      state: null,
      
      updateState(newState) {
        this.state = newState;
        return this.state;
      },

      clear() {
        this.state = null;
      },

      getState() {
        return this.state;
      }
    };

    /**
     * Updates editor selection and ensures visibility
     * @param {Transaction} tr - Editor transaction
     * @param {number} from - Selection start position
     * @param {number} to - Selection end position
     */
    const updateSelection = (tr, from, to) => {
      const selection = this.editor.state.tr.selection.constructor.create(tr.doc, from, to);
      tr.setSelection(selection);
      
      if (this.editor.view) {
        requestAnimationFrame(() => {
          this.editor.view.focus();
          this.editor.view.dispatch(tr);
          this.editor.commands.scrollIntoView();
        });
      }
    };

    return {
      find: (searchTerm) => ({ tr, dispatch }) => {
        log.debug('Search: Finding occurrences of:', searchTerm);
        
        if (!searchTerm) {
          searchManager.clear();
          this.editor.commands.clearSearch();
          return false;
        }

        const { doc } = tr;
        const decorations = [];
        const positions = [];
        let count = 0;

        doc.descendants((node, pos) => {
          if (!node.isText) return;
          
          const text = node.text;
          const searchRegex = new RegExp(searchTerm, 'gi');
          let match;

          while ((match = searchRegex.exec(text)) !== null) {
            const from = pos + match.index;
            const to = from + searchTerm.length;
            
            count++;
            positions.push({ from, to });
            decorations.push({
              from,
              to,
              class: 'search-result'
            });
          }
        });

        if (dispatch && decorations.length > 0) {
          const newState = {
            decorations,
            positions,
            current: 0,
            total: count,
            term: searchTerm
          };

          searchManager.updateState(newState);
          tr.setMeta('search', newState);
        }

        log.debug('Search: Found matches:', count);
        return { current: count > 0 ? 1 : 0, total: count };
      },

      findNext: () => ({ tr, dispatch }) => {
        const state = searchManager.getState();
        if (!state?.positions.length) return false;

        const nextIndex = (state.current + 1) % state.positions.length;
        const nextPos = state.positions[nextIndex];

        if (dispatch) {
          const newState = { ...state, current: nextIndex };
          searchManager.updateState(newState);
          tr.setMeta('search', newState);
          updateSelection(tr, nextPos.from, nextPos.to);
        }

        return { current: nextIndex + 1, total: state.positions.length };
      },

      findPrevious: () => ({ tr, dispatch }) => {
        const state = searchManager.getState();
        if (!state?.positions.length) return false;

        const prevIndex = (state.current - 1 + state.positions.length) % state.positions.length;
        const prevPos = state.positions[prevIndex];

        if (dispatch) {
          const newState = { ...state, current: prevIndex };
          searchManager.updateState(newState);
          tr.setMeta('search', newState);
          updateSelection(tr, prevPos.from, prevPos.to);
        }

        return { current: prevIndex + 1, total: state.positions.length };
      },

      clearSearch: () => ({ tr, dispatch }) => {
        if (dispatch) {
          searchManager.clear();
          tr.setMeta('search', null);
        }
        return true;
      }
    };
  }
});

// Export configured extensions
export const extensions = [
  Document,
  CustomParagraph,
  CollapsibleScene,
  Text,
  TextStyle,
  Color,
  History,
  HighlightClassed.configure({ multicolor: true }),
  Note,
  Search
]

// Export editor configuration
export const EDITOR_CONFIG = {
  ...SHARED_CONFIG,
  defaultContent: "<p>&nbsp;</p><p class='scene-heading'>Breakdown editor by Olaf Wendt 2024</p><p>&nbsp;</p><p class='action'>reads and ocrs pdf files containing scripts</p>",
}