import React from 'react';
import { createRoot } from 'react-dom/client';
import CarbonWarning from '../CarbonWarning.jsx';

let active = null;
function parse(event) { try { return JSON.parse(event.detail); } catch { return null; } }
function dispatch(name, value) { document.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(value) })); }
document.addEventListener('omni-impact:probe', event => {
  const data = parse(event);
  if (typeof data?.requestId === 'string') dispatch('omni-impact:available', { requestId: data.requestId });
});
document.addEventListener('omni-impact:request', event => {
  const data = parse(event), impact = data?.impact;
  if (!impact || !['text', 'image'].includes(impact.kind) || !Number.isFinite(impact.waterMl) || !Number.isFinite(impact.carbonGrams) || !Number.isSafeInteger(impact.tokens) || !Number.isSafeInteger(impact.imageCount)) return;
  if (active) { dispatch('omni-impact:decision', { requestId: data.requestId, proceed: false }); return; }
  const host = document.createElement('div');
  host.id = 'footprint-extension-host'; document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const nonce = document.querySelector('meta[name="csp-nonce"]')?.content;
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = __FOOTPRINT_CSS__; shadow.append(style);
  const mount = document.createElement('div'); shadow.append(mount);
  const root = createRoot(mount);
  const finish = proceed => {
    if (!active || active.requestId !== data.requestId) return;
    active = null; root.unmount(); host.remove();
    dispatch('omni-impact:decision', { requestId: data.requestId, proceed });
  };
  active = { requestId: data.requestId, finish };
  root.render(<CarbonWarning impact={impact} onCancel={() => finish(false)} onProceed={() => finish(true)} portalTarget={mount} focusScope={shadow} returnFocus={document.querySelector('.generate-button')} />);
});
document.addEventListener('omni-impact:dismiss', event => {
  if (parse(event)?.requestId === active?.requestId) active?.finish(false);
});
