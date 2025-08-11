// Meeting Cost Calculator Content Script
console.log('Meeting Cost Calculator loaded');

const DEFAULT_RATE = 150;

// Default hourly rates (can be customized via popup)
let defaultRates = {
  'john.smith@company.com': 144.23,
};

// Load custom rates from storage
chrome.storage.sync.get(['customRates'], function (result) {
  if (result.customRates) {
    defaultRates = { ...defaultRates, ...result.customRates };
  }
});

// Function to extract meeting duration in hours
function getMeetingDuration(timeText) {
  if (!timeText) return 1;

  const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*([ap]m)?\s*[–-]\s*(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  if (!timeMatch) return 1;

  let startHour = parseInt(timeMatch[1]);
  let startMin = parseInt(timeMatch[2]);
  let endHour = parseInt(timeMatch[4]);
  let endMin = parseInt(timeMatch[5]);

  // Handle AM/PM
  const startPM = timeMatch[3] && timeMatch[3].toLowerCase() === 'pm';
  const endPM = timeMatch[6] && timeMatch[6].toLowerCase() === 'pm';

  if (startPM && startHour !== 12) startHour += 12;
  if (endPM && endHour !== 12) endHour += 12;
  if (!startPM && startHour === 12) startHour = 0;
  if (!endPM && endHour === 12) endHour = 0;

  const startTotalMin = startHour * 60 + startMin;
  const endTotalMin = endHour * 60 + endMin;

  return (endTotalMin - startTotalMin) / 60;
}

// Function to get attendees from the event detail view
function getAttendees() {
  const attendees = [];
  const seenEmails = new Set();

  // Look for attendee elements in the event details
  const attendeeElements = document.querySelectorAll('[data-email], [data-hovercard-id*="@"]');

  attendeeElements.forEach(el => {
    const email = el.getAttribute('data-email') ||
      el.getAttribute('data-hovercard-id') ||
      el.textContent.match(/[\w\.-]+@[\w\.-]+\.\w+/)?.[0];

    if (email && email.includes('@') && !seenEmails.has(email)) {
      seenEmails.add(email);
      const nameElement = el.querySelector('[aria-label]:not([aria-label*="@"])') || el;
      let name = nameElement.textContent.trim();

      // Clean up the name by removing extra text
      name = name.replace(/Organizer|Set your working location|Office/g, '').trim();

      // Check for group counts like "peopleengineering (127)"
      const groupMatch = name.match(/^(.+?)\s*\((\d+)\)/);
      if (groupMatch) {
        const groupName = groupMatch[1].trim();
        const groupCount = parseInt(groupMatch[2]);
        const rate = defaultRates[email] || getDefaultRate(groupName);

        // Add the group as a single entry with count
        attendees.push({
          name: groupName,
          email: email,
          rate: rate,
          count: groupCount
        });
      } else {
        name = name || email.split('@')[0];
        const rate = defaultRates[email] || getDefaultRate(name);
        attendees.push({ name, email, rate, count: 1 });
      }
    }
  });

  // If no attendees found via data attributes, try text parsing
  if (attendees.length === 0) {
    const possibleAttendees = document.querySelectorAll('[aria-label*="@"]');
    possibleAttendees.forEach(el => {
      const ariaLabel = el.getAttribute('aria-label') || '';
      const emailMatch = ariaLabel.match(/[\w\.-]+@[\w\.-]+\.\w+/);
      if (emailMatch && !seenEmails.has(emailMatch[0])) {
        const email = emailMatch[0];
        seenEmails.add(email);
        const name = ariaLabel.replace(email, '').replace(/,.*/, '').trim() || email.split('@')[0];
        const rate = defaultRates[email] || getDefaultRate(name);
        attendees.push({ name, email, rate, count: 1 });
      }
    });
  }

  // Fallback: create sample attendees if none found
  if (attendees.length === 0) {
    return [
      { name: 'John Smith', email: 'john.smith@company.com', rate: 144.23, count: 1 },
    ];
  }

  return attendees;
}

// Function to get default rate based on name/role patterns
function getDefaultRate(name) {
  // can add customizations here based on heuristics like name patterns
  return DEFAULT_RATE; // Default rate
}

// Function to modify attendee display to include hourly rates
function modifyAttendeeDisplay(attendees) {
  attendees.forEach(attendee => {
    // Find attendee elements by email
    const attendeeElements = document.querySelectorAll(`[data-email="${attendee.email}"]`);

    attendeeElements.forEach(element => {
      // Skip if already modified
      if (element.hasAttribute('data-cost-added')) return;

      // Mark as processed
      element.setAttribute('data-cost-added', 'true');

      // Create rate text
      const rateText = attendee.count > 1
        ? ` ($${attendee.rate.toFixed(2)}/hr × ${attendee.count})`
        : ` ($${attendee.rate.toFixed(2)}/hr)`;

      // Instead of replacing textContent, find and modify only text nodes
      // This preserves the DOM structure including profile pictures
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node) {
            // Only accept text nodes that contain actual text and don't already have rate info
            return node.textContent.trim() && !node.textContent.includes('/hr')
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        },
        false
      );

      let textNode;
      let modified = false;

      // Find the first suitable text node (usually the name)
      while (textNode = walker.nextNode()) {
        const currentText = textNode.textContent;
        // Look for a text node that seems to contain a name (has letters, not just symbols/numbers)
        if (currentText.match(/[a-zA-Z]/)) {
          textNode.textContent = currentText + rateText;
          modified = true;
          break;
        }
      }

      // Fallback: if no suitable text node found, try the old method but more carefully
      if (!modified) {
        const nameSpan = element.querySelector('span[style*="color"], span:not([class*="avatar"]):not([class*="photo"])');
        if (nameSpan && nameSpan.textContent.trim() && !nameSpan.textContent.includes('/hr')) {
          nameSpan.textContent = nameSpan.textContent + rateText;
        }
      }
    });
  });
}

