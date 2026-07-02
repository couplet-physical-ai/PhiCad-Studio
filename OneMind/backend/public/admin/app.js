// State
let currentPage = 1;
let totalPages = 1;
let selectedIds = new Set();
let currentFeedbackId = null;

// ---- Auth ----
function checkAuth() {
  fetch('/admin/api/feedbacks?page=1&perPage=1')
    .then(r => {
      if (r.status === 401) showLogin();
      else { showAdmin(); loadFeedbacks(); loadFilterOptions(); }
    })
    .catch(() => showLogin());
}

function showLogin() {
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('admin-view').classList.add('hidden');
}

function showAdmin() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('admin-view').classList.remove('hidden');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  try {
    const res = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.success) {
      showAdmin();
      loadFeedbacks();
      loadFilterOptions();
    } else {
      errorEl.textContent = data.message || 'Login failed';
      errorEl.style.display = 'block';
    }
  } catch {
    errorEl.textContent = 'Network error';
    errorEl.style.display = 'block';
  }
});

async function logout() {
  await fetch('/admin/logout', { method: 'POST' });
  showLogin();
  document.getElementById('password').value = '';
}

// ---- Tabs ----
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'analytics') loadAnalytics();
  });
});

// ---- Filters ----
function getFilterParams() {
  const params = new URLSearchParams();
  const type = document.getElementById('filter-type').value;
  const status = document.getElementById('filter-status').value;
  const platform = document.getElementById('filter-platform').value;
  const version = document.getElementById('filter-version').value;
  const dateFrom = document.getElementById('filter-date-from').value;
  const dateTo = document.getElementById('filter-date-to').value;
  const search = document.getElementById('filter-search').value;

  if (type) params.set('type', type);
  if (status) params.set('status', status);
  if (platform) params.set('platform', platform);
  if (version) params.set('appVersion', version);
  if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
  if (dateTo) params.set('dateTo', new Date(dateTo + 'T23:59:59').toISOString());
  if (search) params.set('search', search);

  return params;
}

function applyFilters() {
  currentPage = 1;
  selectedIds.clear();
  updateBulkBar();
  loadFeedbacks();
}

function clearFilters() {
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-platform').value = '';
  document.getElementById('filter-version').value = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('filter-search').value = '';
  applyFilters();
}

async function loadFilterOptions() {
  try {
    const res = await fetch('/admin/api/feedbacks/filters');
    if (res.status === 401) return;
    const data = await res.json();
    if (!data.success) return;

    const platformSel = document.getElementById('filter-platform');
    const versionSel = document.getElementById('filter-version');

    // Keep first option, clear rest
    platformSel.innerHTML = '<option value="">All</option>';
    versionSel.innerHTML = '<option value="">All</option>';

    (data.platforms || []).forEach(p => {
      platformSel.innerHTML += `<option value="${esc(p)}">${esc(p)}</option>`;
    });
    (data.appVersions || []).forEach(v => {
      versionSel.innerHTML += `<option value="${esc(v)}">${esc(v)}</option>`;
    });
  } catch { /* ignore */ }
}

// ---- Feedbacks List ----
async function loadFeedbacks(page) {
  if (page !== undefined) currentPage = page;
  const listEl = document.getElementById('feedback-list');
  listEl.innerHTML = '<div class="loading">Loading...</div>';

  const params = getFilterParams();
  params.set('page', currentPage);
  params.set('perPage', '20');

  try {
    const res = await fetch('/admin/api/feedbacks?' + params);
    if (res.status === 401) { showLogin(); return; }
    const data = await res.json();

    if (!data.success || data.feedbacks.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><h3>No feedback found</h3><p>Try adjusting your filters.</p></div>';
      document.getElementById('pagination').classList.add('hidden');
      return;
    }

    currentPage = data.page;
    totalPages = data.totalPages;

    listEl.innerHTML = '<div class="feedback-grid">' +
      data.feedbacks.map(f => {
        const files = f.files ? (typeof f.files === 'string' ? JSON.parse(f.files) : f.files) : null;
        const checked = selectedIds.has(f.id) ? 'checked' : '';
        return `
          <div class="feedback-card" data-id="${f.id}">
            <input type="checkbox" class="checkbox" ${checked}
              onclick="event.stopPropagation(); toggleSelect('${f.id}', this.checked)">
            <div class="feedback-card-body" onclick="showFeedback('${f.id}')">
              <div class="feedback-header">
                <div class="feedback-badges">
                  <span class="badge type-${f.type}">${f.type}</span>
                  <span class="badge status-${f.status}">${f.status}</span>
                  ${f.platform ? `<span class="badge" style="background:#f1f3f4;color:#5f6368;">${esc(f.platform)}</span>` : ''}
                </div>
                <span class="feedback-date">${new Date(f.received_at).toLocaleString()}</span>
              </div>
              <div class="feedback-message">${esc(f.message)}</div>
              <div class="feedback-meta">
                ${f.email ? 'From: ' + esc(f.email) + ' | ' : ''}
                v${esc(f.app_version)}
                ${files && files.images && files.images.length ? ' | ' + files.images.length + ' image(s)' : ''}
              </div>
            </div>
          </div>`;
      }).join('') +
      '</div>';

    document.getElementById('pagination').classList.remove('hidden');
    document.getElementById('page-info').textContent = `Page ${data.page} of ${data.totalPages} (${data.total} total)`;
    document.getElementById('prev-btn').disabled = data.page <= 1;
    document.getElementById('next-btn').disabled = data.page >= data.totalPages;
  } catch {
    listEl.innerHTML = '<div class="error">Failed to load feedbacks. <button onclick="loadFeedbacks()" class="btn btn-sm">Retry</button></div>';
  }
}

