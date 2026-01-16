/**
 * Dashboard Server - HTTP API & Real-time Updates
 *
 * Provides REST API and WebSocket for monitoring.
 * Serves status, signals, positions, and alerts.
 */

const http = require('http');
const WebSocket = require('ws');
const url = require('url');
const fs = require('fs');
const path = require('path');

class DashboardServer {
  constructor(config = {}) {
    this.port = config.port || 3000;
    this.wsPort = config.wsPort || 3001;

    // Agent references
    this.screenerAgent = config.screenerAgent;
    this.executionAgent = config.executionAgent;
    this.regimeAgent = config.regimeAgent;
    this.optimizerAgent = config.optimizerAgent;
    this.auditAgent = config.auditAgent;
    this.productionController = config.productionController;
    this.dataAgent = config.dataAgent;

    // Servers
    this.httpServer = null;
    this.wsServer = null;
    this.wsClients = new Set();

    // Broadcast interval (1 second for real-time updates)
    this.broadcastInterval = config.broadcastInterval || 1000;
    this.broadcastTimer = null;
  }

  /**
   * Start the dashboard server
   */
  start() {
    this._startHttpServer();
    this._startWebSocketServer();
    this._startBroadcast();
    console.log(`[Dashboard] HTTP server on port ${this.port}`);
    console.log(`[Dashboard] WebSocket server on port ${this.wsPort}`);
    return { ok: true };
  }

  /**
   * Stop the dashboard server
   */
  stop() {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
    }
    if (this.wsServer) {
      this.wsServer.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
    return { ok: true };
  }

  // ===========================================================================
  // HTTP SERVER
  // ===========================================================================

