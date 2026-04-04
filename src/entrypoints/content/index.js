import { matchField } from '@/utils/autofillMap';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    console.log('JobFill AI content script injected');

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'SCAN_FORM') {
        sendResponse({ success: true, fields: scanFormFields() });
        return true; 
      }
      
      if (message.action === 'FILL_FORM') {
        fillFormFields(message.mapping);
        sendResponse({ success: true });
        return true; 
      }
      
      if (message.action === 'ATTACH_RESUME') {
        attachResume(message.fileData, message.fileName).then((success) => {
          sendResponse({ success });
        });
        return true; 
      }
    });
  },
});

/**
 * Walks up the DOM from an element to find the closest meaningful label text.
 * Checks: <label for="...">, parent <label>, closest container's text, aria-label, preceding sibling text.
 */
function findLabelForElement(input) {
  // 1. Explicit <label for="id">
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.innerText.trim();
  }

  // 2. Wrapping <label> parent
  const parentLabel = input.closest('label');
  if (parentLabel) {
    // Get label text but exclude the input's own value from it
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input, textarea, select').forEach(el => el.remove());
    const text = clone.innerText.trim();
    if (text) return text;
  }

  // 3. aria-label or aria-labelledby
  if (input.getAttribute('aria-label')) {
    return input.getAttribute('aria-label').trim();
  }
  if (input.getAttribute('aria-labelledby')) {
    const labelEl = document.getElementById(input.getAttribute('aria-labelledby'));
    if (labelEl) return labelEl.innerText.trim();
  }

  // 4. Walk up to the closest container (div, li, td, fieldset) and grab its text content
  let container = input.parentElement;
  for (let i = 0; i < 5 && container; i++) {
    const tag = container.tagName.toLowerCase();
    if (['div', 'li', 'td', 'fieldset', 'section', 'p'].includes(tag)) {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('input, textarea, select, button, script, style').forEach(el => el.remove());
      const text = clone.innerText.trim().replace(/\s+/g, ' ');
      // Only use it if it's a reasonable label length (not a massive paragraph)
      if (text.length > 0 && text.length < 200) {
        return text;
      }
    }
    container = container.parentElement;
  }

  // 5. Check the immediately preceding sibling element for text
  const prev = input.previousElementSibling;
  if (prev && prev.innerText) {
    const prevText = prev.innerText.trim();
    if (prevText.length > 0 && prevText.length < 150) return prevText;
  }

  return "";
}

function scanFormFields() {
  const fields = [];
  const allInputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="file"]), textarea, select'
  );
  
  allInputs.forEach((input, index) => {
    const labelText = findLabelForElement(input);
    
    // Generate a stable unique ID for this element 
    let uniqueId = input.id || input.name || '';
    if (!uniqueId) {
      uniqueId = 'jobfill_' + index + '_' + Math.random().toString(36).substr(2, 5);
      input.setAttribute('data-jobfill-id', uniqueId);
    }

    // Collect select options if it's a dropdown
    let options = [];
    if (input.tagName.toLowerCase() === 'select') {
      options = Array.from(input.options).map(o => o.text.trim()).filter(t => t);
    }

    fields.push({
      id: uniqueId,
      name: input.name || '',
      type: input.type || input.tagName.toLowerCase(),
      tag: input.tagName.toLowerCase(),
      placeholder: input.placeholder || '',
      label: labelText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(),
      options: options.length > 0 ? options : undefined,
      currentValue: input.value || ''
    });
  });
  
  console.log(`JobFill AI: Scanned ${fields.length} form fields`);
  return fields;
}