function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) loadFeedbacks(newPage);
}

// ---- Selection / Bulk ----
function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id);
  else selectedIds.delete(id);
  updateBulkBar();
}

function toggleSelectAll() {
  const checked = document.getElementById('select-all-checkbox').checked;
  document.querySelectorAll('.feedback-card .checkbox').forEach(cb => {
    cb.checked = checked;
    const id = cb.closest('.feedback-card').dataset.id;
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
  });
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (selectedIds.size > 0) {
    bar.classList.add('active');
    document.getElementById('bulk-count').textContent = selectedIds.size + ' selected';
  } else {
    bar.classList.remove('active');
  }
}

async function bulkAction(action, status) {
  if (selectedIds.size === 0) return;
  if (action === 'delete' && !confirm(`Delete ${selectedIds.size} feedback(s)?`)) return;

  const body = { action, ids: [...selectedIds] };
  if (status) body.status = status;

  try {
    const res = await fetch('/admin/api/feedbacks/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      selectedIds.clear();
      updateBulkBar();
      document.getElementById('select-all-checkbox').checked = false;
      loadFeedbacks();
    }
  } catch { /* ignore */ }
}

// ---- Export ----
function exportFeedbacks(format) {
  const params = getFilterParams();
  params.set('format', format);
  window.open('/admin/api/feedbacks/export?' + params, '_blank');
}

// ---- Feedback Detail ----
async function showFeedback(id) {
  currentFeedbackId = id;
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  body.innerHTML = '<div class="loading">Loading...</div>';
  modal.classList.add('active');
  document.getElementById('modal-save-btn').style.display = 'inline-flex';

  try {
    const res = await fetch('/admin/api/feedbacks/' + id);
    if (res.status === 401) { modal.classList.remove('active'); showLogin(); return; }
    const data = await res.json();
    if (!data.success) { body.innerHTML = '<div class="error">Not found</div>'; return; }

    const f = data.feedback;
    const files = f.files ? (typeof f.files === 'string' ? JSON.parse(f.files) : f.files) : {};
    const ctx = f.system_context ? (typeof f.system_context === 'string' ? JSON.parse(f.system_context) : f.system_context) : null;

    let attachmentsHtml = '';
    if (files.images && files.images.length > 0) {
      attachmentsHtml += '<div class="detail-row"><div class="detail-label">Images</div><div class="attachments">' +
        files.images.map(img => `<a href="/admin/files/${f.id}/${img}" target="_blank" class="attachment">${esc(img)}</a>`).join('') +
        '</div></div>';
    }
    if (files.frontendLogs) {
      attachmentsHtml += `<div class="detail-row"><div class="detail-label">Frontend Logs</div><div class="attachments"><a href="/admin/files/${f.id}/${files.frontendLogs}" target="_blank" class="attachment">Frontend Logs</a></div></div>`;
    }
    if (files.backendLogs) {
      attachmentsHtml += `<div class="detail-row"><div class="detail-label">Backend Logs</div><div class="attachments"><a href="/admin/files/${f.id}/${files.backendLogs}" target="_blank" class="attachment">Backend Logs</a></div></div>`;
    }

    body.innerHTML = `
      <div class="detail-inline">
        <div class="detail-row">
          <div class="detail-label">Type</div>
          <div class="detail-value"><span class="badge type-${f.type}">${f.type}</span></div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Status</div>
          <div class="detail-value">
            <select class="status-select" id="modal-status">
              <option value="new" ${f.status === 'new' ? 'selected' : ''}>New</option>
              <option value="reviewed" ${f.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
              <option value="resolved" ${f.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="archived" ${f.status === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
          </div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Received</div>
          <div class="detail-value">${new Date(f.received_at).toLocaleString()}</div>
        </div>
      </div>
      <div class="detail-inline">
        <div class="detail-row">
          <div class="detail-label">Email</div>
          <div class="detail-value">${f.email ? esc(f.email) : 'Not provided'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">App Version</div>
          <div class="detail-value">${esc(f.app_version)}</div>
        </div>
        <div class="detail-row">
          <div class="detail-label">Platform</div>
          <div class="detail-value">${f.platform ? esc(f.platform) : 'Unknown'}</div>
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-label">User Agent</div>
        <div class="detail-value" style="font-size:11px;word-break:break-all;">${esc(f.user_agent)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Message</div>
        <div class="detail-value"><pre>${esc(f.message)}</pre></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Admin Notes</div>
        <textarea class="notes-input" id="modal-notes" placeholder="Add notes...">${f.notes ? esc(f.notes) : ''}</textarea>
      </div>
      ${ctx ? `<div class="detail-row"><div class="detail-label">System Context</div><div class="detail-value"><pre>${esc(JSON.stringify(ctx, null, 2))}</pre></div></div>` : ''}
      ${attachmentsHtml}
    `;
  } catch {
    body.innerHTML = '<div class="error">Failed to load details</div>';
  }
}

