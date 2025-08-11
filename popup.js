// Popup functionality for Meeting Cost Calculator

let rates = {};

// Load existing rates
chrome.storage.sync.get(['customRates'], function(result) {
  rates = result.customRates || {
    'john.smith@company.com': 144.23,
  };
  renderRates();
});

function renderRates() {
  const ratesList = document.getElementById('ratesList');
  ratesList.innerHTML = '';
  
  Object.entries(rates).forEach(([email, rate]) => {
    const rateDiv = document.createElement('div');
    rateDiv.className = 'rate-input';
    rateDiv.innerHTML = `
      <input type="email" value="${email}" placeholder="email@company.com">
      <input type="number" value="${rate}" placeholder="100" step="0.01" min="0">
      <button onclick="removeRate(this)">Remove</button>
    `;
    ratesList.appendChild(rateDiv);
  });
}

function removeRate(button) {
  button.parentElement.remove();
}

function addRate() {
  const ratesList = document.getElementById('ratesList');
  const rateDiv = document.createElement('div');
  rateDiv.className = 'rate-input';
  rateDiv.innerHTML = `
    <input type="email" placeholder="email@company.com">
    <input type="number" placeholder="100" step="0.01" min="0">
    <button onclick="removeRate(this)">Remove</button>
  `;
  ratesList.appendChild(rateDiv);
}

function saveRates() {
  const rateInputs = document.querySelectorAll('.rate-input');
  const newRates = {};
  
  rateInputs.forEach(input => {
    const email = input.querySelector('input[type="email"]').value.trim();
    const rate = parseFloat(input.querySelector('input[type="number"]').value);
    
    if (email && !isNaN(rate) && rate >= 0) {
      newRates[email] = rate;
    }
  });
  
  chrome.storage.sync.set({ customRates: newRates }, function() {
    const status = document.getElementById('status');
    status.textContent = 'Settings saved successfully!';
    status.className = 'status success';
    status.style.display = 'block';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
    
    rates = newRates;
  });
}

// Event listeners
document.getElementById('addRate').addEventListener('click', addRate);
document.getElementById('saveRates').addEventListener('click', saveRates);

// Make removeRate function global
window.removeRate = removeRate;