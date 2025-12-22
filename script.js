// Features: VPS API Simulation, House Revenue Logic, Admin Dashboard Access

const API_URL = 'http://YOUR_VPS_IP:3000'; // Change this to your live server URL
const IS_PRODUCTION = false; // Set to true when you deploy your server.js

const CONFIG = {
    COMPANY_ACCOUNTS: {
        'SyriaCash': '0993000111 (مركز الشحن الرئيسي)',
        'ShamCash': '0988111222 (محفظة أرباح AR)',
        'Electronic': '7000111222 (بنك الدفع الإلكتروني)'
    },
    MIN_DEP: 10000,
    MAX_DEP: 500000,
    MULTIPLIERS: [100, 32, 4, 0, 1, 2, 8, 16, 64, "retry"],

    // NEW WEIGHTS: Index 3 (*0) is now 12 (was 4). 
    // Adjusted others slightly to keep balance ~100 range.
    WEIGHTS: [2, 8, 20, 12, 10, 20, 15, 8, 5, 5]
};

// --- ADMIN CREDENTIALS ---
// Use this to login and check your "House Revenue"
const ADMIN_CREDS = {
    email: 'admin@ar-game.com',
    pass: 'AdminPass2025' // Default password
};

let currentUser = null;
let currentBet = 5000;
let pendingTxn = null;

// --- Network Monitor ---
const NetworkMonitor = {
    init: () => {
        window.addEventListener('online', NetworkMonitor.updateStatus);
        window.addEventListener('offline', NetworkMonitor.updateStatus);
        NetworkMonitor.updateStatus();
    },
    updateStatus: () => {
        const isOnline = navigator.onLine;
        const overlay = document.getElementById('offline-overlay');
        if (overlay) overlay.style.display = isOnline ? 'none' : 'flex';
    },
    checkQuery: () => {
        if (!navigator.onLine) {
            alert('خطأ في الاتصال: يرجى التحقق من الإنترنت.');
            return false;
        }
        return true;
    }
};

// --- Initialization ---
function init() {
    NetworkMonitor.init();
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(() => { });
    }

    $('login-form').addEventListener('submit', doLogin);
    $('register-form').addEventListener('submit', doRegister);
    $('show-register-btn').onclick = () => showAuth('register');
    $('show-login-btn').onclick = () => showAuth('login');
    $('demo-btn').onclick = startDemo;
    $('logout-btn').onclick = logout;

    $('increase-bet').onclick = () => adjustBet(5000);
    $('decrease-bet').onclick = () => adjustBet(-5000);
    $('drop-ball-btn').onclick = playRound;

    $('open-bank-btn').onclick = openBanking;
    $('.close-modal-btn').onclick = closeBanking;

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.onclick = () => switchView(btn.dataset.view);
    });

    const zone = $('upload-zone');
    if (zone) {
        zone.onclick = () => $('file-proof').click();
        $('file-proof').onchange = (e) => {
            if (e.target.files[0]) {
                zone.innerHTML = `<div style="color:#10b981; font-size:2rem">✓</div><p>${e.target.files[0].name}</p>`;
            }
        };
    }

    checkAutoLogin();
}

// --- Auth System ---
function getUsers() {
    return JSON.parse(localStorage.getItem('ar_users') || '[]');
}

function saveUser(u) {
    if (!NetworkMonitor.checkQuery()) return;
    const users = getUsers();
    const idx = users.findIndex(x => x.email === u.email);
    if (idx >= 0) users[idx] = u;
    else users.push(u);
    localStorage.setItem('ar_users', JSON.stringify(users));
}

function getUser(email) {
    // If asking for admin, return simulated admin from DB if exists
    return getUsers().find(u => u.email === email);
}

function doRegister(e) {
    e.preventDefault();
    if (!NetworkMonitor.checkQuery()) return;

    showLoading(true);
    setTimeout(() => {
        showLoading(false);
        const email = $('email').value;
        if (getUser(email)) return alert('البريد مسجل مسبقاً');

        const user = {
            firstName: $('firstName').value,
            lastName: $('lastName').value,
            email: email,
            password: $('password').value,
            balance: 0,
            transactions: [],
            id: 'U-' + Math.floor(Math.random() * 100000)
        };
        saveUser(user);
        alert('تم تسجيل الحساب على السيرفر.');
        showAuth('login');
    }, 1500);
}

function doLogin(e) {
    e.preventDefault();
    if (!NetworkMonitor.checkQuery()) return;

    showLoading(true);
    setTimeout(() => {
        showLoading(false);
        const email = $('loginIdentifier').value;
        const pass = $('loginPassword').value;

        // --- ADMIN BYPASS ---
        if (email === ADMIN_CREDS.email && pass === ADMIN_CREDS.pass) {
            let admin = getUser(email);
            if (!admin) {
                // First time admin login -> Seed account
                admin = {
                    firstName: 'System', lastName: 'Admin',
                    email: email, password: pass,
                    balance: 0, role: 'admin', id: 'ADMIN-001', transactions: []
                };
                saveUser(admin);
            }
            localStorage.setItem('ar_last_user', email);
            loginUser(admin);
            alert('Welcome Admin! You are now viewing the Master Wallet.');
            return;
        }
        // --------------------

        const user = getUser(email);

        if (user && user.password === pass) {
            localStorage.setItem('ar_last_user', email);
            loginUser(user);
        } else {
            alert('بيانات خاطئة أو الحساب غير موجود');
        }
    }, 1500);
}

