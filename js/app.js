const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(firebaseApp);
const db = firebase.firestore(firebaseApp);

let currentUser = null;
let currentProfile = null;
let allUsers = [];
let allTurns = [];
let currentPreferences = null;
let directoryNeedsReview = false;
let directoryGroups = [];
let addressFormFilled = false;
let leaderboardChartInstance = null;
const notifiedTurnKeys = new Set();

let usersUnsub = null;
let turnsUnsub = null;
let preferencesUnsub = null;
let settingsUnsub = null;

const elements = {
  authPanel: document.getElementById('authPanel'),
  appShell: document.getElementById('appShell'),
  logoutBtn: document.getElementById('logoutBtn'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  profileName: document.getElementById('profileName'),
  profileRole: document.getElementById('profileRole'),
  statsMembers: document.getElementById('statsMembers'),
  statsCompleted: document.getElementById('statsCompleted'),
  statsUpcoming: document.getElementById('statsUpcoming'),
  reminderBanner: document.getElementById('reminderBanner'),
  noticeBanner: document.getElementById('noticeBanner'),
  tabBar: document.getElementById('tabBar'),
  directoryList: document.getElementById('directoryList'),
  saveOrderBtn: document.getElementById('saveOrderBtn'),
  myTurnsList: document.getElementById('myTurnsList'),
  addressForm: document.getElementById('addressForm'),
  addressMessage: document.getElementById('addressMessage'),
  changeEmailForm: document.getElementById('changeEmailForm'),
  emailMessage: document.getElementById('emailMessage'),
  changePasswordForm: document.getElementById('changePasswordForm'),
  passwordMessage: document.getElementById('passwordMessage'),
  leaderboardChart: document.getElementById('leaderboardChart'),
  leaderboardBody: document.getElementById('leaderboardBody'),
  assignTurnForm: document.getElementById('assignTurnForm'),
  turnUser: document.getElementById('turnUser'),
  turnMessage: document.getElementById('turnMessage'),
  allTurnsList: document.getElementById('allTurnsList'),
  membersList: document.getElementById('membersList'),
  membersTabBtn: document.getElementById('membersTabBtn'),
  pendingGate: document.getElementById('pendingGate'),
  pendingGateTitle: document.getElementById('pendingGateTitle'),
  pendingGateText: document.getElementById('pendingGateText'),
  mainContent: document.getElementById('mainContent')
};

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  auth.onAuthStateChanged(handleAuthStateChange);
});

function bindEvents() {
  elements.loginForm.addEventListener('submit', onLogin);
  elements.registerForm.addEventListener('submit', onRegister);
  elements.logoutBtn.addEventListener('click', onLogout);
  elements.saveOrderBtn.addEventListener('click', saveDirectoryOrder);
  elements.addressForm.addEventListener('submit', onSaveAddress);
  elements.changeEmailForm.addEventListener('submit', onChangeEmail);
  elements.changePasswordForm.addEventListener('submit', onChangePassword);
  elements.assignTurnForm.addEventListener('submit', onAssignTurn);
  elements.tabBar.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab-btn');
    if (btn) setActiveTab(btn.dataset.tab);
  });
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
}

async function handleAuthStateChange(user) {
  currentUser = user;

  if (usersUnsub) usersUnsub();
  if (turnsUnsub) turnsUnsub();
  if (preferencesUnsub) preferencesUnsub();
  if (settingsUnsub) settingsUnsub();

  if (!user) {
    currentProfile = null;
    currentPreferences = null;
    allUsers = [];
    allTurns = [];
    directoryGroups = [];
    addressFormFilled = false;
    renderAuthUI();
    renderAll();
    return;
  }

  try {
    await ensureUserProfile(user);
    renderAuthUI();
    subscribeToUsers();
    subscribeToTurns();
    subscribeToPreferences();
    subscribeToSettings();
  } catch (error) {
    console.warn('Firestore access blocked:', error);
    renderAuthUI();
    renderAll();
  }
}

