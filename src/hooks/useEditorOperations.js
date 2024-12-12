import { useCallback } from 'react';
import { EDITOR_CONFIG } from '../config.main.esm.js'; 

const VFX_TAGS = ['vfx', ...EDITOR_CONFIG.vfx.difficultyLevels.map(level => level.id)];

export function useEditorOperations(editor) {

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

    // toggle visibility of a single scene
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

  // determine if className is an active class in the current selection
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

  const toggleVfx = useCallback((level) => {
    updateParagraphClasses(classes => {
      const nonVfxClasses = classes.filter(cls => !VFX_TAGS.includes(cls));
      return classes.includes(level) ? nonVfxClasses : [...nonVfxClasses, 'vfx', level];
    });
  }, [updateParagraphClasses]);

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

  // update the vfx shot numbers in the whole document
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