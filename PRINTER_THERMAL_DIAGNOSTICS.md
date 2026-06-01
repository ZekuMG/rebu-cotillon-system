# Diagnóstico: Motor de Térmica se Mueve Pero No Sale Papel

## Cambios Implementados

### 1. **electron-main.cjs** — Configuración de Página Térmica
- ✅ Agregado: `isThermal: true` en opciones de impresión
- ✅ Nuevo: `pageSize: { width: 80000, height: 297000 }` (80mm × 297mm en micrómetros)
- ✅ Mejora: Errores específicos para térmica con diagnóstico de conexión
- ✅ Debug: Información sobre detectción de impresoras

### 2. **App.jsx** — Parámetros de Impresión
- ✅ Cambio: `handlePrintTicket()` ahora pasa `isThermal: true` a `printSilent()`
- ✅ Mejorado: Tiempo de espera aumentado de 120ms a 200ms para render
- ✅ Confirmado: `exportPdfData` se limpia antes, asegurando que `TicketPrintLayout` sea renderizado

### 3. **TicketPrintLayout.jsx** — Contenido Correcto (SIN CAMBIOS)
- ✅ Ya configurado para: 24 caracteres de ancho (80mm térmico)
- ✅ Ya usa: `<pre>` monoespaciado con CSS `@media print` correcto

---

## Paso 1: Verificar Configuración de Windows

### A) Revisar Impresora Predeterminada
```powershell
# Abrir Configuración > Dispositivos > Impresoras
# 1. Verifica que tu térmica aparezca
# 2. Click derecho > "Establecer como impresora predeterminada"
# 3. Nota el nombre exacto (ej: "Star Micronics TSP100")
```

### B) Verificar Tamaño de Papel en Windows
```
1. Configuración > Dispositivos > Impresoras > [Tu Térmica]
2. Click en "Preferencias de impresión"
3. Verificar tamaño de papel: DEBE ser "Custom 80mm" o similar
   - Si no existe, crear uno: 80mm × 297mm
   - Márgenes: 0mm en todos lados
4. Prueba de impresión: Imprimir página de prueba
```

### C) Verificar Driver
```powershell
# En PowerShell (Admin):
Get-Printer -Name "*" | Where-Object {$_.Name -like "*Star*" -or $_.Name -like "*Thermal*"}

# Esperar salida como:
# Name              : Star Micronics TSP100
# Default           : True
# Status            : Normal
# Shared            : False
```

---

## Paso 2: Diagnosticar Conexión Física

### A) Conexión USB
- ✅ Cable USB conectado y visible en Administrador de dispositivos
- ✅ En `Dispositivos > Puertos (COM y LPT)` debería aparecer "USB Device" o similar
- ✅ SIN marcas de advertencia (triángulo amarillo)

### B) Encendido y Papel
- ✅ Impresora térmica encendida
- ✅ Luz indicadora verde (no roja/ámbar)
- ✅ Papel dentro, correctamente cargado
- ✅ Puerta de papel cerrada

### C) Prueba Manual desde Windows
```
1. Abre Notepad
2. Escribe algo simple (ej: "TEST 123")
3. Archivo > Imprimir
4. Selecciona tu térmica
5. Márgenes: 0 en todos lados
6. Size: 80mm custom
7. Imprime
```
**Si aquí ya falla:** Problema es conexión física o driver, NO Rebu.

---

## Paso 3: Verificar Rebu

### A) Testear Impresión Térmica
```
1. Reinicia Electron: npm run electron:dev
2. Crea una venta test
3. Click "Imprimir ticket"
4. Espera mensaje en Rebu
```

### B) Interpretar Mensajes de Error

| Mensaje | Significado | Solución |
|---------|-------------|----------|
| **"Impresora térmica sin respuesta. Verificar..."** | Timeout 15s | Ver Paso 1B (papel, driver, cola) |
| **"No hay impresora predeterminada"** | Windows no detecta una | Ver Paso 1A |
| **"No se encontró la impresora XYZ"** | Nombre incorrecto | Ver Paso 1A (verificar nombre exacto) |
| **"Thermal error: ..."** | Windows rechaza el formato | Ver Paso 1B (size, márgenes) |

### C) Debug en Browser Console
```javascript
// Abre DevTools (F12) y copia:
await window.electronAPI.printSilent({ 
  isThermal: true, 
  timeoutMs: 15000 
});
// Mira toda la respuesta en console
```

---

## Paso 4: Secuencia de Validación

```
┌─ ¿Papel sale en Windows Notepad?
│  ├─ NO → Problema FÍSICA (cable, puerto COM, driver)
│  └─ SÍ ↓
│
├─ ¿Papel sale en Word/Paint?
│  ├─ NO → Problema DRIVER (reinstalar driver de térmica)
│  └─ SÍ ↓
│
├─ ¿Mensaje "Imprimiendo..." aparece en Rebu?
│  ├─ NO → Verificar DevTools (F12), error?
│  └─ SÍ ↓
│
└─ ¿Llega papel a la térmica pero no sale?
   ├─ Motor mueve → Issue es CONTENIDO HTML o pageSize
   └─ Motor quieto → Issue es WINDOWS/DRIVER
```

---

## Archivos Modificados

1. **electron-main.cjs** (línea ~148-200)
   - Agregado: `isThermal` → `pageSize` mapping
   - Agregado: Debug info en respuesta

2. **App.jsx** (línea ~8328-8360)
   - Cambio: `printSilent({ isThermal: true })`
   - Cambio: Espera de 200ms (antes 120ms)

3. **preload.cjs** (SIN CAMBIOS)
   - Ya expone `printSilent(options)` correctamente

---

## Pruebas Recomendadas

### Prueba 1: Conectividad
```bash
npm run electron:dev
# Abrir DevTools (F12)
# En Console:
window.electronAPI.getDeviceInfo().then(console.log);
# Debería mostrar IP y dispositivo
```

### Prueba 2: Detectar Impresoras
```javascript
// En Console de DevTools:
await window.electronAPI.printSilent({ 
  isThermal: false,
  timeoutMs: 3000 
}).then(r => console.log('printers:', r));
```

### Prueba 3: Imprimir Ticket
1. Crear venta
2. Click "Imprimir"
3. Revisar console por respuesta

---

## Resumen del Flujo Actual

```
User Click "Imprimir"
    ↓
handlePrintTicket()
    ├─ exportPdfData = null  (asegura TicketPrintLayout)
    ├─ Espera 200ms  (render)
    └─ printSilent({ isThermal: true })
        ↓
    electron-main.cjs
        ├─ Detecta impresora predeterminada
        ├─ pageSize = 80×297mm ✅ NUEVO
        ├─ Llama mainWindow.webContents.print()
        └─ Espera 15s máx
            ↓
        Windows
            ├─ Recibe: 80mm × 297mm
            ├─ Envía a: Impresora térmica
            └─ Térmica: Maneja contenido monoespaciado
```

---

## Próximos Pasos

1. **Ahora mismo:** Compila con `npm run build` ✅ (ya hecho)
2. **Luego:** Reinicia Electron y testea
3. **Si falla:** Ejecuta Paso 1-4 arriba
4. **Si persiste:** Revisar logs de Windows en Event Viewer:
   ```
   Event Viewer > Windows Logs > System
   Buscar eventos de: "Print Spooler", "USB", fecha/hora del intento
   ```

---

## Referencias

- **Electron Print API:** `webContents.print(options, callback)`
- **pageSize units:** Micrómetros (1mm = 1000 micrómetros)
- **TicketPrintLayout:** 24 caracteres = ~80mm monoespaciado