  _startHttpServer() {
    this.httpServer = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const parsedUrl = url.parse(req.url, true);
      const path = parsedUrl.pathname;

      // Route requests
      try {
        if (path === '/' || path === '/dashboard') {
          // Serve HTML dashboard
          const htmlPath = __dirname + '/screener-dashboard.html';
          try {
            const html = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            return;
          } catch (e) {
            this._sendJson(res, { status: 'ok', message: 'Miniature Enigma Dashboard API', dashboard: '/dashboard' });
          }
        }
        else if (path === '/status') {
          this._handleStatus(req, res);
        }
        else if (path === '/signals') {
          this._handleSignals(req, res, parsedUrl.query);
        }
        else if (path === '/positions') {
          this._handlePositions(req, res);
        }
        else if (path === '/alerts') {
          this._handleAlerts(req, res);
        }
        else if (path === '/regimes') {
          this._handleRegimes(req, res);
        }
        else if (path === '/metrics') {
          this._handleMetrics(req, res);
        }
        else if (path === '/health') {
          this._handleHealth(req, res);
        }
        else if (path === '/emergency-stop' && req.method === 'POST') {
          this._handleEmergencyStop(req, res);
        }
        else if (path === '/resume' && req.method === 'POST') {
          this._handleResume(req, res);
        }
        else if (path === '/timeframes') {
          this._handleGetTimeframes(req, res);
        }
        else if (path === '/timeframe' && req.method === 'POST') {
          this._handleSetTimeframe(req, res);
        }
        else {
          this._sendJson(res, { error: 'Not found' }, 404);
        }
      } catch (error) {
        this._sendJson(res, { error: error.message }, 500);
      }
    });

    this.httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Dashboard] Port ${this.port} in use, skipping HTTP server`);
      } else {
        console.error('[Dashboard] HTTP server error:', err.message);
      }
    });

    try {
      this.httpServer.listen(this.port);
    } catch (e) {
      console.log('[Dashboard] Could not start HTTP server:', e.message);
    }
  }

  _sendJson(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  _handleStatus(req, res) {
    const status = {
      timestamp: Date.now(),
      mode: process.env.BOT_MODE || 'paper',
      websocket: this.dataAgent?.wsConnected || false,
      scanning: this.screenerAgent?.isScanning || false,
      signals: this.screenerAgent?.getTopSignals(5) || [],
      positions: this.executionAgent?.getPositions() || {},
      balance: this.executionAgent?.getBalance() || 0
    };

    if (this.productionController) {
      status.production = this.productionController.getStatus();
    }

    this._sendJson(res, status);
  }

  _handleSignals(req, res, query) {
    const limit = parseInt(query.limit) || 20;
    const minScore = parseInt(query.minScore) || 0;

    let signals = this.screenerAgent?.getTopSignals(limit) || [];
    if (minScore > 0) {
      signals = signals.filter(s => Math.abs(s.score) >= minScore);
    }

    this._sendJson(res, {
      count: signals.length,
      signals
    });
  }

  _handlePositions(req, res) {
    const positions = this.executionAgent?.getPositions() || {};
    const history = this.executionAgent?.orderHistory?.slice(-20) || [];

    this._sendJson(res, {
      open: positions,
      history
    });
  }

  _handleAlerts(req, res) {
    if (!this.productionController?.alertManager) {
      this._sendJson(res, { active: [], history: [] });
      return;
    }

    this._sendJson(res, {
      active: this.productionController.alertManager.getActiveAlerts(),
      history: this.productionController.alertManager.getAlertHistory(50)
    });
  }

  _handleRegimes(req, res) {
    if (!this.regimeAgent) {
      this._sendJson(res, { regimes: {} });
      return;
    }

    this._sendJson(res, {
      regimes: this.regimeAgent.getAllRegimes()
    });
  }

  _handleMetrics(req, res) {
    const metrics = {
      screener: this.screenerAgent?.getStats() || {},
      execution: {
        openPositions: Object.keys(this.executionAgent?.getPositions() || {}).length,
        totalTrades: this.executionAgent?.orderHistory?.length || 0,
        balance: this.executionAgent?.getBalance() || 0
      },
      optimizer: this.optimizerAgent?.getLiveMetrics() || {},
      audit: this.auditAgent?.getMetrics() || {}
    };

    this._sendJson(res, metrics);
  }

  _handleHealth(req, res) {
    const health = {
      status: 'ok',
      components: {
        dataAgent: this.dataAgent?.wsConnected ? 'connected' : 'disconnected',
        screener: this.screenerAgent?.isScanning ? 'running' : 'stopped',
        execution: 'ready'
      }
    };

    if (this.productionController) {
      const prodStatus = this.productionController.getStatus();
      health.isEmergencyMode = prodStatus.isEmergencyMode;
      health.circuitBreakers = prodStatus.circuitBreakers?.overallHealthy ? 'healthy' : 'tripped';
    }

    this._sendJson(res, health);
  }

  _handleEmergencyStop(req, res) {
    if (this.productionController) {
      this.productionController.emergencyStop('api_request');
      this._sendJson(res, { success: true, message: 'Emergency stop triggered' });
    } else {
      this._sendJson(res, { success: false, message: 'Production controller not available' }, 400);
    }
  }

  _handleResume(req, res) {
    if (this.productionController) {
      this.productionController.resume();
      this._sendJson(res, { success: true, message: 'System resumed' });
    } else {
      this._sendJson(res, { success: false, message: 'Production controller not available' }, 400);
    }
  }

  _handleGetTimeframes(req, res) {
    if (this.screenerAgent) {
      const timeframes = this.screenerAgent.getAvailableTimeframes();
      this._sendJson(res, timeframes);
    } else {
      this._sendJson(res, { available: ['5min', '15min', '30min', '1hour', '2hour', '4hour'], active: '15min' });
    }
  }

  _handleSetTimeframe(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { timeframe } = JSON.parse(body);
        if (this.screenerAgent) {
          const result = this.screenerAgent.setTimeframe(timeframe);
          if (result.ok) {
            this._sendJson(res, { success: true, ...result.value });
          } else {
            this._sendJson(res, { success: false, error: result.error.message }, 400);
          }
        } else {
          this._sendJson(res, { success: false, message: 'Screener not available' }, 400);
        }
      } catch (e) {
        this._sendJson(res, { success: false, error: 'Invalid JSON' }, 400);
      }
    });
  }

  // ===========================================================================
  // WEBSOCKET SERVER
  // ===========================================================================

  _startWebSocketServer() {
    try {
      this.wsServer = new WebSocket.Server({ port: this.wsPort });
    } catch (e) {
      console.log('[Dashboard] Could not start WebSocket server:', e.message);
      return;
    }

    this.wsServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Dashboard] WebSocket port ${this.wsPort} in use, skipping`);
      } else {
        console.error('[Dashboard] WebSocket error:', err.message);
      }
    });

    this.wsServer.on('connection', (ws) => {
      this.wsClients.add(ws);
      console.log(`[Dashboard] WebSocket client connected (${this.wsClients.size} total)`);

      // Send initial state
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: Date.now()
      }));

      ws.on('close', () => {
        this.wsClients.delete(ws);
        console.log(`[Dashboard] WebSocket client disconnected (${this.wsClients.size} total)`);
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this._handleWsMessage(ws, data);
        } catch (e) {
          // Ignore invalid messages
        }
      });
    });
  }

  _handleWsMessage(ws, data) {
    if (data.type === 'subscribe') {
      // Handle subscription requests
      ws.subscriptions = data.channels || ['signals', 'status'];
    }
  }

  _startBroadcast() {
    this.broadcastTimer = setInterval(() => {
      this._broadcastUpdate();
    }, this.broadcastInterval);
  }

  _broadcastUpdate() {
    if (this.wsClients.size === 0) return;

    const update = {
      type: 'update',
      timestamp: Date.now(),
      signals: this.screenerAgent?.getTopSignals(10) || [],
      positions: this.executionAgent?.getPositions() || {},
      stats: this.screenerAgent?.getStats() || {},
      balance: this.executionAgent?.getBalance() || 10000
    };

    const message = JSON.stringify(update);

    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Broadcast a specific event to all clients
   */
  broadcast(type, data) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });

    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}

module.exports = DashboardServer;
