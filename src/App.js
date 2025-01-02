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
import SearchBox from './components/SearchBox';
import Analytics from './services/analytics';
import "./App.css";
import './BubbleMenu.css';
import './HelpOverlay.css';  



// Toast configuration presets for consistent notification styling
const TOAST_CONFIG = {
  position: "bottom-right",
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true
};

/**
 * BreakdownEditor Component
 * Rich text editor interface for script analysis with formatting controls and VFX management
 * Features:
 * - Bubble menu for text formatting
 * - Scene collapsing/expanding
 * - VFX shot management
 * - Note creation interface
 * 
 * @param {Object} props
 * @param {Object} props.editor - TipTap editor instance
 * @param {Function} props.updateVfxShotNumber - Callback to update VFX shot numbering
 */
function BreakdownEditor({ editor, updateVfxShotNumber }) {
  const { 
    toggleScene, 
    toggleAllScenes, 
    toggleVfx, 
    isClassActive, 
    toggleParagraphClass, 
    toggleHighlight, 
    toggleNote 
  } = useEditorOperations(editor);

  // Dynamic VFX difficulty level styles
  useEffect(() => {
    const styleElement = document.createElement('style');
    const vfxStyles = EDITOR_CONFIG.vfx.difficultyLevels
      .map(level => `
        .bubble-btn.${level.id} { background-color: ${level.color}; }
        .bubble-btn.${level.id}:hover { filter: brightness(150%); opacity: 0.9; }
        .bubble-btn.${level.id}.is-active { filter: brightness(120%); opacity: 1; }
        .bubble-btn.${level.id}.is-active:hover { filter: brightness(180%); opacity: 1; }
        /* VFX paragraph styles */
        p.${level.id} {  background-color: transparent; }
        p.${level.id}::before { 
          content: ' ';  
          position: absolute;
          left: 3em;     
          width: 48em;
          text-align: left;
          line-height: inherit; 
          background-color: ${level.color}20; 
          z-index: -1;
        }
      `).join('\n'); // p.${level.id} { background-color: ${level.color}20; }
    
    styleElement.textContent = vfxStyles;
    document.head.appendChild(styleElement);

    return () => document.head.contains(styleElement) && document.head.removeChild(styleElement);
  }, []);

  // Scene collapse/expand handler
  useEffect(() => { 
    if (!editor?.view) return;

    const handleSceneClick = (e) => {
      const caretElement = e.target.closest('.scene-heading-caret');
      if (!caretElement) return;
      
      const sceneHeading = e.target.closest('.scene-heading');
      if (!sceneHeading) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const sceneId = sceneHeading.getAttribute('data-scene-number');
      const isCollapsed = sceneHeading.getAttribute('data-collapsed') === 'true';
      
      e.shiftKey ? toggleAllScenes(!isCollapsed) : toggleScene(sceneId, !isCollapsed);
    };
    
    editor.view.dom.addEventListener('click', handleSceneClick);
    return () => editor?.view?.dom?.removeEventListener('click', handleSceneClick);
  }, [editor, toggleScene, toggleAllScenes]);

  // Note creation interface state and handlers
  const [hoverLine, setHoverLine] = useState(null);

  const handleNoteAreaMouseMove = useCallback((e) => {
    if (!editor?.state?.doc) return;

    const scriptContainer = e.currentTarget.parentElement;
    if (!scriptContainer) return;

    const rect = scriptContainer.getBoundingClientRect();
    const y = e.clientY - rect.top + scriptContainer.scrollTop;

    // Find paragraph at cursor position
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

  const handleNoteAreaMouseLeave = useCallback(() => setHoverLine(null), []);

  const handleNoteAreaClick = useCallback((e) => {
    if (!editor?.view) return;
    
    const scriptContainer = e.currentTarget.parentElement;
    const rect = scriptContainer.getBoundingClientRect();
    const y = e.clientY - rect.top + scriptContainer.scrollTop;

    // Find target paragraph
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
                <BubbleMenuButton 
                  onClick={() => toggleParagraphClass('character')} 
                  isActive={isClassActive('character')} 
                  type="scene"
                >
                  character
                </BubbleMenuButton>
                <BubbleMenuButton 
                  onClick={() => toggleParagraphClass('dialogue')} 
                  isActive={isClassActive('dialogue')} 
                  type="scene"
                >
                  dialogue
                </BubbleMenuButton>
                <BubbleMenuButton 
                  onClick={() => toggleParagraphClass('action')} 
                  isActive={isClassActive('action')} 
                  type="scene"
                >
                  action
                </BubbleMenuButton>
                <BubbleMenuButton 
                  onClick={() => toggleParagraphClass('scene-heading')} 
                  isActive={isClassActive('scene-heading')} 
                  type="scene"
                >
                  scene
                </BubbleMenuButton>
              </div>
              <div className="bubble-menu-column">
                <BubbleMenuButton 
                  onClick={() => toggleHighlight('char')} 
                  isActive={editor.isActive('highlight', { class: 'char' })} 
                  type="char"
                >
                  char
                </BubbleMenuButton>
                <BubbleMenuButton 
                  onClick={() => toggleHighlight('prop')} 
                  isActive={editor.isActive('highlight', { class: 'prop' })} 
                  type="prop"
                >
                  prop
                </BubbleMenuButton>
                <BubbleMenuButton 
                  onClick={() => toggleHighlight('env')} 
                  isActive={editor.isActive('highlight', { class: 'env' })} 
                  type="env"
                >
                  env
                </BubbleMenuButton>
                <BubbleMenuButton 
                  onClick={toggleNote} 
                  isActive={false} 
                  type="note"
                >
                  note
                </BubbleMenuButton>
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

/**
 * Main Application Component
 * Manages the editor state and coordinates all app functionality:
 * - File operations (open/save/auto-save)
 * - IPC communication with Electron
 * - Scene management
 * - Analytics tracking
 * - User notifications
 * - Search functionality
 */
function App() {
  const { ipcRenderer } = window.require('electron');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [currentFileName, setCurrentFileName] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Search shortcut handler (Cmd/Ctrl + F)
  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      setIsSearchOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Initialize logger
  useEffect(() => {
    ipcRenderer.on('configure-logger', (_, config) => {
      log.transports.file.level = config.isDev ? 'debug' : 'info';
      log.transports.console.level = config.isDev ? 'debug' : 'info';
      log.transports.file.resolvePathFn = () => config.logPath;
      log.initialize();
    });

    return () => {
      ipcRenderer.removeListener('configure-logger', () => {});
    };
  }, []);

  // Initialize editor
  const editor = useEditor({
    extensions,
    content: EDITOR_CONFIG.defaultContent,
    editable: true,
  });

  const { initializeScenes, updateVfxShotNumber } = useEditorOperations(editor);

  // Update document title
  useEffect(() => {
    document.title = currentFileName ? `Breakdown - ${currentFileName}` : 'Breakdown';
  }, [currentFileName]);

  // Initialize analytics if API key is available
  useEffect(() => {
    Analytics.init();
    
    if (Analytics.isEnabled) {
      ipcRenderer.invoke('get-user-id')
        .then(userId => {
          Analytics.identify(userId);
          Analytics.track('app_launched');
        })
        .catch(error => {
          log.error('Failed to get user ID:', error);
        });
    }
  }, []);

  // Main effect for IPC communication and editor setup
  useEffect(() => {
    if (!editor) return;

    let isInitializing = false;
    let initializeTimeout = null;

    // Debounced scene initialization
    const safeInitializeScenes = () => {
      if (isInitializing) return;
      isInitializing = true;
      
      clearTimeout(initializeTimeout);
      initializeTimeout = setTimeout(() => {
        initializeScenes();
        isInitializing = false;
      }, 300);
    };

    // IPC Event Handlers
    const handlers = {
      'menu-open-file': () => {
        log.info('Renderer: Received menu-open-file');
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
        ipcRenderer.send('editor-content', editor.getHTML());
      },
      'set-editor-content': (_, content) => {
        editor.commands.setContent(content);
        safeInitializeScenes();
      },
      'set-file-name': (_, fileName) => {
        setCurrentFileName(fileName);
      },
      'menu-find': () => {
        setIsSearchOpen(true);
      },
      'update-shot-number': updateVfxShotNumber,
      'update-toast': (_, toastId, message) => {
        toast.update(toastId, {
          render: message,
          type: 'info',
          ...TOAST_CONFIG
        });
      },
      'dismiss-toast': (_, toastId) => {
        toast.dismiss(toastId);
      },
      'show-info': (_, message, options = {}) => {
        toast.info(message, {
          ...TOAST_CONFIG,
          autoClose: options.autoClose ?? 3000,
          toastId: options.toastId,
          ...(options.autoClose === false && {
            closeButton: false,
            closeOnClick: false,
          })
        });
      },
      'show-error': (_, message) => {
        toast.error(message, {
          ...TOAST_CONFIG,
          autoClose: 3000
        });
      },
      'show-success': (_, message) => {
        toast.success(message, {
          ...TOAST_CONFIG,
          autoClose: 2000
        });
      }
    };

    // Register handlers
    Object.entries(handlers).forEach(([event, handler]) => {
      ipcRenderer.on(event, handler);
    });

    // Load initial content
    ipcRenderer.invoke('load-content')
      .then(content => {
        if (content) editor.commands.setContent(content);
        safeInitializeScenes();
      })
      .catch(err => {
        console.error('Error loading initial content:', err);
        toast.error('Failed to load saved content');
      });

    // Auto-save timer (every 30 seconds)
    const saveTimer = setInterval(() => {
      ipcRenderer.invoke('save-content', { content: editor.getHTML() })
        .catch(err => {
          log.error('Error auto-saving content:', err);
          toast.error('Failed to auto-save content');
        });
    }, 30000);

    // Content change handler
    const handleUpdate = ({ transaction }) => {
      if (transaction.docChanged && 
          transaction.steps.some(step => 
            step.jsonID === 'replace' || 
            step.jsonID === 'replaceAround'
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
      clearTimeout(initializeTimeout);
      if (editor) editor.destroy();
    };
  }, [editor, updateVfxShotNumber, initializeScenes, currentFileName]);

  if (!editor) return null;

  return (
    <div className="App">
      <BreakdownEditor editor={editor} updateVfxShotNumber={updateVfxShotNumber} />
      <HelpButton onClick={() => setIsHelpOpen(true)} />
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      {isSearchOpen && (
        <SearchBox
          editor={editor}
          onClose={() => setIsSearchOpen(false)}
        />
      )}
      <ToastContainer />
    </div>
  );
}

export default App;