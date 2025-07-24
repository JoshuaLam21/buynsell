import seedrandom from "https://cdn.skypack.dev/seedrandom";

/* ──────────────────────
Roguelite Stock Simulator
──────────────────────── */
class RogueStock {
  constructor() {
    this.seed = new URLSearchParams(location.search).get("seed") ||
      (Math.floor(Math.random() * 90000) + 10000).toString();
    this.rng = seedrandom(this.seed);
    this.meta = { coins: parseInt(localStorage.getItem("coins") || "0") };

    this.cfg = {
      initCash: 10000,
      posSize: 100,
      baseMu: 0.0003,
      sigma: 0.02 + this.rng() * 0.02,
      jumpProb: 0.02 + this.rng() * 0.05,
      newsBias: 0.05 + this.rng() * 0.1,
      tickMs: 600,
      gameSec: 60,
      newsSec: 20,
      marginRate: 0.5
    };

    this.eventPool = [
      {txt:"央行降息 → 大漲",        eff:+2,  cat:"policy"},
      {txt:"地震衝擊供應鏈 → 大跌",  eff:-2,  cat:"disaster"},
      {txt:"AI 晶片突破 → 科技樂觀",  eff:+1.6,cat:"tech"},
      {txt:"做空機構發唱空報告",     eff:-1,  cat:"short"},
      {txt:"石油減產 → 通膨擔憂",    eff:+1,  cat:"macro"},
      {txt:"量化基金爆倉 → 市場劇震",eff:-1.8,cat:"panic"}
    ];

    this.$ = id => document.getElementById(id);
    this.bindDom();
    this.bindMenuButtons();
    this.showSeed();
    this.showIdleUI();     // !! 頁面載入初始狀態
  }

  // 僅初始化 UI，不啟動任何遊戲與倒數
  showIdleUI() {
    this.$("btn-start").classList.remove("hidden");
    this.$("btn-restart").classList.add("hidden");
    this.$("btn-share").classList.add("hidden");
    this.$("gameOverModal").classList.add("hidden");
    // Reset各種狀態顯示
    this.$("stockPrice").textContent = "$100.00";
    this.$("priceChange").textContent = "+0.00";
    this.$("cashAmount").textContent = "$10000";
    this.$("positionAmount").textContent = "0";
    this.$("totalAsset").textContent = "$10000";
    this.$("pnlAmount").textContent = "$0";
    this.$("priceArrow").textContent = "—";
    this.$("eventsContainer").innerHTML = "<p>Click Start to begin your run!</p>";
  }
  showSeed() {
    this.$("seedInfo").textContent = `Seed #${this.seed}`;
  }
  bindDom() {
    ["stockPrice", "priceChange", "priceArrow", "cashAmount",
      "positionAmount", "totalAsset", "pnlAmount", "eventsContainer"]
      .forEach(id => this[id] = this.$(id));
    this.$("buyButton").onclick = () => this.trade("buy");
    this.$("shortButton").onclick = () => this.trade("short");
    this.$("btn-share").onclick = () => this.copyShareLink();
  }
  bindMenuButtons() {
    this.$("btn-start").onclick = () => this.start();
    this.$("btn-restart").onclick = () => this.start();
    this.$("playAgainButton").onclick = () => this.start();
  }

  /* ===== 遊戲開始 ===== */
  start() {
    // 初始化
    clearInterval(this.gameT); clearInterval(this.priceT); clearInterval(this.newsT);
    this.state = {
      playing: true,
      time: this.cfg.gameSec,
      newsLeft: this.cfg.newsSec,
      cash: this.cfg.initCash,
      shares: 0,
      posType: null,
      posPrice: 0,
      price: 100,
      prev: 100,
      events: [],
      margin: 0,
      currentEvent: null
    };
    // 開始狀態切換
    this.$("btn-start").classList.add("hidden");
    this.$("btn-restart").classList.remove("hidden");
    this.$("btn-share").classList.remove("hidden", "blink");
    this.$("btn-share").textContent = "🔗 Share Seed";
    this.$("gameOverModal").classList.add("hidden");
    this.spawnEvent(true);
    this.refreshPrice(true);
    this.refreshPortfolio();
    this.refreshButtons();
    this.runTimers();
  }

  runTimers() {
    this.gameT = setInterval(() => {
      if (--this.state.time <= 0) {
        this.end(); clearInterval(this.gameT);
      }
    }, 1000);
    this.priceT = setInterval(() => this.updatePrice(), this.cfg.tickMs);
    this.newsT = setInterval(() => {
      if (--this.state.newsLeft <= 0) {
        this.spawnEvent();
        this.state.newsLeft = this.cfg.newsSec;
      }
    }, 1000);
  }