async function saveModalChanges() {
  if (!currentFeedbackId) return;
  const status = document.getElementById('modal-status').value;
  const notes = document.getElementById('modal-notes').value;

  try {
    const res = await fetch('/admin/api/feedbacks/' + currentFeedbackId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      loadFeedbacks();
    }
  } catch { /* ignore */ }
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
  currentFeedbackId = null;
}

// ---- Analytics ----
async function loadAnalytics() {
  await Promise.all([
    loadAnalyticsOverview(),
    loadAnalyticsDaily(),
    loadAnalyticsPlatforms(),
    loadAnalyticsVersions(),
    loadAnalyticsTopEvents(),
    loadAnalyticsErrors(),
  ]);
}

async function loadAnalyticsOverview() {
  try {
    const res = await fetch('/admin/api/analytics/overview');
    const data = await res.json();
    if (!data.success) return;

    document.getElementById('analytics-overview').innerHTML = `
      <div class="stat-card"><div class="stat-value">${data.totalEventsToday}</div><div class="stat-label">Events Today</div></div>
      <div class="stat-card"><div class="stat-value">${data.uniqueSessionsToday}</div><div class="stat-label">Sessions Today</div></div>
      <div class="stat-card"><div class="stat-value">${data.errorRateToday}%</div><div class="stat-label">Error Rate</div></div>
      <div class="stat-card"><div class="stat-value">${data.topAppVersion || '-'}</div><div class="stat-label">Top Version</div></div>
    `;
  } catch { /* ignore */ }
}

async function loadAnalyticsDaily() {
  try {
    const res = await fetch('/admin/api/analytics/daily?days=30');
    const data = await res.json();
    if (!data.success || !data.daily.length) {
      document.getElementById('daily-chart').innerHTML = '<div class="empty-state">No data yet</div>';
      return;
    }

    const max = Math.max(...data.daily.map(d => d.count), 1);
    document.getElementById('daily-chart').innerHTML = data.daily.map(d => {
      const h = Math.max(2, (d.count / max) * 100);
      return `<div class="chart-bar" style="height:${h}%"><div class="tooltip">${d.date}: ${d.count}</div></div>`;
    }).join('');
  } catch { /* ignore */ }
}

async function loadAnalyticsPlatforms() {
  try {
    const res = await fetch('/admin/api/analytics/platforms');
    const data = await res.json();
    if (!data.success) return;
    document.getElementById('platforms-dist').innerHTML = renderDistribution(data.platforms, 'platform');
  } catch { /* ignore */ }
}

async function loadAnalyticsVersions() {
  try {
    const res = await fetch('/admin/api/analytics/versions');
    const data = await res.json();
    if (!data.success) return;
    document.getElementById('versions-dist').innerHTML = renderDistribution(data.versions, 'app_version');
  } catch { /* ignore */ }
}

async function loadAnalyticsTopEvents() {
  try {
    const res = await fetch('/admin/api/analytics/events?limit=10');
    const data = await res.json();
    if (!data.success) return;
    document.getElementById('top-events-dist').innerHTML = renderDistribution(data.events, 'event_name');
  } catch { /* ignore */ }
}

async function loadAnalyticsErrors() {
  try {
    const res = await fetch('/admin/api/analytics/errors?limit=20');
    const data = await res.json();
    if (!data.success || !data.errors.length) {
      document.getElementById('errors-table').innerHTML = '<div class="empty-state">No errors</div>';
      return;
    }

    document.getElementById('errors-table').innerHTML = `
      <table class="errors-table">
        <thead><tr><th>Time</th><th>Event</th><th>Platform</th><th>Version</th><th>Properties</th></tr></thead>
        <tbody>
          ${data.errors.map(e => `
            <tr>
              <td>${new Date(e.timestamp).toLocaleString()}</td>
              <td>${esc(e.event_name)}</td>
              <td>${esc(e.platform)}</td>
              <td>${esc(e.app_version)}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.properties ? esc(e.properties) : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch { /* ignore */ }
}

function renderDistribution(items, labelKey) {
  if (!items || !items.length) return '<div class="empty-state">No data</div>';
  const max = Math.max(...items.map(i => i.count), 1);
  return items.map(i => `
    <div class="dist-row">
      <div class="dist-label">${esc(i[labelKey])}</div>
      <div class="dist-bar-bg"><div class="dist-bar-fill" style="width:${(i.count / max) * 100}%"></div></div>
      <div class="dist-count">${i.count}</div>
    </div>
  `).join('');
}

// ---- Utilities ----
function esc(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// ---- Modal events ----
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Filter on Enter key in search box
document.getElementById('filter-search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyFilters();
});

// ---- Init ----
checkAuth();
