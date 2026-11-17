// Nama produk berwarna sesuai logo AILO: "Fore" teal, "chek" oranye (warna diambil dari berkas logo).
export default function Brand({ className = 'text-xl' }) {
  return (
    <span className={`font-semibold leading-none tracking-tight ${className}`}>
      <span className="text-logo-teal">Fore</span>
      <span className="text-logo-orange">chek</span>
    </span>
  )
}
