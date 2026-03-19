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

function scanFormFields() {
  const inputs = document.querySelectorAll('input, textarea, select'); // simplified query
  const fields = [];
  
  // Real comprehensive query
  const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea, select');
  
  allInputs.forEach(input => {
    let identifier = input.id || input.name || "";
    let labelText = "";
    
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) labelText = label.innerText;
    }
    
    if (!labelText && input.closest('label')) {
      labelText = input.closest('label').innerText;
    }
    
    fields.push({
      id: input.id || input.name || Math.random().toString(36).substr(2, 9), // ensure unique ID
      name: input.name,
      type: input.type,
      placeholder: input.placeholder || "",
      label: labelText.trim().replace(/\\n/g, ' ')
    });
    
    // Stash the generated ID back onto the element if it didn't have one so we can find it later
    if (!input.id && !input.name) {
       input.setAttribute('data-jobfill-id', fields[fields.length-1].id);
    }
  });
  
  return fields;
}

function fillFormFields(mapping) {
  let filledCount = 0;
  const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea, select');
  
  allInputs.forEach(input => {
    const id = input.id || input.name || input.getAttribute('data-jobfill-id');
    const valueToFill = mapping[id];
    
    if (valueToFill) {
      // Handle different input types
      if (input.type === 'checkbox' || input.type === 'radio') {
         // simplified, just text for now
      } else {
         input.value = valueToFill;
         input.dispatchEvent(new Event('input', { bubbles: true }));
         input.dispatchEvent(new Event('change', { bubbles: true }));
         filledCount++;
      }
    }
  });

  console.log(`JobFill AI: Auto-filled ${filledCount} fields from AI mapping`);
}

async function attachResume(base64Data, fileName) {
  const fileInputs = document.querySelectorAll('input[type="file"]');
  let targetInput = null;

  for (const input of fileInputs) {
    const accept = input.getAttribute('accept');
    if (accept && accept.includes('pdf')) {
      targetInput = input;
      break;
    }
  }

  if (!targetInput && fileInputs.length > 0) {
    targetInput = fileInputs[0];
  }

  if (!targetInput) {
    console.log("JobFill AI: No file input found");
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
    return true;
  } catch (error) {
    console.error("JobFill AI: Failed to attach resume", error);
    return false;
  }
}
