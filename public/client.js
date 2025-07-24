// ==================== 全局變量與配置 ====================
let ws = null;
let currentUser = {
    username: '',
    location: '',
    score: 0,
    tradeCount: 0
};
let priceChart = null;
let gameState = {
    currentPrice: 100,
    priceHistory: [100],
    isConnected: false
};

// ==================== DOM 元素引用 ====================
const elements = {
    currentPrice: document.getElementById('currentPrice'),
    priceChange: document.getElementById('priceChange'),
    priceChart: document.getElementById('priceChart'),
    username: document.getElementById('username'),
    userLocation: document.getElementById('userLocation'),
    userScore: document.getElementById('userScore'),
    tradeCount: document.getElementById('tradeCount'),
    onlineCount: document.getElementById('onlineCount'),
    buyBtn: document.getElementById('buyBtn'),
    sellBtn: document.getElementById('sellBtn'),
    bullishBar: document.getElementById('bullishBar'),
    bearishBar: document.getElementById('bearishBar'),
    bullishCount: document.getElementById('bullishCount'),
    bearishCount: document.getElementById('bearishCount'),
    tradesList: document.getElementById('tradesList'),
    globalTab: document.getElementById('globalTab'),
    regionTab: document.getElementById('regionTab'),
    globalList: document.getElementById('globalList'),
    regionList: document.getElementById('regionList'),
    globalLeaderboard: document.getElementById('globalLeaderboard'),
    regionLeaderboard: document.getElementById('regionLeaderboard'),
    connectionStatus: document.getElementById('connectionStatus')
};

// ==================== 初始化 ====================
function initializeGame() {
    console.log('🎮 初始化 BuyNSell 多人股票遊戲...');
    currentUser.username = generateUsername();
    elements.username.textContent = currentUser.username;
    initializeSocket();
    initializePriceChart();
    bindEventListeners();
    console.log('✅ 遊戲初始化完成');
}

// ==================== WebSocket連線與接收 ====================
function initializeSocket() {
    console.log('🔌 建立 WebSocket 連接...');
    ws = new WebSocket("wss://cloudflare-ws-demo.joshuallamhy.workers.dev");
    ws.onopen = () => {
        console.log('✅ 已連線');
        gameState.isConnected = true;
        updateConnectionStatus(true);
        wsSendJSON({
            action: "join_game",
            username: currentUser.username
        });
    };
    ws.onclose = () => {
        console.log('❌ WS 關閉');
        gameState.isConnected = false;
        updateConnectionStatus(false);
    };
    ws.onerror = err => {
        console.error('🚨 WS 連線錯誤:', err);
        updateConnectionStatus(false);
    };
    ws.onmessage = (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            console.log("收到訊息:", event.data);
            return;
        }
        switch (data.action) {
            case "game_init":
                gameState.currentPrice = data.currentPrice;
                gameState.priceHistory = data.priceHistory;
                currentUser.location = data.location;
                updatePriceDisplay(data.currentPrice);
                updatePriceChart();
                elements.userLocation.textContent = data.location;
                elements.onlineCount.textContent = data.onlineCount;
                updateLeaderboard(data.leaderboard, data.regionRanking);
                updateMarketSentiment(data.marketSentiment);
                break;
            case "price_update":
                gameState.currentPrice = data.currentPrice;
                gameState.priceHistory = data.priceHistory;
                updatePriceDisplay(data.currentPrice, data.priceChange);
                updatePriceChart();
                if (data.lastTrade) addTradeToList(data.lastTrade);
                elements.currentPrice.classList.add('updating');
                setTimeout(() => elements.currentPrice.classList.remove('updating'), 500);
                break;
            case "online_count_update":
                elements.onlineCount.textContent = data.count;
                break;
            case "leaderboard_update":
                updateLeaderboard(data.global, data.regional);
                break;
            case "sentiment_update":
                updateMarketSentiment(data.sentiment);
                break;
            default:
                console.log("未知action:", data);
        }
    };
}

// JSON格式安全發送
function wsSendJSON(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

// ==================== Chart.js圖表 ====================
function initializePriceChart() {
    const ctx = elements.priceChart.getContext('2d');
    priceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: gameState.priceHistory.map((_, index) => index),
            datasets: [{
                label: '股價',
                data: gameState.priceHistory,
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#ffffff', font: { size: 12 } }
                }
            }
        }
    });
}

function updatePriceChart() {
    if (!priceChart) return;
    priceChart.data.labels = gameState.priceHistory.map((_, idx) => idx);
    priceChart.data.datasets[0].data = gameState.priceHistory;
    priceChart.update('none');
}

