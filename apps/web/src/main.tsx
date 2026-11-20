import 'leaflet/dist/leaflet.css'
import './estilos.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { ErrorDeApi } from './api/cliente.ts'
import { App } from './App.tsx'
import { crearAlmacen } from './estado/almacen.ts'

const consultas = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 4xx no se arregla reintentando: sin sesión, sin permiso o dato inválido.
      retry: (intentos, error) => !(error instanceof ErrorDeApi && error.estado >= 400 && error.estado < 500) && intentos < 2,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <Provider store={crearAlmacen()}>
      <QueryClientProvider client={consultas}>
        <App />
      </QueryClientProvider>
    </Provider>
  </StrictMode>,
)
