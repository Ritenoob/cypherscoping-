# KuCoin API Integration

Comprehensive patterns for integrating KuCoin Futures API including authentication, rate limiting, WebSocket management, and order execution.

## Authentication (HMAC SHA256)

### Signature Generation

KuCoin requires HMAC-SHA256 signatures on all authenticated requests:

```typescript
// Message format: timestamp + method + endpoint + body
const message = timestamp + method.toUpperCase() + endpoint + body;

// Generate signature
const signature = crypto
  .createHmac('sha256', apiSecret)
  .update(message)
  .digest('base64');
```

### Required Headers

| Header | Description | Example |
|--------|-------------|---------|
| `KC-API-KEY` | Your API key | `6745a8c...` |
| `KC-API-SIGN` | HMAC-SHA256 signature (base64) | `dGVzdA==...` |
| `KC-API-TIMESTAMP` | Unix timestamp in milliseconds | `1703001234567` |
| `KC-API-PASSPHRASE` | Encrypted passphrase (v2) or plain (v1) | `dGVzdA==...` |
| `KC-API-KEY-VERSION` | API version (`2` recommended) | `2` |
| `Content-Type` | Always `application/json` | `application/json` |

### Passphrase Encryption (API v2)

```typescript
// API v2 requires HMAC-encrypted passphrase
const encryptedPassphrase = crypto
  .createHmac('sha256', apiSecret)
  .update(passphrase)
  .digest('base64');

// API v1 uses plain passphrase
const passphraseValue = apiVersion === '2' ? encryptedPassphrase : passphrase;
```

### Complete Authentication Implementation

```typescript
class APICredentials {
  generateSignature(timestamp: string, method: string, endpoint: string, body: string = ''): string {
    const message = timestamp + method.toUpperCase() + endpoint + body;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('base64');
  }

  getAuthHeaders(method: string, endpoint: string, body: string = ''): Record<string, string> {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, endpoint, body);

    // Encrypt passphrase for v2
    const passphrase = this.apiVersion === '2'
      ? crypto.createHmac('sha256', this.apiSecret).update(this.passphrase).digest('base64')
      : this.passphrase;

    return {
      'KC-API-KEY': this.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphrase,
      'KC-API-KEY-VERSION': this.apiVersion,
      'Content-Type': 'application/json'
    };
  }
}
```

### Security Best Practices

- **IP Whitelisting**: API keys with trading permissions MUST be IP-whitelisted
- **Time Sync**: Server time must be within ±30s of KuCoin servers (use `/api/v1/timestamp`)
- **Key Rotation**: Keys expire after 30 days of inactivity
- **Environment Variables**: Never hardcode credentials

```bash
KUCOIN_API_KEY=your_key
KUCOIN_API_SECRET=your_secret
KUCOIN_API_PASSPHRASE=your_passphrase
KUCOIN_API_VERSION=2
```

---

## Rate Limiting

### Resource Pools and Quotas

KuCoin uses resource pools with point-based quotas:

| Pool | VIP0 Quota | VIP5 Quota | VIP12 Quota |
|------|------------|------------|-------------|
| Spot | 4000 pts/30s | 16000 pts/30s | 40000 pts/30s |
| Futures | 2000 pts/30s | 7000 pts/30s | 20000 pts/30s |
| Public (Market Data) | 2000 pts/30s | 2000 pts/30s | 2000 pts/30s |

### Endpoint Weights

**Futures Endpoints:**
- Place Order: 2 points
- Batch Place Orders: 20 points (max 20 orders)
- Cancel Order: 1 point
- Cancel All Orders: 30 points
- Query Order: 2 points
- Get Ticker: 1 point
- Get Funding Rate: 2 points
- Get Open Interest: 20 points
- Get Klines: 3 points

**Spot Endpoints:**
- Place Order: 1 point
- Cancel Order: 1 point
- Cancel All Orders: 30 points
- Get Ticker Stats: 15 points
- Order Book: 1-3 points (depends on depth)

### Rate Limit Headers

