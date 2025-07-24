# BuyNSell 多人股票遊戲 - 客戶端 JavaScript


// ==================== 全局變量與配置 ====================
let socket = null;
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
    // 價格顯示
    currentPrice: document.getElementById('currentPrice'),
    priceChange: document.getElementById('priceChange'),
    priceChart: document.getElementById('priceChart'),
    
    // 用戶資訊
    username: document.getElementById('username'),
    userLocation: document.getElementById('userLocation'),
    userScore: document.getElementById('userScore'),
    tradeCount: document.getElementById('tradeCount'),
    
    // 統計資訊
    onlineCount: document.getElementById('onlineCount'),
    
    // 交易按鈕
    buyBtn: document.getElementById('buyBtn'),
    sellBtn: document.getElementById('sellBtn'),
    
    // 市場情緒
    bullishBar: document.getElementById('bullishBar'),
    bearishBar: document.getElementById('bearishBar'),
    bullishCount: document.getElementById('bullishCount'),
    bearishCount: document.getElementById('bearishCount'),
    
    // 交易記錄
    tradesList: document.getElementById('tradesList'),
    
    // 排行榜
    globalTab: document.getElementById('globalTab'),
    regionTab: document.getElementById('regionTab'),
    globalList: document.getElementById('globalList'),
    regionList: document.getElementById('regionList'),
    globalLeaderboard: document.getElementById('globalLeaderboard'),
    regionLeaderboard: document.getElementById('regionLeaderboard'),
    
    // 連接狀態
    connectionStatus: document.getElementById('connectionStatus')
};

// ==================== 初始化函數 ====================
function initializeGame() {
    console.log('🎮 初始化 BuyNSell 多人股票遊戲...');
    
    // 生成隨機用戶名
    currentUser.username = generateUsername();
    elements.username.textContent = currentUser.username;
    
    // 初始化 Socket.IO 連接
    initializeSocket();
    
    // 初始化價格圖表
    initializePriceChart();
    
    // 綁定事件監聽器
    bindEventListeners();
    
    console.log('✅ 遊戲初始化完成');
}

// ==================== Socket.IO 連接管理 ====================
function initializeSocket() {
    console.log('🔌 建立 Socket.IO 連接...');
    
    socket = io({
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
    });
    
    // 連接成功
    socket.on('connect', () => {
        console.log('✅ Socket 連接成功:', socket.id);
        gameState.isConnected = true;
        updateConnectionStatus(true);
        
        // 加入遊戲
        socket.emit('join_game', {
            username: currentUser.username
        });
    });
    
    // 連接失敗
    socket.on('disconnect', (reason) => {
        console.log('❌ Socket 連接斷開:', reason);
        gameState.isConnected = false;
        updateConnectionStatus(false);
    });
    
    // 連接錯誤
    socket.on('connect_error', (error) => {
        console.error('🚨 Socket 連接錯誤:', error);
        updateConnectionStatus(false);
    });
    
    // 遊戲初始化數據
    socket.on('game_init', (data) => {
        console.log('📊 收到遊戲初始化數據:', data);
        
        gameState.currentPrice = data.currentPrice;
        gameState.priceHistory = data.priceHistory;
        currentUser.location = data.location;
        
        // 更新 UI
        updatePriceDisplay(data.currentPrice);
        updatePriceChart();
        elements.userLocation.textContent = data.location;
        elements.onlineCount.textContent = data.onlineCount;
        updateLeaderboard(data.leaderboard, data.regionRanking);
        updateMarketSentiment(data.marketSentiment);
    });
    
    // 價格更新
    socket.on('price_update', (data) => {
        console.log('💰 價格更新:', data);
        
        const oldPrice = gameState.currentPrice;
        gameState.currentPrice = data.currentPrice;
        gameState.priceHistory = data.priceHistory;
        
        updatePriceDisplay(data.currentPrice, data.priceChange);
        updatePriceChart();
        
        // 如果有最新交易，顯示在交易列表
        if (data.lastTrade) {
            addTradeToList(data.lastTrade);
        }
        
        // 價格閃爍動畫
        elements.currentPrice.classList.add('updating');
        setTimeout(() => {
            elements.currentPrice.classList.remove('updating');
        }, 500);
    });
    
    // 在線人數更新
    socket.on('online_count_update', (data) => {
        elements.onlineCount.textContent = data.count;
    });
    
    // 排行榜更新
    socket.on('leaderboard_update', (data) => {
        updateLeaderboard(data.global, data.regional);
    });
    
    // 市場情緒更新
    socket.on('sentiment_update', (sentiment) => {
        updateMarketSentiment(sentiment);
    });
}

// ==================== 價格圖表管理 ====================
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
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#ffffff',
                        font: {
                            size: 12
                        }
                    }
                }
            },
            elements: {
                point: {
                    radius: 0
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function updatePriceChart() {
    if (!priceChart) return;
    
    priceChart.data.labels = gameState.priceHistory.map((_, index) => index);
    priceChart.data.datasets[0].data = gameState.priceHistory;
    priceChart.update('none');
}

// ==================== UI 更新函數 ====================
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
        const bullishPercent = (sentiment.bullish / total) * 100;
        const bearishPercent = (sentiment.bearish / total) * 100;
        
        elements.bullishBar.style.width = `${bullishPercent}%`;
        elements.bearishBar.style.width = `${bearishPercent}%`;
    } else {
        elements.bullishBar.style.width = '0%';
        elements.bearishBar.style.width = '0%';
    }
}

