"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WilliamsRIndicator = void 0;
const events_1 = require("events");
class WilliamsRIndicator extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.highs = [];
        this.lows = [];
        this.closes = [];
        this.fastHighs = [];
        this.fastLows = [];
        this.wrHistory = [];
        this.priceHistory = [];
        this.oversoldBars = 0;
        this.overboughtBars = 0;
        this.currentValue = null;
        this.prevValue = null;
        this.fastValue = null;
        this.prevFastValue = null;
        this.period = config.period || 14;
        this.fastPeriod = config.fastPeriod || 7;
        this.oversoldLevel = config.oversold || -80;
        this.overboughtLevel = config.overbought || -20;
        this.maxHistory = config.historyLength || 100;
    }
    update(candle) {
        const { high, low, close } = candle;
        this.prevValue = this.currentValue;
        this.prevFastValue = this.fastValue;
        this.highs.push(high);
        this.lows.push(low);
        this.closes.push(close);
        if (this.highs.length > this.period) {
            this.highs.shift();
        }
        if (this.lows.length > this.period) {
            this.lows.shift();
        }
        if (this.closes.length > this.period) {
            this.closes.shift();
        }
        this.fastHighs.push(high);
        this.fastLows.push(low);
        if (this.fastHighs.length > this.fastPeriod) {
            this.fastHighs.shift();
        }
        if (this.fastLows.length > this.fastPeriod) {
            this.fastLows.shift();
        }
        if (this.highs.length < this.period) {
            return this.getResult();
        }
        const highestHigh = Math.max(...this.highs);
        const lowestLow = Math.min(...this.lows);
        const range = highestHigh - lowestLow;
        this.currentValue = range === 0 ? -50 : ((highestHigh - close) / range) * -100;
        if (this.fastHighs.length >= this.fastPeriod) {
            const fastHH = Math.max(...this.fastHighs);
            const fastLL = Math.min(...this.fastLows);
            const fastRange = fastHH - fastLL;
            this.fastValue = fastRange === 0 ? -50 : ((fastHH - close) / fastRange) * -100;
        }
        if (this.currentValue < this.oversoldLevel) {
            this.oversoldBars++;
            this.overboughtBars = 0;
        }
        else if (this.currentValue > this.overboughtLevel) {
            this.overboughtBars++;
            this.oversoldBars = 0;
        }
        else {
            this.oversoldBars = 0;
            this.overboughtBars = 0;
        }
        this.wrHistory.push(this.currentValue);
        this.priceHistory.push(close);
        if (this.wrHistory.length > this.maxHistory) {
            this.wrHistory.shift();
        }
        if (this.priceHistory.length > this.maxHistory) {
            this.priceHistory.shift();
        }
        return this.getResult();
    }
    getResult() {
        return {
            value: this.currentValue,
            fastValue: this.fastValue,
            oversoldBars: this.oversoldBars,
            overboughtBars: this.overboughtBars,
            signals: this.getSignals()
        };
    }
    getCrossover() {
        if (this.prevValue === null || this.currentValue === null)
            return null;
        if (this.prevValue <= this.oversoldLevel && this.currentValue > this.oversoldLevel) {
            const strength = this.oversoldBars > 3 ? 'very_strong' : 'strong';
            return {
                type: 'bullish_crossover',
                direction: 'bullish',
                strength,
                message: `Williams %R crossed above ${this.oversoldLevel} (oversold reversal after ${this.oversoldBars} bars)`,
                metadata: { from: this.prevValue, to: this.currentValue, barsInZone: this.oversoldBars }
            };
        }
        if (this.prevValue >= this.overboughtLevel && this.currentValue < this.overboughtLevel) {
            const strength = this.overboughtBars > 3 ? 'very_strong' : 'strong';
            return {
                type: 'bearish_crossover',
                direction: 'bearish',
                strength,
                message: `Williams %R crossed below ${this.overboughtLevel} (overbought reversal after ${this.overboughtBars} bars)`,
                metadata: { from: this.prevValue, to: this.currentValue, barsInZone: this.overboughtBars }
            };
        }
        return null;
    }
    getFailureSwing() {
        if (this.wrHistory.length < 10)
            return null;
        const recent = this.wrHistory.slice(-10);
        const priceRecent = this.priceHistory.slice(-10);
        const lows = this.findSwingLows(recent);
        const highs = this.findSwingHighs(recent);
        if (lows.length >= 2) {
            const low1 = recent[lows[lows.length - 2]];
            const low2 = recent[lows[lows.length - 1]];
            if (low1 < this.oversoldLevel && low2 > low1 && this.currentValue !== null && this.currentValue > Math.max(recent[lows[lows.length - 1]] || -50, -50)) {
                return {
                    type: 'bullish_failure_swing',
                    direction: 'bullish',
                    strength: 'strong',
                    message: 'Bullish failure swing (higher low in oversold)',
                    metadata: { low1, low2, currentValue: this.currentValue }
                };
            }
        }
        if (highs.length >= 2) {
            const high1 = recent[highs[highs.length - 2]];
            const high2 = recent[highs[highs.length - 1]];
            if (high1 > this.overboughtLevel && high2 < high1 && this.currentValue !== null && this.currentValue < Math.min(recent[highs[highs.length - 1]] || -50, -50)) {
                return {
                    type: 'bearish_failure_swing',
                    direction: 'bearish',
                    strength: 'strong',
                    message: 'Bearish failure swing (lower high in overbought)',
                    metadata: { high1, high2, currentValue: this.currentValue }
                };
            }
        }
        return null;
    }
    getDivergence() {
        if (this.wrHistory.length < 20)
            return null;
        const recentWR = this.wrHistory.slice(-14);
        const recentPrices = this.priceHistory.slice(-14);
        const priceLows = this.findSwingLows(recentPrices);
        const wrLows = this.findSwingLows(recentWR);
        if (priceLows.length >= 2 && wrLows.length >= 2) {
            const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
            const prevPrice = recentPrices[priceLows[priceLows.length - 2]];
            const lastWR = recentWR[wrLows[wrLows.length - 1]];
            const prevWR = recentWR[wrLows[wrLows.length - 2]];
            if (lastPrice < prevPrice && lastWR > prevWR) {
                return {
                    type: 'bullish_divergence',
                    direction: 'bullish',
                    strength: 'very_strong',
                    message: 'Bullish divergence (price lower low, %R higher low)',
                    metadata: { lastPrice, prevPrice, lastWR, prevWR }
                };
            }
        }
        const priceHighs = this.findSwingHighs(recentPrices);
        const wrHighs = this.findSwingHighs(recentWR);
        if (priceHighs.length >= 2 && wrHighs.length >= 2) {
            const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
            const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
            const lastWR = recentWR[wrHighs[wrHighs.length - 1]];
            const prevWR = recentWR[wrHighs[wrHighs.length - 2]];
            if (lastPrice > prevPrice && lastWR < prevWR) {
                return {
                    type: 'bearish_divergence',
                    direction: 'bearish',
                    strength: 'very_strong',
                    message: 'Bearish divergence (price higher high, %R lower high)',
                    metadata: { lastPrice, prevPrice, lastWR, prevWR }
                };
            }
        }
        return null;
    }
    getHiddenDivergence() {
        if (this.wrHistory.length < 20)
            return null;
        const recentWR = this.wrHistory.slice(-14);
        const recentPrices = this.priceHistory.slice(-14);
        const priceLows = this.findSwingLows(recentPrices);
        const wrLows = this.findSwingLows(recentWR);
        if (priceLows.length >= 2 && wrLows.length >= 2) {
            const lastPrice = recentPrices[priceLows[priceLows.length - 1]];
            const prevPrice = recentPrices[priceLows.length - 2];
            const lastWR = recentWR[wrLows[wrLows.length - 1]];
            const prevWR = recentWR[wrLows.length - 2];
            if (lastPrice > prevPrice && lastWR < prevWR && this.currentValue !== null && this.currentValue > -60) {
                return {
                    type: 'bullish_hidden_divergence',
                    direction: 'bullish',
                    strength: 'strong',
                    message: 'Bullish hidden divergence (uptrend continuation)',
                    metadata: { lastPrice, prevPrice, lastWR, prevWR }
                };
            }
        }
        const priceHighs = this.findSwingHighs(recentPrices);
        const wrHighs = this.findSwingHighs(recentWR);
        if (priceHighs.length >= 2 && wrHighs.length >= 2) {
            const lastPrice = recentPrices[priceHighs[priceHighs.length - 1]];
            const prevPrice = recentPrices[priceHighs[priceHighs.length - 2]];
            const lastWR = recentWR[wrHighs[wrHighs.length - 1]];
            const prevWR = recentWR[wrHighs[wrHighs.length - 2]];
            if (lastPrice < prevPrice && lastWR > prevWR && this.currentValue !== null && this.currentValue < -40) {
                return {
                    type: 'bearish_hidden_divergence',
                    direction: 'bearish',
                    strength: 'strong',
                    message: 'Bearish hidden divergence (downtrend continuation)',
                    metadata: { lastPrice, prevPrice, lastWR, prevWR }
                };
            }
        }
        return null;
    }
    getZone() {
        if (this.currentValue === null)
            return null;
        if (this.currentValue < this.oversoldLevel) {
            const isExtreme = this.currentValue < -90;
            const isPersistent = this.oversoldBars >= 3;
            const strength = isExtreme ? 'extreme' : (isPersistent ? 'strong' : 'moderate');
            return {
                type: 'oversold_zone',
                direction: 'bullish',
                strength,
                message: `Williams %R oversold (${this.currentValue.toFixed(1)}) for ${this.oversoldBars} bars`,
                metadata: { value: this.currentValue, threshold: this.oversoldLevel, barsInZone: this.oversoldBars }
            };
        }
        if (this.currentValue > this.overboughtLevel) {
            const isExtreme = this.currentValue > -10;
            const isPersistent = this.overboughtBars >= 3;
            const strength = isExtreme ? 'extreme' : (isPersistent ? 'strong' : 'moderate');
            return {
                type: 'overbought_zone',
                direction: 'bearish',
                strength,
                message: `Williams %R overbought (${this.currentValue.toFixed(1)}) for ${this.overboughtBars} bars`,
                metadata: { value: this.currentValue, threshold: this.overboughtLevel, barsInZone: this.overboughtBars }
            };
        }
        return null;
    }
    getMomentumThrust() {
        if (this.wrHistory.length < 5)
            return null;
        const recent = this.wrHistory.slice(-5);
        const thrust = recent[4] - recent[0];
        if (thrust > 30 && recent[0] < -70) {
            return {
                type: 'bullish_thrust',
                direction: 'bullish',
                strength: 'strong',
                message: `Williams %R bullish thrust (${thrust.toFixed(1)} points in 5 bars)`,
                metadata: { thrust, from: recent[0], to: recent[4] }
            };
        }
        if (thrust < -30 && recent[0] > -30) {
            return {
                type: 'bearish_thrust',
                direction: 'bearish',
                strength: 'strong',
                message: `Williams %R bearish thrust (${Math.abs(thrust).toFixed(1)} points in 5 bars)`,
                metadata: { thrust, from: recent[0], to: recent[4] }
            };
        }
        return null;
    }
    getHookPattern() {
        if (this.wrHistory.length < 4)
            return null;
        const recent = this.wrHistory.slice(-4);
        if (recent[0] > recent[1] && recent[1] > recent[2] && recent[3] > recent[2] && recent[2] < this.oversoldLevel) {
            return {
                type: 'bullish_hook',
                direction: 'bullish',
                strength: 'moderate',
                message: 'Williams %R bullish hook in oversold zone',
                metadata: { values: recent, hookPoint: recent[2] }
            };
        }
        if (recent[0] < recent[1] && recent[1] < recent[2] && recent[3] < recent[2] && recent[2] > this.overboughtLevel) {
            return {
                type: 'bearish_hook',
                direction: 'bearish',
                strength: 'moderate',
                message: 'Williams %R bearish hook in overbought zone',
                metadata: { values: recent, hookPoint: recent[2] }
            };
        }
        return null;
    }
    getFastSlowCrossover() {
        if (this.fastValue === null || this.prevFastValue === null || this.currentValue === null || this.prevValue === null)
            return null;
        if (this.prevFastValue <= this.prevValue && this.fastValue > this.currentValue && this.currentValue < -50) {
            return {
                type: 'bullish_fast_slow_cross',
                direction: 'bullish',
                strength: 'moderate',
                message: 'Fast %R crossed above Slow %R (bullish momentum shift)',
                metadata: { fast: this.fastValue, slow: this.currentValue }
            };
        }
        if (this.prevFastValue >= this.prevValue && this.fastValue < this.currentValue && this.currentValue > -50) {
            return {
                type: 'bearish_fast_slow_cross',
                direction: 'bearish',
                strength: 'moderate',
                message: 'Fast %R crossed below Slow %R (bearish momentum shift)',
                metadata: { fast: this.fastValue, slow: this.currentValue }
            };
        }
        return null;
    }
    findSwingLows(data) {
        const lows = [];
        for (let i = 2; i < data.length - 2; i++) {
            if (data[i] < data[i - 1] && data[i] < data[i - 2] &&
                data[i] < data[i + 1] && data[i] < data[i + 2]) {
                lows.push(i);
            }
        }
        return lows;
    }
    findSwingHighs(data) {
        const highs = [];
        for (let i = 2; i < data.length - 2; i++) {
            if (data[i] > data[i - 1] && data[i] > data[i - 2] &&
                data[i] > data[i + 1] && data[i] > data[i + 2]) {
                highs.push(i);
            }
        }
        return highs;
    }
    reset() {
        this.highs = [];
        this.lows = [];
        this.closes = [];
        this.fastHighs = [];
        this.fastLows = [];
        this.currentValue = null;
        this.prevValue = null;
        this.fastValue = null;
        this.prevFastValue = null;
        this.wrHistory = [];
        this.priceHistory = [];
        this.oversoldBars = 0;
        this.overboughtBars = 0;
    }
}
exports.WilliamsRIndicator = WilliamsRIndicator;
//# sourceMappingURL=WilliamsRIndicator.js.map