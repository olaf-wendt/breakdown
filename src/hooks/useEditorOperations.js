import { useCallback, useMemo } from 'react';
import { EDITOR_CONFIG } from '../config';
import log from 'electron-log/renderer';

// VFX difficulty levels from config
const VFX_TAGS = ['vfx', ...EDITOR_CONFIG.vfx.difficultyLevels.map(level => level.id)];

/**
 * @typedef {Object} EditorOperations
 * @property {Function} initializeScenes - Initialize scene structure and numbering
 * @property {Function} toggleScene - Toggle visibility of a specific scene
 * @property {Function} toggleAllScenes - Toggle visibility of all scenes
 * @property {Function} toggleVfx - Toggle VFX difficulty level on selected paragraphs
 * @property {Function} isClassActive - Check if a class is active in current selection
 * @property {Function} toggleParagraphClass - Toggle paragraph formatting with smart scene numbering
 * @property {Function} toggleHighlight - Toggle highlight mark with specified class
 * @property {Function} toggleNote - Toggle note mark
 * @property {Function} updateVfxShotNumber - Update VFX shot numbers throughout document
 */

/**
 * Custom hook providing editor operations for screenplay formatting and management
 * Handles scene numbering, collapsing, VFX shot management, and paragraph styling
 * 
 * @param {import('@tiptap/core').Editor} editor - TipTap editor instance
 * @returns {EditorOperations} Collection of editor operation functions
 */