// ==================== UI 更新 ====================
function updatePriceDisplay(price, change = null) {
    elements.currentPrice.textContent = price.toFixed(0);
    if (change !== null) {
        const changeText = change >= 0 ? `+${change.toFixed(1)}` : change.toFixed(1);
        elements.priceChange.textContent = changeText;
        elements.priceChange.className = change >= 0 ? 'price-change positive' : 'price-change negative';
    }
}
function updateConnectionStatus(isConnected) {
    const statusEl = elements.connectionStatus;
    const statusText = statusEl.querySelector('.status-text');
    if (isConnected) {
        statusEl.className = 'status-indicator connected';
        statusText.textContent = '已連接';
    } else {
        statusEl.className = 'status-indicator disconnected';
        statusText.textContent = '連接中...';
    }
}
function updateMarketSentiment(sentiment) {
    const total = sentiment.bullish + sentiment.bearish;
    elements.bullishCount.textContent = sentiment.bullish;
    elements.bearishCount.textContent = sentiment.bearish;
    if (total > 0) {
        elements.bullishBar.style.width = `${(sentiment.bullish / total) * 100}%`;
        elements.bearishBar.style.width = `${(sentiment.bearish / total) * 100}%`;
    } else {
        elements.bullishBar.style.width = '0%';
        elements.bearishBar.style.width = '0%';
    }
}
function addTradeToList(trade) {
    const tradeEl = document.createElement('div');
    tradeEl.className = `trade-item ${trade.type}`;
    const timeStr = new Date(trade.timestamp).toLocaleTimeString('zh-TW', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    tradeEl.innerHTML = `
        <div class="trade-user">${trade.username}</div>
        <div class="trade-details">
            ${trade.type === 'buy' ? '買入' : '賣出'} ${trade.volume}股 
            @ ${trade.price}元 → ${trade.newPrice}元 (${timeStr})
        </div>
    `;
    const noTrades = elements.tradesList.querySelector('.no-trades');
    if (noTrades) noTrades.remove();
    elements.tradesList.insertBefore(tradeEl, elements.tradesList.firstChild);
    while (elements.tradesList.children.length > 10) {
        elements.tradesList.removeChild(elements.tradesList.lastChild);
    }
}
function updateLeaderboard(globalData, regionalData) {
    updateLeaderboardList(elements.globalList, globalData, 'global');
    updateLeaderboardList(elements.regionList, regionalData, 'regional');
}
function updateLeaderboardList(container, data, type) {
    if (!data || data.length === 0) {
        container.innerHTML = '<div class="loading">暫無數據</div>';
        return;
    }
    const html = data.map((item, index) => {
        const rank = index + 1;
        let rankClass = '';
        if (rank === 1) rankClass = 'top1';
        else if (rank === 2) rankClass = 'top2';
        else if (rank === 3) rankClass = 'top3';
        if (type === 'global') {
            return `
                <div class="rank-item">
                    <div class="rank-number ${rankClass}">${rank}</div>
                    <div class="rank-info">
                        <div class="rank-name">${item.username}</div>
                        <div class="rank-location">${item.location} • ${item.trades}筆交易</div>
                    </div>
                    <div class="rank-score">${item.score}</div>
                </div>
            `;
        } else {
            return `
                <div class="rank-item">
                    <div class="rank-number ${rankClass}">${rank}</div>
                    <div class="rank-info">
                        <div class="rank-name">${item.region}</div>
                        <div class="rank-location">${item.playerCount}位玩家 • 平均${item.avgScore}分</div>
                    </div>
                    <div class="rank-score">${item.totalScore}</div>
                </div>
            `;
        }
    }).join('');
    container.innerHTML = html;
}

// ==================== 按鈕/鍵盤事件 ====================
function bindEventListeners() {
    elements.buyBtn.addEventListener('click', () => executeTrade('buy'));
    elements.sellBtn.addEventListener('click', () => executeTrade('sell'));
    elements.globalTab.addEventListener('click', () => switchLeaderboardTab('global'));
    elements.regionTab.addEventListener('click', () => switchLeaderboardTab('region'));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'b' || e.key === 'B') { executeTrade('buy'); }
        else if (e.key === 's' || e.key === 'S') { executeTrade('sell'); }
    });
}
function executeTrade(type) {
    if (!gameState.isConnected) {
        alert('請等待連接到伺服器...');
        return;
    }
    wsSendJSON({
        action: "trade_request",
        tradeType: type,
        username: currentUser.username
    });
    currentUser.tradeCount++;
    currentUser.score += (type === 'buy' ? 1 : -1);
    elements.tradeCount.textContent = currentUser.tradeCount;
    elements.userScore.textContent = currentUser.score;
    const button = type === 'buy' ? elements.buyBtn : elements.sellBtn;
    button.style.transform = 'scale(0.95)';
    setTimeout(() => { button.style.transform = 'scale(1)'; }, 150);
    wsSendJSON({
        action: "sentiment_update",
        sentiment: type === 'buy' ? 'bull' : 'bear'
    });
}
function switchLeaderboardTab(tab) {
    if (tab === 'global') {
        elements.globalTab.classList.add('active');
        elements.regionTab.classList.remove('active');
        elements.globalLeaderboard.classList.add('active');
        elements.regionLeaderboard.classList.remove('active');
    } else {
        elements.regionTab.classList.add('active');
        elements.globalTab.classList.remove('active');
        elements.regionLeaderboard.classList.add('active');
        elements.globalLeaderboard.classList.remove('active');
    }
}

// ==================== 工具函數 ====================
function generateUsername() {
    const adjectives = ['聰明的', '勇敢的', '幸運的', '富有的', '智慧的', '快速的', '精明的', '穩重的'];
    const nouns = ['投資者', '交易員', '玩家', '股神', '散戶', '大戶', '新手', '高手'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 1000);
    return `${adj}${noun}${number}`;
}
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('zh-TW', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        border-left: 4px solid ${type === 'success' ? '#4ade80' : type === 'error' ? '#f87171' : '#00d4ff'};
    `;
    document.body.appendChild(notification);
    setTimeout(() => { notification.style.transform = 'translateX(0)'; }, 100);
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => { document.body.removeChild(notification); }, 300);
    }, 3000);
}

// ==================== 頁面載入完成後初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 頁面載入完成，啟動遊戲...');
    initializeGame();
});
// ...其他錯誤監聽/離線管理照常...
window.addEventListener('error', (event) => {
    console.error('🚨 全局錯誤:', event.error);
    showNotification('遊戲發生錯誤，請重新整理頁面', 'error');
});
