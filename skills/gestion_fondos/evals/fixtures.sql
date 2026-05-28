-- Fixtures para la skill gestion_fondos
-- Datos de ejemplo para testing de evals

-- Fondos
INSERT INTO fondos (id, nombre, tipo) VALUES
  (1, 'Horizonte', 'mixto'),
  (2, 'Atlántico', 'renta_fija'),
  (3, 'Pacífico', 'renta_variable');

-- Rendimientos octubre 2024
INSERT INTO rendimientos (fondo_id, periodo, rendimiento_neto, benchmark) VALUES
  (1, '2024-10', 3.2, 2.8),
  (2, '2024-10', 1.5, 1.4),
  (3, '2024-10', 5.1, 4.8);

-- Composición de carteras (porcentaje)
INSERT INTO composicion (fondo_id, tipo_activo, porcentaje) VALUES
  (1, 'renta_variable', 45),
  (1, 'renta_fija', 40),
  (1, 'liquidez', 15),
  (2, 'renta_variable', 10),
  (2, 'renta_fija', 80),
  (2, 'liquidez', 10),
  (3, 'renta_variable', 85),
  (3, 'renta_fija', 10),
  (3, 'liquidez', 5);

-- Flujos del mes
INSERT INTO flujos (fondo_id, periodo, suscripciones, reembolsos) VALUES
  (1, '2024-10', 1500000, 800000),
  (2, '2024-10', 500000, 300000),
  (3, '2024-10', 2000000, 1200000);
