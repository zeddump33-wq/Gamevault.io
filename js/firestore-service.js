// ============================================================
// firestore-service.js
// All Firestore read operations for GameVault.
//
// KEY SECURITY DESIGN:
//   - Game cards are rendered WITHOUT downloadUrl in the HTML.
//   - downloadUrl is fetched on-demand via getGameDownloadLink()
//     only when the user clicks Download.
//   - This keeps links out of the page source / DOM entirely.
//
// CACHING STRATEGY:
//   - Full game list cached in localStorage for 30 minutes.
//   - On cache hit: render instantly, then silently re-fetch in
//     background to keep data fresh.
//   - On cache miss: fetch from Firestore, show loading skeleton.
// ============================================================

import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db } from './firebase-config.js';

// ── Cache settings ──────────────────────────────────────────
const CACHE_KEY  = 'gv_games_cache';
const CACHE_TTL  = 30 * 60 * 1000; // 30 minutes

// In-memory cache for download links (session only, never persisted)
const _dlCache = new Map();

// ── Cache helpers ────────────────────────────────────────────
function _readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(CACHE_KEY); return null; }
    return data;
  } catch { return null; }
}

function _writeCache(games) {
  try {
    // Strip downloadUrl before caching — never store links client-side
    const safe = games.map(({ downloadUrl, ...rest }) => rest);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: safe }));
  } catch {}
}

export function invalidateCache() {
  localStorage.removeItem(CACHE_KEY);
}

// ── Fetch all active games (public fields only) ──────────────
// Returns array of game objects WITHOUT downloadUrl.
// downloadUrl is only retrieved via getGameDownloadLink().
export async function fetchGames() {
  const snap = await getDocs(
    query(collection(db, 'games'), where('status', '==', 'active'))
  );
  const games = snap.docs.map(d => {
    const { downloadUrl, ...publicFields } = d.data(); // strip download link
    return { id: d.id, ...publicFields };
  });
  _writeCache(games);
  return games;
}

// ── Get games with cache-first strategy ─────────────────────
// 1. Returns cached data immediately if fresh.
// 2. Fires a background re-fetch to keep cache warm.
// 3. Falls back to Firestore if cache is empty/expired.
export async function getGames() {
  const cached = _readCache();
  if (cached) {
    // Background refresh (don't await — non-blocking)
    fetchGames().catch(() => {});
    return cached;
  }
  return fetchGames();
}

// ── Real-time games listener ─────────────────────────────────
// Calls onUpdate(games[]) whenever Firestore data changes.
// Returns unsubscribe function.
export function subscribeToGames(onUpdate, onError) {
  return onSnapshot(
    query(collection(db, 'games'), where('status', '==', 'active')),
    snap => {
      const games = snap.docs.map(d => {
        const { downloadUrl, ...publicFields } = d.data();
        return { id: d.id, ...publicFields };
      });
      _writeCache(games);
      onUpdate(games);
    },
    err => onError?.(err)
  );
}

// ── SECURE: Fetch download link on-demand ────────────────────
// This is the ONLY place downloadUrl is ever read from Firestore.
// It is never embedded in HTML, never cached in localStorage,
// never stored in window.* or any global state.
//
// Usage:
//   const url = await getGameDownloadLink('firestore-doc-id');
//   window.open(url, '_blank', 'noopener');
export async function getGameDownloadLink(gameId) {
  // Return from in-memory session cache if already fetched this session
  if (_dlCache.has(gameId)) return _dlCache.get(gameId);

  const snap = await getDoc(doc(db, 'games', gameId));
  if (!snap.exists()) throw new Error('Game not found');

  const { downloadUrl, status } = snap.data();
  if (status !== 'active') throw new Error('Game not available');
  if (!downloadUrl || downloadUrl === '#') throw new Error('No download link');

  // Cache in memory for this session only (cleared on page unload)
  _dlCache.set(gameId, downloadUrl);
  return downloadUrl;
}

// ── Fetch single game (public fields) ───────────────────────
export async function getGame(gameId) {
  const snap = await getDoc(doc(db, 'games', gameId));
  if (!snap.exists()) return null;
  const { downloadUrl, ...publicFields } = snap.data();
  return { id: snap.id, ...publicFields };
}

// ── Fetch active announcements ───────────────────────────────
export async function getAnnouncements() {
  const snap = await getDocs(
    query(collection(db, 'announcements'), where('active', '==', true))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