function loginUser(user) {
    currentUser = user;
    $('auth-overlay').style.display = 'none';
    $('game-ui').style.display = 'flex';

    // Admin Visuals
    if (user.role === 'admin') {
        $('user-name').innerHTML = `👑 ADMIN <span style="font-size:0.7rem;color:#f00">(MASTER MODE)</span>`;
    } else {
        $('user-name').textContent = user.firstName;
    }

    $('account-id').textContent = `ID: ${user.id}`;

    const badge = document.createElement('span');
    badge.textContent = '● Online';
    badge.style.color = '#10b981';
    badge.style.fontSize = '0.7rem';
    badge.style.marginLeft = '5px';
    $('user-name').appendChild(badge);

    updateBalanceUI();
    renderBoard();
}

function startDemo() {
    if (!NetworkMonitor.checkQuery()) return;
    currentUser = { firstName: 'Guest', id: 'DEMO', balance: 50000, isDemo: true, transactions: [] };
    loginUser(currentUser);
}

function checkAutoLogin() {
    if (!navigator.onLine) return;
    const saved = localStorage.getItem('ar_last_user');
    if (saved) {
        setTimeout(() => {
            const user = getUser(saved);
            if (user) loginUser(user);
        }, 1000);
    }
}

function logout() {
    localStorage.removeItem('ar_last_user');
    location.reload();
}

function showLoading(show) {
    const btn = document.querySelector('.submit-btn');
    if (btn) btn.textContent = show ? 'جاري الاتصال...' : (btn.classList.contains('neon') ? 'تسجيل' : 'دخولآمن');
}

// --- Banking Portal ---
function openBanking() {
    if (!NetworkMonitor.checkQuery()) return;
    if (currentUser.isDemo) return alert('غير متاح للحساب التجريبي');
    $('banking-modal').style.display = 'flex';
    updateBalanceUI();
    switchView('deposit');
}

function closeBanking() {
    $('banking-modal').style.display = 'none';
}

function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    $(`view-${viewName}`).style.display = 'block';
    document.querySelector(`.nav-item[data-view="${viewName}"]`).classList.add('active');
    if (viewName === 'history') renderHistory();
    if (viewName === 'deposit') goToDepositStep(1);
}

function startDeposit(method) {
    pendingTxn = { method: method };
    $('company-account').textContent = CONFIG.COMPANY_ACCOUNTS[method];
    goToDepositStep(2);
}

