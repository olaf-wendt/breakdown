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
            <p>copyright 2024 olaf wendt. Send bug reports to <a href="mailto:olaf@olafwendt.com" className="email-link">olaf@olafwendt.com</a></p>
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
            <p>Once you've loaded your script, fix any formatting errors from the OCR process.</p>
            <p>Then tag lines as vfx shots, tag characters, props etc and add notes:</p>
            <br></br>
        </section>
        <section className="help-content-script">
            <div className="help-content-script-container">
                <div className="tiptap ProseMirror" translate="no" role="textbox">
                    <p className="scene-heading" data-scene-number="1" data-collapsed="false">
                        <span className="scene-heading-caret"></span>
                        <span className="scene-heading-content">INT. DEEP MIND FACILITY - PERPETUAL TWILIGHT</span>
                    </p>
                    <p data-scene-number="1"><br className="ProseMirror-trailingBreak" /></p>
                    <p className="action" data-scene-number="1">
                        Streams of psychedelic tokens cascade down <mark className="prop">transparent screens</mark>.<span data-type="note" className="note-bubble">Note: in-camera projections</span>
                    </p>
                    <p data-scene-number="1"><br className="ProseMirror-trailingBreak" /></p>
                    <p className="action vfx easy" data-scene-number="1">
                        <mark className="char">DR. ZHANG</mark> stands motionless.
                    </p>
                    <p className="action vfx easy" data-scene-number="1">
                        His neural implants glowing a soft crimson.<span data-type="note" className="note-bubble">Note: augment practical implants</span>
                    </p>
                    <p data-scene-number="1"><br className="ProseMirror-trailingBreak" /></p>
                    <p className="character" data-scene-number="1">
                        <mark className="char">DR. ZHANG</mark>
                    </p>
                    <p className="dialogue" data-scene-number="1">
                    The AI isn't malfunctioning.
                    </p>
                    <p className="dialogue" data-scene-number="1">
                    It's dreaming.
                    </p>
                </div>
                <div className="help-annotation top" style={{ top: '-60px', left: '20px' }}>
                    <span>click to collapse</span>
                    <div className="annotation-arrow bottom" style={{ height: '15px' }}></div>
                </div>
                <div className="help-annotation top" style={{ top: '-60px', left: '450px' }}>
                    <span>tagged prop elements</span>
                    <div className="annotation-arrow bottom" style={{ height: '40px' }}></div>
                </div>
                <div className="help-annotation right" style={{ top: '80px', left: '560px' }}>
                    <span>tagged as easy vfx shot</span>
                    <div className="annotation-arrow left"></div>
                </div>
                <div className="help-annotation top" style={{ top: '-70px', left: '800px' }}>
                    <span>add notes by clicking in right margin</span>
                    <div className="annotation-arrow bottom" style={{ height: '60px' }}></div>
                </div>
                <div className="help-annotation right" style={{ top: '110px', left: '360px' }}>
                    <span>tagged character</span>
                    <div className="annotation-arrow left" style={{ width: '60px' }}></div>
                </div>
            </div>
        </section>
        <section className="help-section">
            <p>Shift click on carets to collapse / expand all scenes.</p>
            <p>Delete note text to remove note bubbles.</p>
        </section>
        <section className="help-section">
            <p>Select text to bring up this bubble menu to change formatting, tag vfx shots, characters, props etc:</p>
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