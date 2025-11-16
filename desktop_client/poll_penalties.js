// Penalties (Black Flags) poller module
// Scrapes the Baja SAE Black Flags page to keep penalties in sync with the desktop client.

const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');

const DEFAULT_URL = 'https://results.bajasae.net/BlackFlags.aspx';
const DEFAULT_INTERVAL_MS = 10_000;

async function fetchHtml(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function cleanText(value) {
  if (!value) return '';
  return value.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

function ensureHeaders(table) {
  let headerCells = Array.from(table.querySelectorAll('thead th'));
  if (!headerCells.length) {
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      headerCells = Array.from(firstRow.querySelectorAll('th'));
      if (!headerCells.length) {
        headerCells = Array.from(firstRow.querySelectorAll('td'));
      }
    }
  }

  if (!headerCells.length) {
    return ['Time', 'Car #', 'Team / School', 'Infraction', 'Penalty', 'Notes'];
  }

  return headerCells.map((cell, idx) => {
    const text = cleanText(cell.textContent || '');
    return text || `Column ${idx + 1}`;
  });
}

function extractLastUpdated(doc) {
  const explicit = doc.querySelector('[id$="lblLastUpdated"], #lblLastUpdated');
  if (explicit) {
    return cleanText(explicit.textContent || '');
  }

  const bodyText = doc.body ? doc.body.textContent : '';
  if (bodyText) {
    const match = bodyText.match(/Last Data Update:\s*([^\n\r]+)/i);
    if (match) {
      return cleanText(match[1]);
    }
  }
  return null;
}

function extractCarNumber(entry) {
  const keys = Object.keys(entry);
  const preferred = keys.find((key) => /car/i.test(key));
  const raw = preferred ? entry[preferred] : '';
  return cleanText(raw);
}

function parsePenaltiesTable(html, url) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const table = doc.querySelector('#MainContent_gvBlackFlags') || doc.querySelector('table');
  if (!table) {
    throw new Error('Penalties table not found');
  }

  const headers = ensureHeaders(table);
  let dataRows = Array.from(table.querySelectorAll('tbody tr'));
  if (!dataRows.length) {
    const allRows = Array.from(table.querySelectorAll('tr'));
    dataRows = headers.length ? allRows.slice(1) : allRows;
  }

  const data = dataRows
    .map((row) => Array.from(row.querySelectorAll('td')))
    .filter((cells) => cells.length)
    .map((cells) => {
      const entry = {};
      headers.forEach((header, idx) => {
        entry[header] = cleanText(cells[idx] ? cells[idx].textContent : '');
      });
      entry.__car = extractCarNumber(entry);
      return entry;
    })
    .filter((entry) => Object.values(entry).some((value) => value));

  const latestEntryText = data[0]?.['Date/Time'] || data[0]?.Time || data[0]?.Date || null;
  let latestEntryISO = null;
  if (latestEntryText) {
    const parsed = Date.parse(latestEntryText);
    if (!Number.isNaN(parsed)) {
      latestEntryISO = new Date(parsed).toISOString();
    }
  }

  return {
    meta: {
      source: url,
      scrapedAt: new Date().toISOString(),
      headers,
      lastUpdatedText: extractLastUpdated(doc),
      latestEntryText,
      latestEntryISO,
      total: data.length
    },
    data
  };
}

class PenaltiesPoller extends EventEmitter {
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
      const payload = parsePenaltiesTable(html, this.url);
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
    this.startWithImmediate().catch((error) => this.emit('error', error));
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
  PenaltiesPoller,
  parsePenaltiesTable,
  DEFAULT_URL,
  DEFAULT_INTERVAL_MS
};