function fillFormFields(mapping) {
  let filledCount = 0;
  const allInputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="file"]), textarea, select'
  );

  // Build a lookup: for each input, store all possible identifiers + its label
  const inputData = [];
  allInputs.forEach(input => {
    const label = findLabelForElement(input);
    inputData.push({
      element: input,
      ids: [input.id, input.name, input.getAttribute('data-jobfill-id')].filter(Boolean),
      label: label
    });
  });
  
  // For each mapping entry, find the correct input to fill
  for (const [mappingKey, valueToFill] of Object.entries(mapping)) {
    if (!valueToFill || valueToFill === '') continue;

    // Strategy 1: Direct ID/name match
    let targetInput = inputData.find(d => d.ids.includes(mappingKey));

    // Strategy 2: Fuzzy label match — if the mapping key looks like a label
    if (!targetInput) {
      targetInput = inputData.find(d => 
        d.label && d.label.toLowerCase().includes(mappingKey.toLowerCase())
      );
    }

    if (!targetInput) continue;

    const input = targetInput.element;

    // Handle different input types
    if (input.tagName.toLowerCase() === 'select') {
      const options = Array.from(input.options);
      const exactMatch = options.find(o => o.text.trim().toLowerCase() === valueToFill.toLowerCase());
      const partialMatch = options.find(o => 
        o.text.trim().toLowerCase().includes(valueToFill.toLowerCase()) ||
        valueToFill.toLowerCase().includes(o.text.trim().toLowerCase())
      );
      const target = exactMatch || partialMatch;
      if (target) {
        input.value = target.value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        filledCount++;
      }
    } else if (input.type === 'checkbox') {
      const shouldCheck = ['yes', 'true', '1', 'on'].includes(valueToFill.toLowerCase());
      if (input.checked !== shouldCheck) {
        input.click();
        filledCount++;
      }
    } else if (input.type === 'radio') {
      if (input.value.toLowerCase() === valueToFill.toLowerCase() || 
          (input.labels?.[0]?.innerText || '').toLowerCase().includes(valueToFill.toLowerCase())) {
        input.click();
        filledCount++;
      }
    } else {
      // Standard text input / textarea — use native setter for React/Angular compat
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;
      
      const setter = input.tagName.toLowerCase() === 'textarea' ? nativeTextAreaSetter : nativeInputValueSetter;
      
      if (setter) {
        setter.call(input, valueToFill);
      } else {
        input.value = valueToFill;
      }
      
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      filledCount++;
    }
  }

  console.log(`JobFill AI: Auto-filled ${filledCount} fields from AI mapping`);
}

async function attachResume(base64Data, fileName) {
  const fileInputs = document.querySelectorAll('input[type="file"]');
  let targetInput = null;

  // Specifically look for a file input whose label/context mentions "resume" or "cv"
  const resumeKeywords = ['resume', 'cv', 'curriculum vitae'];
  for (const input of fileInputs) {
    const label = findLabelForElement(input).toLowerCase();
    const inputName = (input.name || '').toLowerCase();
    const inputId = (input.id || '').toLowerCase();
    const accept = (input.getAttribute('accept') || '').toLowerCase();
    const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
    const allText = `${label} ${inputName} ${inputId} ${accept} ${placeholder}`;
    
    if (resumeKeywords.some(kw => allText.includes(kw))) {
      targetInput = input;
      break;
    }
  }

  // If no resume-specific field found, check for PDF-accepting inputs
  if (!targetInput) { 
    for (const input of fileInputs) {
      const accept = input.getAttribute('accept');
      if (accept && (accept.includes('pdf') || accept.includes('.doc'))) {
        targetInput = input;
        break;
      }
    }
  }

  // Last resort: skip entirely if we can't confidently find a resume field
  if (!targetInput) {
    console.log("JobFill AI: No resume upload field found — skipping attachment");
    return false;
  }

  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const file = new File([blob], fileName || "Resume.pdf", { type: 'application/pdf' });
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    targetInput.files = dataTransfer.files;

    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    console.log("JobFill AI: Resume attached successfully");
    return true;
  } catch (error) {
    console.error("JobFill AI: Failed to attach resume", error);
    return false;
  }
}
