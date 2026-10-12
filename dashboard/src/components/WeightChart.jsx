import { useMemo } from 'react'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { LineChart } from 'lucide-react'

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend
)

export default function WeightChart({ lecturas }) {
  const { labels, pesos } = useMemo(() => {
    const historico = [...lecturas].reverse()
    return {
      labels: historico.map((r) =>
        new Date(r.created_at).toLocaleTimeString()
      ),
      pesos: historico.map((r) => r.peso_medido_g ?? 0)
    }
  }, [lecturas])

  const data = {
    labels,
    datasets: [
      {
        label: 'Peso registrado (g)',
        data: pesos,
        borderColor: '#de7272',
        backgroundColor: 'rgba(180, 228, 214, 0.45)',
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#ffca88',
        pointBorderColor: '#fff',
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 3
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#2c3e50', font: { weight: '600' } }
      },
      tooltip: {
        backgroundColor: '#2c3e50',
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(44, 62, 80, 0.06)' },
        ticks: { color: '#7f8c8d' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#7f8c8d', maxRotation: 0 }
      }
    }
  }

  return (
    <section className="panel">
      <h2>
        <LineChart size={19} /> Validación de Peso en Vivo (Anti-fraude)
      </h2>
      <div className="chart-wrap">
        <Line data={data} options={options} />
      </div>
    </section>
  )
}
