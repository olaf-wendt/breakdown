import React from 'react';
import { EDITOR_CONFIG } from '../config';
import { BubbleMenuButton } from './BubbleMenuButton';

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