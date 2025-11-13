// Leaderboard poller module
// Mirrors the structure of poll_endurance.js but targets the leaderboard endpoint.
const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');
const { URLSearchParams } = require('url');

const DEFAULT_URL = 'https://results.bajasae.net/Leaderboard.aspx';
const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_EVENT_MATCH = /Endurance/i;

async function fetchHtml(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function selectEvent(doc, matcher) {
  const options = Array.from(doc.querySelectorAll('#MainContent_DropDownListEvents option')).map((opt) => ({
    id: opt.value,
    name: opt.textContent.trim()
  }));

  if (!options.length) {
    throw new Error('No leaderboard events available');
  }

  const event = options.find((opt) => matcher(opt.name, opt.id)) || options[0];
  return { event, options };
}

function extractHiddenValue(doc, selector, label) {
  const input = doc.querySelector(selector);
  if (!input || input.value === undefined) {
    throw new Error(`${label} not found`);
  }
  return input.value;
}

function parseTable(html, url) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const table = doc.querySelector('#MainContent_GridViewEnduranceResults');
  if (!table) {
    throw new Error('Leaderboard table not found');
  }

  const headerRow = Array.from(table.querySelectorAll('tr')).find((row) => row.querySelectorAll('th').length);
  if (!headerRow) {
    throw new Error('Leaderboard header row missing');
  }

  const headers = Array.from(headerRow.querySelectorAll('th')).map((th) => th.textContent.replace(/\u00A0/g, ' ').trim());

  const bodyRows = [];
  let rank = 1;
  table.querySelectorAll('tr').forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length === headers.length) {
      const entry = {};
      headers.forEach((header, idx) => {
        entry[header] = cells[idx].textContent.replace(/\u00A0/g, ' ').trim();
      });
      entry.__rank = rank++;
      bodyRows.push(entry);
    }
  });

  return {
    meta: {
      source: url,
      scrapedAt: new Date().toISOString(),
      headers,
      total: bodyRows.length
    },
    data: bodyRows
  };
}

class LeaderboardPoller extends EventEmitter {
  constructor(options = {}) {
    super();
    this.url = options.url || DEFAULT_URL;
    this.intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
    this.eventMatcher = options.eventMatcher || DEFAULT_EVENT_MATCH;
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
      const initialHtml = await fetchHtml(this.url, { redirect: 'follow' });
      const initialDom = new JSDOM(initialHtml);
      const initialDoc = initialDom.window.document;

      const hiddenFields = {
        __VIEWSTATE: extractHiddenValue(initialDoc, '#__VIEWSTATE', '__VIEWSTATE'),
        __VIEWSTATEGENERATOR: extractHiddenValue(initialDoc, '#__VIEWSTATEGENERATOR', '__VIEWSTATEGENERATOR'),
        __EVENTVALIDATION: extractHiddenValue(initialDoc, '#__EVENTVALIDATION', '__EVENTVALIDATION')
      };

      const matcherFn = (name, id) => {
        if (typeof this.eventMatcher === 'function') {
          return this.eventMatcher({ name, id });
        }
        const regex = this.eventMatcher instanceof RegExp ? this.eventMatcher : DEFAULT_EVENT_MATCH;
        return regex.test(name);
      };
      const { event, options } = selectEvent(initialDoc, matcherFn);

      const params = new URLSearchParams();
      Object.entries(hiddenFields).forEach(([key, value]) => params.append(key, value));
      params.append('ctl00$MainContent$DropDownListEvents', event.id);
      params.append('ctl00$MainContent$ButtonLookupEvent', 'Show Most Recent Results');

      const responseHtml = await fetchHtml(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const payload = parseTable(responseHtml, this.url);
      payload.meta.event = event;
      payload.meta.availableEvents = options;
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
  LeaderboardPoller,
  DEFAULT_URL,
  DEFAULT_INTERVAL_MS
};
