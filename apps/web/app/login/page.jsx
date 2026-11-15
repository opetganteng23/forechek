import LoginForm from '../../components/auth/LoginForm'

export const metadata = { title: 'Masuk | Kesiapan Publikasi' }

export default function LoginPage({ searchParams }) {
  const callbackUrl = typeof searchParams?.callbackUrl === 'string' ? searchParams.callbackUrl : undefined
  const error = typeof searchParams?.error === 'string' ? searchParams.error : undefined
  return <LoginForm callbackUrl={callbackUrl} initialError={error} />
}
