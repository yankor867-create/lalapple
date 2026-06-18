// app.js – core logic + auto welcome message via Cloudflare Worker

let currentUser = null;

function getTelegramUserId() {
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) return tg.initDataUnsafe.user.id.toString();
    let id = localStorage.getItem('temp_user_id');
    if (!id) {
        id = 'web_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        localStorage.setItem('temp_user_id', id);
    }
    return id;
}

function getTelegramUsername() {
    const tg = window.Telegram?.WebApp;
    return tg?.initDataUnsafe?.user?.username || null;
}

async function processReferral(userId, userName, userFirstName) {
    const tg = window.Telegram?.WebApp;
    let referrerId = null;
    if (tg?.initDataUnsafe?.start_param) {
        let p = tg.initDataUnsafe.start_param;
        if (p.startsWith('ref')) referrerId = p.replace('ref', '');
    }
    const urlParams = new URLSearchParams(window.location.search);
    const startapp = urlParams.get('startapp');
    if (startapp && startapp.startsWith('ref')) referrerId = startapp.replace('ref', '');
    const refParam = urlParams.get('ref');
    if (refParam) referrerId = refParam;
    if (!referrerId || referrerId === userId) return false;
    const { data: existing } = await supabase.from('users').select('referred_by').eq('id', userId).maybeSingle();
    if (existing?.referred_by) return false;
    if (localStorage.getItem(`ref_${userId}`)) return false;
    try {
        const { data: referrer, error: refErr } = await supabase.from('users').select(
            'balance, total_income, total_referrals').eq('id', referrerId).single();
        if (refErr || !referrer) return false;
        await supabase.from('users').update({
            balance: supabase.rpc('increment', { x: 50 }),
            total_income: supabase.rpc('increment', { x: 50 }),
            referred_by: referrerId
        }).eq('id', userId);
        const newRefCount = (referrer.total_referrals || 0) + 1;
        const newRefBalance = (referrer.balance || 0) + 100;
        const newRefIncome = (referrer.total_income || 0) + 100;
        await supabase.from('users').update({
            balance: newRefBalance,
            total_income: newRefIncome,
            total_referrals: newRefCount
        }).eq('id', referrerId);
        await supabase.from('referrals').insert({
            user_id: referrerId,
            referred_by: referrerId,
            referrer_user_id: referrerId,
            new_user_name: userFirstName,
            new_user_id: userId,
            join_date: new Date().toISOString(),
            timestamp: Date.now(),
            status: 'completed',
            source: 'telegram_startapp'
        });
        localStorage.setItem(`ref_${userId}`, 'processed');
        setTimeout(() => alert('🎉 রেফারেল সফল! আপনি ৫০ টাকা বোনাস পেয়েছেন!'), 1000);
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

async function loadUser() {
    const userId = getTelegramUserId();
    const tg = window.Telegram?.WebApp;
    const firstName = tg?.initDataUnsafe?.user?.first_name || 'ইউজার';
    const username = getTelegramUsername();

    let { data: user, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    const now = new Date();

    if (user) {
        currentUser = user;
    } else {
        const newUser = {
            id: userId,
            first_name: firstName,
            username: username,
            balance: 50.00,
            today_ads: 0,
            total_ads: 0,
            today_bonus_ads: 0,
            today_bonus_ads_2: 0,
            total_referrals: 0,
            total_income: 50.00,
            join_date: now.toISOString(),
            last_active: now.toISOString(),
            referred_by: null,
            last_ad_reset: now.toISOString(),
            last_bonus_ad_reset: now.toISOString(),
            last_bonus_ad_reset_2: now.toISOString()
        };
        const { data: created, error: ce } = await supabase.from('users').insert(newUser).select().single();
        currentUser = created || newUser;
        await processReferral(userId, username, firstName);
    }

    // ===== 🆕 ব্যাকগ্রাউন্ডে বটকে ওয়েলকাম মেসেজ পাঠানোর জন্য Worker-কে কল করা =====
    // URL থেকে রেফারেল আইডি বের করা
    const urlParams = new URLSearchParams(window.location.search);
    const startapp = urlParams.get('startapp');
    let referrerId = null;
    if (startapp && startapp.startsWith('ref')) {
        referrerId = startapp.replace('ref', '');
    }

    // আপনার Cloudflare Worker-এর URL (নিজেরটি বসান)
    const WORKER_URL = 'https://lalapple-bot.porcupinetiaxa6502.workers.dev/'; // ⚠️ পরিবর্তন করুন

    // ব্যাকগ্রাউন্ডে ফেচ (কোনো রেসপন্সের জন্য অপেক্ষা না করে)
    fetch(`${WORKER_URL}/send-welcome?user_id=${userId}&ref=${referrerId || ''}&name=${encodeURIComponent(firstName)}`)
        .then(res => console.log('✅ Welcome message triggered'))
        .catch(err => console.error('❌ Welcome message failed:', err));
    // ======================================================================

    updateUI();
    return currentUser;
}

function updateUI() {
    if (!currentUser) return;
    const b = currentUser.balance || 0;

    const mainBalance = document.getElementById('mainBalance');
    if (mainBalance) mainBalance.textContent = b.toFixed(2);

    const userName = document.getElementById('userName');
    if (userName) userName.textContent = currentUser.first_name || 'ইউজার';

    const totalReferrals = document.getElementById('totalReferrals');
    if (totalReferrals) totalReferrals.textContent = currentUser.total_referrals || 0;

    const totalAds = document.getElementById('totalAds');
    if (totalAds) totalAds.textContent = currentUser.total_ads || 0;

    const totalIncome = document.getElementById('totalIncome');
    if (totalIncome) totalIncome.textContent = (currentUser.total_income || 0).toFixed(2) + ' টাকা';

    const link = `https://t.me/${window.CONFIG.BOT_USERNAME || 'mishti_kumra_bot'}?startapp=ref${currentUser.id}`;
    const referralLink = document.getElementById('referralLink');
    if (referralLink) referralLink.textContent = link;

    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.style.display = 'none';

    const appContent = document.getElementById('appContent');
    if (appContent) appContent.style.display = 'block';
}

function getHourlyAdsCount() {
    const hour = new Date().getHours();
    const last = localStorage.getItem('last_ad_reset_hour');
    if (last !== null && parseInt(last) !== hour) {
        localStorage.setItem('hourly_ads_watched', '0');
        localStorage.setItem('last_ad_reset_hour', hour.toString());
    }
    if (last === null) {
        localStorage.setItem('last_ad_reset_hour', hour.toString());
        localStorage.setItem('hourly_ads_watched', '0');
    }
    return parseInt(localStorage.getItem('hourly_ads_watched') || '0');
}

function getTimeUntilNextHour() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(now.getHours() + 1, 0, 0, 0);
    const diff = Math.floor((next - now) / 60000);
    if (diff >= 60) return `${Math.floor(diff/60)}ঘ ${diff%60}মি`;
    return `${diff} মিনিট`;
}

async function addEarning(amount) {
    if (!currentUser) return { success: false };
    const hourly = parseInt(localStorage.getItem('hourly_ads_watched') || '0');
    if (hourly >= 10) return { success: false, error: 'Hourly limit' };
    const newHourly = hourly + 1;
    localStorage.setItem('hourly_ads_watched', newHourly.toString());
    const newBalance = (currentUser.balance || 0) + amount;
    const newIncome = (currentUser.total_income || 0) + amount;
    const newAds = (currentUser.total_ads || 0) + 1;
    const { error } = await supabase.from('users').update({
        balance: newBalance,
        total_income: newIncome,
        total_ads: newAds,
        last_active: new Date().toISOString()
    }).eq('id', currentUser.id);
    if (!error) {
        currentUser.balance = newBalance;
        currentUser.total_income = newIncome;
        currentUser.total_ads = newAds;
        updateUI();
        return { success: true, count: newHourly };
    }
    return { success: false, error: error?.message };
}

async function addBonusEarning(amount) {
    if (!currentUser) return { success: false };
    const hourly = parseInt(localStorage.getItem('hourly_bonus_ads_watched') || '0');
    if (hourly >= 10) return { success: false, error: 'Hourly bonus limit' };
    const newHourly = hourly + 1;
    localStorage.setItem('hourly_bonus_ads_watched', newHourly.toString());
    const newBalance = (currentUser.balance || 0) + amount;
    const newIncome = (currentUser.total_income || 0) + amount;
    const { error } = await supabase.from('users').update({
        balance: newBalance,
        total_income: newIncome,
        last_active: new Date().toISOString()
    }).eq('id', currentUser.id);
    if (!error) {
        currentUser.balance = newBalance;
        currentUser.total_income = newIncome;
        updateUI();
        return { success: true, count: newHourly };
    }
    return { success: false };
}

async function addBonus(amount) {
    if (!currentUser) return;
    const newBalance = (currentUser.balance || 0) + amount;
    const newIncome = (currentUser.total_income || 0) + amount;
    const { error } = await supabase.from('users').update({
        balance: newBalance,
        total_income: newIncome,
        last_active: new Date().toISOString()
    }).eq('id', currentUser.id);
    if (!error) {
        currentUser.balance = newBalance;
        currentUser.total_income = newIncome;
        updateUI();
    }
}

async function requestWithdraw(amount, account, method) {
    if (!currentUser) return { success: false, error: 'No user' };
    if (amount > currentUser.balance) return { success: false, error: 'Insufficient balance' };
    if ((currentUser.total_referrals || 0) < 15) return { success: false, error: 'Need 15 referrals' };
    if ((currentUser.total_ads || 0) < 50) return { success: false, error: 'Need 50 total ads' };
    let usdtAmount = null;
    if (method === 'usdt') usdtAmount = (amount / 125).toFixed(2);
    const newBalance = currentUser.balance - amount;
    await supabase.from('users').update({ balance: newBalance }).eq('id', currentUser.id);
    const timestamp = Date.now();
    const withdrawalData = {
        user_id: currentUser.id,
        user_name: currentUser.first_name,
        amount: amount,
        account_number: account,
        method: method,
        status: 'pending',
        request_date: new Date().toISOString(),
        timestamp: timestamp,
        user_ads: currentUser.total_ads,
        user_referrals: currentUser.total_referrals
    };
    if (method === 'usdt') {
        withdrawalData.usdt_amount = usdtAmount;
        withdrawalData.network = 'TRC20';
        withdrawalData.exchange_rate = 125;
    }
    const { error } = await supabase.from('withdrawals').insert(withdrawalData);
    if (!error) {
        currentUser = await loadUser();
        updateUI();
        return { success: true };
    }
    return { success: false, error: error.message };
}

async function copyReferralLink() {
    if (!currentUser) return;
    const link = `https://t.me/${window.CONFIG.BOT_USERNAME || 'mishti_kumra_bot'}?startapp=ref${currentUser.id}`;
    try {
        await navigator.clipboard.writeText(link);
        alert('✅ রেফারেল লিঙ্ক কপি হয়েছে!\n\n' + link);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('✅ রেফারেল লিঙ্ক কপি হয়েছে!\n\n' + link);
    }
}

function getCurrentUser() { return currentUser; }
function getUserData() { return currentUser; }

window.addEarning = addEarning;
window.addBonusEarning = addBonusEarning;
window.addBonus = addBonus;
window.requestWithdraw = requestWithdraw;
window.copyReferralLink = copyReferralLink;
window.getCurrentUser = getCurrentUser;
window.loadUser = loadUser;
window.getUserData = getUserData;
window.updateUI = updateUI;
window.getHourlyAdsCount = getHourlyAdsCount;
window.getTimeUntilNextHour = getTimeUntilNextHour;