Hola. Vengo de varias sesiones trabajando el sistema de la planta de asfalto de CAO Centauro y quiero seguir solo en esta. Primero lee esto y los archivos, y dime si entendiste; luego avanzamos.

## Quiénes somos
- Yo soy Luis, el desarrollador. Mi tío Pepe (dueño) y mi prima Abigail son admins. Elizabeth es la secretaria (captura). Emmanuel es el operador de la planta.

## Son 3 negocios (importante, el sistema todavía no lo distingue)
Todo se llama "CAO Centauro" porque la planta es el único negocio con nombre oficial, pero en realidad son tres:
1. **Planta de asfalto**: lo que ya está hecho en el sistema.
2. **Viajes locales**: acarreos de material.
3. **Intermediario sindicatos**: intermediarios entre constructoras y sindicatos.

- Los administrativos (mi tío, Abigail, Elizabeth y yo) trabajan en los tres. Los operativos sí pertenecen a un negocio específico, como Emmanuel a la planta.
- El sistema tiene que poder separar por negocio: clientes, cobranza, empleados, insumos, gastos y utilidad. Más adelante te doy el detalle de cada uno.
- El siguiente negocio a implementar es **viajes locales**: quiero llevar un mejor control en general. Después sigue intermediario sindicatos. Mientras tanto se sigue mejorando la planta.
- Antes de programar, propónme cómo meter el concepto de "negocio" sin romper lo que ya funciona. Por ejemplo: una columna de negocio en las hojas, qué negocios ve cada usuario o perfil, el menú y el panel filtrados por negocio. Lo que hoy existe sería "Planta de asfalto".

