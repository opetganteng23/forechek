import VerifyEmailClient from '../../../components/auth/VerifyEmailClient'

export const metadata = { title: 'Verifikasi Email | Forechek' }

export default function VerifyEmailPage({ searchParams }) {
  const token = typeof searchParams?.token === 'string' ? searchParams.token : ''
  return <VerifyEmailClient token={token} />
}
