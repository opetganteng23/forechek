// Latar bertema kertas: beberapa lembar tipis melayang pelan (CSS murni, hanya transform). aria-hidden, tidak menerima klik.
// Jumlah dibatasi; `dense` sedikit lebih banyak untuk landing. Dihormati prefers-reduced-motion di globals.css (statis).
const SHEETS = [
  { x: '4%', y: '8%', w: 150, r0: -8, r1: 2, dx: 30, dy: -26, d: 44, delay: 0, o: 0.9 },
  { x: '84%', y: '6%', w: 130, r0: 10, r1: 3, dx: -26, dy: 30, d: 52, delay: -12, o: 0.85 },
  { x: '10%', y: '58%', w: 120, r0: 6, r1: -4, dx: 22, dy: -34, d: 48, delay: -20, o: 0.8 },
  { x: '88%', y: '52%', w: 160, r0: -12, r1: -2, dx: -30, dy: -22, d: 56, delay: -6, o: 0.85 },
  { x: '46%', y: '78%', w: 110, r0: 4, r1: 12, dx: 26, dy: -20, d: 50, delay: -30, o: 0.7 },
  { x: '30%', y: '2%', w: 100, r0: -4, r1: 6, dx: -20, dy: 24, d: 60, delay: -16, o: 0.7 }
]

export default function PaperBackdrop({ count = 6 }) {
  return (
    <div className="paper-field" aria-hidden="true">
      {SHEETS.slice(0, count).map((s, i) => (
        <span
          key={i}
          className="paper-sheet"
          style={{ '--x': s.x, '--y': s.y, '--w': `${s.w}px`, '--r0': `${s.r0}deg`, '--r1': `${s.r1}deg`, '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, '--d': `${s.d}s`, '--delay': `${s.delay}s`, '--o': s.o }}
        />
      ))}
    </div>
  )
}