```typescript
// Response headers indicate limits
const rateLimitRemaining = response.headers['gw-ratelimit-remaining'];
const rateLimitLimit = response.headers['gw-ratelimit-limit'];
const rateLimitReset = response.headers['gw-ratelimit-reset'];
```

### Rate Limiting Strategies

#### 1. Simple Throttling

```typescript
class RateLimiter {
  private lastRequest = 0;
  private minInterval = 100; // ms between requests

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;

    if (elapsed < this.minInterval) {
      await new Promise(r => setTimeout(r, this.minInterval - elapsed));
    }

    this.lastRequest = Date.now();
  }
}

// Usage
await rateLimiter.throttle();
const response = await apiRequest();
```

#### 2. Token Bucket Algorithm

```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,    // Max tokens (e.g., 2000 for Futures)
    private refillRate: number,  // Tokens per second
    private refillInterval = 30000 // Refill window in ms
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async consume(points: number): Promise<boolean> {
    this.refill();

    if (this.tokens >= points) {
      this.tokens -= points;
      return true;
    }

    // Calculate wait time
    const tokensNeeded = points - this.tokens;
    const waitMs = (tokensNeeded / this.refillRate) * 1000;

    await new Promise(r => setTimeout(r, waitMs));
    this.refill();
    this.tokens -= points;
    return true;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.refillInterval) {
      this.tokens = this.capacity;
      this.lastRefill = now;
    }
  }
}

// Usage
const futuresBucket = new TokenBucket(2000, 2000 / 30); // 2000 points per 30s
await futuresBucket.consume(2); // Place order (2 points)
```

#### 3. Exponential Backoff (429 Handling)

```typescript
async function requestWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limited
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage
const order = await requestWithBackoff(() =>
  client.placeOrder({ symbol: 'ETHUSDTM', side: 'buy', size: 1 })
);
```

### WebSocket Rate Limits

- **Max Connections**: 800 per user (classic) or 256 per IP (unified)
- **Connection Rate**: 30 connections/min per user
- **Message Rate**: 100 messages per 10s per connection
- **Max Topics**: 400 per connection (spot), unlimited (futures)

---

## WebSocket Connection Management

### Connection Workflow

```typescript
// 1. Obtain WebSocket token
const tokenResponse = await axios.post(
  'https://api-futures.kucoin.com/api/v1/bullet-private',
  {},
  { headers: authHeaders }
);

const { token, instanceServers } = tokenResponse.data.data;
const server = instanceServers[0];
const wsUrl = `${server.endpoint}?token=${token}`;

// 2. Connect to WebSocket
const ws = new WebSocket(wsUrl);

// 3. Handle ping/pong
const pingInterval = server.pingInterval; // Usually 18000ms
const pingTimeout = server.pingTimeout;   // Usually 10000ms

setInterval(() => {
  ws.send(JSON.stringify({ id: Date.now(), type: 'ping' }));
}, pingInterval);
```

### Reconnection Pattern with Exponential Backoff

```typescript
class KuCoinWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000;
  private pingTimer: NodeJS.Timeout | null = null;

  async connect(): Promise<void> {
    try {
      // Get token
      const { token, endpoint, pingInterval } = await this.getToken();

      // Connect
      this.ws = new WebSocket(`${endpoint}?token=${token}`);

      this.ws.on('open', () => {
        console.log('[WS] Connected');
        this.reconnectAttempts = 0;
        this.startPing(pingInterval);
      });

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'pong') {
          // Pong received, connection alive
        } else {
          this.handleMessage(msg);
        }
      });

      this.ws.on('close', () => {
        console.log('[WS] Disconnected');
        this.stopPing();
        this.reconnect();
      });

      this.ws.on('error', (error) => {
        console.error('[WS] Error:', error);
      });

    } catch (error) {
      console.error('[WS] Connection failed:', error);
      this.reconnect();
    }
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      60000 // Max 60s
    ) + Math.random() * 1000; // Add jitter

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    await new Promise(r => setTimeout(r, delay));

    this.connect();
  }

  private startPing(interval: number): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ id: Date.now(), type: 'ping' }));
      }
    }, interval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  subscribe(topic: string): void {
    const msg = {
      id: Date.now(),
      type: 'subscribe',
      topic,
      privateChannel: true,
      response: true
    };

    this.ws?.send(JSON.stringify(msg));
  }
}
```

