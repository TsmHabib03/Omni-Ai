import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatImpact } from './environmental-impact.mjs';
import './carbon-warning.css';

function Symbol({ name, size = 20 }) {
  const paths = {
    leaf: <><path d="M20 4c0 8-2 15-9 15a7 7 0 0 1-7-7c0-7 8-8 16-8Z" /><path d="m4 21 10-10" /></>,
    warning: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3v.1" /></>,
    water: <path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z" />,
    carbon: <><path d="M7 17a4 4 0 1 1-1-8 6 6 0 0 1 11-2 5 5 0 0 1 1 10H7Z" /><path d="M9 20h6" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    pause: <><path d="M9 5v14M15 5v14" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function CarbonWarning({ impact, onCancel, onProceed, returnFocus, portalTarget = document.body, focusScope = document }) {
  const titleId = useId(), descriptionId = useId();
  const panel = useRef(null), cancel = useRef(null), actionTaken = useRef(false);
  const dismiss = useRef(onCancel);
  dismiss.current = onCancel;
  useEffect(() => {
    const previousFocus = returnFocus || document.activeElement;
    // Make the app inaccessible while the extension-style dialog owns focus.
    const app = document.getElementById('root');
    const wasInert = app?.inert;
    if (app) app.inert = true;
    cancel.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); finish(() => dismiss.current()); }
      if (event.key === 'Tab') {
        const buttons = panel.current?.querySelectorAll('button, summary');
        const first = buttons?.[0], last = buttons?.[buttons.length - 1];
        if (event.shiftKey && focusScope.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && focusScope.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (app) app.inert = wasInert || false;
      requestAnimationFrame(() => { if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus(); });
    };
  }, []);
  const subject = impact.kind === 'image'
    ? `image generation of ${impact.imageCount} ${impact.imageCount === 1 ? 'image' : 'images'}`
    : `text prompt of ${impact.tokens.toLocaleString('en')} tokens`;
  function finish(callback) {
    if (actionTaken.current) return;
    actionTaken.current = true;
    callback();
  }
  return createPortal(<div className="impact-overlay" onMouseDown={event => { if (event.target === event.currentTarget) finish(onCancel); }}>
    <section className="impact-panel" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} ref={panel}>
      <header className="impact-toolbar">
        <span className="impact-identity"><Symbol name="leaf" size={19} /><strong>Footprint</strong><span className="impact-extension">Prompt guard</span></span>
        <button type="button" className="impact-close" aria-label="Close environmental warning" onClick={() => finish(onCancel)}><Symbol name="close" size={18} /></button>
      </header>
      <div className="impact-body">
        <div className="impact-heading"><Symbol name="warning" size={26} /><h2 id={titleId}>Environmental impact warning</h2></div>
        <p className="impact-description" id={descriptionId}>Warning: Processing this {subject} will consume approximately <strong>{formatImpact(impact.waterMl)} ml of water</strong> and <strong>{formatImpact(impact.carbonGrams)} grams of carbon.</strong></p>
        <dl className="impact-measurements">
          <div><dt><Symbol name="water" size={18} /> Cooling water</dt><dd>{formatImpact(impact.waterMl)} <span>ml</span></dd></div>
          <div><dt><Symbol name="carbon" size={18} /> Carbon footprint</dt><dd>{formatImpact(impact.carbonGrams)} <span>g CO₂e</span></dd></div>
        </dl>
        <details className="impact-method"><summary>How is this estimated?</summary><p>{impact.kind === 'image' ? '15 ml of water and 10 g CO₂e per generated image. Multiplied by the number of images requested.' : 'About 1 token per 4 characters. Illustrative baseline: 500 ml of water and 50 g CO₂e per 50 prompts of 500 input tokens, scaled to this prompt.'} These are estimates, not provider measurements. Actual usage varies by model, output length, hardware and location.</p></details>
        <p className="impact-paused"><Symbol name="pause" size={14} /> Request paused. Nothing has been sent yet.</p>
      </div>
      <footer className="impact-actions"><button type="button" ref={cancel} className="impact-cancel" onClick={() => finish(onCancel)}>Cancel</button><button type="button" className="impact-proceed" onClick={() => finish(onProceed)}>Proceed Anyway <Symbol name="arrow" size={17} /></button></footer>
    </section>
  </div>, portalTarget);
}
