'use client'

import { SessionProvider } from 'next-auth/react'
import ConfirmProvider from './ConfirmProvider'

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </SessionProvider>
  )
}
