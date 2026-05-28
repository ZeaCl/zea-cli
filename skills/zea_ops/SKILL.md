---
name: zea_ops
description: Administra operaciones del ecosistema ZEA localmente y en el VPS usando la CLI 'zea'. Activar cuando se necesite ver el estado de los contenedores (docker ps), iniciar/apagar servicios, correr migraciones Ecto, sincronizar código, o desplegar cambios al VPS de producción.
---

# ZEA Operations Skill (`zea_ops`)

Esta skill proporciona las guías y los comandos estandarizados para operar y desplegar el ecosistema de microservicios ZEA. 

## Herramienta CLI Principal
Toda la gestión operativa local y remota se realiza a través de la herramienta CLI unificada ubicada en:
[zea](file:///Users/dev/Documents/zea/platform/scripts/zea)

---

## 1. Operaciones en Entorno Local

### Levantar / Detener Stack Local
* **Levantar todo el stack en segundo plano:**
  ```bash
  /Users/dev/Documents/zea/platform/scripts/zea local start
  ```
* **Detener todo el stack local:**
  ```bash
  /Users/dev/Documents/zea/platform/scripts/zea local stop
  ```

### Verificación del Estado Local
* **Ver contenedores activos y puertos:**
  ```bash
  /Users/dev/Documents/zea/platform/scripts/zea local status
  ```
* **Ver logs de un servicio (ej: glia, thalamus, zea-platform, cerebelum):**
  ```bash
  /Users/dev/Documents/zea/platform/scripts/zea local logs <nombre-servicio>
  ```
* **Reiniciar un servicio específico (ej: glia):**
  ```bash
  /Users/dev/Documents/zea/platform/scripts/zea local restart glia
  ```

### Ejecutar Migraciones Locales
Si realizas cambios en el esquema de base de datos de algún servicio, debes correr las migraciones en local usando:
```bash
/Users/dev/Documents/zea/platform/scripts/zea local migrate
```

---

## 2. Operaciones en VPS (Producción)

### Sincronización de Código
Para enviar los cambios locales al directorio `/opt/zea/` del VPS (`45.55.191.97`), usa:
```bash
/Users/dev/Documents/zea/platform/scripts/zea vps sync
```

### Despliegue en Producción
Para realizar un despliegue completo (sincronizar archivos, compilar imágenes y reiniciar contenedores en caliente en el VPS, excluyendo el servicio Cortex para preservar memoria), usa:
```bash
/Users/dev/Documents/zea/platform/scripts/zea vps deploy
```

### Verificación del Despliegue en el VPS
* **Ver contenedores corriendo en el VPS:**
  ```bash
  /Users/dev/Documents/zea/platform/scripts/zea vps status
  ```
* **Ver logs de un contenedor remoto (ej: zea_glia, zea_platform):**
  ```bash
  /Users/dev/Documents/zea/platform/scripts/zea vps logs <nombre-servicio>
  ```
* **Reiniciar un contenedor remoto:**
  ```bash
  /Users/dev/Documents/zea/platform/scripts/zea vps restart <nombre-servicio>
  ```

### Ejecutar Migraciones en Producción
Tras cualquier despliegue que modifique la base de datos, ejecuta las migraciones de forma secuencial y remota utilizando:
```bash
/Users/dev/Documents/zea/platform/scripts/zea vps migrate
```

---

## Reglas Críticas de Operación
1. **Minimizar Prompting SSH:** Utiliza la CLI unificada `zea` en lugar de conectarte manualmente con múltiples llamadas individuales de `ssh` para evitar generar alertas del sandbox y confirmaciones repetitivas del usuario.
2. **Exclusión de Cortex:** Asegúrate de que `cortex` no sea levantado en el VPS de producción de 4GB para evitar cuellos de botella de memoria (OOM). La CLI `zea vps deploy` ya lo excluye por defecto.
3. **Verificación de SSL:** Tras un despliegue, verifica que Caddy esté ruteando correctamente las conexiones seguras en los subdominios de producción:
   - `https://zea.cl`
   - `https://auth.zea.cl`
   - `https://cerebelum.zea.cl/health`
   - `https://glia.zea.cl`
