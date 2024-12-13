import React, { useEffect, useCallback, useState, useRef } from "react";
import { BubbleMenu, EditorContent, useEditor } from "@tiptap/react";
import { extensions, EDITOR_CONFIG } from "./config";
import { BubbleMenuButton } from "./components/BubbleMenuButton";
import { VfxButtons } from "./components/VfxButtons"; 
import { useEditorOperations } from "./hooks/useEditorOperations";
import { HelpOverlay, HelpButton } from './components/HelpOverlay';
import { ToastContainer, toast } from 'react-toastify';
import log from 'electron-log/renderer';
import 'react-toastify/dist/ReactToastify.css';
import "./App.css";

function BreakdownEditor({ editor, updateVfxShotNumber}) {
  const { toggleScene, toggleAllScenes, toggleVfx, isClassActive, toggleParagraphClass, toggleHighlight, toggleNote } = useEditorOperations(editor);

  // Add dynamic styles for VFX levels
  useEffect(() => {
    const styleElement = document.createElement('style');
    const vfxStyles = EDITOR_CONFIG.vfx.difficultyLevels
        .map(level => `
            .bubble-btn.${level.id} { background-color: ${level.color}; }
            .bubble-btn.${level.id}:hover { filter: brightness(150%); opacity: 0.9; }
            .bubble-btn.${level.id}.is-active { filter: brightness(120%); opacity: 1; }
            .bubble-btn.${level.id}.is-active:hover { filter: brightness(180%); opacity: 1; }
            p.${level.id} { background-color: ${level.color}20; }
        `).join('\n');
    
    styleElement.textContent = vfxStyles;
    document.head.appendChild(styleElement);

    // Store reference to the style element
    const currentStyle = styleElement;

    return () => {
        if (document.head.contains(currentStyle)) {
            document.head.removeChild(currentStyle);
        }
    };
  }, []);

  // handle scene collapse / expand
  useEffect(() => { 
    if (!editor?.view) return;

    const handleSceneClick = (e) => {
      // Check if we clicked on the caret element
      const caretElement = e.target.closest('.scene-heading-caret');
      if (!caretElement) return;
      
      const sceneHeading = e.target.closest('.scene-heading');
      if (!sceneHeading) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const sceneId = sceneHeading.getAttribute('data-scene-number');
      const isCollapsed = sceneHeading.getAttribute('data-collapsed') === 'true';
      
      if (e.shiftKey) {
        toggleAllScenes(!isCollapsed);
      } else {
        toggleScene(sceneId, !isCollapsed);
      }
    };
    
    editor.view.dom.addEventListener('click', handleSceneClick);
    return () => {
      if (editor?.view?.dom) {
        editor.view.dom.removeEventListener('click', handleSceneClick);
      }
    };
  }, [editor]);

  // handle note creating in right margin
  const [hoverLine, setHoverLine] = useState(null);

  const handleNoteAreaMouseMove = useCallback((e) => {
    if (!editor?.state?.doc) return;

    const scriptContainer = e.currentTarget.parentElement;
    if (!scriptContainer) return;

    const rect = scriptContainer.getBoundingClientRect();
    const y = e.clientY - rect.top + scriptContainer.scrollTop;

    // Find the paragraph at this vertical position
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph') {
            const dom = editor.view?.nodeDOM(pos);
            if (!dom) return;

            const domRect = dom.getBoundingClientRect();
            if (domRect.top <= e.clientY && e.clientY <= domRect.bottom) {
                setHoverLine({
                    top: domRect.top - rect.top + scriptContainer.scrollTop,
                    height: domRect.height
                });
                return false;
            }
        }
    });
  }, [editor]);

  const handleNoteAreaMouseLeave = useCallback(() => {
    setHoverLine(null);
  }, []);

  const handleNoteAreaClick = useCallback((e) => {
    if (!editor?.view) return;
    
    // Get click coordinates relative to script container
    const scriptContainer = e.currentTarget.parentElement;
    const rect = scriptContainer.getBoundingClientRect();
    const y = e.clientY - rect.top + scriptContainer.scrollTop;

    // Find the paragraph at this vertical position
    let targetNode = null;
    let targetPos = 0;

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        const dom = editor.view?.nodeDOM(pos);
        if (!dom) return;

        const domRect = dom.getBoundingClientRect();
        if (domRect.top <= e.clientY && e.clientY <= domRect.bottom) {
          targetNode = node;
          targetPos = pos;
          return false;
        }
      }
    });

    if (targetNode) {
      const endPos = targetPos + targetNode.nodeSize - 1;
      const startNotePos = endPos;
      
      editor.chain()
        .focus()
        .setTextSelection(endPos)
        .setMark('note')
        .insertContent('Note')
        .setTextSelection({ from: startNotePos, to: startNotePos + 4 })
        .run();
    }
  }, [editor]);

  return (
      <>
          {editor && (
              <>
                <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
                    <div className="bubble-menu">
                        <div className="bubble-menu-column">
                            <BubbleMenuButton onClick={() => toggleParagraphClass('character')} isActive={isClassActive('character')} type="scene">character</BubbleMenuButton>
                            <BubbleMenuButton onClick={() => toggleParagraphClass('dialogue')} isActive={isClassActive('dialogue')} type="scene">dialogue</BubbleMenuButton>
                            <BubbleMenuButton onClick={() => toggleParagraphClass('action')} isActive={isClassActive('action')} type="scene">action</BubbleMenuButton>
                            <BubbleMenuButton onClick={() => toggleParagraphClass('scene-heading')} isActive={isClassActive('scene-heading')} type="scene">scene</BubbleMenuButton>
                        </div>
                        <div className="bubble-menu-column">
                            <BubbleMenuButton onClick={() => toggleHighlight('char')} isActive={editor.isActive('highlight', { class: 'char' })} type="char">char</BubbleMenuButton>
                            <BubbleMenuButton onClick={() => toggleHighlight('prop')} isActive={editor.isActive('highlight', { class: 'prop' })} type="prop">prop</BubbleMenuButton>
                            <BubbleMenuButton onClick={() => toggleHighlight('env')} isActive={editor.isActive('highlight', { class: 'env' })} type="env">env</BubbleMenuButton>
                            <BubbleMenuButton onClick={toggleNote} isActive={false} type="note">note</BubbleMenuButton>
                        </div>
                        <VfxButtons toggleVfx={toggleVfx} isClassActive={isClassActive} />
                    </div>
                </BubbleMenu>
                <div className="editor-wrapper">
                  <div className="script-container">
                    <EditorContent editor={editor} />
                    <div 
                      className="note-creation-area" 
                      onClick={handleNoteAreaClick}
                      onMouseMove={handleNoteAreaMouseMove}
                      onMouseLeave={handleNoteAreaMouseLeave}
                    />
                    {hoverLine && (
                      <div 
                        className="note-hover-line visible"
                        style={{
                          top: hoverLine.top,
                          height: hoverLine.height
                        }}
                      />
                    )}
                  </div>
                </div>
              </>
          )}
      </>
  );
}


