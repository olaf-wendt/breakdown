import React, { useState, useEffect, useRef } from 'react';
import './SearchBox.css';

export function SearchBox({ editor, onClose }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [resultsCount, setResultsCount] = useState({ current: 0, total: 0 });
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus input when component mounts
    inputRef.current?.focus();

    // Cleanup search decorations when unmounting
    return () => {
      editor?.commands.clearSearch();
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !searchTerm) {
      setResultsCount({ current: 0, total: 0 });
      editor?.commands.clearSearch();
      return;
    }

    console.log('Searching for:', searchTerm);
    try {
      const result = editor.commands.find(searchTerm);
      if (result) {
        setResultsCount({ current: result.current, total: result.total });
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  }, [searchTerm, editor]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevious();
      } else {
        handleNext();
      }
    }
  };

  const handleNext = () => {
    console.log('Handling next');
    try {
      const result = editor?.commands.findNext();
      if (result) {
        setResultsCount({ current: result.current, total: result.total });
      }
    } catch (error) {
      console.error('Next search error:', error);
    }
  };

  const handlePrevious = () => {
    console.log('Handling previous');
    try {
      const result = editor?.commands.findPrevious();
      if (result) {
        setResultsCount({ current: result.current, total: result.total });
      }
    } catch (error) {
      console.error('Previous search error:', error);
    }
  };

  return (
    <div className="search-box">
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in script..."
      />
      {searchTerm && (
        <div className="search-controls">
          <span className="search-count">
            {resultsCount.total > 0 ? `${resultsCount.current} of ${resultsCount.total}` : 'No results'}
          </span>
          <button 
            onClick={handlePrevious} 
            disabled={!searchTerm || resultsCount.total === 0}
          >
            ↑
          </button>
          <button 
            onClick={handleNext} 
            disabled={!searchTerm || resultsCount.total === 0}
          >
            ↓
          </button>
        </div>
      )}
      <button className="search-close" onClick={onClose}>×</button>
    </div>
  );
}