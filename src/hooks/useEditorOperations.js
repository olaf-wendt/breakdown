import { useCallback } from 'react';
import { EDITOR_CONFIG } from '../config.main.esm.js'; 

const VFX_TAGS = ['vfx', ...EDITOR_CONFIG.vfx.difficultyLevels.map(level => level.id)];

/**
 * Custom hook providing editor operations for screenplay formatting and management
 * Handles scene numbering, collapsing, VFX shot management, and paragraph styling
 * 
 * @param {Editor} editor - TipTap editor instance
 * @returns {Object} Collection of editor operation functions
 */
export function useEditorOperations(editor) {

    /**
     * Initializes scene structure by setting collapse states and scene numbers
     * Traverses document to ensure all paragraphs within a scene share the same number
     * Only sets collapse state if not already defined
     */
    const initializeScenes = useCallback(() => {
      if (!editor?.view) return;
      
      console.log('Initializing scenes...');
      
      editor.chain().focus().command(({ tr }) => {
        let currentSceneNumber = null;
        let currentScenePos = null;
        
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'paragraph') {
            if (node.attrs.class?.includes('scene-heading')) {
              currentSceneNumber = node.attrs['data-scene-number'];
              currentScenePos = pos;
    
              console.log('initializing scene', currentSceneNumber);
              
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
    }, [editor]);

    /**
     * Toggles visibility of paragraphs within a specific scene
     * Updates both scene heading and all related paragraphs
     * 
     * @param {string} sceneId - Scene number identifier
     * @param {boolean} isCollapsed - Target collapse state
     */
    const toggleScene = useCallback((sceneId, isCollapsed) => {
      if (!editor?.view) return;
      
      console.log('Toggling scene:', { sceneId, isCollapsed });
      
      editor.chain().focus().command(({ tr }) => {
        let updatedCount = 0;
        
        editor.state.doc.descendants((node, pos) => {
          const nodeSceneId = node.attrs['data-scene-number'];
          
          if (node.type.name === 'paragraph' && String(nodeSceneId) === String(sceneId)) {
            console.log('updating', node.attrs);

            if (node.attrs.class?.includes('scene-heading')) {
              console.log('Updating scene heading:', { pos, attrs: node.attrs });
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                'data-scene-number': sceneId, // Ensure scene number is set
                'data-collapsed': String(isCollapsed)
              });
              updatedCount++;
            } else {
              const classes = (node.attrs.class || '').split(' ').filter(c => c !== 'collapsed');
              if (isCollapsed) classes.push('collapsed');
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                'data-scene-number': sceneId, // Ensure scene number is set
                class: classes.join(' ').trim()
              });
              updatedCount++;
            }
          }
        });
        
        console.log(`Updated ${updatedCount} paragraphs`);
        return updatedCount > 0;
      }).run();
    }, [editor]);
  
    /**
     * Toggles visibility state of all scenes in the document
     * Useful for expanding/collapsing entire screenplay at once
     * 
     * @param {boolean} isCollapsed - Target collapse state for all scenes
     */
    const toggleAllScenes = useCallback((isCollapsed) => {
      if (!editor?.view) return;

      console.log('Toggling all scenes');
  
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
    }, [editor]);

    /**
     * Checks if a specific class is active in the current selection
     * Used for maintaining button active states in the editor UI
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
     * Generates the next sequential scene number
     * Handles both numeric increments (1 -> 2) and letter suffixes (1A -> 1B)
     * 
     * @param {string} currentNumber - Current scene number
     * @returns {string} Next available scene number
     */
  const generateNextSceneNumber = useCallback((currentNumber) => {
    if (!currentNumber) return "1";
    const numStr = String(currentNumber);
    // If it ends with a letter, increment the letter
    if (numStr.match(/\d+[A-Z]$/)) {
      const base = numStr.slice(0, -1);
      const letter = numStr.slice(-1);
      return `${base}${String.fromCharCode(letter.charCodeAt(0) + 1)}`;
    }
    
    // Otherwise increment the number
    return String(Number(currentNumber) + 1);
  }, []);
  
    /**
     * Finds next available scene number starting from a position
     * Handles number conflicts by adding letter suffixes
     * 
     * @param {number} startPos - Starting position in document
     * @param {string} proposedNumber - Desired scene number
     * @returns {string} Available scene number
     */
  const findNextAvailableSceneNumber = useCallback((startPos, proposedNumber) => {
    let isAvailable = true;
    
    editor.state.doc.descendants((node, pos) => {
      if (pos <= startPos) return; // Skip nodes before our position
      if (node.attrs['data-scene-number'] === proposedNumber) {
        isAvailable = false;
        return false;
      }
    });
    
    if (isAvailable) return proposedNumber;
    // If number is taken, try adding 'A' to the previous number
    const baseNumber = proposedNumber.match(/\d+/)[0];
    return `${baseNumber}A`;
  }, [editor]);

  /**
   * Updates classes on paragraphs in current selection
   * Maintains VFX classes while updating other formatting
   * 
   * @param {Function} updateFn - Function to transform class list
   */
  const updateParagraphClasses = useCallback((updateFn) => {
    const { from, to } = editor.state.selection;
    editor.view.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === 'paragraph') {
        const currentClasses = node.attrs.class ? node.attrs.class.split(' ') : [];
        const newClasses = updateFn(currentClasses);
        const nc = newClasses.join(' ');
        editor.chain().focus().setNodeSelection(pos).updateAttributes('paragraph', { class: nc }).run();
      }
    });
    editor.chain().focus().setTextSelection({ from, to }).run();
  }, [editor]);

  /**
   * Toggles VFX difficulty level on selected paragraphs
   * Ensures proper class combinations and maintains existing VFX tags
   * 
   * @param {string} level - VFX difficulty level to toggle
   */
  const toggleVfx = useCallback((level) => {
    updateParagraphClasses(classes => {
      const nonVfxClasses = classes.filter(cls => !VFX_TAGS.includes(cls));
      return classes.includes(level) ? nonVfxClasses : [...nonVfxClasses, 'vfx', level];
    });
  }, [updateParagraphClasses]);

  /**
   * Toggles paragraph formatting classes with smart scene numbering
   * For scene headings, automatically assigns appropriate scene numbers
   * considering document structure and existing numbering
   * 
   * @param {string} className - Formatting class to toggle
   */
  const toggleParagraphClass = useCallback((className) => {
    updateParagraphClasses(classes => {
      const vfxClasses = classes.filter(cls => VFX_TAGS.includes(cls));
      const newClasses = [className, ...vfxClasses];
      
      // Only handle scene numbers for scene headings
      if (className === 'scene-heading') {
        const { from } = editor.state.selection;
        let prevSceneNumber = null;
        
        // Find the previous scene heading's number
        editor.state.doc.nodesBetween(0, from, (node) => {
          if (node.type.name === 'paragraph' && 
              node.attrs.class?.includes('scene-heading') && 
              node.attrs['data-scene-number']) {
            prevSceneNumber = node.attrs['data-scene-number'];
          }
        });
  
        // If no previous scene, start with 1
        if (!prevSceneNumber) {
          const nextSceneNumber = findNextAvailableSceneNumber(from, "1");
          editor.chain().focus()
            .updateAttributes('paragraph', {
              'data-scene-number': nextSceneNumber,
              'data-collapsed': 'false',
              class: newClasses.join(' ')
            })
            .run();
          return newClasses;
        }
  
        // Try to insert between scenes if possible
        const currentBase = String(prevSceneNumber).match(/\d+/)[0];
        const nextBase = String(Number(currentBase) + 1);
        
        // First try the next number
        let nextSceneNumber = findNextAvailableSceneNumber(from, nextBase);
        
        // If that's taken, try adding a letter to the current number
        if (nextSceneNumber.includes('A')) {
          nextSceneNumber = findNextAvailableSceneNumber(from, prevSceneNumber + 'A');
        }
        
        editor.chain().focus()
          .updateAttributes('paragraph', {
            'data-scene-number': nextSceneNumber,
            'data-collapsed': 'false',
            class: newClasses.join(' ')
          })
          .run();
          
        return newClasses;
      }
      
      return newClasses;
    });
  }, [editor, updateParagraphClasses, generateNextSceneNumber, findNextAvailableSceneNumber]);

  const toggleHighlight = useCallback((className) => {
    editor.chain().focus().toggleHighlight({ class: className }).run();
  }, [editor]);

  const toggleNote = useCallback(() => {
    editor.chain().focus().toggleMark('note').run()
  }, [editor]);

  /**
   * Updates VFX shot numbers throughout the document
   * Numbers only the first paragraph of each VFX block sequentially
   * Subsequent paragraphs in the same block get null shot numbers
   */
  const updateVfxShotNumber = useCallback(() => {
    if (!editor) return;

    let shotNumber = 1;
    let inVfxBlock = false;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        const isVfx = node.attrs.class && node.attrs.class.includes('vfx');
        if (isVfx && !inVfxBlock) {
          editor.chain().focus().setNodeSelection(pos)
            .updateAttributes('paragraph', {'data-shot-number': shotNumber}).run();
          shotNumber++;
          inVfxBlock = true;
        } else if (isVfx) {
          // set shot number in subsequent lines of a vfx block to nil
          editor.chain().focus().setNodeSelection(pos)
            .updateAttributes('paragraph', {'data-shot-number': null}).run();
        } else {
          // not a vfx shot
          editor.chain().focus().setNodeSelection(pos)
            .updateAttributes('paragraph', {'data-shot-number': null}).run();
          inVfxBlock = false;
        }
      }
    });
  }, [editor]);

  return { initializeScenes, toggleScene, toggleAllScenes, toggleVfx, 
           isClassActive, toggleParagraphClass, toggleHighlight, toggleNote,
           updateVfxShotNumber };
}