export function useEditorOperations(editor) {
  /**
   * Safely execute editor commands with error handling
   * @param {Function} operation - Editor operation to execute
   * @param {string} operationName - Name of operation for logging
   */
  const safeExecute = useCallback((operation, operationName) => {
    if (!editor?.view) {
      log.warn(`${operationName}: Editor not ready`);
      return;
    }

    try {
      operation();
    } catch (error) {
      log.error(`Error in ${operationName}:`, error);
    }
  }, [editor]);

  /**
   * Initializes scene structure by setting collapse states and scene numbers
   * Traverses document to ensure all paragraphs within a scene share the same number
   */
  const initializeScenes = useCallback(() => {
    safeExecute(() => {
      log.debug('Initializing scenes...');
      
      editor.chain().focus().command(({ tr }) => {
        let currentSceneNumber = null;
        let currentScenePos = null;
        
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'paragraph') {
            if (node.attrs.class?.includes('scene-heading')) {
              currentSceneNumber = node.attrs['data-scene-number'];
              currentScenePos = pos;
              
              // Only set if data-collapsed attribute doesn't exist
              if (currentSceneNumber && node.attrs['data-collapsed'] === undefined) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  'data-collapsed': 'false'
                });
              }
            } else if (currentSceneNumber && pos > currentScenePos) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                'data-scene-number': currentSceneNumber
              });
            }
          }
        });
        return true;
      }).run();
    }, 'initializeScenes');
  }, [editor, safeExecute]);

  /**
   * Toggles visibility of paragraphs within a specific scene
   * @param {string} sceneId - Scene number identifier
   * @param {boolean} isCollapsed - Target collapse state
   */
  const toggleScene = useCallback((sceneId, isCollapsed) => {
    safeExecute(() => {
      log.debug('Toggling scene:', { sceneId, isCollapsed });
      
      editor.chain().focus().command(({ tr }) => {
        let updatedCount = 0;
        
        editor.state.doc.descendants((node, pos) => {
          const nodeSceneId = node.attrs['data-scene-number'];
          
          if (node.type.name === 'paragraph' && String(nodeSceneId) === String(sceneId)) {
            if (node.attrs.class?.includes('scene-heading')) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                'data-scene-number': sceneId,
                'data-collapsed': String(isCollapsed)
              });
              updatedCount++;
            } else {
              const classes = (node.attrs.class || '').split(' ').filter(c => c !== 'collapsed');
              if (isCollapsed) classes.push('collapsed');
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                'data-scene-number': sceneId,
                class: classes.join(' ').trim()
              });
              updatedCount++;
            }
          }
        });
        
        log.debug(`Updated ${updatedCount} paragraphs`);
        return updatedCount > 0;
      }).run();
    }, 'toggleScene');
  }, [editor, safeExecute]);

  /**
   * Toggles visibility state of all scenes in the document
   * @param {boolean} isCollapsed - Target collapse state for all scenes
   */
  const toggleAllScenes = useCallback((isCollapsed) => {
    safeExecute(() => {
      log.debug('Toggling all scenes:', { isCollapsed });
  
      editor.chain().focus().command(({ tr }) => {
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'paragraph') {
            if (node.attrs.class?.includes('scene-heading')) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                'data-collapsed': String(isCollapsed)
              });
            } else if (node.attrs['data-scene-number']) {
              const classes = (node.attrs.class || '').split(' ').filter(c => c !== 'collapsed');
              if (isCollapsed) classes.push('collapsed');
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                class: classes.join(' ').trim()
              });
            }
          }
        });
        return true;
      }).run();
    }, 'toggleAllScenes');
  }, [editor, safeExecute]);

  /**
   * Checks if a specific class is active in the current selection
   * @param {string} className - Class name to check
   * @returns {boolean} Whether the class is active
   */
  const isClassActive = useCallback((className) => {
    if (!editor) return false;
    
    const { from, to } = editor.state.selection;
    let isActive = false;
    
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (node.type.name === 'paragraph') {
        const classes = node.attrs.class ? node.attrs.class.split(' ') : [];
        if (classes.includes(className)) {
          isActive = true;
          return false;
        }
      }
    });
    
    return isActive;
  }, [editor]);

  /**
   * Scene number generation utilities
   */
  const sceneNumberUtils = useMemo(() => ({
    generateNext: (currentNumber) => {
      if (!currentNumber) return "1";
      const numStr = String(currentNumber);
      
      if (numStr.match(/\d+[A-Z]$/)) {
        const base = numStr.slice(0, -1);
        const letter = numStr.slice(-1);
        return `${base}${String.fromCharCode(letter.charCodeAt(0) + 1)}`;
      }
      
      return String(Number(currentNumber) + 1);
    },

    findNextAvailable: (startPos, proposedNumber) => {
      let isAvailable = true;
      
      editor.state.doc.descendants((node, pos) => {
        if (pos <= startPos) return;
        if (node.attrs['data-scene-number'] === proposedNumber) {
          isAvailable = false;
          return false;
        }
      });
      
      if (isAvailable) return proposedNumber;
      const baseNumber = proposedNumber.match(/\d+/)[0];
      return `${baseNumber}A`;
    }
  }), [editor]);

  /**
   * Updates classes on paragraphs in current selection
   * @param {Function} updateFn - Function to transform class list
   */
  const updateParagraphClasses = useCallback((updateFn) => {
    const { from, to } = editor.state.selection;
    
    editor.view.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'paragraph') {
        const currentClasses = node.attrs.class ? node.attrs.class.split(' ') : [];
        const newClasses = updateFn(currentClasses);
        editor.chain()
          .focus()
          .setNodeSelection(pos)
          .updateAttributes('paragraph', { class: newClasses.join(' ') })
          .run();
      }
    });
    
    editor.chain().focus().setTextSelection({ from, to }).run();
  }, [editor]);

  /**
   * Toggles VFX difficulty level on selected paragraphs
   * @param {string} level - VFX difficulty level to toggle
   */
  const toggleVfx = useCallback((level) => {
    safeExecute(() => {
      updateParagraphClasses(classes => {
        const nonVfxClasses = classes.filter(cls => !VFX_TAGS.includes(cls));
        return classes.includes(level) ? nonVfxClasses : [...nonVfxClasses, 'vfx', level];
      });
    }, 'toggleVfx');
  }, [updateParagraphClasses, safeExecute]);

  /**
   * Toggles paragraph formatting classes with smart scene numbering
   * @param {string} className - Formatting class to toggle
   */
  const toggleParagraphClass = useCallback((className) => {
    safeExecute(() => {
      updateParagraphClasses(classes => {
        const vfxClasses = classes.filter(cls => VFX_TAGS.includes(cls));
        const newClasses = [className, ...vfxClasses];
        
        if (className === 'scene-heading') {
          const { from } = editor.state.selection;
          let prevSceneNumber = null;
          
          editor.state.doc.nodesBetween(0, from, (node) => {
            if (node.type.name === 'paragraph' && 
                node.attrs.class?.includes('scene-heading') && 
                node.attrs['data-scene-number']) {
              prevSceneNumber = node.attrs['data-scene-number'];
            }
          });
    
          const nextSceneNumber = !prevSceneNumber 
            ? sceneNumberUtils.findNextAvailable(from, "1")
            : (() => {
                const currentBase = String(prevSceneNumber).match(/\d+/)[0];
                const nextBase = String(Number(currentBase) + 1);
                let next = sceneNumberUtils.findNextAvailable(from, nextBase);
                
                if (next.includes('A')) {
                  next = sceneNumberUtils.findNextAvailable(from, prevSceneNumber + 'A');
                }
                return next;
              })();
          
          editor.chain().focus()
            .updateAttributes('paragraph', {
              'data-scene-number': nextSceneNumber,
              'data-collapsed': 'false',
              class: newClasses.join(' ')
            })
            .run();
        }
        
        return newClasses;
      });
    }, 'toggleParagraphClass');
  }, [editor, updateParagraphClasses, sceneNumberUtils, safeExecute]);

  /**
   * Toggles highlight mark with specified class
   * @param {string} className - Class name for highlight
   */
  const toggleHighlight = useCallback((className) => {
    safeExecute(() => {
      editor.chain().focus().toggleHighlight({ class: className }).run();
    }, 'toggleHighlight');
  }, [editor, safeExecute]);

  /**
   * Toggles note mark
   */
  const toggleNote = useCallback(() => {
    safeExecute(() => {
      editor.chain().focus().toggleMark('note').run();
    }, 'toggleNote');
  }, [editor, safeExecute]);

  /**
   * Updates VFX shot numbers throughout the document
   * Numbers only the first paragraph of each VFX block sequentially
   */
  const updateVfxShotNumber = useCallback(() => {
    safeExecute(() => {
      let shotNumber = 1;
      let inVfxBlock = false;
      
      editor.view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') {
          const isVfx = node.attrs.class?.includes('vfx');
          const shotNumberAttr = { 'data-shot-number': isVfx && !inVfxBlock ? shotNumber : null };
          
          editor.chain()
            .focus()
            .setNodeSelection(pos)
            .updateAttributes('paragraph', shotNumberAttr)
            .run();
          
          if (isVfx && !inVfxBlock) {
            shotNumber++;
            inVfxBlock = true;
          } else if (!isVfx) {
            inVfxBlock = false;
          }
        }
      });
    }, 'updateVfxShotNumber');
  }, [editor, safeExecute]);

  return {
    initializeScenes,
    toggleScene,
    toggleAllScenes,
    toggleVfx,
    isClassActive,
    toggleParagraphClass,
    toggleHighlight,
    toggleNote,
    updateVfxShotNumber
  };
}