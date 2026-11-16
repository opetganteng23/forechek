// Penghapusan proyek harus menghapus SEMUA data terkait (MTS 14, D0-10). Daftar koleksi dipelihara di satu tempat
// (packages/db/cascade.js) agar hapus proyek, hapus akun, dan pekerja retensi tidak berbeda perilaku.
export { deleteProjectData } from '@publication-prepare/db'
