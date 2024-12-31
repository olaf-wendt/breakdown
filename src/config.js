import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import History from '@tiptap/extension-history'
import Color from '@tiptap/extension-color'
import TextStyle from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Node, Mark, Extension } from '@tiptap/core'
import { SHARED_CONFIG } from './config.shared.js'


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
        ['span', { class: 'scene-heading-caret' } ],
        ['span', { class: 'scene-heading-content' }, 0]];
    }
    
    return ['p', attrs, 0];
  }
});

const HighlightClassed = Highlight.extend({
  addAttributes() {
    return {
      class: { default: null },
    }
  }
})

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

const Search = Extension.create({
  name: 'search',

  addCommands() {
    let searchState = null;

    const updateSelection = (tr, from, to) => {
      const selection = this.editor.state.tr.selection.constructor.create(tr.doc, from, to);
      tr.setSelection(selection);
      
      // Ensure the editor view updates and scrolls
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
        console.log('Find command called with:', searchTerm);
        
        if (!searchTerm) {
          searchState = null;
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
          searchState = {
            decorations,
            positions,
            current: 0,
            total: count,
            term: searchTerm
          };

          tr.setMeta('search', searchState);
          // Don't move cursor here, just highlight matches
        }

        console.log('Search state:', searchState);
        return { current: count > 0 ? 1 : 0, total: count };
      },

      findNext: () => ({ tr, dispatch }) => {
        console.log('FindNext command called');
        if (!searchState?.positions.length) return false;

        const nextIndex = (searchState.current + 1) % searchState.positions.length;
        const nextPos = searchState.positions[nextIndex];

        if (dispatch) {
          searchState.current = nextIndex;
          tr.setMeta('search', searchState);
          
          // Only move cursor during explicit navigation
          updateSelection(tr, nextPos.from, nextPos.to);
        }

        console.log('Next search state:', searchState);
        return { current: nextIndex + 1, total: searchState.positions.length };
      },

      findPrevious: () => ({ tr, dispatch }) => {
        console.log('FindPrevious command called');
        if (!searchState?.positions.length) return false;

        const prevIndex = (searchState.current - 1 + searchState.positions.length) % searchState.positions.length;
        const prevPos = searchState.positions[prevIndex];

        if (dispatch) {
          searchState.current = prevIndex;
          tr.setMeta('search', searchState);
          
          // Only move cursor during explicit navigation
          updateSelection(tr, prevPos.from, prevPos.to);
        }

        console.log('Previous search state:', searchState);
        return { current: prevIndex + 1, total: searchState.positions.length };
      },

      clearSearch: () => ({ tr, dispatch }) => {
        if (dispatch) {
          searchState = null;
          tr.setMeta('search', null);
        }
        return true;
      }
    };
  }
});

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

export const EDITOR_CONFIG = {
  ...SHARED_CONFIG,
  defaultContent: "<p>&nbsp;</p><p class='scene-heading'>Breakdown editor by Olaf Wendt 2024</p><p>&nbsp;</p><p class='action'>reads and ocrs pdf files containing scripts</p>",
}