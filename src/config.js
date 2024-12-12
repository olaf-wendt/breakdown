import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import History from '@tiptap/extension-history'
import Color from '@tiptap/extension-color'
import TextStyle from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Node } from '@tiptap/core'
import { Mark } from '@tiptap/core'
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
    
    // If it's a scene heading, wrap the content in a span
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
      // Prevent Enter from creating new lines inside notes
      Enter: ({ editor }) => {
        if (editor.isActive('note')) {
          // Insert a space instead of a newline
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
            .setMark('note')  // Toggle note mark off after insertion
            .run()
          return true
        }
        return false
      }
    }
  }
})


export const extensions = [
  Document,
  CustomParagraph,
  CollapsibleScene,
  Text,
  TextStyle,
  Color,
  History,
  HighlightClassed.configure({ multicolor: true }),
  Note
]


export const EDITOR_CONFIG = {
  ...SHARED_CONFIG,
  defaultContent: "<p>&nbsp;</p><p class='scene-heading'>Breakdown editor by Olaf Wendt 2024</p><p>&nbsp;</p><p class='action'>reads and ocrs pdf files containing scripts</p>",
}