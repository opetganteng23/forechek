// Latar bertema kertas: lembar tipis melayang pelan dan teksnya "diketik" baris demi baris (CSS murni, hanya transform/opacity).
// aria-hidden, tidak menerima klik. Jumlah dibatasi; gerak dimatikan oleh prefers-reduced-motion (lihat globals.css).
const SHEETS = [
  { x: '3%', y: '6%', w: 170, r0: -8, r1: 3, dx: 70, dy: -50, d: 34, delay: 0, o: 0.95, td: 18, tdelay: 0 },
  { x: '82%', y: '4%', w: 150, r0: 9, r1: 2, dx: -60, dy: 60, d: 40, delay: -12, o: 0.9, td: 20, tdelay: -6 },
  { x: '8%', y: '56%', w: 140, r0: 6, r1: -5, dx: 55, dy: -70, d: 38, delay: -20, o: 0.9, td: 17, tdelay: -11 },
  { x: '86%', y: '50%', w: 180, r0: -11, r1: -2, dx: -70, dy: -45, d: 44, delay: -6, o: 0.9, td: 22, tdelay: -3 },
  { x: '46%', y: '76%', w: 130, r0: 4, r1: 12, dx: 60, dy: -40, d: 36, delay: -30, o: 0.8, td: 19, tdelay: -14 },
  { x: '28%', y: '0%', w: 120, r0: -4, r1: 7, dx: -50, dy: 50, d: 42, delay: -16, o: 0.8, td: 21, tdelay: -9 }
]
const WIDTHS = [0.92, 0.96, 0.7, 0.9, 0.84, 0.5]

export default function PaperBackdrop({ count = 6 }) {
  return (
    <div className="paper-field" aria-hidden="true">
      {SHEETS.slice(0, count).map((s, i) => (
        <span
          key={i}
          className="paper-sheet"
          style={{ '--x': s.x, '--y': s.y, '--w': `${s.w}px`, '--r0': `${s.r0}deg`, '--r1': `${s.r1}deg`, '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--d': `${s.d}s`, '--delay': `${s.delay}s`, '--o': s.o, '--td': `${s.td}s`, '--tdelay': `${s.tdelay}s` }}
        >
          <i className="paper-title" />
          {WIDTHS.map((p, n) => (
            <i key={`l${n}`} className="paper-line" style={{ '--i': n, '--p': p, '--tn': `fc-type-${n}` }} />
          ))}
          {WIDTHS.map((p, n) => (
            <i key={`c${n}`} className="paper-caret" style={{ '--i': n, '--p': p, '--cn': `fc-caret-${n}` }} />
          ))}
        </span>
      ))}
    </div>
  )
}