function App() {
  const { ipcRenderer } = window.require('electron');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [currentFileName, setcurrentFileName] = useState(null);

  const editor = useEditor({
    extensions,
    content: EDITOR_CONFIG.defaultContent,
    editable: true,
    onUpdate: ({ editor }) => {
      window.editor = editor;
    },
  });

  const { initializeScenes, updateVfxShotNumber } = useEditorOperations(editor);

  // Update document title when filename changes
  useEffect(() => {
    document.title = currentFileName ? `Breakdown - ${currentFileName}` : 'Breakdown';
  }, [currentFileName]);

  useEffect(() => {
    if (!editor) return;

    let isInitializing = false; // Flag to prevent duplicate initializations

    const safeInitializeScenes = () => {
      if (isInitializing) return;
      isInitializing = true;
      setTimeout(() => {
        initializeScenes();
        isInitializing = false;
      }, 0);
    };

    // IPC Event Handlers
    const handlers = {
      // Menu command responses
      'menu-open-file': () => {
        log.info('Renderer: Received menu-open-file');
        // Call back to main process
        ipcRenderer.invoke('handle-file-open', false);
      },
      'menu-open-ocr': () => {
        log.info('Renderer: Received menu-open-ocr');
        ipcRenderer.invoke('handle-file-open', true);
      },
      'menu-save': () => {
        log.info('Renderer: Received menu-save');
        ipcRenderer.invoke('handle-file-save', currentFileName);
      },
      'get-editor-content': () => {
        const content = editor.getHTML();
        ipcRenderer.send('editor-content', content);
      },
      'set-editor-content': (_, content) => {
        editor.commands.setContent(content);
        safeInitializeScenes();
      },
      'set-file-name': (_, fileName) => {
        setcurrentFileName(fileName);
      },
      'update-shot-number': updateVfxShotNumber,
      'update-toast': (_, toastId, message) => {
          toast.update(toastId, {
              render: message,
              type: 'info'
          });
      },
      'dismiss-toast': (_, toastId) => {
          toast.dismiss(toastId);
      },
      'show-info': (_, message, options = {}) => {
          toast.info(message, {
              position: "bottom-right",
              autoClose: options.autoClose ?? 3000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
              progress: undefined,
              toastId: options.toastId,
              // If autoClose is false, make it persistent
              ...(options.autoClose === false && {
                  closeButton: false,
                  closeOnClick: false,
              })
          });
      },
      // Notifications
      'show-error': (_, message) => {
        toast.error(message, {
          position: "bottom-right",
          autoClose: 3000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true
        });
      },
      'show-success': (_, message) => {
        toast.success(message, {
          position: "bottom-right",
          autoClose: 2000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true
        });
      }
    };

    // Register handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      ipcRenderer.on(event, handler);
    });

    // Initial content load
    ipcRenderer.invoke('load-content')
      .then(content => {
        if (content) editor.commands.setContent(content);
        safeInitializeScenes();
      })
      .catch(err => {
        console.error('Error loading initial content:', err);
        toast.error('Failed to load saved content');
      });

    // Auto-save timer
    const saveTimer = setInterval(() => {
      const content = editor.getHTML();
      ipcRenderer.invoke('save-content', { content })
        .catch(err => {
          console.error('Error auto-saving content:', err);
          toast.error('Failed to auto-save content');
        });
    }, 30000);

    // Handle significant content changes only
    const handleUpdate = ({ transaction }) => {
      // Only reinitialize if there are doc changes that affect structure
      if (transaction.docChanged && (
        transaction.steps.some(step => 
          step.jsonID === 'replace' || 
          step.jsonID === 'replaceAround'
        )
      )) {
        safeInitializeScenes();
      }
    };

    editor.on('update', handleUpdate);

    // Cleanup
    return () => {
      Object.keys(handlers).forEach(event => {
        ipcRenderer.removeListener(event, handlers[event]);
      });
      clearInterval(saveTimer);
      if (editor) editor.destroy();
    };
  }, [editor, updateVfxShotNumber, initializeScenes, ipcRenderer, currentFileName]);

  if (!editor) return null;

  return (
    <div className="App">
      <BreakdownEditor editor={editor} updateVfxShotNumber={updateVfxShotNumber}/>
      <HelpButton onClick={() => setIsHelpOpen(true)} />
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <ToastContainer /> 
    </div>
  );
}

export default App;