  updatePrice() {
    const dt = this.cfg.tickMs / 1000 / 3600;
    let mu = this.cfg.baseMu + (this.state.currentEvent?.eff || 0) * this.cfg.newsBias;
    const sig = this.cfg.sigma;
    const rndN = this.boxMuller();
    const jump = (this.rng() < this.cfg.jumpProb)
      ? 1 + (this.rng() - 0.5) * 0.05 : 1;
    const pct = mu * dt + sig * Math.sqrt(dt) * rndN;
    this.state.prev = this.state.price;
    this.state.price = Math.max(0.5, this.state.price * (1 + pct) * jump);
    if (this.state.posType === "short") {
      const loss = (this.state.posPrice - this.state.price) * this.cfg.posSize;
      if (loss > this.state.margin) { this.forcedCover(); }
    }
    this.refreshPrice();
    this.refreshPortfolio();
  }
  boxMuller() {
    let u = 0, v = 0; while (u === 0) u = this.rng(); while (v === 0) v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  spawnEvent(initial = false) {
    if (initial) this.eventsContainer.innerHTML = "";
    const ev = this.eventPool[Math.floor(this.rng() * this.eventPool.length)];
    this.state.currentEvent = ev;
    const d = document.createElement("p");
    d.textContent = ev.txt; d.className = ev.eff > 0 ? "positive" : "negative";
    this.eventsContainer.prepend(d);
    while (this.eventsContainer.children.length > 8)
      this.eventsContainer.removeChild(this.eventsContainer.lastChild);
  }

  trade(action) {
    if (!this.state.playing) return;
    if (action === "buy") this.state.shares === 0 ? this.openLong() : this.closeLong();
    if (action === "short") this.state.shares === 0 ? this.openShort() : this.closeShort();
    this.refreshPortfolio();
    this.refreshButtons();
  }
  openLong() {
    const cost = this.state.price * this.cfg.posSize;
    if (this.state.cash < cost) { this.log("💸現金不足"); return; }
    this.state.cash -= cost;
    this.state.shares = +this.cfg.posSize;
    this.state.posType = "long"; this.state.posPrice = this.state.price;
  }
  closeLong() {
    this.state.cash += this.state.price * this.state.shares;
    this.resetPos();
  }
  openShort() {
    const margin = this.state.price * this.cfg.posSize * this.cfg.marginRate;
    if (this.state.cash < margin) { this.log("💸保證金不足"); return; }
    this.state.cash -= margin;
    this.state.margin = margin;
    this.state.shares = -this.cfg.posSize;
    this.state.posType = "short";
    this.state.posPrice = this.state.price;
  }
  closeShort() {
    const cost = this.state.price * Math.abs(this.state.shares);
    const pnl = this.state.margin - cost;
    this.state.cash += this.state.margin + pnl;
    this.resetPos();
  }
  forcedCover() {
    this.log("💥 爆倉強制回補！");
    this.closeShort();
  }
  resetPos() {
    this.state.shares = 0; this.state.posType = null; this.state.posPrice = 0; this.state.margin = 0;
  }
  /* calcTotalAsset 不會和 state 屬性重名 */
  calcTotalAsset() {
    return this.state.cash + this.calcPnL() + (this.state.shares > 0 ? this.state.price * this.state.shares : 0);
  }
  refreshPortfolio() {
    const pnl = this.calcPnL(), tot = this.calcTotalAsset();
    this.cashAmount.textContent = `$${this.state.cash.toFixed(0)}`;
    this.positionAmount.textContent = this.state.shares;
    this.totalAsset.textContent = `$${tot.toFixed(0)}`;
    this.pnlAmount.textContent = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`;
    this.pnlAmount.className = pnl > 0 ? "pnl-positive" : pnl < 0 ? "pnl-negative" : "pnl-neutral";
  }
  calcPnL() {
    if (this.state.shares === 0) return 0;
    if (this.state.posType === "long")
      return (this.state.price - this.state.posPrice) * this.state.shares;
    return (this.state.posPrice - this.state.price) * Math.abs(this.state.shares);
  }
  refreshPrice(first = false) {
    if (first) {
      this.stockPrice.textContent = "$100.00";
      this.priceChange.textContent = "+0.00";
      this.priceArrow.textContent = "—";
      this.stockPrice.className = "";
      this.priceChange.className = "positive";
      return;
    }
    const diff = this.state.price - this.state.prev;
    this.stockPrice.textContent = `$${this.state.price.toFixed(2)}`;
    this.priceChange.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`;
    this.stockPrice.className = diff > 0 ? "price-up" : diff < 0 ? "price-down" : "";
    this.priceArrow.textContent = diff > 0 ? "▲" : diff < 0 ? "▼" : "—";
    this.priceChange.className = diff > 0 ? "positive" : diff < 0 ? "negative" : "";
  }
  refreshButtons() {
    const buy = this.$("buyButton"), sh = this.$("shortButton");
    if (this.state.shares === 0) {
      buy.className = "btn btn--trading btn--buy";
      buy.querySelector(".btn-text").textContent = "Buy";
      sh.className = "btn btn--trading btn--short";
      sh.querySelector(".btn-text").textContent = "Short";
      buy.disabled = sh.disabled = false;
    } else if (this.state.posType === "long") {
      buy.className = "btn btn--trading btn--sell";
      buy.querySelector(".btn-text").textContent = "Sell";
      sh.disabled = true;
    } else {
      sh.className = "btn btn--trading btn--cover";
      sh.querySelector(".btn-text").textContent = "Cover";
      buy.disabled = true;
    }
  }
  /* ==== 結算 Game Over ===== */
  end() {
    clearInterval(this.gameT); clearInterval(this.priceT); clearInterval(this.newsT);
    this.state.playing = false;
    const total = this.calcTotalAsset(); const pnl = total - this.cfg.initCash;
    const gain = Math.max(0, Math.floor(pnl / 1000));
    this.meta.coins += gain; localStorage.setItem("coins", this.meta.coins);
    this.$("finalAsset").textContent = `$${total.toFixed(0)}`;
    this.$("finalPnL").textContent = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)}`;
    this.$("metaEarn").textContent = `+${gain}`;
    this.$("gameOverModal").classList.remove("hidden");
    this.$("btn-share").classList.add("blink");
  }
  copyShareLink() {
    navigator.clipboard.writeText(`${location.origin}${location.pathname}?seed=${this.seed}`)
      .then(() => { this.$("btn-share").textContent = "✔ Copied"; });
  }
  log(msg) { console.log(msg); }
}
window.addEventListener("DOMContentLoaded", () => new RogueStock());
