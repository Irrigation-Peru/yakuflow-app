// Pone el tema antes de que se pinte la página, para que no parpadee en claro al abrirla en oscuro. Manda lo que el
// estudiante eligió con el botón del encabezado (riego.tema); si no eligió, el tema de su sistema. El resto lo
// maneja src/tema.ts.
;(function () {
  var elegido = null
  try {
    elegido = localStorage.getItem('riego.tema')
  } catch {
    // Sin almacenamiento local se sigue el sistema.
  }
  var oscuro = elegido ? elegido === 'oscuro' : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.tema = oscuro ? 'oscuro' : 'claro'
})()
