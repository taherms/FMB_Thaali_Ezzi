const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(firebaseApp);
const db = firebase.firestore(firebaseApp);

let currentUser = null;
let currentProfile = null;
let thaalis = [];
let currentPreferences = null;
let thaalisUnsub = null;
let preferencesUnsub = null;
let settingsUnsub = null;
let orderNeedsReview = false;

const elements = {
  authPanel: document.getElementById('authPanel'),
  appShell: document.getElementById('appShell'),
  logoutBtn: document.getElementById('logoutBtn'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  thaaliForm: document.getElementById('thaaliForm'),
  thaaliId: document.getElementById('thaaliId'),
  adminPanel: document.getElementById('adminPanel'),
  adminNotice: document.getElementById('adminNotice'),
  formTitle: document.getElementById('formTitle'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  formMessage: document.getElementById('formMessage'),
  thaaliList: document.getElementById('thaaliList'),
  orderList: document.getElementById('orderList'),
  saveOrderBtn: document.getElementById('saveOrderBtn'),
  noticeBanner: document.getElementById('noticeBanner'),
  statsCount: document.getElementById('statsCount'),
  volunteerCount: document.getElementById('volunteerCount'),
  profileName: document.getElementById('profileName'),
  profileRole: document.getElementById('profileRole')
};

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  auth.onAuthStateChanged(handleAuthStateChange);
});

function bindEvents() {
  elements.loginForm.addEventListener('submit', onLogin);
  elements.registerForm.addEventListener('submit', onRegister);
  elements.logoutBtn.addEventListener('click', onLogout);
  elements.thaaliForm.addEventListener('submit', onSaveThaali);
  elements.cancelEditBtn.addEventListener('click', resetThaaliForm);
  elements.saveOrderBtn.addEventListener('click', saveUserOrder);
}

async function handleAuthStateChange(user) {
  currentUser = user;

  if (thaalisUnsub) thaalisUnsub();
  if (preferencesUnsub) preferencesUnsub();
  if (settingsUnsub) settingsUnsub();

  if (!user) {
    currentProfile = null;
    currentPreferences = null;
    thaalis = [];
    renderAuthUI();
    renderDashboard();
    return;
  }

  try {
    await ensureUserProfile(user);
    renderAuthUI();
    subscribeToThaalis();
    subscribeToPreferences();
    subscribeToSettings();
  } catch (error) {
    console.warn('Firestore access blocked:', error);
    renderAuthUI();
    renderDashboard();
    elements.formMessage.textContent = 'Signed in successfully, but Firestore access is blocked. Please update your Firestore rules.';
    elements.formMessage.className = 'form-message error';
  }
}

