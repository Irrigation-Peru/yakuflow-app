import type { Presupuesto } from '@riego/calculo'
import { cifra, conDecimales } from '../formato.ts'
import { Desplazable } from './Desplazable.tsx'

// El presupuesto referencial (HU0027): cantidades por material con los precios del catálogo vigente. Si el catálogo es
// provisional, se dice: es una estimación, no una cotización.

/** El aviso de precios provisionales, para la pantalla que pliega la tabla y lo tiene que dejar a la vista. */
export function AvisoDePreciosProvisionales({ presupuesto }: { presupuesto: Presupuesto }) {
  if (!presupuesto.provisional) return null
  return <p className="precios-provisionales">Con precios provisionales ({presupuesto.versionDelCatalogo}): son una estimación, no una cotización.</p>
}

export function TablaDePresupuesto({ presupuesto, conAviso = true }: { presupuesto: Presupuesto; conAviso?: boolean }) {
  const { partidas, total, moneda, sinPrecio } = presupuesto
  return (
    <div className="presupuesto">
      <Desplazable nombre="Presupuesto por material" alto>
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col">Cantidad</th>
              <th scope="col">P. unitario · {moneda}</th>
              <th scope="col">Subtotal · {moneda}</th>
            </tr>
          </thead>
          <tbody>
            {partidas.map((p) => (
              <tr key={`${p.tipo}-${p.descripcion}`}>
                <th scope="row">{p.descripcion}</th>
                <td className="cifra">
                  {cifra(p.cantidad, p.unidad === 'm' ? 1 : 0)} {p.unidad}
                </td>
                <td className="cifra">{conDecimales(p.precioUnitario, 2)}</td>
                <td className="cifra">{conDecimales(p.subtotal, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Total referencial
              </th>
              <td className="cifra">
                <strong>{conDecimales(total, 2)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </Desplazable>
      {conAviso && <AvisoDePreciosProvisionales presupuesto={presupuesto} />}
      {sinPrecio.length > 0 && <p className="aviso">Sin precio en el catálogo, y fuera del total: {sinPrecio.join(', ')}.</p>}
    </div>
  )
}
