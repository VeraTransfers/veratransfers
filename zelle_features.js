const fs = require('fs');
const path = './index.html';

let content = fs.readFileSync(path, 'utf8');

const transferPanelRegex = /<div class="panel-title">Transferencia interna<\/div>[\s\S]*?<div id="transferResult" class="transfer-result hidden"><\/div>\s*<\/div>/;

const zelleTransferHtml = `<div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Send & Request Money</span>
                            <button type="button" style="background:none; border:none; font-size:24px; cursor:pointer;" onclick="document.getElementById('qrModal').classList.remove('hidden')">📱</button>
                        </div>

                        <p style="color:#69756f;font-size:14px;margin-top:0;">
                            Fast, safe and easy way to send and request money.
                        </p>

                        <div style="display:flex; gap:12px; margin-bottom: 24px;">
                            <button type="button" id="zelleSendBtn" style="flex:1; background:#511C87; color:white; border:none; padding:14px; border-radius:12px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow: 0 4px 12px rgba(81, 28, 135, 0.2);">Send</button>
                            <button type="button" id="zelleRequestBtn" style="flex:1; background:#fff; color:#511C87; border:2px solid #511C87; padding:14px; border-radius:12px; font-weight:bold; font-size:16px; cursor:pointer;">Request</button>
                        </div>

                        <form id="transferForm" class="transfer-form">

                            <div class="form-group">
                                <label for="transferDestination">Recipient (Email, Phone or Account ID)</label>
                                <input
                                    id="transferDestination"
                                    type="text"
                                    placeholder="Name, @cashtag, or VT-000001"
                                    required
                                >
                            </div>

                            <div class="form-group">
                                <label for="transferAmount">Amount</label>
                                <div style="position:relative;">
                                    <span style="position:absolute; left:14px; top:14px; font-weight:bold; color:#1D1A21;">$</span>
                                    <input
                                        id="transferAmount"
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        placeholder="0.00"
                                        style="padding-left:30px; font-size: 18px; font-weight:bold;"
                                        required
                                    >
                                </div>
                            </div>

                            <div class="form-group">
                                <label for="transferDescription">What's this for?</label>
                                <input
                                    id="transferDescription"
                                    type="text"
                                    placeholder="Add a note"
                                >
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    class="profile-save-btn"
                                    id="transferBtn"
                                    style="background:#511C87;"
                                >
                                    Review & Send
                                </button>
                            </div>

                        </form>

                        <div id="transferResult" class="transfer-result hidden"></div>
                    </div>`;

content = content.replace(transferPanelRegex, zelleTransferHtml);

// Translate the ATM section
content = content.replace('Retiro en Cajero (ATM)', 'Cardless ATM Withdrawal');
content = content.replace('Retira dinero en efectivo desde cualquier cajero afiliado usando un código de seguridad de 6 dígitos. Sin usar tarjeta.', 'Withdraw cash at any partner ATM using a secure 6-digit code. No card needed.');
content = content.replace('Monto a retirar', 'Withdrawal Amount');
content = content.replace('Generar código de retiro', 'Generate Withdrawal Code');
content = content.replace('Tu código de retiro es:', 'Your withdrawal code is:');
content = content.replace('Válido por 30 minutos. Ingrésalo en la pantalla del cajero automático.', 'Valid for 30 minutes. Enter it on the ATM screen.');

// Add QR Modal
const qrModalHtml = `
    <!-- QR MODAL -->
    <div id="qrModal" class="modal-overlay hidden" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; justify-content:center; align-items:center;">
        <div style="background:#fff; border-radius:24px; width:90%; max-width:400px; padding:30px; text-align:center; position:relative;">
            <button type="button" onclick="document.getElementById('qrModal').classList.add('hidden')" style="position:absolute; top:15px; right:20px; background:none; border:none; font-size:24px; cursor:pointer; color:#1D1A21;">&times;</button>
            <h2 style="margin-top:0; color:#511C87;">My QR Code</h2>
            <p style="color:#69756f; font-size:14px; margin-bottom:24px;">Show this code to receive money instantly.</p>
            <div style="background:#F7F8FA; padding:20px; border-radius:16px; display:inline-block; margin-bottom:20px;">
                <!-- Simulated QR Code SVG -->
                <svg width="200" height="200" viewBox="0 0 100 100">
                    <rect width="100" height="100" fill="white"/>
                    <!-- QR patterns -->
                    <rect x="10" y="10" width="20" height="20" fill="#511C87"/>
                    <rect x="15" y="15" width="10" height="10" fill="white"/>
                    <rect x="70" y="10" width="20" height="20" fill="#511C87"/>
                    <rect x="75" y="15" width="10" height="10" fill="white"/>
                    <rect x="10" y="70" width="20" height="20" fill="#511C87"/>
                    <rect x="15" y="75" width="10" height="10" fill="white"/>
                    <path d="M40 10h20v10H40zm0 20h10v20H40zm20 10h20v10H60zm-20 20h20v20H40zm-10 10h10v10H30z" fill="#511C87"/>
                    <rect x="70" y="50" width="10" height="10" fill="#511C87"/>
                    <rect x="80" y="70" width="10" height="10" fill="#511C87"/>
                    <rect x="50" y="70" width="10" height="10" fill="#511C87"/>
                    <circle cx="50" cy="50" r="10" fill="#511C87"/>
                </svg>
            </div>
            <div style="font-weight:bold; font-size:18px;" id="qrAccountHolder">Account Name</div>
            <div style="color:#69756f; font-size:14px; margin-top:5px;" id="qrAccountId">VT-000000</div>
        </div>
    </div>
`;

if (!content.includes('id="qrModal"')) {
    content = content.replace('<!-- Toast notifications -->', qrModalHtml + '\n    <!-- Toast notifications -->');
}

// Add JS to populate QR modal
const qrJs = `
            // Populate QR Modal
            if (state.user && state.user.role === 'client') {
                const qrHolder = document.getElementById('qrAccountHolder');
                const qrId = document.getElementById('qrAccountId');
                if (qrHolder) qrHolder.textContent = state.user.name;
                if (qrId) qrId.textContent = state.user.account_id;
            }
`;
if (!content.includes('Populate QR Modal')) {
    content = content.replace('function loadClientAccount() {', 'function loadClientAccount() {' + qrJs);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated Transfer tab to match Zelle layout and added QR code.');
