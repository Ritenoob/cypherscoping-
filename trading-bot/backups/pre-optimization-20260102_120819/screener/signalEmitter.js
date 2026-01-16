/**
 * SIGNAL EMITTER
 * Handles signal output to multiple destinations
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class SignalEmitter extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.fileStream = null;

    if (this.config.file) {
      this.initFileOutput();
    }
  }

  /**
   * Initialize file output stream
   */
  initFileOutput() {
    try {
      const dir = path.dirname(this.config.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.fileStream = fs.createWriteStream(this.config.filePath, { flags: 'a' });
    } catch (err) {
      console.error('Failed to initialize file output:', err.message);
    }
  }

  /**
   * Emit a signal
   * @param {Object} signal - Signal data
   */
  emit(eventName, signal) {
    // Emit event for listeners
    super.emit(eventName, signal);

    // Console output
    if (this.config.console) {
      this.emitToConsole(signal);
    }

    // File output
    if (this.config.file && this.fileStream) {
      this.emitToFile(signal);
    }
  }

  /**
   * Emit signal to console
   */
  emitToConsole(signal) {
    const { pair, timeframe, signal: signalType, score, strength } = signal;
    const timestamp = new Date(signal.timestamp).toISOString();
    
    let color = '\x1b[0m'; // Default
    if (signalType.includes('BUY')) {
      color = '\x1b[32m'; // Green
    } else if (signalType.includes('SELL')) {
      color = '\x1b[31m'; // Red
    }

    console.log(
      `${color}[${timestamp}] ${pair} (${timeframe}) - ${signalType} (${strength}) | Score: ${score.toFixed(2)}\x1b[0m`
    );
  }

  /**
   * Emit signal to file (JSONL format)
   */
  emitToFile(signal) {
    if (!this.fileStream) return;

    try {
      const line = JSON.stringify(signal) + '\n';
      this.fileStream.write(line);
    } catch (err) {
      console.error('Failed to write signal to file:', err.message);
    }
  }

  /**
   * Close file stream
   */
  close() {
    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }
  }
}

module.exports = SignalEmitter;
