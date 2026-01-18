import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/lib/auth-context';
import { initErrorTracking } from '@/lib/error-tracking';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// Initialize error tracking
if (typeof window !== 'undefined') {
  initErrorTracking();
}


const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://saharycloud.com'),
  title: {
    default: 'Sahary Cloud - Solar-Powered Cloud Solutions in Libya',
    template: '%s | Sahary Cloud'
  },
  description: 'Experience the future of sustainable cloud computing with Sahary Cloud. Our solar-powered VPS solutions in Libya offer reliable, eco-friendly, and cost-effective hosting.',
  keywords: [
    'cloud hosting',
    'solar powered',
    'VPS Libya',
    'sustainable hosting',
    'eco-friendly cloud',
    'renewable energy hosting',
    'Libya cloud services',
    'green hosting'
  ],
  authors: [{ name: 'Sahary Cloud' }],
  creator: 'Sahary Cloud',
  publisher: 'Sahary Cloud',

  // Open Graph
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'Sahary Cloud - Solar-Powered Cloud Solutions in Libya',
    description: 'Experience the future of sustainable cloud computing with Sahary Cloud. Our solar-powered VPS solutions in Libya offer reliable, eco-friendly, and cost-effective hosting.',
    siteName: 'Sahary Cloud',
    images: [
      {
        url: '/assets/og-image.jpg', // Create this image
        width: 1200,
        height: 630,
        alt: 'Sahary Cloud - Solar-Powered Hosting'
      }
    ]
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'Sahary Cloud - Solar-Powered Cloud Solutions',
    description: 'Sustainable, solar-powered VPS hosting in Libya. Eco-friendly and cost-effective.',
    images: ['/assets/og-image.jpg'],
    creator: '@saharycloud' // Update with actual Twitter handle
  },

  // Verification (add your actual verification codes)
  // verification: {
  //   google: 'your-google-verification-code',
  //   yandex: 'your-yandex-verification-code',
  // },

  // Theme and appearance
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' }
  ],
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
  },

  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Sahary Cloud',
              description: 'Solar-powered cloud hosting solutions in Libya',
              url: process.env.NEXT_PUBLIC_APP_URL || 'https://saharycloud.com',
              logo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://saharycloud.com'}/assets/logo.png`,
              sameAs: [
                // Add your social media URLs
                // 'https://twitter.com/saharycloud',
                // 'https://linkedin.com/company/saharycloud',
              ],
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'Customer Support',
                email: 'support@saharycloud.com' // Update with actual email
              }
            })
          }}
        />
      </head>
      <body className={inter.className}>

        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <div className="flex flex-col min-h-screen">
              <Header />
              <main className="flex-grow">
                {children}
              </main>
              <Footer />
            </div>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}