async function ensureUserProfile(user) {
  try {
    const profileRef = db.collection('users').doc(user.uid);
    const existing = await profileRef.get();

    if (!existing.exists) {
      const adminSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      const isFirstUser = adminSnapshot.empty;
      const role = isFirstUser ? 'admin' : 'member';
      const profile = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email.split('@')[0],
        phone: '',
        role,
        status: isFirstUser ? 'approved' : 'pending',
        eligibleForKidmat: true,
        address: { line1: '', area: '', city: '', notes: '' },
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await profileRef.set(profile);
      currentProfile = profile;
      return;
    }

    currentProfile = existing.data();
  } catch (error) {
    console.warn('Profile setup blocked by Firestore rules:', error);
    currentProfile = {
      uid: user.uid,
      email: user.email,
      name: user.displayName || user.email.split('@')[0],
      role: 'member',
      eligibleForKidmat: true,
      address: {}
    };
  }
}

function renderAuthUI() {
  if (currentUser) {
    elements.authPanel.classList.add('hidden');
    elements.appShell.classList.remove('hidden');
    elements.logoutBtn.classList.remove('hidden');
    elements.profileName.textContent = currentProfile?.name || currentUser.email;
    elements.profileRole.textContent = currentProfile?.role === 'admin' ? 'Administrator' : 'Member';
  } else {
    elements.authPanel.classList.remove('hidden');
    elements.appShell.classList.add('hidden');
    elements.logoutBtn.classList.add('hidden');
  }
  renderAccessGate();
}

function renderAccessGate() {
  if (!currentUser || !currentProfile) {
    elements.pendingGate.classList.add('hidden');
    elements.mainContent.classList.remove('hidden');
    return;
  }

  if (isRejected(currentProfile)) {
    elements.pendingGateTitle.textContent = 'Access denied';
    elements.pendingGateText.textContent = 'Your account request was declined by an administrator. Contact your sector admin if you believe this is a mistake.';
    elements.pendingGate.classList.remove('hidden');
    elements.mainContent.classList.add('hidden');
  } else if (!isApproved(currentProfile)) {
    elements.pendingGateTitle.textContent = 'Awaiting approval';
    elements.pendingGateText.textContent = "Your account has been created but an administrator needs to approve it before you can use the dashboard. Check back soon, or contact your sector admin.";
    elements.pendingGate.classList.remove('hidden');
    elements.mainContent.classList.add('hidden');
  } else {
    elements.pendingGate.classList.add('hidden');
    elements.mainContent.classList.remove('hidden');
  }
}

function subscribeToUsers() {
  usersUnsub = db.collection('users').onSnapshot(
    (snapshot) => {
      allUsers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const me = allUsers.find((u) => u.id === currentUser.uid);
      if (me) currentProfile = me;
      computeDirectoryGroups();
      renderAll();
    },
    (error) => {
      console.warn('Members feed blocked:', error);
      renderAll();
    }
  );
}

function subscribeToTurns() {
  turnsUnsub = db.collection('turns').onSnapshot(
    (snapshot) => {
      allTurns = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderAll();
    },
    (error) => {
      console.warn('Turns feed blocked:', error);
      renderAll();
    }
  );
}

function subscribeToPreferences() {
  preferencesUnsub = db.collection('userPreferences').doc(currentUser.uid).onSnapshot(
    (snapshot) => {
      currentPreferences = snapshot.exists ? snapshot.data() : null;
      computeDirectoryGroups();
      renderAll();
    },
    (error) => {
      console.warn('Preferences feed blocked:', error);
      renderAll();
    }
  );
}

function subscribeToSettings() {
  settingsUnsub = db.collection('settings').doc('directory').onSnapshot(
    (snapshot) => {
      directoryNeedsReview = snapshot.exists ? Boolean(snapshot.data().needsReview) : false;
      renderAll();
    },
    (error) => {
      console.warn('Settings feed blocked:', error);
      renderAll();
    }
  );
}

/* ---------- Helpers ---------- */

