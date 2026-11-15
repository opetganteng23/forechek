import ResetPasswordForm from '../../components/auth/ResetPasswordForm'

export const metadata = { title: 'Reset Password | Kesiapan Publikasi' }

export default function ResetPasswordPage({ searchParams }) {
  const token = typeof searchParams?.token === 'string' ? searchParams.token : ''
  return <ResetPasswordForm token={token} />
}
