/**
 * Sesión compartida por todas las páginas (mismo sitio → mismo almacenamiento).
 * index.html entra con usuario y contraseña y guarda el token; las demás páginas llaman
 * Sesion.requerir('<pantalla>') al abrir. Quien decide los permisos es el Apps Script:
 * aquí solo se redirige para que cada quien vea lo suyo.
 */
const Sesion = (() => {
  const URL_API = 'https://script.google.com/macros/s/AKfycbyhfIDfclX_CXOMH_FBDZVaQKQ8Qe6oBWQKCvHoPIQgWsUcSBz7Q0BSmGba2LKBtSfq/exec';
  const K = 'planta_sesion';

  const leer    = () => { try { return JSON.parse(localStorage.getItem(K)); } catch(e) { return null; } };
  const guardar = s  => { try { localStorage.setItem(K, JSON.stringify(s)); } catch(e) {} };
  const borrar  = () => { try { localStorage.removeItem(K); } catch(e) {} };
  const alInicio = (motivo) => { location.replace('index.html' + (motivo ? '?m=' + motivo : '')); return new Promise(() => {}); };

  // POST al Apps Script con el token. Errores del servidor traen .servidor = true (y .code)
  async function api(body, ms = 25000) {
    const s = leer();
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms);
    try {
      // Sin headers → text/plain: Apps Script lo acepta sin preflight CORS
      const r = await fetch(URL_API, { method:'POST', signal:ctl.signal,
        body: JSON.stringify({ ...body, token: s?.token }) });
      let j;
      try { j = await r.json(); }
      catch(e) { throw Object.assign(new Error('El servidor no respondió como se esperaba (¿ya se publicó la nueva versión del Apps Script?)'), { servidor:true }); }
      if (j.status !== 'ok') {
        if (j.code === 'SESION') { borrar(); alInicio('vencida'); }
        throw Object.assign(new Error(j.message || 'Error del servidor'), { servidor:true, code:j.code });
      }
      return j;
    } finally { clearTimeout(to); }
  }

  // Revisa que haya sesión y que su perfil pueda ver esta pantalla; si no, regresa al inicio.
  // Sin señal se usa lo guardado (el servidor vuelve a revisar al enviar).
  async function requerir(pantalla) {
    let s = leer();
    if (!s?.token) return alInicio();
    try {
      const j = await api({ action:'yo' });
      s = { ...s, nombre:j.nombre, perfil:j.perfil, pantallas:j.pantallas, debe_cambiar:j.debe_cambiar };
      guardar(s);
    } catch(e) {
      if (e.servidor) throw e;
    }
    if (s.debe_cambiar || !(s.pantallas || []).includes(pantalla)) return alInicio();
    return s;
  }

  function salir() { borrar(); location.href = 'index.html'; }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  return { URL_API, api, requerir, salir, leer, guardar, borrar };
})();
