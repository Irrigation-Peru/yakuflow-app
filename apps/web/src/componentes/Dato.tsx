/**
 * Una fila de «nombre … valor», con la cifra en letra monoespaciada como en los wireframes. La ayuda, si la hay, dice
 * en pocas palabras qué es el dato: «lo que dura cada riego».
 */
export function Dato({ nombre, valor, ayuda }: { nombre: string; valor: string | null | undefined | false; ayuda?: string }) {
  return (
    <div className="dato">
      <dt>
        {nombre}
        {ayuda && <span className="ayuda">{ayuda}</span>}
      </dt>
      <dd>{valor || '—'}</dd>
    </div>
  )
}