function goToDepositStep(step) {
    document.querySelectorAll('.step-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    $(`deposit-step-${step}`).style.display = 'block';
    for (let i = 0; i < step; i++) document.querySelectorAll('.step')[i].classList.add('active');
}

function submitDeposit() {
    if (!NetworkMonitor.checkQuery()) return;
    const amount = Number($('dep-amount').value);
    const sender = $('dep-sender').value;
    if (!amount || amount < CONFIG.MIN_DEP) return alert('المبلغ غير صحيح');
    if (!sender) return alert('أدخل رقم الحساب');

    const txn = { id: 'TX-' + Date.now(), type: 'deposit', amount: amount, method: pendingTxn.method, status: 'pending', date: new Date().toLocaleString() };
    currentUser.transactions.unshift(txn);
    saveUser(currentUser);
    alert('تم رفع الطلب للسيرفر المركزي. جاري التحقق...');
    closeBanking();

    setTimeout(() => {
        if (!navigator.onLine) return;
        txn.status = 'success';
        currentUser.balance += amount;
        saveUser(currentUser);
        updateBalanceUI();
        alert(`تم استلام إيداع بقيمة ${amount} SYP`);
    }, 4000);
}

function submitWithdraw() {
    if (!NetworkMonitor.checkQuery()) return;
    const amount = Number($('with-amount').value);
    if (!amount || amount > currentUser.balance) return alert('رصيد غير كاف');
    const account = $('with-account').value;
    if (!account) return alert('أدخل رقم الحساب المستلم');
    const txn = { id: 'WT-' + Date.now(), type: 'withdraw', amount: amount, method: $('width-method').value, account: account, status: 'pending', date: new Date().toLocaleString() };
    currentUser.balance -= amount;
    currentUser.transactions.unshift(txn);
    saveUser(currentUser);
    updateBalanceUI();
    alert('تم إرسال طلب السحب.');
    closeBanking();
    setTimeout(() => { if (navigator.onLine) { txn.status = 'success'; saveUser(currentUser); } }, 6000);
}

function renderHistory() {
    const list = $('trans-list');
    list.innerHTML = '';
    const txs = currentUser.transactions || [];
    if (!txs.length) list.innerHTML = '<p style="text-align:center;color:#666">لا توجد عمليات</p>';
    txs.forEach(tx => {
        const div = document.createElement('div');
        div.className = 'txn-item';
        let statusBadge = tx.status === 'pending' ? '<span class="status-badge pending">قيد المعالجة</span>' : '<span class="status-badge success">تم بنجاح</span>';
        const isDep = tx.type === 'deposit' || tx.type === 'revenue'; // Revenue shows as green for admin
        const color = isDep ? '#10b981' : '#ef4444';
        const sign = isDep ? '+' : '-';
        div.innerHTML = `<div><div style="font-weight:bold">${tx.type.toUpperCase()}</div><small>${tx.date}</small></div>
            <div style="text-align:left"><div style="color:${color};font-weight:bold">${sign} ${tx.amount.toLocaleString()}</div>${statusBadge}</div>`;
        list.appendChild(div);
    });
}

// --- Game Logic ---
function updateBalanceUI() {
    const bal = currentUser.balance.toLocaleString();
    $('balance-amount').textContent = bal;
    $('portal-balance').textContent = bal + ' SYP';
}

function adjustBet(delta) {
    let next = currentBet + delta;
    if (next >= 5000) {
        currentBet = next;
        $('current-bet').textContent = next;
    }
}

function playRound() {
    if (!NetworkMonitor.checkQuery()) return;
    if (currentUser.balance < currentBet) return alert('رصيد غير كاف');

    currentUser.balance -= currentBet;
    updateBalanceUI();

    let r = Math.random() * CONFIG.WEIGHTS.reduce((a, b) => a + b, 0);
    let idx = 0;
    for (let i = 0; i < CONFIG.WEIGHTS.length; i++) {
        r -= CONFIG.WEIGHTS[i];
        if (r <= 0) { idx = i; break; }
    }
    spawnBall(idx);
}

function spawnBall(targetIdx) {
    const ball = document.createElement('div');
    ball.className = 'game-ball';
    ball.style.left = '50%';
    ball.style.top = '0';
    $('plinko-board-container').appendChild(ball);
    const targetLeft = 5 + (targetIdx * 10);
    const anim = ball.animate([
        { top: '0%', left: '50%' },
        { top: '30%', left: `${50 + (Math.random() * 10 - 5)}%` },
        { top: '60%', left: `${targetLeft + (Math.random() * 5 - 2.5)}%` },
        { top: '90%', left: `${targetLeft}%` }
    ], { duration: 1500, fill: 'forwards' });

    anim.onfinish = () => { ball.remove(); processWin(targetIdx); };
}

function processWin(idx) {
    if (!navigator.onLine) return;
    const mult = CONFIG.MULTIPLIERS[idx];

    // Flash bucket
    const bucket = document.querySelectorAll('.bucket')[idx];
    if (bucket) { bucket.style.background = '#ffffff40'; setTimeout(() => bucket.style.background = '#1e293b', 300); }

    if (mult === 'retry') {
        currentUser.balance += currentBet;
        showFloat('REFUND');
    } else if (mult === 0) {
        // --- PROFIT DIVERSION (House Edge) ---
        // 1. User Loses: Balance already deducted
        showFloat(`-${currentBet}`, '#ef4444');

        // 2. Transfer to Admin Wallet
        const admin = getUser(ADMIN_CREDS.email);
        if (admin) {
            admin.balance += currentBet;
            admin.transactions.unshift({
                id: 'REV-' + Date.now(), type: 'revenue', amount: currentBet,
                date: new Date().toLocaleString(), status: 'success'
            });
            saveUser(admin);
            console.log(`[SERVER] ${currentBet} SYP diverted to Admin Wallet`);
        }
    } else {
        const win = currentBet * mult;
        currentUser.balance += win;
        showFloat(`+${win}`);
    }
    updateBalanceUI();
    if (!currentUser.isDemo) saveUser(currentUser);
}

function showFloat(txt, color = '#10b981') {
    const el = document.createElement('div');
    el.textContent = txt;
    el.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2rem;color:${color};font-weight:bold;z-index:200`;
    $('plinko-board-container').appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

function renderBoard() {
    const b = $('plinko-board');
    b.innerHTML = '';
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c <= r; c++) {
            const p = document.createElement('div');
            p.className = 'peg';
            p.style.top = `${10 + r * 8}%`;
            p.style.left = `${50 + (c - r / 2) * 8}%`;
            b.appendChild(p);
        }
    }
    const buckets = $('betting-sections');
    buckets.innerHTML = '';
    CONFIG.MULTIPLIERS.forEach((m, i) => {
        const d = document.createElement('div');
        d.className = 'bucket';
        d.innerHTML = `<span>x${m}</span>`;
        if (m === 'retry') d.innerHTML = '<span>↺</span>';
        const clrs = ['#f87171', '#fb923c', '#facc15', '#a3e635', '#10b981', '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6'];
        d.style.borderBottom = `3px solid ${clrs[i]}`;
        buckets.appendChild(d);
    });
}

// Utils
const $ = (id) => document.getElementById(id);
const showAuth = (mode) => {
    $('login-form-container').style.display = mode === 'login' ? 'block' : 'none';
    $('register-form-container').style.display = mode === 'register' ? 'block' : 'none';
};

window.onload = init;
