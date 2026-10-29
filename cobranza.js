/**
 * Cobranza: saldo por cliente = lo producido (Producciones.ingreso_total) − lo pagado (hoja Pagos).
 * Lo usan dashboard.html y pagos.html para que las dos pantallas den exactamente lo mismo.
 *
 * Cada pago se aplica primero a la producción que diga (aplicado_a) y lo que sobre, o si no dice,
 * a la producción pendiente más antigua. Lo que quede sin aplicar es saldo a favor (anticipo).
 * Sin IVA ni días de crédito por ahora: el atraso se mide por antigüedad.
 */
const Cobranza = (() => {
  const EXCLUIDOS = ['INTERNO'];               // no son clientes de venta
  const TOL = 0.5;                             // pesos: menos que esto se considera liquidado
  const TRAMOS = [[0, 15, '0–15 días'], [16, 30, '16–30 días'], [31, 60, '31–60 días'], [61, Infinity, 'Más de 60 días']];

  const N    = v => parseFloat(v) || 0;
  const F10  = s => String(s || '').slice(0, 10);
  const clave = s => String(s || '').trim().toUpperCase();
  const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
  const porFecha = (a, b, k) => a.fecha.localeCompare(b.fecha) || String(a[k]).localeCompare(String(b[k]));

  function calcular(producciones, pagos, hoy) {
    const cli = {};
    const cliente = nombre => cli[clave(nombre)] = cli[clave(nombre)] ||
      { cliente:String(nombre).trim().toUpperCase(), cargos:[], pagos:[] };

    // Cargos: una producción con varios clientes genera un cargo para cada uno
    (producciones || []).filter(p => p.cliente && !EXCLUIDOS.includes(clave(p.cliente))).forEach(p => {
      const c = cliente(p.cliente);
      let g = c.cargos.find(x => x.id_prod === p.id_prod);
      if (!g) c.cargos.push(g = { id_prod:p.id_prod, fecha:F10(p.fecha), tons:0, importe:0, pagado:0 });
      g.tons += N(p.tons_real); g.importe += N(p.ingreso_total);
    });
    (pagos || []).filter(x => x.estado !== 'ANULADO' && x.cliente && !EXCLUIDOS.includes(clave(x.cliente)))
      .forEach(x => cliente(x.cliente).pagos.push({ ...x, fecha:F10(x.fecha), monto:N(x.monto), aplicaciones:[], resto:N(x.monto) }));

    const aplicar = (p, g) => {
      const a = Math.min(p.resto, g.importe - g.pagado);
      if (a > 0.005) { g.pagado += a; p.resto -= a; p.aplicaciones.push({ id_prod:g.id_prod, monto:a }); }
    };

    return Object.values(cli).map(c => {
      c.cargos.sort((a, b) => porFecha(a, b, 'id_prod'));
      c.pagos.sort((a, b) => porFecha(a, b, 'id_pago'));
      // 1) Pagos que dicen a qué producción van
      c.pagos.filter(p => p.aplicado_a).forEach(p => { const g = c.cargos.find(x => x.id_prod === p.aplicado_a); if (g) aplicar(p, g); });
      // 2) Lo que sobre y los pagos sin destino: a lo más antiguo
      c.pagos.forEach(p => { for (const g of c.cargos) { if (p.resto <= 0.005) break; aplicar(p, g); } });

      const producido = c.cargos.reduce((s, g) => s + g.importe, 0);
      const pagado    = c.pagos.reduce((s, p) => s + p.monto, 0);
      const tramos    = TRAMOS.map(([, , n]) => ({ nombre:n, monto:0 }));
      c.cargos.forEach(g => {
        g.pendiente = Math.max(0, g.importe - g.pagado);
        g.estado = g.pendiente <= TOL ? 'Pagada' : g.pagado > TOL ? 'Parcial' : 'Pendiente';
        g.dias = g.pendiente > TOL ? Math.max(0, dias(g.fecha, hoy)) : 0;
        if (g.pendiente > TOL) tramos[TRAMOS.findIndex(([a, b]) => g.dias >= a && g.dias <= b)].monto += g.pendiente;
      });
      const pendientes = c.cargos.filter(g => g.pendiente > TOL);
      const saldo = producido - pagado;
      const masViejo = pendientes.length ? Math.max(...pendientes.map(g => g.dias)) : 0;
      return {
        ...c, producido, pagado, saldo, tramos, pendientes, masViejo,
        aFavor: c.pagos.reduce((s, p) => s + p.resto, 0),
        ultimoPago: c.pagos.length ? c.pagos[c.pagos.length - 1].fecha : null,
        estado: saldo < -TOL ? { t:'Saldo a favor', cls:'tb' }
              : saldo <= TOL ? { t:'Al corriente',  cls:'tb' }
              : masViejo > 60 ? { t:'Muy atrasado', cls:'ta' }
              : masViejo > 30 ? { t:'Atrasado',     cls:'tm' }
              :                 { t:'Pendiente',    cls:'tm' },
      };
    });
  }

  // Estado de cuenta: producciones (cargo) y pagos (abono) en orden, con el saldo después de cada uno
  function movimientos(c) {
    const m = [
      ...c.cargos.map(g => ({ fecha:g.fecha, tipo:'cargo', ref:g.id_prod, cargo:g.importe, abono:0, g })),
      ...c.pagos.map(p  => ({ fecha:p.fecha, tipo:'pago',  ref:p.id_pago, cargo:0, abono:p.monto, p })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.tipo === 'cargo' ? -1 : 1) || String(a.ref).localeCompare(String(b.ref)));
    let s = 0;
    m.forEach(x => { s += x.cargo - x.abono; x.saldo = s; });
    return m;
  }

  return { calcular, movimientos, TRAMOS, TOL, EXCLUIDOS };
})();
