import LoginForm from '../../../components/auth/LoginForm'

export const metadata = { title: 'Masuk | Forechek' }

export default function LoginPage({ searchParams }) {
  const callbackUrl = typeof searchParams?.callbackUrl === 'string' ? searchParams.callbackUrl : undefined
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined
  const sessionExpired = searchParams?.reason === 'session'
  const passwordChanged = searchParams?.reason === 'password'
  return <LoginForm callbackUrl={callbackUrl} initialError={error} sessionExpired={sessionExpired} passwordChanged={passwordChanged} googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
}
