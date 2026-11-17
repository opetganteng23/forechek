import AppShell from '../../components/layout/AppShell'

// Layout aplikasi (sidebar + topbar). Akses ke /dashboard dijaga middleware; sesi dicabut server ditangani apiFetch (401 -> masuk ulang).
export default function DashboardLayout({ children }) {
  return <AppShell>{children}</AppShell>
}
