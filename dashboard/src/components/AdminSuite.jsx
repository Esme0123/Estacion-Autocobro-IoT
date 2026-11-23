import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getPurchasesFromDB, getSensorReadingsFromDB, supabase } from '../supabaseClient'
import AdminLayout from './AdminLayout'
import AdminResumen from './admin/AdminResumen'
import ProductosPage from './admin/ProductosPage'
import VentasPage from './admin/VentasPage'
import IoTResumen from './admin/IoTResumen'
import SensorReadingsPage from './admin/SensorReadingsPage'

export default function AdminSuite({
  products,
  onProductsChanged,
  session,
  role,
  onLogout,
  onToggleSimulator,
  isSimulatorOpen,
  realtimeOk
}) {
  const [purchases, setPurchases] = useState([])
  const [loadingPurchases, setLoadingPurchases] = useState(false)
  const [readings, setReadings] = useState([])
  const [loadingReadings, setLoadingReadings] = useState(false)

  const loadPurchases = useCallback(async () => {
    setLoadingPurchases(true)
    const data = await getPurchasesFromDB()
    setPurchases(data || [])
    setLoadingPurchases(false)
  }, [])

  const loadTelemetry = useCallback(async () => {
    setLoadingReadings(true)
    const data = await getSensorReadingsFromDB(30)
    setReadings(data || [])
    setLoadingReadings(false)
  }, [])

  useEffect(() => {
    loadPurchases()
    loadTelemetry()

    const channelPurchases = supabase
      .channel('admin-purchases-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchases' }, () => {
        loadPurchases()
      })
      .subscribe()

    const channelSensors = supabase
      .channel('admin-sensor-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_readings' }, (payload) => {
        setReadings(prev => [payload.new, ...prev].slice(0, 30))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channelPurchases)
      supabase.removeChannel(channelSensors)
    }
  }, [loadPurchases, loadTelemetry])

  const layoutProps = {
    session,
    role,
    onLogout,
    onToggleSimulator,
    isSimulatorOpen,
    realtimeOk
  }

  return (
    <AdminLayout {...layoutProps}>
      <Routes>
        <Route
          index
          element={
            <AdminResumen
              products={products}
              purchases={purchases}
              readings={readings}
            />
          }
        />
        <Route
          path="productos"
          element={
            <ProductosPage
              products={products}
              onProductsChanged={onProductsChanged}
              purchases={purchases}
            />
          }
        />
        <Route
          path="ventas"
          element={
            <VentasPage
              purchases={purchases}
              onRefresh={loadPurchases}
              loadingPurchases={loadingPurchases}
            />
          }
        />
        <Route
          path="iot"
          element={
            <IoTResumen
              readings={readings}
              purchases={purchases}
              onRefresh={loadTelemetry}
              loadingReadings={loadingReadings}
            />
          }
        />
        <Route
          path="lecturas"
          element={
            <SensorReadingsPage
              readings={readings}
              onRefresh={loadTelemetry}
              loadingReadings={loadingReadings}
            />
          }
        />
        <Route path="iot/lecturas" element={<Navigate to="/admin/lecturas" replace />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AdminLayout>
   )
}