### Subscription Topics

**Private Channels:**

```typescript
// Order updates
ws.subscribe('/contractMarket/tradeOrders');        // All symbols
ws.subscribe('/contractMarket/tradeOrders:ETHUSDTM'); // Specific symbol

// Position updates
ws.subscribe('/contract/positionAll');              // All positions
ws.subscribe('/contract/position:ETHUSDTM');        // Specific symbol
```

**Public Channels:**

```typescript
// Market data
ws.subscribe('/contractMarket/ticker:ETHUSDTM');    // Ticker
ws.subscribe('/contractMarket/level2:ETHUSDTM');    // Order book
ws.subscribe('/contractMarket/execution:ETHUSDTM'); // Trades
ws.subscribe('/contractMarket/level2Depth5:ETHUSDTM'); // L2 depth
```

### Sequence Number Handling

```typescript
private lastSequence: number = -1;

handleMessage(msg: any): void {
  if (msg.subject === 'orderChange' || msg.subject === 'positionChange') {
    const currentSeq = msg.sn || msg.sequence;

    if (this.lastSequence !== -1 && currentSeq !== this.lastSequence + 1) {
      console.warn('[WS] Sequence gap detected, resyncing...');
      this.resyncState();
    }

    this.lastSequence = currentSeq;
  }
}

async resyncState(): Promise<void> {
  // Fetch current state via REST
  const orders = await this.client.getActiveOrders();
  const positions = await this.client.getAllPositions();

  // Update local state
  this.syncOrders(orders);
  this.syncPositions(positions);
}
```

---

## Order Execution Patterns

### 1. Idempotent Order Placement

```typescript
async placeOrderIdempotent(params: OrderParams): Promise<Order> {
  // Generate deterministic clientOid for idempotency
  const clientOid = params.clientOid || `bot_${params.symbol}_${Date.now()}`;

  try {
    const order = await this.placeOrder({ ...params, clientOid });
    return order;
  } catch (error) {
    // Check if order already exists
    if (error.code === '400100' || error.message.includes('duplicate')) {
      const existing = await this.getOrderByClientOid(clientOid);
      if (existing) {
        console.log('[Order] Idempotent retry - order exists:', clientOid);
        return existing;
      }
    }
    throw error;
  }
}

async getOrderByClientOid(clientOid: string): Promise<Order | null> {
  try {
    return await this._request('GET', `/api/v1/orders/byClientOid?clientOid=${clientOid}`);
  } catch (error) {
    return null;
  }
}
```

### 2. Market Order with Stop Loss & Take Profit

```typescript
async openLongWithProtection(params: {
  symbol: string;
  size: number;
  leverage: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}): Promise<{ entry: Order; stopLoss?: Order; takeProfit?: Order }> {
  const { symbol, size, leverage, stopLossPrice, takeProfitPrice } = params;

  // Place entry order
  const entry = await this.placeMarketOrder({
    symbol,
    side: 'buy',
    size,
    leverage,
    clientOid: `entry_${symbol}_${Date.now()}`
  });

  const orders: any = { entry };

  // Place stop loss
  if (stopLossPrice) {
    orders.stopLoss = await this.placeStopOrder({
      symbol,
      side: 'sell',
      size,
      stopPrice: stopLossPrice,
      stopPriceType: 'TP', // Trade price
      type: 'market',
      reduceOnly: true,
      clientOid: `sl_${entry.orderId}_${Date.now()}`
    });
  }

  // Place take profit
  if (takeProfitPrice) {
    orders.takeProfit = await this.placeStopOrder({
      symbol,
      side: 'sell',
      size,
      stopPrice: takeProfitPrice,
      stopPriceType: 'TP',
      type: 'market',
      reduceOnly: true,
      clientOid: `tp_${entry.orderId}_${Date.now()}`
    });
  }

  return orders;
}
```