function pad2(value) {
  return String(value).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function deriveTurnStatus(turn) {
  if (turn.status === 'completed') return 'completed';
  return turn.date < todayStr() ? 'missed' : 'upcoming';
}

function isAdmin() {
  return currentProfile?.role === 'admin';
}

// Users created before the approval flow existed have no `status` field —
// treat that as approved so existing members aren't locked out.
function isApproved(user) {
  return user?.status !== 'pending' && user?.status !== 'rejected';
}

function isRejected(user) {
  return user?.status === 'rejected';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function addressKey(user) {
  const line1 = (user.address?.line1 || '').trim();
  if (!line1) return null;
  const area = (user.address?.area || '').trim();
  const city = (user.address?.city || '').trim();
  return `${line1}|${area}|${city}`.toLowerCase();
}

function addressLabel(user) {
  return [user.address?.line1, user.address?.area, user.address?.city].filter(Boolean).join(', ');
}

/* ---------- Directory grouping & ordering ---------- */

function computeDirectoryGroups() {
  const groupsByKey = new Map();

  allUsers.forEach((user) => {
    if (!isApproved(user)) return;
    const key = addressKey(user);
    if (!key) return;
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, { key, addressLabel: addressLabel(user), members: [] });
    }
    groupsByKey.get(key).members.push({ uid: user.id, name: user.name || user.email, phone: user.phone || '' });
  });

  const groups = Array.from(groupsByKey.values());
  const preferredOrder = currentPreferences?.preferredOrder || [];
  const seen = new Set();
  const ordered = [];

  preferredOrder.forEach((key) => {
    const group = groups.find((g) => g.key === key);
    if (group && !seen.has(key)) {
      ordered.push(group);
      seen.add(key);
    }
  });

  groups.forEach((group) => {
    if (!seen.has(group.key)) {
      ordered.push(group);
      seen.add(group.key);
    }
  });

  directoryGroups = ordered;
}

function moveGroup(key, direction) {
  const index = directoryGroups.findIndex((g) => g.key === key);
  if (index === -1) return;
  const target = index + direction;
  if (target < 0 || target >= directoryGroups.length) return;
  const reordered = [...directoryGroups];
  const [group] = reordered.splice(index, 1);
  reordered.splice(target, 0, group);
  directoryGroups = reordered;
  renderDirectoryList();
}

async function saveDirectoryOrder() {
  try {
    await db.collection('userPreferences').doc(currentUser.uid).set({
      preferredOrder: directoryGroups.map((g) => g.key),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('settings').doc('directory').set({
      needsReview: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      message: 'Your delivery order is saved.'
    }, { merge: true });
  } catch (error) {
    alert(error.message);
  }
}

function navigateTo(addressText) {
  const destination = encodeURIComponent(addressText);
  const openWithOrigin = (lat, lng) => {
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${destination}&travelmode=driving`, '_blank', 'noopener');
  };
  const openWithoutOrigin = () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${destination}`, '_blank', 'noopener');
  };
  if (!navigator.geolocation) {
    openWithoutOrigin();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => openWithOrigin(pos.coords.latitude, pos.coords.longitude),
    () => openWithoutOrigin(),
    { timeout: 6000 }
  );
}

/* ---------- Rendering ---------- */

function renderAll() {
  renderAccessGate();
  renderStats();
  renderReminder();
  renderNotice();
  renderAdminVisibility();
  renderDirectoryList();
  renderMyTurns();
  renderAddressForm();
  renderLeaderboard();
  renderTurnUserOptions();
  renderAllTurnsList();
  renderMembersList();
}

function renderStats() {
  elements.statsMembers.textContent = allUsers.length;
  elements.statsCompleted.textContent = allTurns.filter((t) => t.status === 'completed').length;
  elements.statsUpcoming.textContent = allTurns.filter((t) => t.status !== 'completed' && t.date >= todayStr()).length;
}

function renderReminder() {
  if (!currentUser) {
    elements.reminderBanner.classList.add('hidden');
    elements.reminderBanner.innerHTML = '';
    return;
  }

  const tomorrow = tomorrowStr();
  const myTurn = allTurns.find((t) => t.userId === currentUser.uid && t.date === tomorrow && t.status !== 'completed');

  if (!myTurn) {
    elements.reminderBanner.classList.add('hidden');
    elements.reminderBanner.innerHTML = '';
    return;
  }

  elements.reminderBanner.classList.remove('hidden');
  const canOfferNotify = 'Notification' in window && Notification.permission === 'default';
  elements.reminderBanner.innerHTML = `
    <strong>Reminder:</strong> You have a delivery turn tomorrow (${formatDisplayDate(tomorrow)}).
    ${canOfferNotify ? '<button type="button" class="btn btn--small btn--secondary" id="enableNotifyBtn">Enable notifications</button>' : ''}
  `;
  const notifyBtn = document.getElementById('enableNotifyBtn');
  if (notifyBtn) notifyBtn.addEventListener('click', requestNotificationPermission);
  maybeFireNotification(myTurn, tomorrow);
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(() => renderReminder());
}

function maybeFireNotification(turn, dateStr) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const key = `${turn.id}-${dateStr}`;
  if (notifiedTurnKeys.has(key)) return;
  notifiedTurnKeys.add(key);
  new Notification('FMB Thaali Ezzi — turn tomorrow', {
    body: `You have a delivery turn on ${formatDisplayDate(dateStr)}.`
  });
}