function addTradeToList(trade) {
    const tradeEl = document.createElement('div');
    tradeEl.className = `trade-item ${trade.type}`;
    
    const timeStr = new Date(trade.timestamp).toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    tradeEl.innerHTML = `
        <div class="trade-user">${trade.username}</div>
        <div class="trade-details">
            ${trade.type === 'buy' ? '買入' : '賣出'} ${trade.volume}股 
            @ ${trade.price}元 → ${trade.newPrice}元 (${timeStr})
        </div>
    `;
    
    // 移除 "等待交易中..." 消息
    const noTrades = elements.tradesList.querySelector('.no-trades');
    if (noTrades) {
        noTrades.remove();
    }
    
    // 添加到列表頂部
    elements.tradesList.insertBefore(tradeEl, elements.tradesList.firstChild);
    
    // 保持最多 10 條記錄
    while (elements.tradesList.children.length > 10) {
        elements.tradesList.removeChild(elements.tradesList.lastChild);
    }
}

function updateLeaderboard(globalData, regionalData) {
    // 更新全球排行榜
    updateLeaderboardList(elements.globalList, globalData, 'global');
    
    // 更新地區排行榜
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

// ==================== 事件處理函數 ====================
function bindEventListeners() {
    // 交易按鈕
    elements.buyBtn.addEventListener('click', () => executeTrade('buy'));
    elements.sellBtn.addEventListener('click', () => executeTrade('sell'));
    
    // 排行榜切換
    elements.globalTab.addEventListener('click', () => switchLeaderboardTab('global'));
    elements.regionTab.addEventListener('click', () => switchLeaderboardTab('region'));
    
    // 鍵盤快捷鍵
    document.addEventListener('keydown', (e) => {
        if (e.key === 'b' || e.key === 'B') {
            executeTrade('buy');
        } else if (e.key === 's' || e.key === 'S') {
            executeTrade('sell');
        }
    });
}

function executeTrade(type) {
    if (!gameState.isConnected) {
        alert('請等待連接到伺服器...');
        return;
    }
    
    console.log(`🔄 執行交易: ${type}`);
    
    // 發送交易請求到伺服器
    socket.emit('trade_request', {
        type: type,
        volume: 1
    });
    
    // 更新本地統計
    currentUser.tradeCount++;
    currentUser.score += (type === 'buy' ? 1 : -1);
    
    elements.tradeCount.textContent = currentUser.tradeCount;
    elements.userScore.textContent = currentUser.score;
    
    // 按鈕動畫反饋
    const button = type === 'buy' ? elements.buyBtn : elements.sellBtn;
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
        button.style.transform = 'scale(1)';
    }, 150);
    
    // 更新市場情緒（暫時的，伺服器會發送正確的數據）
    const sentiment = type === 'buy' ? 'bull' : 'bear';
    socket.emit('sentiment_update', sentiment);
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
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function showNotification(message, type = 'info') {
    // 創建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // 添加樣式
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
    
    // 動畫顯示
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // 自動隱藏
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// ==================== 頁面載入完成後初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 頁面載入完成，啟動遊戲...');
    initializeGame();
});

// ==================== 窗口關閉前清理 ====================
window.addEventListener('beforeunload', () => {
    if (socket && socket.connected) {
        socket.disconnect();
    }
});

// ==================== 全局錯誤處理 ====================
window.addEventListener('error', (event) => {
    console.error('🚨 全局錯誤:', event.error);
    showNotification('遊戲發生錯誤，請重新整理頁面', 'error');
});

// ==================== Chart.js 簡化版本（如果 CDN 載入失敗） ====================
if (typeof Chart === 'undefined') {
    console.warn('⚠️ Chart.js 未載入，使用簡化圖表');
    
    // 簡化版圖表實作
    window.Chart = function(ctx, config) {
        this.ctx = ctx;
        this.data = config.data;
        this.options = config.options;
        
        this.update = function() {
            this.draw();
        };
        
        this.draw = function() {
            const canvas = this.ctx.canvas;
            const width = canvas.width;
            const height = canvas.height;
            
            this.ctx.clearRect(0, 0, width, height);
            
            // 簡單繪製價格線
            const data = this.data.datasets[0].data;
            if (data.length < 2) return;
            
            const maxPrice = Math.max(...data);
            const minPrice = Math.min(...data);
            const priceRange = maxPrice - minPrice || 1;
            
            this.ctx.strokeStyle = '#00d4ff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            
            data.forEach((price, index) => {
                const x = (index / (data.length - 1)) * width;
                const y = height - ((price - minPrice) / priceRange) * height;
                
                if (index === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            });
            
            this.ctx.stroke();
        };
        
        // 初始繪製
        this.draw();
    };
}
