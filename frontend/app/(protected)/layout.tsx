import Sidebar from './components/Sidebar'
import { AuthProvider } from './providers/AuthProvider'
import AdminContextGate from './components/AdminContextGate'

export const dynamic = 'force-dynamic'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50 overflow-x-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="min-w-0 pl-0 sm:pl-52 md:pl-60 lg:pl-64">
          <div className="min-h-screen overflow-y-auto px-4 py-6 sm:px-6 md:px-8">
            <AdminContextGate>{children}</AdminContextGate>
          </div>
        </div>
      </div>
    </AuthProvider>
  )
}