function renderNotice() {
  if (!currentUser || !directoryNeedsReview) {
    elements.noticeBanner.classList.add('hidden');
    elements.noticeBanner.innerHTML = '';
    return;
  }
  elements.noticeBanner.classList.remove('hidden');
  elements.noticeBanner.innerHTML = '<strong>Directory updated.</strong> A member address changed or a new member joined. Please review and save your delivery order.';
}

function renderAdminVisibility() {
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.classList.toggle('hidden', !isAdmin());
  });
}

function renderDirectoryList() {
  if (!currentUser) {
    elements.directoryList.innerHTML = '<p class="muted">Sign in to view the member directory.</p>';
    return;
  }
  if (!directoryGroups.length) {
    elements.directoryList.innerHTML = '<p class="muted">No drop-off addresses yet. Add yours from the My Address tab.</p>';
    return;
  }

  elements.directoryList.innerHTML = directoryGroups.map((group, index) => `
    <article class="directory-card">
      <div class="directory-card__top">
        <div>
          <div class="directory-card__names">
            ${group.members.map((m) => `<span class="name-chip">${escapeHtml(m.name)}</span>`).join('')}
          </div>
          <p><strong>Address:</strong> ${escapeHtml(group.addressLabel)}</p>
          <p class="muted">${escapeHtml(group.members.map((m) => m.phone).filter(Boolean).join(' · ') || 'No phone on file')}</p>
        </div>
        <div class="button-row">
          <button type="button" class="btn btn--primary btn--small" onclick="navigateTo('${escapeHtml(group.addressLabel).replace(/'/g, "\\'")}')">Navigate</button>
        </div>
      </div>
      <div class="button-row">
        <button type="button" class="btn btn--secondary btn--small" ${index === 0 ? 'disabled' : ''} onclick="moveGroup('${group.key}', -1)">Move up</button>
        <button type="button" class="btn btn--secondary btn--small" ${index === directoryGroups.length - 1 ? 'disabled' : ''} onclick="moveGroup('${group.key}', 1)">Move down</button>
      </div>
    </article>
  `).join('');
}

function renderMyTurns() {
  if (!currentUser) {
    elements.myTurnsList.innerHTML = '<p class="muted">Sign in to see your delivery turns.</p>';
    return;
  }
  const myTurns = allTurns
    .filter((t) => t.userId === currentUser.uid)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!myTurns.length) {
    elements.myTurnsList.innerHTML = '<p class="muted">No turns assigned to you yet.</p>';
    return;
  }

  elements.myTurnsList.innerHTML = myTurns.map((turn) => {
    const status = deriveTurnStatus(turn);
    return `
      <article class="turn-card">
        <div class="directory-card__top">
          <div>
            <p><strong>${formatDisplayDate(turn.date)}</strong></p>
            <p class="muted">${escapeHtml(turn.notes || 'No notes')}</p>
          </div>
          <span class="badge badge--${status}">${status}</span>
        </div>
        ${status !== 'completed' ? `<div class="button-row"><button type="button" class="btn btn--primary btn--small" onclick="markTurnComplete('${turn.id}')">Mark as delivered</button></div>` : ''}
      </article>
    `;
  }).join('');
}

