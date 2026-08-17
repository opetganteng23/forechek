import { NextResponse } from 'next/server'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'IDR',
    analysisQuota: 2,
    features: ['2 analisis per bulan', 'Skor & feedback per bagian', 'Rekomendasi jurnal dasar']
  },
  {
    id: 'pro_monthly',
    name: 'Pro (Bulanan)',
    price: 99000,
    currency: 'IDR',
    analysisQuota: null,
    features: ['Analisis tanpa batas', 'Export laporan PDF', 'Kalkulator KUM', 'Riwayat lengkap']
  },
  {
    id: 'pro_yearly',
    name: 'Pro (Tahunan)',
    price: 990000,
    currency: 'IDR',
    analysisQuota: null,
    features: ['Semua fitur Pro Bulanan', 'Hemat 2 bulan']
  },
  {
    id: 'institutional',
    name: 'Institutional',
    price: null,
    currency: 'IDR',
    analysisQuota: null,
    features: ['Multi-user', 'Dashboard admin', 'Dukungan prioritas']
  }
]

export async function GET() {
  return NextResponse.json(PLANS)
}
