import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import log from 'electron-log/renderer';
import './SearchBox.css';

/**
 * SearchBox Component
 * Provides search functionality within the script editor
 * Features:
 * - Real-time search with result highlighting
 * - Navigation between search results
 * - Keyboard shortcuts support
 * - Accessible controls
 * 
 * Keyboard shortcuts:
 * - Enter: Next result
 * - Shift + Enter: Previous result
 * - Escape: Close search box
 * 
 * @param {Object} props
 * @param {Object} props.editor - TipTap editor instance
 * @param {Function} props.onClose - Callback to close the search box
 */
const SearchBox = memo(({ editor, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [resultsCount, setResultsCount] = useState({ current: 0, total: 0 });
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef(null);

  // Cleanup search decorations on unmount
  useEffect(() => {
    inputRef.current?.focus();
    return () => editor?.commands.clearSearch();
  }, [editor]);

  // Perform search when term changes
  useEffect(() => {
    if (!editor) return;

    if (!searchTerm) {
      setResultsCount({ current: 0, total: 0 });
      editor.commands.clearSearch();
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        log.debug('Searching for:', searchTerm);
        const result = editor.commands.find(searchTerm);
        if (result) {
          setResultsCount({ current: result.current, total: result.total });
        }
      } catch (error) {
        log.error('Search error:', error);
        setResultsCount({ current: 0, total: 0 });
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm, editor]);

  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'Enter':
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevious();
        } else {
          handleNext();
        }
        break;
      default:
        break;
    }
  }, [onClose]);

  const handleNext = useCallback(() => {
    if (!editor || !searchTerm) return;

    try {
      log.debug('Navigating to next result');
      const result = editor.commands.findNext();
      if (result) {
        setResultsCount({ current: result.current, total: result.total });
      }
    } catch (error) {
      log.error('Next search error:', error);
    }
  }, [editor, searchTerm]);

  const handlePrevious = useCallback(() => {
    if (!editor || !searchTerm) return;

    try {
      log.debug('Navigating to previous result');
      const result = editor.commands.findPrevious();
      if (result) {
        setResultsCount({ current: result.current, total: result.total });
      }
    } catch (error) {
      log.error('Previous search error:', error);
    }
  }, [editor, searchTerm]);

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  return (
    <div 
      className="search-box"
      role="search"
      aria-label="Search in script"
    >
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={handleSearchChange}
        onKeyDown={handleKeyDown}
        placeholder="Find in script..."
        aria-label="Search input"
        disabled={isSearching}
      />
      {searchTerm && (
        <div className="search-controls" role="navigation">
          <span 
            className="search-count"
            aria-live="polite"
          >
            {isSearching ? 'Searching...' : 
              resultsCount.total > 0 
                ? `${resultsCount.current} of ${resultsCount.total}` 
                : 'No results'
            }
          </span>
          <button 
            onClick={handlePrevious} 
            disabled={!searchTerm || resultsCount.total === 0 || isSearching}
            aria-label="Previous result"
            title="Previous result (Shift + Enter)"
          >
            ↑
          </button>
          <button 
            onClick={handleNext} 
            disabled={!searchTerm || resultsCount.total === 0 || isSearching}
            aria-label="Next result"
            title="Next result (Enter)"
          >
            ↓
          </button>
        </div>
      )}
      <button 
        className="search-close" 
        onClick={onClose}
        aria-label="Close search"
        title="Close search (Escape)"
      >
        ×
      </button>
    </div>
  );
});

SearchBox.propTypes = {
  editor: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired
};

SearchBox.displayName = 'SearchBox';

export default SearchBox;