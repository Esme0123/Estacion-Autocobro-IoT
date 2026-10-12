import { Database } from 'lucide-react'

function badgeClass(estado) {
  if (estado === 'CORRECTO') return 'badge'
  if (estado?.startsWith('ERROR')) return 'badge error'
  return 'badge wait'
}

export default function ReadingsTable({ lecturas, cargando }) {
  return (
    <section className="panel">
      <h2>
        <Database size={19} /> Registro Histórico de Lecturas IoT
      </h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha / Hora</th>
              <th>Código Producto</th>
              <th>Peso (g)</th>
              <th>Distancia (cm)</th>
              <th>Estación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="empty-row">
                  Cargando lecturas desde Supabase...
                </td>
              </tr>
            )}
            {!cargando && lecturas.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  Aún no hay lecturas registradas por el nodo ESP32.
                </td>
              </tr>
            )}
            {!cargando &&
              lecturas.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>
                    <strong>{r.codigo_escaneado || 'N/A'}</strong>
                  </td>
                  <td>{r.peso_medido_g ?? '-'} g</td>
                  <td>{r.distancia_cm ?? '-'} cm</td>
                  <td className="muted">
                    {r.estaciones_autocobro?.codigo_estacion || '—'}
                  </td>
                  <td>
                    <span className={badgeClass(r.estado_validacion)}>
                      {r.estado_validacion}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
