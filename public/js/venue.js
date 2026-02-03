const ifaceSelect = document.getElementById('ifaceSelect');
const scanBtn = document.getElementById('scanBtn');
const scanStatus = document.getElementById('scanStatus');
const networksList = document.getElementById('networksList');
const statusBadge = document.getElementById('statusBadge');
const statusSsid = document.getElementById('statusSsid');
const statusIp = document.getElementById('statusIp');
const statusGateway = document.getElementById('statusGateway');
const statusDns = document.getElementById('statusDns');
const statusIface = document.getElementById('statusIface');
const statusConnection = document.getElementById('statusConnection');
const refreshStatusBtn = document.getElementById('refreshStatusBtn');
const manualForm = document.getElementById('manualForm');
const manualSsid = document.getElementById('manualSsid');
const manualPass = document.getElementById('manualPass');

function setStatusBadge(connected) {
    if (connected) {
        statusBadge.textContent = 'online';
        statusBadge.classList.remove('badge-off');
        statusBadge.classList.add('badge-on');
        return;
    }
    statusBadge.textContent = 'offline';
    statusBadge.classList.remove('badge-on');
    statusBadge.classList.add('badge-off');
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

async function loadStatus() {
    const iface = ifaceSelect.value;
    statusIface.textContent = iface;
    try {
        const response = await fetch(`/api/wifi/status?iface=${encodeURIComponent(iface)}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Unable to load status');
        }
        setStatusBadge(data.connected);
        statusSsid.textContent = data.ssid || '--';
        statusIp.textContent = data.ip || '--';
        statusGateway.textContent = data.gateway || '--';
        statusConnection.textContent = data.connection || '--';
        if (Array.isArray(data.dns)) {
            statusDns.textContent = data.dns.join(', ') || '--';
        } else {
            statusDns.textContent = data.dns || '--';
        }
    } catch (error) {
        setStatusBadge(false);
        statusSsid.textContent = '--';
        statusIp.textContent = '--';
        statusGateway.textContent = '--';
        statusDns.textContent = '--';
        statusConnection.textContent = '--';
        scanStatus.textContent = error.message;
    }
}

function renderNetworks(networks) {
    if (!networks.length) {
        networksList.innerHTML = '<p class="text-sm text-gray-300">No networks found. Try scanning again.</p>';
        return;
    }

    const bandLabel = (network) => {
        if (network.band) {
            if (network.band === 'a') return '5 GHz';
            if (network.band === 'bg') return '2.4 GHz';
            if (network.band === 'ax') return '6 GHz';
        }
        if (network.freq) {
            if (network.freq >= 5955) return '6 GHz';
            if (network.freq >= 4900) return '5 GHz';
            if (network.freq >= 2400) return '2.4 GHz';
        }
        if (network.channel) {
            if (network.channel >= 1 && network.channel <= 14) return '2.4 GHz';
            if (network.channel >= 36 && network.channel <= 196) return '5 GHz';
        }
        return 'Unknown band';
    };

    networksList.innerHTML = networks.map((network) => {
        const secure = network.security && network.security !== '--';
        const inUse = network.inUse ? '<span class="badge badge-on">connected</span>' : '';
        return `
            <div class="network-item p-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <div class="text-lg font-semibold">${escapeHtml(network.ssid)}</div>
                    <div class="text-xs text-gray-300">Signal: ${network.signal}% ${secure ? '• Secured' : '• Open'} • ${bandLabel(network)}</div>
                </div>
                <div class="flex items-center gap-3">
                    ${inUse}
                    <button class="connectBtn bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-2 rounded-lg text-sm" data-ssid="${escapeHtml(network.ssid)}" data-secure="${secure}">
                        Connect
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.connectBtn').forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            event.preventDefault();
            const ssid = btn.getAttribute('data-ssid');
            const secure = btn.getAttribute('data-secure') === 'true';
            let password = '';
            if (secure) {
                password = prompt(`Enter password for ${ssid}`) || '';
                if (!password) {
                    scanStatus.textContent = 'Password required for secured networks.';
                    return;
                }
            }
            await connectToNetwork(ssid, password);
        });
    });
}

async function connectToNetwork(ssid, password) {
    const iface = ifaceSelect.value;
    scanStatus.textContent = `Connecting to ${ssid}...`;
    try {
        const response = await fetch('/api/wifi/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ iface, ssid, password })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to connect');
        }
        scanStatus.textContent = data.output || 'Connected. Refreshing status...';
        await loadStatus();
    } catch (error) {
        scanStatus.textContent = error.message;
    }
}

async function scanNetworks() {
    const iface = ifaceSelect.value;
    scanStatus.textContent = `Scanning on ${iface}...`;
    networksList.innerHTML = '';
    try {
        const response = await fetch(`/api/wifi/scan?iface=${encodeURIComponent(iface)}`);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Scan failed');
        }
        renderNetworks(data.networks || []);
        scanStatus.textContent = `Found ${data.networks.length} networks.`;
    } catch (error) {
        scanStatus.textContent = error.message;
    }
}

scanBtn.addEventListener('click', (event) => {
    event.preventDefault();
    scanNetworks();
});

refreshStatusBtn.addEventListener('click', (event) => {
    event.preventDefault();
    loadStatus();
});

ifaceSelect.addEventListener('change', () => {
    loadStatus();
});

manualForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const ssid = manualSsid.value.trim();
    const password = manualPass.value;
    if (!ssid) {
        scanStatus.textContent = 'Please enter an SSID.';
        return;
    }
    await connectToNetwork(ssid, password);
});

loadStatus();
scanNetworks();
