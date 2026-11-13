/**
 * Agregados (arena, grava…): saldo teórico de cada material. Lo usa dashboard.html.
 * Los datos vienen de Agregados.gs (materiales, parámetros y movimientos) más Producciones e Insumos.
 *
 *   entradas = m³ de los viajes × densidad. Si la oficina capturó viajes de un día y material,
 *              los que mandó el operador para ese mismo día y material ya no cuentan (fueron el aviso previo).
 *   consumo  = toneladas de producto − cemento asfáltico medido (consumo_L × kg por litro).
 *              Sin cemento medido se usa pct_cemento. Lo que queda se reparte según la proporción.
 *              Los días que tienen reporte del operador pero aún no están en Producciones cuentan
 *              con lo que dijo el operador (preliminar).
 *   saldo    = último conteo (o inventario inicial) al cierre de su fecha + entradas − consumo de los días siguientes.
 */
const Agregados = (() => {
  const CEMENTO = 'CEMENTO ASFALTICO';
  const PROM_N  = 10;                          // producciones para el promedio de cemento y de toneladas por día
  const N   = v => parseFloat(v) || 0;
  const F10 = s => String(s || '').slice(0, 10);
  const clave = s => String(s || '').trim().toUpperCase();

  // Valor de un parámetro vigente en una fecha (la fila con el "desde" más reciente que no la pase)
  function param(pars, nombre, fecha, def) {
    const v = (pars || []).filter(p => p.parametro === nombre && F10(p.desde) <= (fecha || '9999'))
      .sort((a, b) => F10(a.desde).localeCompare(F10(b.desde))).pop();
    return v && v.valor != null && v.valor !== '' ? N(v.valor) : def;
  }

  // Producciones (una por id_prod) con su cemento medido o estimado, más los reportes que aún no se capturan
  function consumos(D, pars) {
    const kgL = f => param(pars, 'kg_por_litro_cemento', f, 1);
    const pct = f => param(pars, 'pct_cemento', f, 5.5);
    const por = {};
    (D.producciones || []).forEach(p => {
      if (!p.id_prod) return;
      const x = por[p.id_prod] = por[p.id_prod] || { id:p.id_prod, fecha:F10(p.fecha), tons:0, clientes:[] };
      x.tons += N(p.tons_real);
      if (p.cliente && !x.clientes.includes(p.cliente)) x.clientes.push(p.cliente);
    });
    const cemL = {};
    (D.insumos || []).filter(r => r.insumo === CEMENTO && r.tipo_uso === 'PRODUCCION')
      .forEach(r => cemL[r.id_prod] = (cemL[r.id_prod] || 0) + N(r.consumo_L));

    const lista = Object.values(por).filter(x => x.tons > 0).map(x => ({ ...x, cemento_L:cemL[x.id] || 0, fuente:'Producciones' }));
    const fechasProd = new Set(lista.map(x => x.fecha));
    (D.reportes || []).forEach(x => {
      const r = x.reporte || {};
      if (r.sin_produccion || fechasProd.has(F10(x.fecha))) return;
      const tons = (r.producciones || []).reduce((s, p) => s + N(p.tons_real), 0);
      if (!(tons > 0)) return;
      const cem = (r.tanques || []).filter(t => t.insumo === CEMENTO && !t.almacen).reduce((s, t) => s + N(t.consumo_L), 0);
      lista.push({ id:'Reporte ' + F10(x.fecha), fecha:F10(x.fecha), tons, clientes:(r.producciones || []).map(p => p.cliente).filter(Boolean),
                   cemento_L:Math.max(0, cem), fuente:'Reporte del operador', preliminar:true });
      fechasProd.add(F10(x.fecha));
    });

    return lista.map(x => {
      const medido = x.cemento_L > 0;
      const cem_t = medido ? x.cemento_L * kgL(x.fecha) / 1000 : x.tons * pct(x.fecha) / 100;
      const agr_t = Math.max(0, x.tons - cem_t);
      return { ...x, medido, cemento_t:cem_t, L_ton:medido ? x.cemento_L / x.tons : null, agregados_t:agr_t };
    }).sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.id).localeCompare(String(b.id)));
  }

  function calcular(D, hoy) {
    const A = D.agregados || {}, pars = A.parametros || [];
    const mats = (A.materiales || []).filter(m => m.activo !== false && clave(m.material));
    const sumaProp = mats.reduce((s, m) => s + N(m.proporcion), 0) || 1;
    const info = mats.map(m => ({
      material: clave(m.material),
      densidad: N(m.densidad_t_m3) || 1.5,
      m3_viaje: N(m.m3_por_viaje) || 14,
      prop:     N(m.proporcion) / sumaProp,
      minimo:   N(m.minimo_ton),
      inicial:  { fecha:F10(m.inicial_fecha), ton:N(m.inicial_ton) },
    }));
    const porMat = Object.fromEntries(info.map(m => [m.material, m]));
    const avisos = [];
    if (mats.length && Math.abs(mats.reduce((s, m) => s + N(m.proporcion), 0) - 1) > 0.001)
      avisos.push('Las proporciones de Agregados_Materiales no suman 100%: se repartieron en proporción a lo que dicen.');
    info.filter(m => !m.inicial.fecha).forEach(m => avisos.push(`${m.material}: falta la fecha del inventario inicial; cuenta desde el principio.`));

    // Movimientos: qué cuenta y cuántas toneladas son
    const movs = (A.movimientos || []).map(m => ({ ...m, fecha:F10(m.fecha), material:clave(m.material) }));
    const oficina = new Set(movs.filter(m => m.estado !== 'ANULADO' && m.tipo === 'ENTRADA' && m.origen === 'OFICINA')
                                .map(m => m.fecha + '|' + m.material));
    movs.forEach(m => {
      const mat = porMat[m.material];
      m.cuenta = m.estado !== 'ANULADO' && !!mat;
      if (m.estado === 'ANULADO') m.motivo = 'Anulado';
      else if (!mat) m.motivo = 'Material que no está en el catálogo';
      else if (m.tipo === 'ENTRADA' && m.origen === 'OPERADOR' && oficina.has(m.fecha + '|' + m.material)) {
        m.cuenta = false; m.motivo = 'La oficina capturó los folios de ese día';
      }
      m.ton = !mat ? null : m.tipo === 'CONTEO'
        ? (m.unidad === 'm3' ? N(m.cantidad) * mat.densidad : m.unidad === 'viajes' ? N(m.cantidad) * mat.m3_viaje * mat.densidad : N(m.cantidad))
        : N(m.m3) * mat.densidad;
    });

    // Reportes que traen viajes pero no tienen movimientos (si fallara el guardado en el servidor)
    const conMovs = new Set(movs.map(m => m.id_reporte).filter(Boolean));
    (D.reportes || []).filter(x => (x.reporte?.agregados || []).some(a => N(a.viajes) > 0) && !conMovs.has(x.id))
      .forEach(x => avisos.push(`El reporte del ${F10(x.fecha)} trae viajes de material que no se guardaron en Agregados_Movimientos.`));

    const cons = consumos(D, pars);
    const medidos = cons.filter(c => c.medido && !c.preliminar).slice(-PROM_N);
    const tonsMed = medidos.reduce((s, c) => s + c.tons, 0);
    const L_ton = tonsMed ? medidos.reduce((s, c) => s + c.cemento_L, 0) / tonsMed : null;
    const fraccion = L_ton != null ? Math.max(0, 1 - L_ton * param(pars, 'kg_por_litro_cemento', hoy, 1) / 1000)
                                   : 1 - param(pars, 'pct_cemento', hoy, 5.5) / 100;
    const ultimas = cons.slice(-PROM_N);
    const tonsDia = ultimas.length ? ultimas.reduce((s, c) => s + c.tons, 0) / ultimas.length : null;

    const materiales = info.map(m => {
      // Base: el conteo más reciente (o el inventario inicial). Cuenta lo que pasó DESPUÉS de su fecha
      const conteos = movs.filter(x => x.cuenta && x.tipo === 'CONTEO' && x.material === m.material)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.registrado).localeCompare(String(b.registrado)));
      const ult = conteos[conteos.length - 1];
      const base = ult && (!m.inicial.fecha || ult.fecha >= m.inicial.fecha)
        ? { fecha:ult.fecha, ton:ult.ton, fuente:'el conteo de ' + (ult.capturo || 'panel'), id:ult.id_mov }
        : { fecha:m.inicial.fecha, ton:m.inicial.ton, fuente:'el inventario inicial' };
      const desde = base.fecha || '0000-00-00';
      const entradas = movs.filter(x => x.cuenta && x.tipo === 'ENTRADA' && x.material === m.material && x.fecha > desde);
      const consumo = cons.filter(c => c.fecha > desde);
      const ent_t = entradas.reduce((s, x) => s + x.ton, 0);
      const con_t = consumo.reduce((s, c) => s + c.agregados_t * m.prop, 0);
      const saldo = base.ton + ent_t - con_t;
      const porTonProducto = fraccion * m.prop;                    // toneladas de este material por tonelada de producto
      const alcance = porTonProducto > 0 ? Math.max(0, saldo) / porTonProducto : null;
      return { ...m, base, entradas_t:ent_t, viajes:entradas.reduce((s, x) => s + N(x.viajes), 0), consumo_t:con_t,
               preliminar_t:consumo.filter(c => c.preliminar).reduce((s, c) => s + c.agregados_t * m.prop, 0),
               saldo_t:saldo, saldo_m3:saldo / m.densidad, saldo_viajes:saldo / (m.densidad * m.m3_viaje),
               alcance_t:alcance, bajo:saldo < m.minimo };
    });
    materiales.filter(m => m.saldo_t < 0).forEach(m =>
      avisos.push(`${m.material}: el saldo teórico salió negativo. Probablemente faltan entradas o hay que hacer un conteo.`));

    const conAlcance = materiales.filter(m => m.alcance_t != null);
    const limitante = conAlcance.length ? conAlcance.reduce((a, b) => b.alcance_t < a.alcance_t ? b : a) : null;
    // El que menos alcanza es el que hay que surtir primero (con un solo material no se marca)
    return {
      materiales, limitante, surtir: materiales.length > 1 ? limitante : null,
      alcance_t: limitante ? limitante.alcance_t : null,
      dias: limitante && tonsDia ? limitante.alcance_t / tonsDia : null,
      L_ton, fraccion, tonsDia, n_prom:medidos.length,
      consumos: cons, movimientos: movs, avisos,
      costo_ton: param(pars, 'costo_ton_producto', hoy, 300),
    };
  }

  // Resumen de un periodo (desde y hasta 'yyyy-mm-dd', los dos cuentan) con lo que devuelve calcular():
  //   por material: con cuánto empezó, cuánto entró, cuánto se usó y con cuánto terminó;
  //   día por día (solo los días con algo); quién lo trajo (camión / chofer) y de qué proveedor.
  // El saldo de cualquier día sale del último conteo (o del inventario inicial), contando hacia adelante o hacia atrás.
  const diaAntes = iso => { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d - 1);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const suma = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  function resumen(A, desde, hasta) {
    const enP = f => f >= desde && f <= hasta;
    const ent = A.movimientos.filter(m => m.cuenta && m.tipo === 'ENTRADA');
    const materiales = A.materiales.map(m => {
      const b = m.base.fecha || '0000-00-00';
      const e = ent.filter(x => x.material === m.material);
      const c = A.consumos.map(x => ({ fecha:x.fecha, t:x.agregados_t * m.prop, preliminar:!!x.preliminar }));
      const saldo = d => {
        const entre = f => d >= b ? f > b && f <= d : f > d && f <= b;
        const s = suma(e.filter(x => entre(x.fecha)), x => x.ton) - suma(c.filter(x => entre(x.fecha)), x => x.t);
        return m.base.ton + (d >= b ? s : -s);
      };
      const eP = e.filter(x => enP(x.fecha)), cP = c.filter(x => enP(x.fecha));
      return { material:m.material, inicial:saldo(diaAntes(desde)), final:saldo(hasta),
               viajes:suma(eP, x => N(x.viajes)), m3:suma(eP, x => N(x.m3)), entro_t:suma(eP, x => x.ton),
               usado_t:suma(cP, x => x.t), preliminar_t:suma(cP.filter(x => x.preliminar), x => x.t), saldo, e:eP, c:cP };
    });
    const fechas = [...new Set(materiales.flatMap(m => [...m.e, ...m.c].filter(x => x.t > 0.0005 || x.ton > 0).map(x => x.fecha)))].sort();
    const dias = fechas.map(f => ({ fecha:f, mats:materiales.map(m => {
      const e = m.e.filter(x => x.fecha === f), c = m.c.filter(x => x.fecha === f);
      return { material:m.material, viajes:suma(e, x => N(x.viajes)), m3:suma(e, x => N(x.m3)), entro_t:suma(e, x => x.ton),
               usado_t:suma(c, x => x.t), saldo:m.saldo(f) };
    }) }));
    // Quién lo trajo: por placa (los avisos del operador no traen placa) y por proveedor
    const agrupar = (clave, extra) => {
      const g = {};
      materiales.forEach(m => m.e.forEach(x => {
        const k = clave(x), r = g[k] = g[k] || { nombre:k, choferes:{}, mats:{}, viajes:0, m3:0 };
        r.viajes += N(x.viajes); r.m3 += N(x.m3);
        const mm = r.mats[m.material] = r.mats[m.material] || { viajes:0, m3:0 };
        mm.viajes += N(x.viajes); mm.m3 += N(x.m3);
        if (extra && x.chofer) r.choferes[String(x.chofer).trim()] = (r.choferes[String(x.chofer).trim()] || 0) + N(x.viajes);
      }));
      return Object.values(g).map(r => ({ ...r, chofer:Object.entries(r.choferes).sort((a, b) => b[1] - a[1]).map(([c]) => c).join(', ') }))
        .sort((a, b) => b.viajes - a.viajes || a.nombre.localeCompare(b.nombre));
    };
    const camiones = agrupar(x => x.placa ? String(x.placa).trim().toUpperCase()
      : x.origen === 'OPERADOR' ? 'Aviso del operador (sin placa)' : 'Sin placa', true);
    const proveedores = agrupar(x => String(x.procedencia || '').trim() || 'Sin proveedor anotado');
    return { desde, hasta, materiales, dias, camiones, proveedores };
  }

  return { calcular, consumos, param, resumen };
})();
