// Penomoran halaman seragam untuk tabel (teks polos, tanpa ikon panah).
export default function Pager({ page, limit, total, onPage, busy = false }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit))
  const from = total ? (page - 1) * limit + 1 : 0
  const to = Math.min(total || 0, page * limit)
  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 text-sm text-ink-soft sm:flex-row" data-testid="pager">
      <span>{total ? `Menampilkan ${from} sampai ${to} dari ${total}` : 'Tidak ada data'}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={page <= 1 || busy} onClick={() => onPage(page - 1)}>Sebelumnya</button>
        <span>Halaman {page} dari {pages}</span>
        <button type="button" className="btn-secondary btn-sm" disabled={page >= pages || busy} onClick={() => onPage(page + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}
