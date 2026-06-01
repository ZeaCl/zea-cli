---
name: orchestrate
description: "Orquestador autónomo: planificar cambios, analizar requests, generar planes paso a paso con Lego pieces. Usar antes de cualquier modificación."
---

# Orchestrate — Autonomous Planner

## Fases del orquestador

### 1. PLAN
- Ejecutar `sdui manifest` para ver estado actual
- Analizar qué Legos se necesitan (Design, Venture, Experiment, etc.)
- Generar plan con pasos, comandos y nivel de confianza

### 2. EXPERIMENT
- Crear experiment: `zea experiment create --app <app_id> --name <name>`
- Todos los cambios van al experiment, NUNCA a producción

### 3. BUILD
- Ejecutar pasos del plan (design import, venture create, etc.)
- Cada cambio en el experiment

### 4. VERIFY
- Verificar con `sdui manifest` o `design status`
- Si hay errores, corregir en el experiment

### 5. PRESENTAR
- Mostrar preview URL: `/app?app_id=<app_id>__exp_<name>`
- NUNCA mergear sin aprobación humana explícita
- Esperar: "aprobado", "mergeá", "dale" → merge
- Esperar: "no", "descartá", "cancelá" → discard

## Comandos
```bash
# Planificar
zea agent plan --app <app_id> --request "<descripción>"

# Ejecutar plan (crea experiment + ejecuta pasos)
zea agent execute --app <app_id> --name <experiment> --auto

# Escanear app para detectar mejoras
zea agent scan --app <app_id>

# Mejorar automáticamente
zea agent improve --app <app_id> --auto
```

## 🧱 Lego Pieces
| Necesidad | Lego | Comando |
|-----------|------|---------|
| Importar screen | Design | `zea design import-screen` |
| Cambiar colores | Design | `zea design update-design` |
| Fondos/investors | Venture | `zea venture fund list/create` |
| Manifiesto/estados | SDUI | `zea sdui manifest` |
| Seguridad | Experiment | `zea experiment create/merge/discard` |
| Diagnóstico | Doctor | `zea doctor run` |
