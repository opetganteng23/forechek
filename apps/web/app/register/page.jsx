import RegisterForm from '../../components/auth/RegisterForm'

export const metadata = { title: 'Daftar | Forechek' }

export default function RegisterPage() {
  return <RegisterForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
}
