// ==UserScript==
// @name         VOI Foot Patroller – Tidying / No rack
// @namespace    local.voi.footpatroller
// @version      0.2.0
// @description  Preselect Tidying and no rack for each new scooter; never submits the form.
// @match        https://footpatroller.voiable2.voi.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Only change the two known initial defaults. Do not touch photos, GPS,
  // location, notes or submission, and do not override a manual alternative.
  const FIELDS = [
    { label: 'Repark reason', wanted: 'Tidying', original: 'Outside the racks' },
    { label: 'Rack location accuracy', wanted: 'no rack', original: 'accurate' }
  ];

  const normalize = value => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nativeSetValue = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype, 'value'
  )?.set;

  function currentBikeId() {
    for (const heading of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const text = normalize(heading.textContent);
      const match = text.match(/^bike\s+([a-z0-9-]+)$/i);
      if (match) return match[1];
    }
    return null;
  }

  function findField(labelText) {
    const label = Array.from(document.querySelectorAll('form label'))
      .find(el => normalize(el.textContent) === normalize(labelText));
    if (!label) return null;

    // VOI wraps each label, visible combobox and hidden <select> in a div.
    const wrapper = label.parentElement;
    const button = wrapper?.querySelector('button[role="combobox"]');
    const select = wrapper?.querySelector('select');
    return button && select ? { button, select } : null;
  }

  let bikeId = null;
  let done = new Set();
  let busy = false;
  let timer = null;

  async function applyForCurrentBike() {
    if (busy || !nativeSetValue) return;
    const foundBikeId = currentBikeId();
    if (!foundBikeId) return;

    if (foundBikeId !== bikeId) {
      bikeId = foundBikeId;
      done = new Set();
    }
    if (done.size === FIELDS.length) return;
    if (FIELDS.some(field => !findField(field.label))) return;

    busy = true;
    try {
      for (const field of FIELDS) {
        if (done.has(field.label)) continue;
        const control = findField(field.label); // Find it again after React updates.
        if (!control) continue;

        const desiredOption = Array.from(control.select.options).find(
          option => normalize(option.textContent) === normalize(field.wanted)
        );
        if (!desiredOption) continue; // App might still be loading options.

        const displayed = normalize(control.button.textContent);
        if (displayed === normalize(field.wanted)) {
          done.add(field.label);
          continue;
        }

        if (displayed !== '' && displayed !== normalize(field.original)) {
          // An alternative (e.g., Toppled) was chosen already. Respect it.
          done.add(field.label);
          continue;
        }

        // This is the approach confirmed to update VOI's controlled React form.
        nativeSetValue.call(control.select, desiredOption.value);
        control.select.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait for React to rerender before looking for the next field.
        await new Promise(resolve => setTimeout(resolve, 120));
        const updated = findField(field.label);
        if (updated && normalize(updated.button.textContent) === normalize(field.wanted)) {
          done.add(field.label);
          console.info(`[VOI defaults] ${field.label}: ${field.wanted} (${bikeId})`);
        } else {
          console.warn(`[VOI defaults] Could not verify ${field.label}. Please select manually.`);
        }
      }
    } catch (error) {
      console.warn('[VOI defaults] Autofill error; select values manually:', error);
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(applyForCurrentBike, 220);
  }

  // A new scan can swap the scooter form without navigating/reloading.
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  schedule();
})();
