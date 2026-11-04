/**
 * Sesión compartida por todas las páginas (mismo sitio → mismo almacenamiento).
 * index.html entra con usuario y contraseña y guarda el token; las demás páginas llaman
 * Sesion.requerir('<pantalla>') al abrir. Quien decide los permisos es el Apps Script:
 * aquí solo se redirige para que cada quien vea lo suyo.
 *
 * Candado (Candados.gs): las pantallas con candado piden el PIN al abrir y se vuelven a cerrar tras
 * N minutos sin tocar nada. Si el servidor contesta CANDADO, aquí se pide el PIN y se reintenta solo.
 */
const Sesion = (() => {
  const URL_API = 'https://script.google.com/macros/s/AKfycbyhfIDfclX_CXOMH_FBDZVaQKQ8Qe6oBWQKCvHoPIQgWsUcSBz7Q0BSmGba2LKBtSfq/exec';
  const K = 'planta_sesion';
  const K_USO = 'planta_ultimo_uso';                    // última vez que se tocó la pantalla (todas las pestañas)

  const leer    = () => { try { return JSON.parse(localStorage.getItem(K)); } catch(e) { return null; } };
  const guardar = s  => { try { localStorage.setItem(K, JSON.stringify(s)); } catch(e) {} };
  const borrar  = () => { try { localStorage.removeItem(K); } catch(e) {} };
  const alInicio = (motivo) => { location.replace('index.html' + (motivo ? '?m=' + motivo : '')); return new Promise(() => {}); };

  // POST al Apps Script con el token. Errores del servidor traen .servidor = true (y .code);
  // si no se pudo llegar al servidor (sin señal, tardó demasiado) traen .red = true
  async function api(body, ms = 25000, reintento = false) {
    const s = leer();
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms);
    let j;
    try {
      // Sin headers → text/plain: Apps Script lo acepta sin preflight CORS
      const r = await fetch(URL_API, { method:'POST', signal:ctl.signal,
        body: JSON.stringify({ ...body, token: s?.token, llave: llaveVigente() || undefined }) })
        .catch(e => { throw Object.assign(new Error(e.name === 'AbortError' ? 'El servidor tardó demasiado en contestar. Intenta de nuevo.'
          : navigator.onLine ? 'No se pudo conectar con el servidor. Intenta de nuevo en un momento.' : 'Sin conexión. Revisa el internet e intenta de nuevo.'), { red:true }); });
      try { j = await r.json(); }
      catch(e) { throw Object.assign(new Error('El servidor no respondió como se esperaba (¿ya se publicó la nueva versión del Apps Script?)'), { servidor:true }); }
    } finally { clearTimeout(to); }
    if (j.status !== 'ok') {
      if (j.code === 'SESION') { borrar(); alInicio('vencida'); }
      if (j.code === 'CANDADO' && !reintento) {
        soltarLlave();
        if (await pedirPin(j.message)) return api(body, ms, true);
        throw Object.assign(new Error('Esta parte tiene candado: hace falta tu PIN'), { servidor:true, code:'CANDADO' });
      }
      throw Object.assign(new Error(j.message || 'Error del servidor'), { servidor:true, code:j.code });
    }
    if (j.llave) { const s2 = leer(); if (s2) { s2.llave = j.llave; guardar(s2); } usado(true); }
    return j;
  }

  // Revisa que haya sesión y que su perfil pueda ver esta pantalla; si no, regresa al inicio.
  // Sin señal se usa lo guardado (el servidor vuelve a revisar al enviar).
  async function requerir(pantalla) {
    let s = leer();
    if (!s?.token) return alInicio();
    try {
      const j = await api({ action:'yo' });
      s = { ...leer(), nombre:j.nombre, perfil:j.perfil, perfil_nombre:j.perfil_nombre, pantallas:j.pantallas, permisos:j.permisos,
            candados:j.candados, tiene_pin:j.tiene_pin };
      guardar(s);
    } catch(e) {
      if (e.servidor) throw e;
    }
    if (!(s.pantallas || []).includes(pantalla)) return alInicio();
    if (conCandado(pantalla)) {
      PANTALLA = pantalla;
      if (!llaveVigente() && !(await pedirPin())) return alInicio();
    }
    return s;
  }

  function salir() { borrar(); location.href = 'index.html'; }

  // ══ CANDADO ══════════════════════════════════════
  let PANTALLA = null;                                  // pantalla abierta, si está bajo candado
  let ultimoGuardado = 0, PIN_ABIERTO = null;
  const minutos = () => leer()?.candados?.minutos || 10;
  const conCandado = p => (leer()?.candados?.zonas || []).some(z => (z.pantallas || []).includes(p));
  const zonaActiva = clave => (leer()?.candados?.zonas || []).some(z => z.clave === clave);
  const ultimoUso = () => { try { return Number(localStorage.getItem(K_USO)) || 0; } catch(e) { return 0; } };
  function usado(ya) {
    const t = Date.now();
    if (!ya && t - ultimoGuardado < 10000) return;
    ultimoGuardado = t;
    try { localStorage.setItem(K_USO, String(t)); } catch(e) {}
  }
  function llaveVigente() {
    const s = leer();
    return s?.llave && Date.now() - ultimoUso() < minutos() * 60e3 ? s.llave : null;
  }
  function soltarLlave() {
    const s = leer();
    if (s?.llave) { delete s.llave; guardar(s); }
    window.dispatchEvent(new Event('candado-cerrado'));
  }
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => addEventListener(ev, () => usado(), { passive:true, capture:true }));
  // Tras N minutos sin tocar nada se cierra; si la pantalla es de candado, se tapa hasta que pongan el PIN
  setInterval(() => {
    const s = leer();
    if (!s?.llave || Date.now() - ultimoUso() < minutos() * 60e3) return;
    soltarLlave();
    if (PANTALLA) pedirPin('Se cerró por falta de uso.').then(ok => { if (!ok) alInicio(); });
  }, 15000);

  const LOCK = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z"/><path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0"/><path d="M8 11v-4a4 4 0 1 1 8 0v4"/></svg>';
  const CSS_IN = 'width:100%;font:inherit;font-size:17px;padding:10px 11px;border:1px solid var(--bd,#ccc);border-radius:3px;background:var(--in,var(--s2,#fff));color:var(--text,#111);margin-bottom:10px';

  // Ventana del PIN. Sin PIN todavía (o "cambiar"): se crea con la contraseña. Devuelve true si quedó abierto
  function pedirPin(motivo, cambiar = false) {
    if (PIN_ABIERTO) return PIN_ABIERTO;
    PIN_ABIERTO = new Promise(listo => {
      let crear = cambiar || leer()?.tiene_pin === false;
      const ov = document.createElement('div');
      ov.id = 'candado';
      ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg,#f3f3f0);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
      const pintar = (msg = '') => {
        ov.innerHTML = `<form style="background:var(--card,var(--s1,#fff));color:var(--text,#111);border:1px solid var(--bd,#ccc);border-top:3px solid var(--amb,#F7931E);border-radius:4px;max-width:360px;width:100%;padding:20px;font-family:inherit">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;color:var(--amb,#F7931E)">${LOCK}
            <b style="font-size:18px;color:var(--text,#111)">${cambiar ? 'Cambiar mi PIN' : crear ? 'Crea tu PIN' : 'Esta parte tiene candado'}</b></div>
          <p style="font-size:13px;color:var(--muted,#666);margin:0 0 14px">${crear
            ? 'De 4 a 6 números. Te lo pedirá al abrir las partes con candado. Para confirmar que eres tú, escribe también tu contraseña.'
            : (motivo ? motivo + ' ' : '') + 'Escribe tu PIN para abrirla.'}</p>
          ${crear ? `
            <input type="password" name="c" placeholder="Tu contraseña" autocomplete="current-password" style="${CSS_IN}">
            <input type="password" name="p" placeholder="PIN nuevo" inputmode="numeric" maxlength="6" autocomplete="off" style="${CSS_IN}">
            <input type="password" name="p2" placeholder="Repite el PIN" inputmode="numeric" maxlength="6" autocomplete="off" style="${CSS_IN}">`
          : `<input type="password" name="p" placeholder="PIN" inputmode="numeric" maxlength="6" autocomplete="off" style="${CSS_IN};font-size:22px;letter-spacing:.4em;text-align:center">`}
          <div data-k="msg" style="font-size:13px;color:var(--err,var(--red,#b42318));min-height:18px;margin-bottom:8px">${msg}</div>
          <div style="display:flex;gap:8px">
            <button type="button" data-k="no" style="flex:1;font:inherit;font-weight:600;padding:11px;border-radius:3px;border:1px solid var(--bd,#ccc);background:transparent;color:var(--text,#111);cursor:pointer">Cancelar</button>
            <button type="submit" data-k="si" style="flex:1;font:inherit;font-weight:600;padding:11px;border-radius:3px;border:1px solid var(--btn,#3D5A6C);background:var(--btn,#3D5A6C);color:#fff;cursor:pointer">${crear ? 'Guardar PIN' : 'Abrir'}</button>
          </div>
          ${crear ? '' : '<div style="font-size:12px;color:var(--muted,#666);margin-top:12px">¿Olvidaste tu PIN? Pide a un administrador que te lo quite en Usuarios y vuelve a crearlo.</div>'}
        </form>`;
        const f = ov.querySelector('form');
        setTimeout(() => f.querySelector('input').focus(), 30);
        f.querySelector('[data-k=no]').onclick = () => cerrar(false);
        f.onsubmit = async ev => {
          ev.preventDefault();
          const v = n => f.querySelector(`[name=${n}]`)?.value || '';
          const err = m => { f.querySelector('[data-k=msg]').textContent = m; };
          if (!/^\d{4,6}$/.test(v('p'))) return err('El PIN es de 4 a 6 números');
          if (crear && !v('c')) return err('Escribe tu contraseña');
          if (crear && v('p') !== v('p2')) return err('Los dos PIN no coinciden');
          const b = f.querySelector('[data-k=si]'); b.disabled = true; b.textContent = 'Revisando…';
          try {
            await api(crear ? { action:'pin_guardar', contrasena:v('c'), pin:v('p') } : { action:'desbloquear', pin:v('p') }, 25000, true);
            if (crear) { const s = leer(); if (s) { s.tiene_pin = true; guardar(s); } }
            cerrar(true);
          } catch(e) {
            if (e.code === 'SIN_PIN') { crear = true; return pintar('Todavía no tienes PIN: créalo.'); }
            b.disabled = false; b.textContent = crear ? 'Guardar PIN' : 'Abrir';
            err(e.servidor || e.red ? e.message : 'Error en la página: ' + e.message);
            const p = f.querySelector('[name=p]'); p.value = ''; p.focus();
          }
        };
      };
      const cerrar = ok => { ov.remove(); PIN_ABIERTO = null; listo(ok); };
      pintar();
      document.body.appendChild(ov);
    });
    return PIN_ABIERTO;
  }
  const cambiarPin = () => pedirPin('', true);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  return { URL_API, api, requerir, salir, leer, guardar, borrar, pedirPin, cambiarPin, conCandado, zonaActiva, llaveVigente };
})();
