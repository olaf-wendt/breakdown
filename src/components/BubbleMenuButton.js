import React from 'react';
import { EDITOR_CONFIG } from '../config.main.esm.js'; 

export function BubbleMenuButton({ onClick, isActive, children, type }) {
  return (
    <button
      onClick={onClick}
      className={`bubble-btn ${type} ${isActive ? 'is-active' : ''}`}
    >
      {children}
    </button>
  );
}

export function VfxButtons({ toggleVfx, isClassActive }) {
  return (
      <div className="bubble-menu-column">
          {EDITOR_CONFIG.vfx.difficultyLevels.map(level => (
              <BubbleMenuButton 
                  key={level.id}
                  onClick={() => toggleVfx(level.id)} 
                  isActive={isClassActive(level.id)} 
                  type={level.id}
              >
                  {level.label}
              </BubbleMenuButton>
          ))}
      </div>
  );
}