### 3. Batch Order Placement

```typescript
async placeBatchOrders(orders: OrderParams[]): Promise<BatchResult> {
  // KuCoin allows max 20 orders per batch
  const batches = [];
  for (let i = 0; i < orders.length; i += 20) {
    batches.push(orders.slice(i, i + 20));
  }

  const results = [];
  for (const batch of batches) {
    const result = await this._request('POST', '/api/v1/orders/multi', batch);
    results.push(result);
  }

  return {
    success: results.flatMap(r => r.data || []),
    failed: results.flatMap(r => r.errors || [])
  };
}
```

### 4. Order Modification (Cancel & Replace)

```typescript
async modifyOrder(orderId: string, newParams: Partial<OrderParams>): Promise<Order> {
  // KuCoin doesn't support direct modification, must cancel & replace
  const existing = await this.getOrder(orderId);

  // Cancel existing
  await this.cancelOrder(orderId);

  // Place new order with modified params
  const newOrder = await this.placeOrder({
    ...existing,
    ...newParams,
    clientOid: `mod_${orderId}_${Date.now()}`
  });

  return newOrder;
}
```

---

## Position and Account Reconciliation

### Reconciliation Pattern

```typescript
class StateReconciler {
  private positions = new Map<string, Position>();
  private orders = new Map<string, Order>();

  async reconcile(): Promise<void> {
    // Fetch authoritative state from API
    const [apiPositions, apiOrders] = await Promise.all([
      this.client.getAllPositions(),
      this.client.getActiveOrders()
    ]);

    // Detect discrepancies
    const discrepancies = this.findDiscrepancies(apiPositions, apiOrders);

    if (discrepancies.length > 0) {
      console.warn('[Reconcile] Found discrepancies:', discrepancies);

      // Update local state to match API
      this.syncPositions(apiPositions);
      this.syncOrders(apiOrders);

      // Log for audit
      this.auditLog('reconciliation', { discrepancies, timestamp: Date.now() });
    }
  }

  private findDiscrepancies(apiPositions: Position[], apiOrders: Order[]): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];

    // Check positions
    for (const apiPos of apiPositions) {
      const localPos = this.positions.get(apiPos.symbol);

      if (!localPos) {
        discrepancies.push({ type: 'missing_position', symbol: apiPos.symbol });
      } else if (localPos.currentQty !== apiPos.currentQty) {
        discrepancies.push({
          type: 'position_mismatch',
          symbol: apiPos.symbol,
          local: localPos.currentQty,
          remote: apiPos.currentQty
        });
      }
    }

    // Check orders
    for (const apiOrder of apiOrders) {
      const localOrder = this.orders.get(apiOrder.orderId);

      if (!localOrder) {
        discrepancies.push({ type: 'missing_order', orderId: apiOrder.orderId });
      } else if (localOrder.status !== apiOrder.status) {
        discrepancies.push({
          type: 'order_status_mismatch',
          orderId: apiOrder.orderId,
          local: localOrder.status,
          remote: apiOrder.status
        });
      }
    }

    return discrepancies;
  }

  // Schedule periodic reconciliation
  startPeriodicReconciliation(intervalMs = 60000): void {
    setInterval(() => this.reconcile(), intervalMs);
  }
}
```

### Balance Tracking

```typescript
class BalanceTracker {
  private balance = 0;
  private equity = 0;
  private unrealizedPnL = 0;

  async update(): Promise<void> {
    const account = await this.client.getAccountOverview();

    this.balance = parseFloat(account.availableBalance);
    this.equity = parseFloat(account.accountEquity);
    this.unrealizedPnL = parseFloat(account.unrealisedPNL);

    // Check for discrepancies
    const calculatedEquity = this.balance + this.unrealizedPnL;
    const diff = Math.abs(calculatedEquity - this.equity);

    if (diff > 0.01) {
      console.warn('[Balance] Equity mismatch - calculated:', calculatedEquity, 'actual:', this.equity);
    }
  }
}
```

