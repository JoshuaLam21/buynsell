# BuyNSell 多人股票遊戲 - 後端伺服器

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const geoip = require('geoip-lite');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// ==================== 遊戲狀態 ====================
const gameState = {
  currentPrice: 100,           // 當前股價
  priceHistory: [100],         // 價格歷史
  onlineUsers: {},             // 在線用戶
  leaderboard: {},             // 排行榜
  marketSentiment: {           // 市場情緒
    bullish: 0,                // 看漲人數
    bearish: 0                 // 看空人數
  },
  recentTrades: []             // 最近交易記錄
};

// 設定靜態文件
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 工具函數 ====================
function getLocationFromIP(ip) {
  const geo = geoip.lookup(ip);
  return geo ? geo.country : '未知';
}

function updatePrice(tradeType, tradeVolume = 1) {
  // 根據交易類型和量調整價格
  const priceChange = tradeType === 'buy' ? tradeVolume : -tradeVolume;
  gameState.currentPrice = Math.max(1, gameState.currentPrice + priceChange);
  
  // 記錄價格歷史（最多保存100個）
  gameState.priceHistory.push(gameState.currentPrice);
  if (gameState.priceHistory.length > 100) {
    gameState.priceHistory.shift();
  }
}

function updateLeaderboard(username, location, scoreChange) {
  if (!gameState.leaderboard[username]) {
    gameState.leaderboard[username] = {
      score: 0,
      location: location,
      trades: 0
    };
  }
  
  gameState.leaderboard[username].score += scoreChange;
  gameState.leaderboard[username].trades += 1;
  
  // 確保分數不為負數
  if (gameState.leaderboard[username].score < 0) {
    gameState.leaderboard[username].score = 0;
  }
}

function getTopPlayers(limit = 10) {
  return Object.entries(gameState.leaderboard)
    .sort(([,a], [,b]) => b.score - a.score)
    .slice(0, limit)
    .map(([username, data]) => ({
      username,
      score: data.score,
      location: data.location,
      trades: data.trades
    }));
}

function getRegionRanking() {
  const regionScores = {};
  
  Object.entries(gameState.leaderboard).forEach(([username, data]) => {
    if (!regionScores[data.location]) {
      regionScores[data.location] = {
        totalScore: 0,
        playerCount: 0
      };
    }
    regionScores[data.location].totalScore += data.score;
    regionScores[data.location].playerCount += 1;
  });
  
  return Object.entries(regionScores)
    .sort(([,a], [,b]) => b.totalScore - a.totalScore)
    .map(([region, data]) => ({
      region,
      totalScore: data.totalScore,
      playerCount: data.playerCount,
      avgScore: Math.round(data.totalScore / data.playerCount * 100) / 100
    }));
}

// ==================== Socket.IO 連接處理 ====================
io.on('connection', (socket) => {
  console.log(`用戶連接: ${socket.id}`);
  
  // 獲取用戶IP和地理位置
  const clientIP = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || 
                   socket.handshake.headers['x-real-ip'] ||
                   socket.handshake.address || 
                   '127.0.0.1';
  const userLocation = getLocationFromIP(clientIP);
  
  // 用戶加入遊戲
  socket.on('join_game', (userData) => {
    const { username } = userData;
    
    // 註冊用戶
    gameState.onlineUsers[socket.id] = {
      username: username,
      location: userLocation,
      joinTime: Date.now(),
      sentiment: null // 'bull' 或 'bear'
    };
    
    // 發送初始化數據給新用戶
    socket.emit('game_init', {
      currentPrice: gameState.currentPrice,
      priceHistory: gameState.priceHistory,
      onlineCount: Object.keys(gameState.onlineUsers).length,
      location: userLocation,
      leaderboard: getTopPlayers(),
      regionRanking: getRegionRanking(),
      marketSentiment: gameState.marketSentiment
    });
    
    // 廣播在線人數更新
    io.emit('online_count_update', {
      count: Object.keys(gameState.onlineUsers).length
    });
    
    console.log(`${username} 加入遊戲，來自 ${userLocation}`);
  });
  
  // 處理交易請求
  socket.on('trade_request', (tradeData) => {
    const user = gameState.onlineUsers[socket.id];
    if (!user) return;
    
    const { type, volume = 1 } = tradeData; // type: 'buy' 或 'sell'
    const oldPrice = gameState.currentPrice;
    
    // 更新價格
    updatePrice(type, volume);
    
    // 更新用戶分數
    const scoreChange = type === 'buy' ? volume : -volume;
    updateLeaderboard(user.username, user.location, scoreChange);
    
    // 記錄交易
    const trade = {
      username: user.username,
      type: type,
      volume: volume,
      price: oldPrice,
      newPrice: gameState.currentPrice,
      timestamp: Date.now()
    };
    
    gameState.recentTrades.unshift(trade);
    if (gameState.recentTrades.length > 20) {
      gameState.recentTrades.pop();
    }
    
    // 廣播價格更新給所有用戶
    io.emit('price_update', {
      currentPrice: gameState.currentPrice,
      priceHistory: gameState.priceHistory,
      priceChange: gameState.currentPrice - oldPrice,
      lastTrade: trade
    });
    
    // 廣播排行榜更新
    io.emit('leaderboard_update', {
      global: getTopPlayers(),
      regional: getRegionRanking()
    });
    
    console.log(`${user.username} ${type === 'buy' ? '買入' : '賣出'} ${volume}股，價格: ${oldPrice} -> ${gameState.currentPrice}`);
  });
  
  // 處理市場情緒更新
  socket.on('sentiment_update', (sentiment) => {
    const user = gameState.onlineUsers[socket.id];
    if (!user) return;
    
    // 移除舊的情緒投票
    if (user.sentiment === 'bull') gameState.marketSentiment.bullish--;
    if (user.sentiment === 'bear') gameState.marketSentiment.bearish--;
    
    // 添加新的情緒投票
    user.sentiment = sentiment;
    if (sentiment === 'bull') gameState.marketSentiment.bullish++;
    if (sentiment === 'bear') gameState.marketSentiment.bearish++;
    
    // 廣播市場情緒更新
    io.emit('sentiment_update', gameState.marketSentiment);
  });
  
  // 用戶斷線處理
  socket.on('disconnect', () => {
    const user = gameState.onlineUsers[socket.id];
    if (user) {
      // 移除情緒投票
      if (user.sentiment === 'bull') gameState.marketSentiment.bullish--;
      if (user.sentiment === 'bear') gameState.marketSentiment.bearish--;
      
      console.log(`${user.username} 離開遊戲`);
      delete gameState.onlineUsers[socket.id];
      
      // 廣播在線人數更新
      io.emit('online_count_update', {
        count: Object.keys(gameState.onlineUsers).length
      });
      
      // 廣播市場情緒更新
      io.emit('sentiment_update', gameState.marketSentiment);
    }
  });
});

// ==================== 啟動伺服器 ====================
server.listen(PORT, () => {
  console.log(`==========================================`);
  console.log(`🚀 BuyNSell 多人股票遊戲伺服器已啟動`);
  console.log(`📍 端口: ${PORT}`);
  console.log(`🌐 本地訪問: http://localhost:${PORT}`);
  console.log(`==========================================`);
});

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('伺服器正在關閉...');
  server.close(() => {
    console.log('伺服器已關閉');
    process.exit(0);
  });
});