## Dónde está todo
- Carpeta de trabajo: `C:\Users\luisl\OneDrive\Planta Asfalto CAO Centauro`
- Sitio: https://sistema.caocentauro.com (GitHub Pages, repo CAOCentauro/Planta_Asfalto). Yo subo los archivos a mano a GitHub.
- Backend: Google Sheets + Apps Script (solo doPost). Los .gs están en `sistem_sheets/appscript/`: Code.gs, Usuarios.gs, Perfiles.gs, Captura.gs, Compras.gs, Pagos.gs, Nomina.gs, Importar.gs (este último es del import viejo de Excel, ya casi no se usa).
- Maqueta y Excel de nómina: `C:\Users\luisl\OneDrive\SISTEMA_UNIFICADO\Nomina\` (maqueta/nomina.html, Nomina.xlsx).
- Export del Sheets para ver estructura y fórmulas: `C:\Users\luisl\Downloads\Planta de asfalto (2).xlsx`
- Chat de WhatsApp del operador (ago–oct 2026): `C:\Users\luisl\Downloads\Planta de Asfalto\chat.txt`

## Pantallas que ya existen
- `index.html`: login, menú con íconos (Tabler, dentro del archivo) y cambio de contraseña OPCIONAL.
- `dashboard.html`: panel (producción, finanzas, reporte PDF, WhatsApp 525566852302, desglose de gastos, seguimiento de insumos, "Reportes operador", "Pagos").
- `registro.html`: captura diaria del operador A CIEGAS (no ve cierres anteriores ni L/ton, para que sea honesto) + pestaña Compras (facturas → Entradas_Material).
- `pagos.html` + `cobranza.js`: pagos de clientes, aplicación FIFO, sin IVA por ahora, INTERNO se ignora.
- `usuarios.html`: usuarios y "Permisos por perfil" (Perfiles.gs; solo el desarrollador edita).
- `nomina.html`: préstamos, faltas y pago de los sábados.
- `sesion.js` (sesión/token compartido), `estilo.css` (estilo común: Outfit/Inter, naranja #F7931E + azul pizarra, esquinas poco redondeadas, puntitos de color en vez de íconos dentro de las pantallas), `sw.js` (va en planta-v13), `compras.html` (solo redirige a registro.html?tab=compras).
- NO subir: `registro_avance.html`, `dashboard_pruebas.html`.

## Lo último que se hizo (3-nov-2026), falta subirlo a GitHub
- registro.html: tanques "Diésel guardado (bidones)" y "Gasolina guardada (bidones)" (uso BIDONES, solo inicio/término, no cuentan como consumo, entran al cuadre); "+ Nota" en cada tanque; "Ton (aprox.)".
- dashboard.html: muestra bidones (guardó/sacó), notas por tanque y "≈ X ton aprox.".
- sw.js → planta-v13. Los bidones NO se capturan en la hoja Insumos (ahí todo se suma como costo).

## Control de agregados (3-nov-2026, sesión 2)
- Agregados.gs (nuevo) + agregados.js (nuevo, cálculo en el panel). Hojas: Agregados_Materiales (densidad, m³ por viaje, proporción, inventario inicial, mínimo — se editan a mano), Agregados_Parametros (pct_cemento de respaldo, kg_por_litro_cemento, costo_ton_producto, cada uno con "desde"), Agregados_Movimientos (entradas y conteos; se anulan, no se borran).
- Consumo = toneladas − cemento asfáltico MEDIDO (1 L ≈ 1 kg); el % solo si no hay medición. Se reparte por proporción.
- Emmanuel: tarjeta "Material que entró" (viajes y m³ por material) → cuenta al enviar el reporte. Elizabeth: Compras → Arena / Grava 3/4, un renglón por folio (con "del folio … al …"). Si la oficina captura un día+material, lo del operador ya no cuenta.
- Panel › Insumos: saldo por material, "te alcanza para X ton", cuál surtir primero, "Ajustar saldo" (conteo del montón: el saldo vuelve a contar desde ahí), anular, consumo por producción.
- El $300 ya no está fijo: Producciones › gasto_material toma costo_ton_producto (agregadosConfigurar cambió las fórmulas).
- Casita en lugar del botón "Inicio" en todas las pantallas. sw.js → planta-v14.

## Pendientes
**Lo grande que sigue:** separar el sistema por negocio y empezar con viajes locales (ver arriba). Después, intermediario sindicatos.

**Pendientes de la planta** (hay que decidir junto con lo de viajes locales cuál va primero; agregados ya me lo está pidiendo mi tío):
1. **Fotos desde el registro**: tickets de báscula y facturas que hoy Emmanuel manda por WhatsApp. Subirlas a una carpeta de Drive vía Apps Script (achicadas en el celular, ~300 KB), guardar el enlace en el reporte; que también sirva en la pestaña Compras. Sin señal, que esperen en el celular. Hay que reautorizar el script para Drive.
2. **Gas LP**: capturarlo en Compras en pesos y repartirlo entre las producciones de la semana, igual que la nómina, para el análisis financiero.
3. ~~**Control de agregados (arena y grava)**~~ HECHO el 3-nov (ver arriba). Lo que se pidió:
   - Por ahora solo arena y grava 3/4, pero la arquitectura debe permitir agregar más materiales.
   - Entradas: viajes × 14 m³ × densidad (dame un campo editable por material).
   - Consumo: toneladas de producto × (1 − 5.5/5.6% de cemento asfáltico); lo que sobra va mitad arena, mitad grava.
   - Costo: $300 por tonelada de PRODUCTO. Hoy está fijo en Producciones (`=tons_real*300`); quiero moverlo a la hoja Insumos.
   - Objetivo: saber "¿para cuántas toneladas de producto final me alcanza?" y cuál insumo está más bajo (surtir primero).
   - Inventario inicial: por ahora un valor inventado; luego lo cambio en el Sheets.
   - Debe permitir ajustes manuales del saldo cuando mi tío estime el montón.
   - Los viajes los captura Emmanuel dentro de registro.html (sin pantalla nueva); el dashboard ya tiene restos de "Material que entró".
4. Nómina en el Panel: que la utilidad del dashboard tome la nómina real (quedó pendiente en la sesión de nómina).
4b. **Pantallas menos a la vista (seguridad)**: que algunas pantallas o secciones, como Pagos de clientes, no estén tan expuestas. Falta definir si es: escondidas en el menú ("Más opciones"), pedir contraseña o PIN otra vez al abrirlas, montos ocultos hasta tocarlos, o que se cierren solas tras unos minutos sin uso.
5. Más adelante: IVA y días de crédito de clientes (confirmar con Abigail), fase 2 de pagos (estado de cuenta PDF, WhatsApp al cliente), cuentas por pagar a proveedores (idea del "Saldo pendiente" de TRIBACO).

## Cómo me gusta trabajar
- Explícame primero la idea y espera mi ok antes de cambios grandes.
- Pocas pantallas: prefiero pestañas o secciones dentro de las que ya hay.
- Antes de decirme que algo funciona, pruébalo (hay un servidor simulado: un mock de fetch antepuesto a sesion.js, servido con `python -I -m http.server` en localhost).
- Dime siempre qué archivos subir a GitHub y qué pegar en el Apps Script.