// Function to create and insert cost information
function addCostInfo() {
  // Remove existing cost info to avoid duplicates
  const existingCostInfo = document.querySelector('.meeting-cost-info');
  if (existingCostInfo) {
    existingCostInfo.remove();
  }

  // Find the event details container by looking for attendees
  const attendeeElement = document.querySelector('[data-email]');
  if (!attendeeElement) return;

  const eventContainer = attendeeElement.closest('div[role="main"], div[data-view-type], div[jsaction*="drUZwf"]') || attendeeElement.parentElement.parentElement.parentElement;

  // Get meeting duration from storage or default to 1 hour
  let duration = 1; // default
  chrome.storage.sync.get(['meetingDuration'], function (result) {
    duration = result.meetingDuration || 1;

    // Get attendees and modify their display
    const attendees = getAttendees();
    modifyAttendeeDisplay(attendees);
    updateCostDisplay(duration, attendees);
  });
}

function updateCostDisplay(duration, attendees) {
  // Remove existing cost info to avoid duplicates
  const existingCostInfo = document.querySelector('.meeting-cost-info');
  if (existingCostInfo) {
    existingCostInfo.remove();
  }

  // Calculate total cost
  const totalCost = attendees.reduce((sum, attendee) => sum + (attendee.rate * attendee.count * duration), 0);

  // Create simplified cost info element
  const costInfoHtml = `
    <div class="meeting-cost-info">
      <div class="cost-header">
        <span class="cost-icon">💰</span>
        <span class="cost-amount">$${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cost of meeting</span>
        <div class="duration-selector">
          <label>Duration: </label>
          <select class="duration-dropdown">
            <option value="0.5" ${duration === 0.5 ? 'selected' : ''}>30 minutes</option>
            <option value="1" ${duration === 1 ? 'selected' : ''}>1 hour</option>
            <option value="1.5" ${duration === 1.5 ? 'selected' : ''}>1.5 hours</option>
            <option value="2" ${duration === 2 ? 'selected' : ''}>2 hours</option>
          </select>
        </div>
      </div>
    </div>
  `;

  // Insert the cost info above the attendees section
  const attendeeElement = document.querySelector('[data-email]');
  const eventContainer = attendeeElement?.closest('div[role="main"], div[data-view-type], div[jsaction*="drUZwf"]') || attendeeElement?.parentElement?.parentElement?.parentElement;
  const attendeesContainer = eventContainer?.querySelector('[data-email]')?.parentElement?.parentElement;
  const targetElement = attendeesContainer || eventContainer;

  if (targetElement) {
    targetElement.insertAdjacentHTML('beforebegin', costInfoHtml);

    // Add duration change handler
    const durationDropdown = document.querySelector('.duration-dropdown');
    if (durationDropdown) {
      durationDropdown.addEventListener('change', (e) => {
        const newDuration = parseFloat(e.target.value);
        chrome.storage.sync.set({ meetingDuration: newDuration });

        // Get fresh attendee data and update everything
        const freshAttendees = getAttendees();
        modifyAttendeeDisplay(freshAttendees);
        updateCostDisplay(newDuration, freshAttendees);
      });
    }
  }
}

// Observer to watch for DOM changes
const observer = new MutationObserver((mutations) => {
  let shouldUpdate = false;

  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if an event dialog or details view was added
          if (node.matches && (
            node.matches('[data-email]') ||
            node.querySelector('[data-email]')
          )) {
            shouldUpdate = true;
          }
        }
      });
    }
  });

  if (shouldUpdate) {
    setTimeout(addCostInfo, 500); // Small delay to ensure DOM is fully rendered
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial load
setTimeout(() => {
  if (document.querySelector('[data-email]')) {
    addCostInfo();
  }
}, 1000);