---

## Common API Errors and Solutions

| Error Code | Message | Solution |
|------------|---------|----------|
| `400100` | Duplicate clientOid | Use unique clientOid or check existing order |
| `200004` | Balance insufficient | Check available balance before trading |
| `300000` | Order size below minimum | Increase order size to meet contract minimum |
| `400760` | Position risk limit exceeded | Reduce position size or increase margin |
| `411100` | User are frozen | Contact KuCoin support |
| `429` | Rate limit exceeded | Implement exponential backoff |
| `401` | Invalid signature | Check signature generation and time sync |
| `400350` | Timestamp expired | Sync server time within ±30s |

### Error Handling Pattern

```typescript
async function executeWithErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T | null> {
  try {
    return await operation();
  } catch (error: any) {
    const code = error.response?.data?.code || error.code;
    const msg = error.response?.data?.msg || error.message;

    // Recoverable errors
    if (code === '400100') {
      console.warn(`[${operationName}] Duplicate order, checking existing...`);
      // Handle duplicate
      return null;
    }

    if (code === '200004') {
      console.error(`[${operationName}] Insufficient balance`);
      // Reduce position size or skip
      return null;
    }

    if (error.response?.status === 429) {
      console.warn(`[${operationName}] Rate limited, backing off...`);
      throw new RateLimitError(msg);
    }

    // Unrecoverable errors
    console.error(`[${operationName}] Fatal error:`, code, msg);
    throw error;
  }
}
```

---

## Testing with Sandbox

### Sandbox Configuration

```typescript
const SANDBOX_BASE_URL = 'https://api-sandbox-futures.kucoin.com';
const SANDBOX_WS_URL = 'wss://ws-api-sandbox-futures.kucoin.com';

class KuCoinClient {
  constructor(config: { useSandbox?: boolean }) {
    this.baseUrl = config.useSandbox
      ? SANDBOX_BASE_URL
      : 'https://api-futures.kucoin.com';
  }
}

// Usage
const sandboxClient = new KuCoinClient({ useSandbox: true });
```

### Environment Switching

```bash
# .env.sandbox
KUCOIN_API_KEY=sandbox_key
KUCOIN_API_SECRET=sandbox_secret
KUCOIN_API_PASSPHRASE=sandbox_passphrase
USE_SANDBOX=true

# .env.production
KUCOIN_API_KEY=prod_key
KUCOIN_API_SECRET=prod_secret
KUCOIN_API_PASSPHRASE=prod_passphrase
USE_SANDBOX=false
```

---

## References

- **Official Docs**: https://www.kucoin.com/docs/beginners/introduction
- **Futures API**: https://www.kucoin.com/docs/rest/futures-trading
- **WebSocket**: https://www.kucoin.com/docs/websocket/basic-info
- **Rate Limits**: https://www.kucoin.com/docs/rest/rate-limit
- **Universal SDK**: https://github.com/Kucoin/kucoin-universal-sdk
- **Sandbox**: https://sandbox.kucoin.com

---

## Quick Reference Card

```typescript
// Authentication
const headers = {
  'KC-API-KEY': apiKey,
  'KC-API-SIGN': hmacSha256(timestamp + method + endpoint + body),
  'KC-API-TIMESTAMP': Date.now().toString(),
  'KC-API-PASSPHRASE': hmacSha256(passphrase), // v2 only
  'KC-API-KEY-VERSION': '2'
};

// Rate Limiting
await rateLimiter.throttle();  // Simple throttle
await tokenBucket.consume(2);  // Token bucket

// WebSocket
const { token, endpoint } = await getToken();
const ws = new WebSocket(`${endpoint}?token=${token}`);

// Orders
await client.placeMarketOrder({ symbol, side, size, leverage });
await client.placeStopOrder({ symbol, side, size, stopPrice, reduceOnly: true });

// Reconciliation
await reconciler.reconcile();  // Periodic sync
```
