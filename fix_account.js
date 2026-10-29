const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Fix the QR Account ID
content = content.replace("if (qrId) qrId.textContent = state.user.account_id;", "if (qrId && state.account) qrId.textContent = 'VT-' + String(state.account.id).padStart(6, '0');");

// Fix the account number display
content = content.replace("account.account_number ? account.account_number : ('#' + account.id);", "account.account_number ? account.account_number : ('VT-' + String(account.id).padStart(6, '0'));");

fs.writeFileSync('index.html', content, 'utf8');
console.log('Fixed account IDs');
