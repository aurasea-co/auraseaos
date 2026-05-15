import type { Metadata, Viewport } from 'next'
import { Inter, Sarabun, Plus_Jakarta_Sans } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '500'],
  variable: '--font-primary',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-fallback',
  display: 'swap',
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-heading',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AuraSeaOS',
  description: 'Operational Intelligence for SME Hospitality & F&B',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="%235DCAA5" stroke-width="3"/><polygon points="50,10 45,45 55,45" fill="%231D9E75"/><circle cx="50" cy="50" r="6" fill="%23042C53"/><circle cx="50" cy="50" r="3" fill="%235DCAA5"/></svg>',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={`${sarabun.variable} ${inter.variable} ${plusJakarta.variable}`}>
      <body suppressHydrationWarning>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