function renderAddressForm() {
  if (!currentUser || !currentProfile || addressFormFilled) return;
  document.getElementById('myName').value = currentProfile.name || '';
  document.getElementById('myPhone').value = currentProfile.phone || '';
  document.getElementById('myLine1').value = currentProfile.address?.line1 || '';
  document.getElementById('myArea').value = currentProfile.address?.area || '';
  document.getElementById('myCity').value = currentProfile.address?.city || '';
  document.getElementById('myNotes').value = currentProfile.address?.notes || '';
  addressFormFilled = true;
}

function renderLeaderboard() {
  const eligible = allUsers.filter((u) => u.eligibleForKidmat !== false && isApproved(u));
  const rows = eligible.map((user) => {
    const userTurns = allTurns.filter((t) => t.userId === user.id);
    const completed = userTurns.filter((t) => t.status === 'completed').length;
    return {
      name: user.name || user.email,
      assigned: userTurns.length,
      completed,
      rate: userTurns.length ? Math.round((completed / userTurns.length) * 100) : 0
    };
  }).sort((a, b) => b.completed - a.completed || b.assigned - a.assigned || a.name.localeCompare(b.name));

  elements.leaderboardBody.innerHTML = rows.length
    ? rows.map((row, index) => `
        <tr>
          <td class="${index < 3 ? 'rank-medal' : ''}">#${index + 1}</td>
          <td>${escapeHtml(row.name)}</td>
          <td>${row.assigned}</td>
          <td>${row.completed}</td>
          <td>${row.rate}%</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" class="muted">No kidmat-eligible members yet.</td></tr>';

  if (typeof Chart === 'undefined' || !elements.leaderboardChart) return;
  if (leaderboardChartInstance) leaderboardChartInstance.destroy();
  leaderboardChartInstance = new Chart(elements.leaderboardChart, {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.name),
      datasets: [
        { label: 'Assigned', data: rows.map((r) => r.assigned), backgroundColor: '#caa447' },
        { label: 'Completed', data: rows.map((r) => r.completed), backgroundColor: '#0b6e5a' }
      ]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderTurnUserOptions() {
  if (!isAdmin()) return;
  const eligible = allUsers.filter((u) => u.eligibleForKidmat !== false && isApproved(u)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const currentValue = elements.turnUser.value;
  elements.turnUser.innerHTML = '<option value="">Select a member</option>' +
    eligible.map((u) => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join('');
  if (eligible.some((u) => u.id === currentValue)) elements.turnUser.value = currentValue;
}

function renderAllTurnsList() {
  if (!isAdmin()) return;
  const sorted = [...allTurns].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    elements.allTurnsList.innerHTML = '<p class="muted">No turns assigned yet.</p>';
    return;
  }
  elements.allTurnsList.innerHTML = sorted.map((turn) => {
    const status = deriveTurnStatus(turn);
    return `
      <article class="turn-card">
        <div class="directory-card__top">
          <div>
            <p><strong>${formatDisplayDate(turn.date)}</strong> — ${escapeHtml(turn.userName || 'Unknown member')}</p>
            <p class="muted">${escapeHtml(turn.notes || 'No notes')}</p>
          </div>
          <span class="badge badge--${status}">${status}</span>
        </div>
        <div class="button-row">
          ${status !== 'completed' ? `<button type="button" class="btn btn--primary btn--small" onclick="markTurnComplete('${turn.id}')">Mark completed</button>` : ''}
          <button type="button" class="btn btn--danger btn--small" onclick="deleteTurn('${turn.id}')">Delete</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderMembersList() {
  if (!isAdmin()) return;
  const pendingCount = allUsers.filter((u) => u.status === 'pending').length;
  if (elements.membersTabBtn) {
    elements.membersTabBtn.textContent = pendingCount ? `Members (${pendingCount} pending)` : 'Members';
  }

  const sorted = [...allUsers].sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  elements.membersList.innerHTML = sorted.map((user) => {
    const statusBadgeClass = user.status === 'pending' ? 'badge--upcoming' : user.status === 'rejected' ? 'badge--missed' : 'badge--completed';
    const statusLabel = user.status === 'pending' ? 'Pending approval' : user.status === 'rejected' ? 'Rejected' : 'Approved';
    return `
    <article class="member-row directory-card__top">
      <div>
        <p><strong>${escapeHtml(user.name || user.email)}</strong></p>
        <p class="muted">${escapeHtml(user.email)}</p>
      </div>
      <div class="button-row">
        <span class="badge ${statusBadgeClass}">${statusLabel}</span>
        <span class="badge">${user.role === 'admin' ? 'Administrator' : 'Member'}</span>
        <span class="badge ${user.eligibleForKidmat === false ? 'badge--missed' : 'badge--completed'}">${user.eligibleForKidmat === false ? 'Not eligible' : 'Eligible'}</span>
        ${user.status !== 'approved' ? `<button type="button" class="btn btn--primary btn--small" onclick="approveUser('${user.id}')">Approve</button>` : ''}
        ${user.status !== 'rejected' ? `<button type="button" class="btn btn--danger btn--small" onclick="rejectUser('${user.id}')">Reject</button>` : ''}
        <button type="button" class="btn btn--secondary btn--small" onclick="toggleRole('${user.id}')">${user.role === 'admin' ? 'Make Member' : 'Make Admin'}</button>
        <button type="button" class="btn btn--secondary btn--small" onclick="toggleEligibility('${user.id}')">${user.eligibleForKidmat === false ? 'Mark Eligible' : 'Mark Ineligible'}</button>
      </div>
    </article>
  `;
  }).join('');
}

/* ---------- Auth actions ---------- */

async function onLogin(event) {
  event.preventDefault();
  const email = event.target.email.value.trim();
  const password = event.target.password.value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
    event.target.reset();
  } catch (error) {
    alert(error.message);
  }
}

async function onRegister(event) {
  event.preventDefault();
  const name = event.target.name.value.trim();
  const email = event.target.email.value.trim();
  const password = event.target.password.value;
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    if (name) {
      await result.user.updateProfile({ displayName: name });
    }

    try {
      const adminSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      const isFirstUser = adminSnapshot.empty;
      const role = isFirstUser ? 'admin' : 'member';
      await db.collection('users').doc(result.user.uid).set({
        uid: result.user.uid,
        email: result.user.email,
        name,
        phone: '',
        role,
        status: isFirstUser ? 'approved' : 'pending',
        eligibleForKidmat: true,
        address: { line1: '', area: '', city: '', notes: '' },
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (firestoreError) {
      console.warn('User profile write blocked by Firestore rules:', firestoreError);
    }

    event.target.reset();
  } catch (error) {
    alert(error.message);
  }
}

async function onLogout() {
  try {
    await auth.signOut();
  } catch (error) {
    alert(error.message);
  }
}

/* ---------- My Address ---------- */

async function onSaveAddress(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = {
    name: formData.get('name').trim(),
    phone: formData.get('phone').trim(),
    address: {
      line1: formData.get('line1').trim(),
      area: formData.get('area').trim(),
      city: formData.get('city').trim(),
      notes: formData.get('notes').trim()
    },
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('users').doc(currentUser.uid).set(payload, { merge: true });
    await db.collection('settings').doc('directory').set({
      needsReview: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      message: 'A member address was updated. Please review your delivery order.'
    }, { merge: true });

    elements.addressMessage.textContent = 'Address saved successfully.';
    elements.addressMessage.className = 'form-message success';
  } catch (error) {
    elements.addressMessage.textContent = error.message;
    elements.addressMessage.className = 'form-message error';
  }
}

/* ---------- Turns ---------- */

async function onAssignTurn(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const formData = new FormData(event.target);
  const date = formData.get('date');
  const userId = formData.get('userId');
  const notes = formData.get('notes').trim();
  const member = allUsers.find((u) => u.id === userId);

  if (!date || !userId || !member) {
    elements.turnMessage.textContent = 'Pick a date and a member.';
    elements.turnMessage.className = 'form-message error';
    return;
  }

  try {
    const existing = allTurns.find((t) => t.date === date);
    const payload = {
      date,
      userId,
      userName: member.name || member.email,
      notes,
      status: 'upcoming',
      assignedBy: currentUser.uid,
      assignedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (existing) {
      await db.collection('turns').doc(existing.id).update(payload);
    } else {
      await db.collection('turns').add(payload);
    }

    event.target.reset();
    elements.turnMessage.textContent = existing ? 'Turn reassigned successfully.' : 'Turn assigned successfully.';
    elements.turnMessage.className = 'form-message success';
  } catch (error) {
    elements.turnMessage.textContent = error.message;
    elements.turnMessage.className = 'form-message error';
  }
}

async function markTurnComplete(turnId) {
  try {
    await db.collection('turns').doc(turnId).update({
      status: 'completed',
      completedAt: firebase.firestore.FieldValue.serverTimestamp(),
      completedBy: currentUser.uid
    });
  } catch (error) {
    alert(error.message);
  }
}

async function deleteTurn(turnId) {
  if (!confirm('Delete this turn assignment?')) return;
  try {
    await db.collection('turns').doc(turnId).delete();
  } catch (error) {
    alert(error.message);
  }
}

/* ---------- Admin: members ---------- */

async function toggleRole(uid) {
  const user = allUsers.find((u) => u.id === uid);
  if (!user) return;
  const admins = allUsers.filter((u) => u.role === 'admin');
  if (user.role === 'admin' && admins.length <= 1) {
    alert('At least one administrator is required. Promote another member first.');
    return;
  }
  try {
    await db.collection('users').doc(uid).update({ role: user.role === 'admin' ? 'member' : 'admin' });
  } catch (error) {
    alert(error.message);
  }
}

async function toggleEligibility(uid) {
  const user = allUsers.find((u) => u.id === uid);
  if (!user) return;
  try {
    await db.collection('users').doc(uid).update({ eligibleForKidmat: user.eligibleForKidmat === false });
  } catch (error) {
    alert(error.message);
  }
}

async function approveUser(uid) {
  try {
    await db.collection('users').doc(uid).update({
      status: 'approved',
      approvedBy: currentUser.uid,
      approvedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    alert(error.message);
  }
}

async function rejectUser(uid) {
  if (uid === currentUser.uid) {
    alert('You cannot reject your own account.');
    return;
  }
  if (!confirm('Reject this account? They will lose access to the dashboard.')) return;
  try {
    await db.collection('users').doc(uid).update({
      status: 'rejected',
      rejectedBy: currentUser.uid,
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    alert(error.message);
  }
}

/* ---------- Account security ---------- */

async function reauthenticate(currentPassword) {
  const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPassword);
  await currentUser.reauthenticateWithCredential(credential);
}

async function onChangeEmail(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const newEmail = formData.get('newEmail').trim();
  const currentPassword = formData.get('currentPassword');

  try {
    await reauthenticate(currentPassword);
    await currentUser.updateEmail(newEmail);
    await db.collection('users').doc(currentUser.uid).update({ email: newEmail });
    event.target.reset();
    elements.emailMessage.textContent = 'Email updated successfully.';
    elements.emailMessage.className = 'form-message success';
  } catch (error) {
    elements.emailMessage.textContent = error.message;
    elements.emailMessage.className = 'form-message error';
  }
}

async function onChangePassword(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const currentPassword = formData.get('currentPassword');
  const newPassword = formData.get('newPassword');

  try {
    await reauthenticate(currentPassword);
    await currentUser.updatePassword(newPassword);
    event.target.reset();
    elements.passwordMessage.textContent = 'Password updated successfully.';
    elements.passwordMessage.className = 'form-message success';
  } catch (error) {
    elements.passwordMessage.textContent = error.message;
    elements.passwordMessage.className = 'form-message error';
  }
}

window.moveGroup = moveGroup;
window.navigateTo = navigateTo;
window.markTurnComplete = markTurnComplete;
window.deleteTurn = deleteTurn;
window.toggleRole = toggleRole;
window.toggleEligibility = toggleEligibility;
window.approveUser = approveUser;
window.rejectUser = rejectUser;
