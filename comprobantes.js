/**
 * Comprobantes de pago (fotos o PDF) — los usan pagos.html (planta) y viajes.html (Cobranza de viajes).
 * Las fotos se achican antes de subirlas; los PDF van tal cual (máximo 8 MB). Se suben uno por uno a un pago
 * ya guardado. Se ven dentro de la página: el servidor los manda solo con sesión y permiso (no hay enlace público).
 */
const Comprobantes = (() => {
  const MAX = 8 * 1024 * 1024, LADO = 1800;
  const ACEPTA = 'image/*,application/pdf,.pdf';

  const leerB64 = blob => new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => mal(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(blob);
  });
  // Foto → JPG de máximo 1800 px por lado
  async function achicar(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => mal(new Error('no se pudo abrir la foto (prueba con una captura de pantalla o en JPG)'));
        i.src = url;
      });
      const k = Math.min(1, LADO / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((ok, mal) => c.toBlob(b => b ? ok(b) : mal(new Error('no se pudo preparar la foto')), 'image/jpeg', 0.82));
    } finally { URL.revokeObjectURL(url); }
  }
  // File → { nombre, tipo, datos (base64) }
  async function preparar(file) {
    const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!pdf && !/^image\//.test(file.type)) throw new Error('solo se aceptan fotos o PDF');
    const blob = pdf ? file : await achicar(file);
    if (blob.size > MAX) throw new Error('pesa más de 8 MB');
    return { nombre: pdf ? file.name : file.name.replace(/\.[^.]+$/, '') + '.jpg', tipo: pdf ? 'application/pdf' : 'image/jpeg', datos: await leerB64(blob) };
  }
  // Sube los archivos al pago, uno por uno. api(body) = la llamada de la página; avance(i, n, nombre) para mostrar cómo va.
  // → { subidos, errores:[texto], comprobantes (la lista del pago después del último que sí subió) }
  async function subir(api, accion, idPago, files, avance) {
    const lista = [...files], errores = [];
    let subidos = 0, comprobantes = null;
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      if (avance) avance(i + 1, lista.length, f.name);
      try {
        const r = await api({ action:accion, id_pago:idPago, archivo:await preparar(f) });
        comprobantes = r.comprobantes; subidos++;
      } catch(e) { errores.push(`${f.name}: ${e.message}`); }
    }
    return { subidos, errores, comprobantes };
  }

  // Ver un comprobante encima de la página (foto o PDF), con Descargar y Cerrar
  async function ver(api, accion, idPago, c) {
    const ov = document.createElement('div');
    ov.className = 'cp-ov';
    ov.innerHTML = `<div class="cp-c" role="dialog"><div class="cp-t"><b></b><span><a class="cp-b" hidden>Descargar</a>
      <button class="cp-b" data-x>Cerrar</button></span></div><div class="cp-v">Abriendo el comprobante…</div></div>`;
    ov.querySelector('b').textContent = c.nombre || 'Comprobante';
    let url = null;
    const tecla = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cerrar(); } };
    const cerrar = () => { ov.remove(); if (url) URL.revokeObjectURL(url); removeEventListener('keydown', tecla, true); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) cerrar(); });
    addEventListener('keydown', tecla, true);
    document.body.appendChild(ov);
    try {
      const r = await api({ action:accion, id_pago:idPago, archivo:c.id });
      if (!ov.isConnected) return;
      const bin = atob(r.datos || ''), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      url = URL.createObjectURL(new Blob([u8], { type:r.tipo }));
      const v = ov.querySelector('.cp-v');
      v.innerHTML = r.tipo === 'application/pdf'
        ? `<iframe src="${url}" title="Comprobante"></iframe>`
        : `<img src="${url}" alt="Comprobante">`;
      const a = ov.querySelector('a');
      a.href = url; a.download = r.nombre || 'comprobante'; a.hidden = false;
    } catch(e) {
      if (ov.isConnected) ov.querySelector('.cp-v').textContent = 'No se pudo abrir: ' + e.message;
    }
  }
  const abierto = () => !!document.querySelector('.cp-ov');

  // Estilos del visor (iguales en las dos páginas; usan los colores de cada una si existen)
  const css = document.createElement('style');
  css.textContent = `.cp-ov{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2000;display:flex;align-items:center;justify-content:center;padding:12px}
.cp-c{background:var(--card,var(--s1,#fff));color:var(--text,#111);width:min(900px,100%);height:min(92vh,100%);display:flex;flex-direction:column;border:1px solid var(--bd,#ccc)}
.cp-t{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--bd,#ccc);font-size:14px}
.cp-t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-t span{display:flex;gap:6px;flex-shrink:0}
.cp-b{font:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--bd,#ccc);background:transparent;color:inherit;cursor:pointer;text-decoration:none}
.cp-v{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:8px;font-size:14px}
.cp-v img{max-width:100%;max-height:100%;object-fit:contain}
.cp-v iframe{width:100%;height:100%;border:0;background:#fff}`;
  document.head.appendChild(css);

  return { preparar, subir, ver, abierto, ACEPTA };
})();