async function ensureUserProfile(user) {
  try {
    const profileRef = db.collection('users').doc(user.uid);
    const existing = await profileRef.get();

    if (!existing.exists) {
      const adminSnapshot = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      const role = adminSnapshot.empty ? 'admin' : 'volunteer';
      const profile = {
        uid: user.uid,
        email: user.email,
        name: user.displayName || user.email.split('@')[0],
        role,
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
      role: 'volunteer'
    };
  }
}

function renderAuthUI() {
  if (currentUser) {
    elements.authPanel.classList.add('hidden');
    elements.appShell.classList.remove('hidden');
    elements.logoutBtn.classList.remove('hidden');
    elements.profileName.textContent = currentProfile?.name || currentUser.email;
    elements.profileRole.textContent = currentProfile?.role === 'admin' ? 'Administrator' : 'Volunteer';
  } else {
    elements.authPanel.classList.remove('hidden');
    elements.appShell.classList.add('hidden');
    elements.logoutBtn.classList.add('hidden');
  }
}

function subscribeToThaalis() {
  thaalisUnsub = db.collection('thaalis').orderBy('createdAt', 'desc').onSnapshot(
    (snapshot) => {
      thaalis = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderDashboard();
    },
    (error) => {
      console.warn('Thaali feed blocked:', error);
      renderDashboard();
    }
  );
}

function subscribeToPreferences() {
  preferencesUnsub = db.collection('userPreferences').doc(currentUser.uid).onSnapshot(
    (snapshot) => {
      currentPreferences = snapshot.exists ? snapshot.data() : null;
      renderDashboard();
    },
    (error) => {
      console.warn('Preferences feed blocked:', error);
      renderDashboard();
    }
  );
}

function subscribeToSettings() {
  settingsUnsub = db.collection('settings').doc('deliveryOrder').onSnapshot(
    (snapshot) => {
      if (snapshot.exists) {
        orderNeedsReview = Boolean(snapshot.data().needsReview);
      } else {
        orderNeedsReview = false;
      }
      renderDashboard();
    },
    (error) => {
      console.warn('Settings feed blocked:', error);
      renderDashboard();
    }
  );
}

function renderDashboard() {
  if (!currentUser) {
    elements.statsCount.textContent = '0';
    elements.volunteerCount.textContent = '0';
    elements.thaaliList.innerHTML = '<p class="muted">Sign in to view thaalis and manage your delivery order.</p>';
    elements.orderList.innerHTML = '<p class="muted">Sign in to set your preferred delivery route.</p>';
    return;
  }

  const visibleThaalis = sortThaalisForCurrentUser(thaalis, currentPreferences);
  const assignedVolunteerCount = visibleThaalis.filter((item) => item.volunteer).length;

  elements.statsCount.textContent = visibleThaalis.length;
  elements.volunteerCount.textContent = assignedVolunteerCount;

  renderAdminPanel();
  renderNotice();
  renderThaaliList(visibleThaalis);
  renderOrderEditor(visibleThaalis);
}

function renderAdminPanel() {
  if (!currentUser) {
    elements.adminPanel.classList.add('hidden');
    elements.adminNotice.classList.add('hidden');
    return;
  }

  if (isAdmin()) {
    elements.adminPanel.classList.remove('hidden');
    elements.adminNotice.classList.add('hidden');
  } else {
    elements.adminPanel.classList.add('hidden');
    elements.adminNotice.classList.remove('hidden');
  }
}

function sortThaalisForCurrentUser(items, preferences) {
  const preferredIds = preferences?.preferredOrder || [];
  const seen = new Set();
  const ordered = [];

  preferredIds.forEach((id) => {
    const item = items.find((entry) => entry.id === id);
    if (item && !seen.has(item.id)) {
      ordered.push(item);
      seen.add(item.id);
    }
  });

  items.forEach((item) => {
    if (!seen.has(item.id)) {
      ordered.push(item);
      seen.add(item.id);
    }
  });

  return ordered;
}

function renderNotice() {
  if (!orderNeedsReview) {
    elements.noticeBanner.classList.add('hidden');
    elements.noticeBanner.innerHTML = '';
    return;
  }

  elements.noticeBanner.classList.remove('hidden');
  elements.noticeBanner.innerHTML = '<strong>Fresh update detected.</strong> A new thaali was added or a location was updated. Please review and save your delivery order.';
}

function renderThaaliList(items) {
  if (!items.length) {
    elements.thaaliList.innerHTML = '<p class="muted">No thaali details yet. Add the first record with the form.</p>';
    return;
  }

  elements.thaaliList.innerHTML = items.map((item) => {
    const canEdit = isAdmin() || item.createdBy === currentUser.uid;
    const deliveryDays = Array.isArray(item.deliveryDays) ? item.deliveryDays.join(', ') : 'Not assigned';
    const volunteerLabel = item.volunteer ? item.volunteer : 'Pending';
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
    return `
      <article class="thaali-card">
        <div class="thaali-card__top">
          <div>
            <h3><a href="${mapUrl}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a></h3>
            <p class="muted">${escapeHtml(item.personName || 'Community thaali')}</p>
          </div>
          <span class="badge">${escapeHtml(item.role || 'Community support')}</span>
        </div>
        <p><strong>Location:</strong> <a href="${mapUrl}" target="_blank" rel="noopener">${escapeHtml(item.location || 'To be confirmed')}</a></p>
        <p><strong>Volunteer:</strong> ${escapeHtml(volunteerLabel)}</p>
        <p><strong>Delivery days:</strong> ${escapeHtml(deliveryDays)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(item.contactPhone || 'Not listed')}</p>
        <p class="muted">${escapeHtml(item.notes || 'No notes added yet.')}</p>
        ${canEdit ? `
          <div class="button-row">
            <button type="button" class="secondary" onclick="editThaali('${item.id}')">Edit</button>
            <button type="button" class="danger" onclick="deleteThaali('${item.id}')">Delete</button>
          </div>` : ''}
      </article>
    `;
  }).join('');
}

function renderOrderEditor(items) {
  if (!items.length) {
    elements.orderList.innerHTML = '<p class="muted">Add thaalis to build a delivery route.</p>';
    return;
  }

  elements.orderList.innerHTML = items.map((item, index) => `
    <div class="order-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="muted">${escapeHtml(item.location || 'Location to be confirmed')}</div>
      </div>
      <div class="button-row">
        <button type="button" class="secondary" ${index === 0 ? 'disabled' : ''} onclick="moveItem('${item.id}', -1)">↑</button>
        <button type="button" class="secondary" ${index === items.length - 1 ? 'disabled' : ''} onclick="moveItem('${item.id}', 1)">↓</button>
      </div>
    </div>
  `).join('');
}

function isAdmin() {
  return currentProfile?.role === 'admin';
}

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
      const role = adminSnapshot.empty ? 'admin' : 'volunteer';
      await db.collection('users').doc(result.user.uid).set({
        uid: result.user.uid,
        email: result.user.email,
        name,
        role,
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

async function onSaveThaali(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const selectedDays = formData.getAll('deliveryDays');
  const editingId = elements.thaaliId.value;
  const existingThaali = editingId ? thaalis.find((entry) => entry.id === editingId) : null;
  if (!isAdmin() && (!editingId || !existingThaali || existingThaali.createdBy !== currentUser.uid)) {
    alert('Only admins can create new thaalis. Only the owner or an admin can edit an existing record.');
    return;
  }

  const payload = {
    name: formData.get('name').trim(),
    personName: formData.get('personName').trim(),
    location: formData.get('location').trim(),
    role: formData.get('role').trim(),
    contactPhone: formData.get('contactPhone').trim(),
    notes: formData.get('notes').trim(),
    volunteer: formData.get('volunteer').trim(),
    deliveryDays: selectedDays,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    needsReorder: true
  };

  try {
    if (editingId) {
      await db.collection('thaalis').doc(editingId).update(payload);
    } else {
      await db.collection('thaalis').add({
        ...payload,
        createdBy: currentUser.uid,
        createdByName: currentProfile?.name || currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    await db.collection('settings').doc('deliveryOrder').set({
      needsReview: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      message: 'A thaali record was updated. Please choose your preferred route.'
    }, { merge: true });

    resetThaaliForm();
    elements.formMessage.textContent = editingId ? 'Thaali updated successfully.' : 'Thaali added successfully.';
    elements.formMessage.className = 'form-message success';
  } catch (error) {
    elements.formMessage.textContent = error.message;
    elements.formMessage.className = 'form-message error';
  }
}

function resetThaaliForm() {
  elements.thaaliForm.reset();
  elements.thaaliId.value = '';
  elements.formTitle.textContent = 'Add a thaali';
  elements.cancelEditBtn.classList.add('hidden');
  elements.formMessage.textContent = '';
  elements.formMessage.className = 'form-message';
}

function editThaali(id) {
  const item = thaalis.find((entry) => entry.id === id);
  if (!item) return;
  elements.thaaliId.value = item.id;
  elements.formTitle.textContent = 'Edit thaali';
  elements.cancelEditBtn.classList.remove('hidden');
  document.getElementById('thaaliName').value = item.name || '';
  document.getElementById('personName').value = item.personName || '';
  document.getElementById('location').value = item.location || '';
  document.getElementById('role').value = item.role || '';
  document.getElementById('contactPhone').value = item.contactPhone || '';
  document.getElementById('volunteer').value = item.volunteer || '';
  document.getElementById('notes').value = item.notes || '';
  const checkboxes = document.querySelectorAll('input[name="deliveryDays"]');
  checkboxes.forEach((checkbox) => {
    checkbox.checked = Array.isArray(item.deliveryDays) && item.deliveryDays.includes(checkbox.value);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteThaali(id) {
  const item = thaalis.find((entry) => entry.id === id);
  if (!item) return;
  const canDelete = isAdmin() || item.createdBy === currentUser.uid;
  if (!canDelete) {
    alert('Only an admin or the creator can delete this thaali.');
    return;
  }
  if (!confirm(`Delete ${item.name}?`)) return;
  try {
    await db.collection('thaalis').doc(id).delete();
    await db.collection('settings').doc('deliveryOrder').set({
      needsReview: true,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      message: 'A thaali was removed. Please update your route if needed.'
    }, { merge: true });
  } catch (error) {
    alert(error.message);
  }
}

async function saveUserOrder() {
  const preferredOrder = thaalis
    .map((item) => item.id)
    .filter(Boolean);

  try {
    await db.collection('userPreferences').doc(currentUser.uid).set({
      preferredOrder,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('settings').doc('deliveryOrder').set({
      needsReview: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      message: 'Your delivery order is saved.'
    }, { merge: true });
  } catch (error) {
    alert(error.message);
  }
}

function moveItem(id, direction) {
  const currentIndex = thaalis.findIndex((item) => item.id === id);
  if (currentIndex === -1) return;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= thaalis.length) return;
  const reordered = [...thaalis];
  const [item] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, item);
  thaalis = reordered;
  renderDashboard();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.editThaali = editThaali;
window.deleteThaali = deleteThaali;
window.moveItem = moveItem;
