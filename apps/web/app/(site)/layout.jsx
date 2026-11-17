import Navbar from '../../components/layout/Navbar'
import Footer from '../../components/layout/Footer'

// Halaman publik (landing, masuk/daftar, legal): navbar situs + footer. Dashboard memakai layout aplikasi sendiri.
export default function SiteLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}
