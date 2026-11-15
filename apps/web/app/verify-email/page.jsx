import VerifyEmailClient from '../../components/auth/VerifyEmailClient'

export const metadata = { title: 'Verifikasi Email | Kesiapan Publikasi' }

export default function VerifyEmailPage({ searchParams }) {
  const token = typeof searchParams?.token === 'string' ? searchParams.token : ''
  return <VerifyEmailClient token={token} />
}
