# Escenarios precargados

Cada archivo `.json` de esta carpeta es el relieve de una zona, extraído antes del DEM del IGN, para que el
día del experimento la aplicación no dependa de ningún servicio externo. La API los carga al arrancar; donde
un escenario cubre todos los puntos de un cálculo, sus cotas mandan, y fuera de ellos se usa el SRTM de 30 m
por OpenTopoData, declarado en pantalla como respaldo.

Formato (lo valida `src/servicios/elevacion.ts`):

```json
{
  "nombre": "Nombre de la zona",
  "fuente": { "nombre": "IGN, hoja …, año …", "resolucionM": 30, "respaldo": false },
  "latSur": -10.70,
  "lonOeste": -76.30,
  "pasoGrados": 0.0003,
  "filas": 200,
  "columnas": 200,
  "cotas": [ "… filas × columnas cotas, de sur a norte y de oeste a este …" ]
}
```

Pendiente: confirmar la cobertura del IGN sobre Pasco y su formato (raster o curvas de nivel), y escribir el
script que lo convierte a este formato.
