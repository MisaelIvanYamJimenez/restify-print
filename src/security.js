const { ALLOWED_ORIGINS } = require('./config');
const Store = require('electron-store').default;

const store = new Store();

function getToken() {
  return store.get('auth_token', null);
}

function setToken(token) {
  store.set('auth_token', token);
}

function clearToken() {
  store.delete('auth_token');
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed));
}

function isTokenValid(token) {
  const saved = store.get('auth_token');
  if (!saved) return false;
  return token === saved;
}

function validateRequest(origin, token) {
  if (!isOriginAllowed(origin)) {
    return { valid: false, error: 'Origin no permitido' };
  }
  if (!isTokenValid(token)) {
    return { valid: false, error: 'Token invalido' };
  }
  return { valid: true };
}

module.exports = { getToken, setToken, clearToken, isOriginAllowed, validateRequest };
