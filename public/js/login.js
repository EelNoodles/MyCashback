// Login page: uses Firebase Web SDK (modular, via CDN ESM) to obtain ID token,
// then exchanges it for a server-side session cookie.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const baseUrl = (window.APP_CONFIG && window.APP_CONFIG.baseUrl) || '';
const cfg = window.FIREBASE_CONFIG || {};

const errBox = document.getElementById('loginError');
const form = document.getElementById('loginForm');
const submitBtn = document.getElementById('loginBtn');

function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = !!loading;
  submitBtn.querySelectorAll('[data-state="idle"]').forEach((el) => el.classList.toggle('hidden', !!loading));
  submitBtn.querySelectorAll('[data-state="loading"]').forEach((el) => el.classList.toggle('hidden', !loading));
}
function showError(msg) {
  if (!errBox) return;
  if (!msg) { errBox.classList.add('hidden'); errBox.textContent = ''; return; }
  errBox.classList.remove('hidden');
  errBox.textContent = msg;
}

function readableAuthError(err) {
  const code = err && err.code ? err.code : '';
  switch (code) {
    case 'auth/invalid-email': return 'Email 格式不正確';
    case 'auth/user-not-found': return '帳號不存在 (將自動為您註冊新帳號)';
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return '帳號或密碼錯誤';
    case 'auth/weak-password': return '密碼過於簡單，請至少 6 碼';
    case 'auth/email-already-in-use': return '此 Email 已註冊，請改用登入';
    default: return (err && err.message) || '登入失敗';
  }
}

if (!cfg.apiKey) {
  showError('Firebase 尚未在伺服器設定，請於 .env 填入 FIREBASE_API_KEY 等變數。');
}

const app = cfg.apiKey ? initializeApp(cfg) : null;
const auth = app ? getAuth(app) : null;

async function exchangeForSession(user) {
  const idToken = await user.getIdToken(true);
  const res = await fetch(baseUrl + '/auth/sessionLogin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ idToken })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || data.error || `Server rejected login (${res.status})`);
  }
  window.location.href = (baseUrl || '') + '/';
}

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!auth) { showError('Firebase 未設定'); return; }
  showError('');
  setLoading(true);

  const email = document.getElementById('email').value.trim();
  const pwd = document.getElementById('password').value;

  try {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email, pwd);
    } catch (err) {
      // Auto-create on user-not-found for friction-free first login
      if (err && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')) {
        try {
          cred = await createUserWithEmailAndPassword(auth, email, pwd);
        } catch (err2) {
          if (err2.code === 'auth/email-already-in-use') {
            // Original error was real (wrong password); rethrow original
            throw err;
          }
          throw err2;
        }
      } else { throw err; }
    }
    await exchangeForSession(cred.user);
  } catch (err) {
    showError(readableAuthError(err));
  } finally {
    setLoading(false);
  }
});
