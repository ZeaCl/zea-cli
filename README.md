# ZEA Platform CLI (@zea-cl/cli)

La herramienta de línea de comandos central (Enrutador) para la plataforma ZEA.

Esta CLI actúa como el punto de entrada unificado para administrar todos los recursos de infraestructura de ZEA Platform. Proporciona comandos nativos para autenticación y gestión de identidad (Thalamus), y utiliza **Descubrimiento Dinámico** para inyectar automáticamente comandos de otros servicios (Cerebelum, Cortex, etc.) instalados en tu sistema.

## Instalación

```bash
npm install -g @zea-cl/cli
```

## Arquitectura Modular (Router Central)

A diferencia de un monolito, la CLI de ZEA funciona bajo un patrón de delegación. El binario `zea` lee los plugins instalados en tu `$PATH` (ej. `zea-workflow`, `zea-cortex`) y los agrupa en una única interfaz unificada.

## Comandos Core (Integrados)

Los siguientes comandos interactúan directamente con **ZEA Thalamus** (Auth & Identity) y vienen incluidos de fábrica:

### 1. Autenticación
Loguéate interactivamente usando OAuth2 PKCE:
```bash
zea auth login
```
*También puedes autenticarte guardando un Personal Access Token (PAT) manualmente:*
```bash
zea auth set-token <token_value>
```

### 2. Organizaciones
Lista las organizaciones a las que perteneces:
```bash
zea org list
```

Cambia el contexto de tu organización activa:
```bash
zea org switch <org_slug_or_id>
```

### 3. Personal Access Tokens (PATs)
Genera un nuevo token:
```bash
zea token create --name "Cortex Local CLI"
```

Revoca un token activo:
```bash
zea token revoke <token_id>
```

---
*Powered by [Zea Platform](https://zea.cl)*
