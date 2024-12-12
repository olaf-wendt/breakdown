import React from 'react';
import { BubbleMenuButton } from './BubbleMenuButton';
import { VfxButtons } from './BubbleMenuButton';
import { EDITOR_CONFIG } from '../config';

export function HelpOverlay({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="help-overlay">
      <div className="help-content">
        <button className="help-close" onClick={onClose}>×</button>
        <h3 className="help-title">BREAKDOWN EDITOR</h3>
        <section className="help-section">
            <p>by olaf wendt. Send bug reports to <a href="mailto:olaf@olafwendt.com" className="email-link">olaf@olafwendt.com</a></p>
        </section>
        <section className="help-section">
          <p>Breakdown is a specialized script editor for marking up screenplays, adding notes and taging vfx shots.</p>
          <p>It imports text or scanned PDFs and (mostly) recognizes formatting for dialogue, character names, scene headings.</p>
          <p>It exports the script to Excel in tabular form with notes, vfx tags and counts for tagged entities.</p>
        </section>
        <section className="help-section">
          <p>
            <span className="menu-path">File → Open</span>
                <span className="shortcut">
                    <kbd><span className="symbol">⌘</span>O</kbd>
                </span>
                open text PDFs (.pdf) or Breakdown script files (.txt) based on the .fountain syntax
            </p>
            <p>
                <span className="menu-path">File → Open OCR</span>
                <span className="shortcut">
                    <kbd><span className="symbol">⌘</span><span className="symbol">⇧</span>O</kbd>
                </span>
                open and OCR scanned PDFs. Try it on hard-to-read text PDFs. OCR takes a little time.
            </p>
            <p>
                <span className="menu-path">File → Save</span>
                <span className="shortcut">
                    <kbd><span className="symbol">⌘</span>S</kbd>
                </span>
                save the script as a Breakdown file (.txt), Excel sheet (.xlsx) or CSV (.csv)
            </p>
            <p>
                <span className="menu-path">Edit → Renumber VFX Shots</span>
                go through the script and renumber lines tagged as vfx shots.
            </p>
        </section>
        <section className="help-section">
            <p>Click in the right margin area next to any script line to add a note.</p>
            <p>Click on the caret to the left of scene headings to collapse a scen to a single line.</p>
            <p>Shift-Click on the caret to collapse/expand all scenes. </p>
            <br></br>
        </section>
        <section className="help-content-script">
            <p className="scene-heading" data-scene-number="1">
                <span className="scene-heading-caret"></span>
                <span className="scene-heading-content">EXT. HADES - DUSK</span>
            </p>
            <p data-scene-number="2"><br className="ProseMirror-trailingBreak" /></p>
            <p className="action vfx mid" data-scene-number="1">
                We are MOVING TOWARD the  <mark className="char">TYRELL CORPORATION</mark> across a <span data-type="note" className="note-bubble">Note: miniature</span>
            </p>
            <p className="action vfx mid" data-scene-number="1">
                vast plain of industrialization, menacing shapes on the
            </p>
            <p className="action vfx mid" data-scene-number="1">
                horizon, stacks belching flames five hundred feet into
            </p>
            <p className="action vfx mid" data-scene-number="1">
                the sky the color of cigar ash. 
            </p>
        </section>
        <section className="help-section">
            <br></br>
            <p>Select text in the editor to bring up the bubble menu to change formatting, tag vfx shots, characters, props etc:</p>
            <div className="help-bubble-preview">
                <div className="bubble-menu-container">
                    <div className="bubble-menu">
                    <div className="bubble-menu-column">
                        <BubbleMenuButton type="scene" disabled>character</BubbleMenuButton>
                        <BubbleMenuButton type="scene" disabled>dialogue</BubbleMenuButton>
                        <BubbleMenuButton type="scene" disabled>action</BubbleMenuButton>
                        <BubbleMenuButton type="scene" disabled>scene</BubbleMenuButton>
                    </div>
                    
                    <div className="bubble-menu-column">
                        <BubbleMenuButton type="char" disabled>char</BubbleMenuButton>
                        <BubbleMenuButton type="prop" disabled>prop</BubbleMenuButton>
                        <BubbleMenuButton type="env" disabled>env</BubbleMenuButton>
                        <BubbleMenuButton type="note" disabled>note</BubbleMenuButton>
                    </div>
                    
                    <div className="bubble-menu-column">
                        <VfxButtons toggleVfx={() => {}} isClassActive={() => false} />
                    </div>
                    </div>

                    <div className="help-annotation left">
                    <span>format script lines</span>
                    <div className="annotation-arrow right"></div>
                    </div>
                    <div className="help-annotation top">
                    <span>tag entities</span>
                    <div className="annotation-arrow bottom"></div>
                    </div>
                    <div className="help-annotation right">
                    <span>tag lines as vfx shots</span>
                    <div className="annotation-arrow left"></div>
                    </div>
                </div>
            </div>
        </section>
      </div>
    </div>
  );
}

export function HelpButton({ onClick }) {
  return (
    <button className="help-button" onClick={onClick} aria-label="Help">
      ?
    </button>
  );
}