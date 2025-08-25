// /static/js/utils.js

/**
 * Formátuje sekundy do čitelného formátu HH:MM:SS.
 * @param {number | null | undefined} s - Počet sekund.
 * @returns {string} Formátovaný čas nebo "—".
 */
export function fmtSec(s) {
    if (s == null || isNaN(s)) return "—";
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return [h, m.toString().padStart(2, "0"), ss.toString().padStart(2, "0")].join(":");
}

/**
 * Převádí stav Klipperu na čitelný text a barvu.
 * @param {string | null | undefined} state - Stav z Klipperu.
 * @returns {{text: string, color: string}} Objekt s textem a barvou.
 */
export function mapReadableState(state) {
    const s = String(state || 'unknown').toLowerCase();
    switch (s) {
        case 'standby':
        case 'idle': return { text: 'Standby', color: '#2e7d32' };
        case 'printing': return { text: 'Process Running', color: '#b38900' };
        case 'paused': return { text: 'Paused', color: '#ef6c00' };
        case 'complete': return { text: 'Completed', color: '#1e88e5' };
        case 'error': return { text: 'Error', color: '#c62828' };
        default: return { text: (state || 'Unknown'), color: '#666' };
    }
}

/**
 * Formátuje velikost souboru v bajtech na čitelný formát (B, kB, MB).
 * @param {number | null | undefined} bytes - Velikost v bajtech.
 * @returns {string} Formátovaná velikost nebo "—".
 */
export function humanSize(bytes) {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Formátuje časové razítko (timestamp) na lokální čas.
 * @param {number | null | undefined} ts - Timestamp v sekundách.
 * @returns {string} Formátované datum a čas nebo "—".
 */
export function humanTime(ts) {
    try {
        return new Date(ts * 1000).toLocaleString();
    } catch {
        return "—";
    }
}