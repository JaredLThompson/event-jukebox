const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');

const app = express();
app.use(express.json());

function resolveNmcliPath() {
  if (process.env.NMCLI_PATH) return process.env.NMCLI_PATH;
  const candidates = ['/usr/bin/nmcli', '/usr/sbin/nmcli', '/bin/nmcli', '/sbin/nmcli'];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'nmcli';
}

function runNmcli(args) {
  const nmcliPath = resolveNmcliPath();
  const env = {
    ...process.env,
    PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
  };

  return new Promise((resolve, reject) => {
    execFile(nmcliPath, args, { timeout: 15000, env }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

function runIp(args) {
  const env = {
    ...process.env,
    PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
  };
  return new Promise((resolve, reject) => {
    execFile('ip', args, { timeout: 10000, env }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseIpFromIpAddr(output) {
  const match = output.match(/inet\s+([0-9.]+\/\d+)/);
  return match ? match[1] : '';
}

function splitNmcliLine(line) {
  const fields = [];
  let current = '';
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === ':') {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

app.get('/api/wifi/scan', async (req, res) => {
  const iface = req.query.iface || 'wlan0';
  if (!/^(wlan|wlx)[\w-]+$/.test(iface)) {
    return res.status(400).json({ error: 'Invalid interface name.' });
  }

  try {
    const { stdout } = await runNmcli([
      '-t',
      '-f',
      'SSID,SIGNAL,SECURITY,IN-USE,DEVICE',
      'dev',
      'wifi',
      'list',
      'ifname',
      iface
    ]);

    const networksBySsid = new Map();
    stdout.trim().split('\n').filter(Boolean).forEach((line) => {
      const [ssidRaw, signalRaw, securityRaw, inUseRaw, deviceRaw] = splitNmcliLine(line);
      if (deviceRaw && deviceRaw !== iface) return;
      const ssid = ssidRaw || '';
      if (!ssid) return;

      const signal = Number(signalRaw) || 0;
      const security = (securityRaw || '').trim();
      const inUse = (inUseRaw || '').trim() === '*';

      const existing = networksBySsid.get(ssid);
      if (!existing) {
        networksBySsid.set(ssid, { ssid, signal, security, inUse });
        return;
      }

      existing.signal = Math.max(existing.signal, signal);
      if (security && !existing.security.includes(security)) {
        existing.security = existing.security
          ? `${existing.security}, ${security}`
          : security;
      }
      existing.inUse = existing.inUse || inUse;
    });

    const networks = Array.from(networksBySsid.values()).sort((a, b) => b.signal - a.signal);
    return res.json({ iface, networks });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to scan WiFi networks.',
      details: error.stderr || error.message
    });
  }
});

app.get('/api/wifi/status', async (req, res) => {
  const iface = req.query.iface || 'wlan0';
  const debug = req.query.debug === '1';
  if (!/^(wlan|wlx)[\w-]+$/.test(iface)) {
    return res.status(400).json({ error: 'Invalid interface name.' });
  }

  try {
    const { stdout } = await runNmcli([
      '-t',
      '-f',
      'GENERAL.STATE,GENERAL.CONNECTION,IP4.ADDRESS,IP4.GATEWAY,IP4.DNS',
      'dev',
      'show',
      iface
    ]);

    const info = {};
    stdout.trim().split('\n').filter(Boolean).forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return;
      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1);
      if (!key) return;

      const baseKey = key.replace(/\[\d+\]$/, '');
      if (info[baseKey]) {
        if (Array.isArray(info[baseKey])) {
          info[baseKey].push(value);
        } else {
          info[baseKey] = [info[baseKey], value];
        }
      } else {
        info[baseKey] = value;
      }
    });

    const wifiList = await runNmcli([
      '-t',
      '-f',
      'ACTIVE,SSID,DEVICE',
      'dev',
      'wifi'
    ]);
    let activeSsid = '';
    wifiList.stdout.trim().split('\n').filter(Boolean).forEach((line) => {
      const [active, ssid, device] = splitNmcliLine(line);
      if (device === iface && active === 'yes') {
        activeSsid = ssid;
      }
    });

    const state = info['GENERAL.STATE'] || '';
    const connected = state.startsWith('100') || state.toLowerCase().includes('connected');
    let ipAddress = Array.isArray(info['IP4.ADDRESS']) ? info['IP4.ADDRESS'][0] : (info['IP4.ADDRESS'] || '');
    let ipAddrOutput = '';
    if (!ipAddress) {
      try {
        const ipResult = await runIp(['-4', 'addr', 'show', 'dev', iface]);
        ipAddrOutput = ipResult.stdout || '';
        ipAddress = parseIpFromIpAddr(ipResult.stdout);
      } catch (error) {
        ipAddress = '';
      }
    }

    const payload = {
      iface,
      connected,
      ssid: activeSsid,
      connection: info['GENERAL.CONNECTION'] || '',
      ip: ipAddress,
      gateway: info['IP4.GATEWAY'] || '',
      dns: info['IP4.DNS'] || []
    };

    if (debug) {
      payload.debug = {
        nmcli: stdout || '',
        ipAddr: ipAddrOutput
      };
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load WiFi status.',
      details: error.stderr || error.message
    });
  }
});

app.post('/api/wifi/connect', async (req, res) => {
  const { iface = 'wlan0', ssid, password } = req.body || {};
  if (!/^(wlan|wlx)[\w-]+$/.test(iface)) {
    return res.status(400).json({ error: 'Invalid interface name.' });
  }
  if (!ssid || typeof ssid !== 'string') {
    return res.status(400).json({ error: 'SSID is required.' });
  }

  const args = ['dev', 'wifi', 'connect', ssid, 'ifname', iface];
  if (password && typeof password === 'string') {
    args.push('password', password);
  }

  try {
    const { stdout } = await runNmcli(args);
    return res.json({ ok: true, output: stdout.trim() });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to connect to WiFi network.',
      details: error.stderr || error.message
    });
  }
});

const port = Number(process.env.WIFI_API_PORT || 8787);
app.listen(port, () => {
  console.log(`WiFi API listening on port ${port}`);
});
