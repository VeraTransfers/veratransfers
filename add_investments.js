const fs = require('fs');
const path = './index.html';

let content = fs.readFileSync(path, 'utf8');

// Replace tab labels to English and add Investments tab
content = content.replace(
    /📊 Cuenta<\/button>/,
    '📊 Account</button>'
);
content = content.replace(
    /💸 Transferir<\/button>/,
    '💸 Transfer</button>'
);
content = content.replace(
    /📈 Crédito<\/button>/,
    '📈 Credit</button>\n                    <button class="tab-btn"        id="tabBtnInversiones" data-tab="tabInversiones" type="button" role="tab">💼 Investments</button>'
);
content = content.replace(
    /👤 Perfil<\/button>/,
    '👤 Profile</button>'
);

// Add the Investments panel content somewhere before the Profile panel
const profileTabRegex = /<!-- TAB: PERFIL -->/;
const investmentsTabHtml = `
                <!-- TAB: INVESTMENTS -->
                <div id="tabInversiones" class="tab-panel hidden">
                    <div class="panel balance-panel" style="background: linear-gradient(135deg, #3D1565, #511C87);">
                        <div class="stat-label">Total Invested Capital</div>
                        <div class="stat-value">$0.00</div>
                        <div style="margin-top:8px;font-size:13px;opacity:.8;">USD</div>
                    </div>
                    
                    <div class="panel" style="margin-top:24px;">
                        <div class="panel-title">Investment Plans</div>
                        <div style="color:#7A7682; font-size: 14px; margin-bottom: 16px;">
                            Grow your capital with our secure investment plans. Interest is paid daily.
                        </div>
                        <button class="primary-btn" onclick="alert('This feature will be available soon.')">Explore Plans</button>
                    </div>
                </div>

`;

if (!content.includes('id="tabInversiones"')) {
    content = content.replace(profileTabRegex, investmentsTabHtml + '                <!-- TAB: PERFIL -->');
}

// Translate some main dashboard things to English
content = content.replace('Este es el estado de tu cuenta VeraTransfers.', 'Here is the current status of your VeraTransfers account.');
content = content.replace('Saldo disponible', 'Available Balance');
content = content.replace('Información de cuenta', 'Account Information');
content = content.replace('Titular', 'Account Holder');
content = content.replace('Cuenta', 'Account ID');
content = content.replace('Moneda', 'Currency');
content = content.replace('Estado', 'Status');
content = content.replace('Activa', 'Active');
content = content.replace('Movimientos recientes', 'Recent Activity');
content = content.replace('Cargando movimientos...', 'Loading activity...');
content = content.replace('Mi tarjeta', 'My Card');

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully injected investments tab and translated basic UI to English.');
