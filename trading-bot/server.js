/**
 * KuCoin Futures Trading Bot - Main Server
 * 
 * Features:
 * - Real-time screener with all 10 indicators
 * - Microstructure analysis (live mode)
 * - Paper trading optimizer
 * - Dynamic coin ranking
 * - HTTP API for dashboard
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const ScreenerEngine = require('./screenerEngine');
const coinList = require('./coinList');
const screenerConfig = require('./screenerConfig');

const { BuySellRatioAnalyzer, PriceRatioAnalyzer, FundingRateAnalyzer } = require('./src/microstructure');
const { PaperTradingEngine, PaperTradingEngineV2 } = require('./src/optimizer');
const SignalGeneratorV2 = require('./src/lib/SignalGeneratorV2');

class TradingServer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.port = config.port || 3000;
    this.httpServer = null;
    
    this.screener = null;
    this.paperTrader = null;
    
    this.buySellAnalyzer = new BuySellRatioAnalyzer();
    this.priceRatioAnalyzer = new PriceRatioAnalyzer();
    this.fundingAnalyzer = new FundingRateAnalyzer();
    
    this.signalGenerator = new SignalGeneratorV2({
      enhancedMode: true,
      includeMicrostructure: true
    });
    
    this.latestSignals = new Map();
    this.stats = {
      startTime: null,
      signalsGenerated: 0,
      tradesExecuted: 0
    };
  }

  async initialize() {
    console.log('[Server] Initializing...');
    
    await coinList.initialize();
    
    const symbols = coinList.getSymbols().slice(0, 20);
    const config = {
      ...screenerConfig,
      symbols
    };
    
    this.screener = new ScreenerEngine(config);
    
    this.screener.on('signal', (signal) => {
      this._handleScreenerSignal(signal);
    });
    
    this.paperTrader = new PaperTradingEngineV2({
      initialBalance: 10000,
      maxConcurrent: 5
    });
    
    if (screenerConfig.outputs?.liveMode) {
      this.buySellAnalyzer.enableLiveMode();
      this.priceRatioAnalyzer.enableLiveMode();
      this.fundingAnalyzer.enableLiveMode();
    }
    
    console.log('[Server] Initialized');
  }

  async start() {
    console.log('[Server] Starting...');
    
    this.stats.startTime = Date.now();
    
    await this.screener.start();
    
    this.paperTrader.start();
    
    this._startHttpServer();
    
    console.log(`[Server] Running on port ${this.port}`);
  }

  async stop() {
    console.log('[Server] Stopping...');
    
    if (this.screener) {
      await this.screener.stop();
    }
    
    if (this.paperTrader) {
      this.paperTrader.stop();
    }
    
    coinList.stop();
    
    if (this.httpServer) {
      this.httpServer.close();
    }
    
    console.log('[Server] Stopped');
  }

  _handleScreenerSignal(signal) {
    this.stats.signalsGenerated++;
    
    this.latestSignals.set(signal.symbol, {
      ...signal,
      receivedAt: Date.now()
    });
    
    if (this.latestSignals.size > 100) {
      const oldest = [...this.latestSignals.entries()]
        .sort((a, b) => a[1].receivedAt - b[1].receivedAt)[0];
      this.latestSignals.delete(oldest[0]);
    }
    
    this.emit('signal', signal);
  }

  _startHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });
    
    this.httpServer.listen(this.port);
  }

  _handleRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    switch (url.pathname) {
      case '/':
        this._serveIndex(res);
        break;
        
      case '/api/status':
        this._serveStatus(res);
        break;
        
      case '/api/signals':
        this._serveSignals(res);
        break;
        
      case '/api/coins':
        this._serveCoins(res);
        break;
        
      case '/api/microstructure':
        this._serveMicrostructure(res);
        break;
        
      case '/api/paper-trading':
        this._servePaperTrading(res);
        break;
        
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  }

  _serveIndex(res) {
    const dashboardV5Path = path.join(__dirname, 'dashboard-v5.html');
    const dashboardPath = path.join(__dirname, 'dashboard.html');
    const indexPath = path.join(__dirname, 'index.html');
    
    // Prefer V5 dashboard, then fallback to dashboard.html, then index.html
    const htmlPath = fs.existsSync(dashboardV5Path) ? dashboardV5Path 
                   : fs.existsSync(dashboardPath) ? dashboardPath 
                   : indexPath;
    
    if (fs.existsSync(htmlPath)) {
      const content = fs.readFileSync(htmlPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Trading Bot Dashboard</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #1a1a2e; color: #eee; }
            h1 { color: #00ff88; }
            .status { padding: 10px; background: #16213e; margin: 10px 0; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>KuCoin Futures Trading Bot</h1>
          <div class="status">
            <h3>API Endpoints:</h3>
            <ul>
              <li><a href="/api/status">/api/status</a> - Server status</li>
              <li><a href="/api/signals">/api/signals</a> - Latest signals</li>
              <li><a href="/api/coins">/api/coins</a> - Coin rankings</li>
              <li><a href="/api/microstructure">/api/microstructure</a> - Microstructure data</li>
              <li><a href="/api/paper-trading">/api/paper-trading</a> - Paper trading results</li>
            </ul>
          </div>
        </body>
        </html>
      `);
    }
  }

  _serveStatus(res) {
    const uptime = this.stats.startTime 
      ? Math.floor((Date.now() - this.stats.startTime) / 1000)
      : 0;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      uptime,
      signalsGenerated: this.stats.signalsGenerated,
      tradesExecuted: this.stats.tradesExecuted,
      coinsTracked: coinList.getSymbols().length,
      microstructureLive: this.buySellAnalyzer.isLiveMode
    }));
  }

  _serveSignals(res) {
    const signals = Array.from(this.latestSignals.values())
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .slice(0, 50);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ signals }));
  }

  _serveCoins(res) {
    const coins = coinList.getTopCoins(30);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ coins }));
  }

  _serveMicrostructure(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      buySellRatio: this.buySellAnalyzer.getResult(),
      priceRatio: this.priceRatioAnalyzer.getResult(),
      fundingRate: this.fundingAnalyzer.getResult()
    }));
  }

  _servePaperTrading(res) {
    const results = this.paperTrader.getAllResults();
    const best = this.paperTrader.getBestStrategy();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      strategies: results,
      best
    }));
  }
}

async function main() {
  const server = new TradingServer({ port: 3000 });
  
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down...');
    await server.stop();
    process.exit(0);
  });
  
  try {
    await server.initialize();
    await server.start();
  } catch (error) {
    console.error('[Server] Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = TradingServer;
