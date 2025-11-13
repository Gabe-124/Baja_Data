// Endurance grid poller
// Transformed into a reusable module for the Electron main process.
const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');

const DEFAULT_URL = 'https://results.bajasae.net/EnduranceGrid.aspx';
const DEFAULT_INTERVAL_MS = 10_000;

async function fetchHtml(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

function parseTableToJson(html, url) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const table = doc.querySelector('table#MainContent_gvPublishedData');
  if (!table) throw new Error('table#MainContent_gvPublishedData not found');

  const finalLabel = doc.querySelector('#MainContent_pnlPublishedResults .label-success');
  const finalAsOf = finalLabel ? finalLabel.textContent.trim() : null;

  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const data = rows.map((tr) => {
    const tds = Array.from(tr.querySelectorAll('td')).map((td) =>
      td.textContent.replace(/\u00A0/g, ' ').trim().replace(/\s+/g, ' ')
    );

    const [Position = '', CarHash = '', School = '', Team = '', Comments = ''] = tds;
    return {
      Position,
      'Car #': CarHash,
      School,
      Team,
      Comments
    };
  });

  return {
    meta: {
      source: url,
      scrapedAt: new Date().toISOString(),
      finalAsOf
    },
    data
  };
}

class EndurancePoller extends EventEmitter {
  constructor(options = {}) {
    super();
    this.url = options.url || DEFAULT_URL;
    this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    this._timer = null;
    this._isActive = false;
    this._pollInFlight = false;
    this._lastPayload = null;
  }

  isRunning() {
    return this._isActive;
  }

  getLastPayload() {
    return this._lastPayload;
  }

  async pollOnce() {
    if (this._pollInFlight) {
      return null;
    }
    this._pollInFlight = true;
    try {
      const html = await fetchHtml(this.url);
      const payload = parseTableToJson(html, this.url);
      this._lastPayload = payload;
      this.emit('data', payload);
      return payload;
    } catch (error) {
      this.emit('error', error);
      return null;
    } finally {
      this._pollInFlight = false;
    }
  }

  async startWithImmediate() {
    if (this._isActive) {
      if (!this._lastPayload && !this._pollInFlight) {
        await this.pollOnce();
      }
      return this._lastPayload;
    }

    this._isActive = true;
    this.emit('status', { running: true });

    const payload = await this.pollOnce();
    this._timer = setInterval(() => {
      this.pollOnce();
    }, this.intervalMs);
    return payload;
  }

  start() {
    if (this._isActive) {
      return;
    }
    this.startWithImmediate().catch((error) => {
      this.emit('error', error);
    });
  }

  stop() {
    if (!this._isActive) {
      return;
    }
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._isActive = false;
    this.emit('status', { running: false });
  }

  updateInterval(intervalMs) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error('intervalMs must be a positive number');
    }
    this.intervalMs = intervalMs;
    if (this._isActive) {
      this.stop();
      this.start();
    }
  }

  destroy() {
    this.stop();
    this.removeAllListeners();
  }
}

module.exports = {
  EndurancePoller,
  parseTableToJson,
  DEFAULT_URL,
  DEFAULT_INTERVAL_MS
};
